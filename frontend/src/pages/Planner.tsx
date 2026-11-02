import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { plansApi } from '../api/endpoints'
import type { StudyPlan, StudySession } from '../api/types'
import SessionList from '../components/SessionList'
import { todayIso } from '../utils/date'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function Planner() {
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [hours, setHours] = useState(3)
  const [days, setDays] = useState<string[]>(DAYS)
  const [startDate, setStartDate] = useState(todayIso())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    plansApi
      .latest()
      .then((p) => {
        setPlan(p)
        if (p) {
          setHours(p.hours_per_day)
          setDays(p.available_days)
        }
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const onGenerate = async (e: FormEvent) => {
    e.preventDefault()
    if (plan && !confirm('This replaces your current plan and its progress. Continue?')) return
    setError('')
    setGenerating(true)
    try {
      setPlan(await plansApi.generate(hours, days, startDate))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, StudySession[]>()
    for (const s of plan?.sessions ?? []) {
      map.set(s.scheduled_date, [...(map.get(s.scheduled_date) ?? []), s])
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => [date, list.sort((a, b) => a.start_time.localeCompare(b.start_time))] as const)
  }, [plan])

  const onSessionChange = (updated: StudySession) =>
    setPlan((prev) =>
      prev ? { ...prev, sessions: prev.sessions.map((s) => (s.id === updated.id ? updated : s)) } : prev,
    )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI Study Planner</h2>
        <p className="text-sm text-slate-500">
          AI builds a two-week schedule from your subjects, exam dates and available time.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={onGenerate} className="card grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="label">Hours per day</label>
          <input
            className="input"
            type="number"
            min={0.5}
            max={16}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Start date</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Available days</label>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${
                  days.includes(d) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-3">
          <button className="btn" disabled={generating || days.length === 0}>
            {generating ? 'Generating with AI...' : plan ? 'Regenerate plan' : 'Generate plan'}
          </button>
        </div>
      </form>

      {plan ? (
        <div className="space-y-4">
          {grouped.map(([date, list]) => (
            <div key={date} className="card">
              <h3 className="mb-2 font-semibold">
                {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </h3>
              <SessionList sessions={list} onChange={onSessionChange} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No plan yet. Add subjects, then generate one above.</p>
      )}
    </div>
  )
}
