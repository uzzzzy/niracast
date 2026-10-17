import { Tv, X } from 'lucide-react';
import type React from 'react';
import type { Channel } from '../../../lib/api';
import { useBottomSheetDrag } from '../../../lib/gestures';
import { t } from '../../../lib/i18n';

interface ChannelDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  currentChannelId?: number;
  onSelectChannel: (id: number) => void;
  isMobile?: boolean;
}

export const ChannelDrawer: React.FC<ChannelDrawerProps> = ({
  isOpen,
  onClose,
  channels,
  currentChannelId,
  onSelectChannel,
  isMobile = false,
}) => {
  const sortedChannels = [...channels].sort((a, b) => a.number - b.number);
  const { dragHandleProps, sheetStyle } = useBottomSheetDrag({
    onClose,
    enabled: isMobile && isOpen,
  });

  return (
    <>
      {/* Backdrop button */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close')}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 cursor-default ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer (Desktop) or Bottom Sheet (Mobile) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('channels')}
        data-nav-group="channels"
        style={isMobile ? sheetStyle : undefined}
        className={
          isMobile
            ? `fixed bottom-0 left-0 right-0 z-50 flex max-h-[75vh] flex-col rounded-t-3xl border-t border-white/20 bg-[#16161B]/95 p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl transition-spring reduced-motion-fade ${
                isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
              }`
            : `fixed top-0 right-0 bottom-0 z-50 flex w-80 max-w-[85vw] flex-col border-l border-white/10 bg-[#16161B]/95 p-5 shadow-2xl transition-spring reduced-motion-fade ${
                isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
              }`
        }
      >
        {isMobile && (
          <button
            type="button"
            {...dragHandleProps}
            aria-label={t('drag_handle')}
            className="flex w-full justify-center -mt-2 pb-3 cursor-grab active:cursor-grabbing touch-none select-none bg-transparent border-0"
          >
            <div className="h-1.5 w-12 rounded-full bg-white/25 hover:bg-white/40 transition-colors" />
          </button>
        )}

        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-white">
            <Tv className="h-5 w-5 text-[#0A84FF]" />
            <h2 className="text-base font-semibold">{t('channels')}</h2>
          </div>
          <button
            type="button"
            data-focusable
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {sortedChannels.map((channel) => {
            const isSelected = channel.id === currentChannelId;
            return (
              <button
                key={channel.id}
                type="button"
                data-focusable
                onClick={() => {
                  onSelectChannel(channel.id);
                  onClose();
                }}
                className={`flex w-full min-h-[48px] items-center justify-between rounded-xl px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#0A84FF] ${
                  isSelected
                    ? 'bg-[#0A84FF]/20 text-white border border-[#0A84FF]/50'
                    : 'text-neutral-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 text-xs font-mono font-bold text-[#0A84FF]">
                    {channel.number}
                  </span>
                  <span className="text-sm font-medium">{channel.name}</span>
                </div>
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-[#30D158] animate-live-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};
