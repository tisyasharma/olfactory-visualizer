import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { COLORS } from '@/utils/constants';
import type { RegionLoadByMouse } from '@/types';

interface BarDataPoint {
  region: string;
  regionLabel: string;
  group: string;
  ipsiValue: number;
  contraValue: number;
  totalValue: number;
}

interface GroupedBarChartProps {
  ipsiData: RegionLoadByMouse[];
  contraData: RegionLoadByMouse[];
  selectedRegions: Set<string>;
  regionNameToAcronym: Map<string, string>;
  onTooltipShow: (event: MouseEvent, content: string) => void;
  onTooltipHide: () => void;
}

export function GroupedBarChart({
  ipsiData,
  contraData,
  selectedRegions,
  regionNameToAcronym,
  onTooltipShow,
  onTooltipHide,
}: GroupedBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  useEffect(() => {
    if (!containerRef.current) return;

    d3.select(containerRef.current).selectAll('*').remove();

    if (!ipsiData.length && !contraData.length) {
      d3.select(containerRef.current)
        .append('div')
        .attr('class', 'muted')
        .style('padding', '40px')
        .style('text-align', 'center')
        .text('No data available');
      return;
    }

    const barData = buildBarData(ipsiData, contraData, selectedRegions, regionNameToAcronym);

    if (!barData.length) return;

    // Sort regions by max total value
    const maxByRegion = new Map<string, number>();
    barData.forEach((d) => {
      const current = maxByRegion.get(d.regionLabel) || 0;
      maxByRegion.set(d.regionLabel, Math.max(current, d.totalValue));
    });

    const sortedRegions = Array.from(maxByRegion.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label);

    drawBarChart(containerRef.current, barData, sortedRegions, onTooltipShow, onTooltipHide, zoomTransformRef);
  }, [ipsiData, contraData, selectedRegions, regionNameToAcronym]); // Remove tooltip callbacks from deps

  return <div ref={containerRef} className="dotplot-container" style={{ width: '100%', height: '100%' }} />;
}

function buildBarData(
  ipsiData: RegionLoadByMouse[],
  contraData: RegionLoadByMouse[],
  selectedRegions: Set<string>,
  regionNameToAcronym: Map<string, string>
): BarDataPoint[] {
  const regions = Array.from(selectedRegions);
  const barData: BarDataPoint[] = [];

  regions.forEach((region) => {
    ['Vglut1', 'Vgat'].forEach((genotype) => {
      // Calculate ipsilateral mean
      const ipsiValues = ipsiData
        .filter((d) => d.region === region && d.genotype === genotype)
        .map((d) => d.load_fraction)
        .filter((v): v is number => typeof v === 'number');
      const ipsiMean = ipsiValues.length > 0 ? (d3.mean(ipsiValues) || 0) * 100 : 0;

      // Calculate contralateral mean
      const contraValues = contraData
        .filter((d) => d.region === region && d.genotype === genotype)
        .map((d) => d.load_fraction)
        .filter((v): v is number => typeof v === 'number');
      const contraMean = contraValues.length > 0 ? (d3.mean(contraValues) || 0) * 100 : 0;

      const regionLabel = regionNameToAcronym.get(region) || region.substring(0, 25);
      const totalValue = ipsiMean + contraMean;

      if (totalValue > 0) {
        barData.push({
          region,
          regionLabel,
          group: genotype,
          ipsiValue: Math.max(ipsiMean, 0.001),
          contraValue: Math.max(contraMean, 0.001),
          totalValue: Math.max(totalValue, 0.001),
        });
      }
    });
  });

  return barData;
}

