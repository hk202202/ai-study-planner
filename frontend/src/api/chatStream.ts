import { ACCESS_CHANGED_EVENT, API_URL, TOKEN_KEY } from './client'
import type { ChatMessage } from './types'

export interface ChatStreamResult {
  user_message: ChatMessage
  message: ChatMessage
  error?: string
}

async function failure(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({}))
  const detail = body?.detail
  if (res.status === 401 && localStorage.getItem(TOKEN_KEY)) {
    localStorage.removeItem(TOKEN_KEY)
    window.location.href = '/login'
  }
  if (detail?.code === 'ai_access_expired' || detail?.code === 'feature_disabled') {
    window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT))
  }
  return new Error(typeof detail === 'string' ? detail : (detail?.message ?? `Request failed (${res.status})`))
}

export async function streamChat(message: string, onDelta: (text: string) => void): Promise<ChatStreamResult> {
  const token = localStorage.getItem(TOKEN_KEY)
  const res = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message }),
  })
  if (!res.ok || !res.body) throw await failure(res)

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      if (!event.startsWith('data:')) continue
      const data = JSON.parse(event.slice(5))
      if (data.delta) onDelta(data.delta)
      if (data.done || data.error) return data as ChatStreamResult
    }
  }
  throw new Error('The connection closed before the reply finished. Please try again.')
}
