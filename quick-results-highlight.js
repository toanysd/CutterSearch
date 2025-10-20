/**
 * quick-results-highlight.js - V7.7.7
 * Đồng bộ trạng thái chọn ở cột 2 (Quick results).
 * - Click vào thẻ: thẻ đó -> active (remove inactive), các thẻ khác -> inactive.
 * - Phát sự kiện và đồng bộ chi tiết cột 3.
 * - Cung cấp API update(id,type) cho module khác gọi (ví dụ cột 4).
 */
(function(){
  'use strict';

  const SEL = {
    grid: '#quick-results-grid',
    card: '.result-card'
  };

  function init() {
    const grid = document.querySelector(SEL.grid);
    if (!grid) {
      // chờ DOM
      const obs = new MutationObserver(() => {
        const g = document.querySelector(SEL.grid);
        if (g) { obs.disconnect(); bind(g); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    bind(grid);
  }

  function bind(grid) {
    // Ủy quyền click
    grid.addEventListener('click', (e) => {
      const card = e.target.closest(SEL.card);
      if (!card) return;

      const id = String(card.dataset.id || card.getAttribute('data-id') || '').trim();
      const type = String(card.dataset.type || card.getAttribute('data-type') || '').trim().toLowerCase();
      if (!id || !type) return;

      applyActive(card);
      syncDetail(id, type);
      document.dispatchEvent(new CustomEvent('app:select-result', { detail: { id, type } }));
    });
  }

  function applyActive(activeCard) {
    const grid = activeCard.closest(SEL.grid);
    const cards = grid ? Array.from(grid.querySelectorAll(SEL.card)) : [];
    for (const c of cards) {
      if (c === activeCard) {
        c.classList.add('active');
        c.classList.remove('inactive');
      } else {
        c.classList.remove('active');
        c.classList.add('inactive');
      }
    }
  }

  function syncDetail(id, type) {
    // Ưu tiên controller
    if (window.AppController && typeof window.AppController.selectResult === 'function') {
      window.AppController.selectResult(id, type);
      return;
    }
    // Fallback: tìm item từ kết quả hiện tại (nếu UIRenderer có lưu)
    const item = findItemInCurrentResults(id, type);
    if (item && window.UIRenderer) {
      if (typeof window.UIRenderer.renderDetailInfo === 'function') window.UIRenderer.renderDetailInfo(item, type);
      else if (typeof window.UIRenderer.renderDetail === 'function') window.UIRenderer.renderDetail(item, type);
      if (window.UIRenderer.state) window.UIRenderer.state.currentDetailItem = item;
      document.dispatchEvent(new CustomEvent('detail:changed', { detail: { item, type } }));
    }
  }

  function findItemInCurrentResults(id, type) {
    const results = window.UIRenderer?.state?.currentResults || window.SearchModule?.getResults?.() || [];
    const norm = String(id).trim();
    if (type === 'mold') {
      return results.find(x => String(x.MoldID ?? x.MoldCode) === norm) || null;
    } else if (type === 'cutter') {
      return results.find(x => String(x.CutterID ?? x.CutterNo) === norm) || null;
    }
    return null;
  }

  // Public API: tô sáng theo id/type. Nếu không tìm thấy -> tất cả inactive.
  function update(id, type) {
    const grid = document.querySelector(SEL.grid);
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(SEL.card));
    if (!cards.length) return;

    let matched = false;
    for (const c of cards) {
      const cid = String(c.dataset.id || c.getAttribute('data-id') || '').trim();
      const ctype = String(c.dataset.type || c.getAttribute('data-type') || '').trim().toLowerCase();
      const isMatch = cid === String(id) && ctype === String(type);
      if (isMatch) {
        c.classList.add('active');
        c.classList.remove('inactive');
        matched = true;
      } else {
        c.classList.remove('active');
      }
    }

    for (const c of cards) {
      if (!matched || !c.classList.contains('active')) c.classList.add('inactive');
      else c.classList.remove('inactive');
    }
  }

  window.QuickResultsHighlight = { update };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
