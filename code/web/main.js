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
const rationaleShowLabel = '[+] View Experimental Rationale';
const rationaleHideLabel = '[-] Hide Experimental Rationale';
rabiesAbstractToggle?.addEventListener('click', () => {
  const isExpanded = rabiesAbstractToggle.getAttribute('aria-expanded') === 'true';
  rabiesAbstractToggle.setAttribute('aria-expanded', String(!isExpanded));
  if(rabiesAbstractBody){
    rabiesAbstractBody.hidden = isExpanded;
    rabiesAbstractBody.style.maxHeight = isExpanded ? '0px' : '800px';
  }
  rabiesAbstractToggle.textContent = isExpanded ? rationaleShowLabel : rationaleHideLabel;
});
if(rabiesAbstractToggle){
  rabiesAbstractToggle.textContent = rationaleShowLabel;
}

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

const API = '/api/v1';
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
  regionNameToAcronym: {}
};
const rabiesPlotMargins = { top: 12, right: 28, bottom: 44, left: 220 };

const regionSearch = document.getElementById('rabiesRegionSearch');
const regionListEl = document.getElementById('rabiesRegionList');
const tooltip = document.getElementById('rabiesTooltip');
const groupRadios = document.querySelectorAll('input[name="rabiesGroupBy"]');
const rabiesResetBtn = document.getElementById('rabiesResetBtn');
const rabiesClearBtn = document.getElementById('rabiesClearBtn');
const rabiesStatus = document.getElementById('rabiesStatus');

regionSearch?.addEventListener('input', (e) => {
  rabiesState.search = e.target.value.toLowerCase();
  renderRegionList();
});

