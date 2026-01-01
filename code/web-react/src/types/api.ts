// API Response Types

export interface RegionLoadByMouse {
  subject_id: string;
  region: string;
  hemisphere: 'left' | 'right' | 'bilateral';
  load: number;
  load_fraction: number;
  genotype: 'Vglut1' | 'Vgat' | 'Contra';
  details: string | null;
  experiment_type: string;
}

export interface RegionLoadSummary {
  region: string;
  hemisphere: 'left' | 'right' | 'bilateral';
  genotype: 'Vglut1' | 'Vgat' | 'Contra';
  mean_load_fraction: number;
  sem_load_fraction: number;
  n_mice: number;
}

export interface RegionTreeNode {
  region_id: number;
  name: string;
  acronym: string;
  parent_id: number | null;
  st_level: number;
  atlas_id: number;
  ontology_id: number;
}

export interface Subject {
  subject_id: string;
  sex: string | null;
  experiment_type: string | null;
  details: string | null;
}

export interface Session {
  session_id: string;
  subject_id: string;
  modality: string;
  session_date: string | null;
  protocol: string | null;
  notes: string | null;
}

export interface MicroscopyFile {
  file_id: number;
  session_id: string;
  subject_id: string;
  run: number;
  hemisphere: 'left' | 'right' | 'bilateral';
  path: string;
  sha256: string;
  created_at: string;
}

export interface ScRNASample {
  sample_id: string;
  subject_id: string;
  tissue_type: string | null;
  processing_date: string | null;
}

export interface ScRNACluster {
  cluster_id: number;
  sample_id: string;
  cluster_name: string;
  cell_count: number;
  marker_genes: string | null;
}

export interface ScRNAMarker {
  marker_id: number;
  sample_id: string;
  cluster_id: number;
  gene_name: string;
  avg_log2_fc: number;
  pval: number;
  pval_adj: number;
}

export type ExperimentType = 'rabies' | 'double_injection';
export type Hemisphere = 'left' | 'right' | 'bilateral';
export type Genotype = 'Vglut1' | 'Vgat' | 'Contra';
export type GroupByMode = 'genotype' | 'subject';
