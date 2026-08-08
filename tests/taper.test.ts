import { describe, expect, it } from "vitest";
import { dbToFader, faderToDb, formatDb } from "../src/osc/taper";

describe("taper (float ↔ dB)", () => {
  it("maps 1.0 to +6 dB", () => {
    expect(faderToDb(1)).toBeCloseTo(6.0, 1);
  });

  it("maps ~0.8172 to 0 dB (TotalMix unity)", () => {
    expect(dbToFader(0)).toBeCloseTo(0.8172, 3);
    expect(faderToDb(0.8172)).toBeCloseTo(0, 1);
  });

  it("maps ~0.634 to -6 dB (segment boundary)", () => {
    expect(dbToFader(-6)).toBeCloseTo(649 / 1023, 3);
    expect(faderToDb(0.634)).toBeCloseTo(-6, 0);
  });

  it("maps 0.0 to -infinity", () => {
    expect(faderToDb(0)).toBe(-Infinity);
    expect(dbToFader(-Infinity)).toBe(0);
  });

  it("round-trips across the working range", () => {
    for (const db of [-60, -40, -20, -12, -6, -3, 0, 3, 6]) {
      expect(faderToDb(dbToFader(db))).toBeCloseTo(db, 1);
    }
  });

  it("clamps out-of-range inputs", () => {
    expect(dbToFader(20)).toBe(1);
    expect(faderToDb(2)).toBeCloseTo(6.0, 1);
    expect(faderToDb(-1)).toBe(-Infinity);
  });

  it("applies a -20 dB dim like the Fader Dim key", () => {
    const original = dbToFader(0); // 0 dB
    const dimmed = dbToFader(faderToDb(original) - 20);
    expect(faderToDb(dimmed)).toBeCloseTo(-20, 1);
    expect(dimmed).toBeLessThan(original);
  });

  it("formats dB like TotalMix Val strings", () => {
    expect(formatDb(0)).toBe("0.0 dB");
    expect(formatDb(-12.04)).toBe("-12.0 dB");
    expect(formatDb(6)).toBe("+6.0 dB");
    expect(formatDb(-Infinity)).toBe("-oo dB");
  });
});
