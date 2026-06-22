import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { LoginPage } from '@/features/auth/LoginPage'
import { LandingPage } from '@/features/marketing/LandingPage'
import { PricingPage } from '@/features/marketing/PricingPage'
import { AboutPage } from '@/features/marketing/AboutPage'
import { PrivacyPage } from '@/features/legal/PrivacyPage'
import { TermsPage } from '@/features/legal/TermsPage'
import { TodayPage } from '@/features/today/TodayPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage'
import { FocusPage } from '@/features/focus/FocusPage'
import { InsightsPage } from '@/features/insights/InsightsPage'
import { WellnessPage } from '@/features/wellness/WellnessPage'
import { BreathePage } from '@/features/wellness/breathwork/BreathePage'
import { SoundsPage } from '@/features/wellness/audio/SoundsPage'
import { MeditatePage } from '@/features/wellness/audio/MeditatePage'
import { TrackerPage } from '@/features/wellness/tracker/TrackerPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { PlanPage } from '@/features/settings/PlanPage'
import { FEATURES } from '@/lib/config'

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/welcome" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated app shell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<TodayPage />} />
          <Route path="today" element={<Navigate to="/" replace />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="focus" element={<FocusPage />} />
          <Route path="insights" element={<InsightsPage />} />
          {FEATURES.wellness && (
            <>
              <Route path="wellness" element={<WellnessPage />} />
              <Route path="wellness/breathe" element={<BreathePage />} />
              <Route path="wellness/sleep" element={<SoundsPage />} />
              <Route path="wellness/meditate" element={<MeditatePage />} />
              <Route path="wellness/tracker" element={<TrackerPage />} />
            </>
          )}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/plan" element={<PlanPage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