regionSearch?.addEventListener('change', (e) => {
  const val = (e.target.value || '').trim();
  if(val && rabiesState.regions.includes(val)){
    rabiesState.selectedRegions.add(val);
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
  applyDefaultRabiesSelection();
  renderRegionList();
  drawRabiesDotPlot();
});

rabiesClearBtn?.addEventListener('click', () => {
  rabiesState.selectedRegions = new Set();
  renderRegionList();
  drawRabiesDotPlot();
  updateSelectedCount();
});

function updateSelectedCount(){
  // kept for potential future use; currently not showing a count badge
}

function setRabiesStatus(msg, tone='muted'){
  if(!rabiesStatus) return;
  rabiesStatus.textContent = msg || '';
  rabiesStatus.className = `rabies-status ${tone}`;
}

// Render the rabies region checklist based on search and selection. 
function renderRegionList(){
  if(!regionListEl) return;
  regionListEl.innerHTML = '';
  const filtered = rabiesState.regions.filter(r => r.toLowerCase().includes(rabiesState.search));
  filtered.forEach(region => {
    const id = `reg-${region.replace(/\W+/g,'-')}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'region-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = region;
    cb.checked = rabiesState.selectedRegions.has(region);
    cb.addEventListener('change', (e) => {
      if(e.target.checked){
        rabiesState.selectedRegions.add(region);
      }else{
        rabiesState.selectedRegions.delete(region);
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
  setRabiesStatus('Loading rabies data…', 'muted');
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
    setRabiesStatus(allData.length ? 'Showing normalized load fractions.' : 'No rabies data found. Ingest data to populate the plot.', allData.length ? 'muted' : 'note');
  }catch(err){
    console.warn('Rabies data load failed', err);
    const msg = err?.message || 'Rabies data load failed. Check the API and try again.';
    setRabiesStatus(msg, 'note');
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
  updateSelectedCount();
}

/* Draw both ipsilateral and contralateral rabies dot plots. */
function drawRabiesDotPlot(){
  const regions = getOrderedRabiesRegions();
  const ipsiData = buildRabiesChartData('ipsilateral', regions);
  const contraData = buildRabiesChartData('contralateral', regions);
  const domainMax = Math.max(
    100,
    d3.max([...ipsiData, ...contraData], d => (d.valuePerc + d.semPerc) || d.valuePerc || 0) || 0
  );
  const rows = Math.max(regions.length, 9);
  const rowSpacing = 32;
  const innerSide = Math.max(520, rows * rowSpacing); // square inner plotting area (height == width)
  drawRabiesSingle('ipsilateral', '#rabiesDotPlotIpsi', ipsiData, regions, domainMax, innerSide);
  drawRabiesSingle('contralateral', '#rabiesDotPlotContra', contraData, regions, domainMax, innerSide);
}

// Build chart-ready rows for a hemisphere, respecting current grouping.
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
  if(!regions || regions.length === 0){
    container.append('div').attr('class','muted').text('Select regions to plot.');
    return;
  }

  if(!chartData.length){
    container.append('div').attr('class','muted').text('No data to display.');
    return;
  }
  const margin = rabiesPlotMargins; // shared margins keep sizing in sync
  const legendSpace = 48; // space to allow legend outside top-right
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
    .style('height','100%');

  // Light plot background for grounding.
  svg.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', innerSide)
    .attr('height', innerSide)
    .attr('fill', '#f8fafc');

  const x = d3.scaleLinear()
    .domain([0, domainMax || Math.max(100, d3.max(chartData, d => d.valuePerc + d.semPerc) || 0)])
    .range([plotLeft, plotRight]);

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

  // Gridlines behind points.
  svg.append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(xGrid)
    .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
    .call(g => g.selectAll('text').remove())
    .call(g => g.selectAll('.domain').remove());
  svg.append('g')
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
  if(rabiesState.groupBy === 'genotype'){
    svg.append('g')
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

  // Points
  svg.append('g')
    .selectAll('circle')
    .data(chartData)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.valuePerc))
    .attr('cy', d => y(d.regionLabel))
    .attr('r', 6)
    .attr('fill', d => color(d.group))
    .attr('fill-opacity', 0.1)
    .attr('stroke', d => color(d.group))
    .attr('stroke-width', 2)
    .on('mouseenter', (event, d) => showTooltip(event, d))
    .on('mouseleave', hideTooltip);

  svg.append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(xAxis)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('text').attr('fill', axisTextColor).attr('font-size', 11.5))
    .call(g => g.append('text')
      .attr('x', plotLeft + (plotRight - plotLeft)/2)
      .attr('y', 36)
      .attr('fill', axisTextColor)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .text('Load fraction (%) per mouse normalized'));
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
    .attr('opacity', hemiKey === 'ipsilateral' ? 1 : 0); // show labels only on left plot
  svg.append('g')
    .attr('transform', `translate(${plotRight},0)`)
    .call(yAxisRight)
    .call(g => g.selectAll('.domain').attr('stroke', axisColor).attr('stroke-width',1.2))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').remove());

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${plotRight - 4}, ${plotTop - 12})`);
  legend.append('rect')
    .attr('x', -6)
    .attr('y', -6)
    .attr('width', 64)
    .attr('height', 32)
    .attr('rx', 8)
    .attr('fill', '#f8fafc')
    .attr('stroke', '#e2e8f0');
  ['Vglut1','Vgat'].forEach((label, idx) => {
    const row = legend.append('g').attr('transform', `translate(4, ${idx * 16})`);
    row.append('rect').attr('width',14).attr('height',14).attr('rx',3).attr('fill', color(label)).attr('fill-opacity',0.15).attr('stroke', color(label));
    row.append('text').attr('x', 20).attr('y',11).text(label).attr('fill','#374151').attr('font-size',12);
  });
}

/* Show the floating tooltip for rabies dots. */
function showTooltip(event, d){
  if(!tooltip) return;
  tooltip.hidden = false;
  const semTxt = d.semPerc ? d.semPerc.toFixed(2) + '%' : 'NA';
  const label = rabiesState.groupBy === 'genotype' ? `${d.group} (mean +/- sem)` : d.group;
  tooltip.innerHTML = `<strong>${d.region}</strong><br/>${label}<br/>Mean load fraction: ${d.valuePerc.toFixed(2)}%<br/>SEM: ${semTxt}<br/>n: ${d.n || 'NA'}`;
  const rect = tooltip.getBoundingClientRect();
  tooltip.style.left = `${event.pageX - rect.width/2}px`;
  tooltip.style.top = `${event.pageY - rect.height - 10}px`;
}
/* Hide the floating tooltip. */
function hideTooltip(){
  if(tooltip) tooltip.hidden = true;
}


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

/* === Upload Center Logic === */
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const imageList = document.getElementById('imageList');
const registerBtn = document.getElementById('registerBtn');
const clearBtn = document.getElementById('clearBtn');
const uploadStatus = document.getElementById('uploadStatus');
const uploadWarning = document.getElementById('uploadWarning');
const uploadGuidance = document.getElementById('uploadGuidance');
const dupNotice = document.getElementById('dupNotice');
const uploadModality = document.getElementById('uploadModality');
const uploadComment = document.getElementById('uploadComment');
const uploadDate = document.getElementById('uploadDate');
const imageQueue = [];
const pendingCsv = [];
const countsQueues = { bilateral: [], left: [], right: [] };
const IMAGE_EXT = ['.png','.jpg','.jpeg','.tif','.tiff','.ome.tif','.ome.tiff','.zarr','.ome.zarr'];
const CSV_EXT = ['.csv'];
let duplicateState = { duplicate:false, message:'' };
let dupCheckController = null;
let dupCheckPending = false;
async function hashFile(file){
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}
const addImagesBtn = document.getElementById('addImagesBtn');
const addCsvBilateral = document.getElementById('addCsvBilateral');
const addCsvLeft = document.getElementById('addCsvLeft');
const addCsvRight = document.getElementById('addCsvRight');
const csvInputBilateral = document.getElementById('csvInputBilateral');
const csvInputLeft = document.getElementById('csvInputLeft');
const csvInputRight = document.getElementById('csvInputRight');
const csvList = document.getElementById('csvList');
const uploadSpinner = document.getElementById('uploadSpinner');

addImagesBtn?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', (e) => addFiles([...e.target.files], 'image'));
addCsvBilateral?.addEventListener('click', () => csvInputBilateral?.click());
addCsvLeft?.addEventListener('click', () => csvInputLeft?.click());
addCsvRight?.addEventListener('click', () => csvInputRight?.click());
csvInputBilateral?.addEventListener('change', (e) => addFiles([...e.target.files], 'bilateral'));
csvInputLeft?.addEventListener('change', (e) => addFiles([...e.target.files], 'left'));
csvInputRight?.addEventListener('change', (e) => addFiles([...e.target.files], 'right'));
updateReadyStates();

['dragenter','dragover'].forEach(evt => {
  dropzone?.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-hover'); });
});
['dragleave','drop'].forEach(evt => {
  dropzone?.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('is-hover'); });
});
dropzone?.addEventListener('drop', (e) => {
  const files = [...e.dataTransfer.files];
  const images = files.filter(f => IMAGE_EXT.some(ext => (f.name || '').toLowerCase().endsWith(ext)));
  const csvs = files.filter(f => CSV_EXT.some(ext => (f.name || '').toLowerCase().endsWith(ext)));
  if(images.length){ addFiles(images, 'image'); }
  if(csvs.length){ addFiles(csvs, 'pending'); }
});

