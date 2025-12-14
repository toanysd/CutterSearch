/**
 * history-view-r7.1.1.js
 * ===========================================================
 * Unified History View (履歴ビュー) for Mold/Cutter
 *
 * Goals (r7.1.1):
 * - Replace audit-history-viewer by expanding HistoryView
 * - Detailed action filter (棚卸/入庫/出庫/位置変更/出荷/会社間移動/ステータス)
 * - Employee filter (担当者)
 * - Rack/Layer text filter (棚段)
 * - Statistics cards + Pagination
 * - UI style aligned with recent modules (modal gradient, typography, buttons)
 * - Keep strong features from r7.1.0: UTF-8 BOM CSV export, Print, Mail fixed-width, swipe-to-close
 *
 * Open triggers:
 * - bottom nav: .bottom-nav-item[data-tab="history"]
 * - programmatic: window.HistoryView.open({ preset: { action: 'AUDIT', ... } })
 *
 * Data sources:
 * - GitHub raw CSV (default) or DataManager (fallback)
 *   locationlog.csv, shiplog.csv, statuslogs.csv
 *   molds.csv, cutters.csv, companies.csv, employees.csv
 *
 * Updated: 2025-12-14 (r7.1.1)
 */

(function () {
  'use strict';

  // ===========================================================
  // CONFIG
  // ===========================================================
  const GITHUB_DATA_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  const USE_GITHUB_SOURCE_FOR_HISTORY = true;
  const ITEMS_PER_PAGE_DEFAULT = 50;
  const MAX_PRINT_ROWS = 500; // avoid extremely large print windows
  const MAX_MAIL_LINES = 50;

  // ===========================================================
  // UTILITIES
  // ===========================================================
  function toLower(str) {
    return String(str || '').toLowerCase();
  }

  function safeStr(v) {
    return String(v == null ? '' : v);
  }

  function normalizeSpaces(s) {
    return safeStr(s).replace(/\s+/g, ' ').trim();
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    try {
      // ja-JP friendly format
      return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return d.toISOString();
    }
  }

  function getDateKey(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function debounce(fn, wait = 200) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Robust CSV parsing (handles quotes and commas inside quotes)
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // double quote escape
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result.map(v => safeStr(v).trim());
  }

  function parseCsv(text) {
    if (!text) return [];
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleaned.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
    return rows;
  }

  function fetchText(url) {
    return fetch(url).then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.text();
    });
  }

  // ========= String padding helper for fixed-width email ==========
  function padRight(str, width) {
    str = String(str || '');
    let displayWidth = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // rough: CJK wide chars
      if (code > 0x3000 && code < 0x9FFF) displayWidth += 2;
      else displayWidth += 1;
    }
    const padding = width - displayWidth;
    if (padding > 0) return str + ' '.repeat(padding);
    return str;
  }

  function truncate(str, maxLen) {
    str = String(str || '');
    if (str.length <= maxLen) return str;
    return str.substring(0, Math.max(0, maxLen - 2)) + '..';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  // ===========================================================
  // ACTION DEFINITIONS
  // ===========================================================
  const ACTION = {
    ALL: 'ALL',
    AUDIT: 'AUDIT',
    CHECKIN: 'CHECKIN',
    CHECKOUT: 'CHECKOUT',
    LOCATION_CHANGE: 'LOCATION_CHANGE',
    SHIP_OUT: 'SHIP_OUT',
    SHIP_IN: 'SHIP_IN',
    SHIP_MOVE: 'SHIP_MOVE',
    STATUS_OTHER: 'STATUS_OTHER'
  };

  function actionMeta(actionKey) {
    switch (actionKey) {
      case ACTION.AUDIT:
        return { ja: '棚卸', vi: 'Kiểm kê', badgeClass: 'hist-badge-audit' };
      case ACTION.CHECKIN:
        return { ja: '入庫', vi: 'Check-in', badgeClass: 'hist-badge-checkin' };
      case ACTION.CHECKOUT:
        return { ja: '出庫', vi: 'Check-out', badgeClass: 'hist-badge-checkout' };
      case ACTION.LOCATION_CHANGE:
        return { ja: '位置変更', vi: 'Đổi vị trí', badgeClass: 'hist-badge-location' };
      case ACTION.SHIP_OUT:
        return { ja: '出荷', vi: 'Xuất kho', badgeClass: 'hist-badge-shipout' };
      case ACTION.SHIP_IN:
        return { ja: '返却入庫', vi: 'Trả về', badgeClass: 'hist-badge-shipin' };
      case ACTION.SHIP_MOVE:
        return { ja: '会社間移動', vi: 'Chuyển công ty', badgeClass: 'hist-badge-shipmove' };
      case ACTION.STATUS_OTHER:
      default:
        return { ja: 'ステータス', vi: 'Trạng thái', badgeClass: 'hist-badge-status' };
    }
  }

  function toActionKeyFromShip(row) {
    const fromId = safeStr(row.FromCompanyID).trim();
    const toId = safeStr(row.ToCompanyID).trim();
    if (fromId && !toId) return ACTION.SHIP_OUT;
    if (!fromId && toId) return ACTION.SHIP_IN;
    return ACTION.SHIP_MOVE;
  }

  function toActionKeyFromStatus(row) {
    const statusRaw = safeStr(row.Status).toUpperCase().trim();
    const auditTypeRaw = safeStr(row.AuditType).toUpperCase().trim();
    const notesRaw = safeStr(row.Notes);

    const hasAuditKeyword = notesRaw.indexOf('棚卸') !== -1 || notesRaw.toLowerCase().includes('audit');
    const statusHasAudit = statusRaw.includes('AUDIT') || auditTypeRaw.includes('AUDIT');

    if (statusRaw === 'CHECK_IN' || statusRaw === 'CHECKIN') {
      if (statusHasAudit || hasAuditKeyword) return ACTION.AUDIT;
      return ACTION.CHECKIN;
    }

    if (statusRaw === 'CHECK_OUT' || statusRaw === 'CHECKOUT') {
      return ACTION.CHECKOUT;
    }

    // Some legacy rows may store AUDIT in Status directly
    if (statusHasAudit || hasAuditKeyword) return ACTION.AUDIT;

    return ACTION.STATUS_OTHER;
  }

  function isInOut(actionKey) {
    return (
      actionKey === ACTION.CHECKIN ||
      actionKey === ACTION.CHECKOUT ||
      actionKey === ACTION.SHIP_IN ||
      actionKey === ACTION.SHIP_OUT
    );
  }

  function isMove(actionKey) {
    return actionKey === ACTION.LOCATION_CHANGE || actionKey === ACTION.SHIP_MOVE;
  }

  // ===========================================================
  // HISTORY VIEW MODULE
  // ===========================================================
  const HistoryView = {
    state: {
      initialized: false,
      loading: false,

      // master caches for fallback open detail
      master: {
        moldsById: new Map(),
        cuttersById: new Map()
      },

      allEvents: [],
      filteredEvents: [],

      sortKey: 'date',
      sortDir: 'desc',

      itemsPerPage: ITEMS_PER_PAGE_DEFAULT,
      currentPage: 1,
      totalPages: 1,

      // current filter state (DOM-driven)
      filters: {
        dateFrom: '',
        dateTo: '',
        action: ACTION.ALL,
        employee: 'all',
        rack: '',
        company: '',
        keyword: ''
      },

      // optional preset for open()
      lastPreset: null
    },

    els: {
      root: null,
      backdrop: null,
      dialog: null,

      header: null,
      closeBtn: null,

      // info blocks
      summaryEl: null,
      statsWrap: null,
      statTotal: null,
      statAudit: null,
      statMove: null,
      statInOut: null,

      // filters
      filtersWrap: null,
      dateFrom: null,
      dateTo: null,
      actionSelect: null,
      employeeSelect: null,
      rackInput: null,
      companyInput: null,
      keywordInput: null,
      mailToInput: null,

      applyBtn: null,
      clearBtn: null,
      refreshBtn: null,

      // table
      tableHead: null,
      tableBody: null,

      // pagination
      pagination: null,

      // footer actions
      cancelBtn: null,
      exportBtn: null,
      printBtn: null,
      mailBtn: null
    },

    // -----------------------------------------------------------
    // INIT / UI BUILD
    // -----------------------------------------------------------
    init() {
      if (this.state.initialized) return;

      this.injectStyles();
      this.createModal();
      this.loadMailRecipients();
      this.ensureHistoryEventsBuilt();

      this.bindTriggers();
      this.bindInsideEvents();

      this.applyDefaultDateRange();

      // initial apply (may show empty until loaded)
      this.applyFiltersAndRender(true);

      this.state.initialized = true;
      console.log('[HistoryView r7.1.1] Initialized');
    },

    injectStyles() {
      if (document.getElementById('history-view-styles')) return;

      const style = document.createElement('style');
      style.id = 'history-view-styles';
      style.textContent = `
/* ===========================================================
   HISTORY VIEW (r7.1.1) - unified style
   =========================================================== */
.hist-root {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: none;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, "Helvetica Neue", Arial,
    "Hiragino Sans", "Hiragino Kaku Gothic ProN",
    "Yu Gothic", Meiryo, sans-serif;
}
.hist-root.hist-open { display: flex; }

.hist-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.60);
  backdrop-filter: blur(4px);
}

.hist-dialog {
  position: relative;
  z-index: 1;
  width: 92%;
  max-width: 1180px;
  height: 92vh;
  max-height: 92vh;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
}

.hist-header {
  flex-shrink: 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid rgba(255,255,255,0.10);
  box-shadow: 0 2px 8px rgba(13, 71, 161, 0.15);
}
.hist-title { display: flex; flex-direction: column; line-height: 1.25; }
.hist-title .ja { font-size: 16px; font-weight: 800; letter-spacing: -0.2px; }
.hist-title .vi { font-size: 12px; color: rgba(227, 242, 253, 0.95); font-weight: 500; }

.hist-close {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
}

.hist-topinfo {
  flex-shrink: 0;
  padding: 10px 16px 6px;
  background: #FAFAFA;
  border-bottom: 1px solid #EEE;
}
.hist-summary {
  font-size: 12px;
  color: #555;
  text-align: right;
  margin-bottom: 8px;
}

.hist-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 10px;
}
.hist-stat-card {
  background: #fff;
  border: 1px solid #E0E0E0;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
}
.hist-stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  color: #fff;
  font-size: 14px;
  user-select: none;
}
.hist-stat-icon.total { background: linear-gradient(135deg, #1565C0, #0D47A1); }
.hist-stat-icon.audit { background: linear-gradient(135deg, #34C759, #28A745); }
.hist-stat-icon.move { background: linear-gradient(135deg, #7B1FA2, #512DA8); }
.hist-stat-icon.io { background: linear-gradient(135deg, #FB8C00, #F57C00); }

.hist-stat-label { font-size: 11px; color: #777; font-weight: 700; line-height: 1.2; }
.hist-stat-value { font-size: 18px; color: #222; font-weight: 900; line-height: 1.1; }

.hist-body {
  flex: 1 1 auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 16px;
  padding-bottom: 76px; /* footer space */
  background: #fff;
}

.hist-filters {
  flex-shrink: 0;
  border: 2px solid #BBDEFB;
  border-radius: 14px;
  background: linear-gradient(180deg, #E3F2FD 0%, #FFFFFF 60%);
  padding: 10px 10px;
  box-shadow: 0 3px 10px rgba(33,150,243,0.12);
}

.hist-filter-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 8px 10px;
  align-items: end;
}

.hist-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hist-field label {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  font-weight: 800;
  color: #0D47A1;
  font-size: 11px;
}
.hist-field label .vi { font-weight: 500; color: #1565C0; font-size: 10px; }
.hist-input, .hist-select {
  width: 100%;
  border: 2px solid #E0E0E0;
  background: #FAFAFA;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  transition: all 0.2s ease;
  outline: none;
}
.hist-input:focus, .hist-select:focus {
  border-color: #0D47A1;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(13, 71, 161, 0.10);
}

.hist-filter-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.hist-btn {
  font-size: 12px;
  font-weight: 800;
  border-radius: 10px;
  padding: 8px 12px;
  border: 2px solid #E0E0E0;
  background: #F5F5F5;
  color: #333;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}
.hist-btn:hover { transform: translateY(-1px); }
.hist-btn:active { transform: translateY(0px); }

.hist-btn-primary {
  background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%);
  border-color: #0D47A1;
  color: #fff;
}
.hist-btn-secondary {
  background: #fff;
  border-color: #E0E0E0;
  color: #555;
}
.hist-btn-success {
  background: linear-gradient(135deg, #34C759 0%, #28A745 100%);
  border-color: #28A745;
  color: #fff;
}

.hist-table-wrap {
  flex: 1 1 auto;
  overflow: auto;
  border: 1px solid #E0E0E0;
  border-radius: 12px;
  background: #fff;
}

.hist-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.hist-table th, .hist-table td {
  border-bottom: 1px solid #EEE;
  padding: 10px 10px;
  vertical-align: top;
}
.hist-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #E3F2FD;
  color: #0D47A1;
  font-weight: 900;
  font-size: 12px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.05);
}
.hist-table th.sortable { cursor: pointer; }
.hist-table th.sortable:hover { background: #BBDEFB; }
.hist-table th.sort-asc::after { content: " ▲"; font-size: 10px; }
.hist-table th.sort-desc::after { content: " ▼"; font-size: 10px; }

.hist-table tbody tr:nth-child(odd) { background: #FAFAFA; }
.hist-table tbody tr:hover { background: #E3F2FD; }

.hist-item-link {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  text-align: left;
}
.hist-item-code {
  font-weight: 900;
  color: #1565C0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.hist-item-name {
  font-size: 11px;
  color: #555;
  margin-top: 2px;
}
.hist-item-meta {
  font-size: 10px;
  color: #777;
  margin-top: 2px;
}

.hist-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 10px;
  font-weight: 900;
  font-size: 11px;
  white-space: nowrap;
  border: 1px solid rgba(0,0,0,0.05);
}
.hist-badge .vi { font-weight: 700; opacity: 0.9; font-size: 10px; }
.hist-badge-audit { background: #E8F5E9; color: #2E7D32; }
.hist-badge-checkin { background: #E1F5FE; color: #0277BD; }
.hist-badge-checkout { background: #FCE4EC; color: #C2185B; }
.hist-badge-location { background: #F3E5F5; color: #6A1B9A; }
.hist-badge-shipout { background: #FFF3E0; color: #EF6C00; }
.hist-badge-shipin { background: #E0F2F1; color: #00695C; }
.hist-badge-shipmove { background: #FFF9C4; color: #F57F17; }
.hist-badge-status { background: #EEEEEE; color: #555; }

.hist-fromto {
  font-size: 11px;
  color: #444;
  line-height: 1.35;
}
.hist-fromto .label {
  font-weight: 900;
  color: #777;
  margin-right: 6px;
}
.hist-rack-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 900;
  color: #555;
}

.hist-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 6px 4px 0;
}
.hist-pagination-inner {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}
.hist-page-btn {
  padding: 8px 12px;
  border-radius: 10px;
  border: 2px solid #E0E0E0;
  background: #fff;
  color: #555;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.2s ease;
}
.hist-page-btn:hover { border-color: #1565C0; color: #1565C0; }
.hist-page-btn.active {
  background: linear-gradient(135deg, #1565C0, #0D47A1);
  color: #fff;
  border-color: transparent;
}
.hist-page-ellipsis {
  color: #999;
  font-weight: 900;
  padding: 0 4px;
}

.hist-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  background: #F5F5F5;
  border-top: 1px solid #DDD;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.hist-footer-left, .hist-footer-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 980px) {
  .hist-stats { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
}

@media (max-width: 767px) {
  .hist-root { align-items: flex-start; justify-content: center; }
  .hist-dialog {
    width: 100%;
    max-width: 100%;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    margin-top: env(safe-area-inset-top, 8px);
  }
  .hist-header { padding: 12px 14px; }
  .hist-topinfo { padding: 10px 14px 8px; }
  .hist-body { padding: 10px 14px; padding-bottom: 86px; }
  .hist-stats { grid-template-columns: 1fr 1fr; }
}

@media print {
  .hist-backdrop, .hist-footer, .hist-filters, .hist-pagination { display: none !important; }
  .hist-dialog { width: 100% !important; height: auto !important; max-height: none !important; border-radius: 0 !important; box-shadow: none !important; }
  .hist-table-wrap { border: none !important; }
  .hist-table th { position: static !important; }
}
      `.trim();

      document.head.appendChild(style);
    },

    createModal() {
      if (this.els.root) return;

      const root = document.createElement('div');
      root.className = 'hist-root';
      root.id = 'history-modal-root';

      root.innerHTML = `
<div class="hist-backdrop"></div>
<div class="hist-dialog" role="dialog" aria-modal="true" aria-label="History">
  <div class="hist-header">
    <div class="hist-title">
      <span class="ja">履歴</span>
      <span class="vi">Lịch sử (棚卸・入出庫・位置・出荷)</span>
    </div>
    <button type="button" class="hist-close" aria-label="Close">&times;</button>
  </div>

  <div class="hist-topinfo">
    <div id="history-summary" class="hist-summary">
      表示 0 / 全0 件（期間: -） / Đang hiển thị 0 / tổng 0
    </div>

    <div class="hist-stats" id="history-stats">
      <div class="hist-stat-card">
        <div class="hist-stat-icon total">Σ</div>
        <div>
          <div class="hist-stat-label">総 / Tổng</div>
          <div class="hist-stat-value" id="hist-stat-total">0</div>
        </div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-icon audit">✓</div>
        <div>
          <div class="hist-stat-label">棚卸 / Kiểm kê</div>
          <div class="hist-stat-value" id="hist-stat-audit">0</div>
        </div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-icon move">↔</div>
        <div>
          <div class="hist-stat-label">移動 / Di chuyển</div>
          <div class="hist-stat-value" id="hist-stat-move">0</div>
        </div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-icon io">⇅</div>
        <div>
          <div class="hist-stat-label">入出庫 / In-Out</div>
          <div class="hist-stat-value" id="hist-stat-io">0</div>
        </div>
      </div>
    </div>
  </div>

  <div class="hist-body">
    <div class="hist-filters">
      <div class="hist-filter-grid">
        <div class="hist-field" style="grid-column: span 3;">
          <label><span class="ja">期間（自）</span><span class="vi">Từ ngày</span></label>
          <input type="date" id="history-date-from" class="hist-input">
        </div>
        <div class="hist-field" style="grid-column: span 3;">
          <label><span class="ja">期間（至）</span><span class="vi">Đến ngày</span></label>
          <input type="date" id="history-date-to" class="hist-input">
        </div>

        <div class="hist-field" style="grid-column: span 3;">
          <label><span class="ja">種類（詳細）</span><span class="vi">Loại (chi tiết)</span></label>
          <select id="history-action-select" class="hist-select">
            <option value="ALL">すべて / Tất cả</option>
            <option value="AUDIT">棚卸 / Kiểm kê</option>
            <option value="CHECKIN">入庫 / Check-in</option>
            <option value="CHECKOUT">出庫 / Check-out</option>
            <option value="LOCATION_CHANGE">位置変更 / Đổi vị trí</option>
            <option value="SHIP_OUT">出荷 / Xuất kho</option>
            <option value="SHIP_IN">返却入庫 / Trả về</option>
            <option value="SHIP_MOVE">会社間移動 / Chuyển công ty</option>
            <option value="STATUS_OTHER">ステータス / Trạng thái</option>
          </select>
        </div>

        <div class="hist-field" style="grid-column: span 3;">
          <label><span class="ja">担当者</span><span class="vi">Nhân viên</span></label>
          <select id="history-employee-select" class="hist-select">
            <option value="all">すべて / Tất cả</option>
          </select>
        </div>

        <div class="hist-field" style="grid-column: span 3;">
          <label><span class="ja">棚段</span><span class="vi">Giá-Tầng</span></label>
          <input type="text" id="history-rack-input" class="hist-input" placeholder="例: 112, 3-2, Rack 112 / vd: 112">
        </div>

        <div class="hist-field" style="grid-column: span 3;">
          <label><span class="ja">会社</span><span class="vi">Công ty</span></label>
          <input type="text" id="history-company-input" class="hist-input" placeholder="会社名でフィルタ / Lọc theo tên công ty">
        </div>

        <div class="hist-field" style="grid-column: span 4;">
          <label><span class="ja">検索</span><span class="vi">Tìm kiếm</span></label>
          <input type="text" id="history-keyword-input" class="hist-input" placeholder="ID, コード, 名称, 備考 / Mã, tên, ghi chú...">
        </div>

        <div class="hist-field" style="grid-column: span 5;">
          <label><span class="ja">メール宛先</span><span class="vi">Người nhận</span></label>
          <input type="text" id="history-mail-to" class="hist-input" placeholder="example@ysd.co.jp; another@ysd.co.jp">
        </div>

        <div class="hist-field" style="grid-column: span 12;">
          <div class="hist-filter-actions">
            <button type="button" id="history-refresh-btn" class="hist-btn hist-btn-secondary">更新 / Refresh</button>
            <button type="button" id="history-clear-btn" class="hist-btn hist-btn-secondary">クリア / Xóa lọc</button>
            <button type="button" id="history-apply-btn" class="hist-btn hist-btn-primary">適用 / Áp dụng</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hist-table-wrap">
      <table class="hist-table" id="history-table">
        <thead>
          <tr>
            <th class="sortable" data-sort-key="date" style="width: 160px;">日時 / Thời gian</th>
            <th class="sortable" data-sort-key="item" style="min-width: 210px;">コード・名称 / Mã & Tên</th>
            <th class="sortable" data-sort-key="action" style="width: 170px;">種類 / Loại</th>
            <th class="sortable" data-sort-key="fromto" style="min-width: 220px;">From → To</th>
            <th class="sortable" data-sort-key="notes" style="min-width: 220px;">備考 / Ghi chú</th>
            <th class="sortable" data-sort-key="handler" style="width: 150px;">担当 / NV</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="6" style="text-align:center; padding: 12px; color:#777;">
              履歴がありません / Không có dữ liệu lịch sử
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="hist-pagination" id="history-pagination">
      <div class="hist-pagination-inner"></div>
    </div>
  </div>

  <div class="hist-footer">
    <div class="hist-footer-left">
      <button type="button" id="history-cancel" class="hist-btn hist-btn-secondary">閉じる / Đóng</button>
    </div>
    <div class="hist-footer-right">
      <button type="button" id="history-export-csv" class="hist-btn">CSV出力 / Xuất CSV</button>
      <button type="button" id="history-print" class="hist-btn">印刷 / In</button>
      <button type="button" id="history-send-mail" class="hist-btn hist-btn-success">メール送信 / Gửi mail</button>
    </div>
  </div>
</div>
      `.trim();

      document.body.appendChild(root);

      // bind refs
      this.els.root = root;
      this.els.backdrop = root.querySelector('.hist-backdrop');
      this.els.dialog = root.querySelector('.hist-dialog');

      this.els.header = root.querySelector('.hist-header');
      this.els.closeBtn = root.querySelector('.hist-close');

      this.els.summaryEl = root.querySelector('#history-summary');

      this.els.statsWrap = root.querySelector('#history-stats');
      this.els.statTotal = root.querySelector('#hist-stat-total');
      this.els.statAudit = root.querySelector('#hist-stat-audit');
      this.els.statMove = root.querySelector('#hist-stat-move');
      this.els.statInOut = root.querySelector('#hist-stat-io');

      this.els.filtersWrap = root.querySelector('.hist-filters');
      this.els.dateFrom = root.querySelector('#history-date-from');
      this.els.dateTo = root.querySelector('#history-date-to');
      this.els.actionSelect = root.querySelector('#history-action-select');
      this.els.employeeSelect = root.querySelector('#history-employee-select');
      this.els.rackInput = root.querySelector('#history-rack-input');
      this.els.companyInput = root.querySelector('#history-company-input');
      this.els.keywordInput = root.querySelector('#history-keyword-input');
      this.els.mailToInput = root.querySelector('#history-mail-to');

      this.els.refreshBtn = root.querySelector('#history-refresh-btn');
      this.els.clearBtn = root.querySelector('#history-clear-btn');
      this.els.applyBtn = root.querySelector('#history-apply-btn');

      this.els.tableHead = root.querySelector('#history-table thead');
      this.els.tableBody = root.querySelector('#history-table tbody');

      this.els.pagination = root.querySelector('#history-pagination .hist-pagination-inner');

      this.els.cancelBtn = root.querySelector('#history-cancel');
      this.els.exportBtn = root.querySelector('#history-export-csv');
      this.els.printBtn = root.querySelector('#history-print');
      this.els.mailBtn = root.querySelector('#history-send-mail');
    },

    // -----------------------------------------------------------
    // DATA LOADING / MERGING
    // -----------------------------------------------------------
    ensureHistoryEventsBuilt() {
      if (this.state.allEvents && this.state.allEvents.length) return;
      if (this.state.loading) return;

      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub();
        return;
      }

      const dm = window.DataManager;
      if (!dm || !dm.data) {
        console.warn('[HistoryView] DataManager not ready');
        this.state.allEvents = [];
        return;
      }

      this.buildHistoryEvents(
        dm.data.locationlog || [],
        dm.data.shiplog || [],
        dm.data.statuslogs || [],
        dm.data.molds || [],
        dm.data.cutters || [],
        dm.data.companies || [],
        dm.data.employees || []
      );
    },

    async loadHistoryFromGithub() {
      this.state.loading = true;
      this.setSummaryText('GitHubから履歴データを読込中... / Đang tải dữ liệu lịch sử từ GitHub...');

      const base = GITHUB_DATA_BASE_URL;
      const urls = {
        location: base + 'locationlog.csv',
        ship: base + 'shiplog.csv',
        status: base + 'statuslogs.csv',
        molds: base + 'molds.csv',
        cutters: base + 'cutters.csv',
        companies: base + 'companies.csv',
        employees: base + 'employees.csv'
      };

      try {
        const [
          locationText,
          shipText,
          statusText,
          moldsText,
          cuttersText,
          companiesText,
          employeesText
        ] = await Promise.all([
          fetchText(urls.location),
          fetchText(urls.ship),
          fetchText(urls.status),
          fetchText(urls.molds),
          fetchText(urls.cutters),
          fetchText(urls.companies),
          fetchText(urls.employees)
        ]);

        const locationlog = parseCsv(locationText);
        const shiplog = parseCsv(shipText);
        const statuslogs = parseCsv(statusText);
        const molds = parseCsv(moldsText);
        const cutters = parseCsv(cuttersText);
        const companies = parseCsv(companiesText);
        const employees = parseCsv(employeesText);

        this.buildHistoryEvents(locationlog, shiplog, statuslogs, molds, cutters, companies, employees);

        // after reload, keep current filter dates if already set; otherwise set default
        if (!this.els.dateFrom.value || !this.els.dateTo.value) this.applyDefaultDateRange();

        // keep employee select updated and apply
        this.populateEmployeeFilter();
        this.applyFiltersAndRender(true);
      } catch (err) {
        console.error('[HistoryView] ❌ Failed to load history CSV from GitHub:', err);
        this.setSummaryText('履歴データ読込エラー / Lỗi tải dữ liệu lịch sử từ GitHub');
      } finally {
        this.state.loading = false;
      }
    },

    buildHistoryEvents(locationlog, shiplog, statuslogs, molds, cutters, companies, employees) {
      // master maps
      const moldsById = new Map();
      (molds || []).forEach(m => {
        if (m.MoldID) moldsById.set(String(m.MoldID).trim(), m);
      });

      const cuttersById = new Map();
      (cutters || []).forEach(c => {
        if (c.CutterID) cuttersById.set(String(c.CutterID).trim(), c);
      });

      const companiesById = new Map();
      (companies || []).forEach(c => {
        const id = String(c.CompanyID || c.ID || '').trim();
        if (id) companiesById.set(id, c);
      });

      const employeesById = new Map();
      (employees || []).forEach(e => {
        const id = String(e.EmployeeID || '').trim();
        if (id) employeesById.set(id, e);
      });

      // store for fallback detail open
      this.state.master.moldsById = moldsById;
      this.state.master.cuttersById = cuttersById;

      const events = [];

      // 1) locationlog => LOCATION_CHANGE
      (locationlog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID).trim();
        const cutterIdRaw = safeStr(row.CutterID).trim();

        const hasMold = !!moldIdRaw;
        const hasCutter = !!cutterIdRaw;

        const itemType = hasMold ? 'mold' : (hasCutter ? 'cutter' : 'unknown');
        const itemId = hasMold ? moldIdRaw : (hasCutter ? cutterIdRaw : '');

        const mold = hasMold ? moldsById.get(moldIdRaw) : null;
        const cutter = hasCutter ? cuttersById.get(cutterIdRaw) : null;

        const itemCode = hasMold
          ? (mold ? (mold.MoldCode || mold.MoldID || moldIdRaw) : moldIdRaw)
          : (hasCutter ? (cutter ? (cutter.CutterNo || cutter.CutterCode || cutter.CutterID || cutterIdRaw) : cutterIdRaw) : '');

        const itemName = hasMold
          ? (mold ? (mold.MoldName || '') : '')
          : (hasCutter ? (cutter ? (cutter.CutterName || cutter.Name || '') : '') : '');

        const eventDate = safeStr(row.DateEntry || row.date || '').trim();
        const empId = safeStr(row.EmployeeID || row.EmployeeId || '').trim();
        const emp = empId ? employeesById.get(empId) : null;
        const handler = emp ? (emp.EmployeeNameShort || emp.EmployeeName || empId) : (empId || '');

        const fromRackLayer = safeStr(row.OldRackLayer || row.oldracklayer || '').trim();
        const toRackLayer = safeStr(row.NewRackLayer || row.newracklayer || '').trim();

        events.push({
          EventID: 'L' + safeStr(row.LocationLogID || row.LocationLogId || ''),
          Source: 'locationlog',
          ActionKey: ACTION.LOCATION_CHANGE,

          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),
          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',

          EventDate: eventDate,
          EventDateKey: getDateKey(eventDate),

          FromRackLayer: fromRackLayer,
          ToRackLayer: toRackLayer,
          FromCompanyID: '',
          ToCompanyID: '',
          FromCompanyName: '',
          ToCompanyName: '',

          Notes: safeStr(row.notes || row.Notes || '').trim(),
          HandlerID: empId,
          Handler: handler
        });
      });

      // 2) shiplog => SHIP_*
      (shiplog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID).trim();
        const cutterIdRaw = safeStr(row.CutterID).trim();

        const hasMold = !!moldIdRaw;
        const hasCutter = !!cutterIdRaw;

        const itemType = hasMold ? 'mold' : (hasCutter ? 'cutter' : 'unknown');
        const itemId = hasMold ? moldIdRaw : (hasCutter ? cutterIdRaw : '');

        const mold = hasMold ? moldsById.get(moldIdRaw) : null;
        const cutter = hasCutter ? cuttersById.get(cutterIdRaw) : null;

        const itemCode = hasMold
          ? (mold ? (mold.MoldCode || mold.MoldID || moldIdRaw) : moldIdRaw)
          : (hasCutter ? (cutter ? (cutter.CutterNo || cutter.CutterCode || cutter.CutterID || cutterIdRaw) : cutterIdRaw) : '');

        const itemName = hasMold
          ? (mold ? (mold.MoldName || '') : '')
          : (hasCutter ? (cutter ? (cutter.CutterName || cutter.Name || '') : '') : '');

        const eventDate = safeStr(row.ShipDate || row.DateEntry || '').trim();

        const fromId = safeStr(row.FromCompanyID).trim();
        const toId = safeStr(row.ToCompanyID).trim();

        const fromCompany = fromId ? companiesById.get(fromId) : null;
        const toCompany = toId ? companiesById.get(toId) : null;

        const fromName = normalizeSpaces(
          safeStr(row.FromCompany).trim() ||
          (fromCompany ? (fromCompany.CompanyName || fromCompany.Name || '') : '')
        );
        const toName = normalizeSpaces(
          safeStr(row.ToCompany).trim() ||
          (toCompany ? (toCompany.CompanyName || toCompany.Name || '') : '')
        );

        const actionKey = toActionKeyFromShip(row);

        const empId = safeStr(row.EmployeeID || row.EmployeeId || '').trim();
        const emp = empId ? employeesById.get(empId) : null;
        const handlerFallback = normalizeSpaces(safeStr(row.handler || row.Handler || '').trim());
        const handler = emp ? (emp.EmployeeNameShort || emp.EmployeeName || empId) : (handlerFallback || empId || '');

        events.push({
          EventID: 'S' + safeStr(row.ShipID || row.ShipId || ''),
          Source: 'shiplog',
          ActionKey: actionKey,

          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),
          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',

          EventDate: eventDate,
          EventDateKey: getDateKey(eventDate),

          FromRackLayer: '',
          ToRackLayer: '',
          FromCompanyID: fromId,
          ToCompanyID: toId,
          FromCompanyName: fromName,
          ToCompanyName: toName,

          Notes: normalizeSpaces(safeStr(row.ShipNotes || row.Notes || '').trim()),
          HandlerID: empId,
          Handler: handler
        });
      });

      // 3) statuslogs => AUDIT / CHECKIN / CHECKOUT / STATUS_OTHER
      (statuslogs || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID).trim();
        const cutterIdRaw = safeStr(row.CutterID).trim();

        const hasMold = !!moldIdRaw;
        const hasCutter = !!cutterIdRaw;

        const itemTypeRaw = toLower(row.ItemType || '').trim();
        const itemType = hasMold ? 'mold' : (hasCutter ? 'cutter' : (itemTypeRaw || 'unknown'));
        const itemId = hasMold ? moldIdRaw : (hasCutter ? cutterIdRaw : '');

        const mold = hasMold ? moldsById.get(moldIdRaw) : null;
        const cutter = hasCutter ? cuttersById.get(cutterIdRaw) : null;

        const itemCode = hasMold
          ? (mold ? (mold.MoldCode || mold.MoldID || moldIdRaw) : moldIdRaw)
          : (hasCutter ? (cutter ? (cutter.CutterNo || cutter.CutterCode || cutter.CutterID || cutterIdRaw) : cutterIdRaw) : '');

        const itemName = hasMold
          ? (mold ? (mold.MoldName || '') : '')
          : (hasCutter ? (cutter ? (cutter.CutterName || cutter.Name || '') : '') : '');

        const actionKey = toActionKeyFromStatus(row);
        const dateStr = safeStr(row.Timestamp || row.AuditDate || '').trim();

        const empId = safeStr(row.EmployeeID || row.EmployeeId || '').trim();
        const emp = empId ? employeesById.get(empId) : null;
        const handler = emp ? (emp.EmployeeNameShort || emp.EmployeeName || empId) : (empId || '');

        const destId = safeStr(row.DestinationID || row.DestinationId || '').trim();
        const destLabel = destId ? ('DestID:' + destId) : '';

        events.push({
          EventID: 'ST' + safeStr(row.StatusLogID || ''),
          Source: 'statuslogs',
          ActionKey: actionKey,

          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),
          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',

          EventDate: dateStr,
          EventDateKey: getDateKey(dateStr),

          FromRackLayer: '',
          ToRackLayer: '',
          FromCompanyID: '',
          ToCompanyID: destId,
          FromCompanyName: '',
          ToCompanyName: destLabel,

          Notes: normalizeSpaces(safeStr(row.Notes || '').trim()),
          HandlerID: empId,
          Handler: handler
        });
      });

      // sort newest by default
      events.sort((a, b) => {
        const da = new Date(a.EventDate || a.EventDateKey || 0).getTime();
        const db = new Date(b.EventDate || b.EventDateKey || 0).getTime();
        return db - da;
      });

      this.state.allEvents = events;

      // expose for debugging and possible reuse
      if (window.DataManager) {
        window.DataManager.historyEvents = events;
      }

      // update employee filter options after build
      this.populateEmployeeFilter();

      console.log('[HistoryView] events built:', events.length);
    },

    populateEmployeeFilter() {
      const sel = this.els.employeeSelect;
      if (!sel) return;

      // keep current selection if possible
      const current = sel.value || 'all';

      const map = new Map();
      (this.state.allEvents || []).forEach(ev => {
        const id = safeStr(ev.HandlerID).trim();
        const name = normalizeSpaces(ev.Handler || '');
        if (id && name) map.set(id, name);
      });

      const entries = Array.from(map.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

      sel.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = 'すべて / Tất cả';
      sel.appendChild(optAll);

      entries.forEach(([id, name]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        sel.appendChild(opt);
      });

      // restore if still exists
      if ([...sel.options].some(o => o.value === current)) sel.value = current;
      else sel.value = 'all';
    },

    // -----------------------------------------------------------
    // EVENTS / BINDINGS
    // -----------------------------------------------------------
    bindTriggers() {
      const triggers = document.querySelectorAll('.bottom-nav-item[data-tab="history"]');
      triggers.forEach(t => {
        t.addEventListener('click', e => {
          e.preventDefault();
          this.open();
        });
      });
      console.log('[HistoryView] triggers:', triggers.length);
    },

    bindInsideEvents() {
      // close actions
      if (this.els.closeBtn) this.els.closeBtn.addEventListener('click', () => this.close());
      if (this.els.cancelBtn) this.els.cancelBtn.addEventListener('click', () => this.close());
      if (this.els.backdrop) this.els.backdrop.addEventListener('click', () => this.close());

      // ESC close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) this.close();
      });

      // Filter buttons
      if (this.els.applyBtn) this.els.applyBtn.addEventListener('click', () => this.applyFiltersAndRender(true));
      if (this.els.clearBtn) this.els.clearBtn.addEventListener('click', () => this.clearFilters());
      if (this.els.refreshBtn) this.els.refreshBtn.addEventListener('click', () => this.refreshData());

      // filter change -> debounced apply (UX)
      const debouncedApply = debounce(() => this.applyFiltersAndRender(true), 250);

      const onInputChange = () => debouncedApply();

      if (this.els.dateFrom) this.els.dateFrom.addEventListener('change', onInputChange);
      if (this.els.dateTo) this.els.dateTo.addEventListener('change', onInputChange);
      if (this.els.actionSelect) this.els.actionSelect.addEventListener('change', onInputChange);
      if (this.els.employeeSelect) this.els.employeeSelect.addEventListener('change', onInputChange);
      if (this.els.rackInput) this.els.rackInput.addEventListener('input', onInputChange);
      if (this.els.companyInput) this.els.companyInput.addEventListener('input', onInputChange);
      if (this.els.keywordInput) {
        this.els.keywordInput.addEventListener('input', onInputChange);
        this.els.keywordInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.applyFiltersAndRender(true);
        });
      }

      // mail recipients persistence
      if (this.els.mailToInput) {
        this.els.mailToInput.addEventListener('change', () => this.saveMailRecipients());
        this.els.mailToInput.addEventListener('blur', () => this.saveMailRecipients());
      }

      // table sorting
      if (this.els.tableHead) {
        this.els.tableHead.addEventListener('click', (e) => {
          const th = e.target.closest('th.sortable');
          if (!th) return;
          const key = th.getAttribute('data-sort-key') || 'date';
          this.toggleSort(key);
          this.applyFiltersAndRender(false); // keep page
        });
      }

      // footer buttons
      if (this.els.exportBtn) this.els.exportBtn.addEventListener('click', () => this.exportCsv());
      if (this.els.printBtn) this.els.printBtn.addEventListener('click', () => this.print());
      if (this.els.mailBtn) this.els.mailBtn.addEventListener('click', () => this.sendMail());

      // swipe down to close (mobile)
      const swipeTarget = this.els.filtersWrap || this.els.header || this.els.dialog;
      if (swipeTarget && ('ontouchstart' in window)) {
        let startY = null, startX = null, lastY = null, lastX = null;

        swipeTarget.addEventListener('touchstart', (e) => {
          if (!e.touches || !e.touches.length) return;
          const t = e.touches[0];
          startY = t.clientY;
          startX = t.clientX;
          lastY = t.clientY;
          lastX = t.clientX;
        }, { passive: true });

        swipeTarget.addEventListener('touchmove', (e) => {
          if (!e.touches || !e.touches.length) return;
          const t = e.touches[0];
          lastY = t.clientY;
          lastX = t.clientX;
        }, { passive: true });

        swipeTarget.addEventListener('touchend', () => {
          if (startY == null || lastY == null) return;
          const dy = lastY - startY;
          const dx = lastX - startX;
          if (dy > 90 && Math.abs(dx) < 70) this.close();
          startY = startX = lastY = lastX = null;
        });

        swipeTarget.addEventListener('touchcancel', () => {
          startY = startX = lastY = lastX = null;
        });
      }
    },

    // -----------------------------------------------------------
    // FILTERING / SORTING / PAGINATION
    // -----------------------------------------------------------
    applyDefaultDateRange() {
      if (!this.els.dateFrom || !this.els.dateTo) return;
      const today = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(today.getMonth() - 1);
      this.els.dateFrom.value = oneMonthAgo.toISOString().split('T')[0];
      this.els.dateTo.value = today.toISOString().split('T')[0];
    },

    syncFiltersFromDom() {
      this.state.filters.dateFrom = this.els.dateFrom ? safeStr(this.els.dateFrom.value).trim() : '';
      this.state.filters.dateTo = this.els.dateTo ? safeStr(this.els.dateTo.value).trim() : '';
      this.state.filters.action = this.els.actionSelect ? safeStr(this.els.actionSelect.value).trim() : ACTION.ALL;
      this.state.filters.employee = this.els.employeeSelect ? safeStr(this.els.employeeSelect.value).trim() : 'all';
      this.state.filters.rack = this.els.rackInput ? normalizeSpaces(this.els.rackInput.value) : '';
      this.state.filters.company = this.els.companyInput ? normalizeSpaces(this.els.companyInput.value) : '';
      this.state.filters.keyword = this.els.keywordInput ? normalizeSpaces(this.els.keywordInput.value) : '';
    },

    toggleSort(key) {
      if (this.state.sortKey === key) {
        this.state.sortDir = (this.state.sortDir === 'asc') ? 'desc' : 'asc';
      } else {
        this.state.sortKey = key;
        this.state.sortDir = (key === 'date') ? 'desc' : 'asc';
      }
    },

    sortEvents(events) {
      const key = this.state.sortKey || 'date';
      const dir = (this.state.sortDir === 'asc') ? 1 : -1;

      events.sort((a, b) => {
        let va = '', vb = '';

        switch (key) {
          case 'item':
            va = (a.ItemCode || '') + ' ' + (a.ItemName || '');
            vb = (b.ItemCode || '') + ' ' + (b.ItemName || '');
            break;
          case 'action':
            va = safeStr(a.ActionKey);
            vb = safeStr(b.ActionKey);
            break;
          case 'fromto':
            va = (a.FromCompanyName || a.FromRackLayer || '') + ' ' + (a.ToCompanyName || a.ToRackLayer || '');
            vb = (b.FromCompanyName || b.FromRackLayer || '') + ' ' + (b.ToCompanyName || b.ToRackLayer || '');
            break;
          case 'notes':
            va = safeStr(a.Notes);
            vb = safeStr(b.Notes);
            break;
          case 'handler':
            va = safeStr(a.Handler);
            vb = safeStr(b.Handler);
            break;
          case 'date':
          default:
            va = a.EventDate || a.EventDateKey || '';
            vb = b.EventDate || b.EventDateKey || '';
            break;
        }

        if (key === 'date') {
          const da = new Date(va).getTime();
          const db = new Date(vb).getTime();
          return (db - da) * dir;
        }

        va = toLower(va);
        vb = toLower(vb);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });

            // update UI sort indicators
      if (this.els.tableHead) {
        this.els.tableHead.querySelectorAll('th.sortable').forEach(th => {
          th.classList.remove('sort-asc', 'sort-desc');
          const k = th.getAttribute('data-sort-key');
          if (k === key) {
            th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');
          }
        });
      }
    },

    applyFiltersAndRender(resetPage) {
      // sync filter values from DOM
      this.syncFiltersFromDom();

      const all = this.state.allEvents || [];
      const f = this.state.filters;

      const from = f.dateFrom;
      const to = f.dateTo;

      const actionFilter = safeStr(f.action || ACTION.ALL).trim();
      const employeeFilter = safeStr(f.employee || 'all').trim();

      const rackStr = toLower(f.rack || '');
      const companyStr = toLower(f.company || '');
      const keywordStr = toLower(f.keyword || '');

      const filtered = all.filter(ev => {
        const dk = ev.EventDateKey || '';
        if (from && dk && dk < from) return false;
        if (to && dk && dk > to) return false;

        if (actionFilter && actionFilter !== ACTION.ALL) {
          if (safeStr(ev.ActionKey).trim() !== actionFilter) return false;
        }

        if (employeeFilter && employeeFilter !== 'all') {
          if (safeStr(ev.HandlerID).trim() !== employeeFilter) return false;
        }

        if (rackStr) {
          const a = toLower(ev.FromRackLayer || '');
          const b = toLower(ev.ToRackLayer || '');
          // allow user to type rack/layer text freely
          if (!a.includes(rackStr) && !b.includes(rackStr)) return false;
        }

        if (companyStr) {
          const a = toLower(ev.FromCompanyName || '');
          const b = toLower(ev.ToCompanyName || '');
          if (!a.includes(companyStr) && !b.includes(companyStr)) return false;
        }

        if (keywordStr) {
          const hay = [
            ev.ItemId,
            ev.ItemCode,
            ev.ItemName,
            ev.Notes,
            ev.Handler,
            ev.FromRackLayer,
            ev.ToRackLayer,
            ev.FromCompanyName,
            ev.ToCompanyName,
            ev.ActionKey,
            ev.Source
          ].map(x => toLower(x || '')).join(' | ');
          if (!hay.includes(keywordStr)) return false;
        }

        return true;
      });

      this.sortEvents(filtered);

      this.state.filteredEvents = filtered;

      // pagination
      this.state.totalPages = Math.max(1, Math.ceil(filtered.length / (this.state.itemsPerPage || ITEMS_PER_PAGE_DEFAULT)));
      if (resetPage) this.state.currentPage = 1;
      if (this.state.currentPage > this.state.totalPages) this.state.currentPage = this.state.totalPages;

      const start = (this.state.currentPage - 1) * (this.state.itemsPerPage || ITEMS_PER_PAGE_DEFAULT);
      const end = start + (this.state.itemsPerPage || ITEMS_PER_PAGE_DEFAULT);
      const pageEvents = filtered.slice(start, end);

      this.renderTable(pageEvents);
      this.updateSummary(filtered, from, to);
      this.updateStats(filtered);
      this.renderPagination();
    },

    updateSummary(filtered, from, to) {
      if (!this.els.summaryEl) return;

      const total = (this.state.allEvents || []).length;
      const shown = (filtered || []).length;

      let dateRange = '-';
      if (from && to) dateRange = `${from} ～ ${to}`;
      else if (from) dateRange = `${from} ～`;
      else if (to) dateRange = `～ ${to}`;

      this.els.summaryEl.textContent =
        `表示 ${shown} / 全${total} 件（期間: ${dateRange}） / Đang hiển thị ${shown} / tổng ${total}`;
    },

    updateStats(filtered) {
      const list = filtered || [];
      const total = list.length;

      let audit = 0;
      let move = 0;
      let io = 0;

      list.forEach(ev => {
        const k = safeStr(ev.ActionKey).trim();
        if (k === ACTION.AUDIT) audit++;
        if (isMove(k)) move++;
        if (isInOut(k)) io++;
      });

      if (this.els.statTotal) this.els.statTotal.textContent = String(total);
      if (this.els.statAudit) this.els.statAudit.textContent = String(audit);
      if (this.els.statMove) this.els.statMove.textContent = String(move);
      if (this.els.statInOut) this.els.statInOut.textContent = String(io);
    },

    renderPagination() {
      if (!this.els.pagination) return;

      const totalPages = this.state.totalPages || 1;
      const current = this.state.currentPage || 1;

      if (totalPages <= 1) {
        this.els.pagination.innerHTML = '';
        return;
      }

      const mkBtn = (label, page, isActive, isDisabled) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hist-page-btn' + (isActive ? ' active' : '');
        btn.textContent = label;
        btn.disabled = !!isDisabled;
        if (!isDisabled) {
          btn.addEventListener('click', () => this.goToPage(page));
        }
        return btn;
      };

      const wrap = document.createElement('div');
      wrap.className = 'hist-pagination-inner';

      // Prev
      wrap.appendChild(mkBtn('←', Math.max(1, current - 1), false, current <= 1));

      // page numbers with ellipsis (similar to audit-history-viewer)
      const pagesToShow = [];
      for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= current - 2 && p <= current + 2)) {
          pagesToShow.push(p);
        }
      }

      let last = 0;
      pagesToShow.forEach(p => {
        if (p - last > 1) {
          const ell = document.createElement('span');
          ell.className = 'hist-page-ellipsis';
          ell.textContent = '...';
          wrap.appendChild(ell);
        }
        wrap.appendChild(mkBtn(String(p), p, p === current, false));
        last = p;
      });

      // Next
      wrap.appendChild(mkBtn('→', Math.min(totalPages, current + 1), false, current >= totalPages));

      this.els.pagination.innerHTML = '';
      this.els.pagination.appendChild(wrap);
    },

    goToPage(page) {
      const p = Math.max(1, Math.min(this.state.totalPages || 1, Number(page) || 1));
      this.state.currentPage = p;
      this.applyFiltersAndRender(false);
    },

    renderTable(events) {
      if (!this.els.tableBody) return;

      this.els.tableBody.innerHTML = '';

      if (!events || !events.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.textAlign = 'center';
        td.style.padding = '12px';
        td.style.color = '#777';
        td.textContent = '履歴がありません / Không có dữ liệu lịch sử';
        tr.appendChild(td);
        this.els.tableBody.appendChild(tr);
        return;
      }

      events.forEach(ev => {
        const tr = document.createElement('tr');

        // 1) Date
        const dateTd = document.createElement('td');
        dateTd.textContent = formatDateTime(ev.EventDate);
        tr.appendChild(dateTd);

        // 2) Item
        const itemTd = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hist-item-link';
        btn.innerHTML =
          `<div class="hist-item-code">${escapeHtml(ev.ItemCode || '-')}</div>` +
          `<div class="hist-item-name">${escapeHtml(ev.ItemName || '')}</div>` +
          `<div class="hist-item-meta">${escapeHtml((ev.ItemType || '').toUpperCase())} / ID:${escapeHtml(ev.ItemId || '')}</div>`;

        btn.addEventListener('click', () => {
          // Prefer DataManager live detail if available; fallback to cached maps
          const dm = window.DataManager;
          let item = null;
          let type = ev.ItemType;

          try {
            if (dm && dm.data) {
              if (type === 'mold') {
                const id = safeStr(ev.MoldID || ev.ItemId).trim();
                const arr = Array.isArray(dm.data.molds) ? dm.data.molds : [];
                item = arr.find(m => safeStr(m.MoldID).trim() === id) || null;
              } else if (type === 'cutter') {
                const id = safeStr(ev.CutterID || ev.ItemId).trim();
                const arr = Array.isArray(dm.data.cutters) ? dm.data.cutters : [];
                item = arr.find(c => safeStr(c.CutterID).trim() === id) || null;
              }
            }

            // fallback
            if (!item) {
              if (type === 'mold') item = this.state.master.moldsById.get(safeStr(ev.MoldID || ev.ItemId).trim()) || null;
              if (type === 'cutter') item = this.state.master.cuttersById.get(safeStr(ev.CutterID || ev.ItemId).trim()) || null;
            }

            if (!item) return;

            // Mobile detail (if implemented by project)
            if (window.innerWidth < 768 && window.MobileDetailModal) {
              const evt = new CustomEvent('showMobileDetail', { detail: { item, type } });
              document.dispatchEvent(evt);
              return;
            }

            // Desktop detail
            if (window.UIRenderer && typeof window.UIRenderer.showDetail === 'function') {
              window.UIRenderer.showDetail(item, type);
              return;
            }
          } catch (e) {
            console.warn('[HistoryView] open detail failed:', e);
          }
        });

        itemTd.appendChild(btn);
        tr.appendChild(itemTd);

        // 3) Action badge
        const actionTd = document.createElement('td');
        const meta = actionMeta(ev.ActionKey);
        actionTd.innerHTML =
          `<span class="hist-badge ${meta.badgeClass}">${escapeHtml(meta.ja)} <span class="vi">/ ${escapeHtml(meta.vi)}</span></span>`;
        tr.appendChild(actionTd);

        // 4) From -> To
        const ftTd = document.createElement('td');
        const fromLabel = (ev.ActionKey === ACTION.LOCATION_CHANGE)
          ? (ev.FromRackLayer || '-')
          : (ev.FromCompanyName || '-');
        const toLabel = (ev.ActionKey === ACTION.LOCATION_CHANGE)
          ? (ev.ToRackLayer || '-')
          : (ev.ToCompanyName || '-');

        ftTd.innerHTML =
          `<div class="hist-fromto"><span class="label">From</span> <span class="hist-rack-mono">${escapeHtml(fromLabel)}</span></div>` +
          `<div class="hist-fromto"><span class="label">To</span> <span class="hist-rack-mono">${escapeHtml(toLabel)}</span></div>`;
        tr.appendChild(ftTd);

        // 5) Notes
        const notesTd = document.createElement('td');
        notesTd.textContent = ev.Notes || '';
        tr.appendChild(notesTd);

        // 6) Handler
        const handlerTd = document.createElement('td');
        handlerTd.textContent = ev.Handler || '';
        tr.appendChild(handlerTd);

        this.els.tableBody.appendChild(tr);
      });
    },

    // -----------------------------------------------------------
    // FILTER COMMANDS
    // -----------------------------------------------------------
    clearFilters() {
      if (this.els.actionSelect) this.els.actionSelect.value = ACTION.ALL;
      if (this.els.employeeSelect) this.els.employeeSelect.value = 'all';
      if (this.els.rackInput) this.els.rackInput.value = '';
      if (this.els.companyInput) this.els.companyInput.value = '';
      if (this.els.keywordInput) this.els.keywordInput.value = '';

      this.applyDefaultDateRange();
      this.applyFiltersAndRender(true);
    },

    refreshData() {
      // Force reload from source
      this.state.allEvents = [];
      this.state.filteredEvents = [];
      this.state.currentPage = 1;

      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub();
      } else {
        this.ensureHistoryEventsBuilt();
        this.applyFiltersAndRender(true);
      }
    },

    setSummaryText(text) {
      if (this.els.summaryEl) this.els.summaryEl.textContent = safeStr(text);
    },

    // -----------------------------------------------------------
    // OPEN / CLOSE
    // -----------------------------------------------------------
    isOpen() {
      return !!(this.els.root && this.els.root.classList.contains('hist-open'));
    },

    open(opts) {
      if (!this.els.root) return;

      // apply optional preset
      const preset = (opts && opts.preset) ? opts.preset : null;
      this.state.lastPreset = preset || null;

      if (preset) {
        // date preset
        if (preset.dateFrom && this.els.dateFrom) this.els.dateFrom.value = preset.dateFrom;
        if (preset.dateTo && this.els.dateTo) this.els.dateTo.value = preset.dateTo;

        // action preset
        if (preset.action && this.els.actionSelect) this.els.actionSelect.value = preset.action;

        // employee preset
        if (preset.employee && this.els.employeeSelect) this.els.employeeSelect.value = preset.employee;

        // keyword preset
        if (typeof preset.keyword === 'string' && this.els.keywordInput) this.els.keywordInput.value = preset.keyword;

        // company preset
        if (typeof preset.company === 'string' && this.els.companyInput) this.els.companyInput.value = preset.company;

        // rack preset
        if (typeof preset.rack === 'string' && this.els.rackInput) this.els.rackInput.value = preset.rack;
      }

      this.els.root.classList.add('hist-open');

      // ensure data
      this.ensureHistoryEventsBuilt();
      this.applyFiltersAndRender(true);
    },

    close() {
      if (!this.els.root) return;
      this.els.root.classList.remove('hist-open');
    },

    // -----------------------------------------------------------
    // EXPORT / PRINT / MAIL
    // -----------------------------------------------------------
    exportCsv() {
      const events = this.state.filteredEvents || [];
      if (!events.length) {
        alert('出力するデータがありません / Không có dữ liệu để xuất');
        return;
      }

      const header = ['日時', 'コード', '名称', '種類', 'From', 'To', '備考', '担当'];
      const rows = events.map(ev => {
        const meta = actionMeta(ev.ActionKey);
        const fromVal = (ev.ActionKey === ACTION.LOCATION_CHANGE) ? (ev.FromRackLayer || '') : (ev.FromCompanyName || '');
        const toVal = (ev.ActionKey === ACTION.LOCATION_CHANGE) ? (ev.ToRackLayer || '') : (ev.ToCompanyName || '');
        return [
          formatDateTime(ev.EventDate),
          ev.ItemCode || '',
          ev.ItemName || '',
          meta.ja,
          fromVal,
          toVal,
          ev.Notes || '',
          ev.Handler || ''
        ];
      });

      const esc = (v) => {
        const s = safeStr(v);
        // csv escaping
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      let csv = '\uFEFF' + header.map(esc).join(',') + '\n';
      csv += rows.map(r => r.map(esc).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'history-' + new Date().toISOString().split('T')[0] + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    print() {
      const events = this.state.filteredEvents || [];
      if (!events.length) {
        alert('印刷するデータがありません / Không có dữ liệu để in');
        return;
      }

      const slice = events.slice(0, MAX_PRINT_ROWS);

      const rowsHtml = slice.map((ev, idx) => {
        const meta = actionMeta(ev.ActionKey);
        const fromVal = (ev.ActionKey === ACTION.LOCATION_CHANGE) ? (ev.FromRackLayer || '-') : (ev.FromCompanyName || '-');
        const toVal = (ev.ActionKey === ACTION.LOCATION_CHANGE) ? (ev.ToRackLayer || '-') : (ev.ToCompanyName || '-');

        return `
<tr>
  <td style="text-align:center;">${idx + 1}</td>
  <td>${escapeHtml(formatDateTime(ev.EventDate))}</td>
  <td>${escapeHtml(ev.ItemCode || '')}</td>
  <td>${escapeHtml(ev.ItemName || '')}</td>
  <td>${escapeHtml(meta.ja)}</td>
  <td>${escapeHtml(fromVal)} → ${escapeHtml(toVal)}</td>
  <td>${escapeHtml(ev.Notes || '')}</td>
  <td>${escapeHtml(ev.Handler || '')}</td>
</tr>`.trim();
      }).join('\n');

      const win = window.open('', '_blank');
      if (!win) return;

      win.document.open();
      win.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>History Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "Hiragino Sans", Meiryo, sans-serif; font-size: 11px; margin: 16px; }
  h3 { margin: 0 0 10px; }
  .note { color: #666; font-size: 10px; margin-bottom: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
  th { background: #E3F2FD; color: #0D47A1; }
</style>
</head>
<body>
  <h3>履歴 / History Report</h3>
  <div class="note">※ 最大 ${MAX_PRINT_ROWS} 行まで表示 / Show up to ${MAX_PRINT_ROWS} rows</div>
  <table>
    <thead>
      <tr>
        <th style="width:40px;">No</th>
        <th style="width:140px;">日時</th>
        <th style="width:120px;">コード</th>
        <th>名称</th>
        <th style="width:110px;">種類</th>
        <th style="width:220px;">From → To</th>
        <th>備考</th>
        <th style="width:120px;">担当</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <script>
    window.focus();
    window.print();
  </script>
</body>
</html>
      `.trim());
      win.document.close();
    },

    sendMail() {
      const events = this.state.filteredEvents || [];
      if (!events.length) {
        alert('メール送信するデータがありません / Không có dữ liệu để gửi mail');
        return;
      }

      const recipientsRaw = this.els.mailToInput ? safeStr(this.els.mailToInput.value) : '';
      const recipients = recipientsRaw
        .split(/[;,]+/g)
        .map(s => s.trim())
        .filter(Boolean)
        .join(';');

      const slice = events.slice(0, MAX_MAIL_LINES);

      const lines = [];
      lines.push('履歴レポート / History Report');
      lines.push('');
      lines.push('※ 等幅フォント推奨（Consolas / Courier / MS Gothic）');
      lines.push('※ Khuyến nghị font monospace (Consolas / Courier / MS Gothic)');
      lines.push('');

      const sep = '-'.repeat(112);
      lines.push(sep);
      lines.push(
        padRight('No', 4) +
        padRight('DateTime', 18) +
        padRight('Code', 14) +
        padRight('Name', 18) +
        padRight('Type', 12) +
        padRight('From -> To', 34) +
        padRight('Handler', 14)
      );
      lines.push(sep);

      slice.forEach((ev, idx) => {
        const meta = actionMeta(ev.ActionKey);
        const dt = truncate(formatDateTime(ev.EventDate), 16);
        const code = truncate(ev.ItemCode || '-', 12);
        const name = truncate(ev.ItemName || '-', 16);

        const fromVal = (ev.ActionKey === ACTION.LOCATION_CHANGE) ? (ev.FromRackLayer || '-') : (ev.FromCompanyName || '-');
        const toVal = (ev.ActionKey === ACTION.LOCATION_CHANGE) ? (ev.ToRackLayer || '-') : (ev.ToCompanyName || '-');
        const ft = truncate(`${fromVal} -> ${toVal}`, 32);

        const handler = truncate(ev.Handler || '-', 12);

        lines.push(
          padRight(String(idx + 1), 4) +
          padRight(dt, 18) +
          padRight(code, 14) +
          padRight(name, 18) +
          padRight(truncate(meta.ja, 10), 12) +
          padRight(ft, 34) +
          padRight(handler, 14)
        );
      });

      lines.push(sep);

      if (events.length > MAX_MAIL_LINES) {
        lines.push('');
        lines.push(`... 他 ${events.length - MAX_MAIL_LINES} 件 / còn lại ${events.length - MAX_MAIL_LINES} dòng`);
      }

      const subject = encodeURIComponent('履歴 / History ' + new Date().toISOString().slice(0, 10));
      const body = encodeURIComponent(lines.join('\n'));

      const mailto = recipients
        ? `mailto:${encodeURIComponent(recipients)}?subject=${subject}&body=${body}`
        : `mailto:?subject=${subject}&body=${body}`;

      window.location.href = mailto;
    },

    // -----------------------------------------------------------
    // MAIL RECIPIENTS STORAGE
    // -----------------------------------------------------------
    loadMailRecipients() {
      if (!this.els.mailToInput) return;
      try {
        const raw = localStorage.getItem('historyMailRecipients') || '';
        this.els.mailToInput.value = raw;
      } catch (e) {
        console.warn('[HistoryView] Cannot load mail recipients:', e);
      }
    },

    saveMailRecipients() {
      if (!this.els.mailToInput) return;
      try {
        localStorage.setItem('historyMailRecipients', safeStr(this.els.mailToInput.value));
      } catch (e) {
        console.warn('[HistoryView] Cannot save mail recipients:', e);
      }
    }
  };

  // Module init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistoryView.init());
  } else {
    HistoryView.init();
  }

  // Export for debugging / programmatic open
  window.HistoryView = HistoryView;

})();
