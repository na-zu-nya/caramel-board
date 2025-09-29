import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface MonthSectionHeaderProps extends HTMLAttributes<HTMLHeadingElement> {
  month: string;
  likeCount: number;
}

const formatLikeCount = (likeCount: number) => {
  const countLabel = likeCount === 1 ? 'like' : 'likes';
  return `${likeCount.toLocaleString('en-US')} ${countLabel}`;
};

/**
 * 月別のセクション見出し (プレゼンテーショナル)
 * - 月名は英語表記
 * - 隣にその月のいいね件数を表示
 */
export function MonthSectionHeader({
  month,
  likeCount,
  className,
  ...props
}: MonthSectionHeaderProps) {
  return (
    <h2 className={cn('flex items-baseline gap-2 text-2xl font-semibold', className)} {...props}>
      <span>{month}</span>
      <span className="text-base font-normal text-muted-foreground">
        {formatLikeCount(likeCount)}
      </span>
    </h2>
  );
}
