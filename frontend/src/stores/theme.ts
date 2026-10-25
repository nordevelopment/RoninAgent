import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ThemeMode = 'dark' | 'light';

export const useThemeStore = defineStore('theme', () => {
  const STORAGE_KEY = 'paia_theme';
  const theme = ref<ThemeMode>('dark');

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      theme.value = saved;
    } else {
      theme.value = 'dark';
    }
    applyTheme(theme.value);
  }

  function applyTheme(t: ThemeMode) {
    document.documentElement.setAttribute('data-theme', t);
    theme.value = t;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Ignore localStorage errors
    }
  }

  function setTheme(t: ThemeMode) {
    applyTheme(t);
  }

  return {
    theme,
    initTheme,
    setTheme,
  };
});
