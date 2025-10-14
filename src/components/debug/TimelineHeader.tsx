interface TimelineHeaderProps {
  titleWidth: number | string;
  totalDuration: number;
}

export const TimelineHeader = ({ titleWidth, totalDuration }: TimelineHeaderProps) => {
  return (
    <div className="flex w-full px-3 py-2">
      <div style={{ width: titleWidth }} className="flex-shrink-0"></div>
      <div className="flex-grow relative ml-2">
        <div className="relative w-full h-5">
          <div className="absolute left-0 bottom-1 text-[10px] text-foreground/60 font-semibold whitespace-nowrap">
            0.0s
          </div>
          <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
            {(totalDuration * 0.25 / 1000000).toFixed(1)}s
          </div>
          <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
            {(totalDuration * 0.5 / 1000000).toFixed(1)}s
          </div>
          <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
            {(totalDuration * 0.75 / 1000000).toFixed(1)}s
          </div>
          <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
            {(totalDuration / 1000000).toFixed(1)}s
          </div>
        </div>
      </div>
    </div>
  );
};
