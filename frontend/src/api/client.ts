import axios, { AxiosError } from 'axios'

export const TOKEN_KEY = 'study_planner_token'
export const ACCESS_CHANGED_EVENT = 'study-planner:access-changed'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
    }
    const code = (error.response?.data as { detail?: { code?: string } } | undefined)?.detail?.code
    if (code === 'ai_access_expired' || code === 'feature_disabled') {
      window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT))
    }
    return Promise.reject(error)
  },
)

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message)
    return error.message
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
