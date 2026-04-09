export const PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-opus-4-6": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-haiku-4-5": {
    input: 0.8,
    output: 4.0,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
};

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function calculateCost(
  model: string,
  input: number,
  output: number,
  cacheWrite: number,
  cacheRead: number,
): number {
  const prices = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const perMillion = 1_000_000;

  return (
    (input / perMillion) * prices.input +
    (output / perMillion) * prices.output +
    (cacheWrite / perMillion) * prices.cacheWrite +
    (cacheRead / perMillion) * prices.cacheRead
  );
}
