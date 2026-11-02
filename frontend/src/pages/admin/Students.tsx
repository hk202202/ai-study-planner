import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { adminApi } from '../../api/endpoints'
import type { AccessStatus, AdminStats, Student, StudentUpdate } from '../../api/types'
import Toggle from '../../components/Toggle'
import { useAuth } from '../../context/AuthContext'
import { formatDateTime, formatTimeLeft } from '../../utils/date'

const accessStyles: Record<AccessStatus, string> = {
  allowed: 'bg-green-100 text-green-700',
  expired: 'bg-amber-100 text-amber-700',
  disabled: 'bg-slate-200 text-slate-600',
}

function AccessBadge({ label, status }: { label: string; status: AccessStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${accessStyles[status]}`}>{`${label}: ${status}`}</span>
}

export default function Students() {
  const { user } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = (query = search) => {
    adminApi.students(query).then(setStudents).catch((err) => setError(errorMessage(err)))
    adminApi.stats().then(setStats).catch(() => undefined)
  }

  useEffect(() => {
    load('')
  }, [])

  const update = async (student: Student, data: StudentUpdate) => {
    setError('')
    setBusyId(student.id)
    try {
      const updated = await adminApi.updateStudent(student.id, data)
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      adminApi.stats().then(setStats).catch(() => undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const statCards = stats
    ? [
        { label: 'Students', value: stats.students_total, hint: `${stats.students_active} active` },
        { label: 'Logged in (24h)', value: stats.logins_24h, hint: 'unique users' },
        { label: 'AI requests (24h)', value: stats.ai_requests_24h, hint: 'chat, quizzes, plans' },
        { label: 'With AI access', value: stats.students_with_ai_access, hint: 'trial or paid' },
        { label: 'Revenue', value: `Rs ${stats.revenue}`, hint: `${stats.paid_students} paying students` },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Students</h2>
        <p className="text-sm text-slate-500">
          Control who can use AI chat and quizzes, extend access, and deactivate accounts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="card">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-slate-400">{card.hint}</p>
          </div>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          load()
        }}
      >
        <input
          className="input max-w-sm"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-secondary">Search</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">AI access</th>
              <th className="px-4 py-3 text-center">Chat</th>
              <th className="px-4 py-3 text-center">Quizzes</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => {
              const isSelf = s.id === user?.id
              const busy = busyId === s.id
              const accessActive = !!s.ai_access_until && new Date(s.ai_access_until).getTime() > Date.now()
              return (
                <tr key={s.id} className={s.is_active ? '' : 'bg-slate-50 text-slate-400'}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {s.full_name}
                      {s.role === 'admin' && (
                        <span className="ml-1 rounded bg-indigo-100 px-1 text-xs text-indigo-700">admin</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{s.email}</p>
                    <p className="text-xs text-slate-400">Joined {formatDateTime(s.created_at)}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(s.last_login_at)}</td>
                  <td className="px-4 py-3">
                    {s.role === 'admin' ? (
                      <span className="text-xs text-slate-500">Always</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <AccessBadge label="chat" status={s.chat_access} />
                          <AccessBadge label="quiz" status={s.quiz_access} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {accessActive ? `${formatTimeLeft(s.ai_access_until!)} left` : 'No time left'}
                        </p>
                      </div>
                    )}
                  </td>
                  {s.role === 'admin' ? (
                    <td colSpan={2} className="px-4 py-3 text-center text-xs text-slate-400">
                      Admins always have access
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center">
                        <Toggle
                          label={`AI chat for ${s.full_name}`}
                          checked={s.chat_enabled}
                          disabled={busy}
                          onChange={(v) => update(s, { chat_enabled: v })}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Toggle
                          label={`AI quizzes for ${s.full_name}`}
                          checked={s.quiz_enabled}
                          disabled={busy}
                          onChange={(v) => update(s, { quiz_enabled: v })}
                        />
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      label={`Account active for ${s.full_name}`}
                      checked={s.is_active}
                      disabled={busy || isSelf}
                      onChange={(v) => update(s, { is_active: v })}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <p>
                      Sessions {s.sessions_done}/{s.sessions_total}
                    </p>
                    <p>{s.ai_requests} AI requests</p>
                    <p>Paid Rs {s.total_paid}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {s.role !== 'admin' && (
                        <>
                          <button
                            className="font-medium text-indigo-600 hover:underline disabled:opacity-40"
                            disabled={busy}
                            onClick={() => update(s, { extend_days: 7 })}
                          >
                            +7 days
                          </button>
                          <button
                            className="font-medium text-indigo-600 hover:underline disabled:opacity-40"
                            disabled={busy}
                            onClick={() => update(s, { extend_days: 30 })}
                          >
                            +30 days
                          </button>
                          {accessActive && (
                            <button
                              className="font-medium text-red-600 hover:underline disabled:opacity-40"
                              disabled={busy}
                              onClick={() => {
                                if (confirm(`End AI access for ${s.full_name} now?`)) update(s, { revoke_access: true })
                              }}
                            >
                              End access
                            </button>
                          )}
                        </>
                      )}
                      <Link to={`/admin/activity?user_id=${s.id}`} className="text-slate-600 hover:underline">
                        Activity
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No students found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
