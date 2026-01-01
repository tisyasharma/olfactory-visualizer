import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { aggregateDualInjectionData, formatValue, type AggregatedDualInjectionData } from '@/utils';
import { COLORS } from '@/utils/constants';
import type { RegionLoadByMouse } from '@/types';

interface DivergingBarChartProps {
  data: RegionLoadByMouse[];
  selectedRegions: Set<string>;
  regionNameToAcronym: Map<string, string>;
  onTooltipShow: (event: MouseEvent, content: string) => void;
  onTooltipHide: () => void;
}

export function DivergingBarChart({
  data,
  selectedRegions,
  regionNameToAcronym,
  onTooltipShow,
  onTooltipHide,
}: DivergingBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

    // Aggregate and sort data
    let aggregated = aggregateDualInjectionData(data, selectedRegions);
    aggregated.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Dimensions
    const containerWidth = containerRef.current.clientWidth || 1000;
    const margin = { top: 50, right: 140, bottom: 60, left: 200 };
    const width = containerWidth;

    const rows = Math.max(aggregated.length, 8);
    const height = Math.max(margin.top + margin.bottom + rows * 28, 520);

    // Helper to get acronym
    const getAcronym = (regionName: string): string => {
      return regionNameToAcronym.get(regionName) || regionName.substring(0, 25);
    };

    // Calculate domain
    const calcDomain = (data: AggregatedDualInjectionData[] | null): [number, number] => {
      if (!data || data.length === 0) return [-30, 30];
      const maxAbs = Math.max(...data.map((d) => Math.abs(d.delta)));
      const extent = Math.max(maxAbs, 5);
      return [-extent * 1.1, extent * 1.1];
    };

    const xDomain = calcDomain(aggregated);
    const regions = aggregated.map((d) => getAcronym(d.region));

    // Scales
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]).nice();

    const y = d3.scaleBand().domain(regions).range([margin.top, height - margin.bottom]).padding(0.25);

    // Create SVG
    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto');

    // Zero line
    svg
      .append('line')
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', margin.top - 6)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5);

    // X axis
    svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6))
      .call((g) => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
      .call((g) => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

    // Y axis
    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSizeOuter(0))
      .call((g) => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937').attr('cursor', 'default'))
      .call((g) => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

    // Axis labels
    svg
      .append('text')
      .attr('transform', `translate(${margin.left - 60}, ${(height - margin.bottom + margin.top) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1f2937')
      .attr('font-size', 12.5)
      .text('Mouse Brain Regions');

    svg
      .append('text')
      .attr('x', margin.left + (width - margin.left - margin.right) / 2)
      .attr('y', height - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1f2937')
      .attr('font-size', 12.5)
      .text('Difference in percentage region covered by signal (Contra - VGLUT1)');

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

    const legendWrapper = svg
      .append('g')
      .attr('class', 'double-legend')
      .attr('transform', `translate(${legendX}, ${legendY})`);

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

      g.append('rect')
        .attr('width', swatchSize)
        .attr('height', swatchSize)
        .attr('fill', item.color)
        .attr('fill-opacity', 0.7)
        .attr('stroke', item.color)
        .attr('stroke-width', 1.4)
        .attr('rx', 3);

      g.append('text')
        .attr('x', swatchSize + 8)
        .attr('y', swatchSize - 2)
        .attr('fill', '#1f2937')
        .attr('font-size', legendFontSize)
        .attr('font-weight', 600)
        .text(item.label);

      const textWidth = item.label.length * (legendFontSize * 0.6);
      lx += swatchSize + 8 + textWidth + itemGap;
    });

    // Draw bars
    aggregated.forEach((d) => {
      const acronym = getAcronym(d.region);
      const yPos = y(acronym);
      if (yPos === undefined) return;

      const barHeight = y.bandwidth();
      const delta = d.delta;
      const color = delta >= 0 ? COLORS.accent1 : COLORS.accent2;

      const barX = delta >= 0 ? x(0) : x(delta);
      const barWidth = Math.abs(x(delta) - x(0));

      svg
        .append('rect')
        .attr('x', barX)
        .attr('y', yPos)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('fill', color)
        .attr('fill-opacity', 0.7)
        .attr('stroke', color)
        .attr('stroke-width', 1.2)
        .attr('rx', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('fill-opacity', 0.9);

          const tooltipContent = `
            <strong>${d.region}</strong><br/>
            <span style="color:${COLORS.accent2}">VGLUT1 Mean:</span> ${formatValue(d.generalMean)}%<br/>
            <span style="color:${COLORS.accent1}">Contra Mean:</span> ${formatValue(d.contraMean)}%<br/>
            <strong>Δ (Contra - VGLUT1):</strong> ${formatValue(delta)}%
          `;
          onTooltipShow(event, tooltipContent);
        })
        .on('mouseout', function () {
          d3.select(this).attr('fill-opacity', 0.7);
          onTooltipHide();
        });
    });
  }, [data, selectedRegions, regionNameToAcronym, onTooltipShow, onTooltipHide]);

  return <div ref={containerRef} className="dotplot-container" style={{ width: '100%', height: '100%' }} />;
}
