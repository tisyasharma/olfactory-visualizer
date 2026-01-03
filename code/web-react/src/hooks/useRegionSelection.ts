import { useState, useEffect, useMemo } from 'react';

interface UseRegionSelectionOptions {
  availableRegions: string[];
  defaultRegions: string[];
  storageKey?: string;
  perViewDefaults?: Record<string, string[]>;
}

interface UseRegionSelectionReturn {
  selectedRegions: Set<string>;
  setSelectedRegions: (regions: Set<string>) => void;
  hasCustomSelection: boolean;
  resetToDefaults: () => void;
  clearSelection: () => void;
}

export function useRegionSelection(
  options: UseRegionSelectionOptions
): UseRegionSelectionReturn {
  const { availableRegions, defaultRegions, storageKey } = options;

  // Initialize with default regions
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(
    new Set(defaultRegions)
  );
  const [hasCustomSelection, setHasCustomSelection] = useState(false);

  // Load from localStorage if storageKey provided
  useEffect(() => {
    if (!storageKey) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSelectedRegions(new Set(parsed));
        setHasCustomSelection(true);
      }
    } catch {
      // localStorage may be unavailable or corrupted
    }
  }, [storageKey]);

  // Save to localStorage when selection changes
  useEffect(() => {
    if (!storageKey) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify([...selectedRegions]));
    } catch {
      // localStorage may be unavailable
    }
  }, [selectedRegions, storageKey]);

  // Filter out regions that don't exist in available regions
  const filteredSelection = useMemo(() => {
    const available = new Set(availableRegions);
    return new Set([...selectedRegions].filter((r) => available.has(r)));
  }, [selectedRegions, availableRegions]);

  const updateSelection = (regions: Set<string>) => {
    setSelectedRegions(regions);
    setHasCustomSelection(true);
  };

  const resetToDefaults = () => {
    setSelectedRegions(new Set(defaultRegions));
    setHasCustomSelection(false);
  };

  const clearSelection = () => {
    setSelectedRegions(new Set());
    setHasCustomSelection(true);
  };

  return {
    selectedRegions: filteredSelection,
    setSelectedRegions: updateSelection,
    hasCustomSelection,
    resetToDefaults,
    clearSelection,
  };
}
