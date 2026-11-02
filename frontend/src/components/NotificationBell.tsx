import { useEffect, useRef, useState } from 'react'
import { remindersApi } from '../api/endpoints'
import type { Reminder } from '../api/types'

const POLL_INTERVAL_MS = 60_000

export default function NotificationBell() {
  const [items, setItems] = useState<Reminder[]>([])
  const [open, setOpen] = useState(false)
  const shown = useRef(new Set<number>())

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const poll = async () => {
      try {
        const due = await remindersApi.notifications()
        setItems(due)
        for (const r of due) {
          if (shown.current.has(r.id)) continue
          shown.current.add(r.id)
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(r.title, { body: r.message })
          }
        }
      } catch {
        // polling is best-effort
      }
    }

    poll()
    const id = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const dismiss = async (id: number) => {
    await remindersApi.markRead(id)
    setItems((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="relative">
      <button className="btn-secondary relative" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <svg viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span className="hidden sm:inline">Notifications</span>
        {items.length > 0 && (
          <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{items.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-surface p-3 shadow-lg">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No new notifications</p>
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-2">
                  <div>
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-slate-500">{r.message}</p>
                  </div>
                  <button className="text-xs text-indigo-600 hover:underline" onClick={() => dismiss(r.id)}>
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
