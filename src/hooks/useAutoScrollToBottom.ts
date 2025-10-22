import { useCallback, useEffect, useRef, useState, RefObject } from "react";

interface UseAutoScrollToBottomOptions {
  isActive?: boolean;
  dependencies?: any[];
  threshold?: number;
}

interface UseAutoScrollToBottomResult<T extends HTMLElement> {
  containerRef: RefObject<T>;
  isAtBottom: boolean;
  isScrollable: boolean;
  scrollToBottom: () => void;
}

export function useAutoScrollToBottom<T extends HTMLElement>(
  options: UseAutoScrollToBottomOptions = {}
): UseAutoScrollToBottomResult<T> {
  const {
    isActive = true,
    dependencies = [],
    threshold = 10,
  } = options;
  const containerRef = useRef<T>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isScrollable, setIsScrollable] = useState(false);

  const updateScrollState = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const scrollableHeight = container.scrollHeight - container.clientHeight;
    if (scrollableHeight <= threshold) {
      setIsScrollable(false);
      setIsAtBottom(true);
      return;
    }
    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - threshold;

    setIsScrollable(true);
    setIsAtBottom((prev) => (prev !== atBottom ? atBottom : prev));
  }, [threshold]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      requestAnimationFrame(updateScrollState);
    });
  }, [updateScrollState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      updateScrollState();
    };
    container.addEventListener("scroll", handleScroll);
    updateScrollState();
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [updateScrollState]);

  useEffect(() => {
    if (!isActive) {
      updateScrollState();
      return;
    }

    if (isAtBottom) {
      scrollToBottom();
    } else {
      updateScrollState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isAtBottom, scrollToBottom, updateScrollState, ...dependencies]);

  useEffect(() => {
    updateScrollState();
  }, [updateScrollState, ...dependencies]);

  return {
    containerRef,
    isAtBottom,
    isScrollable,
    scrollToBottom,
  };
}
