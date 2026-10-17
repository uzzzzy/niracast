import { Tv, X } from 'lucide-react';
import type React from 'react';
import { t } from '../../../lib/i18n';

interface RemoteLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RemoteLegendModal: React.FC<RemoteLegendModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const legendItems = [
    { key: '▲ / ▼', desc: t('remote_up_down') },
    { key: '◄ / ►', desc: t('remote_left_right') },
    { key: 'OK', desc: t('remote_ok') },
    { key: 'Back', desc: t('remote_back') },
    { key: '0 - 9', desc: t('remote_digits') },
    { key: 'Play / Pause', desc: t('remote_play_pause') },
    { key: 'Info', desc: t('remote_info') },
    { key: 'Guide', desc: t('remote_guide') },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('remote_legend_title')}
      data-nav-group="shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center p-6 transition-spring"
    >
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close')}
        className="fixed inset-0 bg-black/75 cursor-default"
        onClick={onClose}
      />

      <div
        role="document"
        className="relative z-10 w-full max-w-lg rounded-sheet border border-hairline glass-thick p-8 shadow-2 text-fg"
      >
        <div className="flex items-center justify-between pb-6 border-b border-hairline">
          <div className="flex items-center gap-3">
            <Tv className="h-7 w-7 text-accent" />
            <h2 className="large-title text-fg">{t('remote_legend_title')}</h2>
          </div>
          <button
            type="button"
            data-focusable
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-14 w-14 items-center justify-center rounded-control text-fg-muted hover:text-fg hover:bg-surface-3 focus:outline-none"
          >
            <X className="h-7 w-7" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {legendItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 px-4 rounded-tile bg-surface-2/60 border border-hairline text-base"
            >
              <span className="text-fg-muted">{item.desc}</span>
              <kbd className="rounded-control border border-hairline bg-surface-3 px-3 py-1 font-mono text-sm font-bold text-fg timecode shadow-1">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
