// Modelo canónico y utilidades de estado.
import { STATUS } from '../config.js';

// Dado progreso nuevo y total, decide el estado canónico objetivo.
// Regla simple y previsible para un tracker centrado en "lo que estoy viendo":
//  - si hay total y ya lo alcanzaste -> COMPLETED
//  - si avanzaste algo -> WATCHING
//  - si 0 -> PLANNING
export function computeStatus(progress, total) {
  if (total && progress >= total) return STATUS.COMPLETED;
  if (progress > 0) return STATUS.WATCHING;
  return STATUS.PLANNING;
}

export function maxProgress(a, b) {
  return Math.max(Number(a) || 0, Number(b) || 0);
}
