import React from 'react';
import { ArrowRight, Image as ImageIcon, AudioLines, Video, Type } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ModalitiesDisplayProps {
  inputFormats: string[];
  outputFormats: string[];
  className?: string;
}

// Modality badge component with individual tooltips
const ModalityBadge: React.FC<{ kind: string; type: 'input' | 'output' }> = ({ kind, type }) => {
  const getTooltipText = () => {
    const typeText = type === 'input' ? 'Input' : 'Output';
    const kindText = kind.charAt(0).toUpperCase() + kind.slice(1);
    return `${kindText} ${typeText}`;
  };

  const renderIcon = () => {
    switch (kind.toLowerCase()) {
      case 'text':
        return (
          <span className="inline-flex items-center justify-center w-5 h-5">
            <Type className="w-4 h-4 text-zinc-300" />
          </span>
        );
      case 'image':
        return (
          <span className="inline-flex items-center justify-center w-5 h-5">
            <ImageIcon className="w-4 h-4 text-zinc-300" />
          </span>
        );
      case 'audio':
        return (
          <span className="inline-flex items-center justify-center w-5 h-5">
            <AudioLines className="w-4 h-4 text-zinc-300" />
          </span>
        );
      case 'video':
        return (
          <span className="inline-flex items-center justify-center w-5 h-5">
            <Video className="w-4 h-4 text-zinc-300" />
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center justify-center w-5 h-5">
            <Type className="w-4 h-4 text-zinc-300" />
          </span>
        );
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">
          {renderIcon()}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
        <p className="text-xs">{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
};

// Main modalities component
const Modalities: React.FC<{ input: string[]; output: string[] }> = ({ input, output }) => {
  // Remove duplicates while preserving order
  const uniqueInput = input.filter((format, index, array) => array.indexOf(format) === index);
  const uniqueOutput = output.filter((format, index, array) => array.indexOf(format) === index);

  return (
    <div className="inline-flex items-center gap-0.5">
      {/* Left side - input modalities */}
      {uniqueInput.map((format, i) => (
        <ModalityBadge key={`in-${format}-${i}`} kind={format} type="input" />
      ))}
      
      {/* Center arrow - fixed position */}
      <div className="flex items-center justify-center w-4 h-5 -mx-0.5">
        <ArrowRight className="w-3.5 h-3.5 text-zinc-500 opacity-70" />
      </div>
      
      {/* Right side - output modalities */}
      {uniqueOutput.map((format, i) => (
        <ModalityBadge key={`out-${format}-${i}`} kind={format} type="output" />
      ))}
    </div>
  );
};

export const ModalitiesDisplay: React.FC<ModalitiesDisplayProps> = ({
  inputFormats,
  outputFormats,
  className = ""
}) => {
  const modalityDescription = getModalityDescription(inputFormats, outputFormats);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`cursor-help ${className}`}>
          <Modalities input={inputFormats} output={outputFormats} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
        <div className="space-y-1">
          <p className="text-xs font-medium">Modalities</p>
          <p className="text-xs text-zinc-300">{modalityDescription}</p>
          <div className="space-y-0.5">
            <p className="text-xs text-zinc-400">Input: {inputFormats.join(', ')}</p>
            <p className="text-xs text-zinc-400">Output: {outputFormats.join(', ')}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// Helper function for description
const getModalityDescription = (inputFormats: string[], outputFormats: string[]): string => {
  const inputTypes = inputFormats
    .map(format => format.charAt(0).toUpperCase() + format.slice(1))
    .filter((type, index, array) => array.indexOf(type) === index);

  const outputTypes = outputFormats
    .map(format => format.charAt(0).toUpperCase() + format.slice(1))
    .filter((type, index, array) => array.indexOf(type) === index);

  return `${inputTypes.join(', ')} → ${outputTypes.join(', ')}`;
};


