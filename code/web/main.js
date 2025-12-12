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
  view: 'dot',
  data: [],
  dataByHemi: { ipsilateral: [], contralateral: [] },
  ipsiTotalsBySubject: {},
  regions: [],
  allRegions: [],
  loading: false,
  regionTreeCached: false,
  regionNameToAcronym: {},
  forceEmptyPlot: false,
  // Hemisphere mapping: Right = ipsilateral (injection), Left = contralateral
  hemiMap: {
    ipsilateral: 'right',
    contralateral: 'left'
  }
};
// Plot margins (balanced to keep both charts same width; extra left for labels)
const rabiesPlotMargins = { top: 80, right: 60, bottom: 44, left: 90 };

const regionSearch = document.getElementById('rabiesRegionSearch');
const regionListEl = document.getElementById('rabiesRegionList');
const tooltip = document.getElementById('rabiesTooltip');
const rabiesMainContainer = document.querySelector('.rabies-main');
if(tooltip){
  if(rabiesMainContainer && tooltip.parentNode !== rabiesMainContainer){
    rabiesMainContainer.appendChild(tooltip);
  }else if(!tooltip.parentNode){
    document.body.appendChild(tooltip);
  }
}
const groupRadios = document.querySelectorAll('input[name="rabiesGroupBy"]');
const rabiesResetBtn = document.getElementById('rabiesResetBtn');
const rabiesClearBtn = document.getElementById('rabiesClearBtn');
const rabiesMouseCountEl = document.getElementById('rabiesMouseCount');
const zoomLevelEl = document.getElementById('zoomLevel');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const rabiesViewButtons = document.querySelectorAll('[data-rabies-view]');
const rabiesFigureHead = document.getElementById('rabiesFigureHead');
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
    renderRabiesPlots();
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
  renderRabiesPlots();
});

rabiesClearBtn?.addEventListener('click', () => {
  rabiesState.selectedRegions = new Set();
  rabiesState.forceEmptyPlot = true;
  renderRegionList();
  renderRabiesPlots();
});

rabiesViewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.getAttribute('data-rabies-view');
    if(view !== 'dot' && view !== 'box' && view !== 'bar') return;
    if(rabiesState.view === view) return;
    rabiesState.view = view;
    rabiesZoomTransform = d3.zoomIdentity;
    updateRabiesViewButtons();
    renderRabiesPlots();
  });
});

function updateRabiesViewButtons(){
  rabiesViewButtons.forEach(btn => {
    const view = btn.getAttribute('data-rabies-view');
    btn.classList.toggle('is-active', view === rabiesState.view);
    btn.setAttribute('aria-pressed', view === rabiesState.view ? 'true' : 'false');
  });
}

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
      renderRabiesPlots();
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
    const [leftRaw, rightRaw] = await Promise.all([
      fetchRegionLoadByMouse('left'),
      fetchRegionLoadByMouse('right')
    ]);
    const clean = rows => rows.filter(r => allowedGenos.has((r.genotype || '').trim()));
    const leftOnly = clean(leftRaw);
    const rightOnly = clean(rightRaw);
    // Right file contains injection (Ipsi), Left file contains contra projections
    rabiesState.dataByHemi = { ipsilateral: rightOnly, contralateral: leftOnly };
    // Precompute total ipsilateral signal per subject for global normalization
    const totalsMap = {};
    rightOnly.forEach(r => {
      if(typeof r.load === 'number'){
        const subj = r.subject_id || 'unknown';
        totalsMap[subj] = (totalsMap[subj] || 0) + r.load;
      }
    });
    rabiesState.ipsiTotalsBySubject = totalsMap;
    const allData = [...leftOnly, ...rightOnly];
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
    renderRabiesPlots();
  }catch(err){
    console.warn('Rabies data load failed', err);
  }finally{
    rabiesState.loading = false;
  }
}

