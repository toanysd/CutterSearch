/**
 * ui-renderer-hook.js - V7.7.7
 * Hook hậu hiển thị cho UIRenderer để tự đồng bộ trạng thái active/inactive ở cột 2.
 * - Tự động gọi QuickResultsHighlight.update(...) ngay sau khi hiển thị quick results.
 * - Hỗ trợ cả UIRenderer.renderQuickResults(...) và UIRenderer.renderSearchResults(...).
 * - Đồng bộ hai chiều theo các sự kiện app:select-result, detail:changed, search:updated.
 */
(function () {
  'use strict';

  const SEL = { grid: '#quick-results-grid', card: '.result-card' };

  // Lấy lựa chọn hiện tại từ UIRenderer.state
  function currentSelection() {
    const it = window.UIRenderer?.state?.currentDetailItem || null;
    if (!it) return null;
    if (it.MoldID != null) return { id: String(it.MoldID ?? it.MoldCode), type: 'mold' };
    if (it.CutterID != null || it.CutterNo != null) return { id: String(it.CutterID ?? it.CutterNo), type: 'cutter' };
    return null;
  }

  // Gọi highlight dùng module chung, nếu không có thì fallback DOM
  function highlight(id, type) {
    if (!id || !type) return;
    if (window.QuickResultsHighlight?.update) {
      window.QuickResultsHighlight.update(id, type);
      return;
    }
    const grid = document.querySelector(SEL.grid);
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(SEL.card));
    if (!cards.length) return;

    let matched = false;
    for (const c of cards) {
      const cid = String(c.dataset.id || c.getAttribute('data-id') || '').trim();
      const ctype = String(c.dataset.type || c.getAttribute('data-type') || '').trim().toLowerCase();
      const isMatch = cid === String(id) && ctype === String(type);
      if (isMatch) { c.classList.add('active'); c.classList.remove('inactive'); matched = true; }
      else { c.classList.remove('active'); }
    }
    for (const c of cards) {
      if (!matched || !c.classList.contains('active')) c.classList.add('inactive');
      else c.classList.remove('inactive');
    }
  }

  // Gọi highlight theo lựa chọn hiện có
  function highlightFromState() {
    const sel = currentSelection();
    if (sel) highlight(sel.id, sel.type);
  }

  // Monkey-patch an toàn một method để chạy callback sau khi method gốc hoàn tất
  function after(obj, methodName, cb) {
    if (!obj || typeof obj[methodName] !== 'function') return;
    const original = obj[methodName];
    obj[methodName] = function patched(...args) {
      const ret = original.apply(this, args);
      try { cb({ args, ret, ctx: this }); } catch (e) { console.warn('[UIHook] post-callback error:', e); }
      return ret;
    };
  }

  function initHook() {
    if (!window.UIRenderer) {
      // chờ UIRenderer sẵn sàng
      const t = setInterval(() => {
        if (window.UIRenderer) { clearInterval(t); initHook(); }
      }, 100);
      return;
    }

    // Patch cả hai biến thể render
    after(window.UIRenderer, 'renderQuickResults', () => {
      // Sau khi hiển thị quick results, đồng bộ highlight theo lựa chọn hiện tại
      setTimeout(highlightFromState, 0);
      // Phát sự kiện để module khác (nếu cần) có thể bắt
      document.dispatchEvent(new CustomEvent('ui:quick-rendered'));
    });

    after(window.UIRenderer, 'renderSearchResults', () => {
      setTimeout(highlightFromState, 0);
      document.dispatchEvent(new CustomEvent('ui:quick-rendered'));
    });

    // Đồng bộ hai chiều qua sự kiện
    document.addEventListener('app:select-result', (e) => {
      const d = e.detail || {};
      if (d.id && d.type) highlight(d.id, d.type);
    });
    document.addEventListener('detail:changed', () => {
      highlightFromState();
    });
    document.addEventListener('search:updated', () => {
      // Khi kết quả thay đổi và được render, patch trên sẽ tự gọi; gọi bổ sung để chắc chắn
      setTimeout(highlightFromState, 0);
    });

    console.log('[UIRendererHook] ready: auto-sync quick highlight after render');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHook); else initHook();
})();
