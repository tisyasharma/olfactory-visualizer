async function loadSubjects(mouseSelect){
  try{
    const subjects = await fetchJson(`${API}/subjects`);
    if(mouseSelect){
      mouseSelect.innerHTML = '<option value="all" selected>All</option>' +
        subjects.map(s => `<option value="${s.subject_id}">${s.subject_id}</option>`).join('');
    }
  }catch(err){
    console.warn('Failed to load subjects', err);
  }
}

async function loadSamples(scrnaSampleSelect, scrnaClusterSelect){
  try{
    const samples = await fetchJson(`${API}/scrna/samples`);
    if(scrnaSampleSelect){
      scrnaSampleSelect.innerHTML = '<option value="" disabled selected>Select sample</option>' +
        samples.map(s => `<option value="${s.sample_id}">${s.sample_id}</option>`).join('');
    }
    if(scrnaClusterSelect){
      scrnaClusterSelect.innerHTML = '<option value="" disabled selected>Select cluster</option>';
    }
  }catch(err){
    console.warn('Failed to load scRNA samples', err);
  }
}

async function loadFiles(fileSelect, fileDetails){
  try{
    const files = await fetchJson(`${API}/files`);
    if(fileSelect){
      fileSelect.innerHTML = '<option value="" disabled selected>Select file</option>' +
        files.map(f => {
          const labelParts = [f.subject_id || '', f.session_id || '', f.hemisphere || '', f.run ? `run-${f.run}` : ''].filter(Boolean);
          const label = labelParts.join(' • ') || f.path;
          return `<option value="${encodeURIComponent(f.path)}" data-path="${encodeURIComponent(f.path)}" data-session="${f.session_id || ''}" data-subject="${f.subject_id || ''}" data-hemisphere="${f.hemisphere || ''}">${label}</option>`;
        }).join('');
    }
  }catch(err){
    console.warn('Failed to load files', err);
  }
}

/* Render details for a selected microscopy file in the viewer dropdown. */
function renderFileDetails(option, fileDetails){
  // Intentionally suppress details to avoid showing paths/metadata in the UI.
  if(!fileDetails) return;
  fileDetails.innerHTML = '';
  fileDetails.hidden = true;
}

function attachFileHandlers(fileSelect, fileDetails, copyPathBtn, napariBtn){
  fileSelect?.addEventListener('change', (e) => {
    renderFileDetails(e.target.options[e.target.selectedIndex], fileDetails);
  });

  copyPathBtn?.addEventListener('click', () => {
    if(!fileSelect) return;
    const opt = fileSelect.options[fileSelect.selectedIndex];
    if(!opt) return;
    const path = decodeURIComponent(opt.getAttribute('data-path') || '');
    if(!path) return;
    navigator.clipboard?.writeText(path).then(() => setStatus(`Copied path: ${path}`));
  });

  napariBtn?.addEventListener('click', () => {
    if(!fileSelect) return;
    const opt = fileSelect.options[fileSelect.selectedIndex];
    if(!opt) return;
    const path = decodeURIComponent(opt.getAttribute('data-path') || '');
    if(!path) return;
    setStatus(`Open in napari: ${path}`);
    console.info(`Open in napari: python -c \"import napari; v=napari.Viewer(); v.open('${path}', plugin='napari-ome-zarr'); napari.run()\"`);
  });
}

function attachScrnaHandlers(scrnaSampleSelect, scrnaClusterSelect){
  scrnaSampleSelect?.addEventListener('change', async () => {
    const sample = scrnaSampleSelect.value;
    try{
      const clusters = await fetchJson(`${API}/scrna/clusters?sample_id=${encodeURIComponent(sample)}`);
      if(scrnaClusterSelect){
        scrnaClusterSelect.innerHTML = '<option value="" disabled selected>Select cluster</option>' +
          clusters.map(c => `<option value="${c.cluster_id}">${c.cluster_id} (${c.n_cells || 0} cells)</option>`).join('');
      }
      updateScrnaBar(clusters);
      updateScrnaHeatmap(sample, scrnaClusterSelect?.value || null);
    }catch(err){
      console.warn('Failed to load clusters', err);
    }
  });

  scrnaClusterSelect?.addEventListener('change', () => {
    const sample = scrnaSampleSelect?.value;
    const cluster = scrnaClusterSelect.value;
    updateScrnaHeatmap(sample, cluster);
  });
}

/* Render the scRNA bar chart stub (placeholder). */
function updateScrnaBar(clusters){
  if(typeof embedVL !== 'function'){
    return;
  }
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
  if(typeof embedVL !== 'function'){
    return;
  }
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

async function updateDoubleCharts(params){
  // Placeholder for future double injection visuals
}

async function updateRegionalCharts(params){
  // Placeholder for other datasets; keep empty for now
}

function initDatasetPage(){
  const mouseSelect = document.getElementById('mouseSelect');
  const scrnaSampleSelect = document.getElementById('scrnaSampleSelect');
  const scrnaClusterSelect = document.getElementById('scrnaClusterSelect');
  const fileSelect = document.getElementById('fileSelect');
  const fileDetails = document.getElementById('fileDetails');
  const copyPathBtn = document.getElementById('copyPathBtn');
  const napariBtn = document.getElementById('napariBtn');

  if(mouseSelect){
    loadSubjects(mouseSelect);
  }

  if(scrnaSampleSelect){
    attachScrnaHandlers(scrnaSampleSelect, scrnaClusterSelect);
    loadSamples(scrnaSampleSelect, scrnaClusterSelect);
  }

  if(fileSelect){
    attachFileHandlers(fileSelect, fileDetails, copyPathBtn, napariBtn);
    loadFiles(fileSelect, fileDetails);
  }
}

window.initDatasetPage = initDatasetPage;
