/**
 * quick-results-sync.js (V7.7.7 – FILTER-SYNC, backward-compatible)
 * ✅ Lắng nghe search:updated (bao gồm origin='filter') để đồng bộ lưới nhanh
 * ✅ Lưu state.currentResults, gán data-index ổn định cho mỗi card
 * ✅ Click card: lấy item theo state.currentResults (đã lọc), không dùng tập cũ
 * ✅ Phát quick:select + detail:open như cũ (tương thích ngược 100%)
 * ✅ Nghe detail:changed để đồng bộ highlight giữa nửa trên – nửa dưới
 * ✅ Phát quick:refresh sau khi render để các module khác theo dõi
 */
(function () {
  'use strict';

  const SELECTORS = {
    quickListCandidates: [
      '#quick-results-list',
      '.quick-results-grid',
      '#quick-results',
      '[data-role="quick-results"]'
    ]
  };

  const state = {
    currentResults: []
  };

  init();

  function init() {
    bindQuickResultsClick();
    bindSearchUpdated();
    bindDetailChanged();

    // Đảm bảo data-index được gán ngay khi DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureIndexMapping, { once: true });
    } else {
      ensureIndexMapping();
    }

    console.log('[QuickResultsSync] V7.7.7 FILTER-SYNC Ready');
  }

  function getQuickEl() {
    for (const sel of SELECTORS.quickListCandidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function bindQuickResultsClick() {
    const quick = getQuickEl();
    if (!quick) return;
    
    quick.addEventListener('click', (ev) => {
        // ✅ R6.9.5: Handle bulk checkbox click - STOP IMMEDIATELY
        const checkbox = ev.target;
        if (checkbox && checkbox.classList && checkbox.classList.contains('inv-card-checkbox')) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            
            const itemId = checkbox.dataset.itemId;
            const itemType = checkbox.dataset.itemType;
            const card = checkbox.closest('.result-card');
            
            if (!card) {
                console.warn('[QuickResultsSync] ⚠️ Card not found');
                return false;
            }
            
            // Get item data from state
            const idxAttr = card.getAttribute('data-index');
            let itemData = null;
            
            if (idxAttr != null) {
                const idx = Number(idxAttr);
                if (!Number.isNaN(idx) && state.currentResults[idx]) {
                    itemData = state.currentResults[idx];
                }
            }
            
            if (!itemData) {
                console.warn('[QuickResultsSync] ⚠️ Item data not found');
                return false;
            }
            
            // Toggle selection
            window.InventoryManager?.toggleItemSelection(itemId, itemType, itemData);
            
            // Update card visual
            if (checkbox.checked) {
                card.classList.add('inv-selected');
            } else {
                card.classList.remove('inv-selected');
            }
            
            console.log('[QuickResultsSync] ✅ Checkbox toggled:', itemId, checkbox.checked);
            
            return false;
        }

        
        // Existing card click handler
        const card = ev.target.closest('.result-card');
        if (!card || !quick.contains(card)) return;


      // Lấy id/type từ thuộc tính card (đã được ui-renderer.js gán đầy đủ)
      const id = card.dataset.id;
      const type = card.dataset.type;
      if (!id || !type) {
        console.warn('[QuickResultsSync] Card missing id/type:', card);
        return;
      }

      // ✅ Lấy item theo tập đã lọc (state.currentResults)
      const idxAttr = card.getAttribute('data-index');
      let item = null;

      if (idxAttr != null) {
        const idx = Number(idxAttr);
        if (!Number.isNaN(idx) && state.currentResults[idx]) {
          item = state.currentResults[idx];
        }
      }

      // Fallback: tìm theo id nếu data-index bị thiếu
      if (!item && state.currentResults.length) {
        const keys = type === 'mold' ? ['MoldID', 'MoldCode'] : ['CutterID', 'CutterNo'];
        item = state.currentResults.find(r => 
          keys.some(k => String(r?.[k] || '') === String(id))
        );
      }

      console.log('[QuickResultsSync] 📌 Card clicked:', type, id, 'item:', item);

      // ✅ Phát các sự kiện như cũ để tương thích ngược
      document.dispatchEvent(new CustomEvent('quick:select', {
        detail: { id, type, source: 'quick-results' }
      }));

      document.dispatchEvent(new CustomEvent('detail:open', {
        // Truyền thêm item (nếu có) cho các module mới; module cũ có thể bỏ qua
        detail: { id, type, preview: true, source: 'quick-results', item }
      }));
    });
  }

  function bindSearchUpdated() {
    // ✅ Lắng nghe search:updated (bao gồm từ SearchModule và FilterModule)
    document.addEventListener('search:updated', (e) => {
      const results = Array.isArray(e?.detail?.results)
        ? e.detail.results
        : (window.SearchModule?.getResults?.() || []);

      state.currentResults = results;

      // ✅ Nếu có UIRenderer hỗ trợ vẽ quick cards, tận dụng để đồng nhất giao diện
      // (UIRenderer.renderQuickCards đã được gọi trong UIRenderer.init, nhưng gọi lại để chắc chắn)
      if (window.UIRenderer && typeof window.UIRenderer.renderQuickCards === 'function') {
        window.UIRenderer.renderQuickCards(results);
      }

      // ✅ Đảm bảo mỗi card có data-index để click map đúng item đã lọc
      ensureIndexMapping();

      // ✅ Reset highlight cũ sau khi danh sách thay đổi
      clearQuickHighlight();

      // ✅ Thông báo làm tươi cho các module khác (nếu cần)
      document.dispatchEvent(new CustomEvent('quick:refresh', { 
        detail: { count: results.length } 
      }));

      console.log('[QuickResultsSync] 🔄 search:updated received, rendered', results.length, 'items');
    }, { passive: true });
  }

  function bindDetailChanged() {
    // ✅ Khi chi tiết thay đổi (do click ở bảng lớn hoặc điều hướng), đồng bộ highlight ở lưới nhanh
    document.addEventListener('detail:changed', (e) => {
      const item = e?.detail?.item;
      if (!item) return;

      const isMold = (item.itemType || '').toLowerCase() === 'mold';
      const id = isMold 
        ? String(item.MoldID ?? item.MoldCode ?? '') 
        : String(item.CutterID ?? item.CutterNo ?? '');
      const type = isMold ? 'mold' : 'cutter';

      if (!id) return;

      // ✅ Đồng bộ highlight card tương ứng
      document.dispatchEvent(new CustomEvent('quick:select', {
        detail: { id, type, source: 'detail-panel' }
      }));

      console.log('[QuickResultsSync] 📡 detail:changed received, sync highlight for:', type, id);
    }, { passive: true });
  }

  function ensureIndexMapping() {
    const quick = getQuickEl();
    if (!quick) return;

    const cards = quick.querySelectorAll('.result-card');
    cards.forEach((card, i) => {
      // ✅ Chỉ gán nếu thiếu, tránh đè logic khác
      if (!card.hasAttribute('data-index')) {
        card.setAttribute('data-index', String(i));
      }
    });
  }

  function clearQuickHighlight() {
    const quick = getQuickEl();
    if (!quick) return;

    // ✅ Xóa tất cả class highlight cũ
    quick.querySelectorAll('.qr-selected, .active, .inactive, .selected')
      .forEach(n => n.classList.remove('qr-selected', 'active', 'inactive', 'selected'));
  }
})();
