// Initialize AOS (scroll animations)
AOS.init({ once:true, duration:600, easing:'ease-out' });

// Tab/controls
const scrnaSampleSelect = document.getElementById('scrnaSampleSelect');
const scrnaClusterSelect = document.getElementById('scrnaClusterSelect');
const fileSelect = document.getElementById('fileSelect');
const fileDetails = document.getElementById('fileDetails');

// Tabs logic
const tabs = [
  { btn: 'rabiesTabBtn', panel: 'rabiesTab' },
  { btn: 'doubleTabBtn', panel: 'doubleTab' },
  { btn: 'scrnaTabBtn', panel: 'scrnaTab' }
];

tabs.forEach(({btn, panel}) => {
  const b = document.getElementById(btn);
  const p = document.getElementById(panel);
  b?.addEventListener('click', () => activateTab(btn, panel));
});

// Collapsible abstract for rabies tab
const rabiesAbstractToggle = document.getElementById('rabiesAbstractToggle');
const rabiesAbstractBody = document.getElementById('rabiesAbstractBody');
rabiesAbstractToggle?.addEventListener('click', () => {
  const isExpanded = rabiesAbstractToggle.getAttribute('aria-expanded') === 'true';
  rabiesAbstractToggle.setAttribute('aria-expanded', String(!isExpanded));
  if(rabiesAbstractBody){
    rabiesAbstractBody.hidden = isExpanded;
    rabiesAbstractBody.style.maxHeight = isExpanded ? '0px' : '800px';
  }
  rabiesAbstractToggle.textContent = isExpanded ? 'View Experimental Rationale' : 'Hide Experimental Rationale';
});

