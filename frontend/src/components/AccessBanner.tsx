import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { formatTimeLeft } from '../utils/date'

const WARN_WITHIN_MS = 24 * 60 * 60 * 1000

export default function AccessBanner() {
  const { user } = useAuth()
  if (!user || user.role === 'admin') return null

  const expired = user.chat_access === 'expired' || user.quiz_access === 'expired'
  if (expired) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3">
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Your AI access has ended.</span> Recharge to keep using the AI study
          assistant and quizzes.
        </p>
        <Link to="/pricing" className="btn">
          Recharge now
        </Link>
      </div>
    )
  }

  const msLeft = user.ai_access_until ? new Date(user.ai_access_until).getTime() - Date.now() : 0
  if (msLeft > 0 && msLeft < WARN_WITHIN_MS) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-6 py-2">
        <p className="text-sm text-indigo-800">
          AI chat and quizzes: <span className="font-semibold">{formatTimeLeft(user.ai_access_until!)}</span> left.
        </p>
        <Link to="/pricing" className="text-sm font-medium text-indigo-700 hover:underline">
          See plans
        </Link>
      </div>
    )
  }
  return null
}
