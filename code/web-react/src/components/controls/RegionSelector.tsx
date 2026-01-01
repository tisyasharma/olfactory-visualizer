import { useState, useMemo, type ChangeEvent } from 'react';

interface RegionSelectorProps {
  regions: string[];
  selectedRegions: Set<string>;
  onSelectionChange: (regions: Set<string>) => void;
  defaultRegions: string[];
  dataRegions?: Set<string>;
  searchPlaceholder?: string;
  id?: string;
}

export function RegionSelector({
  regions,
  selectedRegions,
  onSelectionChange,
  defaultRegions,
  dataRegions,
  searchPlaceholder = 'Type to search/add...',
  id = 'regionSearch',
}: RegionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter regions based on search query
  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) return regions;
    const query = searchQuery.toLowerCase();
    return regions.filter((region) => region.toLowerCase().includes(query));
  }, [regions, searchQuery]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleToggleRegion = (region: string) => {
    const newSelection = new Set(selectedRegions);
    if (newSelection.has(region)) {
      newSelection.delete(region);
    } else {
      newSelection.add(region);
    }
    onSelectionChange(newSelection);
  };

  const handleReset = () => {
    onSelectionChange(new Set(defaultRegions));
    setSearchQuery('');
  };

  const handleClear = () => {
    onSelectionChange(new Set());
    setSearchQuery('');
  };

  return (
    <div className="sidebar-block region-dropdown">
      <label className="sidebar-label">
        Search & Select Regions
        <input
          id={id}
          type="search"
          placeholder={searchPlaceholder}
          autoComplete="off"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </label>
      <div className="region-list">
        {filteredRegions.length === 0 && regions.length === 0 ? (
          <div className="muted small" style={{ padding: '12px', textAlign: 'center' }}>
            No regions available. Check API connection.
          </div>
        ) : filteredRegions.length === 0 ? (
          <div className="muted small" style={{ padding: '12px', textAlign: 'center' }}>
            No regions match "{searchQuery}"
          </div>
        ) : (
          filteredRegions.map((region) => {
            const hasData = dataRegions?.has(region);
            return (
              <label
                key={region}
                className={`region-item${hasData ? ' region-item--has-signal' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedRegions.has(region)}
                  onChange={() => handleToggleRegion(region)}
                />
                <span>{region}</span>
              </label>
            );
          })
        )}
      </div>
      <div className="sidebar-actions">
        <div className="sidebar-actions__buttons">
          <button
            type="button"
            className="btn btn--mini btn--ghost"
            onClick={handleReset}
          >
            Reset defaults
          </button>
          <button
            type="button"
            className="btn btn--mini btn--ghost"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