// Switch tab buttons and panels for the dataset sections. 
function activateTab(activeBtnId, activePanelId){
  // buttons
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.id === activeBtnId;
    t.classList.toggle('is-active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  // panels
  document.querySelectorAll('.tabpanel').forEach(p => {
    const isActive = p.id === activePanelId;
    p.classList.toggle('is-active', isActive);
    if(isActive){ p.removeAttribute('hidden'); } else { p.setAttribute('hidden', ''); }
  });
}

const accent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim();
const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim();
const accent3 = getComputedStyle(document.documentElement).getPropertyValue('--accent3').trim();

// Data fetchers for future charts (kept for reuse)
async function fetchFluorSummary(experimentType, hemisphere, subjectId, regionId, groupBy){
  const qs = new URLSearchParams();
  if(experimentType) qs.append('experiment_type', experimentType);
  if(hemisphere) qs.append('hemisphere', hemisphere);
  if(subjectId && subjectId !== 'all') qs.append('subject_id', subjectId);
  if(regionId) qs.append('region_id', regionId);
  if(groupBy) qs.append('group_by', groupBy);
  qs.append('limit', 500);
  return fetchJson(`${API}/fluor/summary?${qs.toString()}`);
}

async function fetchRegionLoadSummary(hemisphere){
  const qs = new URLSearchParams();
  if(hemisphere) qs.append('hemisphere', hemisphere);
  return fetchJson(`${API}/region-load/summary?${qs.toString()}`);
}

async function fetchRegionLoadByMouse(hemisphere){
  const qs = new URLSearchParams();
  qs.append('experiment_type', 'rabies');
  if(hemisphere) qs.append('hemisphere', hemisphere);
  return fetchJson(`${API}/region-load/by-mouse?${qs.toString()}`);
}

// Rabies Cleveland Dot Plot default regions upon reload
const defaultRabiesRegions = [
  'Nucleus of the lateral olfactory tract, layer 3',
  'Nucleus of the lateral olfactory tract, pyramidal layer',
  'Nucleus of the lateral olfactory tract, molecular layer',
  'Piriform area',
  'Dorsal peduncular area',
  'Taenia tecta, ventral part',
  'Taenia tecta, dorsal part',
  'Anterior olfactory nucleus',
  'Main olfactory bulb'
];

const rabiesState = {
  search: '',
  groupBy: 'genotype',
  hemisphere: 'bilateral',
  selectedRegions: new Set(),
  data: [],
  dataByHemi: { ipsilateral: [], contralateral: [] },
  regions: [],
  allRegions: [],
  loading: false,
  regionTreeCached: false,
  regionNameToAcronym: {},
  forceEmptyPlot: false,
};
// Plot margins (balanced to keep both charts same width; extra left for labels)
const rabiesPlotMargins = { top: 36, right: 0, bottom: 44, left: 70 };

const regionSearch = document.getElementById('rabiesRegionSearch');
const regionListEl = document.getElementById('rabiesRegionList');
const tooltip = document.getElementById('rabiesTooltip');
const groupRadios = document.querySelectorAll('input[name="rabiesGroupBy"]');
const rabiesResetBtn = document.getElementById('rabiesResetBtn');
const rabiesClearBtn = document.getElementById('rabiesClearBtn');
const rabiesMouseCountEl = document.getElementById('rabiesMouseCount');
const zoomLevelEl = document.getElementById('zoomLevel');
const resetZoomBtn = document.getElementById('resetZoomBtn');
let rabiesPlotRefs = [];
let rabiesZoomBehavior = null;
let rabiesZoomTransform = d3.zoomIdentity;

regionSearch?.addEventListener('input', (e) => {
  rabiesState.search = e.target.value.toLowerCase();
  renderRegionList();
});

regionSearch?.addEventListener('change', (e) => {
  const val = (e.target.value || '').trim();
  if(val && rabiesState.regions.includes(val)){
    rabiesState.selectedRegions.add(val);
    rabiesState.forceEmptyPlot = false;
    e.target.value = '';
    rabiesState.search = '';
    renderRegionList();
    drawRabiesDotPlot();
  }
});

groupRadios.forEach(r => r.addEventListener('change', () => {
  if(!r.checked) return;
  rabiesState.groupBy = r.value === 'subject' ? 'subject' : 'genotype';
  loadRabiesData();
}));

rabiesResetBtn?.addEventListener('click', () => {
  rabiesState.forceEmptyPlot = false;
  applyDefaultRabiesSelection();
  renderRegionList();
  drawRabiesDotPlot();
});

rabiesClearBtn?.addEventListener('click', () => {
  rabiesState.selectedRegions = new Set();
  rabiesState.forceEmptyPlot = true;
  renderRegionList();
  drawRabiesDotPlot();
});

function setRabiesMouseCount(n){
  if(!rabiesMouseCountEl) return;
  const val = Number.isFinite(n) && n > 0 ? n : '–';
  rabiesMouseCountEl.textContent = val;
}

// Render the rabies region checklist based on search and selection. 
function renderRegionList(){
  if(!regionListEl) return;
  regionListEl.innerHTML = '';
  // Highlight only regions with signal in current rabies data (ipsi or contra).
  const signalRegions = new Set();
  ['ipsilateral','contralateral'].forEach(side => {
    (rabiesState.dataByHemi?.[side] || [])
      .filter(d => typeof d.load_fraction === 'number' && d.load_fraction > 0)
      .forEach(d => signalRegions.add(d.region));
  });
  const filtered = rabiesState.regions.filter(r => r.toLowerCase().includes(rabiesState.search));
  filtered.forEach(region => {
    const id = `reg-${region.replace(/\W+/g,'-')}`;
    const wrapper = document.createElement('label');
    const hasSignal = signalRegions.has(region);
    wrapper.className = `region-item${hasSignal ? ' region-item--has-signal' : ''}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = region;
    cb.checked = rabiesState.selectedRegions.has(region);
    cb.addEventListener('change', (e) => {
      // If all boxes unchecked, show a blank plot instead of falling back to all regions
      if(e.target.checked){
        rabiesState.selectedRegions.add(region);
        rabiesState.forceEmptyPlot = false;
      }else{
        rabiesState.selectedRegions.delete(region);
        rabiesState.forceEmptyPlot = rabiesState.selectedRegions.size === 0;
      }
      drawRabiesDotPlot();
    });
    const span = document.createElement('span');
    span.textContent = region;
    wrapper.append(cb, span);
    regionListEl.append(wrapper);
  });
}
async function loadRabiesData(){
  rabiesState.loading = true;
  const treePromise = !rabiesState.regionTreeCached
    ? fetchJson(`${API}/regions/tree`).catch(err => {
        console.warn('Region tree load failed', err);
        return null;
      })
    : Promise.resolve(null);
  try{
    // Always pull both hemispheres and show side by side.
    const allowedGenos = new Set(['Vglut1','Vgat']);
    const [ipsiRaw, contraRaw] = await Promise.all([
      fetchRegionLoadByMouse('left'),
      fetchRegionLoadByMouse('right')
    ]);
    const clean = rows => rows.filter(r => allowedGenos.has((r.genotype || '').trim()));
    const ipsi = clean(ipsiRaw);
    const contra = clean(contraRaw);
    rabiesState.dataByHemi = { ipsilateral: ipsi, contralateral: contra };
    const allData = [...ipsi, ...contra];
    // Unique mouse count across both hemispheres
    const mouseCount = new Set(allData.map(d => d.subject_id).filter(Boolean)).size;
    setRabiesMouseCount(mouseCount);
    // Seed region names from the data; may be overridden by the tree for stable acronyms.
    const regionSet = new Set(allData.map(d => d.region));
    defaultRabiesRegions.forEach(r => regionSet.add(r));
    rabiesState.allRegions = Array.from(regionSet).sort();
    rabiesState.data = allData;
    // Await region tree to pre-populate acronyms before first render.
    const regionTree = await treePromise;
    if(regionTree && Array.isArray(regionTree) && regionTree.length){
      rabiesState.regionNameToAcronym = {};
      regionTree.forEach(r => {
        if(r.name && r.acronym){
          rabiesState.regionNameToAcronym[r.name] = r.acronym;
        }
      });
      const regionNames = Array.from(new Set(regionTree.map(r => r.name))).sort();
      if(regionNames.length){
        rabiesState.allRegions = regionNames;
      }
      rabiesState.regionTreeCached = true;
    }
    applyDefaultRabiesSelection();
    rabiesState.regions = rabiesState.allRegions;
    renderRegionList();
    drawRabiesDotPlot();
  }catch(err){
    console.warn('Rabies data load failed', err);
  }finally{
    rabiesState.loading = false;
  }
}

function applyDefaultRabiesSelection(){
  // build default selection with fuzzy matching to the nine regions we care about
  const clean = (s='') => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const matched = [];
  defaultRabiesRegions.forEach(def => {
    const exact = rabiesState.allRegions.find(r => clean(r) === clean(def));
    const fuzzy = rabiesState.allRegions.find(r => clean(r).includes(clean(def)));
    const pick = exact || fuzzy;
    if(pick && !matched.includes(pick)) matched.push(pick);
  });
  // Only keep those matches; no auto-fill with other regions
  rabiesState.selectedRegions = new Set(matched);
  rabiesState.forceEmptyPlot = false;
}

/* Draw both ipsilateral and contralateral rabies dot plots. */
function drawRabiesDotPlot(){
  let regions = getOrderedRabiesRegions();
  let ipsiData = buildRabiesChartData('ipsilateral', regions);
  let contraData = buildRabiesChartData('contralateral', regions);
  if(rabiesState.forceEmptyPlot){
    regions = defaultRabiesRegions;
    ipsiData = [];
    contraData = [];
  }
  const peakVal = d3.max([...ipsiData, ...contraData], d => (d.valuePerc + d.semPerc) || d.valuePerc || 0) || 0;
  const domainMax = peakVal > 0 ? peakVal * 1.08 : 1; // small headroom past the max point
  const rows = Math.max(regions.length, 9);
  const rowSpacing = 32;
  const innerSide = Math.max(500, rows * rowSpacing); // square inner plotting area (height == width)
  rabiesPlotRefs = [];
  rabiesPlotRefs.push(drawRabiesSingle('ipsilateral', '#rabiesDotPlotIpsi', ipsiData, regions, domainMax, innerSide));
  rabiesPlotRefs.push(drawRabiesSingle('contralateral', '#rabiesDotPlotContra', contraData, regions, domainMax, innerSide));
  initSharedZoom();
}

// Build chart-ready rows for a hemisphere, respecting current grouping.
// Note: We plot relative signal (load_fraction) because absolute cell counts/starters are not available in the source CSVs.
function buildRabiesChartData(hemiKey, regions){
  const valuesSource = rabiesState.dataByHemi[hemiKey] || [];
  if(!regions.length) return [];
  let chartData = [];
  if(rabiesState.groupBy === 'genotype'){
    regions.forEach(region => {
      const regionLabel = regionAcronym(region);
      const grouped = { Vglut1: [], Vgat: [] };
      valuesSource.filter(v => v.region === region).forEach(v => {
        const geno = v.genotype || 'other';
        if(geno !== 'Vglut1' && geno !== 'Vgat') return;
        if(v.load_fraction != null){
          grouped[geno].push(v.load_fraction);
        }
      });
      const pushAgg = (label, vals) => {
        const n = vals.length;
        const mean = n ? vals.reduce((a,b)=>a+b,0) / n : 0;
        let sem = 0;
        if(n > 1){
          const variance = vals.reduce((a,b)=>a + Math.pow(b-mean,2),0) / (n-1);
          sem = Math.sqrt(variance) / Math.sqrt(n);
        }
        chartData.push({ region, regionLabel, group: label, value: mean, sem, n });
      };
      pushAgg('Vglut1', grouped['Vglut1']);
      pushAgg('Vgat', grouped['Vgat']);
    });
  }else{
    // subject-level: one dot per mouse, but color still tied to genotype
    chartData = regions.flatMap(region => {
      const regionLabel = regionAcronym(region);
      return valuesSource
        .filter(v => v.region === region)
        .map(v => {
          const g = v.genotype || 'other';
          if(g !== 'Vglut1' && g !== 'Vgat') return null;
          return {
            region,
            regionLabel,
            group: g,
            subject: v.subject_id,
            value: v.load_fraction ?? 0,
            sem: 0,
            n: 1
          };
        })
        .filter(Boolean);
    });
  }
  return chartData.map(d => ({
    ...d,
    valuePerc: (d.value || 0) * 100,
    semPerc: (d.sem || 0) * 100
  }));
}

// Selected regions (or all available if none manually chosen), ordered with defaults first.
function getOrderedRabiesRegions(){
  const selected = rabiesState.selectedRegions.size
    ? Array.from(rabiesState.selectedRegions)
    : Array.from(new Set(rabiesState.data.map(d => d.region)));
  const seen = new Set();
  const ordered = [];
  // prioritize default order
  defaultRabiesRegions.forEach(def => {
    const match = selected.find(r => r.toLowerCase() === def.toLowerCase());
    if(match && !seen.has(match)){ ordered.push(match); seen.add(match); }
  });
  // append remaining alphabetically
  selected
    .filter(r => !seen.has(r))
    .sort((a,b) => a.localeCompare(b))
    .forEach(r => { seen.add(r); ordered.push(r); });
  return ordered;
}

function regionAcronym(name){
  return rabiesState.regionNameToAcronym[name] || name;
}

/* Render a single rabies dot plot for the given hemisphere. */
function drawRabiesSingle(hemiKey, selector, chartData, regions, domainMax, innerSide){
  const container = d3.select(selector);
  if(container.empty()) return;
  container.selectAll('*').remove();
  const regionList = (regions && regions.length) ? regions : defaultRabiesRegions;
  // Use identical margins so both plots occupy the same width; right plot hides its y labels.
  const margin = rabiesPlotMargins;
  const legendSpace = 24; // space to allow legend inside top-right without clipping
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotRight = plotLeft + innerSide;
  const plotBottom = plotTop + innerSide;
  const width = plotRight + legendSpace;
  const height = plotBottom + margin.bottom;
  const axisColor = '#94a3b8'; // darker outline for visibility
  const axisTextColor = '#1f2937';
  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  const xPadding = 8; // inset x-axis ticks slightly from the plot border
  const xRangeStart = plotLeft + xPadding;
  const xRangeEnd = plotRight - xPadding;
  const x = d3.scaleLinear()
    .domain([0, domainMax || Math.max(100, d3.max(chartData, d => d.valuePerc + d.semPerc) || 0)])
    .range([xRangeStart, xRangeEnd]);

  const regionLabels = regions.map(r => regionAcronym(r));
  const y = d3.scalePoint()
    .domain(regionLabels)
    .range([plotTop, plotBottom])
    .padding(0.35);

  const color = d3.scaleOrdinal()
    .domain(['Vglut1','Vgat'])
    .range([accent2, accent1]);

  const xAxis = d3.axisBottom(x).ticks(6).tickSizeOuter(0);
  const xGrid = d3.axisBottom(x).ticks(6).tickSize(-(innerSide)).tickFormat(() => '');
  const xAxisTop = d3.axisTop(x).ticks(6).tickSize(0).tickSizeOuter(0).tickFormat(() => '');
  const yAxis = d3.axisLeft(y).tickSizeOuter(0);
  const yGrid = d3.axisLeft(y).tickSize(-(innerSide)).tickFormat(() => '');
  const yAxisRight = d3.axisRight(y).tickSize(0).tickSizeOuter(0).tickFormat(() => '');

  const clipId = `clip-${hemiKey}-${Math.random().toString(36).slice(2,7)}`;
  const defs = svg.append('defs');
  defs.append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide);

  const plotGroup = svg.append('g').attr('clip-path', `url(#${clipId})`);

  // Light plot background for grounding.
  plotGroup.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', '#f8fafc');

  // Gridlines behind points.
  const xGridGroup = plotGroup.append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(xGrid)
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());
  plotGroup.append('g')
    .attr('transform', `translate(${plotLeft},0)`)
    .call(yGrid)
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());

  // Framed plot area to mimic axes on all sides.
  svg.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', 'none')
    .attr('stroke', axisColor)
    .attr('stroke-width', 1.4);

  // Error bars: mean +/- SEM (only meaningful for aggregated genotype view)
  let errBars = null;
  if(rabiesState.groupBy === 'genotype'){
    errBars = plotGroup.append('g')
      .selectAll('line.err')
      .data(chartData)
      .enter()
      .append('line')
      .attr('class', 'err')
      .attr('x1', d => x(Math.max(0, d.valuePerc - d.semPerc)))
      .attr('x2', d => x(d.valuePerc + d.semPerc))
      .attr('y1', d => y(d.regionLabel))
      .attr('y2', d => y(d.regionLabel))
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 2);
  }

  // Points (different shapes per genotype; Vglut1 rotated square, Vgat circle)
  const pointSize = 140;
  const symbolForGroup = (group) => (group === 'Vglut1' ? d3.symbolSquare : d3.symbolCircle);
  const points = plotGroup.append('g')
    .selectAll('path.point')
    .data(chartData)
    .enter()
    .append('path')
    .attr('class','point')
    .attr('d', d => d3.symbol().size(pointSize).type(symbolForGroup(d.group))())
    .attr('transform', d => {
      const rotate = d.group === 'Vglut1' ? 45 : 0;
      return `translate(${x(d.valuePerc)},${y(d.regionLabel)}) rotate(${rotate})`;
    })
    .attr('fill', d => color(d.group))
    .attr('fill-opacity', 0.35)
    .attr('stroke', d => color(d.group))
    .attr('stroke-width', 2)
    .on('mouseenter', (event, d) => showTooltip(event, d))
    .on('mouseleave', hideTooltip);

  const xAxisG = svg.append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(xAxis)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('text').attr('fill', axisTextColor).attr('font-size', 11.5))
    .call(g => g.append('text')
      .attr('x', xRangeStart + (xRangeEnd - xRangeStart)/2)
      .attr('y', 36)
      .attr('fill', axisTextColor)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .text('Relative Input Strength (% of Total Signal)'));
  svg.append('g')
    .attr('transform', `translate(0,${plotTop})`)
    .call(xAxisTop)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').remove());
  const yAxisG = svg.append('g')
    .attr('transform', `translate(${plotLeft},0)`)
    .call(yAxis)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').attr('stroke', axisColor).attr('stroke-width',1.2));
  const yLabels = yAxisG.selectAll('text')
    .attr('font-size', 11.5)
    .attr('fill', axisTextColor)
    .attr('text-anchor', 'end')
    .attr('x', -10)
    .attr('opacity', 1); // show labels on both plots
  svg.append('g')
    .attr('transform', `translate(${plotRight},0)`)
    .call(yAxisRight)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').remove());

  // Legend (nested inside plot area, top-right)
  // Legend (nested inside plot area, top-right) with balanced padding
  const legendBox = svg.append('g');
  const legendItems = [
    { label: hemiKey === 'ipsilateral' ? 'Vglut1 Ipsi' : 'Vglut1 Contra', colorKey:'Vglut1', shape:d3.symbolSquare, rotate:45 },
    { label: hemiKey === 'ipsilateral' ? 'Vgat Ipsi' : 'Vgat Contra', colorKey:'Vgat', shape:d3.symbolCircle, rotate:0 }
  ];
  const legendRowHeight = 24;
  const legendWidth = 130;
  const legendPaddingX = 16;
  const legendPaddingY = 10;
  const legendHeight = legendItems.length * legendRowHeight + legendPaddingY * 2;
  const legendX = plotRight - legendWidth - 16;
  const legendY = plotTop + 16;

  legendBox.attr('transform', `translate(${legendX}, ${legendY})`);

  legendBox.append('rect')
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .attr('rx', 8)
    .attr('fill', '#f8fafc')
    .attr('stroke', '#dfe3eb')
    .attr('stroke-width', 1);

  legendItems.forEach((item, idx) => {
    const rowY = legendPaddingY + legendRowHeight / 2 + idx * legendRowHeight;
    const row = legendBox.append('g').attr('transform', `translate(${legendPaddingX}, ${rowY})`);
    
    row.append('path')
      .attr('d', d3.symbol().type(item.shape).size(120)())
      .attr('fill', color(item.colorKey))
      .attr('fill-opacity', 0.35)
      .attr('stroke', color(item.colorKey))
      .attr('stroke-width', 2)
      .attr('transform', `rotate(${item.rotate || 0})`);
      
    row.append('text')
      .attr('x', 20)
      .attr('y', 0)
      .text(item.label)
      .attr('fill', '#374151')
      .attr('font-size', 12)
      .attr('dominant-baseline', 'middle');
  });

  return {
    hemiKey,
    svg,
    x0: x,
    y,
    xAxis,
    xGrid,
    xAxisG,
    xGridGroup,
    errBars,
    points,
    innerSide,
    plotLeft,
    plotRight,
    height
  };
}

