import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { UserQuota, UsageLog } from '@/types'
import { useUserStore } from '@/store/userStore'
import { LogOut, Coins } from 'lucide-react'
import { Button } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

/* ─── Profile tab ─── */

function ProfileTab() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)

  return (
    <div className="space-y-6 max-w-sm">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
          {currentUser?.username[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">{currentUser?.username}</p>
          <p className="text-sm text-muted-foreground">
            {currentUser?.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <button
          onClick={() => setCurrentUser(null)}
          className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
        >
          <LogOut size={15} /> {t('sidebar.logout')}
        </button>
      </div>
    </div>
  )
}

/* ─── Usage tab ─── */

function UsageTab() {
  const { t, i18n } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const [page, setPage] = useState(1)

  const { data: quota } = useQuery<UserQuota>({
    queryKey: ['user', 'quota'],
    queryFn: () => api.get('/user/quota').then((r) => r.data),
    enabled: !!currentUser,
  })

  const { data: logsData } = useQuery<{ total: number; items: UsageLog[] }>({
    queryKey: ['user', 'usage-logs', page],
    queryFn: () => api.get(`/user/usage-logs?page=${page}&page_size=20`).then((r) => r.data),
    enabled: !!currentUser,
  })

  const logs = logsData?.items ?? []
  const total = logsData?.total ?? 0
  const pageCount = Math.ceil(total / 20)

  function formatDate(s: string) {
    return new Date(s).toLocaleString(i18n.language, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const opLabel: Record<string, string> = {
    text: t('user.usage.operations.text'),
    image: t('user.usage.operations.image'),
    video: t('user.usage.operations.video'),
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Balance card */}
      <div className="bg-foreground rounded-xl px-6 py-5 text-background">
        <div className="flex items-center gap-2 mb-1">
          <Coins size={14} className="opacity-60" />
          <p className="text-xs opacity-60">{t('user.usage.balance')}</p>
        </div>
        <p className="text-3xl font-bold tabular-nums">{(quota?.balance ?? 0).toFixed(2)}</p>
        <p className="text-xs opacity-50 mt-0.5">{t('common.credits')}</p>
      </div>

      {/* This month stats */}
      {quota && (
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">{t('user.usage.monthCost')}</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{quota.total_cost_this_month.toFixed(3)}</p>
            <p className="text-xs text-muted-foreground">{t('common.credits')}</p>
          </div>
          <div className="border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">{t('user.usage.monthTokens')}</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{quota.total_tokens_this_month.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{t('common.tokens')}</p>
          </div>
        </div>
      )}

      {/* Usage log table */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">{t('user.usage.details')}</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-card border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('user.usage.time')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('user.usage.model')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('user.usage.type')}</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t('common.tokens')}</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t('common.credits')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.ID} className="hover:bg-card">
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(log.CreatedAt)}</td>
                  <td className="px-4 py-2.5 font-mono text-foreground">
                    {log.ai_model_config?.model_def_id ?? `config#${log.ai_model_config_id}`}
                  </td>
                  <td className="px-4 py-2.5">{opLabel[log.operation_type] ?? log.operation_type}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {(log.input_tokens + log.output_tokens) > 0
                      ? (log.input_tokens + log.output_tokens).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{log.cost.toFixed(3)}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t('user.usage.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm mt-3">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t('user.usage.prevPage')}</Button>
            <span className="text-muted-foreground text-xs">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>{t('user.usage.nextPage')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main page ─── */

export default function UserProfilePage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t('user.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('user.subtitle')}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t('user.tabs.profile')}</TabsTrigger>
          <TabsTrigger value="usage">{t('user.tabs.usage')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="usage" className="mt-6">
          <UsageTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
