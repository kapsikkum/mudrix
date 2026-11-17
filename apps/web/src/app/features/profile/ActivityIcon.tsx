import { GameControllerIcon, HeadphonesIcon } from '@phosphor-icons/react';
import type { ActivityType } from '@/util/profileActivity';

export function ActivityIcon({
  type,
  size = 16,
  className,
}: {
  type: ActivityType;
  size?: number;
  className?: string;
}) {
  const Icon = type === 'playing' ? GameControllerIcon : HeadphonesIcon;
  return <Icon size={size} className={className} aria-hidden />;
}
