// Initialize AOS (scroll animations)
if (typeof AOS !== 'undefined') {
  AOS.init({ once:true, duration:600, easing:'ease-out' });
}

// Tabs logic (dynamic so pages can omit tabs)
const tabs = Array.from(document.querySelectorAll('.tab')).map(btn => ({
  btn: btn.id,
  panel: btn.getAttribute('aria-controls')
}));

tabs.forEach(({btn, panel}) => {
  const b = document.getElementById(btn);
  if(!b || !panel) return;
  b.addEventListener('click', () => activateTab(btn, panel));
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
    if(isActive){
      p.style.opacity = '1';
      p.style.transform = 'none';
    }
  });
  // If the double tab is activated, re-render its plots after the DOM is visible
  if(activePanelId === 'doubleTab' && typeof renderDoublePlots === 'function'){
    setTimeout(() => renderDoublePlots(), 60);
  }
  // Refresh AOS so hidden panels regain visibility after activation
  if(typeof AOS !== 'undefined'){
    if(typeof AOS.refreshHard === 'function'){ AOS.refreshHard(); }
    else if(typeof AOS.refresh === 'function'){ AOS.refresh(); }
  }
}

(function init(){
  // open first tab by default (if present)
  const firstTab = document.querySelector('.tab');
  if(firstTab){
    const panelId = firstTab.getAttribute('aria-controls');
    if(panelId){
      activateTab(firstTab.id, panelId);
    }
  }

  if(typeof initDoubleDashboard === 'function'){
    initDoubleDashboard();
  }
  if(typeof initRabiesDashboard === 'function'){
    initRabiesDashboard();
  }
  if(typeof initDatasetPage === 'function'){
    initDatasetPage();
  }
})();
