import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '@/core/auth/AuthContext';

const LoginPage = lazy(() => import('@/features/patients/LoginPage'));
const PatientPage = lazy(() => import('@/features/patients/PatientPage'));
const AnalyticsPage = lazy(() => import('@/features/patients/AnalyticsPage'));

const Loader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" aria-label="Loading..." />
  </div>
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAuth();
  // Hold rendering until the silent token-refresh attempt settles.
  // Without this, the router redirects to /login mid-refresh, causing a flash.
  if (isBootstrapping) return <Loader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/patients" replace />,
  },
  {
    path: '/login',
    element: <Suspense fallback={<Loader />}><LoginPage /></Suspense>,
  },
  {
    path: '/patients',
    element: (
      <RequireAuth>
        <Suspense fallback={<Loader />}><PatientPage /></Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/analytics',
    element: (
      <RequireAuth>
        <Suspense fallback={<Loader />}><AnalyticsPage /></Suspense>
      </RequireAuth>
    ),
  },
]);