function drawBarChart(
  container: HTMLElement,
  barData: BarDataPoint[],
  sortedRegions: string[],
  onTooltipShow: (event: MouseEvent, content: string) => void,
  onTooltipHide: () => void,
  zoomTransformRef: React.MutableRefObject<d3.ZoomTransform>
) {
  const maxLabelChars = d3.max(sortedRegions, (l) => l.length) || 10;
  const leftMargin = Math.min(200, Math.max(110, maxLabelChars * 6.5));

  const margin = { top: 60, right: 32, bottom: 50, left: leftMargin };
  const rowHeight = 32;
  const minInnerHeight = 400;
  const innerHeight = Math.max(minInnerHeight, sortedRegions.length * rowHeight);
  const width = 900;
  const height = margin.top + margin.bottom + innerHeight;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('max-width', '900px')
    .style('height', 'auto');

  const genotypes = ['Vglut1', 'Vgat'];
  const color = d3.scaleOrdinal().domain(genotypes).range([COLORS.accent2, COLORS.accent1]);

  // Log scale for x-axis (store original for zoom)
  const xMin = 0.001;
  const xMax = 10000;
  const x0 = d3.scaleLog().domain([xMin, xMax]).range([margin.left, width - margin.right]).clamp(true);

  // Y scale for regions
  const y = d3
    .scaleBand()
    .domain(sortedRegions)
    .range([margin.top, height - margin.bottom])
    .paddingInner(0.25);

  // Sub-scale for genotypes within each region
  const ySub = d3
    .scaleBand()
    .domain(['Vgat', 'Vglut1'])
    .range([0, y.bandwidth()])
    .paddingInner(0.2);

  // Grid lines (will be updated on zoom)
  const logTicks = [1e-3, 1e-2, 1e-1, 1, 1e1, 1e2, 1e3, 1e4];
  const gridLines = svg
    .append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(logTicks)
    .enter()
    .append('line')
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#eef2f7')
    .attr('stroke-dasharray', '2,2')
    .attr('stroke-width', 1);

  function updateGrid(xScale: d3.ScaleLogarithmic<number, number>) {
    gridLines.attr('x1', (d) => xScale(d)).attr('x2', (d) => xScale(d));
  }

  updateGrid(x0);

  // Create bar groups for each genotype/region combination
  const barGroups = svg
    .append('g')
    .attr('class', 'bar-groups')
    .selectAll('g')
    .data(barData)
    .enter()
    .append('g')
    .attr('transform', (d) => `translate(0, ${(y(d.regionLabel) || 0) + (ySub(d.group) || 0)})`);

  // Ipsilateral bars (base layer, will be updated on zoom)
  const ipsiBars = barGroups
    .append('rect')
    .attr('class', 'ipsi-bar')
    .attr('y', 0)
    .attr('height', ySub.bandwidth())
    .attr('fill', (d) => color(d.group) as string)
    .attr('fill-opacity', 0.9)
    .style('cursor', 'pointer')
    .on('mouseenter', function (event: MouseEvent, d) {
      d3.select(this).attr('fill-opacity', 1);
      const tooltipContent = `
        <strong>${d.region}</strong><br/>
        ${d.group} Ipsilateral<br/>
        Value: ${d.ipsiValue.toFixed(3)}%
      `;
      onTooltipShow(event, tooltipContent);
    })
    .on('mouseleave', function () {
      d3.select(this).attr('fill-opacity', 0.9);
      onTooltipHide();
    });

  // Contralateral bars (stacked on top, will be updated on zoom)
  const contraBars = barGroups
    .append('rect')
    .attr('class', 'contra-bar')
    .attr('y', 0)
    .attr('height', ySub.bandwidth())
    .attr('fill', (d) => color(d.group) as string)
    .attr('fill-opacity', 0.5)
    .attr('stroke', (d) => color(d.group) as string)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,2')
    .style('cursor', 'pointer')
    .on('mouseenter', function (event: MouseEvent, d) {
      d3.select(this).attr('fill-opacity', 0.7);
      const tooltipContent = `
        <strong>${d.region}</strong><br/>
        ${d.group} Contralateral<br/>
        Value: ${d.contraValue.toFixed(3)}%
      `;
      onTooltipShow(event, tooltipContent);
    })
    .on('mouseleave', function () {
      d3.select(this).attr('fill-opacity', 0.5);
      onTooltipHide();
    });

  function updateBars(xScale: d3.ScaleLogarithmic<number, number>) {
    ipsiBars
      .attr('x', xScale(xMin))
      .attr('width', (d) => Math.max(1, xScale(Math.max(xMin, d.ipsiValue)) - xScale(xMin)));

    contraBars
      .attr('x', (d) => xScale(Math.max(xMin, d.ipsiValue)))
      .attr('width', (d) => {
        const contraStart = xScale(Math.max(xMin, d.ipsiValue));
        const contraEnd = xScale(Math.max(xMin, d.totalValue));
        return Math.max(0, contraEnd - contraStart);
      });
  }

  updateBars(x0);

  // Axes
  const supers: Record<string, string> = {
    '-': '\u207b',
    '0': '\u2070',
    '1': '\u00b9',
    '2': '\u00b2',
    '3': '\u00b3',
    '4': '\u2074',
    '5': '\u2075',
    '6': '\u2076',
    '7': '\u2077',
    '8': '\u2078',
    '9': '\u2079',
  };

  const formatPow = (d: d3.NumberValue, _index: number) => {
    const num = typeof d === 'number' ? d : d.valueOf();
    const p = Math.log10(num);
    if (!Number.isFinite(p)) return String(num);
    const pStr = String(p)
      .split('')
      .map((c) => supers[c] || c)
      .join('');
    return `10${pStr}`;
  };

  // X axis (will be updated on zoom)
  const xAxisG = svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height - margin.bottom})`);

  svg
    .append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call((g) => g.selectAll('text').attr('font-size', 13).attr('fill', '#1f2937'))
    .call((g) => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

  function updateAxes(xScale: d3.ScaleLogarithmic<number, number>) {
    const xAxis = d3.axisBottom(xScale).tickValues(logTicks).tickFormat(formatPow);
    xAxisG
      .call(xAxis)
      .call((g) => g.selectAll('text').attr('font-size', 13).attr('fill', '#1f2937'))
      .call((g) => g.selectAll('.domain').attr('stroke', '#cbd5e1'));
  }

  updateAxes(x0);

  // Axis labels
  svg
    .append('text')
    .attr('transform', `translate(${margin.left - 60}, ${(height - margin.bottom + margin.top) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('fill', '#1f2937')
    .attr('font-size', 13)
    .text('Mouse Brain Regions');

  svg
    .append('text')
    .attr('x', margin.left + (width - margin.left - margin.right) / 2)
    .attr('y', height - 10)
    .attr('text-anchor', 'middle')
    .attr('fill', '#1f2937')
    .attr('font-size', 13)
    .text('Mean normalized value (% of AON) [log scale]');

  // Legend
  const legendItems = [
    { label: 'Vglut1', colorKey: 'Vglut1', style: 'solid' },
    { label: 'Vgat', colorKey: 'Vgat', style: 'solid' },
    { label: 'Ipsilateral', colorKey: null, style: 'solid' },
    { label: 'Contralateral', colorKey: null, style: 'dashed' },
  ];

  const legendFontSize = 11;
  const legendG = svg.append('g');
  const legendX = margin.left + 20;
  const legendY = 20;

  legendG.attr('transform', `translate(${legendX}, ${legendY})`);

  let cursorX = 0;

  // Genotype legends
  [legendItems[0], legendItems[1]].forEach((item) => {
    const g = legendG.append('g').attr('transform', `translate(${cursorX}, 0)`);

    g.append('rect')
      .attr('width', 16)
      .attr('height', 10)
      .attr('fill', color(item.colorKey!) as string)
      .attr('fill-opacity', 0.8)
      .attr('stroke', color(item.colorKey!) as string)
      .attr('stroke-width', 1);

    g.append('text')
      .attr('x', 22)
      .attr('y', 8)
      .attr('fill', '#374151')
      .attr('font-size', legendFontSize)
      .text(item.label);

    cursorX += 80;
  });

  cursorX += 20;

  // Hemisphere legends
  [legendItems[2], legendItems[3]].forEach((item, idx) => {
    const g = legendG.append('g').attr('transform', `translate(${cursorX}, 0)`);

    g.append('rect')
      .attr('width', 16)
      .attr('height', 10)
      .attr('fill', '#64748b')
      .attr('fill-opacity', idx === 0 ? 0.9 : 0.5)
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', idx === 1 ? '3,2' : '0');

    g.append('text')
      .attr('x', 22)
      .attr('y', 8)
      .attr('fill', '#374151')
      .attr('font-size', legendFontSize)
      .text(item.label);

    cursorX += item.label.length * 6.5 + 30;
  });

  // Add zoom behavior (X-axis only for log scale)
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

      updateBars(x);
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
