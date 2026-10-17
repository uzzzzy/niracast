import { ExternalLink, Film, LayoutDashboard, Radio, Server, Tv } from 'lucide-react';
import { NavLink } from 'react-router';
import { useTranslation } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';

interface AdminSidebarProps {
  firstChannelId?: number;
}

export function AdminSidebar({ firstChannelId = 1 }: AdminSidebarProps) {
  const { t } = useTranslation();

  const navItems = [
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
      to: '/admin/media',
      label: t('nav_media'),
      icon: Film,
    },
    {
      to: '/admin/system',
      label: t('nav_system'),
      icon: Server,
    },
  ];

  return (
    <>
      {/* Desktop / Tablet Sidebar */}
      <aside
        aria-label={t('studio_title')}
        className="hidden md:flex flex-col justify-between border-r border-white/10 bg-[#16161B]/80 backdrop-blur-md transition-all duration-200 w-16 max-[900px]:w-16 min-[901px]:w-60 shrink-0"
      >
        <div>
          {/* Brand header */}
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4 max-[900px]:justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0A84FF]/20 text-[#0A84FF]">
              <Radio className="h-5 w-5" />
            </div>
            <div className="flex flex-col max-[900px]:hidden overflow-hidden">
              <span className="truncate text-sm font-semibold tracking-tight text-[#F5F5F7]">
                {t('studio_title')}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                CMS Studio
              </span>
            </div>
          </div>

          {/* Navigation list */}
          <nav className="p-2 space-y-1" aria-label="Admin Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] max-[900px]:justify-center',
                      isActive
                        ? 'bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30'
                        : 'text-neutral-400 hover:bg-white/5 hover:text-[#F5F5F7]',
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate max-[900px]:hidden">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer link to viewer */}
        <div className="border-t border-white/10 p-2">
          <a
            href={`/watch/${firstChannelId}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t('open_viewer')}
            className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-neutral-400 hover:bg-white/5 hover:text-[#F5F5F7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] max-[900px]:justify-center"
          >
            <ExternalLink className="h-5 w-5 shrink-0" />
            <span className="truncate max-[900px]:hidden">{t('open_viewer')}</span>
          </a>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Admin Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-white/10 bg-[#16161B]/95 backdrop-blur-md px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]',
                  isActive ? 'text-[#0A84FF]' : 'text-neutral-400 hover:text-[#F5F5F7]',
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate max-w-[65px]">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
