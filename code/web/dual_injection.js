const diAccent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim() || '#e71419';
const diAccent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim() || '#5471a9';
const diAccent3 = getComputedStyle(document.documentElement).getPropertyValue('--accent3').trim() || '#22c55e';

const defaultDoubleDivergingRegions = [
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
  'Accessory olfactory bulb, mitral layer'
];

const doubleState = {
  search: '',
  view: 'diverging',
  selectedRegions: new Set(),
  selectedRegionsByView: { diverging: new Set(), scatter: new Set() },
  hasCustomSelection: false,
  regions: [],
  data: [],
  loading: false,
  regionNameToAcronym: {},
  forceEmptyPlot: false
};

// UI Elements (lookups inside functions are safer)
const getDoubleTooltip = () => document.getElementById('doubleTooltip');
const doubleZoomLevelEl = document.getElementById('doubleZoomLevel');
const doubleResetZoomBtn = document.getElementById('doubleResetZoomBtn');
let doubleZoomBehavior = null;
let doubleZoomTransform = d3.zoomIdentity;
let doublePlotRef = null;

function getInitialDoubleTransform(svg){
  // Default to identity so each render starts at a consistent 1.0x view.
  return d3.zoomIdentity;
}

function ensureDoubleSelections(){
  if(!doubleState.selectedRegionsByView){
    doubleState.selectedRegionsByView = { diverging: new Set(), scatter: new Set() };
  }
  ['diverging','scatter'].forEach(v => {
    if(!doubleState.selectedRegionsByView[v]){
      doubleState.selectedRegionsByView[v] = new Set();
    }
  });
}

function setDoubleView(view){
  const v = view === 'scatter' ? 'scatter' : 'diverging';
  doubleState.view = v;
  ensureDoubleSelections();
  doubleState.selectedRegions = doubleState.selectedRegionsByView[v];
}

function activeSelection(){
  ensureDoubleSelections();
  const set = doubleState.selectedRegionsByView[doubleState.view] || new Set();
  doubleState.selectedRegions = set;
  return set;
}

function setDefaultDoubleSelection(regions){
  ensureDoubleSelections();
  let available = Array.isArray(regions) ? regions : [];
  if(doubleState.view === 'scatter'){
    const plottable = new Set(
      aggregateDoubleData(null)
        .filter(d => Number.isFinite(d.generalMean) && Number.isFinite(d.contraMean))
        .filter(d => {
          const name = (d.region || '').toLowerCase();
          const isInjectionSite = name.includes('anterior olfactory nucleus') || name.includes('aon');
          const nearZero = Math.abs(d.generalMean) < 1e-6 && Math.abs(d.contraMean) < 1e-6;
          return !isInjectionSite && !nearZero;
        })
        .map(d => d.region)
    );
    available = available.filter(r => plottable.has(r));
  }
  const clean = (s='') => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const matchDefaultDiverging = () => {
    const matched = [];
    defaultDoubleDivergingRegions.forEach(def => {
      const exact = available.find(r => clean(r) === clean(def));
      const fuzzy = available.find(r => clean(r).includes(clean(def)));
      const pick = exact || fuzzy;
      if(pick && !matched.includes(pick)) matched.push(pick);
    });
    if(matched.length) return matched;
    return available.slice(0, 15);
  };
  const divergingSeed = matchDefaultDiverging();
  const scatterSeed = available.filter(r => {
    const name = (r || '').toLowerCase();
    return !name.includes('anterior olfactory nucleus') && !name.includes('aon');
  });
  const divergingSet = new Set(divergingSeed);
  const scatterSet = new Set(scatterSeed);
  doubleState.selectedRegionsByView.diverging = divergingSet;
  doubleState.selectedRegionsByView.scatter = scatterSet;
  doubleState.selectedRegions = doubleState.view === 'scatter' ? scatterSet : divergingSet;
  doubleState.hasCustomSelection = false;
  doubleState.forceEmptyPlot = false;
}

