import { createContext, useContext, type ReactNode, useMemo } from 'react';
import { useApiData } from '@/hooks';
import { regionsAPI } from '@/api';
import type { RegionTreeNode } from '@/types';

interface RegionTreeContextValue {
  regions: RegionTreeNode[];
  regionNameToAcronym: Map<string, string>;
  regionAcronymToName: Map<string, string>;
  loading: boolean;
  error: Error | null;
}

const RegionTreeContext = createContext<RegionTreeContextValue | null>(null);

interface RegionTreeProviderProps {
  children: ReactNode;
}

export function RegionTreeProvider({ children }: RegionTreeProviderProps) {
  const { data: regions, loading, error } = useApiData(
    () => regionsAPI.tree(),
    []
  );

  const { regionNameToAcronym, regionAcronymToName } = useMemo(() => {
    if (!regions) {
      return {
        regionNameToAcronym: new Map(),
        regionAcronymToName: new Map(),
      };
    }

    const nameToAcronym = new Map<string, string>();
    const acronymToName = new Map<string, string>();

    regions.forEach((region) => {
      nameToAcronym.set(region.name, region.acronym);
      acronymToName.set(region.acronym, region.name);
    });

    return {
      regionNameToAcronym: nameToAcronym,
      regionAcronymToName: acronymToName,
    };
  }, [regions]);

  const value: RegionTreeContextValue = {
    regions: regions || [],
    regionNameToAcronym,
    regionAcronymToName,
    loading,
    error,
  };

  return (
    <RegionTreeContext.Provider value={value}>
      {children}
    </RegionTreeContext.Provider>
  );
}

export function useRegionTree(): RegionTreeContextValue {
  const context = useContext(RegionTreeContext);
  if (!context) {
    throw new Error('useRegionTree must be used within RegionTreeProvider');
  }
  return context;
}