function initSharedZoom(){
  if(!rabiesPlotRefs.length) return;
  const ref0 = rabiesPlotRefs[0];
  if(!rabiesZoomBehavior){
    rabiesZoomBehavior = d3.zoom()
      .scaleExtent([1,10])
      .extent([[ref0.plotLeft, 0], [ref0.plotRight, ref0.height]])
      .translateExtent([[ref0.plotLeft, 0], [ref0.plotRight, ref0.height]])
      .on('zoom', (event) => {
        rabiesZoomTransform = event.transform;
        applySharedZoom();
      });
    if(resetZoomBtn){
      resetZoomBtn.addEventListener('click', () => {
        rabiesZoomTransform = d3.zoomIdentity;
        rabiesPlotRefs.forEach(ref => {
          ref.svg.transition().duration(750).call(rabiesZoomBehavior.transform, rabiesZoomTransform);
        });
        updateZoomLevel();
      });
    }
  }
  rabiesPlotRefs.forEach(ref => {
    ref.svg.call(rabiesZoomBehavior);
    ref.svg.call(rabiesZoomBehavior.transform, rabiesZoomTransform);
  });
  updateZoomLevel();
}

function applySharedZoom(){
  rabiesPlotRefs.forEach(ref => {
    const t = d3.zoomIdentity.translate(rabiesZoomTransform.x, 0).scale(rabiesZoomTransform.k);
    const zx = t.rescaleX(ref.x0);
    ref.xAxisG.call(ref.xAxis.scale(zx));
    ref.xGridGroup.call(ref.xGrid.scale(zx))
      .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
      .call(g => g.selectAll('text').remove())
      .call(g => g.selectAll('.domain').remove());
    if(ref.errBars){
      ref.errBars
        .attr('x1', d => zx(Math.max(0, d.valuePerc - d.semPerc)))
        .attr('x2', d => zx(d.valuePerc + d.semPerc));
    }
    ref.points.attr('transform', d => {
      const rotate = d.group === 'Vglut1' ? 45 : 0;
      return `translate(${zx(d.valuePerc)},${ref.y(d.regionLabel)}) rotate(${rotate})`;
    });
  });
  updateZoomLevel();
}