function renderDoubleInterpretation(){
  const el = document.getElementById('doubleInterpretation');
  if(!el) return;
  
  // Define content for both views to match the Rabies layout (Grid + Icons)
  const content = {
    diverging: `
      <div class="figure-insight__grid">
        <div class="figure-insight__block">
          <div class="insight-label">
            <span class="insight-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="3"></rect>
                <line x1="8" y1="16" x2="8" y2="12"></line>
                <line x1="12" y1="16" x2="12" y2="10"></line>
                <line x1="16" y1="16" x2="16" y2="8"></line>
              </svg>
            </span>
            <span>THE METRIC</span>
          </div>
          <ul class="insight-text" style="margin:0; padding-left:18px;">
            <li style="margin-bottom:4px;"><strong>Percentage Area Covered:</strong> Values represent the density of axonal collaterals in the target region.</li>
            <li><strong>The Delta (Difference):</strong> 
              <span style="color:var(--accent1); font-weight:600;">Red bars</span> indicate targets favored by Contra-projecting cells.<br/>
              <span style="color:var(--accent2); font-weight:600;">Blue bars</span> indicate targets favored by the General VGLUT1 population.
            </li>
          </ul>
        </div>
        <div class="figure-insight__divider" aria-hidden="true"></div>
        <div class="figure-insight__block">
          <div class="insight-label">
            <span class="insight-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v4"></path>
                <path d="M6.8 6.8 9.3 9.3"></path>
                <path d="M3 12h4"></path>
                <path d="M6.8 17.2 9.3 14.7"></path>
                <path d="M12 21v-4"></path>
                <path d="M17.2 17.2 14.7 14.7"></path>
                <path d="M21 12h-4"></path>
                <path d="M17.2 6.8 14.7 9.3"></path>
                <circle cx="12" cy="12" r="2.6"></circle>
              </svg>
            </span>
            <span>THE POPULATIONS</span>
          </div>
          <ul class="insight-text" style="margin:0; padding-left:18px;">
            <li style="margin-bottom:4px;"><strong>General VGLUT1 (Blue):</strong> Represents the broad output of normal excitatory neurons in the AON.</li>
            <li><strong>Contra-Projecting (Red):</strong> Represents the specific subset of neurons that project across the anterior commissure.</li>
          </ul>
        </div>
      </div>
      <div class="insight-fullrow">
        <div class="insight-label">
          <span class="insight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="3"></rect>
              <path d="M8 9h8"></path>
              <path d="M8 13h5"></path>
            </svg>
          </span>
          <span>WHAT THIS TELLS US</span>
        </div>
        <p class="insight-text">
          If the bars were all near zero, it would mean interhemispheric neurons are just "average" AON neurons. 
          <strong>Large diverging bars</strong> reveal that these neurons have a unique connectivity profile, preferentially targeting specific olfactory areas while avoiding others compared to their neighbors.
        </p>
      </div>
    `,
    scatter: `
      <div class="figure-insight__grid">
        <div class="figure-insight__block">
          <div class="insight-label">
            <span class="insight-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M3 3v18h18"></path>
              </svg>
            </span>
            <span>THE AXES</span>
          </div>
          <ul class="insight-text" style="margin:0; padding-left:18px;">
            <li style="margin-bottom:4px;"><strong>X-Axis (General VGLUT1):</strong> How strongly the general population projects to a region.</li>
            <li><strong>Y-Axis (Contra-Projecting):</strong> How strongly the specific interhemispheric neurons project to that same region.</li>
          </ul>
        </div>
        <div class="figure-insight__divider" aria-hidden="true"></div>
        <div class="figure-insight__block">
          <div class="insight-label">
            <span class="insight-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="20" x2="20" y2="4"></line>
                <circle cx="15" cy="9" r="2"></circle>
                <circle cx="9" cy="15" r="2"></circle>
              </svg>
            </span>
            <span>THE IDENTITY LINE</span>
          </div>
          <ul class="insight-text" style="margin:0; padding-left:18px;">
            <li style="margin-bottom:4px;"><strong>On the line:</strong> The region receives equal input from both populations (no specialization).</li>
            <li><strong>Above the line:</strong> The region is a preferred target of Contra-projecting cells.</li>
            <li><strong>Below the line:</strong> The region is avoided by Contra-projecting cells.</li>
          </ul>
        </div>
      </div>
      <div class="insight-fullrow">
        <div class="insight-label">
          <span class="insight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="3"></rect>
              <path d="M8 9h8"></path>
              <path d="M8 13h5"></path>
            </svg>
          </span>
          <span>WHAT THIS TELLS US</span>
        </div>
        <p class="insight-text">
          This plot tests for <strong>Scaling vs. Specialization</strong>. If Contra neurons were just "weaker" versions of VGLUT1 neurons, all points would fall on a straight line below the diagonal. 
          Deviations from the line indicate <strong>targeted rewiring</strong>, where specific regions are selectively upregulated or downregulated.
        </p>
      </div>
    `
  };

  // Select content based on current view
  el.innerHTML = doubleState.view === 'scatter' ? content.scatter : content.diverging;
}

function renderDoubleAbstractCopy(){
  const el = document.getElementById('doubleAbstractBody');
  if(el){
    el.innerHTML = `
      <div class="muted small">
        <p>
          <b>Rationale:</b> To determine if contralaterally projecting neurons have a distinct connectivity profile, we used an intersectional viral strategy. We injected Retrograde-Cre into one AON hemisphere and Cre-dependent GFP into the contralateral hemisphere. This labeled <i>only</i> the neurons projecting across the anterior commissure, allowing us to quantify their axonal collaterals brain-wide and compare them to the general VGLUT1+ population.
        </p>
        <p>
          <b>Context:</b> Collaterals (axonal branches) define a neuron's functional output. By comparing the collaterals of interhemispheric cells against the general VGLUT1 population, we determine if these neurons are "specialists" that strictly target olfactory areas or "generalists" that broadcast to the whole brain.
        </p>
        <p class="muted small" style="margin-top:8px;">
          <b>Method:</b> Intersectional Viral Tracing &nbsp;|&nbsp; <b>Target:</b> Commissural Neurons &nbsp;|&nbsp; N=4 mice
        </p>
      </div>
    `;
  }
}

function renderDoubleFigureHead(){
  const el = document.getElementById('doubleFigureHead');
  if(!el) return;
  const titles = {
    diverging: {
      main: 'Percentage Region Covered (Contra vs VGLUT1)',
      sub: 'Diverging bars highlight Contra-Projecting vs General VGLUT1 outputs'
    },
    scatter: {
      main: 'Contra-Projecting vs General Collaterals',
      sub: 'Scatter shows paired strengths per region (identity line = equal output)'
    }
  };
  const t = titles[doubleState.view] || titles.diverging;
  el.innerHTML = `
    <div class="figure-title" style="margin:0;">${t.main}</div>
    <div class="muted small" style="margin-bottom:6px;">${t.sub}</div>
  `;
}

function doubleRegionAcronym(name){
  return doubleState.regionNameToAcronym[name] || name;
}

