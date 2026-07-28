export function getExponentialBackoffMs(
  attempt: number,
  baseMs = 2000,
  maxMs = 60000
): number {
  if (attempt <= 0) return 0;
  const factor = Math.pow(2, attempt - 1);
  const calculated = baseMs * factor;
  return Math.min(calculated, maxMs);
}

export function applyJitter(delayMs: number, ratio = 0.2): number {
  if (delayMs <= 0) return 0;
  const min = delayMs * (1 - ratio);
  const max = delayMs * (1 + ratio);
  return Math.round(min + Math.random() * (max - min));
}