function updateZoomLevel(){
  if(!zoomLevelEl) return;
  const k = rabiesZoomTransform?.k || 1;
  zoomLevelEl.textContent = `${k.toFixed(1)}x`;
}

/* Show the floating tooltip for rabies dots. */
function showTooltip(event, d){
  if(!tooltip) return;
  tooltip.hidden = false;
  const semTxt = d.semPerc ? d.semPerc.toFixed(2) + '%' : 'NA';
  const groupTxt = rabiesState.groupBy === 'genotype' ? `${d.group} (mean ± sem)` : d.group;
  tooltip.innerHTML = `
    <strong>${d.region}</strong><br/>
    ${groupTxt}<br/>
    Input Share: ${d.valuePerc.toFixed(2)}%${rabiesState.groupBy === 'genotype' ? ` (SEM: ${semTxt}, n: ${d.n || 'NA'})` : ''}<br/>
    <span style="color:#6b7280;font-size:11px;">(Signal area normalized to total brain-wide input)</span>
  `;
  const rect = tooltip.getBoundingClientRect();
  tooltip.style.left = `${event.pageX - rect.width/2}px`;
  tooltip.style.top = `${event.pageY - rect.height - 10}px`;
}
/* Hide the floating tooltip. */
function hideTooltip(){
  if(tooltip) tooltip.hidden = true;
}