function classifyDoubleGroup(row){
  const geno = (row?.genotype || '').toLowerCase();
  const exp = (row?.experiment_type || '').toLowerCase();
  if(geno === 'contra' || exp.startsWith('double')) return 'Contra';
  const details = (row?.details || '').toLowerCase();
  const pieces = [
    row.group,
    row.genotype,
    row.population,
    row.label,
    row.experiment_type,
    row.hemisphere
  ].filter(Boolean).join(' ').toLowerCase();

  const text = `${details} ${pieces}`;
  if(
    text.includes('contra') ||
    text.includes('commiss') ||
    text.includes('retro')
  ){
    return 'Contra';
  }
  return 'Vglut1';
}

function normalizeDoubleRow(row){
  if(!row) return null;
  const region = row.region || row.region_name || row.name;
  if(!region) return null;
  
  // Helper to find the numeric value
  const val = [row.collateral_density, row.load_fraction, row.load, row.value].find(v => Number.isFinite(parseFloat(v)));
  if(val === undefined) return null;
  
  return {
    region,
    group: classifyDoubleGroup(row),
    value: parseFloat(val),
    subject: row.subject_id || '',
    hemisphere: row.hemisphere || '',
    details: row.details || ''
  };
}

function aggregateDoubleData(regionsFilter){
  if(typeof d3 === 'undefined') return [];
  if(regionsFilter && regionsFilter.size === 0) return [];
  const DENSITY_SCALE = 15;
  
  // Aggregate means per region using scaled raw densities (no subject-level normalization)
  const byRegion = new Map();
  const selected = regionsFilter && regionsFilter.size ? regionsFilter : null;

  doubleState.data.forEach(d => {
    if(selected && !selected.has(d.region)) return;
    const rawVal = Number(d.value);
    if(!Number.isFinite(rawVal)) return;
    const val = rawVal >= 0 && rawVal <= 1 ? rawVal * 100 : rawVal; // convert decimals to %
    const scaledVal = val * DENSITY_SCALE;
    const entry = byRegion.get(d.region) || { generalVals: [], contraVals: [] };
    if(d.group === 'Vglut1'){
      entry.generalVals.push(scaledVal);
    } else {
      entry.contraVals.push(scaledVal);
    }
    byRegion.set(d.region, entry);
  });

  // 4. Calculate Deltas (only when General has signal)
  const result = [];
  byRegion.forEach((vals, region) => {
    if(vals.generalVals.length === 0) return;

    const generalMean = d3.mean(vals.generalVals) || 0;
    const contraMean = vals.contraVals.length ? d3.mean(vals.contraVals) : 0;
    
    result.push({
      region,
      generalMean,
      contraMean,
      delta: contraMean - generalMean,
      nGeneral: vals.generalVals.length,
      nContra: vals.contraVals.length
    });
  });

  return result;
}

function formatValue(val){
  if(!Number.isFinite(val)) return '–';
  if(Math.abs(val) >= 1) return val.toFixed(2);
  if(val === 0) return '0';
  return val.toExponential(2);
}

