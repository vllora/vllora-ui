import React from 'react';
import { cn } from '@/lib/utils';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';

interface ResizablePaneProps {
  direction: 'vertical' | 'horizontal';
  defaultSizes?: [number, number]; // Percentages that should add up to 100
  minSizes?: [number, number]; // Minimum sizes in percentage
  className?: string;
  children: [React.ReactNode, React.ReactNode]; // Exactly two children
}

export const ResizablePane: React.FC<ResizablePaneProps> = ({
  direction = 'vertical',
  defaultSizes = [50, 50],
  minSizes = [20, 20],
  className,
  children,
}) => {
  return (
    <ResizablePanelGroup
      direction={direction}
      className={cn('h-full w-full', className)}
    >
      <ResizablePanel 
        defaultSize={defaultSizes[0]} 
        minSize={minSizes[0]}
        className="overflow-auto"
      >
        {children[0]}
      </ResizablePanel>
      
      <ResizableHandle 
        withHandle={false}
        className="hover:bg-secondary transition-colors"
      />
      
      <ResizablePanel 
        defaultSize={defaultSizes[1]} 
        minSize={minSizes[1]}
        className="overflow-auto"
      >
        {children[1]}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
