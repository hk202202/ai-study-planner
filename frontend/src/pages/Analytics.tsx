import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { errorMessage } from '../api/client'
import { insightsApi } from '../api/endpoints'
import type { Analytics as AnalyticsData, DayStat } from '../api/types'
import { formatMinutes } from '../utils/date'

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
const LEVELS = [
  { min: 120, opacity: 1 },
  { min: 60, opacity: 0.75 },
  { min: 30, opacity: 0.5 },
  { min: 1, opacity: 0.3 },
]

function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`
}

function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shortDate(iso: string) {
  return parseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Cell({ day }: { day: DayStat | undefined }) {
  if (!day) return <div className="h-3.5 w-3.5" />
  const level = LEVELS.find((l) => day.minutes >= l.min)
  const label = `${shortDate(day.date)}: ${day.minutes ? formatMinutes(day.minutes) : 'no study'}${
    day.sessions_done ? `, ${day.sessions_done} ${day.sessions_done === 1 ? 'session' : 'sessions'} done` : ''
  }`
  return (
    <div className="h-3.5 w-3.5 rounded-sm bg-slate-100" title={label} aria-label={label}>
      {level && <div className="h-full w-full rounded-sm bg-indigo-500" style={{ opacity: level.opacity }} />}
    </div>
  )
}

function Heatmap({ days }: { days: DayStat[] }) {
  const weeks: (DayStat | undefined)[][] = []
  days.forEach((day, i) => {
    if (i % 7 === 0) weeks.push([])
    weeks[weeks.length - 1].push(day)
  })
  const monthLabel = (week: (DayStat | undefined)[], i: number) => {
    const first = week[0] && parseDate(week[0].date)
    if (!first) return ''
    const prev = i > 0 && weeks[i - 1][0] ? parseDate(weeks[i - 1][0]!.date) : null
    return !prev || prev.getMonth() !== first.getMonth() ? first.toLocaleDateString(undefined, { month: 'short' }) : ''
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1">
        <div className="mr-1 flex flex-col gap-1 pt-5">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="h-3.5 text-[10px] leading-3.5 text-slate-400">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="h-4 whitespace-nowrap text-[10px] text-slate-400">{monthLabel(week, i)}</span>
            {Array.from({ length: 7 }, (_, d) => (
              <Cell key={d} day={week[d]} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
        Less
        <div className="h-3.5 w-3.5 rounded-sm bg-slate-100" />
        {[...LEVELS].reverse().map((l) => (
          <div key={l.min} className="h-3.5 w-3.5 rounded-sm bg-indigo-500" style={{ opacity: l.opacity }} />
        ))}
        More
      </div>
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    insightsApi
      .analytics()
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const weekly = (data?.weekly ?? []).map((w) => ({
    label: shortDate(w.week_start),
    hours: Math.round((w.minutes / 60) * 10) / 10,
    sessions: w.sessions_done,
  }))
  const subjectTotal = data?.subjects.reduce((sum, s) => sum + s.minutes, 0) ?? 0

  const stats = data
    ? [
        { label: 'This week', value: formatMinutes(data.week_minutes), hint: `${plural(data.week_sessions_done, 'session')} done` },
        { label: 'Total study time', value: formatMinutes(data.total_minutes), hint: plural(data.active_days, 'active day') },
        {
          label: 'Average quiz score',
          value: data.average_quiz_percent === null ? '-' : `${data.average_quiz_percent}%`,
          hint: `${plural(data.quizzes_taken, 'quiz', 'quizzes')} taken`,
        },
        { label: 'Flashcards', value: String(data.cards_reviewed), hint: `reviewed | ${data.cards_due} due now` },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Study analytics</h2>
        <p className="text-sm text-slate-500">
          Study time comes from the focus timer. Sessions marked done without the timer count their planned length.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Loading...</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="card">
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-3xl font-bold">{s.value}</p>
                <p className="text-xs text-slate-400">{s.hint}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="mb-3 font-semibold">Activity (last 20 weeks)</h3>
            <Heatmap days={data.heatmap} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h3 className="mb-3 font-semibold">Hours per week</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [`${v} h`, 'Study time']} />
                    <Bar dataKey="hours" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h3 className="mb-3 font-semibold">Time by subject</h3>
              {data.subjects.length === 0 ? (
                <p className="text-sm text-slate-500">No study time recorded yet. Start a focus timer on a session.</p>
              ) : (
                <ul className="space-y-3">
                  {data.subjects.map((s) => (
                    <li key={s.subject_name} className="text-sm">
                      <div className="mb-1 flex justify-between gap-2">
                        <span className="truncate">{s.subject_name}</span>
                        <span className="shrink-0 text-slate-500">{formatMinutes(s.minutes)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${(s.minutes / subjectTotal) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
