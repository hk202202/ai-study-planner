import { useEffect, useState } from 'react'
import { errorMessage } from '../api/client'
import { paymentsApi } from '../api/endpoints'
import type { Payment, Plan } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { formatDateTime, formatTimeLeft } from '../utils/date'
import { loadRazorpay, openCheckout } from '../utils/razorpay'

const statusStyles: Record<Payment['status'], string> = {
  paid: 'bg-green-100 text-green-700',
  created: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-700',
}

export default function Pricing() {
  const { user, setUser } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadPayments = () => paymentsApi.mine().then(setPayments).catch(() => undefined)

  useEffect(() => {
    paymentsApi.plans().then(setPlans).catch((err) => setError(errorMessage(err)))
    loadPayments()
  }, [])

  const buy = async (plan: Plan) => {
    setError('')
    setSuccess('')
    setBuying(plan.id)
    try {
      const [order] = await Promise.all([paymentsApi.createOrder(plan.id), loadRazorpay()])
      openCheckout(
        {
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'AI Study Planner',
          description: `${plan.name} plan: ${plan.days} days of AI access`,
          order_id: order.order_id,
          prefill: { name: user?.full_name, email: user?.email },
          theme: { color: '#4f46e5' },
          handler: async (response) => {
            try {
              setUser(await paymentsApi.verify(response))
              setSuccess(`Payment successful. ${plan.days} days of AI access added.`)
            } catch (err) {
              setError(errorMessage(err))
            } finally {
              setBuying(null)
              loadPayments()
            }
          },
          modal: { ondismiss: () => setBuying(null) },
        },
        (message) => {
          setError(`Payment failed: ${message}`)
          setBuying(null)
          loadPayments()
        },
      )
    } catch (err) {
      setError(errorMessage(err))
      setBuying(null)
    }
  }

  const accessUntil = user?.ai_access_until
  const hasAccess = !!accessUntil && new Date(accessUntil).getTime() > Date.now()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Plans and Billing</h2>
        <p className="text-sm text-slate-500">Recharge to keep using the AI study assistant and AI quizzes.</p>
      </div>

      <div className={`card ${hasAccess ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        {hasAccess ? (
          <p className="text-sm text-green-800">
            AI access active until <span className="font-semibold">{formatDateTime(accessUntil)}</span> (
            {formatTimeLeft(accessUntil!)} left). Buying a plan now adds days on top of that.
          </p>
        ) : (
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Your AI access has ended.</span> Choose a plan below to unlock AI chat and
            quizzes again.
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {success && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`card flex flex-col gap-3 ${plan.id === 'monthly' ? 'border-indigo-400 ring-2 ring-indigo-100' : ''}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.id === 'monthly' && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">Popular</span>
              )}
            </div>
            <p className="text-3xl font-bold">
              Rs {plan.amount}
              <span className="text-sm font-normal text-slate-500"> / {plan.days} days</span>
            </p>
            <p className="flex-1 text-sm text-slate-500">{plan.description}</p>
            <button className="btn" disabled={buying !== null} onClick={() => buy(plan)}>
              {buying === plan.id ? 'Opening checkout...' : `Buy ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        Payments run in Razorpay test mode. Use a Razorpay test card, for example 4111 1111 1111 1111 with any future
        expiry and any CVV; no real money is charged.
      </p>

      {payments.length > 0 && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Payment history</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="capitalize">{p.plan_id} plan</span>
                <span className="text-slate-500">{formatDateTime(p.paid_at ?? p.created_at)}</span>
                <span>Rs {p.amount}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[p.status]}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
