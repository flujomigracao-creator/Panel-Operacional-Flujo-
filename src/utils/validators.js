export const validateCPF = (cpf) => {
  if (!cpf) return false;
  const cleanCPF = cpf.replace(/\D/g, '');
  if (cleanCPF.length !== 11) return false;
  // Basic structural validation, could be expanded with full checksum logic
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  return true;
};

export const formatCPF = (cpf) => {
  if (!cpf) return '';
  const cleanCPF = cpf.replace(/\D/g, '');
  if (cleanCPF.length !== 11) return cpf;
  return cleanCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};
