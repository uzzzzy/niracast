import {
  ChartLine,
  ExternalLink,
  Film,
  LayoutDashboard,
  LogOut,
  Radio,
  Server,
  Sparkles,
  Tv,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { StatusPill } from '../../../components/ui/StatusPill';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { useTranslation } from '../../../lib/i18n';
import { useMotionMode } from '../../../lib/motion/mode';
import { cn } from '../../../lib/utils';
import { useAdminEvents } from '../hooks/useAdminEvents';

interface AdminSidebarProps {
  firstChannelId?: number;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export function AdminSidebar({
  firstChannelId = 1,
  onLogout,
  isLoggingOut = false,
}: AdminSidebarProps) {
  const { t } = useTranslation();
  const { statuses } = useAdminEvents();
  const { mode, preference, cyclePreference } = useMotionMode();

  const playingCount = Object.values(statuses).filter((s) => s.state === 'playing').length;

  const getMotionDisplay = () => {
    if (mode === 'reduced') return t('motion_reduced');
    if (preference === 'full') return t('motion_full');
    if (preference === 'lite') return t('motion_lite');
    return t('motion_auto');
  };

  const motionLabel = `${t('motion_label')}: ${getMotionDisplay()}`;

  const navGroups = [
    {
      id: 'broadcast',
      heading: t('studio_title'),
      items: [
        {
          to: '/admin/overview',
          label: t('nav_overview'),
          icon: LayoutDashboard,
        },
        {
          to: '/admin/channels',
          label: t('nav_channels'),
          icon: Tv,
        },
        {
          to: '/admin/analytics',
          label: t('nav_analytics'),
          icon: ChartLine,
        },
      ],
    },
    {
      id: 'manage',
      heading: t('nav_system'),
      items: [
        {
          to: '/admin/media',
          label: t('nav_media'),
          icon: Film,
        },
        {
          to: '/admin/system',
          label: t('nav_system'),
          icon: Server,
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((group) => group.items);

  return (
    <>
      {/* Desktop / Tablet Floating Sidebar */}
      <aside
        aria-label={t('studio_title')}
        className="hidden md:flex flex-col justify-between w-[248px] my-3 ml-3 h-[calc(100dvh-24px)] shrink-0 glass-thick rounded-card p-3 select-none z-20"
      >
        <div className="flex flex-col min-h-0 flex-1">
          {/* Brand header */}
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent-soft text-accent shrink-0">
              <Radio className="h-4 w-4 text-accent" />
            </div>
            <div className="flex flex-col min-w-0 overflow-hidden">
              <span className="title truncate text-fg leading-tight">{t('studio_title')}</span>
              <span className="label-caps truncate">Control Room</span>
            </div>
          </div>

          {/* Navigation list with groups */}
          <nav className="flex-1 space-y-4 px-1 py-1 overflow-y-auto" aria-label="Admin Navigation">
            {navGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                <div className="px-2 pb-1 label-caps">{group.heading}</div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex h-9 items-center gap-2.5 rounded-tile px-2.5 text-sm font-medium transition-colors focus-visible:outline-none mobile:min-h-11',
                          isActive
                            ? 'bg-accent-soft text-fg'
                            : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0',
                              isActive ? 'text-accent' : 'text-fg-subtle',
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}

            {/* Link to viewer */}
            <div className="pt-2 border-t border-hairline">
              <a
                href={`/watch/${firstChannelId}`}
                target="_blank"
                rel="noreferrer"
                aria-label={t('open_viewer')}
                className="flex h-9 items-center gap-2.5 rounded-tile px-2.5 text-sm font-medium text-fg-muted hover:bg-surface-3/60 hover:text-fg transition-colors focus-visible:outline-none mobile:min-h-11"
              >
                <ExternalLink className="h-[18px] w-[18px] text-fg-subtle shrink-0" />
                <span className="truncate">{t('open_viewer')}</span>
              </a>
            </div>
          </nav>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 pt-3 border-t border-hairline px-1">
          {/* ON AIR indicator */}
          <div className="flex items-center justify-between px-1">
            <StatusPill status="onair">
              <span className="timecode">{playingCount}</span> ON AIR
            </StatusPill>
          </div>

          {/* Theme toggle */}
          <div className="flex items-center px-1">
            <ThemeToggle compact className="w-full" />
          </div>

          {/* Motion toggle as ghost button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={cyclePreference}
            aria-label={motionLabel}
            title={motionLabel}
            className="w-full justify-start text-xs text-fg-muted hover:text-fg h-8"
          >
            <Sparkles className="h-4 w-4 text-accent mr-2 shrink-0" />
            <span className="truncate">{motionLabel}</span>
          </Button>

          {/* Logout as ghost button */}
          {onLogout && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              disabled={isLoggingOut}
              aria-label={t('logout')}
              className="w-full justify-start text-xs text-fg-muted hover:text-danger hover:bg-danger/10 h-8"
            >
              <LogOut className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{isLoggingOut ? t('logging_out') : t('logout')}</span>
            </Button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Admin Navigation"
        className="fixed bottom-3 left-3 right-3 z-40 flex h-16 items-center justify-around glass-thick rounded-sheet px-2 safe-area-bottom md:hidden select-none"
      >
        {allNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-tile py-1 text-[10px] font-medium transition-colors focus-visible:outline-none',
                  isActive ? 'text-accent' : 'text-fg-muted hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn('h-5 w-5 shrink-0', isActive ? 'text-accent' : 'text-fg-subtle')}
                  />
                  <span className="truncate max-w-[65px]">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
