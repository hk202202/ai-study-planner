import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { subjectsApi } from '../api/endpoints'
import type { Subject, SubjectInput } from '../api/types'

const emptyForm = { name: '', exam_date: '', difficulty: 3, priority: 3, topics: '' }

export default function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    subjectsApi.list().then(setSubjects).catch((err) => setError(errorMessage(err)))
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const payload: SubjectInput = {
      name: form.name.trim(),
      exam_date: form.exam_date || null,
      difficulty: Number(form.difficulty),
      priority: Number(form.priority),
      topics: form.topics
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }
    try {
      if (editingId) {
        const updated = await subjectsApi.update(editingId, payload)
        setSubjects((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      } else {
        const created = await subjectsApi.create(payload)
        setSubjects((prev) => [...prev, created])
      }
      setForm(emptyForm)
      setEditingId(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const startEdit = (s: Subject) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      exam_date: s.exam_date ?? '',
      difficulty: s.difficulty,
      priority: s.priority,
      topics: s.topics.join(', '),
    })
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this subject and its study sessions?')) return
    await subjectsApi.remove(id)
    setSubjects((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Subjects</h2>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={onSubmit} className="card grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label">Subject name</label>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Data Structures"
          />
        </div>
        <div>
          <label className="label">Exam date</label>
          <input
            className="input"
            type="date"
            value={form.exam_date}
            onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Difficulty: {form.difficulty} / 5</label>
          <input
            className="w-full"
            type="range"
            min={1}
            max={5}
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Priority: {form.priority} / 5</label>
          <input
            className="w-full"
            type="range"
            min={1}
            max={5}
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Topics (comma separated)</label>
          <input
            className="input"
            value={form.topics}
            onChange={(e) => setForm({ ...form, topics: e.target.value })}
            placeholder="Arrays, Linked Lists, Trees, Graphs"
          />
        </div>
        <div className="flex gap-2 md:col-span-2">
          <button className="btn">{editingId ? 'Save changes' : 'Add subject'}</button>
          {editingId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm)
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {subjects.map((s) => (
          <div key={s.id} className="card space-y-2">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{s.name}</h3>
              <div className="flex gap-2 text-xs">
                <button className="text-indigo-600 hover:underline" onClick={() => startEdit(s)}>
                  Edit
                </button>
                <button className="text-red-600 hover:underline" onClick={() => remove(s.id)}>
                  Delete
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Exam: {s.exam_date ?? 'not set'} | Difficulty {s.difficulty} | Priority {s.priority}
            </p>
            <div className="flex flex-wrap gap-1">
              {s.topics.map((t) => (
                <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
        {subjects.length === 0 && <p className="text-sm text-slate-500">No subjects yet. Add one above.</p>}
      </div>
    </div>
  )
}
