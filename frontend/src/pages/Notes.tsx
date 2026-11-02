import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { notesApi, subjectsApi } from '../api/endpoints'
import type { Note, NoteListItem, Subject } from '../api/types'
import { formatDateTime } from '../utils/date'

type Busy = '' | 'upload' | 'summary' | 'quiz' | 'flashcards' | 'delete'

export default function Notes() {
  const navigate = useNavigate()
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [questions, setQuestions] = useState(5)
  const [cards, setCards] = useState(10)
  const [busy, setBusy] = useState<Busy>('')
  const [error, setError] = useState('')

  useEffect(() => {
    notesApi.list().then(setNotes).catch((err) => setError(errorMessage(err)))
    subjectsApi.list().then(setSubjects).catch(() => setSubjects([]))
  }, [])

  const run = async (kind: Busy, action: () => Promise<void>) => {
    setError('')
    setBusy(kind)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const upload = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    run('upload', async () => {
      const note = await notesApi.upload({
        file: mode === 'file' ? (file ?? undefined) : undefined,
        text: mode === 'text' ? text : undefined,
        title,
        subject_name: subjectName,
      })
      setNotes(await notesApi.list())
      setSelected(note)
      setFile(null)
      setText('')
      setTitle('')
      form.reset()
    })
  }

  const open = (id: number) => run('', async () => setSelected(await notesApi.get(id)))

  const summarize = () =>
    run('summary', async () => {
      if (!selected) return
      const note = await notesApi.summarize(selected.id)
      setSelected(note)
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, has_summary: true } : n)))
    })

  const makeQuiz = () =>
    run('quiz', async () => {
      if (!selected) return
      const quiz = await notesApi.quiz(selected.id, questions)
      navigate(`/quiz?id=${quiz.id}`)
    })

  const makeFlashcards = () =>
    run('flashcards', async () => {
      if (!selected) return
      await notesApi.flashcards(selected.id, cards)
      navigate('/flashcards')
    })

  const remove = () =>
    run('delete', async () => {
      if (!selected || !window.confirm(`Delete "${selected.title}"?`)) return
      await notesApi.remove(selected.id)
      setNotes((prev) => prev.filter((n) => n.id !== selected.id))
      setSelected(null)
    })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Notes</h2>
        <p className="text-sm text-slate-500">
          Upload lecture notes or a PDF, then let AI summarise them or turn them into a quiz and flashcards.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={upload} className="card space-y-4">
        <div className="flex gap-2">
          {(['file', 'text'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {m === 'file' ? 'Upload a file' : 'Paste text'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Title (optional)</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lecture 4: Deadlocks"
            />
          </div>
          <div>
            <label className="label">Subject (optional)</label>
            <select className="input" value={subjectName} onChange={(e) => setSubjectName(e.target.value)}>
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mode === 'file' ? (
          <div>
            <label className="label">PDF, .txt or .md file (up to 5 MB)</label>
            <input
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-700"
              type="file"
              accept=".pdf,.txt,.md"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-40"
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your notes here..."
            />
          </div>
        )}
        <button className="btn" disabled={busy === 'upload'}>
          {busy === 'upload' ? 'Uploading...' : 'Save notes'}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card">
          <h3 className="mb-3 font-semibold">Saved notes</h3>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet. Upload your first one above.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => open(n.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selected?.id === n.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="truncate font-medium">{n.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {n.subject_name || 'No subject'} | {Math.ceil(n.characters / 1000)}k characters
                      {n.has_summary ? ' | summarised' : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-4 lg:col-span-2">
          {!selected ? (
            <p className="text-sm text-slate-500">Select a note to see its summary and study tools.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{selected.title}</h3>
                  <p className="text-xs text-slate-500">
                    {selected.subject_name || 'No subject'}
                    {selected.filename ? ` | ${selected.filename}` : ''} | added {formatDateTime(selected.created_at)}
                  </p>
                </div>
                <button className="text-sm text-red-600 hover:underline" onClick={remove} disabled={busy !== ''}>
                  Delete
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button className="btn" onClick={summarize} disabled={busy !== ''}>
                  {busy === 'summary' ? 'Summarising...' : selected.summary ? 'Summarise again' : 'Summarise with AI'}
                </button>
                <div className="flex gap-2">
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    max={15}
                    value={questions}
                    onChange={(e) => setQuestions(Number(e.target.value))}
                    aria-label="Number of quiz questions"
                  />
                  <button className="btn flex-1" onClick={makeQuiz} disabled={busy !== ''}>
                    {busy === 'quiz' ? 'Creating...' : 'Make quiz'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    max={30}
                    value={cards}
                    onChange={(e) => setCards(Number(e.target.value))}
                    aria-label="Number of flashcards"
                  />
                  <button className="btn flex-1" onClick={makeFlashcards} disabled={busy !== ''}>
                    {busy === 'flashcards' ? 'Creating...' : 'Make flashcards'}
                  </button>
                </div>
              </div>

              {selected.summary ? (
                <div className="rounded-lg bg-indigo-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-indigo-700">AI summary</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.summary}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No summary yet. Click "Summarise with AI" to create one.</p>
              )}

              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Original text ({selected.content.length.toLocaleString()} characters)
                </summary>
                <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-slate-600">
                  {selected.content}
                </p>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
