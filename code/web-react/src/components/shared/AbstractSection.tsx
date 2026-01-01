import { useState, type ReactNode } from 'react';

interface AbstractSectionProps {
  title: string;
  titleIcon?: ReactNode;
  children: ReactNode;
  id?: string;
  defaultOpen?: boolean;
}

export function AbstractSection({
  title,
  titleIcon,
  children,
  id = 'abstractBody',
  defaultOpen = false,
}: AbstractSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggleId = `${id}Toggle`;

  return (
    <div className="abstract-plain">
      <div className="abstract-plain__head">
        <div className="abstract-plain__meta">
          <p className="kicker">
            {titleIcon}
            {title}
          </p>
        </div>
        <button
          id={toggleId}
          type="button"
          className="figure-insight__toggle figure-insight__toggle--right"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={id}
        >
          {isOpen ? 'Hide Experimental Rationale' : 'View Experimental Rationale'}
        </button>
      </div>
      <div id={id} className="abstract-plain__body" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