/* Show tooltip for y-axis labels with full region name. */


async function updateRabiesCharts(params){
  // Deprecated bar chart; Cleveland plot handled separately.
}

async function updateDoubleCharts(params){
  // Placeholder for future double injection visuals
}

async function updateRegionalCharts(params){
  // Placeholder for other datasets; keep empty for now
}


// Init
(function init(){
  // open first tab by default
  activateTab('rabiesTabBtn', 'rabiesTab');
  loadSubjects();
  loadSamples();
  loadFiles();
  loadRabiesData();
})();

async function loadSubjects(){
  try{
    const subjects = await fetchJson(`${API}/subjects`);
    const mouseSelect = document.getElementById('mouseSelect');
    if(mouseSelect){
      mouseSelect.innerHTML = '<option value="all" selected>All</option>' +
        subjects.map(s => `<option value="${s.subject_id}">${s.subject_id}</option>`).join('');
    }
  }catch(err){
    console.warn('Failed to load subjects', err);
  }
}

async function loadSamples(){
  try{
    const samples = await fetchJson(`${API}/scrna/samples`);
    if(scrnaSampleSelect){
      scrnaSampleSelect.innerHTML = '<option value="" disabled selected>Select sample</option>' +
        samples.map(s => `<option value="${s.sample_id}">${s.sample_id}</option>`).join('');
    }
  }catch(err){
    console.warn('Failed to load scRNA samples', err);
  }
}

