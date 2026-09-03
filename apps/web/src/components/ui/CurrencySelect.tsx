import { useEffect, useState } from 'react';
import { financeApi } from '../../api/finance';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  isBase?: boolean;
  isActive?: boolean;
}

// Module-level cache so multiple selects on a page don't each hit the API.
let cache: Currency[] | null = null;
let inflight: Promise<Currency[]> | null = null;

async function loadCurrencies(): Promise<Currency[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = financeApi
      .getCurrencies()
      .then((res) => {
        const list: Currency[] = res.data?.data ?? res.data ?? [];
        cache = list;
        return list;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Clear the cache after currencies are added/edited so selects refetch. */
export function invalidateCurrencyCache() {
  cache = null;
}

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function CurrencySelect({
  value,
  onChange,
  className,
  required,
  disabled,
}: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<Currency[]>(cache ?? []);

  useEffect(() => {
    let active = true;
    loadCurrencies().then((list) => {
      if (active) setCurrencies(list);
    });
    return () => {
      active = false;
    };
  }, []);

  // If the current value isn't in the active list (e.g. an inactive code on an
  // existing record), still render it so the selection is preserved.
  const hasValue = currencies.some((c) => c.code === value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      className={
        className ??
        'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
      }
    >
      {!hasValue && value && <option value={value}>{value}</option>}
      {currencies.map((c) => (
        <option key={c.id} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
