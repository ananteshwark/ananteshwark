import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localizationApi } from '../../api/localization';

const COUNTRY_FLAGS: Record<string, string> = {
  IN: '🇮🇳',
  US: '🇺🇸',
  AE: '🇦🇪',
};

const COUNTRY_RULES: Record<string, string[]> = {
  IN: [
    'PF: 12% employee + 12% employer on basic (capped ₹15k)',
    'ESI: 0.75% employee + 3.25% employer (if gross ≤ ₹21k)',
    'Professional Tax: State slab (Maharashtra default)',
    'TDS: NEW regime FY25-26 + 4% cess + 87A rebate',
    'Gratuity: 15/26 × basic × years (min 5 years)',
  ],
  US: [
    'Federal Income Tax: 2024 brackets (SINGLE), std deduction $14,600',
    'Social Security: 6.2% employee + 6.2% employer (wage base $168,600)',
    'Medicare: 1.45% employee + 1.45% employer (no cap)',
    'Additional Medicare: 0.9% on annual income > $200,000',
    'FUTA: 0.6% effective rate (first $7,000 wages)',
    'CA State Income Tax: Progressive brackets',
  ],
  AE: [
    'No personal income tax (expatriates)',
    'GOSI: 5% employee + 12.5% employer (UAE nationals only)',
    'EOSG: 21 days/year basic for first 5 years, 30 days after',
    'VAT: 5% on goods/services (quarterly filing)',
    'WPS: Payroll must be processed by 15th of following month',
  ],
};

interface CountryPack {
  country: string;
  name: string;
}

interface TaxResult {
  country: string;
  packName: string;
  grossMonthly: number;
  basicMonthly: number;
  employeeDeductions: Array<{ code: string; name: string; amount: number }>;
  employerContributions: Array<{ code: string; name: string; amount: number }>;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  netPay: number;
  error?: string;
}

export default function LocalizationPage() {
  const [selectedCountry, setSelectedCountry] = useState('US');
  const [grossMonthly, setGrossMonthly] = useState('5000');
  const [basicMonthly, setBasicMonthly] = useState('');
  const [taxResult, setTaxResult] = useState<TaxResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const { data: countriesData, isLoading } = useQuery({
    queryKey: ['localization-countries'],
    queryFn: () => localizationApi.getCountries().then((r) => r.data),
  });

  const countries: CountryPack[] = countriesData?.countries ?? [];

  const handleCalculate = async () => {
    setCalcLoading(true);
    setCalcError(null);
    setTaxResult(null);
    try {
      const gross = parseFloat(grossMonthly) || 0;
      const basic = basicMonthly ? parseFloat(basicMonthly) : undefined;
      const res = await localizationApi.calculateTax(selectedCountry, gross, basic);
      setTaxResult(res.data);
    } catch (err: any) {
      setCalcError(err?.response?.data?.message || 'Calculation failed');
    } finally {
      setCalcLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-gray-500">Loading localization packs...</div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Localization Packs</h1>
        <p className="text-gray-500 mt-1">
          Pluggable country tax and compliance packs. Each pack provides statutory
          calculations and compliance calendar items specific to its jurisdiction.
        </p>
      </div>

      {/* Country packs grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {countries.map((pack) => (
          <div
            key={pack.country}
            className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{COUNTRY_FLAGS[pack.country] ?? '🌐'}</span>
              <div>
                <div className="font-semibold text-gray-900">{pack.name}</div>
                <div className="text-xs text-gray-400 font-mono">{pack.country}</div>
              </div>
            </div>
            <ul className="space-y-1">
              {(COUNTRY_RULES[pack.country] ?? []).map((rule) => (
                <li key={rule} className="text-xs text-gray-600 flex gap-1.5">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {countries.length === 0 && (
          <div className="col-span-3 text-center text-gray-400 py-10">
            No localization packs registered.
          </div>
        )}
      </div>

      {/* Tax Calculator Demo */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tax Calculator Demo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {countries.map((p) => (
                <option key={p.country} value={p.country}>
                  {COUNTRY_FLAGS[p.country]} {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gross Monthly Salary
            </label>
            <input
              type="number"
              value={grossMonthly}
              onChange={(e) => setGrossMonthly(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Basic Monthly (optional)
            </label>
            <input
              type="number"
              value={basicMonthly}
              onChange={(e) => setBasicMonthly(e.target.value)}
              placeholder="Defaults to 40% of gross"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={handleCalculate}
          disabled={calcLoading}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {calcLoading ? 'Calculating...' : 'Calculate'}
        </button>

        {calcError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {calcError}
          </div>
        )}

        {taxResult && !taxResult.error && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{COUNTRY_FLAGS[taxResult.country] ?? '🌐'}</span>
              <span className="font-semibold text-gray-800">{taxResult.packName}</span>
              <span className="text-gray-400 text-sm">
                — Gross: {taxResult.grossMonthly.toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Employee Deductions */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Employee Deductions
                </div>
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {taxResult.employeeDeductions.map((d) => (
                        <tr key={d.code} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-600">{d.name}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900">
                            {d.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {taxResult.employeeDeductions.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-gray-400 text-center">
                            No employee deductions
                          </td>
                        </tr>
                      )}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2 text-gray-700">Total Deductions</td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">
                          {taxResult.totalEmployeeDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="bg-green-50 font-semibold">
                        <td className="px-3 py-2 text-gray-700">Net Pay</td>
                        <td className="px-3 py-2 text-right font-mono text-green-700">
                          {taxResult.netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Employer Contributions */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Employer Contributions
                </div>
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {taxResult.employerContributions.map((c) => (
                        <tr key={c.code} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-600">{c.name}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900">
                            {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {taxResult.employerContributions.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-gray-400 text-center">
                            No employer contributions
                          </td>
                        </tr>
                      )}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2 text-gray-700">Total Contributions</td>
                        <td className="px-3 py-2 text-right font-mono text-orange-600">
                          {taxResult.totalEmployerContributions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {taxResult?.error && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            {taxResult.error}
          </div>
        )}
      </div>
    </div>
  );
}
