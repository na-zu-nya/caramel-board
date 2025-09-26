import { cn } from '@/lib/utils';
import type { Dataset } from '@/types';
import { forwardRef } from 'react';

interface GridContainerProps {
  sidebarOpen: boolean;
  infoSidebarOpen: boolean;
  isEditPanelOpen: boolean;
  dataset?: Dataset;
  className?: string;
  children: React.ReactNode;
}

export const GridContainer = forwardRef<HTMLDivElement, GridContainerProps>(
  ({ sidebarOpen, infoSidebarOpen, isEditPanelOpen, dataset, className, children }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'fixed top-0 bottom-0 overflow-auto transition-all duration-300 ease-in-out',
          sidebarOpen ? 'left-80' : 'left-0',
          infoSidebarOpen || isEditPanelOpen ? 'right-80' : 'right-0',
          className
        )}
        style={{
          backgroundColor: dataset?.themeColor
            ? `color-mix(in oklch, ${dataset.themeColor} 10%, black)`
            : 'black',
        }}
      >
        {children}
      </div>
    );
  }
);

GridContainer.displayName = 'GridContainer';