function renderDoubleLegend(svg, width, margin){
  const legendItems = [
    { label: 'Contra-projecting', color: diAccent1 },
    { label: 'VGLUT1 (General)', color: diAccent2 }
  ];
  const legendFontSize = 12;
  const legendPadding = { x: 10, y: 7 };
  const swatchSize = 12;
  const itemGap = 14;
  const legendWidth = legendItems.reduce((acc, item) => {
    const textWidth = item.label.length * (legendFontSize * 0.6);
    return acc + swatchSize + 8 + textWidth + itemGap;
  }, -itemGap) + legendPadding.x * 2;
  const legendHeight = swatchSize + legendPadding.y * 2;
  const legendX = width - margin.right - legendWidth;
  const legendY = Math.max(8, margin.top - legendHeight - 6);
  const legendWrapper = svg.append('g').attr('class','double-legend').attr('transform', `translate(${legendX}, ${legendY})`);
  legendWrapper.append('rect')
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', '#fff')
    .attr('stroke', '#e5e7eb')
    .attr('stroke-width', 1);
  let lx = legendPadding.x;
  legendItems.forEach(item => {
    const g = legendWrapper.append('g').attr('transform', `translate(${lx}, ${legendPadding.y})`);
    g.append('rect')
      .attr('width', swatchSize)
      .attr('height', swatchSize)
      .attr('fill', item.color)
      .attr('fill-opacity', 0.7)
      .attr('stroke', item.color)
      .attr('stroke-width', 1.4)
      .attr('rx', 3)
      .attr('ry', 3);
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
}

function showDoubleTooltip(event, content){
  const el = getDoubleTooltip();
  if(!el) return;
  el.innerHTML = content;
  el.hidden = false;
  // Anchor tooltip top-left to the cursor and clamp within the chart container (matches rabies behavior)
  const parent = el.parentElement || document.body;
  const parentRect = parent.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const desiredLeft = event.clientX - parentRect.left;
  const desiredTop = event.clientY - parentRect.top;
  const maxLeft = parentRect.width - rect.width;
  const maxTop = parentRect.height - rect.height;
  const clampedLeft = Math.max(0, Math.min(desiredLeft, maxLeft));
  const clampedTop = Math.max(0, Math.min(desiredTop, maxTop));
  el.style.left = `${clampedLeft}px`;
  el.style.top = `${clampedTop}px`;
}

function hideDoubleTooltip(){
  const el = getDoubleTooltip();
  if(el) el.hidden = true;
}

function updateDoubleZoomLevel(){
  if(!doubleZoomLevelEl) return;
  const k = doubleZoomTransform?.k || 1;
  doubleZoomLevelEl.textContent = `${k.toFixed(1)}x`;
}

function resetDoubleZoom(){
  // Match the initial transform used in initDoubleZoom
  const initT = getInitialDoubleTransform(doublePlotRef?.svg);
  doubleZoomTransform = initT;
  if(doublePlotRef?.svg && doubleZoomBehavior){
    doublePlotRef.svg.transition().duration(300).call(doubleZoomBehavior.transform, doubleZoomTransform);
  }
  updateDoubleZoomLevel();
}

function initDoubleZoom(ref){
  doublePlotRef = ref;
  if(!ref?.svg) return;
  // Start slightly zoomed out for a full-fit view
  const initialTransform = getInitialDoubleTransform(ref.svg);
  doubleZoomBehavior = d3.zoom()
    .scaleExtent([1, 6]);
  if(ref.plotExtent){
    doubleZoomBehavior
      .extent(ref.plotExtent)
      .translateExtent(ref.plotExtent);
  }
  doubleZoomBehavior.on('zoom', (event) => {
      doubleZoomTransform = event.transform;
      if(ref.type === 'diverging'){
        const newX = event.transform.rescaleX(ref.x0);
        ref.bars
          .attr('x', d => d.delta >= 0 ? newX(0) : newX(d.delta))
          .attr('width', d => Math.max(1, Math.abs(newX(d.delta) - newX(0))));
        ref.zeroLine
          .attr('x1', newX(0))
          .attr('x2', newX(0));
        ref.xAxisG
          .call(d3.axisBottom(newX).ticks(6))
          .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
          .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));
      }else if(ref.type === 'scatter'){
        const newX = event.transform.rescaleX(ref.x0);
        const newY = event.transform.rescaleY(ref.y0);
        ref.points
          .attr('cx', d => newX(d.generalMean))
          .attr('cy', d => newY(d.contraMean));
        ref.identityLine
          .attr('x1', newX(0)).attr('y1', newY(0))
          .attr('x2', newX(ref.upper)).attr('y2', newY(ref.upper));
        ref.xAxisG
          .call(d3.axisBottom(newX).ticks(6))
          .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
          .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
          .call(g => g.selectAll('line').attr('stroke', '#e5e7eb'));
        ref.yAxisG
          .call(d3.axisLeft(newY).ticks(6))
          .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
          .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
          .call(g => g.selectAll('line').attr('stroke', '#e5e7eb'));
        ref.xGrid
          .call(ref.xGridGen.scale(newX))
          .call(g => g.selectAll('line').attr('stroke','#eef2f7').attr('stroke-width',1))
          .call(g => g.selectAll('.domain, text').remove());
        ref.yGrid
          .call(ref.yGridGen.scale(newY))
          .call(g => g.selectAll('line').attr('stroke','#eef2f7').attr('stroke-width',1))
          .call(g => g.selectAll('.domain, text').remove());
      }
      updateDoubleZoomLevel();
    });

  ref.svg.call(doubleZoomBehavior).on('dblclick.zoom', null);
  doubleZoomTransform = initialTransform;
  ref.svg.call(doubleZoomBehavior.transform, initialTransform);
  updateDoubleZoomLevel();
}

