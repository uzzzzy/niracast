import type React from 'react';
import { Toaster } from 'sonner';
import { AdminEventsProvider } from '../hooks/useAdminEvents';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';
import { AmbientBackground } from './AmbientBackground';
import { MotionProvider } from './MotionProvider';

interface AdminShellProps {
  onLogout: () => void;
  isLoggingOut?: boolean;
  firstChannelId?: number;
  children: React.ReactNode;
}

export function AdminShell({
  onLogout,
  isLoggingOut = false,
  firstChannelId = 1,
  children,
}: AdminShellProps) {
  return (
    <AdminEventsProvider>
      <MotionProvider>
        <div className="relative flex h-[100dvh] w-full max-w-[100vw] overflow-hidden text-fg font-sans antialiased flex-col md:flex-row">
          <AmbientBackground />
          <AdminSidebar
            firstChannelId={firstChannelId}
            onLogout={onLogout}
            isLoggingOut={isLoggingOut}
          />
          <div className="relative z-10 flex flex-1 flex-col overflow-hidden min-w-0">
            <AdminTopBar onLogout={onLogout} isLoggingOut={isLoggingOut} />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 min-w-0">
              {children}
            </main>
          </div>
          <Toaster
            position="bottom-right"
            richColors
            toastOptions={{
              className: 'glass-thick text-fg border-hairline',
              style: {
                background: 'var(--mat-thick)',
                border: '1px solid var(--hairline)',
                color: 'var(--fg)',
                borderRadius: 'var(--radius-card, 1.25rem)',
              },
            }}
          />
        </div>
      </MotionProvider>
    </AdminEventsProvider>
  );
}
