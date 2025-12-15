/**
 * teflon-manager-r7.1.1.core.js
 * テフロン加工管理 (Core) / Quản lý mạ Teflon (Core)
 *
 * Mục tiêu core:
 * - Đầy đủ chức năng đang có: panel, filter/sort/search, modal detail, export/print/mail, badge cơ bản.
 * - Bổ sung UX mới:
 *   - Click "tên khuôn" -> mở teflon-process-manager (module cập nhật trạng thái).
 *   - Click "badge trạng thái" -> mở modal chi tiết trạng thái.
 *   - Click vùng trống của dòng -> mở modal chi tiết trạng thái (giữ hành vi cũ).
 *
 * Các file theme/badge/i18n/bootstrap có thể patch/override thêm nhưng core vẫn chạy độc lập.
 */

(function () {
  'use strict';

  // =========================
  // State
  // =========================
  let allRows = [];
  let filteredRows = [];
  let currentSort = { column: 'RequestedDate', order: 'desc' };
  let currentFilter = 'active'; // r7.1.1: pending/approved/processing
  let isRowsBuilt = false;

  // =========================
  // Status mapping (r7.1.1)
  // =========================
  const TEFLON_STATUS_KEYS = {
    pending: 'pending',       // テフロン加工承認待ち
    approved: 'approved',     // 承認済(発送待ち)
    processing: 'processing', // テフロン加工中
    completed: 'completed'    // テフロン加工済
  };

  const TEFLON_COATING_LABELS = {
    pending: 'テフロン加工承認待ち',
    approved: '承認済(発送待ち)',
    processing: 'テフロン加工中',
    completed: 'テフロン加工済'
  };

  const TEFLON_LOG_STATUS = {
    pending: 'Pending',
    approved: 'Approved',
    processing: 'Processing',
    completed: 'Completed',
    // legacy (r7.1.0)
    sent: 'Sent'
  };

  function normalizeText(v) {
    return String(v || '').trim();
  }

  function mapCoatingToStatusKey(coating) {
    const v = normalizeText(coating);
    if (!v) return '';

    // JP full labels
    if (v === TEFLON_COATING_LABELS.pending) return TEFLON_STATUS_KEYS.pending;
    if (v === TEFLON_COATING_LABELS.approved) return TEFLON_STATUS_KEYS.approved;
    if (v === TEFLON_COATING_LABELS.processing) return TEFLON_STATUS_KEYS.processing;
    if (v === TEFLON_COATING_LABELS.completed) return TEFLON_STATUS_KEYS.completed;

    // JP short variants (defensive)
    if (v === '承認待ち') return TEFLON_STATUS_KEYS.pending;
    if (v === '承認済') return TEFLON_STATUS_KEYS.approved;
    if (v === '加工中') return TEFLON_STATUS_KEYS.processing;
    if (v === '加工済') return TEFLON_STATUS_KEYS.completed;

    // EN / legacy
    const lower = v.toLowerCase();
    if (lower === 'pending') return TEFLON_STATUS_KEYS.pending;
    if (lower === 'approved') return TEFLON_STATUS_KEYS.approved;
    if (lower === 'processing') return TEFLON_STATUS_KEYS.processing;
    if (lower === 'sent') return TEFLON_STATUS_KEYS.processing; // legacy "Sent" == processing
    if (lower === 'completed' || lower === 'coated') return TEFLON_STATUS_KEYS.completed;

    return '';
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = normalizeText(logStatus).toLowerCase();
    if (!v) return '';
    if (v === 'pending') return TEFLON_STATUS_KEYS.pending;
    if (v === 'approved') return TEFLON_STATUS_KEYS.approved;
    if (v === 'processing') return TEFLON_STATUS_KEYS.processing;
    if (v === 'completed') return TEFLON_STATUS_KEYS.completed;
    if (v === 'sent') return TEFLON_STATUS_KEYS.processing; // legacy
    return '';
  }

  function getTeflonStatusKey(row) {
    // 1) Prefer TeflonStatus (JP or EN)
    let key = mapCoatingToStatusKey(row.TeflonStatus);
    if (key) return key;

    // 2) Try CoatingType (Access value list)
    key = mapCoatingToStatusKey(row.CoatingType);
    if (key) return key;

    // 3) EN log words
    key = logStatusToStatusKey(row.TeflonStatus);
    if (key) return key;

    return '';
  }

  // =========================
  // Helpers
  // =========================
  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function parseFlexibleDate(str) {
    if (!str || str === '') return null;

    // try native parse
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    // dd-MMM-yy (Access export often)
    const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const m = String(str).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = monthMap[m[2]];
      let year = parseInt(m[3], 10);
      year += (year < 50) ? 2000 : 1900;
      if (month !== undefined) return new Date(year, month, day);
    }

    // yyyy/mm/dd or yyyy-mm-dd
    const parts = String(str).split(/[\/\-]/);
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      const dd = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(mo) && !isNaN(dd)) return new Date(y, mo - 1, dd);
    }

    return null;
  }

  function formatDate(dateStr) {
    const d = parseFlexibleDate(dateStr);
    if (!d) return '-';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function attachSwipeToClose(headerEl, modalEl, hideCallback) {
    if (!headerEl || !modalEl || !('ontouchstart' in window)) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const resetDrag = () => {
      isDragging = false;
      modalEl.classList.remove('dragging');
      modalEl.style.transform = '';
      modalEl.style.opacity = '';
    };

    const onTouchStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      currentY = startY;
      isDragging = true;
      modalEl.classList.add('dragging');
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - startY;
      if (deltaY < 0) return;
      currentY = touchY;

      const translateY = Math.min(deltaY, 120);
      const opacity = 1 - Math.min(deltaY / 200, 0.5);
      modalEl.style.transform = `translateY(${translateY}px)`;
      modalEl.style.opacity = opacity;
    };

    const onTouchEnd = () => {
      if (!isDragging) return;
      const deltaY = currentY - startY;
      if (deltaY > 80) {
        resetDrag();
        if (typeof hideCallback === 'function') hideCallback();
      } else {
        resetDrag();
      }
    };

    headerEl.addEventListener('touchstart', onTouchStart, { passive: true });
    headerEl.addEventListener('touchmove', onTouchMove, { passive: true });
    headerEl.addEventListener('touchend', onTouchEnd);
    headerEl.addEventListener('touchcancel', resetDrag);
  }

  // Fixed-width email helper (JP width-aware)
  function displayWidthOf(str) {
    str = String(str || '');
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Rough range for full-width CJK (good enough for mail alignment)
      if (code >= 0x3000 && code <= 0x9FFF) w += 2;
      else w += 1;
    }
    return w;
  }
  function padRight(str, width) {
    str = String(str || '');
    const w = displayWidthOf(str);
    const pad = width - w;
    if (pad <= 0) return str;
    return str + ' '.repeat(pad);
  }
  function truncate(str, maxLen) {
    str = String(str || '');
    if (str.length <= maxLen) return str;
    return str.substring(0, Math.max(0, maxLen - 2)) + '..';
  }

  // =========================
  // Core UI styles (minimal)
  // =========================
  function injectCoreStyles() {
    if (document.getElementById('teflon-manager-core-styles')) return;

    const style = document.createElement('style');
    style.id = 'teflon-manager-core-styles';
    style.textContent = `
      .teflon-panel { position:relative; z-index:5000; background:#fff; border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,0.25); }
      .teflon-table { width:100%; border-collapse:collapse; font-size:10px; }
      .teflon-table th, .teflon-table td { border-bottom:1px solid #eee; padding:3px 4px; vertical-align:middle; }
      .teflon-table tbody tr:nth-child(odd) { background:#fafafa; }
      .teflon-table tbody tr:hover { background:#e3f2fd; }
      .status-badge { padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; white-space:nowrap; display:inline-block; user-select:none; }
      .status-default { background:#e0e0e0; color:#424242; }
      .status-pending { background:#ffe0b2; color:#e65100; }
      .status-approved { background:#e1bee7; color:#4a148c; }
      .status-processing { background:#fff9c4; color:#f57f17; }
      .status-completed { background:#c8e6c9; color:#1b5e20; }
      .tef-row-overdue-7 { background:#fff3e0 !important; }
      .tef-row-overdue-14 { background:#ffebee !important; }
      .tef-row-overdue-14 .mold-name-cell { color:#c62828 !important; font-weight:800; }
      .mold-name-cell a { color:#0056b3; text-decoration:underline; }
      .tef-btn { border-radius:10px; padding:8px 14px; border:1px solid #ccc; cursor:pointer; background:#fff; }
      .tef-btn .jp { font-weight:800; font-size:12px; line-height:1.1; }
      .tef-btn .vi { font-size:11px; opacity:0.88; line-height:1.1; margin-top:2px; }
      .tef-btn-green { background:#2e7d32; border-color:#2e7d32; color:#fff; }
      .tef-btn-blue { background:#e3f2fd; border-color:#90caf9; color:#0d47a1; }
      .tef-btn-gray { background:#f5f5f5; border-color:#ccc; color:#333; }
    `;
    document.head.appendChild(style);
  }

  // =========================
  // Process manager integration (new)
  // =========================
  function openProcessManagerByRow(row) {
    if (!row || !row.MoldID) return;

    // Option 1: direct API open(...) if exists (some builds use alias created by bootstrap)
    if (window.TeflonProcessManager && typeof window.TeflonProcessManager.open === 'function') {
      window.TeflonProcessManager.open({
        moldId: row.MoldID,
        source: 'teflon-manager',
        teflonRow: row
      });
      return;
    }

    // Option 1b (重要): fallback to openPanel(item) because teflon-process-manager exports openPanel [file:15]
    if (window.TeflonProcessManager && typeof window.TeflonProcessManager.openPanel === 'function') {
      // Need "item" (mold object) for openPanel; try to resolve from DataManager.molds first
      const dm = (window.DataManager && window.DataManager.data) ? window.DataManager.data : null;
      let item = null;

      if (dm && Array.isArray(dm.molds)) {
        item = dm.molds.find(m => String(m.MoldID).trim() === String(row.MoldID).trim()) || null;
      }

      // Fallback minimal item (still contains MoldID)
      if (!item) item = { MoldID: String(row.MoldID) };

      window.TeflonProcessManager.openPanel(item);
      return;
    }

    // Option 2: event-based integration (bootstrap listens and will retry / create alias)
    try {
      window.dispatchEvent(new CustomEvent('teflon:open-process-manager', {
        detail: { moldId: row.MoldID, teflonRow: row, source: 'teflon-manager' }
      }));
    } catch (e) {
      console.warn('[TeflonManager] teflon-process-manager not available');
    }
  }


  // =========================
  // Core object
  // =========================
  const TeflonManager = {
    version: 'r7.1.1.core',
    settings: {
      overdueDaysWarn: 7,
      overdueDaysDanger: 14,
      maxMailLines: 50
    },

    INIT: function () {
      injectCoreStyles();
      this.initNavButton();
      // best-effort badge update once
      setTimeout(() => this.updateNavBadge(), 400);
    },

    initNavButton: function () {
      const btn = document.getElementById('nav-teflon-btn');
      if (!btn) {
        console.warn('[TeflonManager] nav-teflon-btn not found');
        return;
      }
      if (btn.__tefBound) return;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPanel();
      });

      btn.__tefBound = true;
    },

    openPanel: function () {
      const existing = document.getElementById('teflon-panel');
      if (existing) existing.remove();

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[TeflonManager] upper-section not found');
        return;
      }

      const isMobile = window.innerWidth <= 767;
      if (isMobile) document.body.classList.add('modal-open');

      const html = [
        '<div id="teflon-panel" class="checkio-panel teflon-panel" style="display:block;">',
        '  <div class="tef-header" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:linear-gradient(90deg,#2e7d32 0%,#66bb6a 100%);color:#fff;">',
        '    <div class="tef-title">',
        '      <div style="font-size:15px;font-weight:800;">テフロン加工管理</div>',
        '      <div style="font-size:12px;opacity:0.88;">Quản lý mạ Teflon</div>',
        '    </div>',
        '    <button id="teflon-close-btn" title="閉じる" style="border:none;background:transparent;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;">×</button>',
        '  </div>',
        '  <div class="tef-summary" style="font-size:10px;color:#444;text-align:right;padding:4px 10px 2px;background:#ffffff;line-height:1.2;min-height:28px;">'
        + '<div class="jp">ステータス別に依頼状況を表示します。</div>'
        + '<div class="vi" style="opacity:0.85;">Hiển thị theo trạng thái xử lý.</div>'
        + '</div>',

        '  <div class="checkio-body panel-body" style="display:flex;flex-direction:column;max-height:calc(100vh - 120px);padding-bottom:70px;">',
        '    <div class="filter-row" style="padding:6px 8px;background:#f9f9f9;border-bottom:1px solid #ddd;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;">',
        '      <label style="font-weight:800;line-height:1.1;">表示 / Hiển thị:</label>',
        '      <select id="teflon-status-filter" style="padding:6px 10px;border:1px solid #ccc;border-radius:8px;font-size:12px;">',
        '        <option value="active">承認待ち・承認済・加工中</option>',
        '        <option value="pending">テフロン加工承認待ち</option>',
        '        <option value="approved">承認済(発送待ち)</option>',
        '        <option value="processing">テフロン加工中</option>',
        '        <option value="completed">テフロン加工済</option>',
        '        <option value="all">全て</option>',
        '      </select>',
        '      <input type="text" id="teflon-search-input" placeholder="金型名・コード検索 / Tìm khuôn" style="flex:1;min-width:200px;padding:6px 10px;border:1px solid #ccc;border-radius:8px;font-size:12px;">',
        '      <div class="tef-help" style="font-size:10px;color:#666;flex:1 1 260px;min-width:240px;line-height:1.15;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">',
        '        ヘッダークリックでソート / Bấm tiêu đề để sắp xếp。金型名クリックで更新 / Bấm tên khuôn để cập nhật。状態クリックで詳細 / Bấm trạng thái để xem chi tiết。',
        '      </div>',
        '    </div>',

        '    <div class="table-wrapper" style="flex:1;overflow:auto;min-height:160px;">',
        '      <table id="teflon-table" class="teflon-table">',
        '        <thead style="position:sticky;top:0;background:#0056b3;color:#fff;z-index:10;font-size:10px;">',
        '          <tr>',
        '            <th data-sort="MoldName" style="width:20%;padding:7px 6px;cursor:pointer;text-align:left;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">金型名<span class="sort-indicator"></span></th>',
        '            <th data-sort="TeflonStatusKey" style="width:12%;padding:7px 6px;cursor:pointer;text-align:center;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">状態<span class="sort-indicator"></span></th>',
        '            <th data-sort="RequestedDate" style="width:11%;padding:7px 6px;cursor:pointer;text-align:center;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">依頼日<span class="sort-indicator">▼</span></th>',
        '            <th data-sort="RequestedByName" style="width:10%;padding:7px 6px;cursor:pointer;text-align:left;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">依頼者<span class="sort-indicator"></span></th>',
        '            <th data-sort="SentDate" style="width:11%;padding:7px 6px;cursor:pointer;text-align:center;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">出荷日<span class="sort-indicator"></span></th>',
        '            <th data-sort="ReceivedDate" style="width:11%;padding:7px 6px;cursor:pointer;text-align:center;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">受入日<span class="sort-indicator"></span></th>',
        '            <th data-sort="SentByName" style="width:10%;padding:7px 6px;cursor:pointer;text-align:left;border-right:1px solid rgba(255,255,255,0.5);white-space:nowrap;">担当者<span class="sort-indicator"></span></th>',
        '            <th style="width:15%;padding:7px 6px;text-align:left;white-space:nowrap;">メモ</th>',
        '          </tr>',
        '        </thead>',
        '        <tbody id="teflon-tbody"></tbody>',
        '      </table>',
        '    </div>',
        '    <div class="tef-actions" style="position:fixed;left:0;right:0;bottom:0;z-index:6000;padding:8px 10px;border-top:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;gap:10px;background:#f5f5f5;">',
        '      <div class="tef-actions-left">',
        '        <button id="teflon-close-bottom" class="tef-btn tef-btn-gray" type="button">',
        '          <div class="jp">閉じる</div>',
        '          <div class="vi">Đóng</div>',
        '        </button>',
        '      </div>',
        '      <div class="tef-actions-right" style="display:flex;gap:10px;">',
        '        <button id="teflon-export-btn" class="tef-btn tef-btn-blue" type="button"><div class="jp">CSV出力</div><div class="vi">Xuất CSV</div></button>',
        '        <button id="teflon-print-btn" class="tef-btn tef-btn-blue" type="button"><div class="jp">印刷</div><div class="vi">In</div></button>',
        '        <button id="teflon-mail-btn" class="tef-btn tef-btn-green" type="button"><div class="jp">メール送信</div><div class="vi">Gửi email</div></button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');

      upper.insertAdjacentHTML('beforeend', html);

      const panelEl = document.getElementById('teflon-panel');
      const tbody = document.getElementById('teflon-tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#888;">データ読み込み中... / Đang tải dữ liệu...</td></tr>';
      }

      // Swipe-to-close on mobile
      const headerEl = panelEl ? panelEl.querySelector('.tef-header') : null;
      const closeBtn = document.getElementById('teflon-close-btn');
      if (headerEl && closeBtn) attachSwipeToClose(headerEl, panelEl, () => closeBtn.click());

      // Bind UI events
      const closeX = document.getElementById('teflon-close-btn');
      if (closeX) closeX.addEventListener('click', () => this.closePanel());

      const bottomCloseBtn = document.getElementById('teflon-close-bottom');
      if (bottomCloseBtn) bottomCloseBtn.addEventListener('click', () => this.closePanel());

      const statusFilterEl = document.getElementById('teflon-status-filter');
      const searchEl = document.getElementById('teflon-search-input');
      if (statusFilterEl) {
        statusFilterEl.value = currentFilter;
        statusFilterEl.addEventListener('change', (e) => {
          currentFilter = e.target.value;
          this.applyFilterAndSort();
        });
      }
      if (searchEl) {
        searchEl.addEventListener('input', () => this.applyFilterAndSort());
      }

      const exportBtn = document.getElementById('teflon-export-btn');
      if (exportBtn) exportBtn.addEventListener('click', () => this.exportCurrentToCsv());

      const printBtn = document.getElementById('teflon-print-btn');
      if (printBtn) printBtn.addEventListener('click', () => this.printCurrentView());

      const mailBtn = document.getElementById('teflon-mail-btn');
      if (mailBtn) mailBtn.addEventListener('click', () => this.mailCurrentView());

      // Sort header click
      const headers = document.querySelectorAll('#teflon-table thead th[data-sort]');
      headers.forEach((th) => {
        th.addEventListener('click', () => {
          const col = th.getAttribute('data-sort');
          if (!col) return;
          if (currentSort.column === col) currentSort.order = (currentSort.order === 'asc') ? 'desc' : 'asc';
          else { currentSort.column = col; currentSort.order = 'asc'; }
          this.applyFilterAndSort();
        });
      });

      // Table click: event delegation
      const tbodyEl = document.getElementById('teflon-tbody');
      if (tbodyEl && !tbodyEl.__tefDelegated) {
        tbodyEl.addEventListener('click', (e) => {
          const actionEl = e.target.closest('[data-action]');
          const tr = e.target.closest('tr[data-mold-id]');
          if (!tr) return;

          const moldId = tr.getAttribute('data-mold-id');
          const row = filteredRows.find(r => String(r.MoldID) === String(moldId));
          if (!row) return;

          if (actionEl) {
            const action = actionEl.getAttribute('data-action');

            // 1) open process manager
            if (action === 'open-process') {
              e.preventDefault();
              e.stopPropagation();
              openProcessManagerByRow(row);
              return;
            }

            // 2) open status detail modal
            if (action === 'open-status') {
              e.preventDefault();
              e.stopPropagation();
              this.openDetailModal(row);
              return;
            }
          }

          // Default row click: open status detail
          this.openDetailModal(row);
        });

        tbodyEl.__tefDelegated = true;
      }

      // Build and render
      setTimeout(() => {
        this.buildRows();
        this.applyFilterAndSort();
        this.updateNavBadge();
      }, 0);
    },

    closePanel: function () {
      const panel = document.getElementById('teflon-panel');
      if (panel) panel.remove();
      document.body.classList.remove('modal-open');
    },

    getEmployeeName: function (empId, employees) {
      if (!empId) return '-';
      const emp = (employees || []).find(e => String(e.EmployeeID) === String(empId));
      if (!emp) return '-';
      return emp.EmployeeNameShort || emp.EmployeeName || '-';
    },

    buildRows: function() {
      // Always rebuild (to catch CSV updates from GitHub/backend)
      // Remove cache check: if (isRowsBuilt && allRows && allRows.length > 0) return;

      const dm = window.DataManager;
      if (!dm || !dm.data) {
        console.error('[TeflonManager] DataManager not ready');
        allRows = [];
        filteredRows = [];
        isRowsBuilt = false;
        return;
      }

      const teflonlog = dm.data.teflonlog || [];
      const molds = dm.data.molds || [];
      const employees = dm.data.employees || [];

      // pick latest log per mold (by TeflonLogID desc, highest = newest)
      const moldLogMap = new Map();
      teflonlog.forEach(log => {
        const moldId = normalizeText(log.MoldID);
        if (!moldId) return;
        
        const prev = moldLogMap.get(moldId);
        if (!prev) {
          moldLogMap.set(moldId, log);
          // Debug: log selected status for MoldID 5650
          if (moldId === '5650') {
            console.log('[TeflonManager] 🔍 MoldID 5650 selected log:', {
              TeflonLogID: log.TeflonLogID,
              TeflonStatus: log.TeflonStatus,
              RequestedDate: log.RequestedDate,
              SentDate: log.SentDate,
              UpdatedDate: log.UpdatedDate
            });
          }

          return;
        }
        
        // Compare TeflonLogID (higher ID = newer log)
        const logId = parseInt(log.TeflonLogID || '0', 10);
        const prevId = parseInt(prev.TeflonLogID || '0', 10);
        
        if (logId > prevId) {
          moldLogMap.set(moldId, log);
        } else if (logId === prevId || logId === 0) {
          // Fallback to date comparison if no ID or same ID
          const logDate = parseFlexibleDate(log.UpdatedDate || log.SentDate || log.RequestedDate || log.CreatedDate);
          const prevDate = parseFlexibleDate(prev.UpdatedDate || prev.SentDate || prev.RequestedDate || prev.CreatedDate);
          if (logDate && (!prevDate || logDate > prevDate)) {
            moldLogMap.set(moldId, log);
          }
        }
      });


      const rows = [];

      // from teflonlog
      moldLogMap.forEach((log, moldId) => {
        const mold = molds.find(m => normalizeText(m.MoldID) === String(moldId));
        const moldName = mold ? (mold.MoldName || mold.MoldCode || `ID ${moldId}`) : `ID ${moldId}`;

        const statusKey = getTeflonStatusKey({
          TeflonStatus: log.TeflonStatus,
          CoatingType: log.CoatingType
        });

        rows.push({
          TeflonLogID: log.TeflonLogID || '',
          MoldID: String(moldId),
          MoldName: moldName,
          TeflonStatus: log.TeflonStatus || '',
          TeflonStatusKey: statusKey || '',
          TeflonStatusLabel: statusKeyToCoatingLabel(statusKey) || (log.TeflonStatus || ''),
          RequestedBy: log.RequestedBy || '',
          RequestedByName: this.getEmployeeName(log.RequestedBy, employees),
          RequestedDate: log.RequestedDate || '',
          SentBy: log.SentBy || '',
          SentByName: this.getEmployeeName(log.SentBy, employees),
          SentDate: log.SentDate || '',
          ReceivedDate: log.ReceivedDate || '',
          ExpectedDate: log.ExpectedDate || '',
          CoatingType: log.CoatingType || '',
          Reason: log.Reason || '',
          TeflonCost: log.TeflonCost || '',
          Quality: log.Quality || '',
          TeflonNotes: log.TeflonNotes || '',
          CreatedDate: log.CreatedDate || '',
          UpdatedBy: log.UpdatedBy || '',
          UpdatedDate: log.UpdatedDate || '',
          source: 'teflonlog'
        });
      });

      // fallback from molds (if mold indicates teflon coating but no teflonlog)
      molds.forEach((mold) => {
        const moldId = normalizeText(mold.MoldID);
        if (!moldId) return;
        if (moldLogMap.has(moldId)) return;

        const coating = mold.TeflonCoating;
        // ignore false-like
        if (!coating || coating === 'FALSE' || coating === 'false' || coating === 0 || coating === '0') return;

        const statusKey = mapCoatingToStatusKey(coating);
        if (!statusKey) return;

        const moldName = mold.MoldName || mold.MoldCode || `ID ${moldId}`;
        rows.push({
          TeflonLogID: '',
          MoldID: String(moldId),
          MoldName: moldName,
          TeflonStatus: coating,
          TeflonStatusKey: statusKey,
          TeflonStatusLabel: statusKeyToCoatingLabel(statusKey) || coating,
          RequestedBy: '',
          RequestedByName: '-',
          RequestedDate: '',
          SentBy: '',
          SentByName: '-',
          SentDate: mold.TeflonSentDate || '',
          ReceivedDate: mold.TeflonReceivedDate || '',
          ExpectedDate: '',
          CoatingType: '',
          Reason: '',
          TeflonCost: '',
          Quality: '',
          TeflonNotes: '',
          CreatedDate: '',
          UpdatedBy: '',
          UpdatedDate: '',
          source: 'molds'
        });
      });

      allRows = rows;
      isRowsBuilt = true;
    },

    applyFilterAndSort: function () {
      if (!allRows) allRows = [];
      const searchEl = document.getElementById('teflon-search-input');
      const searchVal = searchEl ? String(searchEl.value || '').toLowerCase().trim() : '';

      filteredRows = allRows.filter((row) => {
        const key = row.TeflonStatusKey || '';

        if (currentFilter && currentFilter !== 'all') {
          if (currentFilter === 'active') {
            if (![TEFLON_STATUS_KEYS.pending, TEFLON_STATUS_KEYS.approved, TEFLON_STATUS_KEYS.processing].includes(key)) return false;
          } else {
            if (key !== currentFilter) return false;
          }
        }

        if (searchVal) {
          const name = String(row.MoldName || '').toLowerCase();
          const id = String(row.MoldID || '').toLowerCase();
          if (name.indexOf(searchVal) === -1 && id.indexOf(searchVal) === -1) return false;
        }

        return true;
      });

      const col = currentSort.column;
      const order = currentSort.order;

      filteredRows.sort((a, b) => {
        let A = a[col];
        let B = b[col];

        if (String(col).toLowerCase().indexOf('date') !== -1) {
          const dA = parseFlexibleDate(A);
          const dB = parseFlexibleDate(B);
          const tA = dA ? dA.getTime() : 0;
          const tB = dB ? dB.getTime() : 0;
          return (order === 'asc') ? (tA - tB) : (tB - tA);
        }

        A = String(A || '').toLowerCase();
        B = String(B || '').toLowerCase();
        if (A < B) return (order === 'asc') ? -1 : 1;
        if (A > B) return (order === 'asc') ? 1 : -1;
        return 0;
      });

      this.renderTable();
      this.updateSortIndicators();
    },

    getShortStatusLabel: function (statusKey) {
      // JP short labels (i18n.js can override)
      if (statusKey === TEFLON_STATUS_KEYS.pending) return '承認待ち';
      if (statusKey === TEFLON_STATUS_KEYS.approved) return '承認済';
      if (statusKey === TEFLON_STATUS_KEYS.processing) return '加工中';
      if (statusKey === TEFLON_STATUS_KEYS.completed) return '加工済';
      return statusKey || '-';
    },

    getLongStatusLabelJPVI: function (statusKey) {
      // simple fallback (i18n.js can override)
      if (statusKey === TEFLON_STATUS_KEYS.pending) return 'テフロン加工承認待ち<br><span style="font-size:11px;opacity:0.85;">Yêu cầu mạ (chờ phê duyệt)</span>';
      if (statusKey === TEFLON_STATUS_KEYS.approved) return '承認済(発送待ち)<br><span style="font-size:11px;opacity:0.85;">Đã duyệt (chờ gửi đi mạ)</span>';
      if (statusKey === TEFLON_STATUS_KEYS.processing) return 'テフロン加工中<br><span style="font-size:11px;opacity:0.85;">Đang mạ</span>';
      if (statusKey === TEFLON_STATUS_KEYS.completed) return 'テフロン加工済<br><span style="font-size:11px;opacity:0.85;">Đã mạ xong</span>';
      return '-';
    },

    renderTable: function () {
      const tbody = document.getElementById('teflon-tbody');
      if (!tbody) return;

      if (!filteredRows || filteredRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#888;">データなし / Không có dữ liệu</td></tr>';
        return;
      }

      const now = new Date();
      const warnDays = this.settings.overdueDaysWarn;
      const dangerDays = this.settings.overdueDaysDanger;

      let html = '';

      filteredRows.forEach((row) => {
        const moldName = row.MoldName || '-';
        const statusKey = row.TeflonStatusKey || '';
        const statusShort = this.getShortStatusLabel(statusKey);

        const reqDateStr = formatDate(row.RequestedDate);
        const reqBy = row.RequestedByName || '-';
        const sentDateStr = formatDate(row.SentDate);
        const recvDateStr = formatDate(row.ReceivedDate);
        const sentBy = row.SentByName || '-';
        const notes = row.TeflonNotes || '-';

        let statusClass = 'status-default';
        if (statusKey === TEFLON_STATUS_KEYS.pending) statusClass = 'status-pending';
        else if (statusKey === TEFLON_STATUS_KEYS.approved) statusClass = 'status-approved';
        else if (statusKey === TEFLON_STATUS_KEYS.processing) statusClass = 'status-processing';
        else if (statusKey === TEFLON_STATUS_KEYS.completed) statusClass = 'status-completed';

        // overdue highlight only for pending/approved? (mainly pending approval)
        let rowExtraClass = '';
        const reqDateObj = parseFlexibleDate(row.RequestedDate);
        if (reqDateObj && statusKey === TEFLON_STATUS_KEYS.pending) {
          const diffDays = Math.floor((now.getTime() - reqDateObj.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= dangerDays) rowExtraClass = ' tef-row-overdue-14';
          else if (diffDays >= warnDays) rowExtraClass = ' tef-row-overdue-7';
        }

        html += `
          <tr data-mold-id="${escapeHtml(row.MoldID)}" class="${rowExtraClass.trim()}" style="cursor:pointer;border-bottom:1px solid #eee;">
            <td class="mold-name-cell" style="padding:3px 4px;min-width:120px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <a href="javascript:void(0)" data-action="open-process" title="更新 / Cập nhật">${escapeHtml(moldName)}</a>
            </td>
            <td style="padding:3px 4px;text-align:center;">
              <span class="status-badge ${statusClass}" data-action="open-status" title="詳細 / Chi tiết">${escapeHtml(statusShort)}</span>
            </td>
            <td style="padding:3px 4px;text-align:center;">${escapeHtml(reqDateStr)}</td>
            <td style="padding:3px 4px;">${escapeHtml(reqBy)}</td>
            <td style="padding:3px 4px;text-align:center;">${escapeHtml(sentDateStr)}</td>
            <td style="padding:3px 4px;text-align:center;">${escapeHtml(recvDateStr)}</td>
            <td style="padding:3px 4px;">${escapeHtml(sentBy)}</td>
            <td style="padding:3px 4px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(notes)}</td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    },

    updateSortIndicators: function () {
      const headers = document.querySelectorAll('#teflon-table thead th[data-sort]');
      headers.forEach((th) => {
        const col = th.getAttribute('data-sort');
        const indicator = th.querySelector('.sort-indicator');
        if (!indicator) return;

        if (col === currentSort.column) {
          indicator.textContent = (currentSort.order === 'asc') ? '▲' : '▼';
        } else {
          indicator.textContent = '';
        }
      });
    },

    openDetailModal: function (row) {
      const existing = document.getElementById('teflon-detail-modal');
      if (existing) existing.remove();

      const isMobile = window.innerWidth <= 767;

      const statusKey = row.TeflonStatusKey || '';
      const statusHtml = this.getLongStatusLabelJPVI(statusKey);

      function detailRow(label, valueHtml) {
        return `
          <tr style="border-bottom:1px solid #eee;">
            <th style="padding:6px 6px;text-align:left;background:#f5f5f5;width:40%;font-size:11px;">${escapeHtml(label)}</th>
            <td style="padding:6px 6px;font-size:12px;">${valueHtml}</td>
          </tr>
        `;
      }

      const html = [
        '<div id="teflon-detail-modal" class="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:12000;display:flex;align-items:center;justify-content:center;">',
        '  <div class="modal-content" style="background:#fff;width:90%;max-width:720px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-height:90vh;display:flex;flex-direction:column;">',
        '    <div class="modal-header" style="padding:8px 12px;background:#2e7d32;color:#fff;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">',
        '      <div style="display:flex;flex-direction:column;">',
        '        <div style="margin:0;font-size:15px;font-weight:800;line-height:1.1;">テフロン加工詳細</div>',
        '        <div style="margin:0;font-size:12px;opacity:0.9;line-height:1.1;">Chi tiết mạ Teflon</div>',
        '      </div>',
        '      <button class="modal-close-x" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>',
        '    </div>',
        '    <div class="modal-body" style="padding:12px 16px;overflow-y:auto;flex:1;">',
        '      <table style="width:100%;border-collapse:collapse;font-size:12px;">',
        detailRow('金型 / Khuôn', escapeHtml(row.MoldName || '-')),
        detailRow('状態 / Trạng thái', `<strong>${statusHtml}</strong>`),
        detailRow('依頼日 / Ngày yêu cầu', escapeHtml(formatDate(row.RequestedDate))),
        detailRow('依頼者 / Người yêu cầu', escapeHtml(row.RequestedByName || '-')),
        detailRow('出荷日 / Ngày gửi', escapeHtml(formatDate(row.SentDate))),
        detailRow('受入日 / Ngày nhận', escapeHtml(formatDate(row.ReceivedDate))),
        detailRow('担当者 / Người phụ trách', escapeHtml(row.SentByName || '-')),
        detailRow('予定日 / Ngày dự kiến', escapeHtml(formatDate(row.ExpectedDate))),
        detailRow('メモ / Ghi chú', escapeHtml(row.TeflonNotes || '-')),
        detailRow('ソース / Nguồn', escapeHtml(row.source === 'teflonlog' ? 'teflonlog.csv' : 'molds.csv')),
        '      </table>',
        '    </div>',
        '    <div class="modal-footer" style="padding:10px 12px;border-top:1px solid #ddd;display:flex;justify-content:space-between;gap:10px;align-items:center;">',
        '      <button class="modal-update-btn tef-btn tef-btn-blue" type="button" style="min-width:170px;">',
        '        <div class="jp">状態更新</div>',
        '        <div class="vi">Cập nhật trạng thái</div>',
        '      </button>',
        '      <button class="modal-close-btn tef-btn tef-btn-green" type="button" style="min-width:120px;">',
        '        <div class="jp">閉じる</div>',
        '        <div class="vi">Đóng</div>',
        '      </button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');

      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('teflon-detail-modal');
      const modalContent = overlay ? overlay.querySelector('.modal-content') : null;
      const modalHeader = overlay ? overlay.querySelector('.modal-header') : null;

      const closeModal = () => {
        if (overlay) overlay.remove();
      };

      const closeX = overlay ? overlay.querySelector('.modal-close-x') : null;
      if (closeX) closeX.addEventListener('click', closeModal);

      const closeBtn = overlay ? overlay.querySelector('.modal-close-btn') : null;
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      const updateBtn = overlay ? overlay.querySelector('.modal-update-btn') : null;
      if (updateBtn) {
        updateBtn.addEventListener('click', () => {
          closeModal();
          openProcessManagerByRow(row);
        });
      }

      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModal();
        });
      }

      if (isMobile && modalHeader && modalContent) {
        attachSwipeToClose(modalHeader, modalContent, closeModal);
      }
    },

    // =========================
    // Export / Print / Mail
    // =========================
    exportCurrentToCsv: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('エクスポートするデータがありません。 / Không có dữ liệu để xuất.');
        return;
      }

      const headers = ['No', '金型名', '状態', '依頼日', '依頼者', '出荷日', '受入日', '担当者', 'メモ'];
      const lines = [];
      lines.push(headers.join(','));

      filteredRows.forEach((r, idx) => {
        const row = [
          idx + 1,
          r.MoldName || '',
          r.TeflonStatusLabel || '',
          formatDate(r.RequestedDate),
          r.RequestedByName || '',
          formatDate(r.SentDate),
          formatDate(r.ReceivedDate),
          r.SentByName || '',
          String(r.TeflonNotes || '').replace(/\r?\n/g, ' ')
        ];

        const csvRow = row.map((v) => {
          const s = (v == null) ? '' : String(v);
          // Quote and escape
          return `"${s.replace(/"/g, '""')}"`;
        }).join(',');

        lines.push(csvRow);
      });

      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const nowKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `teflon-list-${nowKey}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    printCurrentView: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('印刷するデータがありません。 / Không có dữ liệu để in.');
        return;
      }

      const win = window.open('', '_blank');
      if (!win) return;

      let rowsHtml = '';
      filteredRows.forEach((r, idx) => {
        rowsHtml += `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td>${escapeHtml(r.MoldName || '')}</td>
            <td style="text-align:center;">${escapeHtml(this.getShortStatusLabel(r.TeflonStatusKey))}</td>
            <td style="text-align:center;">${escapeHtml(formatDate(r.RequestedDate))}</td>
            <td>${escapeHtml(r.RequestedByName || '')}</td>
            <td style="text-align:center;">${escapeHtml(formatDate(r.SentDate))}</td>
            <td style="text-align:center;">${escapeHtml(formatDate(r.ReceivedDate))}</td>
            <td>${escapeHtml(r.SentByName || '')}</td>
            <td>${escapeHtml(r.TeflonNotes || '')}</td>
          </tr>
        `;
      });

      win.document.write(`
        <html>
          <head>
            <meta charset="utf-8">
            <title>テフロン加工管理 / Quản lý mạ Teflon</title>
            <style>
              body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif; font-size: 10px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ccc; padding: 3px 5px; }
              th { background: #eeeeee; font-size: 10px; }
              h3 { margin: 0 0 8px 0; }
            </style>
          </head>
          <body>
            <h3>テフロン加工管理 / Quản lý mạ Teflon</h3>
            <table>
              <thead>
                <tr>
                  <th>No</th><th>金型名</th><th>状態</th><th>依頼日</th><th>依頼者</th><th>出荷日</th><th>受入日</th><th>担当者</th><th>メモ</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <script>window.print();</script>
          </body>
        </html>
      `);

      win.document.close();
    },

    mailCurrentView: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('メール送信するデータがありません。 / Không có dữ liệu để gửi mail.');
        return;
      }

      const maxLines = this.settings.maxMailLines;
      const lines = [];

      lines.push('テフロン加工管理 / Quản lý mạ Teflon');
      lines.push('Font: Courier / Consolas / MS Gothic 推奨');
      lines.push('');

      const separator = '-'.repeat(95);
      lines.push(separator);

      // Header aligned
      const headerLine =
        padRight('No', 4) +
        padRight('金型名', 20) +
        padRight('状態', 14) +
        padRight('依頼日', 13) +
        padRight('出荷日', 13) +
        padRight('受入日', 13) +
        padRight('メモ', 18);

      lines.push(headerLine);
      lines.push(separator);

      filteredRows.slice(0, maxLines).forEach((r, idx) => {
        const no = padRight(String(idx + 1), 4);
        const moldName = padRight(truncate(r.MoldName || '-', 18), 20);
        const status = padRight(truncate(r.TeflonStatusLabel || '-', 12), 14);
        const reqDate = padRight(formatDate(r.RequestedDate), 13);
        const sentDate = padRight(formatDate(r.SentDate), 13);
        const recvDate = padRight(formatDate(r.ReceivedDate), 13);
        const notes = truncate(String(r.TeflonNotes || '-').replace(/\r?\n/g, ' '), 16);

        lines.push(no + moldName + status + reqDate + sentDate + recvDate + notes);
      });

      lines.push(separator);

      if (filteredRows.length > maxLines) {
        lines.push('');
        lines.push(`... ${filteredRows.length - maxLines} more lines ...`);
      }

      lines.push('');
      lines.push('---');
      lines.push('MoldCutterSearch');

      const subject = encodeURIComponent(`Teflon status ${new Date().toISOString().slice(0, 10)}`);
      const body = encodeURIComponent(lines.join('\n'));
      window.location.href = `mailto:teflon@ysd.local?subject=${subject}&body=${body}`;
    },

    // =========================
    // Nav badge (core basic)
    // =========================
    updateNavBadge: function () {
      // If badge.js exists, it can override/replace this.
      const btn = document.getElementById('nav-teflon-btn');
      if (!btn) return;

      // ensure data built
      if (!isRowsBuilt) this.buildRows();
      if (!allRows || allRows.length === 0) return;

      const hasPending = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending);
      const hasApproved = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved);
      const hasProcessing = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing);

      // create a single dot by default (priority approved > pending > processing)
      let dot = btn.querySelector('.tef-nav-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'tef-nav-dot';
        dot.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;margin-left:6px;vertical-align:middle;';
        btn.appendChild(dot);
      }

      if (hasApproved) dot.style.background = '#d32f2f';
      else if (hasPending) dot.style.background = '#f57c00';
      else if (hasProcessing) dot.style.background = '#1976d2';
      else dot.style.background = 'transparent';
    },

      // API: Get processed rows (for theme/badge)
    getProcessedRows: function() {
      if (!isRowsBuilt || !allRows) {
        this.buildRows();
      }
      return allRows || [];
    },
    
  };
  
  // Export
  window.TeflonManager = TeflonManager;

  // Auto init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      TeflonManager.INIT();
    });
  } else {
    TeflonManager.INIT();
  }

})();
