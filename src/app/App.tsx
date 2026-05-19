import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { PermissionProvider } from '@/core/permissions/PermissionProvider';
import { DEFAULT_PERMISSION_SCHEMA } from '@/core/permissions/schema';
import { useBootstrap } from './boot/useBootstrap';
import { router } from './router';
import { connectionManager } from '@/core/realtime/connectionManager';
import { streamWorkerClient } from '@/core/workers/StreamWorkerClient';
import { getAccessToken } from '@/core/api/tokens';
import { offlineStatusManager } from '@/core/offline/sync/status';
import { getOfflineRepos } from '@/core/offline/db/repos';

function BootstrappedApp() {
  const { user } = useAuth();
  const { data: schema } = useBootstrap(user?.id ?? null);

  // Initialize stream worker and connect realtime stream when the user authenticates
  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    streamWorkerClient.init();
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    connectionManager.connect(wsUrl, token);
    // Pre-warm the offline DB so it's ready before the first offline fallback
    void getOfflineRepos();
    return () => {
      connectionManager.disconnect();
      // Keep the worker alive across reconnects; terminate only on full logout
    };
  }, [user]);

  // Start offline status manager once on mount
  useEffect(() => {
    offlineStatusManager.start();
    return () => offlineStatusManager.stop();
  }, []);

  return (
    <PermissionProvider schema={schema ?? DEFAULT_PERMISSION_SCHEMA}>
      <RouterProvider router={router} />
    </PermissionProvider>
  );
}

export function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
      <AntApp>
        <QueryProvider>
          <AuthProvider>
            <BootstrappedApp />
          </AuthProvider>
        </QueryProvider>
      </AntApp>
    </ConfigProvider>
  );
}
