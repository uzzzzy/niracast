import { AlertCircle, Loader2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, type Channel } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';

interface ChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { number: number; name: string }) => Promise<void>;
  channelToEdit?: Channel | null;
}

export function ChannelModal({ isOpen, onClose, onSubmit, channelToEdit }: ChannelModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [numberVal, setNumberVal] = useState<string>('');
  const [nameVal, setNameVal] = useState<string>('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (channelToEdit) {
      setNumberVal(channelToEdit.number.toString());
      setNameVal(channelToEdit.name);
    } else {
      setNumberVal('');
      setNameVal('');
    }
    setInlineError(null);
  }, [channelToEdit]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);

    const num = Number.parseInt(numberVal, 10);
    if (Number.isNaN(num) || num < 1) {
      setInlineError(t('error_number_required'));
      return;
    }

    const trimmedName = nameVal.trim();
    if (!trimmedName || trimmedName.length > 60) {
      setInlineError(t('error_name_required'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ number: num, name: trimmedName });
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setInlineError(t('duplicate_number_error'));
      } else if (err instanceof Error) {
        setInlineError(err.message);
      } else {
        setInlineError('Unknown error occurred');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#16161B] p-6 text-[#F5F5F7] shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
        <h3 className="text-base font-semibold text-[#F5F5F7] tracking-tight">
          {channelToEdit ? t('edit_channel') : t('create_channel')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-400 hover:bg-white/5 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {inlineError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
          <span>{inlineError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="channel-number"
            className="block text-xs font-medium text-neutral-300 mb-1.5"
          >
            {t('channel_number')}
          </label>
          <input
            id="channel-number"
            type="number"
            min="1"
            step="1"
            value={numberVal}
            onChange={(e) => setNumberVal(e.target.value)}
            placeholder={t('channel_number_placeholder')}
            required
            className="w-full rounded-xl border border-white/10 bg-[#22222A] px-3.5 py-2.5 text-sm text-[#F5F5F7] placeholder-neutral-500 focus:border-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          />
        </div>

        <div>
          <label
            htmlFor="channel-name"
            className="block text-xs font-medium text-neutral-300 mb-1.5"
          >
            {t('channel_name')}
          </label>
          <input
            id="channel-name"
            type="text"
            maxLength={60}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            placeholder={t('channel_name_placeholder')}
            required
            className="w-full rounded-xl border border-white/10 bg-[#22222A] px-3.5 py-2.5 text-sm text-[#F5F5F7] placeholder-neutral-500 focus:border-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#0071E3] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('save')}</span>
              </span>
            ) : (
              t('save')
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