function drawDivergingBarChart(){
  const containerNode = document.getElementById('doubleDivergingPlot');
  if(!containerNode) return;

  const debugEl = document.getElementById('di-debug-log');
  if(debugEl){
    debugEl.style.display = 'none';
    debugEl.textContent = '';
  }

  const container = d3.select(containerNode);
  container.selectAll('*').remove();
  
  const selection = activeSelection();
  const emptyState = doubleState.forceEmptyPlot || selection.size === 0;

  const rect = containerNode.getBoundingClientRect();
  const parentWidth = containerNode.parentElement?.getBoundingClientRect?.().width || 0;
  const panelWidth = containerNode.closest('.figure-panel')?.getBoundingClientRect?.().width || 0;
  const computedWidth = Math.max(rect?.width || 0, parentWidth || 0, panelWidth || 0);
  const width = Math.max(computedWidth, 900);
  const margin = { top: 80, right: 24, bottom: 50, left: 100 };

  if(emptyState){
    // Render an empty frame (no ticks/labels) but keep axes and zero line.
    const placeholderRegions = defaultDoubleDivergingRegions;
    const rows = Math.max(placeholderRegions.length, 8);
    const height = Math.max(margin.top + margin.bottom + rows * 28, 520);
    const x = d3.scaleLinear().domain([-35, 15]).range([margin.left, width - margin.right]).clamp(true);
    const y = d3.scaleBand().domain(placeholderRegions).range([margin.top, height - margin.bottom]).padding(0.25);

    const svg = container.append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio','xMidYMid meet')
      .style('width','100%')
      .style('height','auto');

    const zeroLine = svg.append('line')
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', margin.top - 6)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5);

    const xAxisG = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6))
      .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
      .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSizeOuter(0))
      .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'))
      .call(g => g.selectAll('text').remove());

    svg.append('text')
      .attr('transform', `translate(${margin.left - 60}, ${(height - margin.bottom + margin.top)/2}) rotate(-90)`)
      .attr('text-anchor','middle')
      .attr('fill','#1f2937')
      .attr('font-size', 12.5)
      .text('Mouse Brain Regions');

    svg.append('text')
      .attr('x', margin.left + (width - margin.left - margin.right)/2)
      .attr('y', height - 12)
      .attr('text-anchor','middle')
      .attr('fill','#1f2937')
      .attr('font-size', 12.5)
      .text('Difference in percentage region covered by signal (Contra - VGLUT1)');

    renderDoubleLegend(svg, width, margin);

    initDoubleZoom({
      type: 'diverging',
      svg,
      x0: x,
      bars: svg.append('g'),
      zeroLine,
      xAxisG
    });
    return;
  }

  let data = aggregateDoubleData(selection);
  // Sort by magnitude of difference so the largest percentage changes surface first.
  data.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  console.log(`Drawing Diverging Bars: ${data.length} regions`);
  
  if(!data.length){
    const placeholderRegions = defaultDoubleDivergingRegions;
    const rows = Math.max(placeholderRegions.length, 8);
    const height = Math.max(margin.top + margin.bottom + rows * 28, 520);
    const x = d3.scaleLinear().domain([-35, 15]).range([margin.left, width - margin.right]).clamp(true);
    const y = d3.scaleBand().domain(placeholderRegions).range([margin.top, height - margin.bottom]).padding(0.25);

    const svg = container.append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio','xMidYMid meet')
      .style('width','100%')
      .style('height','auto');

    const zeroLine = svg.append('line')
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', margin.top - 6)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5);

    const xAxisG = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6))
      .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
      .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSizeOuter(0))
      .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'))
      .call(g => g.selectAll('text').remove());

    svg.append('text')
      .attr('transform', `translate(${margin.left - 60}, ${(height - margin.bottom + margin.top)/2}) rotate(-90)`)
      .attr('text-anchor','middle')
      .attr('fill','#1f2937')
      .attr('font-size', 12.5)
      .text('Mouse Brain Regions');

    svg.append('text')
      .attr('x', margin.left + (width - margin.left - margin.right)/2)
      .attr('y', height - 12)
      .attr('text-anchor','middle')
      .attr('fill','#1f2937')
      .attr('font-size', 12.5)
      .text('Difference in percentage region covered by signal (Contra - VGLUT1)');

    renderDoubleLegend(svg, width, margin);

    initDoubleZoom({
      type: 'diverging',
      svg,
      x0: x,
      bars: svg.append('g'),
      zeroLine,
      xAxisG
    });
    return;
  }
  
  const labelMap = {};
  data.forEach(d => {
    const label = doubleRegionAcronym(d.region);
    labelMap[label] = d.region;
  });
  const minDelta = d3.min(data, d => d.delta) || 0;
  const maxDelta = d3.max(data, d => d.delta) || 0;
  const padding = (maxDelta - minDelta) * 0.1;
  const xDomain = [minDelta - padding, maxDelta + padding];
  if(xDomain[0] === xDomain[1]){
    xDomain[0] -= 1;
    xDomain[1] += 1;
  }
  if(xDomain[0] > 0) xDomain[0] = 0;
  if(xDomain[1] < 0) xDomain[1] = 0;
  const regions = data.map(d => doubleRegionAcronym(d.region));
  const rows = Math.max(regions.length, 8);
  const height = Math.max(margin.top + margin.bottom + rows * 28, 520);
  const x = d3.scaleLinear()
    .domain(xDomain)
    .range([margin.left, width - margin.right])
    .nice();
  const y = d3.scaleBand().domain(regions).range([margin.top, height - margin.bottom]).padding(0.25);

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  // Zero line
  const zeroLine = svg.append('line')
    .attr('x1', x(0))
    .attr('x2', x(0))
    .attr('y1', margin.top - 6)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#cbd5e1')
    .attr('stroke-width', 1.5);

  // Axes
  const xAxisG = svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

  const yAxisG = svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937').attr('cursor','default'));
  yAxisG.selectAll('text').append('title').text(t => labelMap[t] || t);

  svg.append('text')
    .attr('transform', `translate(${margin.left - 60}, ${(height - margin.bottom + margin.top)/2}) rotate(-90)`)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('Mouse Brain Regions');

  svg.append('text')
    .attr('x', margin.left + (width - margin.left - margin.right)/2)
    .attr('y', height - 12)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('Difference in percentage region covered by signal (Contra - VGLUT1)');

  renderDoubleLegend(svg, width, margin);

  // Bars
  const bars = svg.append('g')
    .selectAll('rect')
    .data(data)
    .enter()
    .append('rect')
    .attr('x', d => d.delta >= 0 ? x(0) : x(d.delta))
    .attr('y', d => y(doubleRegionAcronym(d.region)))
    .attr('width', d => Math.max(1, Math.abs(x(d.delta) - x(0))))
    .attr('height', y.bandwidth())
    .attr('fill', d => d.delta >= 0 ? diAccent1 : diAccent2) // Match rabies palette: red/orange for Contra > General, blue for General > Contra
    .attr('fill-opacity', 0.85)
    .on('mouseenter', (event, d) => {
      const html = `
        <strong>${d.region}</strong><br/>
        Contra: ${formatValue(d.contraMean)} (n=${d.nContra})<br/>
        General: ${formatValue(d.generalMean)} (n=${d.nGeneral})<br/>
        Δ: ${formatValue(d.delta)}
      `;
      showDoubleTooltip(event, html);
    })
    .on('mouseleave', hideDoubleTooltip);

  initDoubleZoom({
    type: 'diverging',
    svg,
    x0: x,
    bars,
    zeroLine,
    xAxisG
  });
}

