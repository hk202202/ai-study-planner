export type SessionStatus = 'pending' | 'done' | 'skipped'

export type AccessStatus = 'allowed' | 'disabled' | 'expired'

export type GatedFeature = 'chat' | 'quiz'

export interface User {
  id: number
  email: string
  full_name: string
  role: 'student' | 'admin'
  is_active: boolean
  chat_enabled: boolean
  quiz_enabled: boolean
  ai_access_until: string | null
  chat_access: AccessStatus
  quiz_access: AccessStatus
}

export interface Plan {
  id: string
  name: string
  days: number
  amount: number
  description: string
}

export interface RazorpayOrder {
  order_id: string
  amount: number
  currency: string
  key_id: string
  plan: Plan
}

export interface Payment {
  id: number
  plan_id: string
  amount: number
  currency: string
  status: 'created' | 'paid' | 'failed'
  created_at: string
  paid_at: string | null
}

export interface Student {
  id: number
  email: string
  full_name: string
  role: 'student' | 'admin'
  is_active: boolean
  chat_enabled: boolean
  quiz_enabled: boolean
  chat_access: AccessStatus
  quiz_access: AccessStatus
  ai_access_until: string | null
  last_login_at: string | null
  created_at: string
  subjects_count: number
  sessions_done: number
  sessions_total: number
  ai_requests: number
  total_paid: number
}

export type StudentUpdate = Partial<{
  is_active: boolean
  chat_enabled: boolean
  quiz_enabled: boolean
  role: 'student' | 'admin'
  extend_days: number
  revoke_access: boolean
}>

export interface ActivityItem {
  id: number
  user_id: number | null
  user_email: string | null
  user_name: string | null
  action: string
  detail: string
  ip: string
  created_at: string
}

export interface AdminStats {
  students_total: number
  students_active: number
  logins_24h: number
  ai_requests_24h: number
  students_with_ai_access: number
  paid_students: number
  revenue: number
}

export interface AdminPayment {
  id: number
  user_email: string
  user_name: string
  plan_id: string
  amount: number
  currency: string
  status: Payment['status']
  razorpay_order_id: string
  razorpay_payment_id: string | null
  created_at: string
  paid_at: string | null
}

export interface Subject {
  id: number
  user_id: number
  name: string
  exam_date: string | null
  difficulty: number
  priority: number
  topics: string[]
}

export type SubjectInput = Omit<Subject, 'id' | 'user_id'>

export interface StudySession {
  id: number
  plan_id: number
  subject_id: number
  scheduled_date: string
  start_time: string
  duration_minutes: number
  topic: string
  goal: string
  status: SessionStatus
  subject_name: string | null
  focused_minutes: number
}

export interface StudyPlan {
  id: number
  hours_per_day: number
  available_days: string[]
  start_date: string
  created_at: string
  sessions: StudySession[]
}

export interface ProgressSubject {
  subject_id: number
  subject_name: string
  total_sessions: number
  completed_sessions: number
  completion_percent: number
}

export interface Progress {
  subjects: ProgressSubject[]
  current_streak: number
  total_sessions: number
  completed_sessions: number
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface QuizQuestion {
  question: string
  options: string[]
  correct_index: number
}

export interface Quiz {
  id: number
  subject_name: string
  topic: string
  questions: QuizQuestion[]
  score: number | null
  created_at: string
}

export interface QuizResult {
  score: number
  total: number
  percent: number
}

export type FlashcardRating = 'again' | 'good' | 'easy'

export interface Flashcard {
  id: number
  subject_name: string
  topic: string
  front: string
  back: string
  due_at: string | null
  interval_days: number
  repetitions: number
  next_review: Record<FlashcardRating, string>
}

export interface Reminder {
  id: number
  title: string
  message: string
  due_at: string
  is_due: boolean
  is_read: boolean
  session_id: number | null
}

export interface NoteListItem {
  id: number
  title: string
  subject_name: string
  filename: string
  characters: number
  has_summary: boolean
  created_at: string
}

export interface Note extends NoteListItem {
  content: string
  summary: string | null
}

export interface WeakTopic {
  subject_name: string
  topic: string
  attempts: number
  average_percent: number
  last_percent: number
  last_taken: string
  revision_scheduled: boolean
}

export interface FocusResult {
  minutes_logged: number
  session: StudySession | null
}

export interface DayStat {
  date: string
  minutes: number
  sessions_done: number
}

export interface Analytics {
  total_minutes: number
  week_minutes: number
  week_sessions_done: number
  focus_sessions: number
  active_days: number
  quizzes_taken: number
  average_quiz_percent: number | null
  cards_reviewed: number
  cards_due: number
  weekly: { week_start: string; minutes: number; sessions_done: number }[]
  heatmap: DayStat[]
  subjects: { subject_name: string; minutes: number }[]
}
