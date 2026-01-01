interface LoadingSpinnerProps {
  label?: string;
  success?: boolean;
}

export function LoadingSpinner({ label = 'Loading...', success = false }: LoadingSpinnerProps) {
  return (
    <div className={`spinner${success ? ' spinner--success' : ''}`}>
      <div className="spinner__icon" />
      <span className="spinner__label">{label}</span>
    </div>
  );
}
