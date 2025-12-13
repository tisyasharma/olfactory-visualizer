const accent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim();
const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim();
const accent3 = getComputedStyle(document.documentElement).getPropertyValue('--accent3').trim();

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
// Dedicated default ordering for the connectivity bar plot (Figure H replica)
const defaultRabiesBarRegions = [
  'Anterior olfactory nucleus',
  'lateral olfactory tract, body',
  'anterior commissure, olfactory limb',
  'Main olfactory bulb',
  'Olfactory areas',
  'Piriform area',
  'Accessory olfactory bulb, mitral layer',
  'Endopiriform nucleus, dorsal part',
  'Olfactory tubercle',
  'Accessory olfactory bulb, glomerular layer',
  'Accessory olfactory bulb, granular layer',
  'olfactory nerve layer of main olfactory bulb',
  'Endopiriform nucleus, ventral part',
  'Piriform-amygdalar area'
];

const rabiesState = {
  search: '',
  groupBy: 'genotype',
  hemisphere: 'bilateral',
  selectedRegions: new Set(),
  selectedRegionsByView: { dot: new Set(), bar: new Set() },
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
  hasCustomSelectionByView: { dot: false, bar: false },
  hasCustomSelection: false,
  // Hemisphere mapping: Right = ipsilateral (injection), Left = contralateral
  hemiMap: {
    ipsilateral: 'right',
    contralateral: 'left'
  }
};
// Plot margins (balanced to keep both charts same width; extra left for labels)
const rabiesPlotMargins = { top: 80, right: 60, bottom: 44, left: 90 };

// Region ratings loaded from external JSON for bar tooltip enrichment
let regionRatings = {};
let regionRatingsLoaded = false;
let regionRatingsPromise = null;
async function loadRegionRatings(){
  if(regionRatingsLoaded) return regionRatings;
  if(!regionRatingsPromise){
    regionRatingsPromise = fetch('region_ratings.json')
      .then(res => res.ok ? res.json() : {})
      .then(data => {
        regionRatings = data || {};
        regionRatingsLoaded = true;
        return regionRatings;
      })
      .catch(() => {
        regionRatings = {};
        regionRatingsLoaded = true;
        return regionRatings;
      });
  }
  return regionRatingsPromise;
}

const regionSearch = document.getElementById('rabiesRegionSearch');
const regionListEl = document.getElementById('rabiesRegionList');
const tooltip = document.getElementById('rabiesTooltip');
const rabiesMainContainer = document.querySelector('.rabies-main');
const panelA = document.querySelector('.panel-a');
const panelB = document.querySelector('.panel-b');
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
const rabiesInterpretationEl = document.getElementById('rabiesInterpretation');
let rabiesPlotRefs = [];
let rabiesZoomBehavior = null;
let rabiesZoomTransform = d3.zoomIdentity;

function ensureSelectionContainers(){
  if(!rabiesState.selectedRegionsByView){
    rabiesState.selectedRegionsByView = { dot: new Set(), bar: new Set() };
  }
  if(!rabiesState.hasCustomSelectionByView){
    rabiesState.hasCustomSelectionByView = { dot: false, bar: false };
  }
}

function setCustomSelectionFlag(view, val){
  ensureSelectionContainers();
  rabiesState.hasCustomSelectionByView[view] = val;
  if(view === rabiesState.view){
    rabiesState.hasCustomSelection = val;
  }
}

function setCustomSelectionAllViews(val){
  setCustomSelectionFlag('dot', val);
  setCustomSelectionFlag('bar', val);
}

