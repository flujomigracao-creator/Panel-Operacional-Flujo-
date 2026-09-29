export const money = (v) => (v === null || v === undefined || v === '' ? null : `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);

export function relTime(iso) {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
}

export const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name || '?').slice(0, 2)).toUpperCase();
};

export const normalize = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// País (o gentilicio, como llega de Kommo/Nora) → bandera. Solo decorativo: si no se reconoce, no se muestra.
const FLAGS = {
  venezuela: '🇻🇪', venezolano: '🇻🇪', venezolana: '🇻🇪',
  cuba: '🇨🇺', cubano: '🇨🇺', cubana: '🇨🇺',
  colombia: '🇨🇴', colombiano: '🇨🇴', colombiana: '🇨🇴',
  argentina: '🇦🇷', argentino: '🇦🇷',
  peru: '🇵🇪', peruano: '🇵🇪', peruana: '🇵🇪',
  bolivia: '🇧🇴', boliviano: '🇧🇴', boliviana: '🇧🇴',
  paraguay: '🇵🇾', paraguayo: '🇵🇾', paraguaya: '🇵🇾',
  uruguay: '🇺🇾', uruguayo: '🇺🇾', uruguaya: '🇺🇾',
  chile: '🇨🇱', chileno: '🇨🇱', chilena: '🇨🇱',
  ecuador: '🇪🇨', ecuatoriano: '🇪🇨', ecuatoriana: '🇪🇨',
  mexico: '🇲🇽', mexicano: '🇲🇽', mexicana: '🇲🇽',
  haiti: '🇭🇹', haitiano: '🇭🇹', haitiana: '🇭🇹',
  'republica dominicana': '🇩🇴', dominicano: '🇩🇴', dominicana: '🇩🇴',
  brasil: '🇧🇷', brasileno: '🇧🇷', brasilena: '🇧🇷', brasileiro: '🇧🇷',
  angola: '🇦🇴', angolano: '🇦🇴', angolana: '🇦🇴',
  espana: '🇪🇸', 'estados unidos': '🇺🇸', portugal: '🇵🇹', china: '🇨🇳',
};
export const flag = (country) => FLAGS[normalize(country).trim()] || '';

export const selectCls = 'h-8 w-full rounded-md border border-border bg-bg-surface px-2 text-[13px] text-text-primary outline-none focus:border-brand-primary disabled:opacity-60';
export const inputCls = 'w-full rounded-md border border-border bg-bg-surface px-2 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-brand-primary';
export const btnCls = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-surface px-2.5 text-[13px] text-text-primary hover:bg-bg-elevated disabled:opacity-50';
export const btnPrimaryCls = 'inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-primary px-3 text-[13px] font-medium text-white hover:bg-brand-primary-dark disabled:opacity-50';
export const chipCls = (active) => `inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs ${active ? 'border-brand-primary bg-brand-primary-light font-medium text-brand-primary' : 'border-border bg-bg-surface text-text-secondary hover:bg-bg-elevated'}`;
