import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui';
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
      className="fixed inset-0 m-auto w-full max-w-md glass-thick rounded-sheet p-6 shadow-[var(--shadow-2)] text-fg backdrop:bg-black/50 focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-hairline pb-4 mb-4">
        <div className="flex items-center gap-2.5 text-danger">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="title text-fg">{t('delete_confirm_title')}</h3>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="space-y-3 mb-6">
        <p className="text-sm font-medium text-fg">
          #{channel.number} - {channel.name}
        </p>
        <p className="text-xs text-fg-muted leading-relaxed">{t('delete_confirm_message')}</p>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isDeleting}>
          {t('cancel')}
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('confirm_delete')}</span>
            </span>
          ) : (
            t('confirm_delete')
          )}
        </Button>
      </div>
    </dialog>
  );
}
