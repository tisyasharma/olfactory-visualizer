// Typed API endpoint functions

import { fetchJson, buildUrl, API_BASE } from './client';
import type {
  RegionLoadByMouse,
  RegionLoadSummary,
  RegionTreeNode,
  Subject,
  Session,
  MicroscopyFile,
  ScRNASample,
  ScRNACluster,
  ScRNAMarker,
  ExperimentType,
  Hemisphere,
  GroupByMode,
} from '@/types';

// Region Load API
export interface RegionLoadParams {
  experiment_type?: ExperimentType;
  hemisphere?: Hemisphere;
  limit?: number;
  group_by?: GroupByMode;
  subject_id?: string;
  region_id?: number;
}

export const regionLoadAPI = {
  byMouse: (params?: RegionLoadParams) =>
    fetchJson<RegionLoadByMouse[]>(
      buildUrl(`${API_BASE}/region-load/by-mouse`, params as Record<string, string | number>)
    ),

  summary: (params?: RegionLoadParams) =>
    fetchJson<RegionLoadSummary[]>(
      buildUrl(`${API_BASE}/region-load/summary`, params as Record<string, string | number>)
    ),
};

// Regions API
export const regionsAPI = {
  tree: () => fetchJson<RegionTreeNode[]>(`${API_BASE}/regions/tree`),
};

// Subjects API
export const subjectsAPI = {
  list: () => fetchJson<Subject[]>(`${API_BASE}/subjects`),
};

// Sessions API
export const sessionsAPI = {
  list: (subjectId?: string) =>
    fetchJson<Session[]>(
      buildUrl(`${API_BASE}/sessions`, subjectId ? { subject_id: subjectId } : undefined)
    ),
};

// Files API
export const filesAPI = {
  list: (params?: { session_id?: string; subject_id?: string }) =>
    fetchJson<MicroscopyFile[]>(buildUrl(`${API_BASE}/files`, params as Record<string, string>)),
};

// Microscopy Stacks API
export interface MicroscopyStack {
  id: string;
  file_id: number;
  subject_id: string;
  session_id: string;
  run: number;
  hemisphere: string | null;
  name: string;
  url: string;
  path: string;
}

export const microscopyStacksAPI = {
  list: () => fetchJson<MicroscopyStack[]>(`${API_BASE}/microscopy-stacks`),
};

// scRNA API
export const scRNAAPI = {
  samples: () => fetchJson<ScRNASample[]>(`${API_BASE}/scrna/samples`),

  clusters: (sampleId: string) =>
    fetchJson<ScRNACluster[]>(buildUrl(`${API_BASE}/scrna/clusters`, { sample_id: sampleId })),

  markers: (sampleId: string, clusterId: number) =>
    fetchJson<ScRNAMarker[]>(
      buildUrl(`${API_BASE}/scrna/markers`, { sample_id: sampleId, cluster_id: clusterId })
    ),
};

// Upload API
export const uploadAPI = {
  microscopyFile: (formData: FormData) =>
    fetchJson(`${API_BASE}/microscopy-files`, {
      method: 'POST',
      body: formData,
    }),

  regionCounts: (formData: FormData) =>
    fetchJson(`${API_BASE}/region-counts`, {
      method: 'POST',
      body: formData,
    }),

  checkDuplicateMicroscopy: (hashes: string[]) =>
    fetchJson(`${API_BASE}/microscopy-files/check-duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hashes),
    }),

  checkDuplicateRegionCounts: (formData: FormData) =>
    fetchJson(`${API_BASE}/region-counts/check-duplicate`, {
      method: 'POST',
      body: formData,
    }),
};

// Status API
export interface StatusResponse {
  subjects: number;
  files: number;
  counts: number;
}

export const statusAPI = {
  get: () => fetchJson<StatusResponse>(`${API_BASE}/status`),
};
