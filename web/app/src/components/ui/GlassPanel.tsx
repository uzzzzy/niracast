import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

export type GlassMaterial = 'ultrathin' | 'thin' | 'regular' | 'thick' | 'hud';

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  material?: GlassMaterial;
  as?: ElementType;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

const materialClasses: Record<GlassMaterial, string> = {
  ultrathin: 'glass-ultrathin',
  thin: 'glass-thin',
  regular: 'glass',
  thick: 'glass-thick',
  hud: 'glass-hud',
};

export function GlassPanel({
  material = 'regular',
  as: Component = 'div',
  className,
  children,
  ref,
  ...rest
}: GlassPanelProps) {
  return (
    <Component
      ref={ref}
      className={cn(materialClasses[material], 'rounded-card', className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