async function loadFiles(){
  try{
    const files = await fetchJson(`${API}/files`);
    if(fileSelect){
      fileSelect.innerHTML = '<option value="" disabled selected>Select file</option>' +
        files.map(f => {
          const labelParts = [f.subject_id || '', f.session_id || '', f.hemisphere || '', f.run ? `run-${f.run}` : ''].filter(Boolean);
          const label = labelParts.join(' • ') || f.path;
          return `<option value="${encodeURIComponent(f.path)}" data-path="${encodeURIComponent(f.path)}" data-session="${f.session_id || ''}" data-subject="${f.subject_id || ''}" data-hemisphere="${f.hemisphere || ''}">${label}</option>`;
        }).join('');
      if(files.length && fileSelect.options.length > 1){
        fileSelect.selectedIndex = 1;
        renderFileDetails(fileSelect.options[fileSelect.selectedIndex]);
      }
    }
  }catch(err){
    console.warn('Failed to load files', err);
  }
}

/* Render details for a selected microscopy file in the viewer dropdown. */
function renderFileDetails(option){
  if(!option || !fileDetails) return;
  const path = decodeURIComponent(option.getAttribute('data-path') || '');
  const sess = option.getAttribute('data-session') || '';
  const subj = option.getAttribute('data-subject') || '';
  const hemi = option.getAttribute('data-hemisphere') || '';
  fileDetails.innerHTML = `<strong>Path:</strong> ${path}<br><strong>Subject:</strong> ${subj}<br><strong>Session:</strong> ${sess}<br><strong>Hemisphere:</strong> ${hemi || 'bilateral'}`;
  fileDetails.hidden = false;
}

