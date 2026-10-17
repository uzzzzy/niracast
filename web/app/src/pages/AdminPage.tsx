import { useQuery } from '@tanstack/react-query';
import { Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../lib/api';

export default function AdminPage() {
  const {
    data: auth,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['auth-me'],
    queryFn: api.getAuthMe,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-400">
        <div className="text-sm">Checking admin authorization...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-red-500" />
        <h1 className="text-xl font-semibold text-neutral-100">Auth Check Failed</h1>
        <p className="mt-2 text-sm text-neutral-400">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0B0E] text-[#F5F5F7]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-[#0A84FF]" />
          <h1 className="text-lg font-semibold">CMS Studio Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          {auth?.authenticated ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-950 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-800/50">
              <ShieldCheck className="h-3.5 w-3.5" /> Authenticated
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-950 px-3 py-1 text-xs font-medium text-amber-400 border border-amber-800/50">
              <ShieldAlert className="h-3.5 w-3.5" /> Unauthenticated
            </span>
          )}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#16161B] p-8 text-center shadow-2xl">
          <h2 className="text-xl font-bold tracking-tight">Admin Shell Placeholder</h2>
          <p className="mt-2 text-sm text-neutral-400">
            {auth?.authenticated
              ? 'Operator session active. Playout control, schedule planner, and media library will be introduced in Phase 5.'
              : 'Sign in through the operator login modal to access administrative tools.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/"
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Go to Viewer
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
