import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { quizApi } from '../api/endpoints'
import type { Flashcard, FlashcardRating } from '../api/types'
import TopicPicker from '../components/TopicPicker'

const RATINGS: { rating: FlashcardRating; label: string; key: string; className: string }[] = [
  { rating: 'again', label: 'Again', key: '1', className: 'border-red-200 bg-red-50 text-red-700' },
  { rating: 'good', label: 'Good', key: '2', className: 'border-green-200 bg-green-50 text-green-700' },
  { rating: 'easy', label: 'Easy', key: '3', className: 'border-indigo-100 bg-indigo-50 text-indigo-700' },
]

function CardFace({ card, flipped, onFlip }: { card: Flashcard; flipped: boolean; onFlip: () => void }) {
  return (
    <div className="flip-card h-64 cursor-pointer" onClick={onFlip}>
      <div className={`flip-card-inner relative h-full w-full ${flipped ? 'flipped' : ''}`}>
        <div className="flip-face card absolute inset-0 flex items-center justify-center overflow-y-auto text-center text-lg font-medium">
          {card.front}
        </div>
        <div className="flip-face flip-back card absolute inset-0 flex items-center justify-center overflow-y-auto bg-indigo-50 text-center">
          {card.back}
        </div>
      </div>
    </div>
  )
}

export default function Flashcards() {
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(10)
  const [mode, setMode] = useState<'review' | 'browse'>('review')
  const [due, setDue] = useState<Flashcard[]>([])
  const [cards, setCards] = useState<Flashcard[]>([])
  const [reviewed, setReviewed] = useState(0)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([quizApi.dueFlashcards(), quizApi.listFlashcards()])
      .then(([d, all]) => {
        setDue(d)
        setCards(all)
      })
      .catch((err) => setError(errorMessage(err)))

  useEffect(() => {
    load()
  }, [])

  const generate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await quizApi.generateFlashcards(subject, topic, count)
      await load()
      setIndex(0)
      setFlipped(false)
      setMode('review')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const current = mode === 'review' ? due[0] : cards[index]

  const rate = useCallback(
    async (rating: FlashcardRating) => {
      const card = due[0]
      if (!card) return
      try {
        await quizApi.reviewFlashcard(card.id, rating)
        setDue((prev) => prev.slice(1))
        setReviewed((n) => n + 1)
        setFlipped(false)
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [due],
  )

  useEffect(() => {
    if (mode !== 'review') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
      const match = flipped && RATINGS.find((r) => r.key === e.key)
      if (match) rate(match.rating)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, flipped, rate])

  const go = (delta: number) => {
    setFlipped(false)
    setIndex((i) => (i + delta + cards.length) % cards.length)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Flashcards</h2>
        <p className="text-sm text-slate-500">
          Review cards when they are due. Cards you know well come back less often, so you spend time on what you
          forget.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={generate} className="card grid grid-cols-1 gap-4 md:grid-cols-4">
        <TopicPicker subject={subject} topic={topic} onChange={(s, t) => { setSubject(s); setTopic(t) }} />
        <div>
          <label className="label">Cards</label>
          <input
            className="input"
            type="number"
            min={1}
            max={30}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <div className="flex items-end">
          <button className="btn w-full" disabled={loading}>
            {loading ? 'Generating...' : 'Generate flashcards'}
          </button>
        </div>
      </form>

      <div className="flex gap-2">
        <button
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === 'review' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => {
            setMode('review')
            setFlipped(false)
          }}
        >
          Review due ({due.length})
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === 'browse' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => {
            setMode('browse')
            setFlipped(false)
          }}
        >
          Browse all ({cards.length})
        </button>
      </div>

      {mode === 'review' && !current && (
        <div className="card mx-auto max-w-xl space-y-2 text-center">
          <p className="text-lg font-semibold">All caught up</p>
          <p className="text-sm text-slate-500">
            {reviewed > 0
              ? `You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. Cards you marked "Again" come back in 10 minutes.`
              : cards.length > 0
                ? 'No cards are due right now. Come back later, or browse all cards.'
                : 'No flashcards yet. Generate some above or from your notes.'}
          </p>
        </div>
      )}

      {mode === 'review' && current && (
        <div className="mx-auto max-w-xl space-y-4">
          <p className="text-center text-sm text-slate-500">
            {current.subject_name}: {current.topic} | {due.length} due
            {current.repetitions === 0 ? ' | new card' : ''}
          </p>
          <CardFace key={current.id} card={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          {flipped ? (
            <div className="grid grid-cols-3 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.rating}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${r.className}`}
                  onClick={() => rate(r.rating)}
                >
                  {r.label}
                  <span className="block text-xs font-normal opacity-80">{current.next_review[r.rating]}</span>
                </button>
              ))}
            </div>
          ) : (
            <button className="btn w-full" onClick={() => setFlipped(true)}>
              Show answer
            </button>
          )}
          <p className="text-center text-xs text-slate-400">
            Keyboard: space to flip, then 1 Again, 2 Good, 3 Easy
          </p>
        </div>
      )}

      {mode === 'browse' &&
        (current ? (
          <div className="mx-auto max-w-xl space-y-4">
            <p className="text-center text-sm text-slate-500">
              {current.subject_name}: {current.topic} | Card {index + 1} of {cards.length}
            </p>
            <CardFace card={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
            <div className="flex justify-center gap-2">
              <button className="btn-secondary" onClick={() => go(-1)}>
                Previous
              </button>
              <button className="btn-secondary" onClick={() => setFlipped((f) => !f)}>
                Flip
              </button>
              <button className="btn-secondary" onClick={() => go(1)}>
                Next
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No flashcards yet. Generate some above.</p>
        ))}
    </div>
  )
}