function applyDefaultRabiesSelection(){
  // Build default selection with fuzzy matching to the nine regions we care about
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

function renderRabiesPlots(){
  if(rabiesFigureHead){
    const titles = {
      dot: {
        main: 'Bilateral Synaptic Inputs of Olfactory Areas',
        sub: 'Distribution of Input Sources to Excitatory (VGLUT1) and Inhibitory (VGAT) Neurons'
      },
      box: {
        main: 'Bilateral Synaptic Inputs of Olfactory Areas',
        sub: 'Distribution of Input Sources to Excitatory (VGLUT1) and Inhibitory (VGAT) Neurons'
      },
      bar: {
        main: 'Bilateral Synaptic Inputs of Olfactory Areas',
        sub: 'Distribution of Input Sources to Excitatory (VGLUT1) and Inhibitory (VGAT) Neurons'
      }
    };
    const t = titles[rabiesState.view] || titles.dot;
    rabiesFigureHead.innerHTML = `
      <div class="figure-title" style="margin:0;">${t.main}</div>
      <div class="muted small" style="margin-bottom:6px;">${t.sub}</div>
    `;
  }
  if(rabiesState.view === 'box'){
    drawRabiesBoxPlot();
  }else if(rabiesState.view === 'bar'){
    drawRabiesDivergingPlot();
  }else{
    drawRabiesDotPlot();
  }
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
  const innerSide = Math.max(560, rows * rowSpacing); // square inner plotting area (height == width)
  rabiesPlotRefs = [];
  const ipsiRef = drawRabiesSingle('ipsilateral', '#rabiesDotPlotIpsi', ipsiData, regions, domainMax, innerSide);
  const contraRef = drawRabiesSingle('contralateral', '#rabiesDotPlotContra', contraData, regions, domainMax, innerSide);
  if(ipsiRef) rabiesPlotRefs.push(ipsiRef);
  if(contraRef) rabiesPlotRefs.push(contraRef);
  initSharedZoom();
}

function drawRabiesBoxPlot(){
  let regions = getOrderedRabiesRegions();
  let ipsiData = buildRabiesBoxData('ipsilateral', regions);
  let contraData = buildRabiesBoxData('contralateral', regions);
  if(rabiesState.forceEmptyPlot){
    regions = defaultRabiesRegions;
    ipsiData = [];
    contraData = [];
  }
  const peakVal = d3.max([...ipsiData, ...contraData], d => d.whiskerHigh || d.q3 || 0) || 0;
  const domainMax = peakVal > 0 ? peakVal * 1.1 : 1;
  const rows = Math.max(regions.length, 9);
  const rowSpacing = 32;
  const innerSide = Math.max(560, rows * rowSpacing);
  rabiesPlotRefs = [];
  const ipsiRef = drawRabiesBoxSingle('ipsilateral', '#rabiesDotPlotIpsi', ipsiData, regions, domainMax, innerSide);
  const contraRef = drawRabiesBoxSingle('contralateral', '#rabiesDotPlotContra', contraData, regions, domainMax, innerSide);
  if(ipsiRef) rabiesPlotRefs.push(ipsiRef);
  if(contraRef) rabiesPlotRefs.push(contraRef);
  initSharedZoom();
}

function drawRabiesDivergingPlot(){
  let regions = getOrderedRabiesRegions();
  let ipsiData = buildRabiesDivergingData('ipsilateral', regions);
  let contraData = buildRabiesDivergingData('contralateral', regions);
  if(rabiesState.forceEmptyPlot){
    regions = defaultRabiesRegions;
    ipsiData = [];
    contraData = [];
  }
  const peakVal = d3.max([...ipsiData, ...contraData], d => Math.abs(d.signedPerc) || 0) || 0;
  const domainMax = peakVal > 0 ? peakVal * 1.1 : 1;
  const rows = Math.max(regions.length, 9);
  const rowSpacing = 32;
  const innerSide = Math.max(560, rows * rowSpacing);
  rabiesPlotRefs = [];
  const ipsiRef = drawRabiesDivergingSingle('ipsilateral', '#rabiesDotPlotIpsi', ipsiData, regions, domainMax, innerSide);
  const contraRef = drawRabiesDivergingSingle('contralateral', '#rabiesDotPlotContra', contraData, regions, domainMax, innerSide);
  if(ipsiRef) rabiesPlotRefs.push(ipsiRef);
  if(contraRef) rabiesPlotRefs.push(contraRef);
  initSharedZoom();
}

function buildRabiesDivergingData(hemiKey, regions){
  const valuesSource = rabiesState.dataByHemi[hemiKey] || [];
  const output = [];
  regions.forEach(region => {
    const regionLabel = regionAcronym(region);
    valuesSource
      .filter(v => v.region === region)
      .forEach(v => {
        const geno = (v.genotype || '').trim();
        if(geno !== 'Vglut1' && geno !== 'Vgat') return;
        const val = (v.load_fraction ?? 0) * 100;
        const signedVal = geno === 'Vgat' ? -val : val;
        output.push({
          region,
          regionLabel,
          group: geno,
          valuePerc: val,
          signedPerc: signedVal,
          subject: v.subject_id
        });
      });
  });
  return output;
}

function drawRabiesDivergingSingle(hemiKey, selector, chartData, regions, domainMax, innerSide){
  const container = d3.select(selector);
  if(container.empty()) return null;
  container.selectAll('*').remove();
  const regionList = (regions && regions.length) ? regions : defaultRabiesRegions;
  const margin = rabiesPlotMargins;
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotRight = plotLeft + innerSide;
  const plotBottom = plotTop + innerSide;
  const width = plotRight + 32;
  const height = plotBottom + margin.bottom;
  const axisColor = '#94a3b8';
  const axisTextColor = '#1f2937';
  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  const xRangeStart = plotLeft + 8;
  const xRangeEnd = plotRight - 8;
  const x = d3.scaleLinear()
    .domain([-domainMax, domainMax])
    .range([xRangeStart, xRangeEnd]);

  const regionLabels = regionList.map(r => regionAcronym(r));
  const y = d3.scalePoint()
    .domain(regionLabels)
    .range([plotTop, plotBottom])
    .padding(0.35);

  const color = d3.scaleOrdinal()
    .domain(['Vglut1','Vgat'])
    .range([accent2, accent1]);

  const clipId = `clip-bar-${hemiKey}-${Math.random().toString(36).slice(2,7)}`;
  const defs = svg.append('defs');
  defs.append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide);

  const plotGroup = svg.append('g').attr('clip-path', `url(#${clipId})`);
  plotGroup.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', '#f8fafc');

  const xAxis = d3.axisBottom(x).ticks(6).tickSizeOuter(0).tickFormat(d => `${Math.abs(d)}%`);
  const xGrid = d3.axisBottom(x).ticks(6).tickSize(-(innerSide)).tickFormat(() => '');
  const xAxisTop = d3.axisTop(x).ticks(6).tickSize(0).tickSizeOuter(0).tickFormat(() => '');
  const yAxis = d3.axisLeft(y).tickSizeOuter(0);
  const yAxisRight = d3.axisRight(y).tickSize(0).tickSizeOuter(0).tickFormat(() => '');

  const xGridGroup = plotGroup.append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(xGrid)
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());

  plotGroup.append('g')
    .attr('transform', `translate(${plotLeft},0)`)
    .call(d3.axisLeft(y).tickSize(-(innerSide)).tickFormat(() => ''))
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());

  svg.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', 'none')
    .attr('stroke', axisColor)
    .attr('stroke-width', 1.4);

  plotGroup.append('line')
    .attr('x1', x(0))
    .attr('x2', x(0))
    .attr('y1', plotTop)
    .attr('y2', plotBottom)
    .attr('stroke', '#cbd5e1')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '2,2');

  const barHeight = 16;
  const offsetForGroup = g => g === 'Vglut1' ? -8 : 8;

  const bars = plotGroup.append('g')
    .selectAll('rect.bar')
    .data(chartData)
    .enter()
    .append('rect')
    .attr('class','bar')
    .attr('x', d => Math.min(x(0), x(d.signedPerc)))
    .attr('y', d => y(d.regionLabel) + offsetForGroup(d.group) - barHeight/2)
    .attr('width', d => Math.max(1, Math.abs(x(d.signedPerc) - x(0))))
    .attr('height', barHeight)
    .attr('rx', 6)
    .attr('fill', d => color(d.group))
    .attr('fill-opacity', 0.12)
    .attr('stroke', d => color(d.group))
    .attr('stroke-width', 1.6);

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

  yAxisG.selectAll('text')
    .attr('font-size', 11.5)
    .attr('fill', axisTextColor)
    .attr('text-anchor', 'end')
    .attr('x', -10)
    .attr('opacity', 1);

  svg.append('g')
    .attr('transform', `translate(${plotRight},0)`)
    .call(yAxisRight)
    .call(g => g.selectAll('domain').remove())
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').remove());

  return {
    type:'bar',
    hemiKey,
    svg,
    x0: x,
    y,
    xAxis,
    xGrid,
    xMin: xMinDomain,
    xAxisG,
    xGridGroup,
    bars,
    innerSide,
    plotLeft,
    plotRight,
    height,
    data: chartData,
    barHeight,
    offsetForGroup
  };
}

