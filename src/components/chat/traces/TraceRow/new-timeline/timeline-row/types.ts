import { ReactNode } from "react";
import { Span } from "@/types/common-type";

// Base props for timeline content components
export interface TimelineContentBaseProps {
    level: number;
    hasChildren: boolean;
    isOpen: boolean;
    titleWidth: number | string;
    title: string;
    operationIcon: ReactNode;
    durationSeconds: number;
    onToggle: () => void;
}

// Main TimelineRow component props
export interface TimelineRowProps {
    span: Span;
    level: number;
    hasChildren: boolean;
    isOpen: boolean;
    titleWidth: number | string;
    title: string;
    operationIcon: React.ReactNode;
    durationSeconds: number;
    widthPercent: string;
    offsetPercent: string;
    onToggle: () => void;
}

// Props for the TimelineVisualization component
export interface TimelineVisualizationProps {
    span: Span;
    widthPercent: string;
    offsetPercent: string;
    selectedSpanId: string | null;
}
