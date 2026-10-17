import type { HTMLAttributes, ReactNode, Ref } from 'react';
import placeholder1 from '../../assets/channel-placeholder-1.webp';
import placeholder2 from '../../assets/channel-placeholder-2.webp';
import placeholder3 from '../../assets/channel-placeholder-3.webp';
import { cn } from '../../lib/utils';

export interface ChannelArtProps extends HTMLAttributes<HTMLDivElement> {
  channelId: number;
  src?: string | null;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

const placeholders = [placeholder1, placeholder2, placeholder3];

export function getChannelArtPlaceholder(channelId: number): string {
  const index = Math.abs(channelId) % 3;
  return placeholders[index];
}

export function ChannelArt({
  channelId,
  src,
  children,
  className,
  style,
  ref,
  ...rest
}: ChannelArtProps) {
  const bgImage = src || getChannelArtPlaceholder(channelId);

  return (
    <div
      ref={ref}
      data-testid="channel-art"
      className={cn('relative bg-cover bg-center overflow-hidden', className)}
      style={{
        backgroundImage: `url("${bgImage}")`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
