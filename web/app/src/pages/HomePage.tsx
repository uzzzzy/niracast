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
      <div className="flex min-h-screen items-center justify-center text-neutral-400">
        <div className="text-sm">Loading channels...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">
        <div className="text-sm">Failed to load channels: {error.message}</div>
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <Tv className="mb-4 h-12 w-12 text-neutral-600" />
        <h1 className="text-xl font-semibold text-neutral-100">No Channels Available</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Create channels in the admin panel to start broadcasting.
        </p>
      </div>
    );
  }

  return <Navigate to={`/watch/${channels[0].id}`} replace />;
}
