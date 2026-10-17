import type {
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  ref,
  ...rest
}: FieldProps) {
  return (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...rest}>
      <label htmlFor={htmlFor} className="label-caps text-fg-subtle">
        {label}
      </label>
      {children}
      {hint && !error && <div className="text-xs text-fg-subtle">{hint}</div>}
      {error && (
        <div className="text-xs text-danger" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, ref, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full h-9 px-3 text-sm bg-surface-2 border border-hairline rounded-control text-fg',
        'placeholder:text-fg-subtle mobile:min-h-11',
        'focus-visible:outline-none focus-visible:border-hairline-strong focus-visible:ring-2 focus-visible:ring-accent-soft',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ className, children, ref, ...rest }: SelectProps) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full h-9 px-3 text-sm bg-surface-2 border border-hairline rounded-control text-fg',
        'mobile:min-h-11',
        'focus-visible:outline-none focus-visible:border-hairline-strong focus-visible:ring-2 focus-visible:ring-accent-soft',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full p-3 text-sm bg-surface-2 border border-hairline rounded-control text-fg',
        'placeholder:text-fg-subtle min-h-[72px]',
        'focus-visible:outline-none focus-visible:border-hairline-strong focus-visible:ring-2 focus-visible:ring-accent-soft',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
}
