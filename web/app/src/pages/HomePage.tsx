import { useQuery } from '@tanstack/react-query';
import { Tv } from 'lucide-react';
import { Navigate } from 'react-router';
import { api } from '../lib/api';

export function HomePage() {
  const {
    data: channels,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['channels'],
    queryFn: api.getChannels,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 text-fg-muted">
        <div className="text-sm">Loading channels...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 text-danger">
        <div className="text-sm">Failed to load channels: {error.message}</div>
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-0 p-6 text-center text-fg">
        <Tv className="mb-4 h-12 w-12 text-fg-subtle" />
        <h1 className="text-xl font-semibold text-fg">No Channels Available</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Create channels in the admin panel to start broadcasting.
        </p>
      </div>
    );
  }

  const sortedChannels = [...channels].sort((a, b) => a.number - b.number);
  return <Navigate to={`/watch/${sortedChannels[0].id}`} replace />;
}
