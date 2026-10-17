import { AlertCircle, Loader2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, SegmentedControl } from '../../../components/ui';
import { ApiError, type Channel } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';

interface ChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { number: number; name: string; mode?: 'loop' | 'scheduled' }) => Promise<void>;
  channelToEdit?: Channel | null;
}

export function ChannelModal({ isOpen, onClose, onSubmit, channelToEdit }: ChannelModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [numberVal, setNumberVal] = useState<string>('');
  const [nameVal, setNameVal] = useState<string>('');
  const [modeVal, setModeVal] = useState<'loop' | 'scheduled'>('loop');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (channelToEdit) {
      setNumberVal(channelToEdit.number.toString());
      setNameVal(channelToEdit.name);
      setModeVal(channelToEdit.mode || 'loop');
    } else {
      setNumberVal('');
      setNameVal('');
      setModeVal('loop');
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
      await onSubmit({ number: num, name: trimmedName, mode: modeVal });
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
      className="fixed inset-0 m-auto w-full max-w-md glass-thick rounded-sheet p-6 shadow-[var(--shadow-2)] text-fg backdrop:bg-black/50 focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-hairline pb-4 mb-5">
        <h3 className="title text-fg">{channelToEdit ? t('edit_channel') : t('create_channel')}</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {inlineError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-tile border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
          <span>{inlineError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('channel_number')} htmlFor="channel-number">
          <Input
            id="channel-number"
            type="number"
            min="1"
            step="1"
            value={numberVal}
            onChange={(e) => setNumberVal(e.target.value)}
            placeholder={t('channel_number_placeholder')}
            required
          />
        </Field>

        <Field label={t('channel_name')} htmlFor="channel-name">
          <Input
            id="channel-name"
            type="text"
            maxLength={60}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            placeholder={t('channel_name_placeholder')}
            required
          />
        </Field>

        <Field label={t('channel_mode')}>
          <SegmentedControl
            options={[
              { value: 'loop', label: t('mode_loop') },
              { value: 'scheduled', label: t('mode_scheduled') },
            ]}
            value={modeVal}
            onChange={(v) => setModeVal(v as 'loop' | 'scheduled')}
            ariaLabel={t('channel_mode')}
          />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-hairline">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('save')}</span>
              </span>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
