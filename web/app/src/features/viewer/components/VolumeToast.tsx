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
      className="pointer-events-none fixed top-12 right-12 z-50 flex items-center gap-3.5 rounded-full border border-hairline glass-hud px-5 py-3 shadow-2 transition-opacity duration-200"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-fg">
        {isMuted || percent === 0 ? (
          <VolumeX className="h-4 w-4 text-danger" />
        ) : (
          <Volume2 className="h-4 w-4 text-accent" />
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4 font-mono text-xs font-semibold text-fg timecode">
          <span>{message || (isMuted ? t('muted_chip') : t('volume'))}</span>
          <span>{percent}%</span>
        </div>

        {/* Horizontal volume level indicator (scaleX transform only, 4px track) */}
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full w-full bg-accent transition-transform duration-100 ease-out"
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
