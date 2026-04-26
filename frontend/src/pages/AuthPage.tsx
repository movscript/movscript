import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useUserStore } from '@/store/userStore'
import type { User } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Tab = 'login' | 'register'

function PasswordInput({ placeholder, value, onChange, onKeyDown }: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? '隐藏密码' : '显示密码'}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export default function AuthPage() {
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const [tab, setTab] = useState<Tab>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const login = useMutation({
    mutationFn: () => api.post('/auth/login', { username, password }).then((r) => r.data as User),
    onSuccess: setCurrentUser,
    onError: (e: any) => setError(e.response?.data?.error ?? '登录失败')
  })

  const register = useMutation({
    mutationFn: () => api.post('/auth/register', { username, password }).then((r) => r.data as User),
    onSuccess: setCurrentUser,
    onError: (e: any) => setError(e.response?.data?.error ?? '注册失败')
  })

  function handleSubmit() {
    setError('')
    if (!username.trim() || !password) return
    if (tab === 'register') {
      if (password !== confirm) { setError('两次密码不一致'); return }
      register.mutate()
    } else {
      login.mutate()
    }
  }

  const loading = login.isPending || register.isPending
  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && handleSubmit()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-foreground mb-1">Movscript</h1>
        <p className="text-sm text-muted-foreground mb-8">短剧制作协作平台</p>

        <div className="flex border-b border-border mb-6">
          {(['login', 'register'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 pb-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="username" className="sr-only">用户名</Label>
            <Input
              id="username"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter}
              autoFocus
            />
          </div>
          <PasswordInput placeholder="密码" value={password} onChange={setPassword} onKeyDown={onEnter} />
          {tab === 'register' && (
            <PasswordInput placeholder="确认密码" value={confirm} onChange={setConfirm} onKeyDown={onEnter} />
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={loading || !username.trim() || !password}
            className="w-full"
          >
            {loading ? '请稍候…' : tab === 'login' ? '登录' : '注册'}
          </Button>
        </div>

        {tab === 'login' && (
          <p className="text-xs text-muted-foreground text-center mt-5">
            还没有账号？
            <button onClick={() => setTab('register')} className="text-foreground hover:underline ml-1 transition-colors">立即注册</button>
          </p>
        )}
      </div>
    </div>
  )
}