function drawScatterPlot(){
  const containerNode = document.getElementById('doubleScatterPlot');
  if(!containerNode) return;

  const container = d3.select(containerNode);
  container.selectAll('*').remove();
  
  const selection = activeSelection();
  const emptyState = doubleState.forceEmptyPlot || selection.size === 0;
  let agg = emptyState ? [] : aggregateDoubleData(selection)
    .filter(d => Number.isFinite(d.generalMean) && Number.isFinite(d.contraMean))
    .filter(d => {
      const name = (d.region || '').toLowerCase();
      const isInjectionSite = name.includes('anterior olfactory nucleus') || name.includes('aon');
      const nearZero = Math.abs(d.generalMean) < 1e-6 && Math.abs(d.contraMean) < 1e-6;
      return !isInjectionSite && !nearZero;
    });
  
  if(!agg.length){
    if(emptyState){
      // draw empty axes with default domain
      const rect = containerNode?.getBoundingClientRect?.();
      const parentWidth = containerNode?.parentElement?.getBoundingClientRect?.().width || 0;
      const panelWidth = containerNode?.closest('.figure-panel')?.getBoundingClientRect?.().width || 0;
      const computedWidth = Math.max(rect?.width || 0, parentWidth || 0, panelWidth || 0);
      const width = Math.max(computedWidth, 900);
      const height = 440;
      const margin = { top: 80, right: 32, bottom: 52, left: 72 };
      const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
      const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
      const svg = container.append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio','xMidYMid meet')
        .style('width','100%')
        .style('height','auto')
        .style('border','1px solid #e5e7eb')
        .style('border-radius','8px');
      const clipId = `scatter-clip-${Math.random().toString(36).slice(2, 8)}`;
      const clipPad = 8;
      const clipX = margin.left - clipPad;
      const clipY = margin.top - clipPad;
      const clipW = width - margin.left - margin.right + clipPad * 2;
      const clipH = height - margin.top - margin.bottom + clipPad * 2;
      svg.append('defs')
        .append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('x', clipX)
        .attr('y', clipY)
        .attr('width', clipW)
        .attr('height', clipH);
      const plotArea = svg.append('g').attr('clip-path', `url(#${clipId})`);
      const xAxisG = svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(4))
        .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
        .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
        .call(g => g.selectAll('line').attr('stroke', '#e5e7eb'));
      const yAxisG = svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(4))
        .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
        .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
        .call(g => g.selectAll('line').attr('stroke', '#e5e7eb'));
      const identityLine = plotArea.append('line')
        .attr('x1', x(0)).attr('y1', y(0))
        .attr('x2', x(1)).attr('y2', y(1))
        .attr('stroke', diAccent2)
        .attr('stroke-dasharray', '4,3')
        .attr('stroke-width', 1.6)
        .attr('opacity', 0.5);
      svg.append('text')
        .attr('x', margin.left + (width - margin.left - margin.right)/2)
        .attr('y', height - 12)
        .attr('text-anchor','middle')
        .attr('fill','#1f2937')
        .attr('font-size', 12.5)
        .text('General VGLUT1 strength');
      svg.append('text')
        .attr('transform', `translate(${margin.left - 46}, ${margin.top + (height - margin.top - margin.bottom)/2}) rotate(-90)`)
        .attr('text-anchor','middle')
        .attr('fill','#1f2937')
        .attr('font-size', 12.5)
        .text('Contra-Projecting strength');
      renderDoubleLegend(svg, width, margin);
      const xGridG = plotArea.append('g');
      const yGridG = plotArea.append('g');
      const points = plotArea.append('g');
      initDoubleZoom({
        type: 'scatter',
        svg,
        x0: x,
        y0: y,
        plotExtent: [[margin.left, margin.top], [width - margin.right, height - margin.bottom]],
        points,
        identityLine,
        xAxisG,
        yAxisG,
        xGrid: xGridG,
        yGrid: yGridG,
        xGridGen: d3.axisBottom(x).ticks(4).tickSize(-(height - margin.top - margin.bottom)).tickFormat(() => ''),
        yGridGen: d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(() => ''),
        upper: 1
      });
      return;
    }
    container.append('div').attr('class','muted small').style('padding','20px').text('No paired values to plot.');
    return;
  }

  // Fallback width
  const rect = containerNode.getBoundingClientRect();
  const parentWidth = containerNode.parentElement?.getBoundingClientRect?.().width || 0;
  const panelWidth = containerNode.closest('.figure-panel')?.getBoundingClientRect?.().width || 0;
  const computedWidth = Math.max(rect?.width || 0, parentWidth || 0, panelWidth || 0);
  const width = Math.max(computedWidth, 900);

  const margin = { top: 80, right: 32, bottom: 52, left: 72 };
  const height = margin.top + margin.bottom + 420;
  
  const upper = 120;
  const x = d3.scaleLinear().domain([0, upper]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, upper]).range([height - margin.bottom, margin.top]);

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('width','100%')
    .style('height','auto');
  const clipId = `scatter-clip-${Math.random().toString(36).slice(2, 8)}`;
  const clipPad = 8;
  const clipX = margin.left - clipPad;
  const clipY = margin.top - clipPad;
  const clipW = width - margin.left - margin.right + clipPad * 2;
  const clipH = height - margin.top - margin.bottom + clipPad * 2;
  svg.append('defs')
    .append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('x', clipX)
    .attr('y', clipY)
    .attr('width', clipW)
    .attr('height', clipH);
  const plotArea = svg.append('g').attr('clip-path', `url(#${clipId})`);

  // Grid
  const xGrid = d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(() => '');
  const xGridG = plotArea.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(xGrid)
    .call(g => g.selectAll('line').attr('stroke','#eef2f7').attr('stroke-width',1))
    .call(g => g.selectAll('.domain, text').remove());
    
  const yGrid = d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(() => '');
  const yGridG = plotArea.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(yGrid)
    .call(g => g.selectAll('line').attr('stroke','#eef2f7').attr('stroke-width',1))
    .call(g => g.selectAll('.domain, text').remove());

  // Axes
  const xAxisG = svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
    .call(g => g.selectAll('line').attr('stroke', '#e5e7eb'));
    
  const yAxisG = svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'))
    .call(g => g.selectAll('line').attr('stroke', '#e5e7eb'));

  // Identity line
  const identityLine = plotArea.append('line')
    .attr('x1', x(0)).attr('y1', y(0))
    .attr('x2', x(upper)).attr('y2', y(upper))
    .attr('stroke', diAccent2)
    .attr('stroke-dasharray', '4,3')
    .attr('stroke-width', 1.6)
    .attr('opacity', 0.5);

  // Points
  const points = plotArea.append('g')
    .selectAll('circle')
    .data(agg)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.generalMean))
    .attr('cy', d => y(d.contraMean))
    .attr('r', 6)
    .attr('fill', d => d.delta >= 0 ? diAccent1 : diAccent2) // Match rabies colors: red/orange for Contra>General, blue for General-dominant
    .attr('fill-opacity', 0.6)
    .attr('stroke', '#fff')
    .attr('stroke-width', 1)
    .on('mouseenter', (event, d) => {
      const html = `
        <strong>${d.region}</strong><br/>
        Contra-projecting strength: ${formatValue(d.contraMean)}${Number.isFinite(d.nContra) ? ` (n=${d.nContra})` : ''}<br/>
        General VGLUT1 strength: ${formatValue(d.generalMean)}${Number.isFinite(d.nGeneral) ? ` (n=${d.nGeneral})` : ''}<br/>
        Δ (Contra - General): ${formatValue(d.delta)}
      `;
      showDoubleTooltip(event, html);
    })
    .on('mouseleave', hideDoubleTooltip);

  svg.append('text')
    .attr('x', margin.left + (width - margin.left - margin.right)/2)
    .attr('y', height - 12)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('General VGLUT1 strength');
    
  svg.append('text')
    .attr('transform', `translate(${margin.left - 46}, ${margin.top + (height - margin.top - margin.bottom)/2}) rotate(-90)`)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('Contra-Projecting strength');

  renderDoubleLegend(svg, width, margin);

  initDoubleZoom({
    type: 'scatter',
    svg,
    x0: x,
    y0: y,
    plotExtent: [[margin.left, margin.top], [width - margin.right, height - margin.bottom]],
    points,
    identityLine,
    xAxisG,
    yAxisG,
    xGrid: xGridG,
    yGrid: yGridG,
    xGridGen: xGrid,
    yGridGen: yGrid,
    upper
  });
}

