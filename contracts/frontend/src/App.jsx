import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import ToastHost from './components/ToastHost'
import SessionExpiry from './components/SessionExpiry'
import { useAuth } from './auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

// Route-level code splitting: the heavier pages (TipTap authoring, reports, etc.)
// load on demand so the initial bundle stays small. Login + Dashboard stay eager.
const IngestionLog = lazy(() => import('./pages/IngestionLog'))
const ValidationQueue = lazy(() => import('./pages/ValidationQueue'))
const ValidationScreen = lazy(() => import('./pages/ValidationScreen'))
const DuplicateReview = lazy(() => import('./pages/DuplicateReview'))
const Vendors = lazy(() => import('./pages/Vendors'))
const VendorHistory = lazy(() => import('./pages/VendorHistory'))
const Contracts = lazy(() => import('./pages/Contracts'))
const ManualContract = lazy(() => import('./pages/ManualContract'))
const Import = lazy(() => import('./pages/Import'))
const ContractDetail = lazy(() => import('./pages/ContractDetail'))
const NewContract = lazy(() => import('./pages/authoring/NewContract'))
const AuthoringWorkspace = lazy(() => import('./pages/authoring/AuthoringWorkspace'))
const TemplateLibrary = lazy(() => import('./pages/authoring/TemplateLibrary'))
const ClauseLibrary = lazy(() => import('./pages/authoring/ClauseLibrary'))
const RedlineInbox = lazy(() => import('./pages/authoring/RedlineInbox'))
const RedlineReview = lazy(() => import('./pages/authoring/RedlineReview'))
const SignatureTracking = lazy(() => import('./pages/authoring/SignatureTracking'))
const VendorPortal = lazy(() => import('./pages/VendorPortal'))
const ContractAction = lazy(() => import('./pages/ContractAction'))
const ApprovalAction = lazy(() => import('./pages/ApprovalAction'))
const DraftingQueue = lazy(() => import('./pages/authoring/DraftingQueue'))
const Reviews = lazy(() => import('./pages/Reviews'))
const ContractRequests = lazy(() => import('./pages/ContractRequests'))
const Tasks = lazy(() => import('./pages/Tasks'))
const ReviewEdit = lazy(() => import('./pages/authoring/ReviewEdit'))
const Rules = lazy(() => import('./pages/Rules'))
const Reports = lazy(() => import('./pages/Reports'))
const RepositoryAI = lazy(() => import('./pages/RepositoryAI'))
const Obligations = lazy(() => import('./pages/Obligations'))
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'))
const AiGovernance = lazy(() => import('./pages/AiGovernance'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Audit = lazy(() => import('./pages/Audit'))
const Retention = lazy(() => import('./pages/Retention'))
const SettingsPage = lazy(() => import('./pages/Settings'))

const Loading = () => <div style={{ padding: 24 }} className="hint">Loading…</div>

export default function App() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  // A tokenized vendor link is a sealed, standalone view — NEVER wrapped in the
  // app Layout (no sidebar/navigation), and no other route is reachable from it.
  // This holds whether or not someone is signed in, so the vendor can only ever
  // see the single document they were sent.
  if (pathname.startsWith('/vendor/') || pathname.startsWith('/contract-action/')
      || pathname.startsWith('/approve/')) {
    return (
      <><ToastHost />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/vendor/:token" element={<VendorPortal />} />
          <Route path="/contract-action/:token" element={<ContractAction />} />
          <Route path="/approve/:token" element={<ApprovalAction />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense></>
    )
  }

  if (!user) {
    return (
      <><ToastHost />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense></>
    )
  }
  return (
    <Layout>
      <ToastHost />
      <SessionExpiry />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ingestion" element={<IngestionLog />} />
          <Route path="/validation" element={<ValidationQueue />} />
          <Route path="/validation/:srNo" element={<ValidationScreen />} />
          <Route path="/duplicates" element={<DuplicateReview />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:vendorId" element={<VendorHistory />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/contracts/import" element={<Import />} />
          <Route path="/contracts/new" element={<ManualContract />} />
          <Route path="/authoring/new" element={<NewContract />} />
          <Route path="/authoring/drafts" element={<DraftingQueue />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/requests" element={<ContractRequests />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/authoring/drafts/:id/review-edit" element={<ReviewEdit />} />
          <Route path="/authoring/templates" element={<TemplateLibrary />} />
          <Route path="/authoring/clauses" element={<ClauseLibrary />} />
          <Route path="/authoring/inbox" element={<RedlineInbox />} />
          <Route path="/authoring/signatures" element={<SignatureTracking />} />
          <Route path="/authoring/drafts/:id/redline" element={<RedlineReview />} />
          <Route path="/authoring/drafts/:id" element={<AuthoringWorkspace />} />
          <Route path="/contracts/:srNo" element={<ContractDetail />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/repository-ai" element={<RepositoryAI />} />
          <Route path="/obligations" element={<Obligations />} />
          <Route path="/report-builder" element={<ReportBuilder />} />
          <Route path="/ai-governance" element={<AiGovernance />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/retention" element={<Retention />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
