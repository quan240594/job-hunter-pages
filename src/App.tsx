import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { DataApi } from './api';
import { AuthProvider } from './auth/AuthProvider';
import { CHANGE_PASSWORD_PATH, HOME_PATH, LOGIN_PATH, RouteGuard } from './auth/RouteGuard';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { AppliedPage } from './pages/AppliedPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FoundPage } from './pages/FoundPage';
import { Layout } from './pages/Layout';
import { LoginPage } from './pages/LoginPage';
import { NewPage } from './pages/NewPage';
import { ProfilePage } from './pages/ProfilePage';

/** Route table. Rendered inside a router (HashRouter in the app, MemoryRouter in tests). */
export function AppRoutes() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route
        path={CHANGE_PASSWORD_PATH}
        element={
          <RouteGuard>
            <ChangePasswordPage />
          </RouteGuard>
        }
      />
      <Route
        element={
          <RouteGuard>
            <Layout />
          </RouteGuard>
        }
      >
        <Route path="/new" element={<NewPage />} />
        <Route path="/found" element={<FoundPage />} />
        <Route path="/applied" element={<AppliedPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route
          path="/admin"
          element={
            <RouteGuard requireAdmin>
              <AdminPage />
            </RouteGuard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
    </Routes>
  );
}

/** HashRouter keeps GitHub Pages free of a 404.html fallback: the route lives after the # of the URL. */
export function App({ api }: Readonly<{ api: DataApi }>) {
  return (
    <HashRouter>
      <AuthProvider api={api}>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
