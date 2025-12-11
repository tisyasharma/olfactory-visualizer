const API = '/api/v1';

// Generic JSON fetch helper with friendly errors.
async function fetchJson(url){
  const res = await fetch(url);
  const ct = res.headers.get('content-type') || '';
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

// Format bytes into human-readable units.
function prettyBytes(bytes){
  if(bytes < 1024) return bytes + ' B';
  const units = ['KB','MB','GB','TB'];
  let u = -1;
  do { bytes /= 1024; ++u; } while(bytes >= 1024 && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

/* Upload UI helpers */
function setStatus(msg){
  if(typeof uploadStatus !== 'undefined' && uploadStatus){ uploadStatus.textContent = msg; uploadStatus.hidden = false; }
  if(typeof uploadWarning !== 'undefined' && uploadWarning){
    uploadWarning.hidden = true;
    uploadWarning.textContent = '';
    uploadWarning.classList?.remove('note--error');
    uploadWarning.style.display = 'none';
  }
}
function setGuidance(msg){
  if(typeof uploadGuidance === 'undefined' || !uploadGuidance) return;
  uploadGuidance.textContent = msg || '';
}
function setDupNotice(msg){
  if(typeof dupNotice === 'undefined' || !dupNotice) return;
  if(!msg){
    dupNotice.hidden = true;
    dupNotice.textContent = '';
    return;
  }
  dupNotice.hidden = false;
  dupNotice.textContent = msg;
}
function setWarning(msg){
  if(!msg){
    if(typeof uploadWarning !== 'undefined' && uploadWarning){
      uploadWarning.hidden = true;
      uploadWarning.textContent = '';
      uploadWarning.classList?.remove('note--error');
      uploadWarning.style.display = 'none';
    }
    return;
  }
  if(typeof uploadWarning !== 'undefined' && uploadWarning){
    uploadWarning.textContent = msg;
    uploadWarning.hidden = false;
    uploadWarning.classList?.remove('note--ok');
    uploadWarning.classList?.add('note--error');
    uploadWarning.style.display = 'block';
  }
  if(typeof uploadStatus !== 'undefined' && uploadStatus){ uploadStatus.hidden = true; }
}
function showSpinner(label){
  if(typeof uploadSpinner === 'undefined' || !uploadSpinner) return;
  uploadSpinner.classList.remove('spinner--success');
  const textEl = uploadSpinner.querySelector('.spinner__label');
  if(textEl){ textEl.textContent = label || 'Uploading…'; }
  uploadSpinner.hidden = false;
}
function hideSpinner(){
  if(typeof uploadSpinner === 'undefined' || !uploadSpinner) return;
  uploadSpinner.hidden = true;
  const textEl = uploadSpinner.querySelector('.spinner__label');
  if(textEl){ textEl.textContent = 'Uploading…'; }
  uploadSpinner.classList.remove('spinner--success');
}
