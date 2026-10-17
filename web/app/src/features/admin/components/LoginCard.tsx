import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { ApiError, api } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';

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
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0B0B0E] p-6 text-[#F5F5F7]">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16161B] p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20 shadow-inner">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">{t('login_title')}</h2>
          <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{t('login_subtitle')}</p>
        </div>

        {sessionExpired && !errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <span>{t('session_expired')}</span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="studio-password"
              className="mb-1.5 block text-xs font-medium text-neutral-300"
            >
              {t('password_label')}
            </label>
            <div className="relative">
              <input
                id="studio-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password_placeholder')}
                disabled={isLoading}
                className="w-full rounded-xl border border-white/10 bg-[#22222A] px-3.5 py-2.5 pr-12 text-sm text-[#F5F5F7] placeholder-neutral-500 transition-colors focus:border-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('hide_password') : t('show_password')}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] rounded-lg"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#0A84FF] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[#0071E3] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('signing_in')}</span>
              </span>
            ) : (
              t('sign_in')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
