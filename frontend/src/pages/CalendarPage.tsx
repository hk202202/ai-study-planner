import { format, getDay, parse, startOfWeek } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar'
import withDragAndDropImport, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { errorMessage } from '../api/client'
import { sessionsApi } from '../api/endpoints'
import type { StudySession } from '../api/types'
import { sessionStart, toHHMM, toIsoDate } from '../utils/date'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { 'en-US': enUS },
})

interface CalendarEvent {
  id: number
  title: string
  start: Date
  end: Date
  session: StudySession
}

// The addon is CommonJS; Vite's dev server returns the module wrapper instead of the default export.
const withDragAndDrop =
  (withDragAndDropImport as unknown as { default?: typeof withDragAndDropImport }).default ?? withDragAndDropImport

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

const statusColors: Record<StudySession['status'], string> = {
  pending: '#4f46e5',
  done: '#16a34a',
  skipped: '#d97706',
}

export default function CalendarPage() {
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [view, setView] = useState<View>(() =>
    window.matchMedia('(max-width: 767px)').matches ? Views.DAY : Views.WEEK,
  )
  const [date, setDate] = useState(new Date())
  const [selected, setSelected] = useState<StudySession | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    sessionsApi.list().then(setSessions).catch((err) => setError(errorMessage(err)))
  }, [])

  const events = useMemo<CalendarEvent[]>(
    () =>
      sessions.map((s) => {
        const start = sessionStart(s.scheduled_date, s.start_time)
        return {
          id: s.id,
          title: `${s.subject_name ?? ''}: ${s.topic}`,
          start,
          end: new Date(start.getTime() + s.duration_minutes * 60_000),
          session: s,
        }
      }),
    [sessions],
  )

  const replace = (updated: StudySession) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    setSelected((cur) => (cur?.id === updated.id ? updated : cur))
  }

  const onMove = async ({ event, start, end }: EventInteractionArgs<CalendarEvent>) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const duration = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60_000))
    try {
      replace(
        await sessionsApi.update(event.id, {
          scheduled_date: toIsoDate(startDate),
          start_time: toHHMM(startDate),
          duration_minutes: duration,
        }),
      )
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const setStatus = async (status: StudySession['status']) => {
    if (!selected) return
    replace(await sessionsApi.update(selected.id, { status }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Calendar</h2>
        <p className="text-sm text-slate-500">Drag sessions to reschedule them, or drag the edge to change duration.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="card h-[70vh]">
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          onEventDrop={onMove}
          onEventResize={onMove}
          onSelectEvent={(e) => setSelected(e.session)}
          resizable
          popup
          scrollToTime={new Date(1970, 0, 1, 8)}
          eventPropGetter={(e) => ({
            style: { backgroundColor: statusColors[e.session.status], border: 'none' },
          })}
        />
      </div>

      {selected && (
        <div className="card flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">
              <span className="text-indigo-600">{selected.subject_name}</span> - {selected.topic}
            </p>
            <p className="text-sm text-slate-500">
              {selected.scheduled_date} at {selected.start_time} for {selected.duration_minutes} min
            </p>
            {selected.goal && <p className="mt-1 text-sm">{selected.goal}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn" onClick={() => setStatus('done')}>
              Mark done
            </button>
            <button className="btn-secondary" onClick={() => setStatus('skipped')}>
              Skip
            </button>
            <button className="btn-secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
