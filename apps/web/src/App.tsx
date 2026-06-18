import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import UsersPage from './pages/users/UsersPage';
import InviteUserPage from './pages/users/InviteUserPage';
import RolesPage from './pages/roles/RolesPage';
import WorkflowPage from './pages/workflow/WorkflowPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import AuditPage from './pages/audit/AuditPage';
import GeneralSettingsPage from './pages/settings/GeneralSettingsPage';
import ModulesSettingsPage from './pages/settings/ModulesSettingsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/invite" element={<InviteUserPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="workflows" element={<WorkflowPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings/general" element={<GeneralSettingsPage />} />
        <Route path="settings/modules" element={<ModulesSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
