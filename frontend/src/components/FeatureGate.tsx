import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { GatedFeature } from '../api/types'
import { useAuth } from '../context/AuthContext'

const LABELS: Record<GatedFeature, string> = { chat: 'AI study assistant', quiz: 'AI quizzes' }

export default function FeatureGate({ feature, children }: { feature: GatedFeature; children: ReactNode }) {
  const { user } = useAuth()
  const access = feature === 'chat' ? user?.chat_access : user?.quiz_access

  if (access === 'disabled') {
    return (
      <div className="card mx-auto mt-10 max-w-lg space-y-3 text-center">
        <h2 className="text-xl font-bold">{LABELS[feature]} is turned off</h2>
        <p className="text-sm text-slate-500">
          Your admin has turned off {LABELS[feature]} for your account. Contact your admin if you think this is a
          mistake.
        </p>
      </div>
    )
  }

  if (access === 'expired') {
    return (
      <div className="card mx-auto mt-10 max-w-lg space-y-4 text-center">
        <h2 className="text-xl font-bold">Your AI access has ended</h2>
        <p className="text-sm text-slate-500">
          Your free trial of the {LABELS[feature]} is over. Pick a plan to keep learning with AI.
        </p>
        <Link to="/pricing" className="btn">
          Recharge now
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
