import { type ReactNode } from 'react';

interface InterpretationPanelProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function InterpretationPanel({ children, defaultOpen = true }: InterpretationPanelProps) {
  return (
    <details className="figure-insight" open={defaultOpen}>
      <summary>
        <div className="figure-insight__header">
          <p className="kicker">How to Interpret This Data</p>
        </div>
        <span className="figure-insight__toggle" aria-hidden="true">
          View Interpretation
        </span>
      </summary>
      <div className="figure-insight__body">{children}</div>
    </details>
  );
}
