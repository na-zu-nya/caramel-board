import { cn } from '@/lib/utils';
import { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { getThumbnailPath } from '@/utils/thumbnailPath';

export interface EntityCardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  thumbnailSrc?: string | null;
  icon?: ReactNode; // fallback when no thumbnail
  // aspect: '16/9' | '1/1' or custom via style
  aspect?: '16/9' | '1/1';
  variant?: 'card' | 'tile';
}

export function EntityCard({
  asChild,
  title,
  subtitle,
  thumbnailSrc,
  icon,
  aspect = '1/1',
  variant = 'card',
  className,
  children,
  ...rest
}: EntityCardProps) {
  const aspectClass = aspect === '16/9' ? 'aspect-[16/9]' : 'aspect-square';

  const cardInner = (
    <>
      <div className={cn(aspectClass, 'relative overflow-hidden bg-gray-100')}>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc.startsWith('http') ? thumbnailSrc : getThumbnailPath(thumbnailSrc)}
            alt={typeof title === 'string' ? title : 'thumbnail'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl bg-gray-50">
            {icon}
          </div>
        )}
      </div>
      <div className="p-4 bg-white">
        <h3 className="font-medium text-sm truncate group-hover:text-blue-600 transition-colors">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </>
  );

  const tileInner = (
    <>
      <div className={cn(aspectClass, 'relative overflow-hidden rounded-lg bg-gray-100 border border-gray-200 transition-colors group-hover:border-gray-300')}>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc.startsWith('http') ? thumbnailSrc : getThumbnailPath(thumbnailSrc)}
            alt={typeof title === 'string' ? title : 'thumbnail'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl bg-gray-50">
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2">
        <h3 className="font-medium text-sm truncate group-hover:text-blue-600 transition-colors">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </>
  );

  const content = (
    <div className={cn('group cursor-pointer', variant === 'card' ? 'rounded-lg border border-gray-200 bg-white overflow-hidden' : '')}>
      {variant === 'card' ? cardInner : tileInner}
    </div>
  );

  if (asChild && children && isValidElement(children)) {
    return cloneElement(children as any, {
      ...rest,
      className: cn((children as any).props?.className, className),
      children: content,
    });
  }

  return (
    <div className={cn(className)} {...rest}>
      {content}
    </div>
  );
}
