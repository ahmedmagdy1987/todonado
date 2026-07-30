import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { FEATURES } from '@/lib/config'
import { usePrefs } from '@/features/settings/prefs'

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
const WeekPage = lazy(() => import('@/features/week/WeekPage').then((m) => ({ default: m.WeekPage })))
const InboxPage = lazy(() => import('@/features/inbox/InboxPage').then((m) => ({ default: m.InboxPage })))
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
)
const FocusPage = lazy(() => import('@/features/focus/FocusPage').then((m) => ({ default: m.FocusPage })))
const WorkPage = lazy(() => import('@/features/work/WorkPage').then((m) => ({ default: m.WorkPage })))
const VisionPage = lazy(() => import('@/features/vision/VisionPage').then((m) => ({ default: m.VisionPage })))
const MindMapsPage = lazy(() => import('@/features/mindmaps/MindMapsPage').then((m) => ({ default: m.MindMapsPage })))
// Its own chunk, separate from the list: the canvas, the pointer handling and
// the node dialog are only needed once a map is actually open.
const MindMapEditorPage = lazy(() =>
  import('@/features/mindmaps/MindMapEditorPage').then((m) => ({ default: m.MindMapEditorPage })),
)
const JournalPage = lazy(() =>
  import('@/features/journal/JournalPage').then((m) => ({ default: m.JournalPage })),
)
const ChallengesPage = lazy(() =>
  import('@/features/challenges/ChallengesPage').then((m) => ({ default: m.ChallengesPage })),
)
const HubPage = lazy(() => import('@/features/hub/HubPage').then((m) => ({ default: m.HubPage })))
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))
const WellnessPage = lazy(() => import('@/features/wellness/WellnessPage').then((m) => ({ default: m.WellnessPage })))
const BreathePage = lazy(() => import('@/features/wellness/breathwork/BreathePage').then((m) => ({ default: m.BreathePage })))
const SoundsPage = lazy(() => import('@/features/wellness/audio/SoundsPage').then((m) => ({ default: m.SoundsPage })))
const MeditatePage = lazy(() => import('@/features/wellness/audio/MeditatePage').then((m) => ({ default: m.MeditatePage })))
const TrackerPage = lazy(() => import('@/features/wellness/tracker/TrackerPage').then((m) => ({ default: m.TrackerPage })))
const QuitPage = lazy(() => import('@/features/wellness/quit/QuitPage').then((m) => ({ default: m.QuitPage })))
const TemplatesPage = lazy(() => import('@/features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })))
const TemplateDetailPage = lazy(() =>
  import('@/features/templates/TemplateDetailPage').then((m) => ({ default: m.TemplateDetailPage })),
)
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const PlanPage = lazy(() => import('@/features/settings/PlanPage').then((m) => ({ default: m.PlanPage })))

/**
 * `/` means "wherever this device starts", and nothing more.
 *
 * It ALWAYS redirects — to /today by default, or to /hub when that preference is
 * set. Today therefore has a URL of its own that always means Today.
 *
 * That is not a detail. When `/` rendered Today directly and only redirected for
 * hub users, every control pointing at `/` — the Today nav item, the Hub's own
 * "Today" and "Build my day" tiles, the Week header's Today button — silently
 * bounced a hub user back to the Hub, making Today unreachable entirely. One
 * canonical path per screen is what stops that whole class of bug.
 *
 * TODAY IS STILL THE DEFAULT: only an explicit Settings choice changes where the
 * app opens, and the first-run flow that is known to work is untouched.
 */
function HomeScreen() {
  const { startOn } = usePrefs()
  return <Navigate to={FEATURES.hub && startOn === 'hub' ? '/hub' : '/today'} replace />
}

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
            <Route index element={<HomeScreen />} />
            <Route path="today" element={<TodayPage />} />
            {FEATURES.week && <Route path="week" element={<WeekPage />} />}
            <Route path="inbox" element={<InboxPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="focus" element={<FocusPage />} />
            {FEATURES.getToWork && <Route path="work" element={<WorkPage />} />}
            {FEATURES.vision && <Route path="vision" element={<VisionPage />} />}
            {FEATURES.vision && FEATURES.mindMaps && (
              <>
                <Route path="vision/maps" element={<MindMapsPage />} />
                <Route path="vision/maps/:mapId" element={<MindMapEditorPage />} />
              </>
            )}
            {FEATURES.journal && <Route path="journal" element={<JournalPage />} />}
            {FEATURES.challenges && <Route path="challenges" element={<ChallengesPage />} />}
            {FEATURES.hub && <Route path="hub" element={<HubPage />} />}
            <Route path="insights" element={<InsightsPage />} />
            {FEATURES.wellness && (
              <>
                <Route path="wellness" element={<WellnessPage />} />
                <Route path="wellness/breathe" element={<BreathePage />} />
                <Route path="wellness/sleep" element={<SoundsPage />} />
                <Route path="wellness/meditate" element={<MeditatePage />} />
                <Route path="wellness/tracker" element={<TrackerPage />} />
                {FEATURES.quitTracker && <Route path="wellness/quit" element={<QuitPage />} />}
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
