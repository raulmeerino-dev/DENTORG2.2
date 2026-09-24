export function money(value: string | number) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

export function formatDate(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}-${month}-${year.slice(2)}` : value;
}
