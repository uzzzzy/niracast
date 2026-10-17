import { Globe, LogOut, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslation } from '../../../lib/i18n';
import { useMotionMode } from '../../../lib/motion/mode';
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#16161B]/80 px-3 sm:px-6 backdrop-blur-md">
      <div className="min-w-0 pr-2">
        <h1 className="text-sm sm:text-base font-semibold text-[#F5F5F7] tracking-tight truncate max-w-[130px] sm:max-w-xs">
          {getPageTitle()}
        </h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* SSE Live / Reconnecting chip */}
        <div
          role="status"
          aria-live="polite"
          className={
            isLive
              ? 'flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 sm:px-3 py-1 text-xs font-medium text-emerald-400'
              : 'flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 sm:px-3 py-1 text-xs font-medium text-amber-400'
          }
        >
          <span
            className={
              isLive
                ? 'h-2 w-2 rounded-full bg-emerald-400 animate-live-pulse'
                : 'h-2 w-2 rounded-full bg-amber-400'
            }
          />
          <span className="hidden md:inline">
            {isLive ? t('live_status_connected') : t('live_status_reconnecting')}
          </span>
        </div>

        {/* Motion mode switcher */}
        <button
          type="button"
          onClick={cyclePreference}
          aria-label={motionLabel}
          title={motionLabel}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <Sparkles className="h-4 w-4 text-[#0A84FF]" />
          <span className="uppercase font-mono text-[11px] hidden sm:inline">
            {getMotionDisplay()}
          </span>
        </button>

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLang}
          aria-label={t('language')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 sm:px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <Globe className="h-4 w-4" />
          <span className="uppercase text-[11px]">{lang}</span>
        </button>

        {/* Logout button */}
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          aria-label={t('logout')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 sm:px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{isLoggingOut ? t('logging_out') : t('logout')}</span>
        </button>
      </div>
    </header>
  );
}
