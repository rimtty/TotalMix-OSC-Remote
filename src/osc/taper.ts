/**
 * TotalMix FX fader taper: OSC float 0.0–1.0 ↔ dB.
 *
 * Community reverse-engineered approximation validated against TotalMix
 * readback (fgimian/totalmix-volume-control, MIT). Checkpoints:
 * 1.0 → +6 dB, ~0.8172 → 0 dB, ~0.634 → -6 dB, 0.0 → -∞.
 * Authoritative dB display should always come from TotalMix "…Val" feedback;
 * this is used for local computation (dim amounts, optimistic display).
 */

const UPPER_SLOPE = 0.0320855615;
const UPPER_OFFSET = -26.8235294118;
const UPPER_BOUNDARY_POS = 649; // ≈ -6 dB

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function faderToDb(value: number): number {
  const v = clamp(value, 0, 1);
  if (v <= 0) return -Infinity;
  const pos = v * 1023;
  if (pos >= UPPER_BOUNDARY_POS) return pos * UPPER_SLOPE + UPPER_OFFSET;
  return -(pos * pos) / 11033 + pos * 0.1497326203 - 65.0;
}

export function dbToFader(db: number): number {
  if (!Number.isFinite(db)) return 0;
  if (db >= 6) return 1;
  const d = db;
  const pos =
    d >= -6
      ? (d - UPPER_OFFSET) / UPPER_SLOPE
      : 826.0 - Math.sqrt(-34869.0 - 11033.0 * d);
  return clamp(pos / 1023, 0, 1);
}

/** "-12.0 dB" 形式(TotalMix の Val 表示に寄せたローカル表示用) */
export function formatDb(db: number): string {
  if (!Number.isFinite(db)) return "-oo dB";
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)} dB`;
}
