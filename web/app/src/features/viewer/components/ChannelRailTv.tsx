import { useQuery } from '@tanstack/react-query';
import { Tv, X } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { api, type Channel, type ChannelStatus } from '../../../lib/api';
import { t } from '../../../lib/i18n';

interface ChannelRailTvProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  currentChannelId?: number;
  onSelectChannel: (id: number) => void;
}

export const ChannelRailTv: React.FC<ChannelRailTvProps> = ({
  isOpen,
  onClose,
  channels,
  currentChannelId,
  onSelectChannel,
}) => {
  const sortedChannels = useMemo(
    () => [...channels].sort((a, b) => a.number - b.number),
    [channels],
  );

  // Bounded status polling: fetch status for listed channels at 10s interval only while open
  const channelIds = useMemo(() => sortedChannels.map((c) => c.id), [sortedChannels]);

  const { data: channelStatuses = {} } = useQuery({
    queryKey: ['tv-rail-statuses', channelIds],
    queryFn: async () => {
      const results: Record<number, ChannelStatus> = {};
      // Fetch statuses in parallel, capped to listed channels
      await Promise.all(
        channelIds.map(async (chId) => {
          try {
            const st = await api.getChannelStatus(String(chId));
            results[chId] = st;
          } catch {
            // Ignore individual status fetch errors
          }
        }),
      );
      return results;
    },
    enabled: isOpen && channelIds.length > 0,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close')}
        className={`fixed inset-0 z-40 bg-black/70 transition-opacity duration-200 cursor-default ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Left Rail OSD */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('channels')}
        data-nav-group="channels"
        data-testid="tv-channel-rail"
        className={`fixed top-0 left-0 bottom-0 z-50 flex w-[26rem] max-w-[85vw] flex-col border-r border-white/20 bg-[#16161B]/95 p-6 shadow-2xl transition-spring reduced-motion-fade ${
          isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <div className="flex items-center gap-3 text-white">
            <Tv className="h-6 w-6 text-[#0A84FF]" />
            <h2 className="text-xl font-bold">{t('channels')}</h2>
          </div>
          <button
            type="button"
            data-focusable
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-neutral-400 hover:text-white hover:bg-white/10 focus:outline-none"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-6 flex-1 space-y-3 overflow-y-auto pr-1">
          {sortedChannels.map((ch) => {
            const isSelected = ch.id === currentChannelId;
            const status = channelStatuses[ch.id];
            const nowTitle = status?.item?.filename;

            return (
              <button
                key={ch.id}
                type="button"
                data-focusable
                onClick={() => {
                  onSelectChannel(ch.id);
                  onClose();
                }}
                className={`flex w-full min-h-[72px] items-center justify-between rounded-2xl px-5 py-4 text-left transition-colors focus:outline-none ${
                  isSelected
                    ? 'bg-[#0A84FF]/25 text-white border-2 border-[#0A84FF]'
                    : 'bg-white/5 text-neutral-200 hover:bg-white/10 border-2 border-transparent'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/60 font-mono text-base font-bold text-[#0A84FF]">
                    {ch.number}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{ch.name}</p>
                    {nowTitle && (
                      <p className="truncate text-xs text-[#8E8E93] font-normal">{nowTitle}</p>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <span className="h-3 w-3 shrink-0 rounded-full bg-[#30D158] animate-live-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};
