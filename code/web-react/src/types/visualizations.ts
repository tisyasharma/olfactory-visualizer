// D3 Visualization types

import * as d3 from 'd3';

export type ZoomTransform = d3.ZoomTransform;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ZoomBehavior = d3.ZoomBehavior<any, any>;

export interface PlotDimensions {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface PlotExtent {
  x: [number, number];
  y: [number, number];
}

export interface TooltipPosition {
  x: number;
  y: number;
  content: string;
  visible: boolean;
}

export type ViewMode = 'diverging' | 'scatter' | 'dot' | 'bar';
