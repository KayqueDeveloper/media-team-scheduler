import { localDateSchema } from '@media-scheduler/contracts';
import { getSundaysInMonth } from '@media-scheduler/scheduling-domain';

export interface UnavailabilityWindow {
  readonly accepted: boolean;
  readonly cutoffDate: string;
}

export function getUnavailabilityCutoff(dateInput: string): string {
  const date = localDateSchema.parse(dateInput);
  const [year, month] = date.split('-').map(Number);
  if (year === undefined || month === undefined) throw new Error('Data de indisponibilidade inválida.');
  if (!getSundaysInMonth(year, month).includes(date)) {
    throw new Error('A indisponibilidade deve usar um domingo.');
  }
  const cutoff = new Date(Date.UTC(year, month - 2, 25));
  return cutoff.toISOString().slice(0, 10);
}

export function evaluateUnavailabilityWindow(date: string, currentDateInput: string): UnavailabilityWindow {
  const currentDate = localDateSchema.parse(currentDateInput);
  const cutoffDate = getUnavailabilityCutoff(date);
  return { accepted: currentDate <= cutoffDate, cutoffDate };
}
