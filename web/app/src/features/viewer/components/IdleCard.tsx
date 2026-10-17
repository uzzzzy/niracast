import { Radio } from 'lucide-react';
import type React from 'react';
import { t } from '../../../lib/i18n';

interface IdleCardProps {
  channelName?: string;
}

export const IdleCard: React.FC<IdleCardProps> = ({ channelName }) => {
  return (
    <div
      data-testid="idle-card"
      className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-white/10 bg-[#16161B]/95 px-6 py-4 shadow-2xl transition-spring"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-[#0A84FF]">
        <Radio className="h-5 w-5 animate-pulse" />
      </div>
      <div className="text-left">
        <h2 className="text-base font-semibold tracking-tight text-[#F5F5F7]">{t('idle_title')}</h2>
        <p className="text-xs text-[#8E8E93]">{channelName || t('standby')}</p>
      </div>
    </div>
  );
};
