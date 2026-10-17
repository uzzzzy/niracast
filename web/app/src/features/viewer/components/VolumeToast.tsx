import { Volume2, VolumeX } from 'lucide-react';
import type React from 'react';
import { t } from '../../../lib/i18n';

interface VolumeToastProps {
  visible: boolean;
  volume: number;
  isMuted: boolean;
  message?: string;
}

export const VolumeToast: React.FC<VolumeToastProps> = ({ visible, volume, isMuted, message }) => {
  if (!visible) return null;

  const percent = isMuted ? 0 : Math.round(volume * 100);

  return (
    <div
      data-testid="volume-toast"
      aria-live="polite"
      className="pointer-events-none fixed top-12 right-12 z-50 flex items-center gap-4 rounded-2xl border border-white/20 bg-[#16161B]/95 px-6 py-4 shadow-2xl transition-opacity duration-200"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
        {isMuted || percent === 0 ? (
          <VolumeX className="h-6 w-6 text-red-400" />
        ) : (
          <Volume2 className="h-6 w-6 text-[#0A84FF]" />
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4 font-mono text-sm font-semibold text-white">
          <span>{message || (isMuted ? t('muted_chip') : t('volume'))}</span>
          <span>{percent}%</span>
        </div>

        {/* Horizontal volume level indicator (scaleX transform only) */}
        <div className="h-2 w-36 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full w-full bg-[#0A84FF] transition-transform duration-100 ease-out"
            style={{
              transform: `scaleX(${isMuted ? 0 : volume})`,
              transformOrigin: 'left',
            }}
          />
        </div>
      </div>
    </div>
  );
};