fileSelect?.addEventListener('change', (e) => {
  renderFileDetails(e.target.options[e.target.selectedIndex]);
});

// Copy path / open in napari
const copyPathBtn = document.getElementById('copyPathBtn');
const napariBtn = document.getElementById('napariBtn');

copyPathBtn?.addEventListener('click', () => {
  const opt = fileSelect?.options[fileSelect.selectedIndex];
  if(!opt) return;
  const path = decodeURIComponent(opt.getAttribute('data-path') || '');
  if(!path) return;
  navigator.clipboard?.writeText(path).then(() => setStatus(`Copied path: ${path}`));
});

napariBtn?.addEventListener('click', () => {
  const opt = fileSelect?.options[fileSelect.selectedIndex];
  if(!opt) return;
  const path = decodeURIComponent(opt.getAttribute('data-path') || '');
  if(!path) return;
  setStatus(`Open in napari: ${path}`);
  console.info(`Open in napari: python -c \"import napari; v=napari.Viewer(); v.open('${path}', plugin='napari-ome-zarr'); napari.run()\"`);
});

scrnaSampleSelect?.addEventListener('change', async () => {
  const sample = scrnaSampleSelect.value;
  try{
    const clusters = await fetchJson(`${API}/scrna/clusters?sample_id=${encodeURIComponent(sample)}`);
    if(scrnaClusterSelect){
      scrnaClusterSelect.innerHTML = '<option value="" disabled selected>Select cluster</option>' +
        clusters.map(c => `<option value="${c.cluster_id}">${c.cluster_id} (${c.n_cells || 0} cells)</option>`).join('');
    }
    updateScrnaBar(clusters);
    updateScrnaHeatmap(sample, scrnaClusterSelect.value || null);
  }catch(err){
    console.warn('Failed to load clusters', err);
  }
});

