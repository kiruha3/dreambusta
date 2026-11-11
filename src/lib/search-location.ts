export function searchNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}
