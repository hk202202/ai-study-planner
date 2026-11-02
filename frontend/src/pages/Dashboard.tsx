import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { errorMessage } from '../api/client'
import { insightsApi, plansApi, quizApi, sessionsApi } from '../api/endpoints'
import type { Progress, StudySession, WeakTopic } from '../api/types'
import FocusTimer from '../components/FocusTimer'
import SessionList from '../components/SessionList'
import { useAuth } from '../context/AuthContext'
import { todayIso } from '../utils/date'

export default function Dashboard() {
  const { user } = useAuth()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([])
  const [cardsDue, setCardsDue] = useState(0)
  const [freeTimer, setFreeTimer] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    Promise.all([plansApi.progress(), sessionsApi.list(), insightsApi.weakTopics(), quizApi.dueFlashcards()])
      .then(([p, s, w, due]) => {
        setProgress(p)
        setSessions(s)
        setWeakTopics(w)
        setCardsDue(due.length)
      })
      .catch((err) => setError(errorMessage(err)))
  }

  const addRevision = async (w: WeakTopic) => {
    setError('')
    try {
      const session = await insightsApi.addRevision(w.subject_name, w.topic)
      setSessions((prev) => [...prev, session])
      setWeakTopics((prev) => prev.map((x) => (x === w ? { ...x, revision_scheduled: true } : x)))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  useEffect(load, [])

  const today = todayIso()
  const todaySessions = sessions.filter((s) => s.scheduled_date === today)
  const upcoming = sessions.filter((s) => s.scheduled_date > today && s.status === 'pending').slice(0, 5)
  const overallPct =
    progress && progress.total_sessions
      ? Math.round((progress.completed_sessions / progress.total_sessions) * 100)
      : 0

  const onSessionChange = (updated: StudySession) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    plansApi.progress().then(setProgress)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Welcome back, {user?.full_name.split(' ')[0]}</h2>
          <p className="text-sm text-slate-500">Here is how your studies are going.</p>
        </div>
        <button className="btn" onClick={() => setFreeTimer(true)}>
          Start focus timer
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Overall completion</p>
          <p className="text-3xl font-bold text-indigo-600">{overallPct}%</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Sessions completed</p>
          <p className="text-3xl font-bold">
            {progress?.completed_sessions ?? 0}
            <span className="text-base font-normal text-slate-400"> / {progress?.total_sessions ?? 0}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Current streak</p>
          <p className="text-3xl font-bold text-orange-500">
            {progress?.current_streak ?? 0} {progress?.current_streak === 1 ? 'day' : 'days'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-semibold">Today's sessions</h3>
          <SessionList
            sessions={todaySessions}
            onChange={onSessionChange}
            emptyText="Nothing scheduled today."
          />
        </div>
        <div className="card">
          <h3 className="mb-3 font-semibold">Progress by subject</h3>
          {progress && progress.subjects.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progress.subjects}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="subject_name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="completion_percent" name="Completion" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No subjects yet.{' '}
              <Link to="/subjects" className="text-indigo-600 hover:underline">
                Add your subjects
              </Link>{' '}
              to get started.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h3 className="mb-1 font-semibold">Weak topics</h3>
          <p className="mb-3 text-xs text-slate-500">Topics where your recent quiz average is below 60%.</p>
          {weakTopics.length === 0 ? (
            <p className="text-sm text-slate-500">
              No weak topics right now.{' '}
              <Link to="/quiz" className="text-indigo-600 hover:underline">
                Take a quiz
              </Link>{' '}
              to find out what needs more work.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {weakTopics.map((w) => (
                <li key={`${w.subject_name}-${w.topic}`} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">
                      <span className="text-indigo-600">{w.subject_name}</span> - {w.topic}
                    </p>
                    <p className="text-xs text-slate-500">
                      Average {w.average_percent}% over {Math.min(w.attempts, 3)} recent{' '}
                      {w.attempts === 1 ? 'quiz' : 'quizzes'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                    <Link
                      to={`/quiz?subject=${encodeURIComponent(w.subject_name)}&topic=${encodeURIComponent(w.topic)}`}
                      className="text-indigo-600 hover:underline"
                    >
                      Practice
                    </Link>
                    {w.revision_scheduled ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">Revision planned</span>
                    ) : (
                      <button className="text-amber-700 hover:underline" onClick={() => addRevision(w)}>
                        Add revision
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card flex flex-col justify-between gap-3">
          <div>
            <h3 className="font-semibold">Flashcards due</h3>
            <p className="text-3xl font-bold text-indigo-600">{cardsDue}</p>
            <p className="text-xs text-slate-500">Short daily reviews help you remember for longer.</p>
          </div>
          <Link to="/flashcards" className="btn-secondary">
            {cardsDue > 0 ? 'Review now' : 'Open flashcards'}
          </Link>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 font-semibold">Coming up</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            No upcoming sessions.{' '}
            <Link to="/planner" className="text-indigo-600 hover:underline">
              Generate a study plan
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-sm">
                <span>
                  <span className="text-indigo-600">{s.subject_name}</span> - {s.topic}
                </span>
                <span className="text-slate-500">
                  {s.scheduled_date} {s.start_time}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {freeTimer && <FocusTimer session={null} onClose={() => setFreeTimer(false)} />}
    </div>
  )
}