/* Add dropped/selected files to a target queue (images or CSVs). */
function addFiles(files, target){
const rejected = [];
files.forEach(f => {
  const name = (f.name || '').toLowerCase();
  const isCsv = CSV_EXT.some(ext => name.endsWith(ext));
  const isImage = IMAGE_EXT.some(ext => name.endsWith(ext));
  if(f.size === 0){
    rejected.push(`${f.name || 'unknown'} (0 bytes — download locally first)`);
    return;
  }
  if(target === 'image' && !isImage){
    rejected.push(f.name || 'unknown');
    return;
  }
    if(target !== 'image' && !isCsv){
      rejected.push(f.name || 'unknown');
      return;
    }
  if(target === 'image'){
    if(!imageQueue.find(q => q.name === f.name && q.size === f.size)){
      imageQueue.push(f);
    }
    }else if(target && ['bilateral','left','right'].includes(target)){
      const bucket = countsQueues[target];
      if(!bucket.find(q => q.name === f.name && q.size === f.size)){
        bucket.push(f);
      }
    }else if(target === 'pending'){
      if(!pendingCsv.find(q => q.name === f.name && q.size === f.size)){
        pendingCsv.push(f);
      }
    }
  });
  renderFileLists();
  updateReadyStates();
  checkDuplicatePreflight();
  if(rejected.length){
    setWarning(`Rejected unsupported file types: ${rejected.join(', ')}`);
  }else{
    setWarning('');
  }
}

