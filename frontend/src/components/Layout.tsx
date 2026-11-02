import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AccessBanner from './AccessBanner'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'

const studentLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/planner', label: 'AI Planner' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/chat', label: 'Study Assistant' },
  { to: '/notes', label: 'Notes' },
  { to: '/quiz', label: 'Quizzes' },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/reminders', label: 'Reminders' },
  { to: '/pricing', label: 'Plans and Billing' },
]

const adminLinks = [
  { to: '/admin/students', label: 'Students' },
  { to: '/admin/activity', label: 'Activity Log' },
  { to: '/admin/payments', label: 'Payments' },
]

function NavItem({ to, label, onNavigate }: { to: string; label: string; onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm font-medium ${
          isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="flex min-h-screen">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={closeMenu} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-surface transition-transform md:sticky md:top-0 md:h-screen md:w-60 md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-indigo-600">AI Study Planner</h1>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name}
              {user?.role === 'admin' && <span className="ml-1 rounded bg-indigo-100 px-1 text-indigo-700">admin</span>}
            </p>
          </div>
          <button className="p-1 text-slate-400 md:hidden" onClick={closeMenu} aria-label="Close menu">
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {user?.role === 'admin' && (
            <>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Admin</p>
              {adminLinks.map((link) => (
                <NavItem key={link.to} {...link} onNavigate={closeMenu} />
              ))}
              <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Study</p>
            </>
          )}
          {studentLinks
            .filter((link) => user?.role !== 'admin' || link.to !== '/pricing')
            .map((link) => (
              <NavItem key={link.to} {...link} onNavigate={closeMenu} />
            ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button className="btn-secondary w-full" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-surface px-4 md:justify-end md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <button className="btn-secondary px-3" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              ☰
            </button>
            <span className="font-bold text-indigo-600">AI Study Planner</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <AccessBanner />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
