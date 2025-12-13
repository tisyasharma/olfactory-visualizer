const diAccent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim() || '#e71419';
const diAccent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim() || '#5471a9';
const diAccent3 = getComputedStyle(document.documentElement).getPropertyValue('--accent3').trim() || '#22c55e';

const doubleState = {
  search: '',
  view: 'diverging',
  selectedRegions: new Set(),
  selectedRegionsByView: { diverging: new Set(), scatter: new Set() },
  hasCustomSelection: false,
  regions: [],
  data: [],
  loading: false
};

// UI Elements (lookups inside functions are safer)
const getDoubleTooltip = () => document.getElementById('doubleTooltip');

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
  const seed = regions && regions.length ? regions.slice(0, 15) : [];
  const seedSet = new Set(seed);
  doubleState.selectedRegionsByView.diverging = new Set(seedSet);
  doubleState.selectedRegionsByView.scatter = new Set(seedSet);
  doubleState.selectedRegions = seedSet;
  doubleState.hasCustomSelection = false;
}

function renderDoubleInterpretation(){
  const el = document.getElementById('doubleInterpretation');
  if(el){
    el.innerHTML = `
      This dataset compares the "Output" of two populations.<br/>
      <strong>VGLUT1 (General):</strong> Where normal excitatory AON neurons project.<br/>
      <strong>Contra-Projecting:</strong> Where the specific interhemispheric neurons project.<br/>
      A large difference (Diverging Bar) indicates a specialized pathway.
    `;
  }
}

function renderDoubleAbstractCopy(){
  const el = document.getElementById('doubleAbstractBody');
  if(el){
    el.innerHTML = `
      To determine if contralaterally projecting neurons have a distinct connectivity profile, we used an intersectional viral strategy.
      We injected Retrograde-Cre into one AON hemisphere and Cre-dependent GFP into the contralateral hemisphere. This labeled only the neurons projecting across the anterior commissure.
      We then quantified their axonal collaterals brain-wide and compared them to the general VGLUT1+ population.
    `;
  }
}

