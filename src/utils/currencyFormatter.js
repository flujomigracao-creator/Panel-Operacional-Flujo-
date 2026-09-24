export const formatCurrency = (value) => {
  const n = Number(value) || 0;
  return `R$${Math.round(n).toLocaleString('pt-BR')}`;
};
