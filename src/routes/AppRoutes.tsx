import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { FEATURES } from '@/lib/config'

/**
 * Route-level code splitting. Every page (and the whole authenticated AppShell)
 * is lazy-loaded so the marketing landing pulls only its own chunk + shared
 * vendors — never the entire app. Vite emits one chunk per import(); a failed
 * chunk fetch after a redeploy is caught by installChunkReloadRecovery
 * (vite:preloadError → one hard reload). Named exports are adapted to the
 * default export React.lazy expects.
 */
// Public / marketing / auth
const LandingPage = lazy(() => import('@/features/marketing/LandingPage').then((m) => ({ default: m.LandingPage })))
const PricingPage = lazy(() => import('@/features/marketing/PricingPage').then((m) => ({ default: m.PricingPage })))
const AboutPage = lazy(() => import('@/features/marketing/AboutPage').then((m) => ({ default: m.AboutPage })))
const PrivacyPage = lazy(() => import('@/features/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('@/features/legal/TermsPage').then((m) => ({ default: m.TermsPage })))
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)

// Authenticated shell + pages
const AppShell = lazy(() => import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })))
const TodayPage = lazy(() => import('@/features/today/TodayPage').then((m) => ({ default: m.TodayPage })))
const InboxPage = lazy(() => import('@/features/inbox/InboxPage').then((m) => ({ default: m.InboxPage })))
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
)
const FocusPage = lazy(() => import('@/features/focus/FocusPage').then((m) => ({ default: m.FocusPage })))
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))
const WellnessPage = lazy(() => import('@/features/wellness/WellnessPage').then((m) => ({ default: m.WellnessPage })))
const BreathePage = lazy(() => import('@/features/wellness/breathwork/BreathePage').then((m) => ({ default: m.BreathePage })))
const SoundsPage = lazy(() => import('@/features/wellness/audio/SoundsPage').then((m) => ({ default: m.SoundsPage })))
const MeditatePage = lazy(() => import('@/features/wellness/audio/MeditatePage').then((m) => ({ default: m.MeditatePage })))
const TrackerPage = lazy(() => import('@/features/wellness/tracker/TrackerPage').then((m) => ({ default: m.TrackerPage })))
const TemplatesPage = lazy(() => import('@/features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })))
const TemplateDetailPage = lazy(() =>
  import('@/features/templates/TemplateDetailPage').then((m) => ({ default: m.TemplateDetailPage })),
)
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const PlanPage = lazy(() => import('@/features/settings/PlanPage').then((m) => ({ default: m.PlanPage })))

export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
            {FEATURES.templates && (
              <>
                <Route path="templates" element={<TemplatesPage />} />
                <Route path="templates/:templateId" element={<TemplateDetailPage />} />
              </>
            )}
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/plan" element={<PlanPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
