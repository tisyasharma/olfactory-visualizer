// Region and selection types

export interface RegionSelection {
  selectedRegions: Set<string>;
  availableRegions: string[];
  defaultRegions: string[];
  dataRegions: Set<string>;
}

export interface RegionRating {
  region: string;
  rating: 'strong' | 'moderate' | 'weak' | 'absent';
  notes?: string;
}

export interface RegionSearchState {
  searchQuery: string;
  filteredRegions: string[];
}
