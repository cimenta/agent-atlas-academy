// Temporary helper for checking how long Vercel keeps a streamed response open.
export function parseSeconds(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 5;
  const n = Number(value);
  if (n < 1) return 5;
  return Math.min(n, 295);
}
