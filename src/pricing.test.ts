import { describe, expect, test } from "bun:test";
import { PRICING, calculateCost } from "./pricing";

describe("calculateCost", () => {
  test("known model: claude-sonnet-4-6", () => {
    // 1M input + 500K output + 200K cache write + 800K cache read
    const cost = calculateCost(
      "claude-sonnet-4-6",
      1_000_000,
      500_000,
      200_000,
      800_000,
    );
    // 1 * 3.00 + 0.5 * 15.00 + 0.2 * 3.75 + 0.8 * 0.30
    // = 3.00 + 7.50 + 0.75 + 0.24 = 11.49
    expect(cost).toBeCloseTo(11.49, 6);
  });

  test("known model: claude-opus-4-6", () => {
    const cost = calculateCost(
      "claude-opus-4-6",
      1_000_000,
      1_000_000,
      0,
      0,
    );
    // 1 * 15.00 + 1 * 75.00 = 90.00
    expect(cost).toBeCloseTo(90.0, 6);
  });

  test("known model: claude-haiku-4-5", () => {
    const cost = calculateCost(
      "claude-haiku-4-5",
      2_000_000,
      1_000_000,
      500_000,
      1_000_000,
    );
    // 2 * 0.80 + 1 * 4.00 + 0.5 * 1.00 + 1 * 0.08
    // = 1.60 + 4.00 + 0.50 + 0.08 = 6.18
    expect(cost).toBeCloseTo(6.18, 6);
  });

  test("unknown model falls back to sonnet pricing", () => {
    const unknownCost = calculateCost(
      "claude-unknown-99",
      1_000_000,
      500_000,
      200_000,
      800_000,
    );
    const sonnetCost = calculateCost(
      "claude-sonnet-4-6",
      1_000_000,
      500_000,
      200_000,
      800_000,
    );
    expect(unknownCost).toBe(sonnetCost);
  });

  test("zero tokens = zero cost", () => {
    expect(calculateCost("claude-sonnet-4-6", 0, 0, 0, 0)).toBe(0);
    expect(calculateCost("claude-opus-4-6", 0, 0, 0, 0)).toBe(0);
    expect(calculateCost("unknown-model", 0, 0, 0, 0)).toBe(0);
  });
});
