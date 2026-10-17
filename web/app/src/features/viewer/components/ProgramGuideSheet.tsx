import { Calendar, Clock, X } from 'lucide-react';
import type React from 'react';
import type { EpgItem } from '../../../lib/api';
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

      {/* Sheet */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('program_guide')}
        data-nav-group="guide"
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[75vh] flex-col rounded-t-3xl border-t border-white/20 bg-[#16161B]/95 p-6 shadow-2xl transition-spring reduced-motion-fade ${
          isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 text-white">
            <Calendar className="h-6 w-6 text-[#0A84FF]" />
            <div>
              <h2 className="text-lg font-bold">{t('program_guide')}</h2>
              {channelName && <p className="text-xs text-[#8E8E93]">{channelName}</p>}
            </div>
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

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#8E8E93]">{t('no_epg')}</div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.media_id}-${item.start_at}`}
                data-focusable
                className={`flex min-h-[56px] items-center justify-between rounded-2xl px-5 py-3.5 border transition-colors focus:outline-none ${
                  item.is_current
                    ? 'bg-[#0A84FF]/20 border-[#0A84FF]/50 text-white'
                    : 'bg-white/5 border-transparent text-neutral-200 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 font-mono text-xs text-[#8E8E93]">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatLocalTime(item.start_at)}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{item.title}</span>
                      {item.is_current && (
                        <span className="rounded-full bg-[#30D158]/20 px-2 py-0.5 text-[11px] font-semibold text-[#30D158] border border-[#30D158]/40">
                          {t('now')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs font-mono text-[#8E8E93]">
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