function buildRabiesBoxData(hemiKey, regions){
  const valuesSource = rabiesState.dataByHemi[hemiKey] || [];
  const output = [];
  regions.forEach(region => {
    ['Vglut1','Vgat'].forEach(geno => {
      const vals = valuesSource
        .filter(v => v.region === region && (v.genotype || '').trim() === geno)
        .map(v => v.load_fraction ?? 0)
        .filter(v => Number.isFinite(v));
      if(!vals.length) return;
      const sorted = [...vals].sort((a,b)=>a-b);
      const q1 = d3.quantileSorted(sorted, 0.25) || 0;
      const median = d3.quantileSorted(sorted, 0.5) || 0;
      const q3 = d3.quantileSorted(sorted, 0.75) || 0;
      const whiskerLow = sorted[0];
      const whiskerHigh = sorted[sorted.length-1];
      output.push({
        region,
        regionLabel: regionAcronym(region),
        group: geno,
        q1,
        median,
        q3,
        whiskerLow,
        whiskerHigh,
        n: sorted.length
      });
    });
  });
  return output;
}

function drawRabiesBoxSingle(hemiKey, selector, chartData, regions, domainMax, innerSide){
  const container = d3.select(selector);
  if(container.empty()) return null;
  container.selectAll('*').remove();
  const regionList = (regions && regions.length) ? regions : defaultRabiesRegions;
  const margin = rabiesPlotMargins;
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotRight = plotLeft + innerSide;
  const plotBottom = plotTop + innerSide;
  const width = plotRight + 32;
  const height = plotBottom + margin.bottom;
  const axisColor = '#94a3b8';
  const axisTextColor = '#1f2937';
  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  const xRangeStart = plotLeft + 8;
  const xRangeEnd = plotRight - 8;
  const x = d3.scaleLinear()
    .domain([0, domainMax || 1])
    .range([xRangeStart, xRangeEnd]);

  const regionLabels = regionList.map(r => regionAcronym(r));
  const y = d3.scalePoint()
    .domain(regionLabels)
    .range([plotTop, plotBottom])
    .padding(0.35);

  const color = d3.scaleOrdinal()
    .domain(['Vglut1','Vgat'])
    .range([accent2, accent1]);

  const clipId = `clip-box-${hemiKey}-${Math.random().toString(36).slice(2,7)}`;
  const defs = svg.append('defs');
  defs.append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide);

  const plotGroup = svg.append('g').attr('clip-path', `url(#${clipId})`);
  plotGroup.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', '#f8fafc');

  const xAxis = d3.axisBottom(x).ticks(6).tickSizeOuter(0);
  const xGrid = d3.axisBottom(x).ticks(6).tickSize(-(innerSide)).tickFormat(() => '');
  const xAxisTop = d3.axisTop(x).ticks(6).tickSize(0).tickSizeOuter(0).tickFormat(() => '');
  const yAxis = d3.axisLeft(y).tickSizeOuter(0);
  const yAxisRight = d3.axisRight(y).tickSize(0).tickSizeOuter(0).tickFormat(() => '');

  const xGridGroup = plotGroup.append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(xGrid)
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());
  plotGroup.append('g')
    .attr('transform', `translate(${plotLeft},0)`)
    .call(d3.axisLeft(y).tickSize(-(innerSide)).tickFormat(() => ''))
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());

  svg.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', 'none')
    .attr('stroke', axisColor)
    .attr('stroke-width', 1.4);

  const offsetForGroup = (g) => g === 'Vglut1' ? -7 : 7;
  const boxHeight = 14;

  const boxes = plotGroup.append('g')
    .selectAll('rect.box')
    .data(chartData)
    .enter()
    .append('rect')
    .attr('class','box')
    .attr('x', d => x(d.q1))
    .attr('width', d => Math.max(1, x(d.q3) - x(d.q1)))
    .attr('y', d => y(d.regionLabel) + offsetForGroup(d.group) - boxHeight/2)
    .attr('height', boxHeight)
    .attr('rx', 4)
    .attr('fill', d => color(d.group))
    .attr('fill-opacity', 0.12)
    .attr('stroke', d => color(d.group))
    .attr('stroke-width', 1.8);

  const medians = plotGroup.append('g')
    .selectAll('line.med')
    .data(chartData)
    .enter()
    .append('line')
    .attr('class','med')
    .attr('x1', d => x(d.median))
    .attr('x2', d => x(d.median))
    .attr('y1', d => y(d.regionLabel) + offsetForGroup(d.group) - boxHeight/2)
    .attr('y2', d => y(d.regionLabel) + offsetForGroup(d.group) + boxHeight/2)
    .attr('stroke', d => color(d.group))
    .attr('stroke-width', 2.2);

  const whiskers = plotGroup.append('g')
    .selectAll('line.whisker')
    .data(chartData)
    .enter()
    .append('line')
    .attr('class','whisker')
    .attr('x1', d => x(d.whiskerLow))
    .attr('x2', d => x(d.whiskerHigh))
    .attr('y1', d => y(d.regionLabel) + offsetForGroup(d.group))
    .attr('y2', d => y(d.regionLabel) + offsetForGroup(d.group))
    .attr('stroke', '#cbd5e1')
    .attr('stroke-width', 2);

  const whiskerCaps = plotGroup.append('g')
    .selectAll('line.cap')
    .data(chartData.flatMap(d => ([
      { ...d, cap:'low', xVal: d.whiskerLow },
      { ...d, cap:'high', xVal: d.whiskerHigh }
    ])))
    .enter()
    .append('line')
    .attr('class','cap')
    .attr('x1', d => x(d.xVal))
    .attr('x2', d => x(d.xVal))
    .attr('y1', d => y(d.regionLabel) + offsetForGroup(d.group) - boxHeight/2)
    .attr('y2', d => y(d.regionLabel) + offsetForGroup(d.group) + boxHeight/2)
    .attr('stroke', '#cbd5e1')
    .attr('stroke-width', 2);

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

  yAxisG.selectAll('text')
    .attr('font-size', 11.5)
    .attr('fill', axisTextColor)
    .attr('text-anchor', 'end')
    .attr('x', -10)
    .attr('opacity', 1);

  svg.append('g')
    .attr('transform', `translate(${plotRight},0)`)
    .call(yAxisRight)
    .call(g => g.selectAll('domain').remove())
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').remove());

  return {
    type:'box',
    hemiKey,
    svg,
    x0: x,
    y,
    xAxis,
    xGrid,
    xAxisG,
    xGridGroup,
    boxes,
    medians,
    whiskers,
    whiskerCaps,
    offsetForGroup,
    boxHeight,
    innerSide,
    plotLeft,
    plotRight,
    height
  };
}

