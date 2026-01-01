import { useState, useCallback, type RefObject } from 'react';

interface TooltipState {
  content: string;
  visible: boolean;
  x: number;
  y: number;
}

interface UseTooltipReturn {
  tooltipState: TooltipState;
  showTooltip: (event: MouseEvent, content: string, containerRef?: RefObject<HTMLElement>) => void;
  hideTooltip: () => void;
}

export function useTooltip(): UseTooltipReturn {
  const [tooltipState, setTooltipState] = useState<TooltipState>({
    content: '',
    visible: false,
    x: 0,
    y: 0,
  });

  const showTooltip = useCallback(
    (event: MouseEvent, content: string, containerRef?: RefObject<HTMLElement>) => {
      const container = containerRef?.current || document.body;
      const containerRect = container.getBoundingClientRect();

      // Tooltip dimensions (approximate)
      const tooltipWidth = 250;
      const tooltipHeight = 100;
      const offset = 12;

      // Calculate desired position
      let desiredLeft = event.clientX - containerRect.left + offset;
      let desiredTop = event.clientY - containerRect.top + offset;

      // Boundary clamping
      const maxLeft = containerRect.width - tooltipWidth - 16;
      const maxTop = containerRect.height - tooltipHeight - 16;

      const clampedLeft = Math.max(0, Math.min(desiredLeft, maxLeft));
      const clampedTop = Math.max(0, Math.min(desiredTop, maxTop));

      setTooltipState({
        content,
        visible: true,
        x: clampedLeft,
        y: clampedTop,
      });
    },
    []
  );

  const hideTooltip = useCallback(() => {
    setTooltipState((prev) => ({ ...prev, visible: false }));
  }, []);

  return { tooltipState, showTooltip, hideTooltip };
}