/* Render the UI lists for queued image and CSV files. */
function renderFileLists(){
  if(imageList){
    if(imageQueue.length === 0){ imageList.innerHTML = ''; }
    else {
      imageList.innerHTML =
        imageQueue.map((f,idx) => `<div class="file-item" data-type="image" data-idx="${idx}"><span>${f.name}</span><span class="muted">${prettyBytes(f.size)}</span><button class="btn btn--mini remove-file" aria-label="Remove ${f.name}">×</button></div>`).join('');
    }
  }
  if(csvList){
    const rows = [];
    // pending with assign dropdown
    pendingCsv.forEach((f, idx) => {
      rows.push(`<div class="file-item" data-type="pending" data-idx="${idx}">
        <span>UNASSIGNED: ${f.name}</span>
        <span class="muted">${prettyBytes(f.size)}</span>
        <select class="csv-assign" data-idx="${idx}">
          <option value="">Assign hemisphere</option>
          <option value="bilateral">Bilateral</option>
          <option value="left">Ipsilateral</option>
          <option value="right">Contralateral</option>
        </select>
        <button class="btn btn--mini remove-file" aria-label="Remove ${f.name}">×</button>
      </div>`);
    });
    const pushRow = (label, bucket) => {
      bucket.forEach((f, idx) => {
        rows.push(`<div class="file-item" data-type="${label}" data-idx="${idx}"><span>${label.toUpperCase()}: ${f.name}</span><span class="muted">${prettyBytes(f.size)}</span><button class="btn btn--mini remove-file" aria-label="Remove ${f.name}">×</button></div>`);
      });
    };
    pushRow('bilateral', countsQueues.bilateral);
    pushRow('left', countsQueues.left);
    pushRow('right', countsQueues.right);
    if(rows.length === 0){ csvList.innerHTML = ''; }
    else {
      csvList.innerHTML = '<div class="file-list__title">Quantification CSVs</div>' + rows.join('');
    }
  }
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if(t && t.classList && t.classList.contains('csv-assign')){
    const idx = +t.getAttribute('data-idx');
    const val = t.value;
    if(!isNaN(idx) && ['bilateral','left','right'].includes(val)){
      const f = pendingCsv[idx];
      if(f){
        pendingCsv.splice(idx, 1);
        countsQueues[val].push(f);
        renderFileLists();
        updateReadyStates();
        checkDuplicatePreflight();
      }
    }
    return;
  }
  if(!(t && t.classList && t.classList.contains('remove-file'))) return;
  const item = t.closest('.file-item');
  const idx = +item.getAttribute('data-idx');
  const type = item.getAttribute('data-type');
  if(isNaN(idx) || !type) return;
  if(type === 'image'){
    imageQueue.splice(idx, 1);
  }else if(['bilateral','left','right'].includes(type)){
    countsQueues[type].splice(idx, 1);
  }else if(type === 'pending'){
    pendingCsv.splice(idx, 1);
  }
  renderFileLists();
  updateReadyStates();
  checkDuplicatePreflight();
});

clearBtn?.addEventListener('click', () => {
  resetUploadForm();
});

/* Update tracked state when a form field changes. */
function updateValueState(el){
  if(!el) return;
  if(el.value && el.value.trim() !== ''){
    el.classList.add('has-value');
  }else{
    el.classList.remove('has-value');
  }
}

[uploadModality, uploadDate].forEach(el => {
  el?.addEventListener('change', () => {
    updateValueState(el);
    updateReadyStates(); // re-evaluate readiness regardless of the order fields are filled
  });
  updateValueState(el);
});

