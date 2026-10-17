import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Channel } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  channel: Channel | null;
  isDeleting: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  channel,
  isDeleting,
}: DeleteConfirmModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  if (!channel) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#16161B] p-6 text-[#F5F5F7] shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2.5 text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-base font-semibold text-[#F5F5F7] tracking-tight">
            {t('delete_confirm_title')}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-400 hover:bg-white/5 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3 mb-6">
        <p className="text-sm font-medium text-neutral-200">
          #{channel.number} - {channel.name}
        </p>
        <p className="text-xs text-neutral-400 leading-relaxed">{t('delete_confirm_message')}</p>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className="flex min-h-[44px] items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
        >
          {isDeleting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('confirm_delete')}</span>
            </span>
          ) : (
            t('confirm_delete')
          )}
        </button>
      </div>
    </dialog>
  );
}
