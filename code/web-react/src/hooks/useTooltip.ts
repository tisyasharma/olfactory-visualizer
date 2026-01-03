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
    (event: MouseEvent, content: string, _containerRef?: RefObject<HTMLElement>) => {
      // Tooltip dimensions (approximate)
      const tooltipWidth = 250;
      const tooltipHeight = 100;
      const offset = 12;

      // Get mouse position relative to viewport
      let x = event.clientX + offset;
      let y = event.clientY + offset;

      // Keep tooltip within viewport bounds
      if (x + tooltipWidth > window.innerWidth) {
        x = event.clientX - tooltipWidth - offset;
      }

      if (y + tooltipHeight > window.innerHeight) {
        y = event.clientY - tooltipHeight - offset;
      }

      // Ensure tooltip doesn't go off left or top edge
      x = Math.max(offset, x);
      y = Math.max(offset, y);

      setTooltipState({
        content,
        visible: true,
        x,
        y,
      });
    },
    []
  );

  const hideTooltip = useCallback(() => {
    setTooltipState((prev) => ({ ...prev, visible: false }));
  }, []);

  return { tooltipState, showTooltip, hideTooltip };
}
