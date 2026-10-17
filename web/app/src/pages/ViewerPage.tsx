import { useQuery } from '@tanstack/react-query';
import { Tv } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api } from '../lib/api';

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: channel,
    isLoading: channelLoading,
    error: channelError,
  } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => api.getChannel(id ?? ''),
    enabled: Boolean(id),
  });

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['channel-status', id],
    queryFn: () => api.getChannelStatus(id ?? ''),
    enabled: Boolean(id),
  });

  if (channelLoading || statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-400">
        <div className="text-sm">Loading channel...</div>
      </div>
    );
  }

  if (channelError || !channel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-neutral-100">Channel Not Found</h1>
        <p className="mt-2 text-sm text-neutral-400">
          The requested channel does not exist or could not be loaded.
        </p>
        <Link
          to="/"
          className="mt-4 rounded-md bg-[#0A84FF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          Back to Channels
        </Link>
      </div>
    );
  }

  const state = status?.state ?? 'offline';

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0B0E] text-[#F5F5F7]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Tv className="h-6 w-6 text-[#0A84FF]" />
          <div>
            <h1 className="text-lg font-semibold">{channel.name}</h1>
            <div className="text-xs text-neutral-400">Channel #{channel.number}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              state === 'playing' ? 'bg-[#30D158]' : 'bg-neutral-500'
            }`}
          />
          <span className="text-sm font-medium capitalize text-neutral-300">{state}</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-[#16161B] p-12 text-center shadow-2xl">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-[#0A84FF]">
            <Tv className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{channel.name}</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Playout State: <span className="font-semibold text-neutral-200">{state}</span>
          </p>
          {status?.item ? (
            <div className="mt-4 rounded-lg bg-black/40 p-4 text-xs text-neutral-300">
              Now Playing: <span className="font-medium text-white">{status.item.filename}</span>
            </div>
          ) : (
            <div className="mt-4 text-xs text-neutral-500">Idle stream / Standby</div>
          )}
          <div className="mt-6 text-xs text-neutral-500">
            HLS Video Player placeholder — active playout integration in Phase 4.
          </div>
        </div>
      </main>
    </div>
  );
}
