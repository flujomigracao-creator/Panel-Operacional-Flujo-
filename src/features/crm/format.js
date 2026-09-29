export const money = (v) => (v === null || v === undefined || v === '' ? null : `R$ ${Number(v).toFixed(0)}`);

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

export const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name || '?').slice(0, 2)).toUpperCase();
};

export const normalize = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const selectCls = 'w-full rounded-md border border-border bg-bg-surface px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-brand-primary';
export const inputCls = selectCls;
export const btnCls = 'inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary hover:bg-bg-elevated disabled:opacity-50';
export const btnPrimaryCls = 'inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-primary-dark disabled:opacity-50';

