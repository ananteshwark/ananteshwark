import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useEffect } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
];

export function useRtl() {
  const { i18n } = useTranslation();
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language);
  return currentLang?.dir === 'rtl';
}

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    const dir = current.dir as 'ltr' | 'rtl';
    document.documentElement.dir = dir;
    document.documentElement.lang = current.code;
  }, [current]);

  return (
    <div className="relative group">
      <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm">
        <Globe className="w-4 h-4" />
        {!compact && <span>{current.label}</span>}
      </button>
      <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px] hidden group-hover:block z-50">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-700 transition-colors ${
              lang.code === i18n.language ? 'text-indigo-400 font-medium' : 'text-gray-300'
            }`}
          >
            <span>{lang.label}</span>
            {lang.dir === 'rtl' && (
              <span className="text-xs text-gray-500">RTL</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
