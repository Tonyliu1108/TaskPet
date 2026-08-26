import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'taskpet.demo.theme'

function restoreTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'

  try {
    const persistentTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (persistentTheme === 'dark' || persistentTheme === 'light') return persistentTheme
    return window.sessionStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(restoreTheme)
  const isDark = theme === 'dark'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      window.sessionStorage.removeItem(THEME_STORAGE_KEY)
    } catch {
      // Theme still works in memory when persistent storage is unavailable.
    }
  }, [theme])

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={isDark ? '切换为浅色模式' : '切换为深色模式'}
      aria-pressed={isDark}
      data-theme-mode={theme}
      onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
    >
      {isDark ? <Moon size={17} /> : <Sun size={17} />}
      <span>{isDark ? '深色模式' : '浅色模式'}</span>
    </button>
  )
}
