import { type CSSProperties } from 'react';

interface TooltipProps {
  content: string;
  visible: boolean;
  x: number;
  y: number;
  id?: string;
}

export function Tooltip({ content, visible, x, y, id = 'tooltip' }: TooltipProps) {
  const style: CSSProperties = {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    pointerEvents: 'none',
    zIndex: 9999,
  };

  return (
    <div
      id={id}
      className="tooltip"
      hidden={!visible}
      style={style}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
