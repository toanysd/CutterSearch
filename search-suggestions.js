/**
 * search-suggestions.js (v2) – lower list fixed + safe popover
 */
(function () {
  'use strict';
  const CONFIG = { minLen: 2, maxPopover: 8, maxLowerList: 20, debounceMs: 160 };
  const SEL = {
    input: ['#search-input', '.search-input input', '.search-input', "[data-role='search-input'] input"],
    pop: '#suggest-popover',
    lower: '#keyboard-suggest',
    lowerTab: ".lower-tab[data-tab='keyboard'], .lower-tab[data-tab='input'], [data-tab='keyboard']"
  };

  let input, pop, lower, timer;

  function init() {
    input = pick(SEL.input);
    lower = document.querySelector(SEL.lower);
    ensurePopover();
    ensureStyle();
    if (!input) return;

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(onChange, CONFIG.debounceMs); });
    document.querySelector(SEL.lowerTab)?.addEventListener('click', () => setTimeout(renderLower, 40));
    document.addEventListener('history:updated', renderLower);
    document.addEventListener('search:updated', renderLower);
    onChange();
  }

  function onChange() {
    const q = (input?.value || '').trim();
    const results = compute(q);
    renderPopover(results.popover);
    renderLower(results.lower);
  }

  function compute(q) {
    const histObjs = window.SearchHistory?.get?.() || [];
    const histAll = histObjs.map(x => x.query);
    const min = q.length >= CONFIG.minLen;

    const fromHist = min ? histAll.filter(s => s.toLowerCase().includes(q.toLowerCase())) : histAll.slice(0, CONFIG.maxLowerList);
    const cur = window.SearchModule?.getResults?.() || [];
    const fromCur = min ? uniq(cur.flatMap(it => [it.displayCode, it.displayName]).filter(Boolean).filter(v => String(v).toLowerCase().includes(q.toLowerCase()))) : [];
    const allItems = window.DataManager?.getAllItems?.() || [];
    const fromData = min ? uniq(allItems.flatMap(it => [it.MoldCode, it.CutterNo, it.MoldName, it.CutterName, it.displayCode, it.displayName, it?.designInfo?.DrawingNumber]).filter(Boolean).filter(v => String(v).toLowerCase().includes(q.toLowerCase()))) : [];

    const merged = uniq([...fromHist, ...fromCur, ...fromData]);
    return {
      popover: merged.slice(0, CONFIG.maxPopover),
      lower: merged.slice(0, CONFIG.maxLowerList)
    };
  }

  function ensurePopover() {
    pop = document.querySelector(SEL.pop);
    if (!pop) { pop = document.createElement('div'); pop.id = 'suggest-popover'; document.body.appendChild(pop); }
  }

  // ... giữ nguyên phần đầu file (init/compute)
  let hideTimer = null;

  function renderPopover(list) {
    if (!input || !pop || !list.length) { hidePop(); return; }
    const colHost = input.closest('.left-col, .col-1, .search-filter, .panel, .column') || input.parentElement;
    const rIn = input.getBoundingClientRect();
    const rCol = (colHost ? colHost.getBoundingClientRect() : rIn);
    Object.assign(pop.style, {
      position: 'fixed',
      left: `${rCol.left}px`,
      top: `${rIn.bottom + 4}px`,
      width: `${Math.max(rCol.width, rIn.width)}px`,
      maxWidth: `${rCol.width}px`,
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      zIndex: 9999,
      display: 'block'
    });
    pop.innerHTML = `
      <div class="suggest-list">
        ${list.map(v => `<div class="suggest-item" data-val="${esc(v)}">${esc(v)}</div>`).join('')}
      </div>
    `;
    pop.querySelectorAll('.suggest-item').forEach(it => it.addEventListener('click', () => apply(it.dataset.val || '')));
    // đóng ngoài + phím
    setOutsideHandlers();
    resetAutoHide();
  }

  function setOutsideHandlers() {
    const off = (e) => {
      if (!pop.contains(e.target) && e.target !== input) hidePop();
    };
    const key = (e) => {
      if (e.key === 'Escape') hidePop();
      if (e.key === 'Enter') { const first = pop.querySelector('.suggest-item'); if (first) apply(first.dataset.val || ''); }
    };
    document.addEventListener('mousedown', off, { once: true });
    document.addEventListener('keydown', key, { once: true });
    window.addEventListener('resize', hidePop, { once: true });
    window.addEventListener('scroll', hidePop, { once: true, capture: true });
  }

  function resetAutoHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePop, 6000);
  }

  function hidePop() { if (pop) pop.style.display = 'none'; clearTimeout(hideTimer); }


  function renderLower(list) {
    if (!lower) lower = document.querySelector(SEL.lower);
    if (!lower) return;
    lower.innerHTML = '';
    if (!list.length) { lower.innerHTML = `<div class="muted">[提案なし] / Chưa có gợi ý</div>`; return; }

    const histSet = new Set((window.SearchHistory?.get?.() || []).map(x => String(x.query)));
    const row = document.createElement('div');
    row.className = 'chip-row';
    lower.appendChild(row);
    list.forEach(val => {
      const isHist = histSet.has(String(val));
      const btn = document.createElement('button');
      btn.className = 'quick-btn';
      btn.textContent = val;
      btn.title = val;
      btn.addEventListener('click', () => apply(val));
      if (isHist) {
        const del = document.createElement('span'); del.className = 'chip-remove'; del.textContent = '×';
        del.addEventListener('click', (e) => { e.stopPropagation(); window.SearchHistory?.remove?.(val); });
        btn.appendChild(del);
      }
      row.appendChild(btn);
    });
  }

  function apply(v) {
    if (!input) return;
    input.value = v;
    window.SearchModule?.setQuery?.(v);
    window.SearchModule?.performSearch?.();
    hidePop();
  }

  function ensureStyle() {
    if (document.getElementById('suggest-style')) return;
    const st = document.createElement('style'); st.id = 'suggest-style';
    st.textContent = `
      #keyboard-suggest { min-height: 120px; max-height: 40vh; overflow: auto; }
      #keyboard-suggest .chip-row { display:flex; flex-wrap:wrap; gap:8px; }
      #keyboard-suggest .quick-btn { background:#fff; border:1px solid var(--color-border,#e2e8f0); border-radius:14px; padding:6px 10px; font-size:12px; position:relative; }
      #suggest-popover .suggest-list { max-height: 50vh; overflow:auto; }
      #suggest-popover .suggest-item { padding:8px 10px; cursor:pointer; }
      #suggest-popover .suggest-item:hover { background:#f3f4f6; }
    `;
    document.head.appendChild(st);
  }

  const uniq = (arr) => Array.from(new Set(arr.map(v => String(v).trim()))).filter(Boolean);
  const pick = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; };
  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  if (!merged.length) {
    const top = (window.SearchHistory?.get?.() || []).map(x=>x.query);
    return { popover: top.slice(0, CONFIG.maxPopover), lower: top.slice(0, CONFIG.maxLowerList) };
  }

})();
