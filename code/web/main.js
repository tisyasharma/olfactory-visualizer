// Initialize AOS (scroll animations)
if (typeof AOS !== 'undefined') {
  AOS.init({ once:true, duration:600, easing:'ease-out' });
}

// Tabs logic
const tabs = [
  { btn: 'rabiesTabBtn', panel: 'rabiesTab' },
  { btn: 'doubleTabBtn', panel: 'doubleTab' },
  { btn: 'scrnaTabBtn', panel: 'scrnaTab' }
];

tabs.forEach(({btn, panel}) => {
  const b = document.getElementById(btn);
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

(function init(){
  // open first tab by default
  activateTab('rabiesTabBtn', 'rabiesTab');

  if(typeof initRabiesDashboard === 'function'){
    initRabiesDashboard();
  }
  if(typeof initDatasetPage === 'function'){
    initDatasetPage();
  }
})();
