/**
 * usePromptScrollTracking
 *
 * Tracks scroll position in the records table to determine which topic group
 * is currently visible, enabling auto-update of the PromptInheritancePanel.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UsePromptScrollTrackingOptions {
  /** Ref to the scrollable container */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether auto-tracking is enabled */
  enabled: boolean;
  /** CSS selector for topic group header elements */
  groupHeaderSelector?: string;
}

interface PromptScrollTrackingResult {
  /** ID of the currently visible topic group */
  visibleTopicId: string | null;
  /** Whether auto-tracking is active */
  isAutoTracking: boolean;
  /** Enable auto-tracking */
  enableTracking: () => void;
  /** Disable auto-tracking */
  disableTracking: () => void;
}

export function usePromptScrollTracking({
  containerRef,
  enabled,
  groupHeaderSelector = "[data-topic-group]",
}: UsePromptScrollTrackingOptions): PromptScrollTrackingResult {
  const [visibleTopicId, setVisibleTopicId] = useState<string | null>(null);
  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const rafRef = useRef<number | null>(null);

  const enableTracking = useCallback(() => setIsAutoTracking(true), []);
  const disableTracking = useCallback(() => setIsAutoTracking(false), []);

  useEffect(() => {
    if (!enabled || !isAutoTracking) return;

    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const headers = container.querySelectorAll(groupHeaderSelector);
        const containerRect = container.getBoundingClientRect();
        const midpoint = containerRect.top + containerRect.height * 0.3;

        let closest: { id: string; distance: number } | null = null;

        headers.forEach(header => {
          const rect = header.getBoundingClientRect();
          const distance = Math.abs(rect.top - midpoint);
          const topicId = (header as HTMLElement).dataset.topicGroup;
          if (topicId && (!closest || distance < closest.distance)) {
            closest = { id: topicId, distance };
          }
        });

        if (closest) {
          setVisibleTopicId((closest as { id: string; distance: number }).id);
        }
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, isAutoTracking, containerRef, groupHeaderSelector]);

  return { visibleTopicId, isAutoTracking, enableTracking, disableTracking };
}
