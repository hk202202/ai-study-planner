import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { streamChat } from '../api/chatStream'
import { chatApi } from '../api/endpoints'
import type { ChatMessage } from '../api/types'

const SUGGESTIONS = [
  'Explain my next topic in simple terms',
  'Give me a 5-point summary of my hardest subject',
  'How should I revise the night before an exam?',
]

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatApi.history().then(setMessages).catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || sending) return
    setError('')
    setInput('')
    setSending(true)
    setThinking(true)
    const now = new Date().toISOString()
    const userId = -Date.now()
    const replyId = userId - 1
    setMessages((prev) => [...prev, { id: userId, role: 'user', content: message, created_at: now }])

    const appendDelta = (delta: string) => {
      setThinking(false)
      setMessages((prev) =>
        prev.some((m) => m.id === replyId)
          ? prev.map((m) => (m.id === replyId ? { ...m, content: m.content + delta } : m))
          : [...prev, { id: replyId, role: 'assistant', content: delta, created_at: now }],
      )
    }

    try {
      const result = await streamChat(message, appendDelta)
      setMessages((prev) =>
        prev.map((m) => (m.id === userId ? result.user_message : m.id === replyId ? result.message : m)),
      )
      if (result.error) setError(result.error)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
      setThinking(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold">Study Assistant</h2>
        <p className="text-sm text-slate-500">Ask doubts or get topic summaries. The assistant knows your subjects and plan.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="card flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn-secondary mr-2" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {thinking && <p className="text-sm text-slate-400">Assistant is thinking...</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your subjects..."
        />
        <button className="btn" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
