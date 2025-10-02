import { RunDTO } from '@/types/common-type';
import { ModelCallSummaryTraces } from './ModelCallSummaryTraces';

export interface SummarySpansProps {
  run: RunDTO;
  isOpen?: boolean;
  isInSidebar?: boolean;
  onChevronClick?: () => void;
}

export const SummaryTraces = ({
  run,
  isOpen,
  isInSidebar,
  onChevronClick,
}: SummarySpansProps) => {
  return (
    <ModelCallSummaryTraces
      run={run}
      isOpen={isOpen}
      isInSidebar={isInSidebar}
      onChevronClick={onChevronClick}
    />
  );
};
