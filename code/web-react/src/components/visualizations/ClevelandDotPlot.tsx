import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { COLORS } from '@/utils/constants';
import type { RegionLoadByMouse } from '@/types';

interface ChartDataPoint {
  region: string;
  regionLabel: string;
  group: string;
  subject?: string;
  value: number;
  valuePerc: number;
  sem: number;
  semPerc: number;
  n: number;
}

interface ClevelandDotPlotProps {
  ipsiData: RegionLoadByMouse[];
  contraData: RegionLoadByMouse[];
  selectedRegions: Set<string>;
  groupBy: 'genotype' | 'subject';
  regionNameToAcronym: Map<string, string>;
  onTooltipShow: (event: MouseEvent, content: string) => void;
  onTooltipHide: () => void;
}

export function ClevelandDotPlot({
  ipsiData,
  contraData,
  selectedRegions,
  groupBy,
  regionNameToAcronym,
  onTooltipShow,
  onTooltipHide,
}: ClevelandDotPlotProps) {
  const ipsiRef = useRef<HTMLDivElement>(null);
  const contraRef = useRef<HTMLDivElement>(null);
  const ipsiZoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const contraZoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  useEffect(() => {
    if (!ipsiRef.current || !contraRef.current) return;

    // Clear previous renders
    d3.select(ipsiRef.current).selectAll('*').remove();
    d3.select(contraRef.current).selectAll('*').remove();

    if (!ipsiData.length && !contraData.length) {
      d3.select(ipsiRef.current)
        .append('div')
        .attr('class', 'muted')
        .style('padding', '40px')
        .style('text-align', 'center')
        .text('No data available');
      return;
    }

    // Process data
    const ipsiChartData = buildChartData(ipsiData, selectedRegions, groupBy, regionNameToAcronym);
    const contraChartData = buildChartData(contraData, selectedRegions, groupBy, regionNameToAcronym);

    const regions = Array.from(selectedRegions);

    // Find max value across both charts for consistent scaling
    const maxVal = Math.max(
      d3.max(ipsiChartData, (d) => d.valuePerc + d.semPerc) || 1,
      d3.max(contraChartData, (d) => d.valuePerc + d.semPerc) || 1
    );

    // Draw both plots
    drawSinglePlot(ipsiRef.current, ipsiChartData, regions, maxVal, 'Ipsilateral', regionNameToAcronym, groupBy, onTooltipShow, onTooltipHide, ipsiZoomTransformRef);
    drawSinglePlot(contraRef.current, contraChartData, regions, maxVal, 'Contralateral', regionNameToAcronym, groupBy, onTooltipShow, onTooltipHide, contraZoomTransformRef);
  }, [ipsiData, contraData, selectedRegions, groupBy, regionNameToAcronym]); // Remove tooltip callbacks from deps

  return (
    <div className="rabies-panels">
      <div className="panel-a" ref={ipsiRef} style={{ flex: '1 1 50%', minWidth: 0 }} />
      <div className="panel-b" ref={contraRef} style={{ flex: '1 1 50%', minWidth: 0 }} />
    </div>
  );
}

function buildChartData(
  data: RegionLoadByMouse[],
  selectedRegions: Set<string>,
  groupBy: 'genotype' | 'subject',
  regionNameToAcronym: Map<string, string>
): ChartDataPoint[] {
  const regions = Array.from(selectedRegions);
  const chartData: ChartDataPoint[] = [];

  if (groupBy === 'genotype') {
    regions.forEach((region) => {
      ['Vglut1', 'Vgat'].forEach((genotype) => {
        const regionData = data.filter((d) => d.region === region && d.genotype === genotype);

        const values = regionData.map((d) => d.load_fraction).filter((v): v is number => typeof v === 'number');
        const mean = values.length > 0 ? d3.mean(values) || 0 : 0;
        const sem = values.length > 1 ? (d3.deviation(values) || 0) / Math.sqrt(values.length) : 0;

        chartData.push({
          region,
          regionLabel: regionNameToAcronym.get(region) || region.substring(0, 25),
          group: genotype,
          value: mean,
          valuePerc: mean * 100,
          sem,
          semPerc: sem * 100,
          n: values.length,
        });
      });
    });
  } else {
    // Subject-level grouping
    regions.forEach((region) => {
      const bySubject = new Map<string, { values: number[]; genotype: string }>();

      data
        .filter((d) => d.region === region && (d.genotype === 'Vglut1' || d.genotype === 'Vgat'))
        .forEach((d) => {
          const key = `${d.subject_id}::${d.genotype}`;
          const entry = bySubject.get(key) || { values: [], genotype: d.genotype || 'Vglut1' };
          if (typeof d.load_fraction === 'number') {
            entry.values.push(d.load_fraction);
          }
          bySubject.set(key, entry);
        });

      bySubject.forEach((entry, key) => {
        const [subject] = key.split('::');
        const mean = entry.values.length > 0 ? d3.mean(entry.values) || 0 : 0;

        chartData.push({
          region,
          regionLabel: regionNameToAcronym.get(region) || region.substring(0, 25),
          group: entry.genotype,
          subject,
          value: mean,
          valuePerc: mean * 100,
          sem: 0,
          semPerc: 0,
          n: 1,
        });
      });
    });
  }

  // Apply small pseudocount for log scale
  return chartData.map((d) => ({
    ...d,
    valuePerc: d.valuePerc > 0 ? d.valuePerc : 0.001,
  }));
}