registerBtn?.addEventListener('click', async () => {
  hideSpinner();
  // Always re-run dup check before submit
  await checkDuplicatePreflight({ force: true });
  if(duplicateState.duplicate){
    setGuidance(duplicateState.message || 'Duplicate upload detected; please use new files.');
    return;
  }
  const modality = uploadModality?.value;
  const dateVal = (uploadDate?.value || '').trim();
  if(!modality || !dateVal){
    setGuidance('Please choose a modality and select a date.');
    return;
  }
  const hasImages = imageQueue.length > 0;
  const totalCsv = countsQueues.bilateral.length + countsQueues.left.length + countsQueues.right.length;
  if(pendingCsv.length > 0){
    setGuidance('Assign all quantification CSVs to bilateral/ipsilateral/contralateral before submitting.');
    return;
  }
  if(!hasImages){
    setGuidance('Please add microscopy images before submitting.');
    return;
  }
  if(countsQueues.bilateral.length === 0 || countsQueues.left.length === 0 || countsQueues.right.length === 0){
    setGuidance('Add all three quantification files: bilateral, ipsilateral, and contralateral.');
    return;
  }
  const hemisphere = 'bilateral';
  const experimentType = modality === 'rabies' ? 'rabies' : 'double_injection';
  const sessionId = 'auto';

  const csvFiles = {
    bilateral: countsQueues.bilateral.slice(),
    left: countsQueues.left.slice(),
    right: countsQueues.right.slice()
  };
  const imageFiles = imageQueue.slice();

  const confirmMsg = `You are about to ingest ${imageFiles.length} image(s) and ${totalCsv} CSV file(s). An ID will be assigned automatically. This will write to the database. Continue?`;
  if(!window.confirm(confirmMsg)){
    return;
  }

  try{
    showSpinner('Uploading…');
    let assigned = null;
    if(imageFiles.length){
      assigned = await uploadMicroscopy(modality, sessionId, hemisphere, imageFiles, uploadComment?.value || '');
      if(!assigned || !assigned.subject_id){
        throw new Error('Microscopy upload did not return an ID');
      }
    }
    if(csvFiles.bilateral.length){
      await uploadRegionCounts(experimentType, assigned?.subject_id, assigned?.session_id, 'bilateral', csvFiles.bilateral);
    }
    if(csvFiles.left.length){
      await uploadRegionCounts(experimentType, assigned?.subject_id, assigned?.session_id, 'left', csvFiles.left);
    }
    if(csvFiles.right.length){
      await uploadRegionCounts(experimentType, assigned?.subject_id, assigned?.session_id, 'right', csvFiles.right);
    }
    setStatus(`Uploaded ${imageFiles.length} image(s) and ${totalCsv} CSV(s) -> ${assigned.subject_id} / ${assigned.session_id}`);
    resetUploadForm();
    loadSubjects();
    loadSamples();
    loadFiles();
    // Show a brief success indicator
    if(uploadSpinner){
      uploadSpinner.classList.add('spinner--success');
      const textEl = uploadSpinner.querySelector('.spinner__label');
      if(textEl){ textEl.textContent = 'Uploaded'; }
      const dot = uploadSpinner.querySelector('.spinner__dot');
      if(dot){ dot.style.animation = 'none'; }
    }
  }catch(err){
    console.error(err);
    setWarning('Upload failed: ' + err.message);
  }finally{
    hideSpinner();
  }
});

/* Set the green status strip text. */
function setStatus(msg){
  if(uploadStatus){ uploadStatus.textContent = msg; uploadStatus.hidden = false; }
  if(uploadWarning){
    uploadWarning.hidden = true;
    uploadWarning.textContent = '';
    uploadWarning.classList.remove('note--error');
    uploadWarning.style.display = 'none';
  }
}
/* Set the blue guidance strip text. */
function setGuidance(msg){
  if(!uploadGuidance) return;
  uploadGuidance.textContent = msg || '';
}
/* Set the duplicate warning strip text. */
function setDupNotice(msg){
  if(!dupNotice) return;
  if(!msg){
    dupNotice.hidden = true;
    dupNotice.textContent = '';
    return;
  }
  dupNotice.hidden = false;
  dupNotice.textContent = msg;
}
/* Set the red warning strip text. */
function setWarning(msg){
  if(!msg){
    if(uploadWarning){
      uploadWarning.hidden = true;
      uploadWarning.textContent = '';
      uploadWarning.classList.remove('note--error');
      uploadWarning.style.display = 'none';
    }
    return;
  }
  if(uploadWarning){
    uploadWarning.textContent = msg;
    uploadWarning.hidden = false;
    uploadWarning.classList.remove('note--ok');
    uploadWarning.classList.add('note--error');
    uploadWarning.style.display = 'block';
  }
  if(uploadStatus){ uploadStatus.hidden = true; }
}

/* Show a blocking spinner with label. */
function showSpinner(label){
  if(!uploadSpinner) return;
  uploadSpinner.classList.remove('spinner--success');
  const textEl = uploadSpinner.querySelector('.spinner__label');
  if(textEl){ textEl.textContent = label || 'Uploading…'; }
  uploadSpinner.hidden = false;
}
/* Hide the blocking spinner. */
function hideSpinner(){
  if(uploadSpinner){
    uploadSpinner.hidden = true;
    const textEl = uploadSpinner.querySelector('.spinner__label');
    if(textEl){ textEl.textContent = 'Uploading…'; }
    uploadSpinner.classList.remove('spinner--success');
  }
}

