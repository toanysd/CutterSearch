/**
 * history-view-r7.1.3.js
 * ===========================================================
 * Unified History View (履歴ビュー) for Mold/Cutter
 *
 * CHANGELOG r7.1.3 (2025-12-15):
 * ✅ FIX: Chuẩn hóa logic đọc Status từ statuslogs.csv
 *    - Xử lý nhiều format: IN/CHECKIN/CHECK_IN, OUT/CHECKOUT/CHECK_OUT
 *    - Dựa vào AuditType để phân biệt SHIP_IN/SHIP_OUT vs CHECKIN/CHECKOUT
 *    - Xử lý dữ liệu cũ (Status trống hoặc không chuẩn)
 * ✅ IMPROVE: Hàm toActionKeyFromStatus() robust hơn
 *    - SHIP-FROM-COMPANY → SHIP_IN
 *    - SHIP-TO-COMPANY → SHIP_OUT
 *    - CHECK_IN + AUDIT keywords → AUDIT
 *    - Fallback logic rõ ràng
 *
 * r7.1.2 UI compact update:
 * - Styles extracted to external file: history-view.css (no more injectStyles content)
 * - Remove mail recipient input in filters; mail is fixed to toan@ysd-pack.co.jp
 * - Footer buttons remain one row, equal width (handled by CSS)
 * - Table/filters/stats compact to maximize visible history rows
 * - CSV export with UTF-8 BOM; Mail body uses encodeURIComponent (JP safe)
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
 * Updated: 2025-12-15 (r7.1.3)
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

  // Fixed mail recipients (no UI input)
  const FIXED_MAIL_TO = 'toan@ysd-pack.co.jp';

  // External stylesheet file (auto resolved based on this script path)
  const EXTERNAL_CSS_FILENAME = 'history-view-r7.1.2.css';

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

  function splitDateTimeText(dtText) {
    // try split "YYYY/MM/DD HH:MM" -> [date, time]
    const s = safeStr(dtText).trim();
    const m = s.match(/^(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}).*$/);
    if (m) return [m[1], m[2]];
    const m2 = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}).*$/);
    if (m2) return [m2[1], m2[2]];
    return [s, ''];
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

  function utf8ToBase64(str) {
    // Convert JS string -> UTF-8 bytes -> base64
    const utf8 = unescape(encodeURIComponent(str));
    return btoa(utf8);
  }

  function wrapBase64Lines(b64, lineLen = 76) {
    const out = [];
    for (let i = 0; i < b64.length; i += lineLen) out.push(b64.slice(i, i + lineLen));
    return out.join('\r\n');
  }

  function buildEml({ to, subject, bodyText }) {
    const subjB64 = utf8ToBase64(subject);
    const subjHeader = `=?UTF-8?B?${subjB64}?=`;

    const bodyB64 = wrapBase64Lines(utf8ToBase64(bodyText));

    // RFC822 / MIME (CRLF required)
    return [
      `To: ${to}`,
      `Subject: ${subjHeader}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      bodyB64,
      ``
    ].join('\r\n');
  }

  function downloadTextFile(filename, text, mime = 'message/rfc822') {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ===========================================================
  // CSS LOADING (external)
  // ===========================================================
  function resolveCssHref(filename) {
    // Try to resolve relative to the current script src.
    const scripts = Array.from(document.getElementsByTagName('script'));
    const candidate = scripts
      .map(s => s.getAttribute('src') || '')
      .filter(src => src && (src.includes('history-view') || src.includes('HistoryView')))
      .pop();

    if (candidate) {
      // absolute or relative src
      try {
        const u = new URL(candidate, window.location.href);
        const base = u.href.substring(0, u.href.lastIndexOf('/') + 1);
        return base + filename;
      } catch (_) {
        // fallback: if it's a simple relative path
        const idx = candidate.lastIndexOf('/');
        if (idx >= 0) return candidate.substring(0, idx + 1) + filename;
      }
    }
    return filename; // fallback: current directory
  }

  function ensureExternalCssLoaded() {
    const id = 'history-view-external-css';
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = resolveCssHref(EXTERNAL_CSS_FILENAME);
    document.head.appendChild(link);
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

  /**
   * ✅ R7.1.3 FIX: Chuẩn hóa logic đọc Status từ statuslogs.csv
   * 
   * Priority logic:
   * 1. AuditType rõ ràng (SHIP-FROM-COMPANY, SHIP-TO-COMPANY)
   * 2. Status field (IN/OUT/CHECKIN/CHECKOUT/CHECK_IN/CHECK_OUT)
   * 3. Notes và AuditType có keyword "audit"/"棚卸"
   * 4. Fallback: STATUS_OTHER
   */
  function toActionKeyFromStatus(row) {
    const statusRaw = safeStr(row.Status).toUpperCase().replace(/[_-]/g, '').trim(); // Chuẩn hóa: loại bỏ _ và -
    const auditTypeRaw = safeStr(row.AuditType).toUpperCase().trim();
    const notesRaw = toLower(safeStr(row.Notes));

    // ========================================
    // ✅ 1. PRIORITY: AuditType rõ ràng
    // ========================================
    if (auditTypeRaw.includes('SHIP-FROM-COMPANY') || auditTypeRaw.includes('SHIPFROMCOMPANY')) {
      return ACTION.SHIP_IN; // ✅ Nhận về từ công ty khác
    }

    if (auditTypeRaw.includes('SHIP-TO-COMPANY') || auditTypeRaw.includes('SHIPTOCOMPANY')) {
      return ACTION.SHIP_OUT; // ✅ Xuất kho đến công ty khác
    }

    // ========================================
    // ✅ 2. Status field parsing
    // ========================================
    const hasAuditKeyword = notesRaw.includes('棚卸') || notesRaw.includes('audit') || auditTypeRaw.includes('AUDIT');

    // IN variants: IN, CHECKIN, CHECK_IN
    if (statusRaw === 'IN' || statusRaw === 'CHECKIN') {
      // Nếu có keyword audit → AUDIT, không phải CHECKIN thông thường
      if (hasAuditKeyword) return ACTION.AUDIT;
      return ACTION.CHECKIN;
    }

    // OUT variants: OUT, CHECKOUT, CHECK_OUT
    if (statusRaw === 'OUT' || statusRaw === 'CHECKOUT') {
      // Checkout thông thường (không phải ship)
      return ACTION.CHECKOUT;
    }

    // ========================================
    // ✅ 3. Dựa vào AuditType và Notes
    // ========================================
    if (hasAuditKeyword) {
      return ACTION.AUDIT;
    }

    // ========================================
    // ✅ 4. Fallback
    // ========================================
    console.log('[toActionKeyFromStatus] Fallback to STATUS_OTHER:', {
      Status: row.Status,
      AuditType: row.AuditType,
      Notes: row.Notes
    });
    
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

      ensureExternalCssLoaded();
      this.createModal();

      this.ensureHistoryEventsBuilt();
      this.bindTriggers();
      this.bindInsideEvents();
      this.applyDefaultDateRange();

      // initial apply (may show empty until loaded)
      this.applyFiltersAndRender(true);

      this.state.initialized = true;
      console.log('[HistoryView r7.1.3] Initialized');
    },

    createModal() {
      if (this.els.root) return;

      const root = document.createElement('div');
      root.className = 'hist-root';
      root.id = 'history-modal-root';

      // NOTE: Removed mail-to input field from filters in r7.1.2
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
          <div class="hist-stat-label">移動 Di chuyển</div>
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

        <div class="hist-field" style="grid-column: span 6;">
          <label><span class="ja">検索</span><span class="vi">Tìm kiếm</span></label>
          <input type="text" id="history-keyword-input" class="hist-input" placeholder="ID, コード, 名称, 備考 / Mã, tên, ghi chú...">
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
            <th class="sortable" data-sort-key="date" style="width: 130px;">日時</th>
            <th class="sortable" data-sort-key="item" style="min-width: 140px;">コード・名称</th>
            <th class="sortable" data-sort-key="action" style="width: 130px;">種類</th>
            <th class="sortable" data-sort-key="fromto" style="min-width: 170px;">From → To</th>
            <th class="sortable" data-sort-key="notes" style="min-width: auto;">備考</th>
            <th class="sortable" data-sort-key="handler" style="width: 170px;">担当</th>
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
      <button type="button" id="history-cancel" class="hist-btn hist-btn-secondary">閉じる</button>
    </div>
    <div class="hist-footer-right">
      <button type="button" id="history-export-csv" class="hist-btn">CSV出力</button>
      <button type="button" id="history-print" class="hist-btn">印刷</button>
      <button type="button" id="history-send-mail" class="hist-btn hist-btn-success">メール送信</button>
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

        const shortName = emp ? (emp.EmployeeNameShort || emp.EmployeeName || empId) : '';
        const handlerFallback = normalizeSpaces(safeStr(row.handler || row.Handler || '').trim());

        // Always prefer shortName if EmployeeID exists in employees.csv
        const handler = shortName || handlerFallback || empId || '';

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

      // ========================================
      // ✅ 3) statuslogs => AUDIT / CHECKIN / CHECKOUT / SHIP_IN / SHIP_OUT / STATUS_OTHER
      // ========================================
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

        // ✅ Sử dụng hàm toActionKeyFromStatus() đã cải tiến
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

      console.log('[HistoryView r7.1.3] events built:', events.length);
    },

    populateEmployeeFilter() {
      const sel = this.els.employeeSelect;
      if (!sel) return;

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

      // filter change - debounced apply (UX)
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

      // table sorting
      if (this.els.tableHead) {
        this.els.tableHead.addEventListener('click', e => {
          const th = e.target.closest('th.sortable');
          if (!th) return;
          const key = th.getAttribute('data-sort-key') || 'date';
          this.toggleSort(key);
          this.applyFiltersAndRender(false);
        });
      }

      // footer buttons
      if (this.els.exportBtn) this.els.exportBtn.addEventListener('click', () => this.exportCsv());
      if (this.els.printBtn) this.els.printBtn.addEventListener('click', () => this.print());
      if (this.els.mailBtn) this.els.mailBtn.addEventListener('click', () => this.sendMail());

      // swipe down to close (mobile)
      const swipeTarget = this.els.filtersWrap || this.els.header || this.els.dialog;
      if (swipeTarget && 'ontouchstart' in window) {
        let startY = null, startX = null, lastY = null, lastX = null;

        swipeTarget.addEventListener('touchstart', e => {
          if (!e.touches || !e.touches.length) return;
          const t = e.touches[0];
          startY = t.clientY;
          startX = t.clientX;
          lastY = t.clientY;
          lastX = t.clientX;
        }, { passive: true });

        swipeTarget.addEventListener('touchmove', e => {
          if (!e.touches || !e.touches.length) return;
          const t = e.touches[0];
          lastY = t.clientY;
          lastX = t.clientX;
        }, { passive: true });

        swipeTarget.addEventListener('touchend', () => {
          if (startY == null || lastY == null) return;
          const deltaY = lastY - startY;
          const deltaX = Math.abs(lastX - startX);
          if (deltaY > 100 && deltaX < 50) this.close();
          startY = null;
          lastY = null;
        });
      }
    },

    // -----------------------------------------------------------
    // OPEN / CLOSE
    // -----------------------------------------------------------
    open(options = {}) {
      if (!this.state.initialized) this.init();

      this.state.lastPreset = options.preset || null;

      if (this.state.lastPreset) {
        this.applyPreset(this.state.lastPreset);
      }

      this.applyFiltersAndRender(true);

      if (this.els.root) {
        this.els.root.classList.add('hist-open');
        document.body.style.overflow = 'hidden';
      }

      console.log('[HistoryView] opened');
    },

    close() {
      if (this.els.root) {
        this.els.root.classList.remove('hist-open');
        document.body.style.overflow = '';
      }
      console.log('[HistoryView] closed');
    },

    isOpen() {
      return this.els.root && this.els.root.classList.contains('hist-open');
    },

    // -----------------------------------------------------------
    // PRESET
    // -----------------------------------------------------------
    applyPreset(preset) {
      if (!preset) return;

      if (preset.dateFrom && this.els.dateFrom) this.els.dateFrom.value = preset.dateFrom;
      if (preset.dateTo && this.els.dateTo) this.els.dateTo.value = preset.dateTo;
      if (preset.action && this.els.actionSelect) this.els.actionSelect.value = preset.action;
      if (preset.employee && this.els.employeeSelect) this.els.employeeSelect.value = preset.employee;
      if (preset.rack && this.els.rackInput) this.els.rackInput.value = preset.rack;
      if (preset.company && this.els.companyInput) this.els.companyInput.value = preset.company;
      if (preset.keyword && this.els.keywordInput) this.els.keywordInput.value = preset.keyword;
    },

    // -----------------------------------------------------------
    // DEFAULT DATE RANGE
    // -----------------------------------------------------------
    applyDefaultDateRange() {
      const today = new Date();
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setMonth(today.getMonth() - 1);

      const fromStr = oneMonthAgo.toISOString().split('T')[0];
      const toStr = today.toISOString().split('T')[0];

      if (this.els.dateFrom) this.els.dateFrom.value = fromStr;
      if (this.els.dateTo) this.els.dateTo.value = toStr;
    },

    // -----------------------------------------------------------
    // FILTER & SORT
    // -----------------------------------------------------------
    clearFilters() {
      if (this.els.dateFrom) this.els.dateFrom.value = '';
      if (this.els.dateTo) this.els.dateTo.value = '';
      if (this.els.actionSelect) this.els.actionSelect.value = ACTION.ALL;
      if (this.els.employeeSelect) this.els.employeeSelect.value = 'all';
      if (this.els.rackInput) this.els.rackInput.value = '';
      if (this.els.companyInput) this.els.companyInput.value = '';
      if (this.els.keywordInput) this.els.keywordInput.value = '';

      this.applyDefaultDateRange();
      this.applyFiltersAndRender(true);
    },

    refreshData() {
      this.state.allEvents = [];
      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub();
      } else {
        this.ensureHistoryEventsBuilt();
        this.applyFiltersAndRender(true);
      }
    },

    toggleSort(key) {
      if (this.state.sortKey === key) {
        this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.state.sortKey = key;
        this.state.sortDir = 'desc';
      }
      this.updateSortIndicators();
    },

    updateSortIndicators() {
      const ths = this.els.tableHead ? this.els.tableHead.querySelectorAll('th.sortable') : [];
      ths.forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        const k = th.getAttribute('data-sort-key');
        if (k === this.state.sortKey) {
          th.classList.add(this.state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
      });
    },

    applyFiltersAndRender(resetPage = false) {
      if (resetPage) this.state.currentPage = 1;

      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      const actionVal = this.els.actionSelect ? this.els.actionSelect.value : ACTION.ALL;
      const empVal = this.els.employeeSelect ? this.els.employeeSelect.value : 'all';
      const rackVal = toLower(this.els.rackInput ? this.els.rackInput.value : '');
      const companyVal = toLower(this.els.companyInput ? this.els.companyInput.value : '');
      const keywordVal = toLower(this.els.keywordInput ? this.els.keywordInput.value : '');

      this.state.filters = {
        dateFrom,
        dateTo,
        action: actionVal,
        employee: empVal,
        rack: rackVal,
        company: companyVal,
        keyword: keywordVal
      };

      let filtered = this.state.allEvents.slice();

      // date filter
      if (dateFrom) {
        const dfKey = dateFrom; // YYYY-MM-DD
        filtered = filtered.filter(ev => ev.EventDateKey >= dfKey);
      }
      if (dateTo) {
        const dtKey = dateTo;
        filtered = filtered.filter(ev => ev.EventDateKey <= dtKey);
      }

      // action
      if (actionVal && actionVal !== ACTION.ALL) {
        filtered = filtered.filter(ev => ev.ActionKey === actionVal);
      }

      // employee
      if (empVal && empVal !== 'all') {
        filtered = filtered.filter(ev => ev.HandlerID === empVal);
      }

      // rack
      if (rackVal) {
        filtered = filtered.filter(ev => {
          const from = toLower(ev.FromRackLayer);
          const to = toLower(ev.ToRackLayer);
          return from.includes(rackVal) || to.includes(rackVal);
        });
      }

      // company
      if (companyVal) {
        filtered = filtered.filter(ev => {
          const fromC = toLower(ev.FromCompanyName);
          const toC = toLower(ev.ToCompanyName);
          return fromC.includes(companyVal) || toC.includes(companyVal);
        });
      }

      // keyword
      if (keywordVal) {
        filtered = filtered.filter(ev => {
          const code = toLower(ev.ItemCode);
          const name = toLower(ev.ItemName);
          const notes = toLower(ev.Notes);
          const handler = toLower(ev.Handler);
          return (
            code.includes(keywordVal) ||
            name.includes(keywordVal) ||
            notes.includes(keywordVal) ||
            handler.includes(keywordVal)
          );
        });
      }

      // sort
      this.sortEvents(filtered);

      this.state.filteredEvents = filtered;

      // compute pagination
      const total = filtered.length;
      const perPage = this.state.itemsPerPage;
      this.state.totalPages = Math.max(1, Math.ceil(total / perPage));
      if (this.state.currentPage > this.state.totalPages) {
        this.state.currentPage = this.state.totalPages;
      }

      this.renderTable();
      this.renderPagination();
      this.updateSummary();
      this.updateStats();
      this.updateSortIndicators();
    },

    sortEvents(events) {
      const key = this.state.sortKey;
      const dir = this.state.sortDir;
      const mul = dir === 'asc' ? 1 : -1;

      events.sort((a, b) => {
        let valA, valB;

        switch (key) {
          case 'date': {
            const ta = new Date(a.EventDate || a.EventDateKey || 0).getTime();
            const tb = new Date(b.EventDate || b.EventDateKey || 0).getTime();
            return (ta - tb) * mul;
          }
          case 'item':
            valA = toLower(a.ItemCode + ' ' + a.ItemName);
            valB = toLower(b.ItemCode + ' ' + b.ItemName);
            break;
          case 'action': {
            const ma = actionMeta(a.ActionKey);
            const mb = actionMeta(b.ActionKey);
            valA = ma.ja;
            valB = mb.ja;
            break;
          }
          case 'fromto':
            valA = toLower((a.FromRackLayer || a.FromCompanyName) + (a.ToRackLayer || a.ToCompanyName));
            valB = toLower((b.FromRackLayer || b.FromCompanyName) + (b.ToRackLayer || b.ToCompanyName));
            break;
          case 'notes':
            valA = toLower(a.Notes);
            valB = toLower(b.Notes);
            break;
          case 'handler':
            valA = toLower(a.Handler);
            valB = toLower(b.Handler);
            break;
          default:
            return 0;
        }

        if (valA < valB) return -1 * mul;
        if (valA > valB) return 1 * mul;
        return 0;
      });
    },

    // -----------------------------------------------------------
    // RENDER
    // -----------------------------------------------------------
    renderTable() {
      if (!this.els.tableBody) return;

      const filtered = this.state.filteredEvents;
      const total = filtered.length;
      const page = this.state.currentPage;
      const perPage = this.state.itemsPerPage;

      const start = (page - 1) * perPage;
      const end = Math.min(start + perPage, total);
      const slice = filtered.slice(start, end);

      if (!slice.length) {
        this.els.tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:12px; color:#777;">
              該当する履歴がありません / Không có dữ liệu lịch sử phù hợp
            </td>
          </tr>
        `;
        return;
      }

      const rows = slice.map(ev => {
        const meta = actionMeta(ev.ActionKey);
        const dtFormatted = formatDateTime(ev.EventDate);
        const [datePart, timePart] = splitDateTimeText(dtFormatted);

        const itemCodeHTML = ev.ItemCode ? `<div class="hist-item-code">${escapeHtml(ev.ItemCode)}</div>` : '';
        const itemNameHTML = ev.ItemName ? `<div class="hist-item-name">${escapeHtml(ev.ItemName)}</div>` : '';

        let fromToHtml = '';
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          const fromRL = escapeHtml(ev.FromRackLayer || '-');
          const toRL = escapeHtml(ev.ToRackLayer || '-');
          fromToHtml = `<span class="hist-from">${fromRL}</span> → <span class="hist-to">${toRL}</span>`;
        } else if (isMove(ev.ActionKey) || isInOut(ev.ActionKey)) {
          const fromC = escapeHtml(ev.FromCompanyName || '-');
          const toC = escapeHtml(ev.ToCompanyName || '-');
          fromToHtml = `<span class="hist-from">${fromC}</span> → <span class="hist-to">${toC}</span>`;
        } else {
          const dest = escapeHtml(ev.ToCompanyName || '-');
          fromToHtml = dest;
        }

        const notesHTML = escapeHtml(ev.Notes || '');
        const handlerHTML = escapeHtml(ev.Handler || '-');

        const itemTypeClass = ev.ItemType === 'mold' ? 'hist-row-mold' : 'hist-row-cutter';
        const clickAttr = (ev.MoldID || ev.CutterID) ? ` data-eventid="${escapeHtml(ev.EventID)}"` : '';

        return `
          <tr class="hist-row ${itemTypeClass}"${clickAttr}>
            <td class="hist-col-date">
              <div class="hist-date-part">${escapeHtml(datePart)}</div>
              <div class="hist-time-part">${escapeHtml(timePart)}</div>
            </td>
            <td class="hist-col-item">
              ${itemCodeHTML}
              ${itemNameHTML}
            </td>
            <td class="hist-col-action">
              <span class="hist-badge ${meta.badgeClass}">
                <span class="ja">${escapeHtml(meta.ja)}</span>
                <span class="vi">${escapeHtml(meta.vi)}</span>
              </span>
            </td>
            <td class="hist-col-fromto">${fromToHtml}</td>
            <td class="hist-col-notes">${notesHTML}</td>
            <td class="hist-col-handler">${handlerHTML}</td>
          </tr>
        `;
      }).join('');

      this.els.tableBody.innerHTML = rows;

      // bind row click to open detail
      this.els.tableBody.querySelectorAll('tr[data-eventid]').forEach(tr => {
        tr.addEventListener('click', () => {
          const eid = tr.getAttribute('data-eventid');
          this.openDetailForEventId(eid);
        });
      });
    },

    renderPagination() {
      if (!this.els.pagination) return;

      const total = this.state.totalPages;
      const current = this.state.currentPage;

      if (total <= 1) {
        this.els.pagination.innerHTML = '';
        return;
      }

      let html = '';

      // prev
      if (current > 1) {
        html += `<button class="hist-page-btn" data-page="${current - 1}">‹</button>`;
      } else {
        html += `<button class="hist-page-btn" disabled>‹</button>`;
      }

      // pages
      const range = 3;
      let start = Math.max(1, current - range);
      let end = Math.min(total, current + range);

      if (start > 1) {
        html += `<button class="hist-page-btn" data-page="1">1</button>`;
        if (start > 2) html += `<span class="hist-page-ellipsis">...</span>`;
      }

      for (let i = start; i <= end; i++) {
        const cls = i === current ? 'hist-page-btn active' : 'hist-page-btn';
        html += `<button class="${cls}" data-page="${i}">${i}</button>`;
      }

      if (end < total) {
        if (end < total - 1) html += `<span class="hist-page-ellipsis">...</span>`;
        html += `<button class="hist-page-btn" data-page="${total}">${total}</button>`;
      }

      // next
      if (current < total) {
        html += `<button class="hist-page-btn" data-page="${current + 1}">›</button>`;
      } else {
        html += `<button class="hist-page-btn" disabled>›</button>`;
      }

      this.els.pagination.innerHTML = html;

      this.els.pagination.querySelectorAll('.hist-page-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = parseInt(btn.getAttribute('data-page'), 10);
          if (page && page !== this.state.currentPage) {
            this.state.currentPage = page;
            this.applyFiltersAndRender(false);
          }
        });
      });
    },

    updateSummary() {
      if (!this.els.summaryEl) return;

      const total = this.state.allEvents.length;
      const filtered = this.state.filteredEvents.length;

      const dateFrom = this.state.filters.dateFrom || '-';
      const dateTo = this.state.filters.dateTo || '-';
      const period = `${dateFrom} ～ ${dateTo}`;

      const text = `表示 ${filtered} / 全${total} 件（期間: ${period}） / Hiển thị ${filtered} / tổng ${total}`;
      this.els.summaryEl.textContent = text;
    },

    setSummaryText(text) {
      if (this.els.summaryEl) this.els.summaryEl.textContent = text;
    },

    updateStats() {
      const filtered = this.state.filteredEvents;

      const totalCount = filtered.length;
      let auditCount = 0;
      let moveCount = 0;
      let inOutCount = 0;

      filtered.forEach(ev => {
        if (ev.ActionKey === ACTION.AUDIT) auditCount++;
        if (isMove(ev.ActionKey)) moveCount++;
        if (isInOut(ev.ActionKey)) inOutCount++;
      });

      if (this.els.statTotal) this.els.statTotal.textContent = totalCount;
      if (this.els.statAudit) this.els.statAudit.textContent = auditCount;
      if (this.els.statMove) this.els.statMove.textContent = moveCount;
      if (this.els.statInOut) this.els.statInOut.textContent = inOutCount;
    },

    // -----------------------------------------------------------
    // DETAIL OPEN
    // -----------------------------------------------------------
    openDetailForEventId(eventId) {
      const ev = this.state.filteredEvents.find(e => e.EventID === eventId);
      if (!ev) return;

      const isMold = ev.ItemType === 'mold' || !!ev.MoldID;
      const itemId = isMold ? ev.MoldID : ev.CutterID;

      if (!itemId) return;

      // try DataManager first
      const dm = window.DataManager;
      let item = null;

      if (dm && dm.data) {
        if (isMold) {
          item = dm.data.molds.find(m => String(m.MoldID).trim() === String(itemId).trim());
        } else {
          item = dm.data.cutters.find(c => String(c.CutterID).trim() === String(itemId).trim());
        }
      }

      // fallback to master
      if (!item) {
        if (isMold) {
          item = this.state.master.moldsById.get(String(itemId).trim());
        } else {
          item = this.state.master.cuttersById.get(String(itemId).trim());
        }
      }

      if (!item) {
        console.warn('[HistoryView] Item not found for:', itemId);
        return;
      }

      // close history, open detail
      this.close();

      setTimeout(() => {
        if (typeof window.showDetail === 'function') {
          window.showDetail(item, isMold ? 'mold' : 'cutter');
        } else if (window.MobileDetailModal && typeof window.MobileDetailModal.open === 'function') {
          window.MobileDetailModal.open(item, isMold ? 'mold' : 'cutter');
        } else {
          console.warn('[HistoryView] No detail viewer found');
        }
      }, 100);
    },

    // -----------------------------------------------------------
    // EXPORT
    // -----------------------------------------------------------
    exportCsv() {
      const filtered = this.state.filteredEvents;
      if (!filtered.length) {
        alert('データがありません / Không có dữ liệu');
        return;
      }

      const BOM = '\uFEFF';
      let csv = BOM + '日時,コード,名称,種類,From,To,備考,担当\n';

      filtered.forEach(ev => {
        const dt = formatDateTime(ev.EventDate);
        const code = safeStr(ev.ItemCode);
        const name = safeStr(ev.ItemName);
        const meta = actionMeta(ev.ActionKey);
        const action = meta.ja + ' / ' + meta.vi;

        let fromVal = '';
        let toVal = '';

        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromVal = ev.FromRackLayer || '';
          toVal = ev.ToRackLayer || '';
        } else {
          fromVal = ev.FromCompanyName || '';
          toVal = ev.ToCompanyName || '';
        }

        const notes = safeStr(ev.Notes);
        const handler = safeStr(ev.Handler);

        const row = [dt, code, name, action, fromVal, toVal, notes, handler]
          .map(v => {
            const s = String(v).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(',');

        csv += row + '\n';
      });

      const dateFrom = this.state.filters.dateFrom || 'all';
      const dateTo = this.state.filters.dateTo || 'all';
      const filename = `history_${dateFrom}_${dateTo}.csv`;

      downloadTextFile(filename, csv, 'text/csv');
      console.log('[HistoryView] CSV exported:', filename);
    },

    print() {
      const filtered = this.state.filteredEvents;
      if (!filtered.length) {
        alert('データがありません / Không có dữ liệu');
        return;
      }

      const toPrint = filtered.slice(0, MAX_PRINT_ROWS);

      const rows = toPrint.map(ev => {
        const dt = formatDateTime(ev.EventDate);
        const [datePart, timePart] = splitDateTimeText(dt);
        const code = escapeHtml(ev.ItemCode || '');
        const name = escapeHtml(ev.ItemName || '');
        const meta = actionMeta(ev.ActionKey);
        const action = `${escapeHtml(meta.ja)} / ${escapeHtml(meta.vi)}`;

        let fromTo = '';
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromTo = `${escapeHtml(ev.FromRackLayer || '-')} → ${escapeHtml(ev.ToRackLayer || '-')}`;
        } else {
          fromTo = `${escapeHtml(ev.FromCompanyName || '-')} → ${escapeHtml(ev.ToCompanyName || '-')}`;
        }

        const notes = escapeHtml(ev.Notes || '');
        const handler = escapeHtml(ev.Handler || '');

        return `
          <tr>
            <td>${datePart}<br/><small>${timePart}</small></td>
            <td>${code}<br/><small>${name}</small></td>
            <td>${action}</td>
            <td>${fromTo}</td>
            <td>${notes}</td>
            <td>${handler}</td>
          </tr>
        `;
      }).join('');

      const dateFrom = this.state.filters.dateFrom || '-';
      const dateTo = this.state.filters.dateTo || '-';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>履歴印刷 / In lịch sử</title>
  <style>
    body { font-family: sans-serif; margin: 20px; font-size: 12px; }
    h2 { text-align: center; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    @media print {
      body { margin: 10px; }
    }
  </style>
</head>
<body>
  <h2>履歴 / Lịch sử (棚卸・入出庫・位置・出荷)</h2>
  <p style="text-align:center;">期間: ${escapeHtml(dateFrom)} ～ ${escapeHtml(dateTo)} | 件数: ${toPrint.length}</p>
  <table>
    <thead>
      <tr>
        <th>日時</th>
        <th>コード・名称</th>
        <th>種類</th>
        <th>From → To</th>
        <th>備考</th>
        <th>担当</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
      `;

      const w = window.open('', '_blank');
      if (!w) {
        alert('ポップアップがブロックされました / Popup bị chặn');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 300);

      console.log('[HistoryView] Print opened');
    },

    sendMail() {
      const filtered = this.state.filteredEvents;
      if (!filtered.length) {
        alert('データがありません / Không có dữ liệu');
        return;
      }

      const toSend = filtered.slice(0, MAX_MAIL_LINES);

      const dateFrom = this.state.filters.dateFrom || '-';
      const dateTo = this.state.filters.dateTo || '-';

      const subject = `履歴レポート / Báo cáo lịch sử (${dateFrom} ～ ${dateTo})`;

      let body = `履歴レポート / Báo cáo lịch sử\n`;
      body += `期間 / Kỳ: ${dateFrom} ～ ${dateTo}\n`;
      body += `件数 / Số lượng: ${toSend.length}\n`;
      body += `\n`;
      body += `---------------------------------------------------------------\n`;
      body += padRight('日時', 18) + ' | ';
      body += padRight('コード', 12) + ' | ';
      body += padRight('種類', 10) + ' | ';
      body += padRight('From → To', 24) + ' | ';
      body += padRight('担当', 10) + '\n';
      body += `---------------------------------------------------------------\n`;

      toSend.forEach(ev => {
        const dt = formatDateTime(ev.EventDate);
        const code = truncate(ev.ItemCode || '', 12);
        const meta = actionMeta(ev.ActionKey);
        const action = truncate(meta.ja, 10);

        let fromTo = '';
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromTo = `${ev.FromRackLayer || '-'} → ${ev.ToRackLayer || '-'}`;
        } else {
          fromTo = `${ev.FromCompanyName || '-'} → ${ev.ToCompanyName || '-'}`;
        }
        fromTo = truncate(fromTo, 24);

        const handler = truncate(ev.Handler || '', 10);

        body += padRight(dt, 18) + ' | ';
        body += padRight(code, 12) + ' | ';
        body += padRight(action, 10) + ' | ';
        body += padRight(fromTo, 24) + ' | ';
        body += padRight(handler, 10) + '\n';
      });

      body += `---------------------------------------------------------------\n`;
      body += `\n`;
      body += `YSD Packaging Co., Ltd.\n`;
      body += `本レポートは自動生成されました / Báo cáo này được tạo tự động.\n`;

      const emlContent = buildEml({
        to: FIXED_MAIL_TO,
        subject: subject,
        bodyText: body
      });

      const filename = `history_report_${dateFrom}_${dateTo}.eml`;
      downloadTextFile(filename, emlContent, 'message/rfc822');

      console.log('[HistoryView] EML mail file created:', filename);
    }
  };

  // ===========================================================
  // EXPOSE GLOBAL
  // ===========================================================
  window.HistoryView = {
    open: (opts) => HistoryView.open(opts),
    close: () => HistoryView.close(),
    init: () => HistoryView.init()
  };

  // auto init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistoryView.init());
  } else {
    HistoryView.init();
  }

  console.log('[HistoryView r7.1.3] Script loaded');
})();
