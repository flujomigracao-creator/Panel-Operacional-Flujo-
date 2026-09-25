// Panel flotante en la página de Inscrição CPF Estrangeiro de la Receita.
// Formulario: elegir el caso y llenar todos los campos (el captcha y "Enviar" los hace el operador).
// Comprovante: guardarlo como PDF en el caso, con el número de CPF generado.

(() => {
  const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  const $ = (id) => document.getElementById(id);
  const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

  // Gentilicio (como lo escribe el cliente) -> país del listado de la Receita.
  const PAISES = {
    VENEZOLAN: 'VENEZUELA', VENEZUELAN: 'VENEZUELA', CUBAN: 'CUBA', COLOMBIAN: 'COLOMBIA', HAITIAN: 'HAITI',
    BOLIVIAN: 'BOLIVIA', PERUAN: 'PERU', ARGENTIN: 'ARGENTINA', PARAGUA: 'PARAGUAI', URUGUA: 'URUGUAI',
    CHILEN: 'CHILE', ECUATORIAN: 'EQUADOR', EQUATORIAN: 'EQUADOR', DOMINICAN: 'REPUBLICA DOMINICANA',
    ANGOLAN: 'ANGOLA', SENEGAL: 'SENEGAL', NIGERIAN: 'NIGERIA', GANES: 'GANA', GHAN: 'GANA', AFEG: 'AFEGANISTAO',
    AFGAN: 'AFEGANISTAO', SIRI: 'SIRIA', CHIN: 'CHINA', MEXICAN: 'MEXICO', ESTADOUNIDENSE: 'ESTADOS UNIDOS',
    'NORTE-AMERICAN': 'ESTADOS UNIDOS', NORTEAMERICAN: 'ESTADOS UNIDOS', PORTUGUES: 'PORTUGAL', ESPANHOL: 'ESPANHA', ESPANOL: 'ESPANHA',
    ITALIAN: 'ITALIA', FRANCES: 'FRANCA', ALEM: 'ALEMANHA', RUS: 'RUSSIA', UCRANIAN: 'UCRANIA',
    CONGOLES: 'CONGO, REPUBLICA DEMOCRATICA DO', CAMARON: 'CAMAROES', GUINEAN: 'GUINE', BENGAL: 'BANGLADESH',
    INDIAN: 'INDIA', PAQUISTAN: 'PAQUISTAO', LIBANES: 'LIBANO', MARROQU: 'MARROCOS', EGIPC: 'EGITO',
  };
  const TIPO_DOC = { PASSAPORTE: '3', PASAPORTE: '3', RNM: '1', RNE: '1', PROTOCOLO: '2', IDENTIDADE: '4', IDENTIDAD: '4', CEDULA: '4', DNI: '4' };

  function setValue(el, value) {
    if (!el || value == null || value === '') return false;
    el.focus();
    el.value = value;
    ['input', 'change', 'keyup', 'blur'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
    return true;
  }

  function selectByText(el, texto) {
    if (!el || !texto) return false;
    const alvo = sinAcentos(texto);
    const opt = [...el.options].find((o) => sinAcentos(o.text) === alvo)
      || [...el.options].find((o) => sinAcentos(o.text).startsWith(alvo))
      || [...el.options].find((o) => alvo.length >= 4 && sinAcentos(o.text).includes(alvo));
    return opt ? setValue(el, opt.value) : false;
  }

  function paisDeNacionalidade(nac) {
    const n = sinAcentos(nac);
    const key = Object.keys(PAISES).find((k) => n.startsWith(k));
    return key ? PAISES[key] : n;
  }

  function fecha(v) {
    const s = String(v || '').trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const br = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    return br ? `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}/${br[3]}` : s;
  }

  // "Rua das Flores, 123, apto 2, Centro, CEP 88010-000" -> partes para el formulario.
  function partesEndereco(endereco) {
    const txt = String(endereco || '');
    const cep = (txt.match(/\b(\d{5})-?(\d{3})\b/) || []).slice(1).join('');
    const numero = (txt.match(/(?:,|\bn[º°o.]?)\s*(\d{1,6}[A-Za-z]?)\b/i) || [])[1] || '';
    const rua = txt.split(',')[0].trim();
    const comp = (txt.match(/\b(apto?\.?\s*\d+\w*|apartamento\s*\d+\w*|casa\s*\d+\w*|bloco\s*\w+|fundos)\b/i) || [])[1] || '';
    return { cep, numero, rua, comp };
  }

  function tipoLogradouro(el, logradouro) {
    const primeira = sinAcentos(logradouro).split(/\s+/)[0] || '';
    const abrev = { R: 'RUA', AV: 'AVENIDA', TV: 'TRAVESSA', ROD: 'RODOVIA', AL: 'ALAMEDA', EST: 'ESTRADA', PC: 'PRACA', SERVIDAO: 'OUTROS' };
    const alvo = abrev[primeira.replace('.', '')] || primeira;
    const opt = [...el.options].find((o) => sinAcentos(o.value) === alvo);
    if (opt) {
      setValue(el, opt.value);
      return logradouro.split(/\s+/).slice(1).join(' ');
    }
    setValue(el, 'RUA');
    return logradouro;
  }

  async function llenar(caso) {
    const d = caso.datos || {};
    const hechos = [];
    const falta = [];
    const anota = (ok, nome) => (ok ? hechos : falta).push(nome);

    anota(setValue($('txtNome'), sinAcentos(d.Nome_Completo || caso.cliente).slice(0, 60)), 'Nome');
    anota(setValue($('txtDataNascimento'), fecha(d.Data_Nascimento)), 'Nascimento');
    const tipo = sinAcentos(d.Tipo_Documento || 'PASSAPORTE');
    const tipoVal = Object.keys(TIPO_DOC).find((k) => tipo.includes(k));
    anota(setValue($('slcDocumento'), TIPO_DOC[tipoVal] || '3'), 'Tipo de documento');
    anota(setValue($('txtNumDoc'), String(d.Numero_Documento || '').replace(/\s+/g, '').slice(0, 20)), 'Número do documento');
    anota(selectByText($('slcNacionalidade'), paisDeNacionalidade(d.Nacionalidade)), 'Nacionalidade');
    const sexo = sinAcentos(d.Sexo);
    anota(setValue($('slcSexo'), sexo.startsWith('F') ? '2' : sexo.startsWith('M') ? '1' : ''), 'Sexo');
    anota(setValue($('txtNomeMae'), sinAcentos(d.Nome_Mae).slice(0, 60)), 'Nome da mãe');

    const residente = !/N[AÃ]O|NON|NO[ _-]?RESID/.test(sinAcentos(d.Condicao));
    if (residente) {
      setValue($('slcPaisOrig'), '000');
      const end = partesEndereco(d.Endereco_Brasil);
      const cepInfo = end.cep ? (await send({ type: 'viacep', cep: end.cep }))?.data : null;
      anota(setValue($('txtCep'), end.cep), 'CEP');
      const [cidade, uf] = String(d.Cidade || '').split(/\s*[\/\-–,]\s*/);
      anota(setValue($('txtMunicipio'), sinAcentos(cepInfo?.localidade || cidade).slice(0, 50)), 'Município');
      anota(setValue($('txtUfMunicipio'), sinAcentos(cepInfo?.uf || uf).slice(0, 2)), 'UF');
      const logradouro = cepInfo?.logradouro || end.rua;
      const resto = tipoLogradouro($('slcTipoLogradouro'), logradouro);
      anota(setValue($('txtLogradouro'), sinAcentos(resto).slice(0, 36)), 'Logradouro');
      anota(setValue($('txtNumeroLogradouro'), end.numero.slice(0, 6)), 'Número');
      setValue($('txtComplemento'), sinAcentos(end.comp).slice(0, 21));
      anota(setValue($('txtBairro'), sinAcentos(cepInfo?.bairro || '').slice(0, 19)), 'Bairro');
    } else {
      falta.push('Endereço (no residente: completar a mano)');
    }

    setValue($('txtEmail'), (d.Email || '').slice(0, 60));
    const tel = String(caso.telefone || '').replace(/\D/g, '');
    const local = tel.startsWith('55') && tel.length >= 12 ? tel.slice(2) : '';
    if (local) {
      setValue($('slcDdiCelular'), [...$('slcDdiCelular').options].some((o) => o.value === '055') ? '055' : $('slcDdiCelular').value);
      anota(setValue($('txtDddCelular'), local.slice(0, 2)) && setValue($('txtCelular'), local.slice(2, 14)), 'Celular');
    }
    return { hechos, falta };
  }

  // ---------- Panel ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .p{width:320px;max-height:70vh;overflow:auto;font:13px/1.4 system-ui,sans-serif;background:#0f1420;color:#e8eaf2;border:1px solid #2a3350;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:14px}
      h3{margin:0 0 8px;font-size:14px;color:#fff}
      .muted{color:#8b93a7;font-size:12px}
      button{font:inherit;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;width:100%;margin-top:6px;text-align:left;background:#171d2e;color:#e8eaf2}
      button:hover{background:#232b40}
      .pri{background:#7c3aed;color:#fff;text-align:center;font-weight:600}
      .pri:hover{background:#6d28d9}
      .ok{color:#10b981}.warn{color:#f59e0b}.err{color:#ef4444}
      .x{position:absolute;top:8px;right:10px;background:none;width:auto;padding:2px 6px;margin:0;color:#8b93a7}
    </style>
    <div class="p"><button class="x" id="cerrar">✕</button><div id="c"></div></div>`;
  document.documentElement.appendChild(host);
  const c = root.getElementById('c');
  root.getElementById('cerrar').onclick = () => host.remove();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const enFormulario = !!$('txtNome');

  async function iniciar() {
    const s = await send({ type: 'session' });
    if (!s?.data) {
      c.innerHTML = '<h3>FLUJO · CPF Receita</h3><p class="warn">Inicia sesión: haz clic en el ícono de la extensión FLUJO en la barra de Chrome.</p>';
      return;
    }
    return enFormulario ? modoFormulario() : modoComprovante();
  }

  async function modoFormulario() {
    c.innerHTML = '<h3>FLUJO · Inscripción CPF</h3><p class="muted">Cargando casos listos…</p>';
    const r = await send({ type: 'pendientes' });
    if (!r?.ok) {
      c.innerHTML = `<h3>FLUJO · Inscripción CPF</h3><p class="err">${esc(r?.error)}</p>`;
      return;
    }
    const casos = r.data || [];
    // Abierta por la extensión o desde el panel con #flujo=<caso>: se llena sola.
    const idAuto = (location.hash.match(/flujo=([0-9a-f-]{36})/) || [])[1];
    const auto = idAuto && casos.find((x) => x.client_service_id === idAuto);
    if (auto) return usarCaso(auto);
    if (!casos.length) {
      c.innerHTML = '<h3>FLUJO · Inscripción CPF</h3><p class="ok">No hay casos esperando inscripción.</p>';
      return;
    }
    c.innerHTML = '<h3>FLUJO · Inscripción CPF</h3><p class="muted">Elige el cliente para llenar el formulario:</p>';
    casos.forEach((caso) => {
      const b = document.createElement('button');
      b.innerHTML = `<b>${esc(caso.cliente)}</b><br><span class="muted">${esc(caso.datos?.Nacionalidade || '')} · ${esc(caso.telefone || '')}</span>`;
      b.onclick = () => usarCaso(caso);
      c.appendChild(b);
    });
  }

  async function usarCaso(caso) {
    await chrome.storage.local.set({ casoActivo: caso });
    const { hechos, falta } = await llenar(caso);
    c.innerHTML = `<h3>${esc(caso.cliente)}</h3>
      <p class="ok">✓ Llené: ${esc(hechos.join(', '))}</p>
      ${falta.length ? `<p class="warn">⚠ Revisa a mano: ${esc(falta.join(', '))}</p>` : ''}
      <p><b>Ahora tú:</b> revisa los datos, marca el captcha y presiona <b>Enviar</b>. En la página del comprovante te aparecerá el botón para guardarlo.</p>`;
    const otro = document.createElement('button');
    otro.textContent = '← Elegir otro cliente';
    otro.onclick = modoFormulario;
    c.appendChild(otro);
  }

  async function modoComprovante() {
    const { casoActivo } = await chrome.storage.local.get('casoActivo');
    const texto = document.body.innerText || '';
    const cpf = (texto.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/) || [])[0] || '';
    // Número de protocolo de la inscripción (va en el correo a la Receita).
    const protocolo = (texto.match(/protocolo[^0-9A-Z]{0,40}([0-9A-Z][0-9A-Z.\-/]{5,})/i) || [])[1] || '';
    if (!casoActivo) {
      c.innerHTML = '<h3>FLUJO · Comprovante</h3><p class="muted">No hay un cliente elegido. Vuelve al formulario y elige el caso primero.</p>';
      return;
    }
    c.innerHTML = `<h3>Comprovante · ${esc(casoActivo.cliente)}</h3>
      <p>${cpf ? `CPF detectado: <b>${esc(cpf)}</b>` : '<span class="warn">No veo un número de CPF en esta página.</span>'}</p>
      <p>${protocolo ? `Protocolo: <b>${esc(protocolo)}</b>` : '<span class="warn">No veo el número de protocolo.</span>'}</p>
      ${cpf || protocolo ? '' : '<p class="muted">Si esta página es el comprovante, guárdalo igual.</p>'}`;
    const b = document.createElement('button');
    b.className = 'pri';
    b.textContent = 'Guardar comprovante en el caso';
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = 'Guardando…';
      host.style.display = 'none';
      const r = await send({ type: 'guardarComprovante', caso: casoActivo, cpf, protocolo });
      host.style.display = '';
      if (r?.ok) {
        await chrome.storage.local.remove('casoActivo');
        c.innerHTML = `<h3>Listo ✓</h3><p class="ok">Comprovante guardado en el caso de ${esc(casoActivo.cliente)}.</p><p class="muted">El Tramitador arma el correo a la Receita en los próximos minutos.</p>`;
      } else {
        b.disabled = false;
        b.textContent = 'Reintentar';
        c.insertAdjacentHTML('beforeend', `<p class="err">${esc(r?.error)}</p>`);
      }
    };
    c.appendChild(b);
  }

  iniciar();
})();
