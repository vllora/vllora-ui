import { cn } from '@/lib/utils';

interface CellWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export const CellWrapper = ({ children, className }: CellWrapperProps) => {
  return <div className={cn('flex items-center py-3 px-3', className)}>{children}</div>;
};
