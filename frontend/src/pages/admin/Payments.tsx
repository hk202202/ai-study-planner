import { useEffect, useState } from 'react'
import { errorMessage } from '../../api/client'
import { adminApi } from '../../api/endpoints'
import type { AdminPayment } from '../../api/types'
import { formatDateTime } from '../../utils/date'

const statusStyles: Record<AdminPayment['status'], string> = {
  paid: 'bg-green-100 text-green-700',
  created: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-700',
}

export default function Payments() {
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.payments().then(setPayments).catch((err) => setError(errorMessage(err)))
  }, [])

  const revenue = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Payments</h2>
        <p className="text-sm text-slate-500">
          Razorpay orders from students. "created" means checkout was opened but not completed.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="card w-fit">
        <p className="text-sm text-slate-500">Total collected</p>
        <p className="text-2xl font-bold">Rs {revenue}</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Razorpay IDs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                  {formatDateTime(p.paid_at ?? p.created_at)}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium">{p.user_name}</p>
                  <p className="text-xs text-slate-500">{p.user_email}</p>
                </td>
                <td className="px-4 py-2 capitalize">{p.plan_id}</td>
                <td className="px-4 py-2">Rs {p.amount}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[p.status]}`}>{p.status}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  <p>{p.razorpay_order_id}</p>
                  {p.razorpay_payment_id && <p>{p.razorpay_payment_id}</p>}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