/* Evaluate upload readiness (enable/disable Register). */
function updateReadyStates(){
  const toggle = (el, ready) => {
    if(!el) return;
    el.classList.toggle('btn--ready', !!ready);
  };
  toggle(addImagesBtn, imageQueue.length > 0);
  toggle(addCsvBilateral, countsQueues.bilateral.length > 0);
  toggle(addCsvLeft, countsQueues.left.length > 0);
  toggle(addCsvRight, countsQueues.right.length > 0);
  if(dupCheckPending){
    if(registerBtn){ registerBtn.disabled = true; registerBtn.classList.remove('btn--ready'); }
    setGuidance('Checking duplicates…');
    setDupNotice('');
    return;
  }
  if(duplicateState.duplicate){
    if(registerBtn){ registerBtn.disabled = true; registerBtn.classList.remove('btn--ready'); }
    setGuidance(duplicateState.message || 'Duplicate upload detected; please use new files.');
    setDupNotice(duplicateState.message || 'These files were already ingested.');
    return;
  }
  const missing = [];
  if(!(uploadModality?.value || '').trim()){ missing.push('Select a modality'); }
  if(!(uploadDate?.value || '').trim()){ missing.push('Choose a date'); }
  if(imageQueue.length === 0){ missing.push('Add microscopy images'); }
  if(pendingCsv.length > 0){ missing.push('Assign all quant CSVs'); }
  if(countsQueues.bilateral.length === 0){ missing.push('Add bilateral CSV'); }
  if(countsQueues.left.length === 0){ missing.push('Add ipsilateral CSV'); }
  if(countsQueues.right.length === 0){ missing.push('Add contralateral CSV'); }
  const ready = missing.length === 0;
  if(registerBtn){
    registerBtn.disabled = !ready;
    registerBtn.classList.toggle('btn--ready', !!ready);
  }
  // Surface why the button is disabled
  if(!ready){
    setGuidance(`To enable Register: ${missing.join(' | ')}`);
  }else{
    setGuidance('Ready to register.');
    setStatus('Ready.');
  }
}

