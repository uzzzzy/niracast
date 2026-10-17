import type React from 'react';
import idleArt from '../../../assets/idle-art.webp';
import { t } from '../../../lib/i18n';

interface IdleCardProps {
  channelName?: string;
}

export const IdleCard: React.FC<IdleCardProps> = ({ channelName }) => {
  return (
    <div
      className="absolute inset-0 flex items-end p-8 sm:p-12 md:p-16 bg-cover bg-center overflow-hidden"
      style={{ backgroundImage: `url("${idleArt}")` }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

      <div
        data-testid="idle-card"
        className="relative z-10 pointer-events-auto flex flex-col items-start gap-2 rounded-card border border-hairline glass-hud p-6 sm:p-8 shadow-2 transition-spring max-w-lg"
      >
        <span className="label-caps text-idle">{t('idle')}</span>
        <h2 className="title text-base sm:text-lg font-semibold tracking-tight text-fg">
          {t('idle_title')}
        </h2>
        <p className="text-xs sm:text-sm text-fg-muted">{channelName || t('standby')}</p>
      </div>
    </div>
  );
};
