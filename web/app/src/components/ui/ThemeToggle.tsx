import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { type ThemePreference, useTheme } from '../../lib/theme';
import { SegmentedControl, type SegmentedControlOption } from './SegmentedControl';

export interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { preference, setPreference } = useTheme();
  const { t } = useTranslation();

  const options: SegmentedControlOption<ThemePreference>[] = [
    {
      value: 'system',
      label: compact ? undefined : t('theme_system'),
      ariaLabel: t('theme_system'),
      icon: <Monitor className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    {
      value: 'light',
      label: compact ? undefined : t('theme_light'),
      ariaLabel: t('theme_light'),
      icon: <Sun className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    {
      value: 'dark',
      label: compact ? undefined : t('theme_dark'),
      ariaLabel: t('theme_dark'),
      icon: <Moon className="w-3.5 h-3.5" aria-hidden="true" />,
    },
  ];

  return (
    <SegmentedControl
      ariaLabel={t('theme')}
      options={options}
      value={preference}
      onChange={setPreference}
      className={className}
    />
  );
}
