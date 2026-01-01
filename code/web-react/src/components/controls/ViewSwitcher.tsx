interface ViewSwitcherProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Record<T, string>;
  vertical?: boolean;
  ariaLabel?: string;
}

export function ViewSwitcher<T extends string>({
  options,
  value,
  onChange,
  labels,
  vertical = false,
  ariaLabel = 'Select view',
}: ViewSwitcherProps<T>) {
  const getLabel = (option: T): string => {
    if (labels?.[option]) return labels[option];
    // Default: capitalize first letter and replace hyphens with spaces
    return option.charAt(0).toUpperCase() + option.slice(1).replace(/-/g, ' ');
  };

  return (
    <div
      className={`view-switcher${vertical ? ' view-switcher--vertical' : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`view-switcher__btn${value === option ? ' is-active' : ''}`}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
        >
          {getLabel(option)}
        </button>
      ))}
    </div>
  );
}