function renderDoublePlots(){
  const divDiv = document.getElementById('doubleDivergingPlot');
  const divScat = document.getElementById('doubleScatterPlot');
  const debugEl = document.getElementById('di-debug-log');
  if(debugEl){
    debugEl.style.display = 'none';
    debugEl.textContent = '';
  }

  if(typeof d3 === 'undefined'){
    const msg = '<div class="muted small" style="padding:16px;">Charts unavailable: d3 failed to load (offline?).</div>';
    if(divDiv){ divDiv.innerHTML = msg; divDiv.style.display = 'block'; }
    if(divScat){ divScat.innerHTML = msg; divScat.style.display = 'none'; }
    if(debugEl){ debugEl.style.display = 'block'; debugEl.textContent = 'd3 unavailable'; }
    return;
  }

  renderDoubleFigureHead();
  renderDoubleInterpretation();
  hideDoubleTooltip();

  doubleZoomTransform = getInitialDoubleTransform(null); // will be applied in initDoubleZoom per chart

  if(doubleState.view === 'scatter'){
    if(divDiv) divDiv.style.display = 'none';
    if(divScat) divScat.style.display = 'block';
    drawScatterPlot();
  } else {
    if(divScat) divScat.style.display = 'none';
    if(divDiv) divDiv.style.display = 'block';
    drawDivergingBarChart();
  }
}