// Build chart-ready rows for a hemisphere, respecting current grouping.
// Note: We plot relative signal (load_fraction) because absolute cell counts/starters are not available in the source CSVs.
function buildRabiesChartData(hemiKey, regions){
  const valuesSource = rabiesState.dataByHemi[hemiKey] || [];
  if(!regions.length) return [];
  let chartData = [];
  const totalsMap = rabiesState.ipsiTotalsBySubject || {};
  // Cache subject lists per genotype for this hemisphere so we can plot zeros when needed.
  const subjectsByGeno = { Vglut1: new Set(), Vgat: new Set() };
  valuesSource.forEach(v => {
    const g = (v.genotype || '').trim();
    if(g === 'Vglut1' || g === 'Vgat'){
      const subj = v.subject_id || 'unknown';
      subjectsByGeno[g].add(subj);
    }
  });
  if(rabiesState.groupBy === 'genotype'){
    const auditLog = [];
    regions.forEach(region => {
      const regionLabel = regionAcronym(region);
      ['Vglut1','Vgat'].forEach(label => {
        const vals = [];
        valuesSource
          .filter(v => v.region === region && (v.genotype || '').trim() === label)
          .forEach(v => {
            const subj = v.subject_id || 'unknown';
            const denom = totalsMap[subj] || 0;
            if(denom > 0 && typeof v.load === 'number'){
              vals.push(v.load / denom);
            }
          });
        const n = vals.length;
        const mean = n > 0 ? d3.mean(vals) : 0;
        const sem = n > 1 ? d3.deviation(vals) / Math.sqrt(n) : 0;
        auditLog.push({
          Hemisphere: hemiKey,
          Region: regionLabel,
          Genotype: label,
          'N-Count': n,
          'Mean': mean.toFixed(4)
        });
        chartData.push({
          region,
          regionLabel,
          group: label,
          value: mean,
          valuePerc: mean * 100,
          sem: sem,
          semPerc: sem * 100,
          n
        });
      });
    });
    if(auditLog.length){
      console.groupCollapsed(`Data Audit: ${hemiKey}`);
      console.table(auditLog);
      console.groupEnd();
    }
  }else{
    // subject-level: one dot per mouse per region (aggregate duplicates per subject/region/genotype)
    chartData = regions.flatMap(region => {
      const regionLabel = regionAcronym(region);
      const bySubject = new Map();
      valuesSource
        .filter(v => v.region === region)
        .forEach(v => {
          const g = (v.genotype || '').trim();
          if(g !== 'Vglut1' && g !== 'Vgat') return;
          const subj = v.subject_id || 'unknown';
          const key = `${subj}::${g}`;
          const entry = bySubject.get(key) || { values: [] };
          const denom = totalsMap[subj] || 0;
          const lf = v.load;
          const normalized = (denom > 0 && typeof lf === 'number') ? (lf / denom) : 0;
          entry.values.push(normalized);
          entry.subject = subj;
          entry.group = g;
          entry.region = region;
          entry.regionLabel = regionLabel;
          bySubject.set(key, entry);
        });
      // Ensure every mouse appears (even if value is 0) so plots show 4 Vglut1 + 3 Vgat per side.
      ['Vglut1','Vgat'].forEach(g => {
        subjectsByGeno[g].forEach(subj => {
          const key = `${subj}::${g}`;
          if(!bySubject.has(key)){
            bySubject.set(key, {
              values:[0],
              subject: subj,
              group: g,
              region,
              regionLabel
            });
          }
        });
      });
      return Array.from(bySubject.values()).map(entry => {
        const vals = entry.values;
        const mean = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
        return {
          region: entry.region,
          regionLabel: entry.regionLabel,
          group: entry.group,
          subject: entry.subject,
          value: mean,
          sem: 0,
          n: 1
        };
      });
    });
  }
  return chartData.map(d => ({
    ...d,
    rawValuePerc: (d.value || 0) * 100,
    // Apply a small pseudocount so log-scale can render zeros; keeps zeros visible at the axis floor.
    valuePerc: ((d.value || 0) * 100) > 0 ? (d.value || 0) * 100 : 0.001,
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
function drawRabiesSingle(hemiKey, selector, chartData, regions, domainMaxArg, innerSide){
  const container = d3.select(selector);
  if(container.empty()) return;
  container.selectAll('*').remove();
  const regionList = (regions && regions.length) ? regions : defaultRabiesRegions;
  // Use identical margins so both plots occupy the same width; right plot hides its y labels.
  const margin = rabiesPlotMargins;
  const legendSpace = 0;
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotRight = plotLeft + innerSide;
  const plotBottom = plotTop + innerSide;
  const width = plotRight + legendSpace + margin.right;
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
  const vals = chartData.map(d => d.valuePerc).filter(v => v > 0);
  const minPositive = vals.length ? Math.min(...vals) : 0.0001;
  const domainMaxScale = Math.max(
    domainMaxArg || 0,
    d3.max(chartData, d => (d.valuePerc + d.semPerc) || d.valuePerc || 0) || minPositive,
    minPositive * 10
  );
  const x = d3.scaleLog()
    .domain([minPositive, domainMaxScale])
    .range([xRangeStart, xRangeEnd]);

  const regionLabels = regions.map(r => regionAcronym(r));
  const y = d3.scalePoint()
    .domain(regionLabels)
    .range([plotTop, plotBottom])
    .padding(0.35);

  const color = d3.scaleOrdinal()
    .domain(['Vglut1','Vgat'])
    .range([accent2, accent1]);

  const xAxis = d3.axisBottom(x).ticks(6, "~g").tickSizeOuter(0);
  const xGrid = d3.axisBottom(x).ticks(6, "~g").tickSize(-(innerSide)).tickFormat(() => '');
  const xAxisTop = d3.axisTop(x).ticks(6, "~g").tickSize(0).tickSizeOuter(0).tickFormat(() => '');
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

  const xMinDomain = minPositive;
  const clampX = (val) => Math.max(val, xMinDomain);

  // Error bars: mean +/- SEM (only meaningful for aggregated genotype view)
  let errBars = null;
  if(rabiesState.groupBy === 'genotype'){
    errBars = plotGroup.append('g')
      .selectAll('line.err')
      .data(chartData)
      .enter()
      .append('line')
      .attr('class', 'err')
      .attr('x1', d => x(clampX(d.valuePerc - d.semPerc)))
      .attr('x2', d => x(clampX(d.valuePerc + d.semPerc)))
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
      const val = clampX(d.valuePerc || xMinDomain);
      return `translate(${x(val)},${y(d.regionLabel)}) rotate(${rotate})`;
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
    .call(g => g.selectAll('text').attr('fill', axisTextColor).attr('font-size', 14))
    .call(g => g.append('text')
      .attr('x', xRangeStart + (xRangeEnd - xRangeStart)/2)
      .attr('y', 36)
      .attr('fill', axisTextColor)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .text('Connectivity Strength (Log10, Normalized to Injection)'));
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
    .attr('font-size', 14)
    .attr('fill', axisTextColor)
    .attr('text-anchor', 'end')
    .attr('x', -10)
    .attr('opacity', 1); // show labels on both plots
  svg.append('text')
    .attr('transform', `translate(${plotLeft - 50}, ${plotTop + innerSide/2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('fill', axisTextColor)
    .attr('font-size', 14)
    .text('Mouse Brain Regions');
  svg.append('g')
    .attr('transform', `translate(${plotRight},0)`)
    .call(yAxisRight)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').remove());

  // Legend (header style, centered above plot area)
  const legendItems = [
    { label: hemiKey === 'ipsilateral' ? 'Vglut1 Ipsi' : 'Vglut1 Contra', colorKey:'Vglut1', shape:d3.symbolSquare, rotate:45 },
    { label: hemiKey === 'ipsilateral' ? 'Vgat Ipsi' : 'Vgat Contra', colorKey:'Vgat', shape:d3.symbolCircle, rotate:0 }
  ];
  const legendG = svg.append('g');
  const legendItemGap = 24;
  const legendSymbolSize = 120;
  const legendFontSize = 12;
  const legendItemWidths = legendItems.map(item => {
    const approxTextWidth = item.label.length * (legendFontSize * 0.6);
    return 20 + approxTextWidth;
  });
  const legendWidth = legendItemWidths.reduce((a,b) => a + b, 0) + legendItemGap * (legendItems.length - 1);
  const legendHeight = 22;
  const legendX = plotLeft + innerSide / 2 - legendWidth / 2;
  const legendY = Math.max(12, (plotTop / 2) - (legendHeight / 2));
  legendG.attr('transform', `translate(${legendX}, ${legendY})`);
  let cursorX = 0;
  legendItems.forEach((item, idx) => {
    const g = legendG.append('g').attr('transform', `translate(${cursorX}, ${legendHeight / 2})`);
    g.append('path')
      .attr('d', d3.symbol().type(item.shape).size(legendSymbolSize)())
      .attr('fill', color(item.colorKey))
      .attr('fill-opacity', 0.35)
      .attr('stroke', color(item.colorKey))
      .attr('stroke-width', 2)
      .attr('transform', `rotate(${item.rotate || 0})`);
    g.append('text')
      .attr('x', 18)
      .attr('y', 0)
      .text(item.label)
      .attr('fill', '#374151')
      .attr('font-size', legendFontSize)
      .attr('dominant-baseline', 'middle');
    cursorX += legendItemWidths[idx] + (idx < legendItems.length - 1 ? legendItemGap : 0);
  });

  return {
    type:'dot',
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
    xMin: xMinDomain,
    innerSide,
    plotLeft,
    plotRight,
    height
  };
}

function initSharedZoom(){
  if(!rabiesPlotRefs.length) return;
  const ref0 = rabiesPlotRefs[0];
  if(!ref0) return;
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
  // Update extents to match the current plot dimensions/view.
  if(rabiesZoomBehavior){
    rabiesZoomBehavior
      .extent([[ref0.plotLeft, 0], [ref0.plotRight, ref0.height]])
      .translateExtent([[ref0.plotLeft, 0], [ref0.plotRight, ref0.height]]);
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
    if(ref.xGridGroup){
      ref.xGridGroup.call(ref.xGrid.scale(zx))
        .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
        .call(g => g.selectAll('text').remove())
        .call(g => g.selectAll('.domain').remove());
    }
    if(ref.type === 'bar'){
      ref.bars
        .attr('x', d => Math.min(zx(0), zx(d.signedPerc)))
        .attr('width', d => Math.max(1, Math.abs(zx(d.signedPerc) - zx(0))));
    }else if(ref.type === 'box'){
      ref.boxes
        .attr('x', d => zx(d.q1))
        .attr('width', d => Math.max(1, zx(d.q3) - zx(d.q1)));
      ref.medians
        .attr('x1', d => zx(d.median))
        .attr('x2', d => zx(d.median));
      ref.whiskers
        .attr('x1', d => zx(d.whiskerLow))
        .attr('x2', d => zx(d.whiskerHigh));
      ref.whiskerCaps
        .attr('x1', d => zx(d.xVal))
        .attr('x2', d => zx(d.xVal));
    }else{
      if(ref.errBars){
        ref.errBars
          .attr('x1', d => zx(Math.max(ref.xMin || 0.0001, d.valuePerc - d.semPerc)))
          .attr('x2', d => zx(Math.max(ref.xMin || 0.0001, d.valuePerc + d.semPerc)));
      }
      ref.points.attr('transform', d => {
        const rotate = d.group === 'Vglut1' ? 45 : 0;
        const val = Math.max(ref.xMin || 0.0001, d.valuePerc);
        return `translate(${zx(val)},${ref.y(d.regionLabel)}) rotate(${rotate})`;
      });
    }
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
  const rawPerc = typeof d.rawValuePerc === 'number' ? d.rawValuePerc : (d.valuePerc || 0);
  const isZero = rawPerc === 0;
  tooltip.innerHTML = `
    <strong>${d.region}</strong><br/>
    ${groupTxt}<br/>
    Connectivity Strength: ${isZero ? '0' : rawPerc.toFixed(2)}%${rabiesState.groupBy === 'genotype' ? ` (SEM: ${semTxt}, n: ${d.n || 'NA'})` : ''}${isZero ? ' (plotted at floor)' : ''}<br/>
    <span style="color:#6b7280;font-size:11px;">(Signal area normalized to total brain-wide input)</span>
  `;
  // Position with the tooltip's top-left corner at the cursor; clamp within the rabies container.
  const rect = tooltip.getBoundingClientRect();
  const parent = tooltip.parentElement || document.body;
  const parentRect = parent.getBoundingClientRect();
  const desiredLeft = event.clientX - parentRect.left;
  const desiredTop = event.clientY - parentRect.top;
  const maxLeft = parentRect.width - rect.width;
  const maxTop = parentRect.height - rect.height;
  const clampedLeft = Math.max(0, Math.min(desiredLeft, maxLeft));
  const clampedTop = Math.max(0, Math.min(desiredTop, maxTop));
  tooltip.style.left = `${clampedLeft}px`;
  tooltip.style.top = `${clampedTop}px`;
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
  updateRabiesViewButtons();
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
