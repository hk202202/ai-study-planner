import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import FeatureGate from './components/FeatureGate'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AdminActivity from './pages/admin/Activity'
import AdminPayments from './pages/admin/Payments'
import AdminStudents from './pages/admin/Students'
import Analytics from './pages/Analytics'
import CalendarPage from './pages/CalendarPage'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import Flashcards from './pages/Flashcards'
import Login from './pages/Login'
import Notes from './pages/Notes'
import Planner from './pages/Planner'
import Pricing from './pages/Pricing'
import QuizPage from './pages/QuizPage'
import Register from './pages/Register'
import Reminders from './pages/Reminders'
import Subjects from './pages/Subjects'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route
                path="/chat"
                element={
                  <FeatureGate feature="chat">
                    <Chat />
                  </FeatureGate>
                }
              />
              <Route
                path="/quiz"
                element={
                  <FeatureGate feature="quiz">
                    <QuizPage />
                  </FeatureGate>
                }
              />
              <Route path="/flashcards" element={<Flashcards />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reminders" element={<Reminders />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin/students" element={<AdminStudents />} />
                <Route path="/admin/activity" element={<AdminActivity />} />
                <Route path="/admin/payments" element={<AdminPayments />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
