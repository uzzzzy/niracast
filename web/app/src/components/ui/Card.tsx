import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function Card({ as: Component = 'div', className, children, ref, ...rest }: CardProps) {
  return (
    <Component ref={ref} className={cn('surface-card rounded-card', className)} {...rest}>
      {children}
    </Component>
  );
}