function drawSinglePlot(
  container: HTMLElement,
  chartData: ChartDataPoint[],
  regions: string[],
  domainMax: number,
  hemisphere: string,
  regionNameToAcronym: Map<string, string>,
  groupBy: 'genotype' | 'subject',
  onTooltipShow: (event: MouseEvent, content: string) => void,
  onTooltipHide: () => void,
  zoomTransformRef: React.MutableRefObject<d3.ZoomTransform>
) {
  const margin = { top: 80, right: 60, bottom: 60, left: 140 };
  const rowHeight = 45;
  const minHeight = 500;
  const innerHeight = Math.max(minHeight, regions.length * rowHeight);
  const innerWidth = 560;
  const width = margin.left + innerWidth + margin.right;
  const height = margin.top + innerHeight + margin.bottom;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('height', 'auto');

  const minPositive = 0.001;
  const x0 = d3
    .scaleLog()
    .domain([minPositive, Math.max(domainMax, 1)])
    .range([margin.left, margin.left + innerWidth]);

  const regionLabels = regions.map((r) => regionNameToAcronym.get(r) || r.substring(0, 25));
  const y = d3.scalePoint().domain(regionLabels).range([margin.top, margin.top + innerHeight]).padding(0.35);

  const color = d3.scaleOrdinal().domain(['Vglut1', 'Vgat']).range([COLORS.accent2, COLORS.accent1]);

  // Plot background
  svg
    .append('rect')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', '#f8fafc');

  // Grid (will be updated on zoom)
  const xGridG = svg
    .append('g')
    .attr('class', 'x-grid')
    .attr('transform', `translate(0,${margin.top + innerHeight})`);

  // Y grid (static, doesn't need updates)
  svg
    .append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(() => ''))
    .call((g) => g.selectAll('line').attr('stroke', '#eef2f7'))
    .call((g) => g.selectAll('.domain').remove());

  function updateGrid(xScale: d3.ScaleLogarithmic<number, number>) {
    xGridG
      .call(d3.axisBottom(xScale).ticks(6).tickSize(-innerHeight).tickFormat(() => ''))
      .call((g) => g.selectAll('line').attr('stroke', '#eef2f7'))
      .call((g) => g.selectAll('.domain').remove());
  }

  updateGrid(x0);

  // Frame
  svg
    .append('rect')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', 'none')
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', 1.4);

  // Error bars (only for genotype grouping, will be updated on zoom)
  const errorBars = groupBy === 'genotype'
    ? svg
        .append('g')
        .attr('class', 'error-bars')
        .selectAll('line')
        .data(chartData)
        .enter()
        .append('line')
        .attr('y1', (d) => y(d.regionLabel) || 0)
        .attr('y2', (d) => y(d.regionLabel) || 0)
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 2)
    : null;

  // Points (will be updated on zoom)
  const pointSize = 140;
  const points = svg
    .append('g')
    .attr('class', 'points')
    .selectAll('path')
    .data(chartData)
    .enter()
    .append('path')
    .attr('d', (d) =>
      (d.group === 'Vglut1' ? d3.symbol().size(pointSize).type(d3.symbolSquare)() : d3.symbol().size(pointSize).type(d3.symbolCircle)()) as string
    )
    .attr('fill', (d) => color(d.group) as string)
    .attr('fill-opacity', 0.35)
    .attr('stroke', (d) => color(d.group) as string)
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .on('mouseenter', function (event: MouseEvent, d) {
      const tooltipContent = `
        <strong>${d.region}</strong><br/>
        ${d.group}<br/>
        Mean: ${d.valuePerc.toFixed(3)}%<br/>
        ${d.sem > 0 ? `SEM: ${d.semPerc.toFixed(3)}%<br/>` : ''}
        N: ${d.n}
      `;
      onTooltipShow(event, tooltipContent);
    })
    .on('mouseleave', () => onTooltipHide());

  function updatePoints(xScale: d3.ScaleLogarithmic<number, number>) {
    points.attr('transform', (d) => {
      const rotate = d.group === 'Vglut1' ? 45 : 0;
      const xVal = xScale(Math.max(minPositive, d.valuePerc));
      const yVal = y(d.regionLabel) || 0;
      return `translate(${xVal},${yVal}) rotate(${rotate})`;
    });

    if (errorBars) {
      errorBars
        .attr('x1', (d) => xScale(Math.max(minPositive, d.valuePerc - d.semPerc)))
        .attr('x2', (d) => xScale(Math.max(minPositive, d.valuePerc + d.semPerc)));
    }
  }

  updatePoints(x0);

  // Axes (X-axis will be updated on zoom)
  const xAxisG = svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${margin.top + innerHeight})`);

  svg
    .append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) => g.selectAll('text').attr('font-size', 13).attr('fill', '#1f2937'))
    .call((g) => g.selectAll('.domain, line').attr('stroke', '#94a3b8'));

  function updateAxes(xScale: d3.ScaleLogarithmic<number, number>) {
    xAxisG
      .call(d3.axisBottom(xScale).ticks(6))
      .call((g) => g.selectAll('text').attr('font-size', 14).attr('fill', '#1f2937'))
      .call((g) => g.selectAll('.domain, line').attr('stroke', '#94a3b8'));
  }

  updateAxes(x0);

  // Axis labels
  svg
    .append('text')
    .attr('x', margin.left + innerWidth / 2)
    .attr('y', height - 10)
    .attr('text-anchor', 'middle')
    .attr('fill', '#1f2937')
    .attr('font-size', 14)
    .text('Connectivity Strength (Log10, % of AON)');

  svg
    .append('text')
    .attr('transform', `translate(${margin.left - 70}, ${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('fill', '#1f2937')
    .attr('font-size', 14)
    .text('Mouse Brain Regions');

  // Legend
  const legendItems = [
    { label: `Vglut1 ${hemisphere}`, colorKey: 'Vglut1', shape: d3.symbolSquare, rotate: 45 },
    { label: `Vgat ${hemisphere}`, colorKey: 'Vgat', shape: d3.symbolCircle, rotate: 0 },
  ];

  const legendG = svg.append('g');
  const legendX = margin.left + innerWidth / 2 - 120;
  const legendY = 40;

  legendG.attr('transform', `translate(${legendX}, ${legendY})`);

  let cursorX = 0;
  legendItems.forEach((item) => {
    const g = legendG.append('g').attr('transform', `translate(${cursorX}, 0)`);

    g.append('path')
      .attr('d', d3.symbol().type(item.shape).size(100)() as string)
      .attr('fill', color(item.colorKey) as string)
      .attr('fill-opacity', 0.35)
      .attr('stroke', color(item.colorKey) as string)
      .attr('stroke-width', 2)
      .attr('transform', `rotate(${item.rotate})`);

    g.append('text')
      .attr('x', 16)
      .attr('y', 0)
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#374151')
      .attr('font-size', 12)
      .text(item.label);

    cursorX += item.label.length * 6.5 + 28;
  });

  // Add zoom behavior (X-axis only for log scale)
  const plotExtent: [[number, number], [number, number]] = [
    [margin.left, margin.top],
    [margin.left + innerWidth, margin.top + innerHeight],
  ];

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 6])
    .extent(plotExtent)
    .translateExtent(plotExtent)
    .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      const transform = event.transform;
      zoomTransformRef.current = transform; // Store transform
      // For log scales, we need to transform the domain, not just rescale
      const x = transform.rescaleX(x0);

      updatePoints(x);
      updateAxes(x);
      updateGrid(x);
    });

  svg.call(zoom);
  
  // Restore previous zoom state if it exists
  const savedTransform = zoomTransformRef.current;
  if (savedTransform && savedTransform.k !== 1) {
    svg.transition().duration(0).call(zoom.transform, savedTransform);
  }
}
