import { api } from './client'
import type {
  ActivityItem,
  AdminPayment,
  AdminStats,
  Analytics,
  ChatMessage,
  Flashcard,
  FlashcardRating,
  FocusResult,
  Note,
  NoteListItem,
  Payment,
  Plan,
  Progress,
  RazorpayOrder,
  Student,
  StudentUpdate,
  Quiz,
  QuizResult,
  Reminder,
  SessionStatus,
  StudyPlan,
  StudySession,
  Subject,
  SubjectInput,
  User,
  WeakTopic,
} from './types'

export const authApi = {
  register: (email: string, full_name: string, password: string) =>
    api.post<User>('/auth/register', { email, full_name, password }).then((r) => r.data),
  login: (email: string, password: string) =>
    api.post<{ access_token: string }>('/auth/login/json', { email, password }).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout'),
}

export const paymentsApi = {
  plans: () => api.get<Plan[]>('/payments/plans').then((r) => r.data),
  createOrder: (plan_id: string) => api.post<RazorpayOrder>('/payments/order', { plan_id }).then((r) => r.data),
  verify: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post<User>('/payments/verify', data).then((r) => r.data),
  mine: () => api.get<Payment[]>('/payments/mine').then((r) => r.data),
}

export const adminApi = {
  stats: () => api.get<AdminStats>('/admin/stats').then((r) => r.data),
  students: (search = '') => api.get<Student[]>('/admin/students', { params: { search } }).then((r) => r.data),
  updateStudent: (id: number, data: StudentUpdate) =>
    api.patch<Student>(`/admin/students/${id}`, data).then((r) => r.data),
  activity: (params: { user_id?: number; action?: string; limit?: number; offset?: number }) =>
    api.get<{ items: ActivityItem[]; total: number }>('/admin/activity', { params }).then((r) => r.data),
  payments: () => api.get<AdminPayment[]>('/admin/payments').then((r) => r.data),
}

export const subjectsApi = {
  list: () => api.get<Subject[]>('/subjects').then((r) => r.data),
  create: (data: SubjectInput) => api.post<Subject>('/subjects', data).then((r) => r.data),
  update: (id: number, data: Partial<SubjectInput>) =>
    api.patch<Subject>(`/subjects/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/subjects/${id}`),
}

export const plansApi = {
  latest: () => api.get<StudyPlan | null>('/plans/latest').then((r) => r.data),
  generate: (hours_per_day: number, available_days: string[], start_date: string) =>
    api
      .post<StudyPlan>('/plans/generate', { hours_per_day, available_days, start_date })
      .then((r) => r.data),
  progress: () => api.get<Progress>('/plans/progress').then((r) => r.data),
}

export const sessionsApi = {
  list: () => api.get<StudySession[]>('/sessions').then((r) => r.data),
  update: (
    id: number,
    data: Partial<{ scheduled_date: string; start_time: string; duration_minutes: number; status: SessionStatus }>,
  ) => api.patch<StudySession>(`/sessions/${id}`, data).then((r) => r.data),
}

export const chatApi = {
  history: () => api.get<ChatMessage[]>('/chat/history').then((r) => r.data),
}

export const quizApi = {
  list: () => api.get<Quiz[]>('/quiz').then((r) => r.data),
  generate: (subject_name: string, topic: string, num_questions: number) =>
    api.post<Quiz>('/quiz/generate', { subject_name, topic, num_questions }).then((r) => r.data),
  submit: (id: number, answers: number[]) =>
    api.post<QuizResult>(`/quiz/${id}/submit`, { answers }).then((r) => r.data),
  generateFlashcards: (subject_name: string, topic: string, count: number) =>
    api.post<Flashcard[]>('/quiz/flashcards/generate', { subject_name, topic, count }).then((r) => r.data),
  listFlashcards: () => api.get<Flashcard[]>('/quiz/flashcards/list').then((r) => r.data),
  dueFlashcards: () => api.get<Flashcard[]>('/quiz/flashcards/due').then((r) => r.data),
  reviewFlashcard: (id: number, rating: FlashcardRating) =>
    api.post<Flashcard>(`/quiz/flashcards/${id}/review`, { rating }).then((r) => r.data),
  get: (id: number) => api.get<Quiz>(`/quiz/${id}`).then((r) => r.data),
}

export const notesApi = {
  list: () => api.get<NoteListItem[]>('/notes').then((r) => r.data),
  get: (id: number) => api.get<Note>(`/notes/${id}`).then((r) => r.data),
  upload: (data: { file?: File; text?: string; title: string; subject_name: string }) => {
    const form = new FormData()
    if (data.file) form.append('file', data.file)
    if (data.text) form.append('text', data.text)
    form.append('title', data.title)
    form.append('subject_name', data.subject_name)
    return api.post<Note>('/notes', form).then((r) => r.data)
  },
  remove: (id: number) => api.delete(`/notes/${id}`),
  summarize: (id: number) => api.post<Note>(`/notes/${id}/summary`).then((r) => r.data),
  quiz: (id: number, num_questions: number) =>
    api.post<Quiz>(`/notes/${id}/quiz`, { num_questions }).then((r) => r.data),
  flashcards: (id: number, count: number) =>
    api.post<Flashcard[]>(`/notes/${id}/flashcards`, { count }).then((r) => r.data),
}

export const insightsApi = {
  weakTopics: () => api.get<WeakTopic[]>('/insights/weak-topics').then((r) => r.data),
  addRevision: (subject_name: string, topic: string) =>
    api.post<StudySession>('/insights/revision', { subject_name, topic }).then((r) => r.data),
  analytics: () => api.get<Analytics>('/insights/analytics').then((r) => r.data),
}

export const focusApi = {
  log: (minutes: number, session_id?: number, mark_done = false) =>
    api.post<FocusResult>('/focus', { minutes, session_id, mark_done }).then((r) => r.data),
}

export const remindersApi = {
  list: () => api.get<Reminder[]>('/reminders').then((r) => r.data),
  notifications: () => api.get<Reminder[]>('/reminders/notifications').then((r) => r.data),
  create: (title: string, message: string, due_at: string) =>
    api.post<Reminder>('/reminders', { title, message, due_at }).then((r) => r.data),
  markRead: (id: number) => api.post<Reminder>(`/reminders/${id}/read`).then((r) => r.data),
}
