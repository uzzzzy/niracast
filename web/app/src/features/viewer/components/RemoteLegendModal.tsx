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
        className="relative z-10 w-full max-w-lg rounded-3xl border border-white/20 bg-[#16161B]/95 p-8 shadow-2xl text-[#F5F5F7]"
      >
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Tv className="h-7 w-7 text-[#0A84FF]" />
            <h2 className="text-xl font-bold">{t('remote_legend_title')}</h2>
          </div>
          <button
            type="button"
            data-focusable
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-neutral-300 hover:text-white hover:bg-white/10 focus:outline-none"
          >
            <X className="h-7 w-7" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {legendItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/5 text-base"
            >
              <span className="text-[#8E8E93]">{item.desc}</span>
              <kbd className="rounded-xl border border-white/20 bg-black/60 px-3 py-1 font-mono text-sm font-bold text-white shadow">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
