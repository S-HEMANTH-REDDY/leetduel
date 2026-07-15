import { useEffect, useState } from 'react';

type Theme = 'light' | 'mid' | 'dark';

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀' },
  { id: 'mid', label: 'Mid', icon: '◐' },
  { id: 'dark', label: 'Dark', icon: '☾' },
];

const STORAGE_KEY = 'leetduel-theme';

export function getInitialTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'mid' || saved === 'dark') return saved;
  }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f5f5f7' : theme === 'mid' ? '#21242b' : '#0a0c12');
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={theme === t.id ? 'active' : ''}
          onClick={() => setTheme(t.id)}
          title={`${t.label} theme`}
          aria-pressed={theme === t.id}
        >
          <span aria-hidden>{t.icon}</span>
          <span className="theme-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
