// Service worker: sesión de Supabase del operador, llamadas a la base, ViaCEP y
// captura del comprovante como PDF. El content script nunca toca tokens directamente.

const SUPABASE_URL = 'https://rumpfqevyspdmhaggxtq.supabase.co';
// Llave publicable (pública por diseño): todo lo que se lee o escribe pasa por RLS
// con la sesión del operador logueado.
const SUPABASE_KEY = 'sb_publishable_7znj3ENrTWXDE2dibUzv_A_a7HUoud_';

async function getSession() {
  const { session } = await chrome.storage.local.get('session');
  if (!session) return null;
  if (session.expires_at - 60_000 > Date.now()) return session;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    await chrome.storage.local.remove('session');
    return null;
  }
  return saveSession(await res.json());
}

async function saveSession(data) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    email: data.user?.email,
  };
  await chrome.storage.local.set({ session });
  return session;
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'No se pudo iniciar sesión');
  const s = await saveSession(data);
  return { email: s.email };
}

async function authHeaders() {
  const s = await getSession();
  if (!s) throw new Error('SIN_SESION');
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` };
}

async function rpc(name, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
}

async function viaCep(cep) {
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.erro ? null : data;
}

// Imprime la pestaña del comprovante como PDF (igual que "Guardar como PDF").
async function printTabToPdf(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    const { data } = await chrome.debugger.sendCommand(target, 'Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    return data;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function guardarComprovante(tabId, caso, cpf, protocolo) {
  const b64 = await printTabToPdf(tabId);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const fileName = `COMPROVANTE_CPF_${stamp}.pdf`;
  const path = `${caso.organization_id}/cpf/${caso.client_service_id}/${fileName}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: bytes,
  });
  if (!up.ok) throw new Error(`No se pudo subir el PDF (${up.status})`);

  await rpc('registrar_comprovante_cpf', {
    p_client_service_id: caso.client_service_id,
    p_storage_path: path,
    p_file_name: fileName,
    p_mime: 'application/pdf',
    p_cpf: cpf || null,
    p_protocolo: protocolo || null,
  });
  return { fileName };
}

// ---------- Apertura automática ----------
// Cada 2 minutos busca CPFs listos para inscribir. Si hay uno, abre la página de la
// Receita con ese caso (el content script la llena sola). Un caso se vuelve a abrir
// solo si sigue pendiente 3 horas después; nunca hay más de una pestaña a la vez.
const RECEITA_URL = 'https://servicos.receita.fazenda.gov.br/Servicos/CPF/InscricaoCpfEstrangeiro/default.asp';
const REABRIR_MS = 3 * 60 * 60 * 1000;

async function revisarPendientes() {
  if (!(await getSession())) return;
  const { automatico = true } = await chrome.storage.local.get('automatico');
  if (!automatico) return;

  const abiertas = await chrome.tabs.query({ url: 'https://servicos.receita.fazenda.gov.br/Servicos/CPF/*' });
  if (abiertas.length) return;

  let pendientes;
  try {
    pendientes = await rpc('inscricoes_cpf_pendentes');
  } catch {
    return;
  }
  const { abiertos = {} } = await chrome.storage.local.get('abiertos');
  const ahora = Date.now();
  const siguiente = (pendientes || []).find((c) => !abiertos[c.client_service_id] || ahora - abiertos[c.client_service_id] > REABRIR_MS);
  await chrome.action.setBadgeText({ text: pendientes?.length ? String(pendientes.length) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  if (!siguiente) return;

  abiertos[siguiente.client_service_id] = ahora;
  await chrome.storage.local.set({ abiertos, casoAuto: siguiente.client_service_id });
  await chrome.tabs.create({ url: `${RECEITA_URL}#flujo=${siguiente.client_service_id}`, active: true });
}

async function abrirCaso(clientServiceId) {
  const { abiertos = {} } = await chrome.storage.local.get('abiertos');
  abiertos[clientServiceId] = Date.now();
  await chrome.storage.local.set({ abiertos, casoAuto: clientServiceId });
  await chrome.tabs.create({ url: `${RECEITA_URL}#flujo=${clientServiceId}`, active: true });
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('revisar', { periodInMinutes: 2 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('revisar', { periodInMinutes: 2 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'revisar') revisarPendientes(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    switch (msg.type) {
      case 'session': {
        const s = await getSession();
        return s ? { email: s.email } : null;
      }
      case 'login': {
        const r = await login(msg.email, msg.password);
        revisarPendientes();
        return r;
      }
      case 'abrirCaso':
        return abrirCaso(msg.id);
      case 'revisarAhora':
        return revisarPendientes();
      case 'automatico':
        await chrome.storage.local.set({ automatico: msg.valor });
        return msg.valor;
      case 'logout':
        await chrome.storage.local.remove(['session', 'casoActivo']);
        return true;
      case 'pendientes':
        return rpc('inscricoes_cpf_pendentes');
      case 'viacep':
        return viaCep(msg.cep);
      case 'guardarComprovante':
        return guardarComprovante(sender.tab.id, msg.caso, msg.cpf, msg.protocolo);
      default:
        throw new Error('Mensaje desconocido');
    }
  };
  run().then((data) => sendResponse({ ok: true, data }), (err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
