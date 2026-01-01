import { useEffect, useRef, useState, type RefObject } from 'react';
import * as d3 from 'd3';

interface UseD3ZoomOptions {
  scaleExtent?: [number, number];
  onZoom?: (transform: d3.ZoomTransform) => void;
}

interface UseD3ZoomReturn {
  zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null;
  currentTransform: d3.ZoomTransform;
  zoomLevel: number;
  resetZoom: () => void;
}

export function useD3Zoom(
  svgRef: RefObject<SVGSVGElement>,
  plotExtent: [[number, number], [number, number]],
  options: UseD3ZoomOptions = {}
): UseD3ZoomReturn {
  const { scaleExtent = [1, 6], onZoom } = options;

  const [currentTransform, setCurrentTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Create zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent(scaleExtent)
      .extent(plotExtent)
      .translateExtent(plotExtent)
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        const transform = event.transform;
        setCurrentTransform(transform);
        setZoomLevel(transform.k);
        onZoom?.(transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    return () => {
      svg.on('.zoom', null);
    };
  }, [svgRef, plotExtent, scaleExtent, onZoom]);

  const resetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    const svg = d3.select(svgRef.current);
    svg
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  return {
    zoomBehavior: zoomBehaviorRef.current,
    currentTransform,
    zoomLevel,
    resetZoom,
  };
}
