import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { adminApi } from '../../api/endpoints'
import type { ActivityItem, Student } from '../../api/types'
import { formatDateTime } from '../../utils/date'

const PAGE_SIZE = 50

const ACTION_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'login', label: 'Logins (incl. failed)' },
  { value: 'logout', label: 'Logouts' },
  { value: 'register', label: 'Registrations' },
  { value: 'chat', label: 'AI chat' },
  { value: 'quiz', label: 'Quizzes' },
  { value: 'flashcards', label: 'Flashcards' },
  { value: 'plan', label: 'Plan generation' },
  { value: 'subject', label: 'Subjects' },
  { value: 'session', label: 'Study sessions' },
  { value: 'payment', label: 'Payments' },
  { value: 'access.denied', label: 'Blocked AI attempts' },
  { value: 'admin', label: 'Admin changes' },
]

function actionStyle(action: string): string {
  if (action === 'login.failed' || action === 'login.blocked' || action === 'access.denied' || action === 'payment.failed')
    return 'bg-red-100 text-red-700'
  if (action.startsWith('login') || action === 'logout' || action === 'register') return 'bg-blue-100 text-blue-700'
  if (action.startsWith('payment')) return 'bg-green-100 text-green-700'
  if (action.startsWith('admin')) return 'bg-purple-100 text-purple-700'
  if (action.startsWith('chat') || action.startsWith('quiz') || action.startsWith('flashcards') || action.startsWith('plan'))
    return 'bg-indigo-100 text-indigo-700'
  return 'bg-slate-100 text-slate-600'
}

export default function Activity() {
  const [params, setParams] = useSearchParams()
  const [students, setStudents] = useState<Student[]>([])
  const [items, setItems] = useState<ActivityItem[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')

  const userId = params.get('user_id') ?? ''
  const action = params.get('action') ?? ''
  const page = Number(params.get('page') ?? '0')

  useEffect(() => {
    adminApi.students().then(setStudents).catch(() => undefined)
  }, [])

  const load = () => {
    setError('')
    adminApi
      .activity({
        user_id: userId ? Number(userId) : undefined,
        action: action || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((res) => {
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err) => setError(errorMessage(err)))
  }

  useEffect(load, [userId, action, page])

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next)
  }

  const goToPage = (p: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
  }

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Activity Log</h2>
        <p className="text-sm text-slate-500">Every login, failed login and action students take, newest first.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Student</label>
          <select className="input" value={userId} onChange={(e) => setFilter('user_id', e.target.value)}>
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input" value={action} onChange={(e) => setFilter('action', e.target.value)}>
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" onClick={load}>
          Refresh
        </button>
        <p className="ml-auto text-sm text-slate-500">{total} events</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{formatDateTime(item.created_at)}</td>
                <td className="px-4 py-2">
                  {item.user_email ? (
                    <>
                      <p className="font-medium">{item.user_name}</p>
                      <p className="text-xs text-slate-500">{item.user_email}</p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Unknown account</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${actionStyle(item.action)}`}>
                    {item.action}
                  </span>
                </td>
                <td className="max-w-md truncate px-4 py-2 text-xs text-slate-600" title={item.detail}>
                  {item.detail || '-'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-400">{item.ip || '-'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary" disabled={page === 0} onClick={() => goToPage(page - 1)}>
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page + 1} of {lastPage + 1}
          </span>
          <button className="btn-secondary" disabled={page >= lastPage} onClick={() => goToPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
