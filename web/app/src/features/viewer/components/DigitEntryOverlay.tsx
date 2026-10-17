import { Hash } from 'lucide-react';
import type React from 'react';
import { t } from '../../../lib/i18n';

interface DigitEntryOverlayProps {
  digits: string;
  hasError: boolean;
}

export const DigitEntryOverlay: React.FC<DigitEntryOverlayProps> = ({ digits, hasError }) => {
  if (!digits && !hasError) return null;

  return (
    <div
      data-testid="digit-entry-overlay"
      className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center transition-opacity"
    >
      <div
        className={`flex flex-col items-center justify-center rounded-3xl border px-10 py-8 shadow-2xl transition-spring ${
          hasError
            ? 'animate-shake border-red-500/50 bg-[#16161B]/95 text-red-400'
            : 'border-white/20 bg-[#16161B]/95 text-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <Hash className="h-10 w-10 text-[#0A84FF]" />
          <span className="font-mono text-6xl font-extrabold tracking-wider">{digits || '—'}</span>
        </div>

        {hasError ? (
          <p data-testid="digit-error-message" className="mt-4 text-base font-medium text-red-400">
            {t('no_such_channel')}
          </p>
        ) : (
          <p className="mt-4 text-xs uppercase tracking-widest text-[#8E8E93]">
            {t('channel_number_input', undefined, { number: digits })}
          </p>
        )}
      </div>
    </div>
  );
};
