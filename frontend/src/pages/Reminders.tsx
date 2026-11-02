import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { remindersApi } from '../api/endpoints'
import type { Reminder } from '../api/types'

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    remindersApi.list().then(setReminders).catch((err) => setError(errorMessage(err)))
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const created = await remindersApi.create(title, message, new Date(dueAt).toISOString())
      setReminders((prev) => [created, ...prev])
      setTitle('')
      setMessage('')
      setDueAt('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const notificationsBlocked = 'Notification' in window && Notification.permission === 'denied'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reminders</h2>
        <p className="text-sm text-slate-500">
          Every study session gets a reminder 15 minutes before it starts. You can add your own here too.
        </p>
      </div>
      {notificationsBlocked && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          Browser notifications are blocked. Allow them in your browser settings to get pop-up reminders.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={onSubmit} className="card grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="label">Title</label>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div>
          <label className="label">Remind me at</label>
          <input
            className="input"
            type="datetime-local"
            required
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <button className="btn">Add reminder</button>
        </div>
      </form>

      <div className="card">
        <h3 className="mb-2 font-semibold">Recent reminders</h3>
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500">No reminders yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{r.title}</p>
                  {r.message && <p className="text-xs text-slate-500">{r.message}</p>}
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{new Date(r.due_at).toLocaleString()}</p>
                  <p>{r.is_read ? 'dismissed' : r.is_due ? 'due' : 'scheduled'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
