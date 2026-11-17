export const lightTheme = {
  mode: 'light',
  bg: '#ffffff',
  bgMuted: '#f8fafc',
  bgSoft: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  danger: '#ef4444',
  dangerSoft: '#fef2f2',
};

export const darkTheme = {
  mode: 'dark',
  bg: '#0f172a',
  bgMuted: '#1e293b',
  bgSoft: '#334155',
  border: '#334155',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  danger: '#f87171',
  dangerSoft: '#450a0a',
};

export function applyDocumentTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}
