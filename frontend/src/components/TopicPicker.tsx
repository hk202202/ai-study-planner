import { useEffect, useState } from 'react'
import { subjectsApi } from '../api/endpoints'
import type { Subject } from '../api/types'

interface Props {
  subject: string
  topic: string
  onChange: (subject: string, topic: string) => void
}

export default function TopicPicker({ subject, topic, onChange }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])

  useEffect(() => {
    subjectsApi.list().then(setSubjects).catch(() => setSubjects([]))
  }, [])

  const topics = subjects.find((s) => s.name === subject)?.topics ?? []

  return (
    <>
      <div>
        <label className="label">Subject</label>
        <input
          className="input"
          list="subject-options"
          required
          value={subject}
          onChange={(e) => onChange(e.target.value, topic)}
          placeholder="e.g. Operating Systems"
        />
        <datalist id="subject-options">
          {subjects.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label">Topic</label>
        <input
          className="input"
          list="topic-options"
          required
          value={topic}
          onChange={(e) => onChange(subject, e.target.value)}
          placeholder="e.g. Process Scheduling"
        />
        <datalist id="topic-options">
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    </>
  )
}
