import { Globe, LogOut, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { useTranslation } from '../../../lib/i18n';
import { useMotionMode } from '../../../lib/motion/mode';
import { cn } from '../../../lib/utils';
import { useAdminEvents } from '../hooks/useAdminEvents';

interface AdminTopBarProps {
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function AdminTopBar({ onLogout, isLoggingOut = false }: AdminTopBarProps) {
  const { lang, setLanguage, t } = useTranslation();
  const { mode, preference, cyclePreference } = useMotionMode();
  const { connectionState } = useAdminEvents();
  const location = useLocation();

  const getPageTitle = () => {
    const pathname = location.pathname;
    if (pathname.includes('/admin/overview')) return t('nav_overview');
    if (pathname.match(/\/admin\/channels\/\d+\/schedule/)) return t('schedule_title');
    if (pathname.match(/\/admin\/channels\/\d+/)) return t('playlist_editor_title');
    if (pathname.includes('/admin/channels')) return t('nav_channels');
    if (pathname.includes('/admin/media')) return t('nav_media');
    if (pathname.includes('/admin/system')) return t('nav_system');
    return t('studio_title');
  };

  const isLive = connectionState === 'connected';

  const toggleLang = () => {
    setLanguage(lang === 'id' ? 'en' : 'id');
  };

  const getMotionDisplay = () => {
    if (mode === 'reduced') return t('motion_reduced');
    if (preference === 'full') return t('motion_full');
    if (preference === 'lite') return t('motion_lite');
    return t('motion_auto');
  };

  const motionLabel = `${t('motion_label')}: ${getMotionDisplay()}`;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between glass-thin border-t-0 border-x-0 border-b border-hairline px-4 sm:px-6 select-none">
      <div className="min-w-0 pr-2">
        <h1 className="title md:large-title text-fg tracking-tight truncate max-w-[160px] sm:max-w-xs md:max-w-md">
          {getPageTitle()}
        </h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* SSE Live / Reconnecting chip */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider',
            isLive ? 'border-live/30 bg-live/15 text-live' : 'border-idle/30 bg-idle/15 text-idle',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              isLive ? 'bg-live animate-live-pulse' : 'bg-idle',
            )}
          />
          <span className="hidden md:inline">
            {isLive ? t('live_status_connected') : t('live_status_reconnecting')}
          </span>
        </div>

        {/* Motion mode switcher */}
        <Button
          variant="ghost"
          size="sm"
          onClick={cyclePreference}
          aria-label={motionLabel}
          title={motionLabel}
          className="hidden sm:inline-flex gap-1.5 px-2.5"
        >
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="uppercase font-mono text-[11px]">{getMotionDisplay()}</span>
        </Button>

        {/* Language toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLang}
          aria-label={t('language')}
          className="gap-1 px-2.5"
        >
          <Globe className="h-4 w-4" />
          <span className="uppercase text-[11px] font-mono">{lang}</span>
        </Button>

        {/* Logout button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          disabled={isLoggingOut}
          aria-label={t('logout')}
          className="gap-1.5 px-2.5 hover:text-danger hover:bg-danger/10"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{isLoggingOut ? t('logging_out') : t('logout')}</span>
        </Button>
      </div>
    </header>
  );
}
