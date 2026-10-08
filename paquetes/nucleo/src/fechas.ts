export const ahora = () => new Date().toISOString();

/** 1234567 ms → "20:34" o "1:02:03" (formato de capítulos de YouTube). */
export function formatoReloj(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${seg}` : `${m}:${seg}`;
}

/** 1234567 ms → "00:20:34,567" (formato SRT). */
export function formatoSrt(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const mil = total % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(mil, 3)}`;
}

export const usd = (n: number) => `$${n.toFixed(n < 1 && n > 0 ? 3 : 2)}`;
