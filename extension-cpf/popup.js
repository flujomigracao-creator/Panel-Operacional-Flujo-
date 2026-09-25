const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
const $ = (id) => document.getElementById(id);

async function pintarLista() {
  const r = await send({ type: 'pendientes' });
  const lista = $('lista');
  if (!r?.ok) {
    lista.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'err';
    p.textContent = r?.error || 'No se pudo leer los casos';
    lista.appendChild(p);
    return;
  }
  lista.innerHTML = '';
  if (!r.data?.length) {
    lista.innerHTML = '<p class="muted">No hay CPFs esperando inscripción.</p>';
    return;
  }
  r.data.forEach((caso) => {
    const b = document.createElement('button');
    b.className = 'sec';
    b.textContent = `Abrir y llenar: ${caso.cliente}`;
    b.onclick = () => send({ type: 'abrirCaso', id: caso.client_service_id }).then(() => window.close());
    lista.appendChild(b);
  });
}

async function pintar() {
  const r = await send({ type: 'session' });
  const email = r?.data?.email;
  $('login').hidden = !!email;
  $('sesion').hidden = !email;
  if (!email) return;
  $('quien').textContent = email;
  const { automatico = true } = await chrome.storage.local.get('automatico');
  $('auto').checked = automatico;
  pintarLista();
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').textContent = '';
  const r = await send({ type: 'login', email: $('email').value.trim(), password: $('password').value });
  if (!r?.ok) $('error').textContent = r?.error || 'No se pudo iniciar sesión';
  $('password').value = '';
  pintar();
});

$('auto').addEventListener('change', (e) => send({ type: 'automatico', valor: e.target.checked }));

$('salir').addEventListener('click', async () => {
  await send({ type: 'logout' });
  pintar();
});

pintar();
