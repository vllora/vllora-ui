import { Clock10 } from "lucide-react";

interface InfoDisplayProps {
  info: string;
  type: string;
  className?: string;
}

export const InfoDisplay = ({ info, type, className = "" }: InfoDisplayProps) => {

  const displayType = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-b border-border ${className}`}>
      <div className="flex items-center gap-2">
        <Clock10 className="h-3.5 w-3.5 text-white" />
        <span className="text-xs text-white w-[65px]">{displayType}:</span>
        <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
          {info}
        </span>
      </div>
    </div>
  );
};