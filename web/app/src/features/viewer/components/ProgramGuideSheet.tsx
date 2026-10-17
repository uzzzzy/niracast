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
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[70vh] flex-col rounded-t-3xl border-t border-white/10 bg-[#16161B]/95 p-6 shadow-2xl transition-spring reduced-motion-fade ${
          isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 text-white">
            <Calendar className="h-5 w-5 text-[#0A84FF]" />
            <div>
              <h2 className="text-base font-semibold">{t('program_guide')}</h2>
              {channelName && <p className="text-xs text-[#8E8E93]">{channelName}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#8E8E93]">{t('no_epg')}</div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.media_id}-${item.start_at}`}
                className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
                  item.is_current
                    ? 'bg-[#0A84FF]/15 border-[#0A84FF]/40 text-white'
                    : 'bg-white/5 border-transparent text-neutral-300'
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
