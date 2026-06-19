import { ValueTransformer } from 'typeorm';

/**
 * Postgres returns numeric/decimal columns as strings to preserve precision.
 * This transformer converts them to JS numbers on read and leaves numbers as-is on write.
 * Used for all money columns (numeric(18,2)) across the finance module.
 */
export class DecimalTransformer implements ValueTransformer {
  to(value?: number | null): number | null {
    if (value === null || value === undefined) return value ?? null;
    return value;
  }

  from(value?: string | null): number | null {
    if (value === null || value === undefined) return null;
    const num = parseFloat(value as string);
    return Number.isNaN(num) ? 0 : num;
  }
}

export const decimalTransformer = new DecimalTransformer();
