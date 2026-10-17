import wallDark from '../../../assets/wall-dark.webp';
import wallDarkPortrait from '../../../assets/wall-dark-portrait.webp';
import wallLight from '../../../assets/wall-light.webp';
import wallLightPortrait from '../../../assets/wall-light-portrait.webp';
import { cn } from '../../../lib/utils';

export interface AmbientBackgroundProps {
  className?: string;
}

export function AmbientBackground({ className }: AmbientBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('fixed inset-0 pointer-events-none overflow-hidden z-0 select-none', className)}
    >
      {/* Drifting Wallpaper Stack */}
      <div className="absolute inset-0 animate-ambient">
        {/* Dark theme wallpapers */}
        <img
          src={wallDarkPortrait}
          alt=""
          className="absolute inset-0 w-full h-full object-cover block md:hidden light:hidden"
        />
        <img
          src={wallDark}
          alt=""
          className="absolute inset-0 w-full h-full object-cover hidden md:block light:hidden"
        />

        {/* Light theme wallpapers */}
        <img
          src={wallLightPortrait}
          alt=""
          className="absolute inset-0 w-full h-full object-cover hidden light:block light:md:hidden"
        />
        <img
          src={wallLight}
          alt=""
          className="absolute inset-0 w-full h-full object-cover hidden light:md:block"
        />
      </div>

      {/* Surface scrim overlay: 35% dark, 20% light */}
      <div className="absolute inset-0 bg-surface-0/35 light:bg-surface-0/20" />
    </div>
  );
}
