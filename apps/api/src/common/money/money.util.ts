/**
 * Money helpers for the finance modules.
 *
 * Amounts are stored as Postgres numeric(18,2) and read into JS `number` (see
 * common/transformers/decimal.transformer.ts — kept as `number` because the
 * same transformer also serves numeric(18,8) exchange-rate columns). Plain
 * float arithmetic on those numbers has two well-known hazards:
 *
 *   1. Half-cent rounding: `Math.round(1.005 * 100) / 100 === 1.00`, because
 *      1.005 is actually stored as 1.00499999…  → the cent is lost.
 *   2. Accumulated drift: summing many 2-decimal floats (0.1 + 0.2 + …) leaves
 *      a sub-cent residue that can make a total miss by a cent.
 *
 * These helpers round half-away-from-zero at cent precision robustly, and sum
 * in integer cents so a total never drifts. Route money arithmetic through them
 * rather than raw `+`/`Math.round`.
 */

/** Round to 2 decimals, half away from zero, robust to binary-float error. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  // The tiny epsilon nudge lifts values like 1.00499999… back onto 1.005 before
  // the cent rounding, so the half rounds up as an accountant expects.
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  return (sign * cents) / 100;
}

/**
 * Sum money values without float drift by accumulating integer cents.
 *
 * Contract: inputs are 2-decimal money amounts. Each value is rounded to cents
 * before being added, so this is NOT a general-purpose sum — feeding it
 * higher-precision figures (e.g. 4dp unit prices) rounds each term first and
 * will not match rounding the exact total. Multiply/extend at full precision,
 * then sum the rounded line amounts.
 */
export function sumMoney(values: number[]): number {
  const cents = values.reduce((acc, v) => {
    if (!Number.isFinite(v)) return acc;
    const sign = v < 0 ? -1 : 1;
    return acc + sign * Math.round((Math.abs(v) + Number.EPSILON) * 100);
  }, 0);
  return cents / 100;
}

/** Multiply a money amount by a rate (e.g. tax %/quantity) and round to cents. */
export function multiplyMoney(amount: number, factor: number): number {
  return roundMoney(amount * factor);
}
