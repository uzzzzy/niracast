import { Calendar, Clock, X } from 'lucide-react';
import type React from 'react';
import type { EpgItem } from '../../../lib/api';
import { useBottomSheetDrag } from '../../../lib/gestures';
import { t } from '../../../lib/i18n';
import { formatDuration, formatLocalTime } from '../utils';

interface ProgramGuideSheetProps {
  isOpen: boolean;
  onClose: () => void;
  items: EpgItem[];
  channelName?: string;
}

export const ProgramGuideSheet: React.FC<ProgramGuideSheetProps> = ({
  isOpen,
  onClose,
  items,
  channelName,
}) => {
  const { dragHandleProps, sheetStyle } = useBottomSheetDrag({
    onClose,
    enabled: isOpen,
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

      {/* Bottom Sheet */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('program_guide')}
        data-nav-group="guide"
        style={sheetStyle}
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[75vh] flex-col rounded-t-[var(--radius-sheet)] border-t border-hairline glass-thick p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-2 transition-spring reduced-motion-fade ${
          isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        {/* Drag handle */}
        <button
          type="button"
          {...dragHandleProps}
          aria-label={t('drag_handle')}
          className="flex w-full justify-center -mt-3 pb-3 cursor-grab active:cursor-grabbing touch-none select-none bg-transparent border-0"
        >
          <div className="h-1.5 w-12 rounded-full bg-hairline-strong hover:bg-hairline transition-colors" />
        </button>

        <div className="flex items-center justify-between pb-4 border-b border-hairline">
          <div className="flex items-center gap-3 text-fg">
            <Calendar className="h-6 w-6 text-accent" />
            <div>
              <h2 className="title text-lg font-bold text-fg">{t('program_guide')}</h2>
              {channelName && <p className="text-xs text-fg-muted">{channelName}</p>}
            </div>
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

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-fg-muted">{t('no_epg')}</div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.media_id}-${item.start_at}`}
                data-focusable
                className={`flex min-h-[56px] items-center justify-between rounded-tile px-4 py-3 border transition-colors focus:outline-none ${
                  item.is_current
                    ? 'bg-accent-soft border-hairline border-l-4 border-l-accent text-fg'
                    : 'surface-card border-hairline text-fg hover:bg-surface-3/50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 font-mono text-xs text-fg-muted timecode">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatLocalTime(item.start_at)}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">{item.title}</span>
                      {item.is_current && (
                        <span className="rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-semibold text-live border border-live/30">
                          {t('now')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs font-mono text-fg-muted timecode">
                  {formatDuration(item.duration_sec)}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
};
