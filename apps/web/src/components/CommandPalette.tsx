import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Clock, CornerDownLeft } from 'lucide-react';
import { globalSearch, SearchGroup, SearchResultItem } from '../api/search';

const RECENT_KEY = 'commandPalette.recent';
const MAX_RECENT = 10;

interface RecentItem extends SearchResultItem {
  label: string;
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

export const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl/Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    // Allow other components (e.g. the Header button) to open the palette.
    const openHandler = () => setOpen(true);
    window.addEventListener('open-command-palette', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-command-palette', openHandler);
    };
  }, []);

  // On open: reset and focus
  useEffect(() => {
    if (open) {
      setQuery('');
      setGroups([]);
      setActiveIndex(0);
      setRecent(loadRecent());
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      globalSearch(term)
        .then((res) => {
          setGroups(Array.isArray(res) ? res : []);
          setActiveIndex(0);
        })
        .catch(() => setGroups([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Flatten visible results for keyboard navigation
  const showingRecent = query.trim().length < 2;
  const flatResults: Array<{ item: SearchResultItem; label: string }> = showingRecent
    ? recent.map((r) => ({ item: r, label: r.label }))
    : groups.flatMap((g) => g.results.map((item) => ({ item, label: g.label })));

  const close = useCallback(() => setOpen(false), []);

  const select = useCallback(
    (item: SearchResultItem, label: string) => {
      const entry: RecentItem = {
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        route: item.route,
        label,
      };
      const next = [entry, ...loadRecent().filter((r) => !(r.id === item.id && r.route === item.route))];
      saveRecent(next);
      setRecent(next.slice(0, MAX_RECENT));
      close();
      navigate(item.route);
    },
    [navigate, close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatResults.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[activeIndex];
      if (target) select(target.item, target.label);
    }
  };

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[10vh] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200"
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees, vendors, invoices, items…"
            className="flex-1 py-3.5 text-sm outline-none placeholder-gray-400"
          />
          <button
            onClick={close}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">Searching…</div>
          )}

          {!loading && showingRecent && recent.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Type at least 2 characters to search across modules.
            </div>
          )}

          {!loading && showingRecent && recent.length > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <Clock className="h-3 w-3" /> Recent
              </div>
              {recent.map((r) => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <button
                    key={`${r.route}-${r.id}-${idx}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(r, r.label)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left ${
                      activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-800 truncate">{r.title}</span>
                      {r.subtitle && (
                        <span className="block text-xs text-gray-400 truncate">{r.subtitle}</span>
                      )}
                    </span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{r.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !showingRecent && groups.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No results found.</div>
          )}

          {!loading &&
            !showingRecent &&
            groups.map((group) => (
              <div key={group.type} className="py-2">
                <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {group.label}
                </div>
                {group.results.map((item) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  return (
                    <button
                      key={`${group.type}-${item.id}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => select(item, group.label)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left ${
                        activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-800 truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="block text-xs text-gray-400 truncate">{item.subtitle}</span>
                        )}
                      </span>
                      {activeIndex === idx && (
                        <CornerDownLeft className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