const rabiesInterpretationCopy = {
  dot: `
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
          <li style="margin-bottom:4px;"><strong>Log10 Scale:</strong> X-axis uses log10 values normalized to <strong>Injection Size</strong> (total ipsilateral signal) to account for uptake differences.</li>
          <li><strong>Magnitude:</strong> One tick on the scale equals a <strong>10-fold</strong> change in connection strength.</li>
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
          <span>THE SIGNAL: VGLUT1 vs. VGAT</span>
        </div>
        <ul class="insight-text" style="margin:0; padding-left:18px;">
          <li><strong>VGLUT1 (Excitatory):</strong> Driver inputs to the circuit.</li>
          <li><strong>VGAT (Inhibitory):</strong> Gating/control inputs within the circuit.</li>
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
        <span>PANEL COMPARISON: Ipsilateral vs. Contralateral</span>
      </div>
      <p class="insight-text"><strong>Ipsilateral:</strong> Robust local inputs from the injected hemisphere (higher because starter cells live here).<br/><strong>Contralateral:</strong> Sparse long-range projections from the opposite hemisphere; these are the interhemispheric inputs of interest.</p>
    </div>
  `,
  bar: `
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
          <li style="margin-bottom:4px;"><strong>Normalized to AON:</strong> The data is normalized to the AON’s own Excitatory (VGLUT1) input. The AON bar for VGLUT1 is set to 100 as the baseline reference. All other bars show % of that signal.</li>
          <li><strong>Why Log Scale?:</strong> The connection strengths span over 5 orders of magnitude. The logarithmic scale allows you to compare massive inputs (like the AON’s recurrent loop) with subtle, long-range modulators on the same chart. </li>
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
          <span>THE SIGNAL: Excitation vs. Inhibition</span>
        </div>
        <ul class="insight-text" style="margin:0; padding-left:18px;">
          <li><strong>VGAT vs. VGLUT1:</strong> Compare paired bars per region to see inhibitory vs. excitatory dominance.</li>
          <li><strong>Ranked by strength:</strong> Regions are sorted by their strongest genotype mean so high-signal inputs float to the top.</li>
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
        <span>ANATOMICAL HEIRARCHY</span>
      </div>
      <p class="insight-text">The regions at the top (AON, LOT, Anterior Commissure) are the primary highways for interhemispheric information. 
                              Regions lower on the list (like Endopiriform Nucleus) provide sparse, modulatory feedback. If a bar is missing for a specific genotype, 
                              it indicates that no significant monosynaptic connections were detected from that cell type in that region.</p>
    </div>
  `
};

function getCustomSelectionFlag(view){
  ensureSelectionContainers();
  return rabiesState.hasCustomSelectionByView[view] || false;
}

function setActiveView(view){
  ensureSelectionContainers();
  const v = view === 'bar' || view === 'dot' ? view : 'dot';
  rabiesState.view = v;
  if(!rabiesState.selectedRegionsByView[v]){
    rabiesState.selectedRegionsByView[v] = new Set(v === 'bar' ? defaultRabiesBarRegions : defaultRabiesRegions);
  }
  rabiesState.selectedRegions = rabiesState.selectedRegionsByView[v];
  rabiesState.hasCustomSelection = getCustomSelectionFlag(v);
}

function getActiveSelectionSet(){
  ensureSelectionContainers();
  if(!rabiesState.selectedRegionsByView[rabiesState.view]){
    rabiesState.selectedRegionsByView[rabiesState.view] = new Set(
      rabiesState.view === 'bar' ? defaultRabiesBarRegions : defaultRabiesRegions
    );
  }
  const set = rabiesState.selectedRegionsByView[rabiesState.view];
  rabiesState.selectedRegions = set;
  return set;
}

function updateSelectionAllViews(mutator){
  ensureSelectionContainers();
  ['dot','bar'].forEach(view => {
    if(!rabiesState.selectedRegionsByView[view]){
      rabiesState.selectedRegionsByView[view] = new Set(view === 'bar' ? defaultRabiesBarRegions : defaultRabiesRegions);
    }
    mutator(rabiesState.selectedRegionsByView[view], view);
  });
  rabiesState.selectedRegions = rabiesState.selectedRegionsByView[rabiesState.view];
}

function renderInterpretation(){
  if(!rabiesInterpretationEl) return;
  const view = rabiesState.view;
  const copy = rabiesInterpretationCopy[view] || rabiesInterpretationCopy.dot;
  rabiesInterpretationEl.innerHTML = copy;
}

