import { useState } from 'react'
import { sessionsApi } from '../api/endpoints'
import type { SessionStatus, StudySession } from '../api/types'
import FocusTimer from './FocusTimer'

const statusStyles: Record<SessionStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  done: 'bg-green-100 text-green-700',
  skipped: 'bg-amber-100 text-amber-700',
}

interface Props {
  sessions: StudySession[]
  onChange: (updated: StudySession) => void
  emptyText?: string
}

export default function SessionList({ sessions, onChange, emptyText = 'No sessions' }: Props) {
  const [focusing, setFocusing] = useState<StudySession | null>(null)
  const setStatus = async (session: StudySession, status: SessionStatus) => {
    onChange(await sessionsApi.update(session.id, { status }))
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>
  }

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="text-indigo-600">{s.subject_name}</span> - {s.topic}
              </p>
              <p className="truncate text-xs text-slate-500">
                {s.start_time} for {s.duration_minutes} min
                {s.focused_minutes > 0 ? ` | ${s.focused_minutes} min focused` : ''}
                {s.goal ? ` | ${s.goal}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end sm:gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[s.status]}`}>{s.status}</span>
              {s.status === 'pending' && (
                <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => setFocusing(s)}>
                  Focus
                </button>
              )}
              {s.status !== 'done' && (
                <button className="text-xs font-medium text-green-700 hover:underline" onClick={() => setStatus(s, 'done')}>
                  Done
                </button>
              )}
              {s.status === 'pending' && (
                <button className="text-xs font-medium text-amber-700 hover:underline" onClick={() => setStatus(s, 'skipped')}>
                  Skip
                </button>
              )}
              {s.status !== 'pending' && (
                <button className="text-xs text-slate-500 hover:underline" onClick={() => setStatus(s, 'pending')}>
                  Undo
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {focusing && <FocusTimer session={focusing} onClose={() => setFocusing(null)} onSessionChange={onChange} />}
    </>
  )
}