function renderDoubleFigureHead(){
  const el = document.getElementById('doubleFigureHead');
  if(!el) return;
  const titles = {
    diverging: {
      main: 'Collateral Strength Difference by Region',
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

function classifyDoubleGroup(row){
  // Combine all text fields to check for keywords
  const pieces = [
    row.group, row.genotype, row.population, row.details, row.label, row.experiment_type, row.hemisphere
  ].filter(Boolean).join(' ').toLowerCase();
  
  // Broader matching for "Contra"
  if(
    pieces.includes('contra') || 
    pieces.includes('commiss') || 
    pieces.includes('retro') || 
    pieces.includes('right') // Assuming Right = Contra in your upload setup
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
    hemisphere: row.hemisphere || ''
  };
}

function aggregateDoubleData(regionsFilter){
  if(typeof d3 === 'undefined') return [];
  const selected = regionsFilter && regionsFilter.size ? regionsFilter : null;
  
  const byRegion = new Map();
  doubleState.data.forEach(row => {
    // If a filter is active, skip regions not in the set
    if(selected && !selected.has(row.region)) return;
    
    const entry = byRegion.get(row.region) || { general: [], contra: [] };
    if(row.group === 'Vglut1'){
      entry.general.push(row.value);
    } else {
      entry.contra.push(row.value);
    }
    byRegion.set(row.region, entry);
  });
  
  const result = [];
  byRegion.forEach((vals, region) => {
    const generalMean = vals.general.length ? d3.mean(vals.general) : 0;
    const contraMean = vals.contra.length ? d3.mean(vals.contra) : 0;
    result.push({
      region,
      generalMean,
      contraMean,
      delta: contraMean - generalMean,
      nGeneral: vals.general.length,
      nContra: vals.contra.length
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

function showDoubleTooltip(event, content){
  const el = getDoubleTooltip();
  if(!el) return;
  el.innerHTML = content;
  el.hidden = false;
  
  const x = event.pageX + 12;
  const y = event.pageY + 12;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function hideDoubleTooltip(){
  const el = getDoubleTooltip();
  if(el) el.hidden = true;
}

function drawDivergingBarChart(){
  const containerNode = document.getElementById('doubleDivergingPlot');
  if(!containerNode) return;
  
  const debugEl = document.getElementById('di-debug-log');
  if(debugEl){
    debugEl.style.display = 'block';
    debugEl.textContent = '';
  }

  const container = d3.select(containerNode);
  container.selectAll('*').remove();
  
  const data = aggregateDoubleData(activeSelection());
  console.log(`Drawing Diverging Bars: ${data.length} regions`);
  
  if(!data.length){
    container.append('div').attr('class','muted small').style('padding','20px').text('No data available for the current selection.');
    return;
  }
  
  const regions = data.map(d => d.region);
  // Fallback width if hidden
  const rect = containerNode.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : 800; 
  
  const margin = { top: 40, right: 40, bottom: 50, left: 220 };
  const height = margin.top + margin.bottom + regions.length * 34;
  const maxAbs = d3.max(data, d => Math.abs(d.delta)) || 1;
  if(debugEl){
    const preview = data.slice(0,3).map(d => `${d.region}: Δ=${d.delta.toFixed(4)} (C=${d.contraMean.toFixed(4)}, G=${d.generalMean.toFixed(4)})`).join(' | ');
    debugEl.textContent = `Rendering ${data.length} regions · x-domain ±${maxAbs.toFixed(4)} · ${preview}`;
  }
  // If everything is zero, surface a message instead of an empty canvas
  if(!data.some(d => d.delta !== 0 || d.contraMean !== 0 || d.generalMean !== 0)){
    container.append('div')
      .attr('class','muted small')
      .style('padding','20px')
      .text('Data loaded, but all values are zero after normalization.');
    return;
  }
  
  const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([margin.left, width - margin.right]);
  const y = d3.scaleBand().domain(regions).range([margin.top, height - margin.bottom]).padding(0.25);

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  // Zero line
  svg.append('line')
    .attr('x1', x(0))
    .attr('x2', x(0))
    .attr('y1', margin.top - 6)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#cbd5e1')
    .attr('stroke-width', 1.5);

  // Axes
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'));

  svg.append('text')
    .attr('x', margin.left + (width - margin.left - margin.right)/2)
    .attr('y', height - 12)
    .attr('text-anchor','middle')
    .attr('fill','#1f2937')
    .attr('font-size', 12.5)
    .text('Δ Contra - General collateral density');

  // Bars
  svg.append('g')
    .selectAll('rect')
    .data(data)
    .enter()
    .append('rect')
    .attr('x', d => d.delta >= 0 ? x(0) : x(d.delta))
    .attr('y', d => y(d.region))
    .attr('width', d => Math.max(1, Math.abs(x(d.delta) - x(0))))
    .attr('height', y.bandwidth())
    .attr('fill', d => d.delta >= 0 ? diAccent2 : diAccent3)
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
}

function drawScatterPlot(){
  const containerNode = document.getElementById('doubleScatterPlot');
  if(!containerNode) return;

  const container = d3.select(containerNode);
  container.selectAll('*').remove();
  
  const agg = aggregateDoubleData(activeSelection()).filter(d => Number.isFinite(d.generalMean) && Number.isFinite(d.contraMean));
  
  if(!agg.length){
    container.append('div').attr('class','muted small').style('padding','20px').text('No paired values to plot.');
    return;
  }

  // Fallback width
  const rect = containerNode.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : 600;

  const margin = { top: 32, right: 32, bottom: 56, left: 72 };
  const height = margin.top + margin.bottom + 520;
  
  const maxVal = Math.max(
    d3.max(agg, d => d.generalMean) || 0,
    d3.max(agg, d => d.contraMean) || 0
  ) || 1;
  
  const upper = maxVal * 1.1;
  const x = d3.scaleLinear().domain([0, upper]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, upper]).range([height - margin.bottom, margin.top]);

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('width','100%')
    .style('height','auto');

  // Grid
  const xGrid = d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(() => '');
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(xGrid)
    .call(g => g.selectAll('line').attr('stroke','#eef2f7').attr('stroke-width',1))
    .call(g => g.selectAll('.domain, text').remove());
    
  const yGrid = d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(() => '');
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(yGrid)
    .call(g => g.selectAll('line').attr('stroke','#eef2f7').attr('stroke-width',1))
    .call(g => g.selectAll('.domain, text').remove());

  // Axes
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));
    
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.selectAll('text').attr('font-size', 12).attr('fill', '#1f2937'))
    .call(g => g.selectAll('.domain, line').attr('stroke', '#cbd5e1'));

  // Identity line
  svg.append('line')
    .attr('x1', x(0)).attr('y1', y(0))
    .attr('x2', x(upper)).attr('y2', y(upper))
    .attr('stroke', diAccent2)
    .attr('stroke-dasharray', '4,3')
    .attr('stroke-width', 1.6)
    .attr('opacity', 0.5);

  // Points
  svg.append('g')
    .selectAll('circle')
    .data(agg)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.generalMean))
    .attr('cy', d => y(d.contraMean))
    .attr('r', 6)
    .attr('fill', d => d.delta >= 0 ? diAccent2 : diAccent3)
    .attr('fill-opacity', 0.9)
    .attr('stroke', '#fff')
    .attr('stroke-width', 1)
    .on('mouseenter', (event, d) => {
      const html = `
        <strong>${d.region}</strong><br/>
        General: ${formatValue(d.generalMean)}<br/>
        Contra: ${formatValue(d.contraMean)}<br/>
        Δ: ${formatValue(d.delta)}
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
}

function renderDoublePlots(){
  const divDiv = document.getElementById('doubleDivergingPlot');
  const divScat = document.getElementById('doubleScatterPlot');
  const debugEl = document.getElementById('di-debug-log');

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
  
  if(doubleState.view === 'scatter'){
    if(divDiv) divDiv.style.display = 'none';
    if(divScat) divScat.style.display = 'block';
    if(debugEl) debugEl.textContent = `Scatter view · ${doubleState.data.length} rows`;
    drawScatterPlot();
  } else {
    if(divScat) divScat.style.display = 'none';
    if(divDiv) divDiv.style.display = 'block';
    if(debugEl) debugEl.textContent = `Diverging view · ${doubleState.data.length} rows`;
    drawDivergingBarChart();
  }
}

function renderDoubleRegionList(){
  const listEl = document.getElementById('doubleRegionList');
  if(!listEl) return;
  
  const selectedSet = activeSelection();
  const filtered = doubleState.regions.filter(r => r.toLowerCase().includes(doubleState.search));
  listEl.innerHTML = '';
  
  filtered.forEach(region => {
    const id = `double-${region.replace(/\W+/g,'-')}`;
    const label = document.createElement('label');
    label.className = 'region-item';
    
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
      renderDoublePlots();
    });
    
    const span = document.createElement('span');
    span.textContent = region;
    
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
  if(resetBtn){
    resetBtn.addEventListener('click', () => {
      setDefaultDoubleSelection(doubleState.regions);
      renderDoubleRegionList();
      renderDoublePlots();
    });
  }

  document.querySelectorAll('[data-double-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-double-view');
      setDoubleView(view);
      document.querySelectorAll('[data-double-view]').forEach(b => {
        const active = b.getAttribute('data-double-view') === view;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderDoublePlots();
    });
  });

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
    console.log(`Dual Injection: Received ${rows.length} rows`);

    const normalized = rows.map(normalizeDoubleRow).filter(Boolean);
    doubleState.data = normalized;
    
    const regionNames = Array.from(new Set(normalized.map(r => r.region))).sort();
    doubleState.regions = regionNames;

    if(!doubleState.hasCustomSelection){
      // Sort by delta strength to show interesting regions first
      const agg = aggregateDoubleData(null)
        .sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));
      const defaults = agg.map(a => a.region).slice(0, 15);
      setDefaultDoubleSelection(defaults);
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
  
  // 3. Load Data immediately (No tab waiting!)
  loadDoubleData();
}

window.initDoubleDashboard = initDoubleDashboard;
