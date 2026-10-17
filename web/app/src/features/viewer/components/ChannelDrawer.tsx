import { Tv, X } from 'lucide-react';
import type React from 'react';
import { ChannelArt } from '../../../components/ui';
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
            ? `fixed bottom-0 left-0 right-0 z-50 flex max-h-[75vh] flex-col rounded-t-[var(--radius-sheet)] border-t border-hairline glass-thick p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2 transition-spring reduced-motion-fade ${
                isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
              }`
            : `fixed top-0 right-0 bottom-0 z-50 flex w-80 max-w-[85vw] flex-col border-l border-hairline glass-thick p-5 shadow-2 transition-spring reduced-motion-fade ${
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
            <div className="h-1.5 w-12 rounded-full bg-hairline-strong hover:bg-hairline transition-colors" />
          </button>
        )}

        <div className="flex items-center justify-between pb-4 border-b border-hairline">
          <div className="flex items-center gap-2 text-fg">
            <Tv className="h-5 w-5 text-accent" />
            <h2 className="title text-fg">{t('channels')}</h2>
          </div>
          <button
            type="button"
            data-focusable
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-9 w-9 items-center justify-center rounded-control text-fg-muted hover:text-fg hover:bg-surface-3 focus:outline-none"
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
                className={`flex w-full min-h-[48px] items-center justify-between rounded-tile px-3.5 py-2.5 text-left transition-colors focus:outline-none ${
                  isSelected
                    ? 'bg-accent-soft ring-1 ring-accent/40 text-fg'
                    : 'text-fg hover:bg-surface-3/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelArt
                    channelId={channel.id}
                    className="w-16 h-9 rounded-control shrink-0 border border-hairline"
                  />
                  <span className="font-mono text-xs font-bold text-accent timecode shrink-0">
                    {channel.number}
                  </span>
                  <span className="text-sm font-medium text-fg truncate">{channel.name}</span>
                </div>
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-live animate-live-pulse shrink-0 ml-2" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};