setActiveView(rabiesState.view);

regionSearch?.addEventListener('input', (e) => {
  rabiesState.search = e.target.value.toLowerCase();
  renderRegionList();
});

regionSearch?.addEventListener('change', (e) => {
  const val = (e.target.value || '').trim();
  if(val && rabiesState.regions.includes(val)){
    updateSelectionAllViews(set => set.add(val));
    const sel = getActiveSelectionSet();
    rabiesState.forceEmptyPlot = false;
    setCustomSelectionAllViews(true);
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
  if(rabiesState.view === 'bar'){
    ensureSelectionContainers();
    rabiesState.selectedRegionsByView.bar = new Set(defaultRabiesBarRegions);
    rabiesState.selectedRegions = rabiesState.selectedRegionsByView.bar;
    setCustomSelectionFlag('bar', false);
  }else{
    applyDefaultRabiesSelection();
  }
  renderRegionList();
  renderRabiesPlots();
});

rabiesClearBtn?.addEventListener('click', () => {
  updateSelectionAllViews(set => set.clear());
  rabiesState.forceEmptyPlot = true;
  setCustomSelectionAllViews(true);
  renderRegionList();
  renderRabiesPlots();
});

rabiesViewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.getAttribute('data-rabies-view');
    if(view !== 'dot' && view !== 'bar') return;
    if(rabiesState.view === view) return;
    setActiveView(view);
    rabiesZoomTransform = d3.zoomIdentity;
    updateRabiesViewButtons();
    renderRabiesPlots();
  });
});

function updateRabiesViewButtons(){
  rabiesViewButtons.forEach(btn => {
    const view = btn.getAttribute('data-rabies-view');
    if(view !== 'dot' && view !== 'bar'){
      btn.classList.remove('is-active');
      btn.setAttribute('aria-pressed', 'false');
      return;
    }
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
  const selectedSet = getActiveSelectionSet();
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
    cb.checked = selectedSet.has(region);
    cb.addEventListener('change', (e) => {
      // If all boxes unchecked, show a blank plot instead of falling back to all regions
      setCustomSelectionAllViews(true);
      updateSelectionAllViews(set => {
        if(e.target.checked){
          set.add(region);
        }else{
          set.delete(region);
        }
      });
      const activeSel = getActiveSelectionSet();
      if(e.target.checked){
        rabiesState.forceEmptyPlot = false;
      }else{
        rabiesState.forceEmptyPlot = activeSel.size === 0;
      }
      renderRabiesPlots();
    });
    const span = document.createElement('span');
    const acronym = regionAcronym(region);
    const label = acronym && acronym !== region ? `${region} (${acronym})` : region;
    span.textContent = label;
    wrapper.append(cb, span);
    regionListEl.append(wrapper);
  });
}
async function loadRabiesData(){
  rabiesState.loading = true;
  // Preload qualitative ratings so bar tooltips can render without delay.
  await loadRegionRatings();
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
    defaultRabiesBarRegions.forEach(r => regionSet.add(r));
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
    ensureSelectionContainers();
    if(!rabiesState.selectedRegionsByView.bar || rabiesState.selectedRegionsByView.bar.size === 0){
      rabiesState.selectedRegionsByView.bar = new Set(defaultRabiesBarRegions);
    }
    if(rabiesState.view === 'bar'){
      rabiesState.selectedRegions = rabiesState.selectedRegionsByView.bar;
    }
    if(typeof rabiesState.hasCustomSelectionByView?.bar === 'undefined'){
      rabiesState.hasCustomSelectionByView.bar = false;
    }
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
  ensureSelectionContainers();
  const dotSet = new Set(matched);
  rabiesState.selectedRegionsByView.dot = dotSet;
  if(rabiesState.view === 'dot'){
    rabiesState.selectedRegions = dotSet;
  }
  rabiesState.forceEmptyPlot = false;
  setCustomSelectionFlag('dot', false);
}

