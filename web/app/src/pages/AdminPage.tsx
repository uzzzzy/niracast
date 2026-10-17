import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AdminShell } from '../features/admin/components/AdminShell';
import { LoginCard } from '../features/admin/components/LoginCard';
import { ChannelsPage } from '../features/admin/pages/ChannelsPage';
import { MediaPage } from '../features/admin/pages/MediaPage';
import { OverviewPage } from '../features/admin/pages/OverviewPage';
import { PlaylistEditorPage } from '../features/admin/pages/PlaylistEditorPage';
import { SystemPage } from '../features/admin/pages/SystemPage';
import { api, onUnauthorized } from '../lib/api';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const {
    data: auth,
    isLoading: isAuthLoading,
    refetch: refetchAuth,
  } = useQuery({
    queryKey: ['auth-me'],
    queryFn: api.getAuthMe,
    retry: false,
  });

  const { data: channels } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: api.getChannels,
    enabled: isAuthenticated === true,
  });

  useEffect(() => {
    if (auth) {
      setIsAuthenticated(auth.authenticated);
    }
  }, [auth]);

  // Listen for 401 unauthorized notifications from apiFetch
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setIsAuthenticated(false);
      setSessionExpired(true);
      queryClient.setQueryData(['auth-me'], { authenticated: false, csrf: '' });
    });
    return unsubscribe;
  }, [queryClient]);

  const handleLoginSuccess = async () => {
    setSessionExpired(false);
    setIsAuthenticated(true);
    await refetchAuth();
    queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    queryClient.invalidateQueries({ queryKey: ['system-info'] });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setIsLoggingOut(false);
      setIsAuthenticated(false);
      setSessionExpired(false);
      queryClient.setQueryData(['auth-me'], { authenticated: false, csrf: '' });
      queryClient.clear();
    }
  };

  if (isAuthLoading || isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0E] text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin text-[#0A84FF]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginCard onSuccess={handleLoginSuccess} sessionExpired={sessionExpired} />;
  }

  const firstChannelId = channels?.[0]?.id ?? 1;

  return (
    <AdminShell onLogout={handleLogout} isLoggingOut={isLoggingOut} firstChannelId={firstChannelId}>
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="channels/:id" element={<PlaylistEditorPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </AdminShell>
  );
}
