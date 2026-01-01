// Application constants

// Default region selections for different visualizations

export const DEFAULT_DUAL_INJECTION_REGIONS = [
  'Endopiriform nucleus, dorsal part',
  'Agranular insular area, ventral part, layer 5',
  'Agranular insular area, ventral part, layer 6b',
  'Submedial nucleus of the thalamus',
  'Agranular insular area, ventral part, layer 6a',
  'Agranular insular area, ventral part, layer 2/3',
  'Infralimbic area, layer 6b',
  'Claustrum',
  'Frontal pole, layer 6b',
  'Piriform area',
  'Agranular insular area, dorsal part, layer 5',
  'Frontal pole, layer 6a',
  'Cortical subplate',
  'Globus pallidus, external segment',
  'Agranular insular area, dorsal part, layer 2/3',
  'Ventral medial nucleus of the thalamus',
  'Dorsal limb',
  'Agranular insular area, dorsal part, layer 6b',
  'Agranular insular area, central part, layer 1',
  'Accessory olfactory bulb, mitral layer',
];

export const DEFAULT_RABIES_DOT_REGIONS = [
  'Nucleus of the lateral olfactory tract, layer 3',
  'Nucleus of the lateral olfactory tract, pyramidal layer',
  'Nucleus of the lateral olfactory tract, molecular layer',
  'Piriform area',
  'Dorsal peduncular area',
  'Taenia tecta, ventral part',
  'Taenia tecta, dorsal part',
  'Anterior olfactory nucleus',
  'Main olfactory bulb',
];

export const DEFAULT_RABIES_BAR_REGIONS = [
  'Anterior olfactory nucleus',
  'lateral olfactory tract, body',
  'anterior commissure, olfactory limb',
  'Main olfactory bulb',
  'Olfactory areas',
  'Piriform area',
  'Accessory olfactory bulb, mitral layer',
  'Endopiriform nucleus, dorsal part',
  'Olfactory tubercle',
  'Accessory olfactory bulb, glomerular layer',
  'Accessory olfactory bulb, granular layer',
  'olfactory nerve layer of main olfactory bulb',
  'Endopiriform nucleus, ventral part',
  'Piriform-amygdalar area',
];

// Color constants (also defined in CSS variables)
export const COLORS = {
  accent1: '#e71419', // Rabies tracing - red
  accent2: '#5471a9', // Dual injection - blue
  accent3: '#22c55e', // scRNA - green
  ink: '#111827',
  muted: '#6b7280',
  paper: '#ffffff',
  paperAlt: '#f7f8fb',
  border: '#e5e7eb',
} as const;

// Genotype color mapping
export const GENOTYPE_COLORS = {
  Vglut1: COLORS.accent2,
  Vgat: COLORS.accent1,
  Contra: COLORS.accent3,
} as const;
