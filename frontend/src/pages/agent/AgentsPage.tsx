import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Bot, RefreshCw, Bug } from 'lucide-react'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { cn } from '@/lib/utils'
import type { PublicModel } from '@/types'
import type { UserAgent, AgentTemplate, AgentSkill, CustomModel } from '@/store/agentStore'

// ── Skill editor ──────────────────────────────────────────────────────────────

function SkillRow({
  skill,
  onChange,
  onDelete,
}: {
  skill: AgentSkill
  onChange: (s: AgentSkill) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <Input
          value={skill.name}
          onChange={(e) => onChange({ ...skill, name: e.target.value })}
          placeholder={t('agents.skillNamePlaceholder')}
          className="h-8 text-xs"
        />
        <Input
          value={skill.description}
          onChange={(e) => onChange({ ...skill, description: e.target.value })}
          placeholder={t('agents.skillDescriptionPlaceholder')}
          className="h-8 text-xs"
        />
      </div>
      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive mt-1.5 transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Agent form ────────────────────────────────────────────────────────────────

interface AgentFormState {
  name: string
  accept_platform_updates: boolean
  platform_model_id: number | null
  useCustomModel: boolean
  custom_model: CustomModel
  soul: string
  skills: AgentSkill[]
}

function defaultForm(agent?: UserAgent): AgentFormState {
  return {
    name: agent?.name ?? '',
    accept_platform_updates: agent?.accept_platform_updates ?? true,
    platform_model_id: agent?.platform_model_id ?? null,
    useCustomModel: agent ? agent.platform_model_id === null && agent.custom_model !== null : false,
    custom_model: agent?.custom_model ?? { id: '', name: '', base_url: '', api_key: '', model_id: '' },
    soul: agent?.soul ?? '',
    skills: agent?.skills ?? [],
  }
}

function genSkillId() {
  return Math.random().toString(36).slice(2)
}

function AgentForm({
  agent,
  textModels,
  onSave,
  onCancel,
}: {
  agent?: UserAgent
  textModels: PublicModel[]
  onSave: (form: AgentFormState) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<AgentFormState>(() => defaultForm(agent))
  const [showSkills, setShowSkills] = useState(false)

  function addSkill() {
    setForm((f) => ({
      ...f,
      skills: [...f.skills, { id: genSkillId(), name: '', description: '' }],
    }))
    setShowSkills(true)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">{t('forms.name')}</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t('agents.agentNamePlaceholder')}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('agents.model')}</Label>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={!form.useCustomModel}
              onChange={() => setForm((f) => ({ ...f, useCustomModel: false }))}
            />
            {t('agents.platformModel')}
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={form.useCustomModel}
              onChange={() => setForm((f) => ({ ...f, useCustomModel: true }))}
            />
            {t('agents.customOpenAICompatible')}
          </label>
        </div>

        {!form.useCustomModel ? (
          <select
            value={form.platform_model_id ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, platform_model_id: Number(e.target.value) || null }))}
            className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('agents.useDefaultModel')}</option>
            {textModels.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        ) : (
          <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{t('common.baseUrl')}</Label>
                <Input
                  value={form.custom_model.base_url}
                  onChange={(e) => setForm((f) => ({ ...f, custom_model: { ...f.custom_model, base_url: e.target.value } }))}
                  placeholder="https://api.openai.com/v1"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{t('common.modelId')}</Label>
                <Input
                  value={form.custom_model.model_id}
                  onChange={(e) => setForm((f) => ({ ...f, custom_model: { ...f.custom_model, model_id: e.target.value } }))}
                  placeholder="gpt-4o"
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t('common.apiKey')}</Label>
              <Input
                type="password"
                value={form.custom_model.api_key}
                onChange={(e) => setForm((f) => ({ ...f, custom_model: { ...f.custom_model, api_key: e.target.value } }))}
                placeholder="sk-..."
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t('agents.displayNameOptional')}</Label>
              <Input
                value={form.custom_model.name}
                onChange={(e) => setForm((f) => ({ ...f, custom_model: { ...f.custom_model, name: e.target.value } }))}
                placeholder={t('agents.customModelNamePlaceholder')}
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('agents.soul')}</Label>
        <textarea
          value={form.soul}
          onChange={(e) => setForm((f) => ({ ...f, soul: e.target.value }))}
          placeholder={t('agents.soulPlaceholder')}
          rows={4}
          className="w-full text-xs border border-border rounded-md px-3 py-2 bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-2">
        <button
          onClick={() => setShowSkills((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors"
        >
          {showSkills ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t('agents.skillsCount', { count: form.skills.length })}
        </button>
        {showSkills && (
          <div className="space-y-2 pl-4">
            {form.skills.map((skill, i) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                onChange={(s) => setForm((f) => ({ ...f, skills: f.skills.map((sk, j) => j === i ? s : sk) }))}
                onDelete={() => setForm((f) => ({ ...f, skills: f.skills.filter((_, j) => j !== i) }))}
              />
            ))}
            <button
              onClick={addSkill}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus size={12} /> {t('agents.addSkill')}
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.name.trim()}>
          <Check size={13} className="mr-1" /> {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  textModels,
  templates,
  onEdit,
  onDelete,
}: {
  agent: UserAgent
  textModels: PublicModel[]
  templates: AgentTemplate[]
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const modelName = agent.platform_model_id
    ? (textModels.find((m) => m.id === agent.platform_model_id)?.display_name ?? t('agents.modelFallback', { id: agent.platform_model_id }))
    : agent.custom_model
      ? (agent.custom_model.name || agent.custom_model.model_id)
      : t('agents.unspecified')

  const sourceTpl = agent.source_template_id
    ? templates.find((t) => t.id === agent.source_template_id)
    : null

  return (
    <div className="border border-border rounded-lg p-4 space-y-2 hover:border-ring/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground">{modelName}</p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {agent.accept_platform_updates && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full flex items-center gap-0.5">
              <RefreshCw size={9} /> {t('agents.followPlatform')}
            </span>
          )}
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {sourceTpl && (
        <p className="text-[10px] text-muted-foreground pl-9">{t('agents.fromTemplate', { name: sourceTpl.name })}</p>
      )}
      {agent.soul && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 pl-9">{agent.soul}</p>
      )}
      {agent.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-9">
          {agent.skills.map((s) => (
            <span key={s.id} className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: agents = [], isLoading } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })
  const { data: templates = [] } = useQuery<AgentTemplate[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data),
  })
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })

  const [editing, setEditing] = useState<UserAgent | null | 'new'>(null)

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/agents/my', body).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents', 'my'] }); setEditing(null) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => api.put(`/agents/my/${id}`, body).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents', 'my'] }); setEditing(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/agents/my/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', 'my'] }),
  })

  function buildPayload(form: AgentFormState) {
    return {
      name: form.name,
      accept_platform_updates: form.accept_platform_updates,
      platform_model_id: form.useCustomModel ? null : (form.platform_model_id ?? null),
      custom_model: form.useCustomModel ? form.custom_model : null,
      soul: form.soul,
      skills: form.skills,
    }
  }

  function handleSave(form: AgentFormState) {
    if (editing === 'new') {
      createMut.mutate(buildPayload(form))
    } else if (editing) {
      updateMut.mutate({ id: editing.id, body: buildPayload(form) })
    }
  }

  if (editing !== null) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
          <h3 className="text-sm font-medium">{editing === 'new' ? t('agents.newAgent') : t('agents.editAgent', { name: (editing as UserAgent).name })}</h3>
        </div>
        <AgentForm
          agent={editing === 'new' ? undefined : editing as UserAgent}
          textModels={textModels}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t('agents.myAgents')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t('agents.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/agent/debug">
              <Bug size={13} className="mr-1" /> {t('agents.debug.shortTitle')}
            </Link>
          </Button>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus size={13} className="mr-1" /> {t('agents.newAgent')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">{t('common.loadingShort')}</div>
      ) : agents.length === 0 ? (
        <div className={cn('border border-dashed border-border rounded-lg p-8 text-center space-y-2')}>
          <Bot size={28} className="mx-auto text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">{t('agents.empty')}</p>
          {templates.length > 0 && (
            <p className="text-[11px] text-muted-foreground/60">{t('agents.emptyTemplateHint')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              textModels={textModels}
              templates={templates}
              onEdit={() => setEditing(agent)}
              onDelete={() => deleteMut.mutate(agent.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
