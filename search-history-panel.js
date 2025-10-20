/**
 * search-history-panel.js - V7.7.7
 * 履歴パネル（小型UI）/ Bảng lịch sử chọn nhanh (UI nhỏ)
 *
 * Mục tiêu:
 * - Nút nổi mở/đóng bảng lịch sử gần đây (tối đa 20 mục).
 * - Hiển thị loại (mold/cutter), mã, tên; click để chọn lại và đồng bộ highlight cột 2.
 * - Không yêu cầu sửa HTML; tự inject CSS + DOM, bám theo quick-results hoặc dùng vị trí cố định.
 * - Tương thích SearchHistoryBridge (ưu tiên); nếu thiếu, tự đọc localStorage 'mcs.history.v1'.
 */

(function () {
  'use strict';

  const CFG = {
    maxShow: 20,
    zIndex: 9999,
    storageKey: 'mcs.history.v1',
    gridSelectors: ['#quick-results-grid', '#quick-results', '.quick-results-grid']
  };

  const I18N = {
    titleJP: '最近の選択',
    titleVN: 'Lựa chọn gần đây',
    emptyJP: '履歴はありません',
    emptyVN: 'Chưa có lịch sử',
    clearJP: '履歴削除',
    clearVN: 'Xóa lịch sử',
    btnJP: '履歴',
    btnVN: 'Lịch sử',
    moldJP: '金型',
    cutterJP: '抜型'
  };

  // ===== Styles =====
  injectStyles(`
    .shb-wrap { position: fixed; right: 16px; bottom: 88px; z-index: ${CFG.zIndex}; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
    .shb-btn {
      display:flex; align-items:center; gap:6px; padding:10px 12px; border-radius:999px; border:1px solid #e5e7eb;
      background:#111827; color:#fff; box-shadow:0 6px 16px rgba(0,0,0,.18); cursor:pointer; user-select:none;
    }
    .shb-btn svg { width:18px; height:18px; }
    .shb-panel {
      position:absolute; right:0; bottom:56px; width:320px; max-height:56vh; overflow:auto; background:#fff; border:1px solid #e5e7eb;
      border-radius:12px; box-shadow:0 12px 30px rgba(0,0,0,.18); display:none;
    }
    .shb-panel.open { display:block; }
    .shb-head { padding:10px 12px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; }
    .shb-title { font-weight:700; color:#111827; font-size:13px; }
    .shb-sub   { color:#6b7280; font-size:11px; }
    .shb-clear { font-size:11px; color:#ef4444; background:#fee2e2; border:1px solid #fecaca; padding:4px 8px; border-radius:999px; cursor:pointer; }
    .shb-list { padding:8px; }
    .shb-item {
      display:flex; align-items:center; gap:8px; padding:8px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:8px; cursor:pointer; transition: background .15s, border-color .15s;
    }
    .shb-item:hover { background:#f9fafb; border-color:#d1d5db; }
    .shb-badge { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; flex-shrink:0; }
    .shb-badge.mold   { background:#E0F2FE; color:#0369a1; border:1px solid #bae6fd; }
    .shb-badge.cutter { background:#FEF3C7; color:#b45309; border:1px solid #fde68a; }
    .shb-main { min-width:0; flex:1; }
    .shb-code { font-weight:700; color:#0b5cab; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .shb-name { color:#111827; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .shb-empty { color:#9ca3af; font-size:12px; padding:12px; text-align:center; }
    @media (max-width: 768px) {
      .shb-panel { width: 86vw; right: 2vw; }
    }
  `);

  // ===== DOM =====
  const root = document.createElement('div');
  root.className = 'shb-wrap';
  root.innerHTML = `
    <button class="shb-btn" id="shb-toggle" title="${I18N.btnJP} / ${I18N.btnVN}">
      ${clockSVG()} <span>${I18N.btnJP} / ${I18N.btnVN}</span>
    </button>
    <div class="shb-panel" id="shb-panel">
      <div class="shb-head">
        <div>
          <div class="shb-title">${I18N.titleJP}</div>
          <div class="shb-sub">/ ${I18N.titleVN}</div>
        </div>
        <button class="shb-clear" id="shb-clear">${I18N.clearJP} / ${I18N.clearVN}</button>
      </div>
      <div class="shb-list" id="shb-list"></div>
    </div>
  `;
  document.body.appendChild(root);

  // Nếu tìm thấy container cột 2 → neo gần đó (vẫn giữ fallback fixed)
  tryAttachNearQuickResults(root);

  // ===== Behavior =====
  const $toggle = root.querySelector('#shb-toggle');
  const $panel  = root.querySelector('#shb-panel');
  const $list   = root.querySelector('#shb-list');
  const $clear  = root.querySelector('#shb-clear');

  $toggle.addEventListener('click', () => $panel.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) $panel.classList.remove('open');
  });

  $clear.addEventListener('click', () => {
    if (window.SearchHistory && typeof window.SearchHistory.clear === 'function') {
      window.SearchHistory.clear();
    } else {
      localStorage.setItem(CFG.storageKey, '[]');
    }
    render();
  });

  // Đặt lắng nghe chọn lại từ UI
  $list.addEventListener('click', (e) => {
    const item = e.target.closest('.shb-item');
    if (!item) return;
    const id   = item.getAttribute('data-id');
    const type = item.getAttribute('data-type');
    const code = item.getAttribute('data-code') || '';
    const name = item.getAttribute('data-name') || '';
    const entry = { id, type, code, name, ts: Date.now() };

    if (window.SearchHistoryBridge && typeof window.SearchHistoryBridge.select === 'function') {
      window.SearchHistoryBridge.select(entry);
    } else if (window.AppController && typeof window.AppController.selectResult === 'function') {
      window.AppController.selectResult(id, type);
    }
    // Đóng panel sau khi chọn
    $panel.classList.remove('open');
    // Cập nhật lại danh sách (di chuyển lên trên)
    addToStorage(entry);
    render();
  });

  // Đồng bộ khi có chọn mới
  document.addEventListener('app:select-result', render);
  document.addEventListener('detail:changed', render);
  document.addEventListener('search:updated', render);

  render();

  // ===== Functions =====
  function clockSVG() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="white" stroke-width="1.5" opacity=".9"></circle>
        <path d="M12 7v5l3 2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  function injectStyles(cssText) {
    const st = document.createElement('style');
    st.textContent = cssText;
    document.head.appendChild(st);
  }

  function tryAttachNearQuickResults(el) {
    for (const sel of CFG.gridSelectors) {
      const grid = document.querySelector(sel);
      if (grid) {
        // đặt relative vùng grid cha để neo tuyệt đối
        const host = grid.closest('.col-2, [data-col="2"], .quick-results-panel') || grid.parentElement;
        if (host && getComputedStyle(host).position === 'static') {
          host.style.position = 'relative';
        }
        el.style.position = 'absolute';
        el.style.right = '8px';
        el.style.bottom = '8px';
        host?.appendChild(el);
        return;
      }
    }
  }

  function getHistory() {
    if (window.SearchHistory && typeof window.SearchHistory.get === 'function') {
      try { return (window.SearchHistory.get() || []).slice(0, CFG.maxShow); } catch { /* fallthrough */ }
    }
    try {
      const arr = JSON.parse(localStorage.getItem(CFG.storageKey) || '[]');
      return (Array.isArray(arr) ? arr : []).slice(0, CFG.maxShow);
    } catch {
      return [];
    }
  }

  function addToStorage(entry) {
    const current = getHistory();
    const filtered = current.filter(x => !(String(x.id) === String(entry.id) && String(x.type) === String(entry.type)));
    filtered.unshift(entry);
    localStorage.setItem(CFG.storageKey, JSON.stringify(filtered.slice(0, MAX_ITEMS())));
  }

  function MAX_ITEMS() { return 50; }

  function render() {
    const data = getHistory();
    if (!data.length) {
      $list.innerHTML = `<div class="shb-empty">${I18N.emptyJP} / ${I18N.emptyVN}</div>`;
      return;
    }
    const rows = data.map(e => {
      const type = (String(e.type || '').toLowerCase() === 'mold') ? 'mold' : 'cutter';
      const badge = type === 'mold' ? I18N.moldJP : I18N.cutterJP;
      const code = escapeHtml(e.code || e.id || '');
      const name = escapeHtml(e.name || '');
      return `
        <div class="shb-item" data-id="${escapeHtml(e.id)}" data-type="${type}" data-code="${code}" data-name="${name}">
          <span class="shb-badge ${type}">${badge}</span>
          <div class="shb-main">
            <div class="shb-code">${code}</div>
            <div class="shb-name">${name}</div>
          </div>
        </div>
      `;
    }).join('');
    $list.innerHTML = rows;
  }

  function escapeHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
