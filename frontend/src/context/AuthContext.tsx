import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ACCESS_CHANGED_EVENT, TOKEN_KEY } from '../api/client'
import { authApi } from '../api/endpoints'
import type { User } from '../api/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, fullName: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    setUser(await authApi.me())
  }, [])

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onAccessChanged = () => {
      refreshUser().catch(() => undefined)
    }
    window.addEventListener(ACCESS_CHANGED_EVENT, onAccessChanged)
    return () => window.removeEventListener(ACCESS_CHANGED_EVENT, onAccessChanged)
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await authApi.login(email, password)
    localStorage.setItem(TOKEN_KEY, access_token)
    setUser(await authApi.me())
  }, [])

  const register = useCallback(
    async (email: string, fullName: string, password: string) => {
      await authApi.register(email, fullName, password)
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(() => {
    authApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
      })
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
