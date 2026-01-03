import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { aggregateDualInjectionData, formatValue } from '@/utils';
import { COLORS } from '@/utils/constants';
import type { RegionLoadByMouse } from '@/types';

interface ScatterPlotProps {
  data: RegionLoadByMouse[];
  selectedRegions: Set<string>;
  onTooltipShow: (event: MouseEvent, content: string) => void;
  onTooltipHide: () => void;
}

export function ScatterPlot({ data, selectedRegions, onTooltipShow, onTooltipHide }: ScatterPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous render
    d3.select(containerRef.current).selectAll('*').remove();

    // Check for no data
    if (!data || data.length === 0) {
      d3.select(containerRef.current)
        .append('div')
        .attr('class', 'muted')
        .style('padding', '40px')
        .style('text-align', 'center')
        .text('No data available. Start the API server to load visualization data.');
      return;
    }

    // Aggregate data
    let aggregated = aggregateDualInjectionData(data, selectedRegions);

    // Filter for plottable points
    aggregated = aggregated.filter((d) => {
      const name = d.region.toLowerCase();
      const isInjectionSite = name.includes('anterior olfactory nucleus') || name.includes('aon');
      const nearZero = Math.abs(d.generalMean) < 1e-6 && Math.abs(d.contraMean) < 1e-6;
      return Number.isFinite(d.generalMean) && Number.isFinite(d.contraMean) && !isInjectionSite && !nearZero;
    });

    if (aggregated.length === 0) {
      d3.select(containerRef.current)
        .append('div')
        .attr('class', 'muted small')
        .style('padding', '20px')
        .text('No paired values to plot.');
      return;
    }

    // Dimensions
    const containerWidth = containerRef.current.clientWidth || 900;
    const width = Math.max(containerWidth, 900);
    const margin = { top: 80, right: 32, bottom: 52, left: 72 };
    const height = margin.top + margin.bottom + 420;

    const upper = 120;

    // Scales (store original for zoom)
    const x0 = d3.scaleLinear().domain([0, upper]).range([margin.left, width - margin.right]);
    const y0 = d3.scaleLinear().domain([0, upper]).range([height - margin.bottom, margin.top]);

    // Create SVG
    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto');

    // Store ref for zoom
    svgRef.current = svg.node();

    // Clip path
    const clipId = `scatter-clip-${Math.random().toString(36).slice(2, 8)}`;
    const clipPad = 8;
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', margin.left - clipPad)
      .attr('y', margin.top - clipPad)
      .attr('width', width - margin.left - margin.right + clipPad * 2)
      .attr('height', height - margin.top - margin.bottom + clipPad * 2);

    const plotArea = svg.append('g').attr('clip-path', `url(#${clipId})`);

    // Grid (will be updated on zoom)
    const xGrid = plotArea
      .append('g')
      .attr('class', 'x-grid')
      .attr('transform', `translate(0,${height - margin.bottom})`);

    const yGrid = plotArea
      .append('g')
      .attr('class', 'y-grid')
      .attr('transform', `translate(${margin.left},0)`);

    function updateGrid(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>) {
      xGrid
        .call(
          d3
            .axisBottom(xScale)
            .ticks(6)
            .tickSize(-(height - margin.top - margin.bottom))
            .tickFormat(() => '')
        )
        .call((g) => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
        .call((g) => g.selectAll('.domain, text').remove());

      yGrid
        .call(
          d3
            .axisLeft(yScale)
            .ticks(6)
            .tickSize(-(width - margin.left - margin.right))
            .tickFormat(() => '')
        )
        .call((g) => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
        .call((g) => g.selectAll('.domain, text').remove());
    }

    updateGrid(x0, y0);

    // Axes (with classes for zoom updates)
    const xAxisG = svg
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`);

    const yAxisG = svg
      .append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${margin.left},0)`);

    function updateAxes(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>) {
      xAxisG
        .call(d3.axisBottom(xScale).ticks(6))
        .call((g) => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
        .call((g) => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
        .call((g) => g.selectAll('line').attr('stroke', '#e5e7eb'));

      yAxisG
        .call(d3.axisLeft(yScale).ticks(6))
        .call((g) => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
        .call((g) => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
        .call((g) => g.selectAll('line').attr('stroke', '#e5e7eb'));
    }

    updateAxes(x0, y0);


    // Points
    const circles = plotArea
      .selectAll('circle')
      .data(aggregated)
      .enter()
      .append('circle')
      .attr('cx', (d) => x0(d.generalMean))
      .attr('cy', (d) => y0(d.contraMean))
      .attr('r', 6)
      .attr('fill', (d) => (d.delta >= 0 ? COLORS.accent1 : COLORS.accent2))
      .attr('fill-opacity', 0.6)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event: MouseEvent, d) {
        d3.select(this).attr('fill-opacity', 0.9).attr('r', 7);

        const tooltipContent = `
          <strong>${d.region}</strong><br/>
          Contra-projecting strength: ${formatValue(d.contraMean)}${Number.isFinite(d.nContra) ? ` (n=${d.nContra})` : ''}<br/>
          General VGLUT1 strength: ${formatValue(d.generalMean)}${Number.isFinite(d.nGeneral) ? ` (n=${d.nGeneral})` : ''}<br/>
          Δ (Contra - General): ${formatValue(d.delta)}
        `;
        onTooltipShow(event, tooltipContent);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('fill-opacity', 0.6).attr('r', 6);
        onTooltipHide();
      });

    // Identity line (needs to be updated on zoom)
    const identityLine = plotArea
      .append('line')
      .attr('x1', x0(0))
      .attr('y1', y0(0))
      .attr('x2', x0(upper))
      .attr('y2', y0(upper))
      .attr('stroke', COLORS.accent2)
      .attr('stroke-dasharray', '4,3')
      .attr('stroke-width', 1.6)
      .attr('opacity', 0.5);

    // Add zoom behavior
    const plotExtent: [[number, number], [number, number]] = [
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ];

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 6])
      .extent(plotExtent)
      .translateExtent(plotExtent)
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        const transform = event.transform;
        zoomTransformRef.current = transform; // Store transform
        const x = transform.rescaleX(x0);
        const y = transform.rescaleY(y0);

        // Update circles
        circles.attr('cx', (d) => x(d.generalMean)).attr('cy', (d) => y(d.contraMean));

        // Update identity line
        identityLine.attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(upper)).attr('y2', y(upper));

        // Update axes and grids
        updateAxes(x, y);
        updateGrid(x, y);
      });

    svg.call(zoom);
    
    // Restore previous zoom state if it exists (use setTimeout to ensure zoom is fully initialized)
    const savedTransform = zoomTransformRef.current;
    if (savedTransform && savedTransform.k !== 1) {
      // Use transition for smooth restoration
      svg.transition().duration(0).call(zoom.transform, savedTransform);
    }

    // Axis labels
    svg
      .append('text')
      .attr('x', margin.left + (width - margin.left - margin.right) / 2)
      .attr('y', height - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1f2937')
      .attr('font-size', 12.5)
      .text('General VGLUT1 strength');

    svg
      .append('text')
      .attr('transform', `translate(${margin.left - 46}, ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1f2937')
      .attr('font-size', 12.5)
      .text('Contra-Projecting strength');

    // Legend
    const legendItems = [
      { label: 'Contra-projecting', color: COLORS.accent1 },
      { label: 'VGLUT1 (General)', color: COLORS.accent2 },
    ];

    const legendFontSize = 12;
    const legendPadding = { x: 10, y: 7 };
    const swatchSize = 12;
    const itemGap = 14;

    const legendWidth =
      legendItems.reduce((acc, item) => {
        const textWidth = item.label.length * (legendFontSize * 0.6);
        return acc + swatchSize + 8 + textWidth + itemGap;
      }, -itemGap) +
      legendPadding.x * 2;

    const legendHeight = swatchSize + legendPadding.y * 2;
    const legendX = width - margin.right - legendWidth;
    const legendY = Math.max(8, margin.top - legendHeight - 6);

    const legendWrapper = svg.append('g').attr('transform', `translate(${legendX}, ${legendY})`);

    legendWrapper
      .append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('rx', 8)
      .attr('fill', '#fff')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    let lx = legendPadding.x;
    legendItems.forEach((item) => {
      const g = legendWrapper.append('g').attr('transform', `translate(${lx}, ${legendPadding.y})`);

      g.append('rect').attr('width', swatchSize).attr('height', swatchSize).attr('fill', item.color).attr('fill-opacity', 0.7).attr('stroke', item.color).attr('stroke-width', 1.4).attr('rx', 3);

      g.append('text').attr('x', swatchSize + 8).attr('y', swatchSize - 2).attr('fill', '#1f2937').attr('font-size', legendFontSize).attr('font-weight', 600).text(item.label);

      const textWidth = item.label.length * (legendFontSize * 0.6);
      lx += swatchSize + 8 + textWidth + itemGap;
    });
  }, [data, selectedRegions]); // Remove tooltip callbacks from deps to prevent re-renders

  return <div ref={containerRef} className="dotplot-container" style={{ width: '100%', height: '100%' }} />;
}
