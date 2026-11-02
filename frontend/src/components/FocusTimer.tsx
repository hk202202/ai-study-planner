import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'
import { focusApi, sessionsApi } from '../api/endpoints'
import type { StudySession } from '../api/types'

const PRESETS = [
  { focus: 25, rest: 5 },
  { focus: 50, rest: 10 },
]

type Phase = 'focus' | 'break'

interface Props {
  session: StudySession | null
  onClose: () => void
  onSessionChange?: (session: StudySession) => void
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start()
    osc.stop(ctx.currentTime + 0.8)
  } catch {
    // Audio can be blocked by the browser; the on-screen change is enough.
  }
}

function notify(title: string, body: string) {
  beep()
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body })
  }
}

function format(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function FocusTimer({ session: initialSession, onClose, onSessionChange }: Props) {
  const [session, setSession] = useState(initialSession)
  const [preset, setPreset] = useState(PRESETS[0])
  const [phase, setPhase] = useState<Phase>('focus')
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [pausedLeft, setPausedLeft] = useState(PRESETS[0].focus * 60)
  const [now, setNow] = useState(() => Date.now())
  const [logged, setLogged] = useState(0)
  const [rounds, setRounds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const finishing = useRef(false)

  const running = endsAt !== null
  const phaseLength = (phase === 'focus' ? preset.focus : preset.rest) * 60
  const leftAt = (time: number) => (endsAt !== null ? Math.max(0, Math.ceil((endsAt - time) / 1000)) : pausedLeft)
  const focusedAt = (time: number) => (phase === 'focus' ? Math.floor((phaseLength - leftAt(time)) / 60) : 0)
  const left = leftAt(now)
  const focusedNow = focusedAt(now)

  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running])

  useEffect(() => {
    const original = document.title
    if (running) document.title = `${format(left)} ${phase === 'focus' ? 'Focus' : 'Break'} | AI Study Planner`
    return () => {
      document.title = original
    }
  }, [running, left, phase])

  const save = async (minutes: number, markDone = false) => {
    if (minutes < 1 && !markDone) return
    setSaving(true)
    setError('')
    try {
      if (minutes >= 1) {
        const result = await focusApi.log(minutes, session?.id, markDone)
        setLogged((n) => n + minutes)
        if (result.session) {
          setSession(result.session)
          onSessionChange?.(result.session)
        }
      } else if (session) {
        const updated = await sessionsApi.update(session.id, { status: 'done' })
        setSession(updated)
        onSessionChange?.(updated)
      }
    } catch (err) {
      setError(errorMessage(err))
      throw err
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!running || left > 0 || finishing.current) return
    finishing.current = true
    if (phase === 'focus') {
      save(preset.focus).catch(() => undefined)
      setRounds((r) => r + 1)
      notify('Focus block done', `Nice work. Take a ${preset.rest} minute break.`)
      setPhase('break')
      setEndsAt(Date.now() + preset.rest * 60_000)
    } else {
      notify('Break over', 'Ready for the next focus block?')
      setPhase('focus')
      setEndsAt(null)
      setPausedLeft(preset.focus * 60)
    }
    finishing.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, left])

  const start = () => {
    setNow(Date.now())
    setEndsAt(Date.now() + left * 1000)
  }

  const pause = () => {
    setPausedLeft(left)
    setEndsAt(null)
  }

  const choosePreset = (p: (typeof PRESETS)[number]) => {
    setPreset(p)
    setPhase('focus')
    setEndsAt(null)
    setPausedLeft(p.focus * 60)
  }

  const skipBreak = () => {
    setPhase('focus')
    setEndsAt(null)
    setPausedLeft(preset.focus * 60)
  }

  const stop = async (markDone: boolean) => {
    try {
      await save(focusedAt(Date.now()), markDone)
      onClose()
    } catch {
      // error is shown in the dialog
    }
  }

  const close = () => {
    const minutes = focusedAt(Date.now())
    if (minutes >= 1 && !window.confirm(`Close without saving ${minutes} focused minutes?`)) return
    onClose()
  }

  const progress = 100 - (left / phaseLength) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="card w-full max-w-md space-y-5"
        role="dialog"
        aria-label="Focus timer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Focus timer</h3>
            <p className="truncate text-sm text-slate-500">
              {session ? `${session.subject_name} - ${session.topic}` : 'Free study (not linked to a session)'}
            </p>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.focus}
              disabled={running}
              onClick={() => choosePreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                preset.focus === p.focus ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {p.focus} / {p.rest} min
            </button>
          ))}
        </div>

        <div className="text-center">
          <p
            className={`text-sm font-semibold uppercase tracking-wide ${phase === 'focus' ? 'text-indigo-600' : 'text-green-600'}`}
          >
            {phase === 'focus' ? 'Focus' : 'Break'}
          </p>
          <p className="font-mono text-6xl font-bold tabular-nums">{format(left)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${phase === 'focus' ? 'bg-indigo-600' : 'bg-green-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex justify-center gap-2">
          {running ? (
            <button className="btn-secondary" onClick={pause}>
              Pause
            </button>
          ) : (
            <button className="btn" onClick={start}>
              {left === phaseLength ? 'Start' : 'Resume'}
            </button>
          )}
          {phase === 'break' && (
            <button className="btn-secondary" onClick={skipBreak}>
              Skip break
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">
          {rounds} focus {rounds === 1 ? 'block' : 'blocks'} done
          {session
            ? ` | ${session.focused_minutes} of ${session.duration_minutes} planned minutes focused`
            : logged
              ? ` | ${logged} minutes saved`
              : ''}
        </p>

        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <button className="btn-secondary" disabled={saving} onClick={() => stop(false)}>
            {focusedNow >= 1 ? `Stop and save ${focusedNow} min` : 'Stop'}
          </button>
          {session && session.status !== 'done' && (
            <button className="btn" disabled={saving} onClick={() => stop(true)}>
              Finish session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