function renderDoubleRegionList(){
  const listEl = document.getElementById('doubleRegionList');
  if(!listEl) return;
  
  const selectedSet = activeSelection();
  let regionSource = doubleState.regions;
  if(doubleState.view === 'scatter'){
    const plottable = new Set(
      aggregateDoubleData(null)
        .filter(d => Number.isFinite(d.generalMean) && Number.isFinite(d.contraMean))
        .filter(d => {
          const name = (d.region || '').toLowerCase();
          const isInjectionSite = name.includes('anterior olfactory nucleus') || name.includes('aon');
          const nearZero = Math.abs(d.generalMean) < 1e-6 && Math.abs(d.contraMean) < 1e-6;
          return !isInjectionSite && !nearZero;
        })
        .map(d => d.region)
    );
    regionSource = regionSource.filter(r => plottable.has(r));
    Array.from(selectedSet).forEach(r => {
      if(!plottable.has(r)) selectedSet.delete(r);
    });
    doubleState.forceEmptyPlot = selectedSet.size === 0;
  }
  // Highlight regions that have non-zero signal in the loaded dataset
  const signalRegions = new Set(
    doubleState.data
      .filter(d => Number.isFinite(d.value) && d.value > 0)
      .map(d => d.region)
  );
  const filtered = regionSource.filter(r => r.toLowerCase().includes(doubleState.search));
  listEl.innerHTML = '';
  
  filtered.forEach(region => {
    const id = `double-${region.replace(/\W+/g,'-')}`;
    const label = document.createElement('label');
    const hasSignal = signalRegions.has(region);
    label.className = `region-item${hasSignal ? ' region-item--has-signal' : ''}`;
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = region;
    cb.checked = selectedSet.has(region);
    cb.addEventListener('change', (e) => {
      doubleState.hasCustomSelection = true;
      ensureDoubleSelections();
      ['diverging','scatter'].forEach(view => {
        const set = doubleState.selectedRegionsByView[view];
        if(e.target.checked){ set.add(region); } else { set.delete(region); }
      });
      const activeSel = activeSelection();
      doubleState.forceEmptyPlot = activeSel.size === 0;
      renderDoublePlots();
    });
    
    const span = document.createElement('span');
    const acronym = doubleRegionAcronym(region);
    span.textContent = (acronym && acronym !== region) ? `${region} (${acronym})` : region;
    
    label.append(cb, span);
    listEl.append(label);
  });
}

function attachDoubleHandlers(){
  const searchEl = document.getElementById('doubleRegionSearch');
  if(searchEl){
    searchEl.addEventListener('input', (e) => {
      doubleState.search = (e.target.value || '').toLowerCase();
      renderDoubleRegionList();
    });
  }

  const resetBtn = document.getElementById('doubleResetBtn');
  const clearBtn = document.getElementById('doubleClearBtn');
  if(resetBtn){
    resetBtn.addEventListener('click', () => {
      doubleState.forceEmptyPlot = false;
      setDefaultDoubleSelection(doubleState.regions);
      renderDoubleRegionList();
      renderDoublePlots();
    });
  }
  if(clearBtn){
    clearBtn.addEventListener('click', () => {
      ensureDoubleSelections();
      doubleState.selectedRegionsByView.diverging = new Set();
      doubleState.selectedRegionsByView.scatter = new Set();
      doubleState.selectedRegions = new Set();
      doubleState.hasCustomSelection = true;
      doubleState.forceEmptyPlot = true;
      renderDoubleRegionList();
      renderDoublePlots();
    });
  }

  document.querySelectorAll('[data-double-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-double-view');
      setDoubleView(view);
      doubleZoomTransform = d3.zoomIdentity;
      document.querySelectorAll('[data-double-view]').forEach(b => {
        const active = b.getAttribute('data-double-view') === view;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      const activeSel = activeSelection();
      doubleState.forceEmptyPlot = activeSel.size === 0;
      renderDoubleRegionList();
      updateDoubleZoomLevel();
      renderDoublePlots();
    });
  });

  if(doubleResetZoomBtn){
    doubleResetZoomBtn.addEventListener('click', resetDoubleZoom);
  }

  const toggle = document.getElementById('doubleAbstractToggle');
  const body = document.getElementById('doubleAbstractBody');
  if(toggle && body){
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      body.hidden = isExpanded;
      toggle.textContent = isExpanded ? 'View Experimental Rationale' : 'Hide Experimental Rationale';
    });
  }
}

async function loadDoubleData(){
  doubleState.loading = true;
  try{
    console.log('Fetching double injection data...');
    const rows = await fetchJson(`${API}/region-load/by-mouse?experiment_type=double_injection`);
    console.log(`Dual Injection: Received ${rows.length} rows.`);
    if(rows.length > 0){
      console.log('Sample Row:', rows[0]);
      console.log('Sample Details:', rows[0].details);
    }else{
      console.warn('CRITICAL: API returned 0 rows. Check database casing or SQL query.');
    }

    const normalized = rows.map(normalizeDoubleRow).filter(Boolean);
    doubleState.data = normalized;
    
    // Load region acronyms for compact labels (fallback to full name)
    try{
      const regionTree = await fetchJson(`${API}/regions/tree`);
      if(Array.isArray(regionTree)){
        const map = {};
        regionTree.forEach(r => {
      if(r.name && r.acronym){
        map[r.name] = r.acronym;
      }
    });
    doubleState.regionNameToAcronym = map;
  }
}catch(err){
  console.warn('Double injection: region tree load failed', err);
}

const regionNames = Array.from(new Set(normalized.map(r => r.region))).sort();
doubleState.regions = regionNames;

if(!doubleState.hasCustomSelection){
  setDefaultDoubleSelection(doubleState.regions);
}

renderDoubleRegionList();
renderDoublePlots();

  } catch(err){
    console.warn('Double injection data load failed', err);
    doubleState.data = [];
    renderDoublePlots();
  } finally {
    doubleState.loading = false;
  }
}

function initDoubleDashboard() {
  console.log('Initializing Dual Injection Page...');
  
  // 1. Render Static Text
  renderDoubleAbstractCopy();
  renderDoubleInterpretation();
  
  // 2. Attach Event Handlers (Search, Reset, View Toggle)
  attachDoubleHandlers();
  updateDoubleZoomLevel();
  doubleState.forceEmptyPlot = false;
  
  // 3. Load Data immediately (No tab waiting!)
  loadDoubleData();
}

window.initDoubleDashboard = initDoubleDashboard;