// Format bytes into human-readable units. 
function prettyBytes(bytes){
  if(bytes < 1024) return bytes + ' B';
  const units = ['KB','MB','GB','TB'];
  let u = -1;
  do { bytes /= 1024; ++u; } while(bytes >= 1024 && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

async function uploadMicroscopy(modality, sessionId, hemisphere, files, comment){
  const form = new FormData();
  form.append('session_id', sessionId || `ses-${modality}`);
  form.append('hemisphere', hemisphere || 'bilateral');
  form.append('pixel_size_um', 0.5);
  form.append('experiment_type', modality === 'rabies' ? 'rabies' : 'double_injection');
  if(comment){ form.append('comments', comment); }
  files.forEach(f => form.append('files', f, f.name));

  const res = await fetch(`${API}/microscopy-files`, {
    method: 'POST',
    body: form
  });
  if(!res.ok){
    const text = await res.text();
    let msg = text;
    try{ const parsed = JSON.parse(text); if(parsed?.detail){ msg = parsed.detail; } }catch(_){}
    if(res.status === 409){
      setWarning(`Upload failed: files already exist in the system. (${msg || 'Microscopy duplicate detected'})`);
      return { status:'skipped', message: msg };
    }
    throw new Error(msg || 'Upload failed');
  }
  const data = await res.json();
  setStatus(`Uploaded ${files.length} microscopy file(s) -> ${data.subject_id} / ${data.session_id}`);
  return data;
}

/* Clear all upload queues and reset form fields. */
function resetUploadForm(){
  imageQueue.splice(0, imageQueue.length);
  pendingCsv.splice(0, pendingCsv.length);
  countsQueues.bilateral.splice(0, countsQueues.bilateral.length);
  countsQueues.left.splice(0, countsQueues.left.length);
  countsQueues.right.splice(0, countsQueues.right.length);
  duplicateState = { duplicate:false, message:'' };
  dupCheckPending = false;
  renderFileLists();
  updateReadyStates();
  [uploadModality, uploadDate, uploadComment].forEach(el => {
    if(!el) return;
    if(el.tagName === 'SELECT'){ el.selectedIndex = 0; }
    else { el.value = ''; }
    el.classList.remove('has-value');
  });
  if(fileInput){ fileInput.value = ''; }
  if(csvInputBilateral){ csvInputBilateral.value = ''; }
  if(csvInputLeft){ csvInputLeft.value = ''; }
  if(csvInputRight){ csvInputRight.value = ''; }
  setWarning('');
  if(uploadStatus){ uploadStatus.hidden = true; uploadStatus.textContent = ''; }
  hideSpinner();
}

async function uploadRegionCounts(experimentType, subjectId, sessionId, hemisphere, files){
  const form = new FormData();
  if(subjectId){ form.append('subject_id', subjectId); }
  if(sessionId){ form.append('session_id', sessionId); }
  form.append('hemisphere', hemisphere || 'bilateral');
  form.append('experiment_type', experimentType);
  files.forEach(f => {
    let fname = f.name || 'counts.csv';
    if(hemisphere === 'left' && !fname.toLowerCase().startsWith('left_')){
      fname = `Left_${fname}`;
    }else if(hemisphere === 'right' && !fname.toLowerCase().startsWith('right_')){
      fname = `Right_${fname}`;
    }else if(hemisphere === 'bilateral' && !fname.toLowerCase().startsWith('bilateral_')){
      fname = `Bilateral_${fname}`;
    }
    form.append('files', f, fname);
  });

  const res = await fetch(`${API}/region-counts`, {
    method: 'POST',
    body: form
  });
  if(!res.ok){
    const text = await res.text();
    let msg = text;
    try{ const parsed = JSON.parse(text); if(parsed?.detail){ msg = parsed.detail; } }catch(_){}
    if(res.status === 409){
      setWarning(`Upload failed: files already exist in the system. (${msg || 'Quantification duplicate detected'})`);
      return { status:'skipped', message: msg };
    }
    throw new Error(msg || 'Upload failed');
  }
  const data = await res.json();
  if((data.rows_ingested || 0) === 0){
    setWarning('No rows ingested (possible duplicate content).');
  }else{
    setStatus(`Ingested ${data.rows_ingested || 0} row(s) from ${files.length} CSV(s)`);
  }
  return data;
}

// Duplicate preflight check (microscopy + CSV)
async function checkDuplicatePreflight({ force=false } = {}){
  // abort previous unless this is a forced check (e.g., on submit)
  if(!force && dupCheckController){ dupCheckController.abort(); }
  dupCheckController = new AbortController();
  const sig = dupCheckController.signal;
  // reset state for this run
  duplicateState = { duplicate:false, message:'' };
  dupCheckPending = true;
  setGuidance('Checking duplicates…');
  setDupNotice('');
  try{
    // Microscopy check
    if(imageQueue.length){
      const hashes = await Promise.all(imageQueue.map(hashFile));
      const res = await fetch(`${API}/microscopy-files/check-duplicate`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(hashes),
        signal: sig
      });
      if(res.ok){
        const data = await res.json();
        if(data.duplicate){
          duplicateState = { duplicate:true, message: data.message || 'Duplicate microscopy batch detected.' };
        }
      }
    }
    // CSV check (all assigned + pending)
    if(!duplicateState.duplicate){
      const allCsv = [...pendingCsv, ...countsQueues.bilateral, ...countsQueues.left, ...countsQueues.right];
      if(allCsv.length){
        const formCsv = new FormData();
        allCsv.forEach(f => formCsv.append('files', f, f.name));
        const resCsv = await fetch(`${API}/region-counts/check-duplicate`, { method:'POST', body: formCsv, signal: sig });
        if(resCsv.ok){
          const data = await resCsv.json();
          if(data.duplicate){
            duplicateState = { duplicate:true, message: data.message || 'Duplicate quantification CSV detected.' };
          }
        }
      }
    }
  }catch(err){
    if(err.name === 'AbortError') return;
    // ignore other errors; don't block
  }finally{
    dupCheckPending = false;
    updateReadyStates();
  }
}
async function fetchJson(url){
  const res = await fetch(url);
  const ct = res.headers.get('content-type') || '';
  // Prefer JSON but gracefully fallback to text for clearer errors.
  const getText = () => res.text().catch(() => 'Unable to read response body.');
  if(!res.ok){
    const detail = await getText();
    throw new Error(`${res.status} ${res.statusText || ''}`.trim() + (detail ? ` — ${detail}` : ''));
  }
  if(ct.includes('application/json')){
    return res.json();
  }
  const text = await getText();
  try{
    return JSON.parse(text);
  }catch(_){
    throw new Error('Expected JSON but received non-JSON response.');
  }
}

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
