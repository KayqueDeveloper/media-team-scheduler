export const ROLES = [
  { id: 'FREEHAND', name: 'Freehand', shortName: 'FREEHAND' },
  { id: 'VMIX', name: 'vMix', shortName: 'VMIX' },
  { id: 'FIXED_CAM', name: 'Câmera Fixa', shortName: 'FIXA' },
  { id: 'SWITCHER', name: 'Corte', shortName: 'CORTE' },
  { id: 'JIB', name: 'Grua', shortName: 'GRUA' },
  { id: 'COORDINATOR', name: 'Coordenador', shortName: 'COORDENADOR' }
];

export const SHIFTS = [
  { id: 'MORNING', name: 'Manhã', time: '09h00' },
  { id: 'NIGHT', name: 'Noite', time: '18h00' }
];

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function getSundaysForMonth(year, monthIndex) {
  const sundays = [];
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (date.getUTCDay() !== 0) continue;
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getUTCDate()).padStart(2, '0');
    sundays.push({
      date: `${date.getUTCFullYear()}-${month}-${dayOfMonth}`,
      formatted: `${dayOfMonth}/${month}/${date.getUTCFullYear()}`,
      label: `${sundays.length + 1}º Domingo`
    });
  }
  return sundays;
}
