/**
 * keyboard-shortcuts.js - V7.7.7
 * キーボード操作の統合 / Tích hợp phím tắt
 *
 * Tính năng:
 * - Alt+H hoặc Ctrl+H: Mở/đóng bảng “履歴 / Lịch sử”.
 * - Mũi tên Lên/Xuống: Di chuyển chọn trong Quick Results.
 * - Enter: Mở chi tiết item đang được focus và ghi lịch sử.
 * - Alt+R: Làm mới danh sách “Thiết bị liên quan”.
 *
 * Hoạt động độc lập; ưu tiên gọi AppController.selectResult và SearchHistoryBridge nếu có.
 */
(function () {
  'use strict';

  const SEL = {
    grid: '#quick-results-grid, #quick-results, .quick-results-grid',
    card: '.result-card, .quick-result-card',
    historyWrap: '.shb-wrap',
    historyPanel: '#shb-panel',
    historyToggle: '#shb-toggle'
  };

  // Trạng thái chỉ mục đang chọn trong Quick Results
  const Focus = { index: -1 };

  // Hỗ trợ tìm grid và card
  function getGrid() { return document.querySelector(SEL.grid); }
  function getCards() {
    const grid = getGrid();
    if (!grid) return [];
    return Array.from(grid.querySelectorAll(SEL.card));
  }

  function scrollIntoViewIfNeeded(el) {
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    if (r.top < pr.top + 10) el.scrollIntoView({ block: 'nearest' });
    else if (r.bottom > pr.bottom - 10) el.scrollIntoView({ block: 'nearest' });
  }

  // Đặt focus (thêm class aria-like)
  function setFocus(idx) {
    const cards = getCards();
    if (!cards.length) { Focus.index = -1; return; }
    if (idx < 0) idx = 0;
    if (idx >= cards.length) idx = cards.length - 1;
    Focus.index = idx;
    cards.forEach((c, i) => {
      if (i === idx) {
        c.classList.add('kb-focus');
        c.setAttribute('tabindex', '0');
        c.focus?.();
        scrollIntoViewIfNeeded(c);
      } else {
        c.classList.remove('kb-focus');
        c.removeAttribute('tabindex');
      }
    });
  }

  // Kích hoạt card hiện tại (mô phỏng click)
  function activateFocused() {
    const cards = getCards();
    if (!cards.length || Focus.index < 0 || Focus.index >= cards.length) return;
    const card = cards[Focus.index];
    // Đồng bộ active/inactive
    cards.forEach(c => { if (c === card) { c.classList.add('active'); c.classList.remove('inactive'); } else { c.classList.remove('active'); c.classList.add('inactive'); } });

    const id = card.getAttribute('data-id') || '';
    const type = (card.getAttribute('data-type') || '').toLowerCase();
    const code = card.getAttribute('data-code') || '';
    const name = card.getAttribute('data-name') || '';
    if (window.AppController && typeof window.AppController.selectResult === 'function') {
      window.AppController.selectResult(id, type);
    } else if (window.SearchHistoryBridge && typeof window.SearchHistoryBridge.select === 'function') {
      window.SearchHistoryBridge.select({ id, type, code, name, ts: Date.now() });
    } else {
      card.click?.(); // fallback
    }
  }

  // Toggle panel lịch sử
  function toggleHistoryPanel() {
    const toggle = document.querySelector(SEL.historyToggle);
    const panel  = document.querySelector(SEL.historyPanel);
    if (toggle && panel) {
      const open = !panel.classList.contains('open');
      if (!open) panel.classList.remove('open');
      else panel.classList.add('open');
    } else {
      // Nếu chưa có UI, phát sự kiện để SearchHistoryBridge có thể xử lý ngoài
      window.dispatchEvent(new CustomEvent('mcs:history-toggle'));
    }
  }

  // Làm mới danh sách thiết bị liên quan
  function refreshRelated() {
    try { window.RelatedEquipment?.refresh?.(); } catch {}
  }

  // Gắn CSS nhỏ cho trạng thái kb-focus
  const style = document.createElement('style');
  style.textContent = `
    .kb-focus { outline: 2px solid #22c55e !important; outline-offset: -2px !important; }
  `;
  document.head.appendChild(style);

  // Lắng nghe phím
  document.addEventListener('keydown', (e) => {
    const isInput = /INPUT|TEXTAREA|SELECT/.test((e.target?.tagName || '').toUpperCase()) || e.target?.isContentEditable;
    const modH = (e.altKey || e.ctrlKey) && (e.key === 'h' || e.key === 'H');
    if (modH) {
      e.preventDefault();
      toggleHistoryPanel();
      return;
    }
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      refreshRelated();
      return;
    }
    // Khi đang gõ trong input thì bỏ qua điều hướng
    if (isInput) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const cards = getCards();
      if (!cards.length) return;
      setFocus(Focus.index + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = getCards();
      if (!cards.length) return;
      setFocus(Focus.index - 1);
      return;
    }
    if (e.key === 'Enter') {
      // Chỉ kích hoạt khi có focus trong Quick Results
      const cards = getCards();
      if (!cards.length) return;
      if (Focus.index < 0) setFocus(0);
      e.preventDefault();
      activateFocused();
      return;
    }
  });

  // Đồng bộ focus khi danh sách tìm kiếm thay đổi
  document.addEventListener('search:updated', () => setFocus(0));
  document.addEventListener('detail:changed', () => {
    // Sau khi thay đổi chi tiết, đưa focus về thẻ đang active nếu còn trong danh sách
    const cards = getCards();
    const activeIdx = cards.findIndex(c => c.classList.contains('active'));
    if (activeIdx >= 0) setFocus(activeIdx);
  });

  // Xuất API nhỏ phục vụ test
  window.KeyboardShortcuts = {
    focusNext: () => setFocus(Focus.index + 1),
    focusPrev: () => setFocus(Focus.index - 1),
    activate: () => activateFocused(),
    toggleHistory: () => toggleHistoryPanel(),
    refreshRelated: () => refreshRelated()
  };
})();
