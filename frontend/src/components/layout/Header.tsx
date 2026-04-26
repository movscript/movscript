import { useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/button'

const titles: Record<string, string> = {
  '/projects': '项目',
  '/scripts': '剧本管理',
  '/assets': '素材库',
  '/episodes': '分集管理',
  '/collaboration': '协作进度'
}

export function Header() {
  const { pathname } = useLocation()
  const current = useProjectStore((s) => s.current)
  const { theme, toggleTheme } = useTheme()
  const title = titles[pathname] ?? 'Movscript'

  return (
    <header className="h-14 border-b border-border flex items-center px-6 bg-background gap-2 shrink-0">
      <h1 className="text-sm font-semibold text-foreground flex-1">{title}</h1>
      {current && pathname !== '/projects' && (
        <span className="text-sm text-muted-foreground mr-2">— {current.name}</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="text-muted-foreground hover:text-foreground h-8 w-8"
        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </Button>
    </header>
  )
}
