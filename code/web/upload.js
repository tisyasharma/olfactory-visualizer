// Initialize AOS (scroll animations) so elements with data-aos become visible
if (typeof AOS !== 'undefined') {
  AOS.init({ once: true, duration: 600, easing: 'ease-out' });
}

// Upload Center logic (moved from main.js)
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
const addImagesBtn = document.getElementById('addImagesBtn');
const addCsvBilateral = document.getElementById('addCsvBilateral');
const addCsvLeft = document.getElementById('addCsvLeft');
const addCsvRight = document.getElementById('addCsvRight');
const csvInputBilateral = document.getElementById('csvInputBilateral');
const csvInputLeft = document.getElementById('csvInputLeft');
const csvInputRight = document.getElementById('csvInputRight');
const csvList = document.getElementById('csvList');
const uploadSpinner = document.getElementById('uploadSpinner');

async function hashFile(file){
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

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
    // Refresh supporting dropdowns if main helpers are present
    if(typeof loadSubjects === 'function') loadSubjects();
    if(typeof loadSamples === 'function') loadSamples();
    if(typeof loadFiles === 'function') loadFiles();
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