scrnaClusterSelect?.addEventListener('change', () => {
  const sample = scrnaSampleSelect.value;
  const cluster = scrnaClusterSelect.value;
  updateScrnaHeatmap(sample, cluster);
});

/* Render the scRNA bar chart stub (placeholder). */
function updateScrnaBar(clusters){
  if(!clusters || !clusters.length){
    embedVL('scrna_bar', { data:{values:[]}, mark:'bar', encoding:{} });
    return;
  }
  const values = clusters.map(c => ({ cluster: c.cluster_id, cells: c.n_cells || 0 }));
  const spec = {
    data: { values },
    mark: 'bar',
    encoding: {
      x: { field: 'cluster', type: 'nominal', sort: null, title: 'Cluster' },
      y: { field: 'cells', type: 'quantitative', title: 'Cells' },
      color: { field: 'cluster', type: 'nominal', legend: null }
    }
  };
  embedVL('scrna_bar', spec);
}

async function updateScrnaHeatmap(sample, cluster){
  if(!sample || !cluster){
    embedVL('scrna_heatmap', { data:{values:[]}, mark:'rect', encoding:{} });
    return;
  }
  try{
    const markers = await fetchJson(`${API}/scrna/markers?sample_id=${encodeURIComponent(sample)}&cluster_id=${encodeURIComponent(cluster)}`);
    const spec = {
      data: { values: markers },
      mark: 'rect',
      encoding: {
        x: { field: 'gene', type: 'nominal', sort: null, title: 'Gene' },
        y: { field: 'cluster_id', type: 'nominal', title: 'Cluster' },
        color: { field: 'logfc', type: 'quantitative', title: 'logFC' }
      }
    };
    embedVL('scrna_heatmap', spec);
  }catch(err){
    console.warn('Failed to load markers', err);
    embedVL('scrna_heatmap', { data:{values:[]}, mark:'rect', encoding:{} });
  }
}