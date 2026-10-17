import type React from 'react';
import { Toaster } from 'sonner';
import { AdminEventsProvider } from '../hooks/useAdminEvents';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';
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
        <div className="flex h-screen w-screen overflow-hidden bg-[#0B0B0E] text-[#F5F5F7] font-sans antialiased">
          <AdminSidebar firstChannelId={firstChannelId} />
          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            <AdminTopBar onLogout={onLogout} isLoggingOut={isLoggingOut} />
            <main className="flex-1 overflow-y-auto p-6 lg:p-8 min-w-0">{children}</main>
          </div>
          <Toaster
            position="bottom-right"
            theme="dark"
            richColors
            toastOptions={{
              style: {
                background: '#16161B',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#F5F5F7',
                borderRadius: '0.75rem',
              },
            }}
          />
        </div>
      </MotionProvider>
    </AdminEventsProvider>
  );
}
