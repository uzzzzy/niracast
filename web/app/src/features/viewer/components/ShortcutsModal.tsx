import { X } from 'lucide-react';
import type React from 'react';
import { t } from '../../../lib/i18n';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'M', desc: t('shortcuts_m') },
    { key: 'F', desc: t('shortcuts_f') },
    { key: 'P', desc: t('shortcuts_p') },
    { key: 'G', desc: t('shortcuts_g') },
    { key: 'C', desc: t('shortcuts_c') },
    { key: '↑ / ↓', desc: t('shortcuts_up_down') },
    { key: '1 - 9', desc: t('shortcuts_digits') },
    { key: 'N', desc: t('shortcuts_n') },
    { key: 'Esc', desc: t('shortcuts_esc') },
    { key: '?', desc: t('shortcuts_help') },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts_title')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-spring"
    >
      {/* Backdrop button */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close')}
        className="fixed inset-0 bg-black/60 cursor-default"
        onClick={onClose}
      />

      <div
        role="document"
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#16161B]/95 p-6 shadow-2xl text-[#F5F5F7]"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h2 className="text-base font-semibold">{t('shortcuts_title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/5 text-sm"
            >
              <span className="text-[#8E8E93]">{s.desc}</span>
              <kbd className="rounded border border-white/20 bg-black/40 px-2 py-0.5 text-xs font-mono font-semibold text-white">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
