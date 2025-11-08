// quick-results-highlight.js v1.1 - Dynamic Color
(function(){
'use strict';

const LIST_SEL = ['#quick-results-list','.quick-results-grid','#quick-results','[data-role="quick-results"]'];

function getContainer(){
  for (const sel of LIST_SEL){
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function clear(){
  const box = getContainer();
  if (!box) return;
  box.querySelectorAll('.qr-selected').forEach(n => n.classList.remove('qr-selected'));
}

function select(id,type){
  const box = getContainer();
  if (!box) return;
  clear();
  
  const card = box.querySelector(`[data-id="${CSS.escape(id)}"][data-type="${CSS.escape(type)}"]`)
    || box.querySelector(`[data-code="${CSS.escape(id)}"]`);
  
  if (card){
    card.classList.add('qr-selected');
    card.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }
}

document.addEventListener('quick:select', (e)=>{
  const {id,type} = e.detail || {};
  if (!id || !type) return;
  select(id,type);
});

// ✅ STYLE - Dynamic color by type
if (!document.getElementById('qr-highlight-style')){
  const st = document.createElement('style');
  st.id = 'qr-highlight-style';
  st.textContent = `
    /* Mold selected - Blue border */
    .result-card[data-type="mold"].qr-selected { 
      border: 3px solid #2196F3 !important; 
      border-radius: 8px; 
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2) !important; 
    }
    
    /* Cutter selected - Orange border */
    .result-card[data-type="cutter"].qr-selected { 
      border: 3px solid #FF9800 !important; 
      border-radius: 8px; 
      box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.2) !important; 
    }
  `;
  document.head.appendChild(st);
}

console.log('[QuickResultsHighlight v1.1] Dynamic color ready');

})();