function renderRabiesPlots(){
  renderInterpretation();
  if(rabiesFigureHead){
    const titles = {
      dot: {
        main: 'Bilateral Synaptic Inputs of Olfactory Areas',
        sub: 'Distribution of Projections to Excitatory (VGLUT1) and Inhibitory (VGAT) Neurons'
      },
      bar: {
        main: 'Afferent Inputs to AON (Interhemispheric Connectivity)',
        sub: 'Distribution of Projections to Excitatory (VGLUT1) and Inhibitory (VGAT) Neurons'
      }
    };
    const t = titles[rabiesState.view] || titles.dot;
    rabiesFigureHead.innerHTML = `
      <div class="figure-title" style="margin:0;">${t.main}</div>
      <div class="muted small" style="margin-bottom:6px;">${t.sub}</div>
    `;
  }
  if(rabiesState.view === 'bar'){
    drawRabiesDivergingPlot();
  }else{
    drawRabiesDotPlot();
  }
}

/* Draw both ipsilateral and contralateral rabies dot plots. */
function drawRabiesDotPlot(){
  if(panelB){
    panelB.style.display = '';
    panelB.style.flex = '';
    panelB.style.maxWidth = '';
  }
  let regions = getOrderedRabiesRegions();
  let ipsiData = buildRabiesChartData('ipsilateral', regions);
  let contraData = buildRabiesChartData('contralateral', regions);
  const contraContainer = document.querySelector('#rabiesDotPlotContra');
  if(contraContainer) contraContainer.style.display = '';
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

function drawRabiesDivergingPlot(){
  const contraContainer = document.querySelector('#rabiesDotPlotContra');
  if(contraContainer){
    contraContainer.innerHTML = '';
    contraContainer.style.display = 'none';
  }
  rabiesPlotRefs = [];
  if(panelB){
    panelB.style.display = 'none';
    panelB.style.flex = '0 0 0';
    panelB.style.maxWidth = '0';
  }
  const container = d3.select('#rabiesDotPlotIpsi');
  container.selectAll('*').remove();
  let regions = getOrderedRabiesBarRegions();
  if(rabiesState.forceEmptyPlot){
    regions = defaultRabiesBarRegions;
  }
  const barData = buildRabiesBarData(regions);
  if(rabiesState.forceEmptyPlot || !barData.length) return;

  // Sort regions by the stronger genotype value so top signals float upward
  const maxByRegion = {};
  barData.forEach(d => {
    maxByRegion[d.regionLabel] = Math.max(maxByRegion[d.regionLabel] || 0, d.value || 0);
  });
  const sortedRegions = Object.entries(maxByRegion)
    .sort((a,b) => b[1] - a[1])
    .map(([label]) => label);
  const maxLabelChars = d3.max(sortedRegions, l => (l || '').length) || 10;
  const leftMargin = Math.min(220, Math.max(110, maxLabelChars * 7)); // widen just enough for labels
  const margin = { top: 40, right: 32, bottom: 50, left: leftMargin };
  const containerNode = document.getElementById('rabiesDotPlotIpsi');
  const width = Math.max(1000, containerNode?.getBoundingClientRect?.().width || 0);
  const height = margin.top + margin.bottom + Math.max(sortedRegions.length * 32, 400);
  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  const genotypes = ['Vglut1','Vgat'];
  const color = d3.scaleOrdinal().domain(genotypes).range([accent2, accent1]);

  const xMin = 0.01;
  const xMax = 10000;
  const x = d3.scaleLog().domain([xMin, xMax]).range([margin.left, width - margin.right]).clamp(true);
  const y = d3.scaleBand().domain(sortedRegions).range([margin.top, height - margin.bottom]).paddingInner(0.25);
  // Stack so VGAT sits above VGLUT1 within each region row
  const ySub = d3.scaleBand().domain(['Vgat','Vglut1']).range([0, y.bandwidth()]).paddingInner(0.2);

  // axes
  const xAxis = d3.axisBottom(x).ticks(6, "~g");
  const xAxisG = svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain').attr('stroke', '#cbd5e1'));
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'));
  svg.append('text')
    .attr('transform', `translate(${margin.left - 50}, ${(height - margin.bottom + margin.top)/2}) rotate(-90)`)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('Mouse Brain Regions');

  // gridlines
  svg.append('g')
    .selectAll('line')
    .data(x.ticks(6))
    .enter()
    .append('line')
    .attr('x1', d => x(d))
    .attr('x2', d => x(d))
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#eef2f7')
    .attr('stroke-dasharray', '2,2')
    .attr('stroke-width', 1);

  // bars
  const bars = svg.append('g')
    .selectAll('rect')
    .data(barData)
    .enter()
    .append('rect')
    .attr('x', x(xMin))
    .attr('y', d => y(d.regionLabel) + (ySub(d.group) || 0))
    .attr('height', ySub.bandwidth())
    .attr('width', d => Math.max(1, x(Math.max(xMin, d.value)) - x(xMin)))
    .attr('fill', d => color(d.group))
    .attr('fill-opacity', 0.8)
    .on('mouseenter', (event, d) => showBarTooltip(event, d))
    .on('mouseleave', hideTooltip);

  // axes labels
  svg.append('text')
    .attr('x', margin.left + (width - margin.left - margin.right)/2)
    .attr('y', height - 10)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('Mean normalized value (% of AON) [log scale]');

  rabiesPlotRefs = [{
    type: 'bar',
    bars,
    svg,
    x0: x,
    y,
    xMin,
    xAxis,
    xAxisG,
    xGridGroup: null,
    plotLeft: margin.left,
    plotRight: width - margin.right,
    height
  }];
  initSharedZoom();
}

function buildRabiesBarData(regions){
  const regionList = regions && regions.length ? regions : defaultRabiesBarRegions;
  // Always derive normalization from the raw contralateral values.
  const valuesSource = rabiesState.dataByHemi?.contralateral || [];
  const allowedGenos = ['Vglut1','Vgat'];
  const valuesByRegion = new Map();
  valuesSource.forEach(v => {
    const regionName = v.region;
    const g = (v.genotype || '').trim();
    if(!regionName || !allowedGenos.includes(g)) return;
    const lf = typeof v.load === 'number'
      ? v.load
      : (typeof v.load_fraction === 'number' ? v.load_fraction : 0);
    if(!Number.isFinite(lf)) return;
    const entry = valuesByRegion.get(regionName) || { Vglut1: [], Vgat: [] };
    const arr = entry[g] || [];
    arr.push(lf);
    entry[g] = arr;
    valuesByRegion.set(regionName, entry);
  });
  const meanFor = (regionName, geno) => {
    const entry = valuesByRegion.get(regionName);
    const vals = entry?.[geno] || [];
    return vals.length ? d3.mean(vals) : 0;
  };
  const findReferenceValue = () => {
    // Prefer the explicit name; fall back to acronym match if needed.
    let ref = meanFor('Anterior olfactory nucleus', 'Vglut1');
    if(ref > 0) return ref;
    for(const [regionName] of valuesByRegion){
      const label = regionAcronym(regionName);
      if((label || '').toUpperCase() === 'AON'){
        const candidate = meanFor(regionName, 'Vglut1');
        if(candidate > 0){
          ref = candidate;
          break;
        }
      }
    }
    return ref > 0 ? ref : 1; // avoid division by zero
  };
  const referenceValue = findReferenceValue();
  const out = [];
  regionList.forEach(region => {
    const regionLabel = regionAcronym(region);
    allowedGenos.forEach(g => {
      const mean = meanFor(region, g);
      const scaled = (mean / referenceValue) * 100;
      out.push({
        region,
        regionLabel,
        group: g,
        value: Math.max(0.0001, scaled)
      });
    });
  });
  return out;
}


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

function orderRegionsWithDefault(selectedList, defaultList){
  const seen = new Set();
  const ordered = [];
  defaultList.forEach(def => {
    const match = selectedList.find(r => r.toLowerCase() === def.toLowerCase());
    if(match && !seen.has(match)){ ordered.push(match); seen.add(match); }
  });
  selectedList
    .filter(r => !seen.has(r))
    .sort((a,b) => a.localeCompare(b))
    .forEach(r => { seen.add(r); ordered.push(r); });
  return ordered;
}

// Selected regions (or all available if none manually chosen), ordered with defaults first.
function getOrderedRabiesRegions(){
  ensureSelectionContainers();
  const selectedSet = rabiesState.selectedRegionsByView.dot || new Set();
  const selected = selectedSet.size
    ? Array.from(selectedSet)
    : Array.from(new Set(rabiesState.data.map(d => d.region)));
  return orderRegionsWithDefault(selected, defaultRabiesRegions);
}

function getOrderedRabiesBarRegions(){
  ensureSelectionContainers();
  const barSet = rabiesState.selectedRegionsByView.bar || new Set();
  const selected = barSet.size ? Array.from(barSet) : [];
  const useDefaultBar = !getCustomSelectionFlag('bar') || selected.length === 0;
  const base = useDefaultBar ? defaultRabiesBarRegions : selected;
  return orderRegionsWithDefault(base, defaultRabiesBarRegions);
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
    if(ref.xAxis && ref.xAxisG){
      ref.xAxisG.call(ref.xAxis.scale(zx));
    }
    if(ref.xGridGroup){
      ref.xGridGroup.call(ref.xGrid.scale(zx))
        .call(g => g.selectAll('line').attr('stroke', '#eef2f7').attr('stroke-width', 1))
        .call(g => g.selectAll('text').remove())
        .call(g => g.selectAll('.domain').remove());
    }
    if(ref.type === 'bar'){
      const minX = ref.xMin || 0.0001;
      ref.bars
        .attr('x', () => zx(minX))
        .attr('width', d => Math.max(1, zx(Math.max(minX, d.value)) - zx(minX)));
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

function showBarTooltip(event, d){
  if(!tooltip) return;
  tooltip.hidden = false;
  const rating = regionRatings[d.region] || {};
  const regionName = d.region || d.regionLabel;
  const hasRatings = rating && (rating.VGLUT1 || rating.VGAT || rating.Vglut1 || rating.Vgat);
  const buildTable = () => {
    const toRow = (genoLabel) => {
      const key = genoLabel.toUpperCase();
      const entry = rating[key] || {};
      const ipsi = entry.Ipsi;
      const contra = entry.Contra;
      if(typeof ipsi === 'undefined' && typeof contra === 'undefined') return '';
      return `<tr><td>${genoLabel}</td><td>${ipsi ?? '–'}</td><td>${contra ?? '–'}</td></tr>`;
    };
    const rows = [toRow('Vglut1'), toRow('Vgat')].filter(Boolean).join('');
    if(!rows) return '';
    return `
      <div class="muted small" style="margin-top:6px;">Connectivity rating</div>
      <table class="small" style="margin-top:2px;">
        <thead><tr><th></th><th>Ipsi</th><th>Contra</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  };
  const toRow = (genoLabel) => {
    const key = genoLabel.toUpperCase();
    const entry = rating[key] || {};
    const ipsi = entry.Ipsi || '–';
    const contra = entry.Contra || '–';
    return `<tr><td>${genoLabel}</td><td>${ipsi}</td><td>${contra}</td></tr>`;
  };
  const valTxt = d.value ? d.value.toExponential(2) : '0';
  tooltip.innerHTML = `
    <strong>${regionName}</strong><br/>
    Genotype: ${d.group}<br/>
    Value: ${valTxt}<br/>
    ${hasRatings ? buildTable() : ''}
  `;
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

function initRabiesDashboard(){
  if(!document.getElementById('rabiesTab')) return;
  rabiesZoomTransform = d3.zoomIdentity;
  updateRabiesViewButtons();
  loadRabiesData();
}

window.initRabiesDashboard = initRabiesDashboard;
