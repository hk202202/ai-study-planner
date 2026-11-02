import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { insightsApi, quizApi } from '../api/endpoints'
import type { Quiz, QuizResult, StudySession } from '../api/types'
import TopicPicker from '../components/TopicPicker'

const WEAK_PERCENT = 60

export default function QuizPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [subject, setSubject] = useState(searchParams.get('subject') ?? '')
  const [topic, setTopic] = useState(searchParams.get('topic') ?? '')
  const [count, setCount] = useState(5)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<QuizResult | null>(null)
  const [history, setHistory] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState<StudySession | null>(null)
  const openId = Number(searchParams.get('id')) || null

  useEffect(() => {
    quizApi.list().then(setHistory).catch(() => setHistory([]))
  }, [])

  useEffect(() => {
    if (!openId) return
    quizApi
      .get(openId)
      .then((q) => {
        setQuiz(q)
        setAnswers(new Array(q.questions.length).fill(-1))
        setResult(null)
        setRevision(null)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [openId])

  const addRevision = async () => {
    if (!quiz) return
    try {
      setRevision(await insightsApi.addRevision(quiz.subject_name, quiz.topic))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const generate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setResult(null)
    setRevision(null)
    try {
      const q = await quizApi.generate(subject, topic, count)
      setQuiz(q)
      setAnswers(new Array(q.questions.length).fill(-1))
      setSearchParams({})
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (!quiz) return
    try {
      const r = await quizApi.submit(quiz.id, answers)
      setResult(r)
      setHistory(await quizApi.list())
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const optionClass = (qi: number, oi: number) => {
    const chosen = answers[qi] === oi
    if (!result || !quiz) return chosen ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
    if (oi === quiz.questions[qi].correct_index) return 'border-green-500 bg-green-50'
    return chosen ? 'border-red-500 bg-red-50' : 'border-slate-200'
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI Quizzes</h2>
        <p className="text-sm text-slate-500">Generate a multiple-choice quiz on any topic and test yourself.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={generate} className="card grid grid-cols-1 gap-4 md:grid-cols-4">
        <TopicPicker subject={subject} topic={topic} onChange={(s, t) => { setSubject(s); setTopic(t) }} />
        <div>
          <label className="label">Questions</label>
          <input
            className="input"
            type="number"
            min={1}
            max={15}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <div className="flex items-end">
          <button className="btn w-full" disabled={loading}>
            {loading ? 'Generating...' : 'Generate quiz'}
          </button>
        </div>
      </form>

      {quiz && (
        <div className="card space-y-5">
          <h3 className="font-semibold">
            {quiz.subject_name}: {quiz.topic}
          </h3>
          {quiz.questions.map((q, qi) => (
            <div key={qi} className="space-y-2">
              <p className="text-sm font-medium">
                {qi + 1}. {q.question}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    disabled={!!result}
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${optionClass(qi, oi)}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {result ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-indigo-50 p-3 font-medium text-indigo-700">
                You scored {result.score} / {result.total} ({result.percent}%)
              </p>
              {result.percent < WEAK_PERCENT && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {revision ? (
                    <span>
                      Revision added on {revision.scheduled_date} at {revision.start_time}. You'll get a reminder.
                    </span>
                  ) : (
                    <>
                      <span>"{quiz.topic}" looks like a weak topic. Add a revision session to your plan?</span>
                      <button className="btn" onClick={addRevision}>
                        Add revision session
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button className="btn" onClick={submit} disabled={answers.includes(-1)}>
              Submit answers
            </button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Past quizzes</h3>
          <p className="mb-2 text-xs text-slate-500">Click a quiz to take it again.</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  className="flex w-full justify-between gap-3 py-2 text-left hover:text-indigo-600"
                  onClick={() => setSearchParams({ id: String(h.id) })}
                  title="Open this quiz again"
                >
                  <span>
                    {h.subject_name}: {h.topic}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {h.score === null ? 'not submitted' : `${h.score} / ${h.questions.length}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
