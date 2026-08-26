import { refreshMaxAgeMs } from './auth.controller';

describe('refreshMaxAgeMs — cookie lifetime tracks JWT_REFRESH_EXPIRATION', () => {
  it('parses the JWT-style duration units', () => {
    expect(refreshMaxAgeMs('7d')).toBe(7 * 86_400_000);
    expect(refreshMaxAgeMs('12h')).toBe(12 * 3_600_000);
    expect(refreshMaxAgeMs('30m')).toBe(30 * 60_000);
    expect(refreshMaxAgeMs('900s')).toBe(900_000);
    expect(refreshMaxAgeMs('900')).toBe(900_000); // bare number = seconds
  });

  it('falls back to the 7d default for missing or malformed values', () => {
    const week = 7 * 86_400_000;
    expect(refreshMaxAgeMs('')).toBe(week);
    expect(refreshMaxAgeMs(undefined as any)).toBe(week);
    expect(refreshMaxAgeMs('not-a-duration')).toBe(week);
  });
});
