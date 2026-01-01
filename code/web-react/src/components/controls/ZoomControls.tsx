interface ZoomControlsProps {
  zoomLevel: number;
  onReset: () => void;
  id?: string;
}

export function ZoomControls({ zoomLevel, onReset, id = 'zoomLevel' }: ZoomControlsProps) {
  return (
    <div className="zoom-controls">
      <span id={id} className="zoom-controls__level">
        {zoomLevel.toFixed(1)}x
      </span>
      <span className="zoom-controls__divider">|</span>
      <button
        type="button"
        className="zoom-controls__btn"
        onClick={onReset}
        aria-label="Reset zoom"
      >
        Reset
      </button>
    </div>
  );
}
