import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import loginHero from '../../../assets/login-hero.webp';
import { Button } from '../../../components/ui/Button';
import { Field, Input } from '../../../components/ui/Field';
import { ApiError, api } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { AmbientBackground } from './AmbientBackground';

interface LoginCardProps {
  onSuccess: () => void;
  sessionExpired?: boolean;
}

export function LoginCard({ onSuccess, sessionExpired = false }: LoginCardProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await api.login(password);
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          if (err.retryAfter) {
            setErrorMessage(t('rate_limit_error', { sec: err.retryAfter }));
          } else {
            setErrorMessage(t('rate_limit_fallback'));
          }
        } else {
          setErrorMessage(t('invalid_password'));
        }
      } else {
        setErrorMessage(t('invalid_password'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-4 sm:p-6 lg:p-10 select-none">
      <AmbientBackground />
      <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center">
        {/* Left hero panel on wide screens */}
        <div className="relative hidden lg:flex flex-col justify-end aspect-4/3 w-full h-full min-h-[460px] rounded-sheet overflow-hidden border border-hairline shadow-2xl">
          <img src={loginHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* Subtle inner hairline */}
          <div className="pointer-events-none absolute inset-0 rounded-sheet border border-hairline" />
          {/* Dark bottom scrim */}
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none" />
          {/* Product name overlaid at bottom-left in .large-title with white text */}
          <div className="relative z-10 p-8">
            <h1 className="large-title text-white tracking-tight drop-shadow-sm">
              {t('studio_title')}
            </h1>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="w-full max-w-md mx-auto glass-thick rounded-sheet p-8 shadow-2xl">
          <div className="mb-6">
            <span className="label-caps mb-1.5 block">Admin</span>
            <h2 className="large-title text-fg">{t('login_title')}</h2>
            <p className="mt-2 text-xs text-fg-muted leading-relaxed">{t('login_subtitle')}</p>
          </div>

          {sessionExpired && !errorMessage && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-tile border border-idle/30 bg-idle/10 p-3 text-xs text-idle"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-idle" />
              <span>{t('session_expired')}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-tile border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label={t('password_label')} htmlFor="studio-password">
              <div className="relative">
                <Input
                  id="studio-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('password_placeholder')}
                  disabled={isLoading}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('hide_password') : t('show_password')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center text-fg-subtle hover:text-fg transition-colors focus-visible:outline-none rounded-control cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || !password.trim()}
              className="w-full mt-2 h-11 text-sm font-semibold"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('signing_in')}</span>
                </span>
              ) : (
                t('sign_in')
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
