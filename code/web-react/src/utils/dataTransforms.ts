import * as d3 from 'd3';
import type { RegionLoadByMouse } from '@/types';

export interface AggregatedDualInjectionData {
  region: string;
  generalMean: number;
  contraMean: number;
  delta: number;
  nGeneral: number;
  nContra: number;
}

/**
 * Aggregate dual injection data for diverging bar and scatter plots
 */
export function aggregateDualInjectionData(
  data: RegionLoadByMouse[],
  selectedRegions?: Set<string>
): AggregatedDualInjectionData[] {
  if (selectedRegions && selectedRegions.size === 0) return [];

  const DENSITY_SCALE = 15;
  const byRegion = new Map<string, { generalVals: number[]; contraVals: number[] }>();

  data.forEach((d) => {
    if (selectedRegions && !selectedRegions.has(d.region)) return;

    const rawVal = d.load_fraction || 0;
    if (!Number.isFinite(rawVal)) return;

    // Convert decimals to percentages
    const val = rawVal >= 0 && rawVal <= 1 ? rawVal * 100 : rawVal;
    const scaledVal = val * DENSITY_SCALE;

    const entry = byRegion.get(d.region) || { generalVals: [], contraVals: [] };

    if (d.genotype === 'Vglut1') {
      entry.generalVals.push(scaledVal);
    } else if (d.genotype === 'Contra') {
      entry.contraVals.push(scaledVal);
    }

    byRegion.set(d.region, entry);
  });

  const result: AggregatedDualInjectionData[] = [];

  byRegion.forEach((vals, region) => {
    if (vals.generalVals.length === 0) return;

    const generalMean = d3.mean(vals.generalVals) || 0;
    const contraMean = vals.contraVals.length ? d3.mean(vals.contraVals) || 0 : 0;

    result.push({
      region,
      generalMean,
      contraMean,
      delta: contraMean - generalMean,
      nGeneral: vals.generalVals.length,
      nContra: vals.contraVals.length,
    });
  });

  return result;
}

export interface AggregatedRabiesData {
  region: string;
  genotype: 'Vglut1' | 'Vgat';
  hemisphere: 'left' | 'right';
  values: number[];
  mean: number;
  sem: number;
  n: number;
}

/**
 * Aggregate rabies tracing data
 */
export function aggregateRabiesData(
  data: RegionLoadByMouse[],
  _groupBy: 'genotype' | 'subject' = 'genotype'
): AggregatedRabiesData[] {
  const grouped = new Map<string, { values: number[]; genotype: 'Vglut1' | 'Vgat'; hemisphere: 'left' | 'right' }>();

  data.forEach((d) => {
    if (d.genotype !== 'Vglut1' && d.genotype !== 'Vgat') return;
    if (d.hemisphere !== 'left' && d.hemisphere !== 'right') return;

    const key = `${d.region}|${d.genotype}|${d.hemisphere}`;
    const entry = grouped.get(key) || { values: [], genotype: d.genotype, hemisphere: d.hemisphere };

    const val = d.load_fraction;
    if (Number.isFinite(val)) {
      entry.values.push(val);
    }

    grouped.set(key, entry);
  });

  const result: AggregatedRabiesData[] = [];

  grouped.forEach((entry, key) => {
    const [region] = key.split('|');
    const n = entry.values.length;

    if (n === 0) return;

    const mean = d3.mean(entry.values) || 0;
    let sem = 0;

    if (n > 1) {
      const variance = d3.variance(entry.values) || 0;
      sem = Math.sqrt(variance) / Math.sqrt(n);
    }

    result.push({
      region,
      genotype: entry.genotype,
      hemisphere: entry.hemisphere,
      values: entry.values,
      mean,
      sem,
      n,
    });
  });

  return result;
}

/**
 * Format numeric values for display
 */
export function formatValue(val: number): string {
  if (!Number.isFinite(val)) return '–';
  if (Math.abs(val) >= 1) return val.toFixed(2);
  if (val === 0) return '0';
  return val.toExponential(2);
}

/**
 * Normalize string for fuzzy matching
 */
export function normalizeString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Fuzzy match region names
 */
export function fuzzyMatchRegion(target: string, candidates: string[]): string | null {
  const normalized = normalizeString(target);

  // Exact match
  const exact = candidates.find((c) => normalizeString(c) === normalized);
  if (exact) return exact;

  // Contains match
  const contains = candidates.find((c) => normalizeString(c).includes(normalized));
  return contains || null;
}
