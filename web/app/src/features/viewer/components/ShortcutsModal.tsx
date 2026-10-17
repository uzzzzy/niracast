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
      data-nav-group="shortcuts"
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
        className="relative z-10 w-full max-w-md rounded-sheet border border-hairline glass-thick p-6 shadow-2 text-fg"
      >
        <div className="flex items-center justify-between pb-4 border-b border-hairline">
          <h2 className="title text-fg">{t('shortcuts_title')}</h2>
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

        <div className="mt-4 grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 px-2.5 rounded-tile bg-surface-2/60 border border-hairline text-sm"
            >
              <span className="text-fg-muted">{s.desc}</span>
              <kbd className="rounded-control bg-surface-3 border border-hairline px-2 py-0.5 text-xs font-mono font-semibold text-fg timecode">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
