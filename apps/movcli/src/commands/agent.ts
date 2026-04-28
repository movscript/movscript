import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

interface AgentGlobals {
  agentServer?: string
}

interface AgentChatOptions {
  noContext?: boolean
}

interface AgentRunOptions {
  thread?: string
  json?: boolean
}

interface AgentChatResponse {
  conversationId: string
  content: string
  provider: string
  model?: string
  contextIncluded: boolean
}

interface AgentMessage {
  id: string
  threadId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  runId?: string
  createdAt: string
}

interface AgentThread {
  id: string
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
}

interface AgentRun {
  id: string
  threadId: string
  status: 'queued' | 'in_progress' | 'completed' | 'completed_with_warnings' | 'failed'
  assistantMessageId?: string
  error?: string
  warnings?: string[]
  steps?: unknown[]
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function cmdAgentStatus(globals: AgentGlobals) {
  const baseURL = normalizeBaseURL(globals.agentServer)
  const res = await fetch(`${baseURL}/health`)
  if (!res.ok) throw new Error(`agent returned ${res.status}: ${await res.text()}`)
  console.log(JSON.stringify(await res.json(), null, 2))
}

export async function cmdAgentChat(messageParts: string[], options: AgentChatOptions, globals: AgentGlobals) {
  const baseURL = normalizeBaseURL(globals.agentServer)
  const firstMessage = messageParts.join(' ').trim()
  if (firstMessage) {
    const response = await sendChat(baseURL, {
      message: firstMessage,
      includeContext: options.noContext !== true,
    })
    printAssistant(response)
    return
  }

  await runInteractiveChat(baseURL, options)
}

export async function cmdAgentThreads(globals: AgentGlobals) {
  const baseURL = normalizeBaseURL(globals.agentServer)
  printJSON(await getJSON(`${baseURL}/threads`))
}

export async function cmdAgentThread(id: string, globals: AgentGlobals) {
  const baseURL = normalizeBaseURL(globals.agentServer)
  printJSON(await getJSON(`${baseURL}/threads/${encodeURIComponent(id)}`))
}

export async function cmdAgentRun(messageParts: string[], options: AgentRunOptions, globals: AgentGlobals) {
  const message = messageParts.join(' ').trim()
  if (!message) throw new Error('agent run requires a message')

  const baseURL = normalizeBaseURL(globals.agentServer)
  const thread = options.thread
    ? await getJSON<AgentThread>(`${baseURL}/threads/${encodeURIComponent(options.thread)}`)
    : await postJSON<AgentThread>(`${baseURL}/threads`, {})
  await postJSON<AgentMessage>(`${baseURL}/threads/${encodeURIComponent(thread.id)}/messages`, {
    role: 'user',
    content: message,
  })

  const run = await postJSON<AgentRun>(`${baseURL}/runs`, { threadId: thread.id })
  const finalRun = await waitForRun(baseURL, run.id)
  const finalThread = await getJSON<AgentThread>(`${baseURL}/threads/${encodeURIComponent(thread.id)}`)
  const assistant = finalThread.messages.find((item) => item.id === finalRun.assistantMessageId)
    ?? [...finalThread.messages].reverse().find((item) => item.role === 'assistant')

  if (options.json) {
    printJSON({ run: finalRun, thread: finalThread })
    if (finalRun.status === 'failed') process.exitCode = 1
    return
  }

  console.log(`thread ${thread.id}`)
  console.log(`run ${finalRun.id} ${finalRun.status}`)
  if (assistant) console.log(`agent> ${assistant.content}`)
  if (finalRun.status === 'failed') process.exitCode = 1
}

export async function cmdAgentRuns(globals: AgentGlobals) {
  const baseURL = normalizeBaseURL(globals.agentServer)
  printJSON(await getJSON(`${baseURL}/runs`))
}

export async function cmdAgentRunStatus(id: string, globals: AgentGlobals) {
  const baseURL = normalizeBaseURL(globals.agentServer)
  printJSON(await getJSON(`${baseURL}/runs/${encodeURIComponent(id)}`))
}

async function runInteractiveChat(baseURL: string, options: AgentChatOptions) {
  const rl = createInterface({ input, output })
  const messages: ChatMessage[] = []
  let conversationId: string | undefined

  console.log(`Connected to ${baseURL}`)
  console.log('Type /exit to quit.')

  try {
    while (true) {
      const text = (await rl.question('you> ')).trim()
      if (!text) continue
      if (text === '/exit' || text === '/quit') break

      messages.push({ role: 'user', content: text })
      const response = await sendChat(baseURL, {
        conversationId,
        messages,
        includeContext: options.noContext !== true,
      })

      conversationId = response.conversationId
      messages.push({ role: 'assistant', content: response.content })
      printAssistant(response)
    }
  } finally {
    rl.close()
  }
}

async function sendChat(baseURL: string, body: Record<string, unknown>): Promise<AgentChatResponse> {
  return postJSON<AgentChatResponse>(`${baseURL}/chat`, body)
}

async function waitForRun(baseURL: string, runId: string): Promise<AgentRun> {
  const deadline = Date.now() + 30_000
  while (true) {
    const run = await getJSON<AgentRun>(`${baseURL}/runs/${encodeURIComponent(runId)}`)
    if (run.status === 'completed' || run.status === 'completed_with_warnings' || run.status === 'failed') return run
    if (Date.now() > deadline) throw new Error(`run ${runId} did not finish within 30s`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function getJSON<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`agent returned ${res.status}: ${await res.text()}`)
  return await res.json() as T
}

async function postJSON<T = unknown>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`agent returned ${res.status}: ${await res.text()}`)
  return await res.json() as T
}

function printAssistant(response: AgentChatResponse) {
  const model = response.model ? `/${response.model}` : ''
  console.log(`agent (${response.provider}${model})> ${response.content}`)
}

function printJSON(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

function normalizeBaseURL(value: string | undefined): string {
  return (value || process.env.MOVSCRIPT_AGENT_SERVER || 'http://127.0.0.1:28765').replace(/\/$/, '')
}
