/**
 * =============================================================================
 * history-view-r7.1.4.js
 * 
 * Unified History View Module - Full-Featured
 * 
 * CHANGELOG r7.1.4 (2025-12-16):
 * ✅ FIX: Footer buttons hoạt động (ID binding đúng)
 * ✅ FIX: Toggle scroll trong filter actions (không che header)
 * ✅ FIX: Row click binding với tbody event listener
 * ✅ FIX: Detail modal mở overlay trên history (không đóng history)
 * ✅ FIX: Load destinations.csv, map DestinationName
 * ✅ FIX: From/To tách 2 cột riêng, màu khác nhau
 * ✅ FIX: Code màu xanh (mold), cam (cutter)
 * ✅ FEATURE: Compact columns, scroll lock/unlock
 * ✅ DEBUG: Extensive logging
 * 
 * Dependencies:
 * - DataManager (window.DataManager)
 * - MobileDetailModal (window.MobileDetailModal)
 * - Papa Parse (window.Papa)
 * 
 * Updated: 2025-12-16
 * =============================================================================
 */

(function() {
  'use strict';

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  const GITHUB_DATA_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  const USE_GITHUB_SOURCE_FOR_HISTORY = false;

  // ===========================================================================
  // CONSTANTS
  // ===========================================================================
  const ACTION = {
    ALL: 'ALL',
    AUDIT: 'AUDIT',
    CHECKIN: 'CHECKIN',
    CHECKOUT: 'CHECKOUT',
    LOCATION_CHANGE: 'LOCATION_CHANGE',
    SHIP_OUT: 'SHIP_OUT',
    SHIP_IN: 'SHIP_IN',
    SHIP_MOVE: 'SHIP_MOVE',
    OTHER: 'OTHER'
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
      case ACTION.OTHER:
      default:
        return { ja: 'その他', vi: 'Khác', badgeClass: 'hist-badge-other' };
    }
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================
  function safeStr(val) {
    return (val == null || val === undefined) ? '' : String(val);
  }

  function toLower(str) {
    return safeStr(str).toLowerCase();
  }

  function normalizeSpaces(str) {
    return safeStr(str).replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return safeStr(text).replace(/[&<>"']/g, m => map[m]);
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function getDateKey(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return { date: '-', time: '-' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: '-', time: '-' };

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');

    return {
      date: `${y}/${m}/${day}`,
      time: `${hh}:${mm}`
    };
  }

  function parseCsv(csvText) {
    if (!window.Papa) {
      console.warn('[HistoryView] Papa Parse not available');
      return [];
    }
    const result = window.Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });
    return result.data || [];
  }

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.text();
  }

  function isMove(actionKey) {
    return actionKey === ACTION.SHIP_MOVE;
  }

  function isInOut(actionKey) {
    return actionKey === ACTION.SHIP_IN || actionKey === ACTION.SHIP_OUT;
  }

  // ===========================================================================
  // ACTION KEY MAPPING
  // ===========================================================================
  function toActionKeyFromStatus(row) {
    const status = safeStr(row.Status).trim();
    const auditType = safeStr(row.AuditType).trim();
    const notes = safeStr(row.Notes).trim().toLowerCase();

    // AUDIT
    if (auditType.toLowerCase() === 'audit' || status.toLowerCase() === 'audit') {
      return ACTION.AUDIT;
    }

    // CHECKIN
    if (status.toLowerCase() === 'in' || status.toLowerCase() === 'checkin') {
      return ACTION.CHECKIN;
    }

    // CHECKOUT
    if (status.toLowerCase() === 'out' || status.toLowerCase() === 'checkout') {
      return ACTION.CHECKOUT;
    }

    // SHIP_IN (返却入庫)
    if (notes.includes('返却') || notes.includes('shipin') || notes.includes('return')) {
      return ACTION.SHIP_IN;
    }

    // SHIP_OUT (出荷)
    if (notes.includes('出荷') || notes.includes('shipout') || notes.includes('ship out')) {
      return ACTION.SHIP_OUT;
    }

    console.log('[toActionKeyFromStatus] Fallback to OTHER:', {
      Status: row.Status,
      AuditType: row.AuditType,
      Notes: row.Notes
    });

    return ACTION.OTHER;
  }

  function toActionKeyFromShiplog(row) {
    const type = safeStr(row.Type).trim();
    const notes = safeStr(row.Notes).trim().toLowerCase();

    if (type === 'OUT') return ACTION.SHIP_OUT;
    if (type === 'IN') return ACTION.SHIP_IN;
    if (type === 'MOVE') return ACTION.SHIP_MOVE;

    if (notes.includes('出荷') || notes.includes('ship')) return ACTION.SHIP_OUT;
    if (notes.includes('返却') || notes.includes('return')) return ACTION.SHIP_IN;
    if (notes.includes('移動') || notes.includes('move')) return ACTION.SHIP_MOVE;

    return ACTION.SHIP_OUT;
  }

  // ===========================================================================
  // MAIN MODULE
  // ===========================================================================
  const HistoryView = {
    state: {
      initialized: false,
      allEvents: [],
      filteredEvents: [],
      currentPage: 1,
      pageSize: 20,
      sortKey: 'date',
      sortDir: 'desc',
      lastPreset: null,
      master: {
        moldsById: new Map(),
        cuttersById: new Map()
      }
    },

    els: {},

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    init() {
      if (this.state.initialized) return;

      console.log('[HistoryView r7.1.4] Initializing...');

      this.createModal();
      this.cacheDOMElements();
      this.bindTriggers();
      this.bindInsideEvents();
      this.applyDefaultDateRange();

      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub();
      } else {
        this.ensureHistoryEventsBuilt();
      }

      this.state.initialized = true;
      console.log('[HistoryView r7.1.4] Initialized');
    },

    // =========================================================================
    // DATA LOADING
    // =========================================================================
    async loadHistoryFromGithub() {
      console.log('[HistoryView] Loading history from GitHub...');

      const base = GITHUB_DATA_BASE_URL;
      const urls = {
        location: base + 'locationlog.csv',
        ship: base + 'shiplog.csv',
        status: base + 'statuslogs.csv',
        molds: base + 'molds.csv',
        cutters: base + 'cutters.csv',
        companies: base + 'companies.csv',
        employees: base + 'employees.csv',
        destinations: base + 'destinations.csv'
      };

      try {
        const [
          locationText,
          shipText,
          statusText,
          moldsText,
          cuttersText,
          companiesText,
          employeesText,
          destinationsText
        ] = await Promise.all([
          fetchText(urls.location),
          fetchText(urls.ship),
          fetchText(urls.status),
          fetchText(urls.molds),
          fetchText(urls.cutters),
          fetchText(urls.companies),
          fetchText(urls.employees),
          fetchText(urls.destinations)
        ]);

        const locationlog = parseCsv(locationText);
        const shiplog = parseCsv(shipText);
        const statuslogs = parseCsv(statusText);
        const molds = parseCsv(moldsText);
        const cutters = parseCsv(cuttersText);
        const companies = parseCsv(companiesText);
        const employees = parseCsv(employeesText);
        const destinations = parseCsv(destinationsText);

        this.buildHistoryEvents(locationlog, shiplog, statuslogs, molds, cutters, companies, employees, destinations);

        console.log('[HistoryView] ✅ Data loaded from GitHub');
      } catch (err) {
        console.error('[HistoryView] ❌ Failed to load from GitHub:', err);
      }
    },

    ensureHistoryEventsBuilt() {
      console.log('[HistoryView] Building from DataManager...');

      const dm = window.DataManager;
      if (!dm || !dm.data) {
        console.warn('[HistoryView] DataManager not ready');
        return;
      }

      const { locationlog, shiplog, statuslogs, molds, cutters, companies, employees, destinations } = dm.data;

      this.buildHistoryEvents(
        locationlog || [],
        shiplog || [],
        statuslogs || [],
        molds || [],
        cutters || [],
        companies || [],
        employees || [],
        destinations || []
      );

      console.log('[HistoryView] ✅ Events built from DataManager');
    },

    // =========================================================================
    // BUILD HISTORY EVENTS
    // =========================================================================
    buildHistoryEvents(locationlog, shiplog, statuslogs, molds, cutters, companies, employees, destinations) {
      console.log('[HistoryView] Building history events...', {
        locationlog: locationlog.length,
        shiplog: shiplog.length,
        statuslogs: statuslogs.length,
        molds: molds.length,
        cutters: cutters.length,
        companies: companies.length,
        employees: employees.length,
        destinations: destinations.length
      });

      // Build maps
      const moldsById = new Map();
      (molds || []).forEach(m => {
        const id = String(m.MoldID || '').trim();
        if (id) moldsById.set(id, m);
      });

      const cuttersById = new Map();
      (cutters || []).forEach(c => {
        const id = String(c.CutterID || '').trim();
        if (id) cuttersById.set(id, c);
      });

      const companiesById = new Map();
      (companies || []).forEach(c => {
        const id = String(c.CompanyID || '').trim();
        if (id) companiesById.set(id, c);
      });

      const employeesById = new Map();
      (employees || []).forEach(e => {
        const id = String(e.EmployeeID || '').trim();
        if (id) employeesById.set(id, e);
      });

      // ✅ Destinations map
      const destinationsById = new Map();
      (destinations || []).forEach(d => {
        const id = String(d.DestinationID || '').trim();
        if (id) destinationsById.set(id, d);
      });

      // Store for fallback detail open
      this.state.master.moldsById = moldsById;
      this.state.master.cuttersById = cuttersById;

      const events = [];

      // Helper function
      const getCompanyName = (cid) => {
        if (!cid) return '';
        const c = companiesById.get(String(cid).trim());
        return c ? (c.CompanyName || c.Name || cid) : cid;
      };

      const getEmployeeName = (eid) => {
        if (!eid) return '';
        const e = employeesById.get(String(eid).trim());
        return e ? (e.Name || e.EmployeeName || eid) : eid;
      };

      // 1) locationlog => LOCATION_CHANGE
      (locationlog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();

        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;

        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);

        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';

        const dateStr = safeStr(row.Timestamp || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);

        events.push({
          EventID: 'LOC' + safeStr(row.LocationLogID || ''),
          Source: 'locationlog',
          ActionKey: ACTION.LOCATION_CHANGE,

          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),

          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',

          EventDate: dateStr,
          EventDateKey: getDateKey(dateStr),

          FromRackLayer: safeStr(row.OldRackLayerDisplay || row.OldRackLayer || '').trim(),
          ToRackLayer: safeStr(row.NewRackLayerDisplay || row.NewRackLayer || '').trim(),

          FromCompanyID: '',
          ToCompanyID: '',
          FromCompanyName: '',
          ToCompanyName: '',

          Notes: normalizeSpaces(safeStr(row.Notes || '').trim()),

          HandlerID: empId,
          Handler: handler
        });
      });

      // 2) shiplog => SHIP_OUT / SHIP_IN / SHIP_MOVE
      (shiplog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();

        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;

        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);

        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';

        const dateStr = safeStr(row.ShipDate || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);

        const actionKey = toActionKeyFromShiplog(row);

        const fromCID = safeStr(row.FromCompanyID || '').trim();
        const toCID = safeStr(row.ToCompanyID || row.CompanyID || '').trim();

        events.push({
          EventID: 'SHIP' + safeStr(row.ShipLogID || ''),
          Source: 'shiplog',
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

          FromCompanyID: fromCID,
          ToCompanyID: toCID,
          FromCompanyName: getCompanyName(fromCID),
          ToCompanyName: getCompanyName(toCID),

          Notes: normalizeSpaces(safeStr(row.Notes || '').trim()),

          HandlerID: empId,
          Handler: handler
        });
      });

      // 3) statuslogs => AUDIT / CHECKIN / CHECKOUT / SHIP_IN / SHIP_OUT / OTHER
      (statuslogs || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();

        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;

        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);

        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';

        const dateStr = safeStr(row.Timestamp || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);

        const actionKey = toActionKeyFromStatus(row);

        const destId = safeStr(row.DestinationID || row.DestinationId || '').trim();

        // ✅ FIX: Lấy DestinationName từ destinations.csv
        let destLabel = '';
        if (destId) {
          const dest = destinationsById.get(destId);
          destLabel = dest ? (dest.DestinationName || destId) : destId;
        }

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

      this.state.allEvents = events;
      console.log('[HistoryView r7.1.4] events built:', events.length);
    },
    // =========================================================================
    // CREATE MODAL HTML
    // =========================================================================
    createModal() {
      const html = `
    <div id="history-view-root" class="hist-root">
      <div class="hist-backdrop" id="history-backdrop"></div>
      <div class="hist-dialog" id="history-dialog">
        
        <!-- HEADER -->
        <div class="hist-header" id="history-header">
          <div class="hist-title">
            <div class="ja">履歴</div>
            <div class="vi">Lịch sử (履歴・入出荷・位置・出荷)</div>
          </div>
          <button class="hist-close" id="history-close-btn" aria-label="Close">&times;</button>
        </div>

        <!-- TOP INFO (Summary + Stats) -->
        <div class="hist-topinfo">
          <div class="hist-summary" id="history-summary">
            表示 120 / 全1609 件 (期間: 2025-11-16 ~ 2025-12-16) / Hiển thị 120 / tổng 1609
          </div>
          <div class="hist-stats">
            <!-- 総履歴 -->
            <div class="hist-stat-card">
              <div class="hist-stat-icon total">総</div>
              <div>
                <div class="hist-stat-label">総履歴<br>Tổng</div>
                <div class="hist-stat-value" id="history-stat-total">120</div>
              </div>
            </div>
            <!-- 棚卸 -->
            <div class="hist-stat-card">
              <div class="hist-stat-icon audit">棚</div>
              <div>
                <div class="hist-stat-label">棚卸<br>Kiểm kê</div>
                <div class="hist-stat-value" id="history-stat-audit">20</div>
              </div>
            </div>
            <!-- 位置変更 -->
            <div class="hist-stat-card">
              <div class="hist-stat-icon move">位</div>
              <div>
                <div class="hist-stat-label">位置変更<br>Di chuyển</div>
                <div class="hist-stat-value" id="history-stat-move">63</div>
              </div>
            </div>
            <!-- 入出庫 -->
            <div class="hist-stat-card">
              <div class="hist-stat-icon io">出</div>
              <div>
                <div class="hist-stat-label">入出庫<br>In/Out</div>
                <div class="hist-stat-value" id="history-stat-io">7</div>
              </div>
            </div>
          </div>
        </div>

        <!-- BODY -->
        <div class="hist-body">
          
          <!-- FILTERS -->
          <div class="hist-filters" id="history-filters">
            <div class="hist-filter-grid">
              <!-- 期間 (始) -->
              <div class="hist-field" style="grid-column: span 2;">
                <label>期間（始）<span class="vi">Từ ngày</span></label>
                <input type="date" class="hist-input" id="history-date-from" />
              </div>
              <!-- 期間（至） -->
              <div class="hist-field" style="grid-column: span 2;">
                <label>期間（至）<span class="vi">Đến ngày</span></label>
                <input type="date" class="hist-input" id="history-date-to" />
              </div>
              <!-- 種類 (詳細) -->
              <div class="hist-field" style="grid-column: span 2;">
                <label>種類 (詳細) <span class="vi">Loại (chi tiết)</span></label>
                <select class="hist-select" id="history-action-select">
                  <option value="">すべて / Tất cả</option>
                  <option value="AUDIT">棚卸 / Kiểm kê</option>
                  <option value="CHECKIN">入庫 / Check-in</option>
                  <option value="CHECKOUT">出庫 / Check-out</option>
                  <option value="LOCATION_CHANGE">位置変更 / Đổi vị trí</option>
                  <option value="SHIP_OUT">出荷 / Xuất kho</option>
                  <option value="SHIP_IN">返却入庫 / Trả về</option>
                  <option value="SHIP_MOVE">会社間移動 / Chuyển công ty</option>
                  <option value="OTHER">その他 / Khác</option>
                </select>
              </div>
              <!-- 担当者 -->
              <div class="hist-field" style="grid-column: span 2;">
                <label>担当者 <span class="vi">Nhân viên</span></label>
                <select class="hist-select" id="history-employee-select">
                  <option value="">すべて / Tất cả</option>
                </select>
              </div>
              <!-- ギア・ラック -->
              <div class="hist-field" style="grid-column: span 2;">
                <label>ギア・ラック <span class="vi">Giá-Tầng</span></label>
                <input type="text" class="hist-input" id="history-rack-input" placeholder="例: 112, 3-2, Rack 1" />
              </div>
              <!-- 会社 -->
              <div class="hist-field" style="grid-column: span 2;">
                <label>会社 <span class="vi">Công ty</span></label>
                <input type="text" class="hist-input" id="history-company-input" placeholder="ID, コード, 名称, tên, Mã, tên công ty" />
              </div>
              <!-- 検索 -->
              <div class="hist-field" style="grid-column: span 12;">
                <label>検索 <span class="vi">Tìm kiếm</span></label>
                <input type="text" class="hist-input" id="history-keyword-input" placeholder="ID, コード, 名称, 備考 / Mã, tên, ghi chú" />
              </div>
            </div>

            <!-- ✅ Filter Actions: scroll toggle đầu tiên -->
            <div class="hist-filter-actions">
              <button class="hist-btn hist-btn-secondary" id="history-scroll-toggle" title="横スクロール / Scroll ngang">
                <span id="history-scroll-icon">🔒</span> Lock
              </button>
              <button class="hist-btn hist-btn-success" id="history-refresh-btn">更新 / Refresh</button>
              <button class="hist-btn" id="history-clear-btn">クリア / Xóa lọc</button>
              <button class="hist-btn hist-btn-primary" id="history-apply-btn">適用 / Áp dụng</button>
            </div>
          </div>

          <!-- TABLE -->
          <div class="hist-table-wrap" id="history-table-wrap">
            <table class="hist-table">
              <thead>
                <tr>
                  <th class="sortable hist-col-date" data-sort-key="date">日時<br><span style="font-size:9px;">Giờ</span></th>
                  <th class="sortable hist-col-item" data-sort-key="item">コード・名称<br><span style="font-size:9px;">Tên</span></th>
                  <th class="sortable hist-col-action" data-sort-key="action">種類<br><span style="font-size:9px;">Loại</span></th>
                  <th class="sortable hist-col-from" data-sort-key="from">出荷元<br><span style="font-size:9px;">Gửi</span></th>
                  <th class="sortable hist-col-to" data-sort-key="to">出荷先<br><span style="font-size:9px;">Nhận</span></th>
                  <th class="sortable hist-col-notes" data-sort-key="notes">備考<br><span style="font-size:9px;">Ghi chú</span></th>
                  <th class="sortable hist-col-handler" data-sort-key="handler">担当<br><span style="font-size:9px;">NV</span></th>
                </tr>
              </thead>
              <tbody id="history-table-body"></tbody>
            </table>
          </div>

          <!-- PAGINATION -->
          <div class="hist-pagination" id="history-pagination">
            <div class="hist-pagination-inner"></div>
          </div>

        </div>

        <!-- FOOTER: 4 buttons grid -->
        <div class="hist-footer">
          <button class="hist-btn" id="history-cancel-btn">閉じる</button>
          <button class="hist-btn" id="history-export-btn">CSV出力</button>
          <button class="hist-btn" id="history-print-btn">印刷</button>
          <button class="hist-btn hist-btn-primary" id="history-mail-btn">メール送信</button>
        </div>

      </div>
    </div>
      `;

      const div = document.createElement('div');
      div.innerHTML = html.trim();
      document.body.appendChild(div.firstElementChild);
    },

    // =========================================================================
    // CACHE DOM ELEMENTS
    // =========================================================================
    cacheDOMElements() {
      this.els.root = document.getElementById('history-view-root');
      this.els.dialog = document.getElementById('history-dialog');
      this.els.backdrop = document.getElementById('history-backdrop');
      this.els.header = document.getElementById('history-header');
      this.els.closeBtn = document.getElementById('history-close-btn');

      this.els.summaryEl = document.getElementById('history-summary');
      this.els.statTotal = document.getElementById('history-stat-total');
      this.els.statAudit = document.getElementById('history-stat-audit');
      this.els.statMove = document.getElementById('history-stat-move');
      this.els.statIO = document.getElementById('history-stat-io');

      this.els.filtersWrap = document.getElementById('history-filters');
      this.els.dateFrom = document.getElementById('history-date-from');
      this.els.dateTo = document.getElementById('history-date-to');
      this.els.actionSelect = document.getElementById('history-action-select');
      this.els.employeeSelect = document.getElementById('history-employee-select');
      this.els.rackInput = document.getElementById('history-rack-input');
      this.els.companyInput = document.getElementById('history-company-input');
      this.els.keywordInput = document.getElementById('history-keyword-input');

      this.els.applyBtn = document.getElementById('history-apply-btn');
      this.els.clearBtn = document.getElementById('history-clear-btn');
      this.els.refreshBtn = document.getElementById('history-refresh-btn');

      this.els.tableWrap = document.getElementById('history-table-wrap');
      this.els.tableHead = document.querySelector('#history-table-wrap thead');
      this.els.tableBody = document.querySelector('#history-table-wrap tbody');

      this.els.paginationWrap = document.getElementById('history-pagination');

      this.els.cancelBtn = document.getElementById('history-cancel-btn');
      this.els.exportBtn = document.getElementById('history-export-btn');
      this.els.printBtn = document.getElementById('history-print-btn');
      this.els.mailBtn = document.getElementById('history-mail-btn');

      // ✅ DEBUG: Log cached elements
      console.log('[HistoryView] DOM elements cached:', {
        tableWrap: !!this.els.tableWrap,
        tableHead: !!this.els.tableHead,
        tableBody: !!this.els.tableBody,
        cancelBtn: !!this.els.cancelBtn,
        exportBtn: !!this.els.exportBtn,
        printBtn: !!this.els.printBtn,
        mailBtn: !!this.els.mailBtn
      });
    },

    // =========================================================================
    // BIND TRIGGERS (external buttons to open modal)
    // =========================================================================
    bindTriggers() {
      const triggers = document.querySelectorAll('[data-history-view-trigger]');
      console.log('[HistoryView] triggers:', triggers.length);

      triggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const preset = btn.getAttribute('data-preset') || 'all';
          this.open(preset);
        });
      });
    },

    // =========================================================================
    // BIND INSIDE EVENTS
    // =========================================================================
    bindInsideEvents() {
      // Close buttons
      if (this.els.closeBtn) {
        this.els.closeBtn.addEventListener('click', () => this.close());
      }
      if (this.els.backdrop) {
        this.els.backdrop.addEventListener('click', () => this.close());
      }
      if (this.els.cancelBtn) {
        this.els.cancelBtn.addEventListener('click', () => this.close());
      }

      // Filter actions
      if (this.els.applyBtn) {
        this.els.applyBtn.addEventListener('click', () => this.applyFiltersAndRender(true));
      }
      if (this.els.clearBtn) {
        this.els.clearBtn.addEventListener('click', () => this.clearFilters());
      }
      if (this.els.refreshBtn) {
        this.els.refreshBtn.addEventListener('click', () => this.refreshData());
      }

      // Table sorting
      if (this.els.tableHead) {
        this.els.tableHead.addEventListener('click', e => {
          const th = e.target.closest('th.sortable');
          if (!th) return;
          const key = th.getAttribute('data-sort-key') || 'date';
          this.toggleSort(key);
          this.applyFiltersAndRender(false);
        });
      }

      // ✅ FIX: Click vào row để mở detail modal
      if (this.els.tableBody) {
        this.els.tableBody.addEventListener('click', e => {
          const row = e.target.closest('tr[data-eventid]');
          if (!row) {
            console.log('[HistoryView] Click outside row');
            return;
          }
          
          const eventId = row.getAttribute('data-eventid');
          console.log('[HistoryView] Row clicked, eventId:', eventId);
          
          if (eventId) {
            this.openDetailForEventId(eventId);
          } else {
            console.warn('[HistoryView] Row has no eventId');
          }
        });
      } else {
        console.error('[HistoryView] ❌ tableBody not found in bindInsideEvents!');
      }

      // ✅ Toggle scroll lock
      const scrollToggle = document.getElementById('history-scroll-toggle');
      const tableWrap = this.els.tableWrap;
      if (scrollToggle && tableWrap) {
        scrollToggle.addEventListener('click', (e) => {
          e.preventDefault();
          const isLocked = !tableWrap.classList.contains('scroll-unlocked');
          
          if (isLocked) {
            // Unlock
            tableWrap.classList.add('scroll-unlocked');
            scrollToggle.classList.add('unlocked');
            scrollToggle.innerHTML = '<span id="history-scroll-icon">🔓</span> Unlock';
            console.log('[HistoryView] Scroll unlocked');
          } else {
            // Lock
            tableWrap.classList.remove('scroll-unlocked');
            scrollToggle.classList.remove('unlocked');
            scrollToggle.innerHTML = '<span id="history-scroll-icon">🔒</span> Lock';
            console.log('[HistoryView] Scroll locked');
          }
        });
      }

      // ✅ Footer buttons with debug logs
      console.log('[HistoryView] Binding footer buttons:', {
        cancelBtn: !!this.els.cancelBtn,
        exportBtn: !!this.els.exportBtn,
        printBtn: !!this.els.printBtn,
        mailBtn: !!this.els.mailBtn
      });

      if (this.els.exportBtn) {
        this.els.exportBtn.addEventListener('click', () => {
          console.log('[HistoryView] Export CSV clicked');
          this.exportCsv();
        });
      }

      if (this.els.printBtn) {
        this.els.printBtn.addEventListener('click', () => {
          console.log('[HistoryView] Print clicked');
          this.print();
        });
      }

      if (this.els.mailBtn) {
        this.els.mailBtn.addEventListener('click', () => {
          console.log('[HistoryView] Mail clicked');
          this.sendMail();
        });
      }

      // Debounced keyword search
      if (this.els.keywordInput) {
        const debouncedApply = debounce(() => this.applyFiltersAndRender(true), 400);
        this.els.keywordInput.addEventListener('input', debouncedApply);
      }
    },

    // =========================================================================
    // OPEN MODAL
    // =========================================================================
    open(preset) {
      console.log('[HistoryView] opened, preset:', preset);

      this.state.lastPreset = preset || 'all';

      // ✅ ĐỒNG NHẤT VỚI PHIÊN BẢN CŨ: Dùng DataManager
      if (this.state.allEvents.length === 0) {
        this.ensureHistoryEventsBuilt(); // Dùng data có sẵn
      }
      
      this.populateEmployeeDropdown();
      this.applyPreset(preset);
      this.applyFiltersAndRender(true);

      if (this.els.root) {
        this.els.root.classList.add('hist-open');
      }
    },

    // =========================================================================
    // CLOSE MODAL
    // =========================================================================
    close() {
      console.log('[HistoryView] closed');
      if (this.els.root) {
        this.els.root.classList.remove('hist-open');
      }
    },

    // =========================================================================
    // PRESET FILTERS
    // =========================================================================
    applyPreset(preset) {
      console.log('[HistoryView] Applying preset:', preset);

      // Default date range
      this.applyDefaultDateRange();

      // Clear other filters
      if (this.els.actionSelect) this.els.actionSelect.value = '';
      if (this.els.employeeSelect) this.els.employeeSelect.value = '';
      if (this.els.rackInput) this.els.rackInput.value = '';
      if (this.els.companyInput) this.els.companyInput.value = '';
      if (this.els.keywordInput) this.els.keywordInput.value = '';

      // Apply preset-specific filters
      if (preset === 'audit') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.AUDIT;
      } else if (preset === 'location') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.LOCATION_CHANGE;
      } else if (preset === 'shipout') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.SHIP_OUT;
      } else if (preset === 'shipin') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.SHIP_IN;
      } else if (preset === 'shipmove') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.SHIP_MOVE;
      } else if (preset === 'checkin') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.CHECKIN;
      } else if (preset === 'checkout') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.CHECKOUT;
      }
      // 'all' => no filter
    },

    applyDefaultDateRange() {
      const today = new Date();
      const fromDate = new Date(today);
      fromDate.setMonth(fromDate.getMonth() - 1);

      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = today.toISOString().split('T')[0];

      if (this.els.dateFrom) this.els.dateFrom.value = fromStr;
      if (this.els.dateTo) this.els.dateTo.value = toStr;
    },

    // =========================================================================
    // CLEAR FILTERS
    // =========================================================================
    clearFilters() {
      console.log('[HistoryView] Clearing filters');

      this.applyDefaultDateRange();

      if (this.els.actionSelect) this.els.actionSelect.value = '';
      if (this.els.employeeSelect) this.els.employeeSelect.value = '';
      if (this.els.rackInput) this.els.rackInput.value = '';
      if (this.els.companyInput) this.els.companyInput.value = '';
      if (this.els.keywordInput) this.els.keywordInput.value = '';

      this.applyFiltersAndRender(true);
    },

    // =========================================================================
    // REFRESH DATA
    // =========================================================================
    refreshData() {
      console.log('[HistoryView] Refreshing data...');

      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub().then(() => {
          this.populateEmployeeDropdown();
          this.applyFiltersAndRender(true);
        });
      } else {
        this.ensureHistoryEventsBuilt();
        this.populateEmployeeDropdown();
        this.applyFiltersAndRender(true);
      }
    },

    // =========================================================================
    // POPULATE EMPLOYEE DROPDOWN
    // =========================================================================
    populateEmployeeDropdown() {
      if (!this.els.employeeSelect) return;

      const empMap = new Map();
      this.state.allEvents.forEach(ev => {
        const hid = safeStr(ev.HandlerID).trim();
        const hname = safeStr(ev.Handler).trim();
        if (hid && !empMap.has(hid)) {
          empMap.set(hid, hname || hid);
        }
      });

      const sorted = Array.from(empMap.entries()).sort((a, b) => {
        return a[1].localeCompare(b[1], 'ja');
      });

      let html = '<option value="">すべて / Tất cả</option>';
      sorted.forEach(([id, name]) => {
        html += `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
      });

      this.els.employeeSelect.innerHTML = html;
    },
    // =========================================================================
    // APPLY FILTERS AND RENDER
    // =========================================================================
    applyFiltersAndRender(resetPage) {
      console.log('[HistoryView] applyFiltersAndRender, resetPage:', resetPage);

      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      const actionKey = this.els.actionSelect ? this.els.actionSelect.value : '';
      const employeeId = this.els.employeeSelect ? this.els.employeeSelect.value : '';
      const rackText = this.els.rackInput ? toLower(this.els.rackInput.value.trim()) : '';
      const companyText = this.els.companyInput ? toLower(this.els.companyInput.value.trim()) : '';
      const keyword = this.els.keywordInput ? toLower(this.els.keywordInput.value.trim()) : '';

      let filtered = this.state.allEvents.slice();

      // Date range
      if (dateFrom) {
        filtered = filtered.filter(ev => {
          const evKey = ev.EventDateKey || '';
          return evKey >= dateFrom;
        });
      }
      if (dateTo) {
        filtered = filtered.filter(ev => {
          const evKey = ev.EventDateKey || '';
          return evKey <= dateTo;
        });
      }

      // Action type
      if (actionKey) {
        filtered = filtered.filter(ev => ev.ActionKey === actionKey);
      }

      // Employee
      if (employeeId) {
        filtered = filtered.filter(ev => {
          return safeStr(ev.HandlerID).trim() === employeeId;
        });
      }

      // Rack
      if (rackText) {
        filtered = filtered.filter(ev => {
          const from = toLower(ev.FromRackLayer);
          const to = toLower(ev.ToRackLayer);
          return from.includes(rackText) || to.includes(rackText);
        });
      }

      // Company
      if (companyText) {
        filtered = filtered.filter(ev => {
          const fromCID = toLower(ev.FromCompanyID);
          const toCID = toLower(ev.ToCompanyID);
          const fromName = toLower(ev.FromCompanyName);
          const toName = toLower(ev.ToCompanyName);
          return fromCID.includes(companyText) || toCID.includes(companyText) ||
                 fromName.includes(companyText) || toName.includes(companyText);
        });
      }

      // Keyword
      if (keyword) {
        filtered = filtered.filter(ev => {
          const code = toLower(ev.ItemCode);
          const name = toLower(ev.ItemName);
          const notes = toLower(ev.Notes);
          const handler = toLower(ev.Handler);
          const fromCName = toLower(ev.FromCompanyName);
          const toCName = toLower(ev.ToCompanyName);
          return code.includes(keyword) || name.includes(keyword) || notes.includes(keyword) ||
                 handler.includes(keyword) || fromCName.includes(keyword) || toCName.includes(keyword);
        });
      }

      // Sort
      this.sortEvents(filtered);

      this.state.filteredEvents = filtered;

      if (resetPage) {
        this.state.currentPage = 1;
      }

      // Update summary and stats
      this.updateSummary();
      this.updateStats();

      // Render table
      this.renderTable();

      // Render pagination
      this.renderPagination();

      console.log('[HistoryView] Filtered:', filtered.length, 'of', this.state.allEvents.length);
    },

    // =========================================================================
    // SORTING
    // =========================================================================
    toggleSort(key) {
      if (this.state.sortKey === key) {
        this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.state.sortKey = key;
        this.state.sortDir = 'desc';
      }
      console.log('[HistoryView] Sort:', this.state.sortKey, this.state.sortDir);
    },

    sortEvents(events) {
      const key = this.state.sortKey;
      const dir = this.state.sortDir;

      events.sort((a, b) => {
        let valA, valB;

        if (key === 'date') {
          valA = a.EventDate || '';
          valB = b.EventDate || '';
        } else if (key === 'item') {
          valA = toLower(a.ItemCode);
          valB = toLower(b.ItemCode);
        } else if (key === 'action') {
          valA = a.ActionKey || '';
          valB = b.ActionKey || '';
        } else if (key === 'from') {
          valA = toLower(a.FromCompanyName || a.FromRackLayer || '');
          valB = toLower(b.FromCompanyName || b.FromRackLayer || '');
        } else if (key === 'to') {
          valA = toLower(a.ToCompanyName || a.ToRackLayer || '');
          valB = toLower(b.ToCompanyName || b.ToRackLayer || '');
        } else if (key === 'notes') {
          valA = toLower(a.Notes);
          valB = toLower(b.Notes);
        } else if (key === 'handler') {
          valA = toLower(a.Handler);
          valB = toLower(b.Handler);
        } else {
          valA = '';
          valB = '';
        }

        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    },

    // =========================================================================
    // UPDATE SUMMARY
    // =========================================================================
    updateSummary() {
      if (!this.els.summaryEl) return;

      const total = this.state.allEvents.length;
      const filtered = this.state.filteredEvents.length;

      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';

      let periodStr = '';
      if (dateFrom || dateTo) {
        periodStr = ` (期間: ${dateFrom || '...'} ~ ${dateTo || '...'})`;
      }

      const text = `表示 ${filtered} / 全${total} 件${periodStr} / Hiển thị ${filtered} / tổng ${total}`;
      this.els.summaryEl.textContent = text;
    },

    // =========================================================================
    // UPDATE STATS
    // =========================================================================
    updateStats() {
      const filtered = this.state.filteredEvents;

      const countAudit = filtered.filter(ev => ev.ActionKey === ACTION.AUDIT).length;
      const countCheckin = filtered.filter(ev => ev.ActionKey === ACTION.CHECKIN).length;
      const countCheckout = filtered.filter(ev => ev.ActionKey === ACTION.CHECKOUT).length;
      const countLocation = filtered.filter(ev => ev.ActionKey === ACTION.LOCATION_CHANGE).length;
      const countShipOut = filtered.filter(ev => ev.ActionKey === ACTION.SHIP_OUT).length;
      const countShipIn = filtered.filter(ev => ev.ActionKey === ACTION.SHIP_IN).length;
      const countShipMove = filtered.filter(ev => ev.ActionKey === ACTION.SHIP_MOVE).length;
      const countOther = filtered.filter(ev => ev.ActionKey === ACTION.OTHER).length;

      const countIO = countCheckin + countCheckout + countShipOut + countShipIn + countShipMove;

      if (this.els.statTotal) this.els.statTotal.textContent = filtered.length;
      if (this.els.statAudit) this.els.statAudit.textContent = countAudit;
      if (this.els.statMove) this.els.statMove.textContent = countLocation;
      if (this.els.statIO) this.els.statIO.textContent = countIO;
    },

    // =========================================================================
    // RENDER TABLE
    // =========================================================================
    renderTable() {
      console.log('[HistoryView] renderTable called, page:', this.state.currentPage);

      const tbody = this.els.tableBody;
      if (!tbody) {
        console.error('[HistoryView] ❌ tbody not found!');
        return;
      }

      const { currentPage, pageSize } = this.state;
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      const pageData = this.state.filteredEvents.slice(start, end);

      console.log('[HistoryView] Rendering rows:', pageData.length, 'Total filtered:', this.state.filteredEvents.length);

      if (pageData.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; padding:40px; color:#9ca3af;">
              データがありません / Không có dữ liệu
            </td>
          </tr>
        `;
        this.updateSortHeaderUI();
        return;
      }

      let html = '';
      pageData.forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);

        const itemCode = escapeHtml(ev.ItemCode);
        const itemName = escapeHtml(ev.ItemName);

        // ✅ Row class: mold or cutter
        const rowClass = ev.ItemType === 'mold' ? 'hist-row-mold' : 'hist-row-cutter';

        // From / To display
        let fromDisplay = '-';
        let toDisplay = '-';

        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromDisplay = escapeHtml(ev.FromRackLayer || '-');
          toDisplay = escapeHtml(ev.ToRackLayer || '-');
        } else if (isMove(ev.ActionKey)) {
          fromDisplay = escapeHtml(ev.FromCompanyName || '-');
          toDisplay = escapeHtml(ev.ToCompanyName || '-');
        } else if (isInOut(ev.ActionKey)) {
          if (ev.ActionKey === ACTION.SHIP_OUT) {
            fromDisplay = '-';
            toDisplay = escapeHtml(ev.ToCompanyName || '-');
          } else if (ev.ActionKey === ACTION.SHIP_IN) {
            fromDisplay = escapeHtml(ev.FromCompanyName || '-');
            toDisplay = '-';
          }
        } else {
          // AUDIT, CHECKIN, CHECKOUT, OTHER
          if (ev.ToCompanyName) {
            toDisplay = escapeHtml(ev.ToCompanyName);
          }
        }

        const notes = escapeHtml(ev.Notes || '-');
        const handler = escapeHtml(ev.Handler || '-');

        html += `
          <tr class="${rowClass}" data-eventid="${escapeHtml(ev.EventID)}">
            <td class="hist-col-date">
              <div class="hist-date-part">${escapeHtml(date)}</div>
              <div class="hist-time-part">${escapeHtml(time)}</div>
            </td>
            <td class="hist-col-item">
              <div class="hist-item-code">${itemCode}</div>
              <div class="hist-item-name">${itemName}</div>
            </td>
            <td class="hist-col-action">
              <div class="hist-badge ${meta.badgeClass}">
                <span class="ja">${escapeHtml(meta.ja)}</span>
                <span class="vi">${escapeHtml(meta.vi)}</span>
              </div>
            </td>
            <td class="hist-col-from">${fromDisplay}</td>
            <td class="hist-col-to">${toDisplay}</td>
            <td class="hist-col-notes">${notes}</td>
            <td class="hist-col-handler">${handler}</td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
      this.updateSortHeaderUI();
    },

    updateSortHeaderUI() {
      if (!this.els.tableHead) return;

      const ths = this.els.tableHead.querySelectorAll('th.sortable');
      ths.forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        const key = th.getAttribute('data-sort-key');
        if (key === this.state.sortKey) {
          if (this.state.sortDir === 'asc') {
            th.classList.add('sorted-asc');
          } else {
            th.classList.add('sorted-desc');
          }
        }
      });
    },

    // =========================================================================
    // PAGINATION
    // =========================================================================
    renderPagination() {
      const wrap = this.els.paginationWrap;
      if (!wrap) return;

      const inner = wrap.querySelector('.hist-pagination-inner');
      if (!inner) return;

      const total = this.state.filteredEvents.length;
      const pageSize = this.state.pageSize;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const current = this.state.currentPage;

      if (totalPages === 1) {
        inner.innerHTML = '';
        return;
      }

      let html = '';

      // Previous button
      html += `<button class="hist-page-btn" data-page="prev" ${current === 1 ? 'disabled' : ''}>«</button>`;

      // Page numbers with ellipsis
      const maxVisible = 7;
      let startPage = Math.max(1, current - Math.floor(maxVisible / 2));
      let endPage = Math.min(totalPages, startPage + maxVisible - 1);

      if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
      }

      if (startPage > 1) {
        html += `<button class="hist-page-btn" data-page="1">1</button>`;
        if (startPage > 2) {
          html += `<span class="hist-page-ellipsis">...</span>`;
        }
      }

      for (let i = startPage; i <= endPage; i++) {
        const active = i === current ? 'active' : '';
        html += `<button class="hist-page-btn ${active}" data-page="${i}">${i}</button>`;
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          html += `<span class="hist-page-ellipsis">...</span>`;
        }
        html += `<button class="hist-page-btn" data-page="${totalPages}">${totalPages}</button>`;
      }

      // Next button
      html += `<button class="hist-page-btn" data-page="next" ${current === totalPages ? 'disabled' : ''}>»</button>`;

      inner.innerHTML = html;

      // Bind click events
      inner.querySelectorAll('.hist-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.getAttribute('data-page');
          if (!page || btn.disabled) return;

          if (page === 'prev') {
            if (this.state.currentPage > 1) {
              this.state.currentPage--;
              this.renderTable();
              this.renderPagination();
            }
          } else if (page === 'next') {
            const totalPages = Math.ceil(this.state.filteredEvents.length / this.state.pageSize) || 1;
            if (this.state.currentPage < totalPages) {
              this.state.currentPage++;
              this.renderTable();
              this.renderPagination();
            }
          } else {
            const pageNum = parseInt(page, 10);
            if (!isNaN(pageNum) && pageNum >= 1) {
              this.state.currentPage = pageNum;
              this.renderTable();
              this.renderPagination();
            }
          }

          // Scroll to top of table
          if (this.els.tableWrap) {
            this.els.tableWrap.scrollTop = 0;
          }
        });
      });
    },

    // =========================================================================
    // OPEN DETAIL FOR EVENT ID
    // =========================================================================
    openDetailForEventId(eventId) {
      console.log('[HistoryView] ========================================');
      console.log('[HistoryView] openDetailForEventId called');
      console.log('[HistoryView] EventID:', eventId);
      console.log('[HistoryView] filteredEvents count:', this.state.filteredEvents.length);

      const ev = this.state.filteredEvents.find(e => e.EventID === eventId);

      if (!ev) {
        console.error('[HistoryView] ❌ Event not found for ID:', eventId);
        console.log('[HistoryView] Available EventIDs (first 5):', this.state.filteredEvents.slice(0, 5).map(e => e.EventID));
        return;
      }

      console.log('[HistoryView] ✅ Event found:', ev);

      const isMold = ev.ItemType === 'mold';
      const itemId = isMold ? ev.MoldID : ev.CutterID;

      if (!itemId) {
        console.warn('[HistoryView] No itemId in event:', ev);
        return;
      }

      console.log('[HistoryView] Item ID:', itemId, 'Type:', isMold ? 'mold' : 'cutter');

      // Try DataManager first
      let item = null;
      if (window.DataManager && window.DataManager.data) {
        const dm = window.DataManager.data;
        if (isMold) {
          item = (dm.molds || []).find(m => String(m.MoldID).trim() === itemId);
        } else {
          item = (dm.cutters || []).find(c => String(c.CutterID).trim() === itemId);
        }
      }

      // Fallback to master maps
      if (!item) {
        console.log('[HistoryView] Item not in DataManager, trying master maps...');
        if (isMold) {
          item = this.state.master.moldsById.get(itemId);
        } else {
          item = this.state.master.cuttersById.get(itemId);
        }
      }

      if (!item) {
        console.error('[HistoryView] ❌ Item not found:', itemId);
        alert(`アイテムが見つかりません / Item not found: ${itemId}`);
        return;
      }

      console.log('[HistoryView] ✅ Item found:', item);

      // ✅ FIX: KHÔNG đóng history modal, chỉ mở detail modal overlay
      console.log('[HistoryView] Opening detail modal for:', {
        itemId: itemId,
        type: isMold ? 'mold' : 'cutter',
        item: item
      });

      // Check available viewers
      console.log('[HistoryView] Available viewers:', {
        MobileDetailModal: typeof window.MobileDetailModal,
        MobileDetailModalOpen: window.MobileDetailModal ? typeof window.MobileDetailModal.open : 'N/A',
        showDetail: typeof window.showDetail
      });

      // ✅ Ưu tiên MobileDetailModal (mobile)
      if (window.MobileDetailModal && typeof window.MobileDetailModal.open === 'function') {
        console.log('[HistoryView] Calling MobileDetailModal.open...');
        window.MobileDetailModal.open(item, isMold ? 'mold' : 'cutter');
      }
      // Fallback showDetail (desktop)
      else if (typeof window.showDetail === 'function') {
        console.log('[HistoryView] Calling showDetail...');
        window.showDetail(item, isMold ? 'mold' : 'cutter');
      }
      else {
        console.error('[HistoryView] ❌ No detail viewer found!');
        alert('Detail viewer not available. MobileDetailModal: ' + (typeof window.MobileDetailModal) + ', showDetail: ' + (typeof window.showDetail));
      }
    },
    // =========================================================================
    // EXPORT CSV
    // =========================================================================
    exportCsv() {
      console.log('[HistoryView] Exporting CSV...');

      if (this.state.filteredEvents.length === 0) {
        alert('エクスポートするデータがありません / No data to export');
        return;
      }

      const headers = [
        '日時 / Date-Time',
        'コード / Code',
        '名称 / Name',
        '種類 / Type',
        '種別 / Category',
        '出荷元 / From',
        '出荷先 / To',
        '備考 / Notes',
        '担当 / Handler'
      ];

      const rows = this.state.filteredEvents.map(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);

        let fromDisplay = '';
        let toDisplay = '';

        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromDisplay = ev.FromRackLayer || '';
          toDisplay = ev.ToRackLayer || '';
        } else if (isMove(ev.ActionKey)) {
          fromDisplay = ev.FromCompanyName || '';
          toDisplay = ev.ToCompanyName || '';
        } else if (isInOut(ev.ActionKey)) {
          if (ev.ActionKey === ACTION.SHIP_OUT) {
            toDisplay = ev.ToCompanyName || '';
          } else if (ev.ActionKey === ACTION.SHIP_IN) {
            fromDisplay = ev.FromCompanyName || '';
          }
        } else {
          if (ev.ToCompanyName) {
            toDisplay = ev.ToCompanyName;
          }
        }

        return [
          `${date} ${time}`,
          ev.ItemCode,
          ev.ItemName,
          `${meta.ja} / ${meta.vi}`,
          ev.ItemType === 'mold' ? '金型 / Mold' : 'カッター / Cutter',
          fromDisplay,
          toDisplay,
          ev.Notes || '',
          ev.Handler || ''
        ];
      });

      let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
      rows.forEach(row => {
        csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
      });

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      link.setAttribute('href', url);
      link.setAttribute('download', `history_${timestamp}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('[HistoryView] ✅ CSV exported:', this.state.filteredEvents.length, 'rows');
    },

    // =========================================================================
    // PRINT
    // =========================================================================
    print() {
      console.log('[HistoryView] Printing...');

      if (this.state.filteredEvents.length === 0) {
        alert('印刷するデータがありません / No data to print');
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('ポップアップがブロックされました / Pop-up blocked');
        return;
      }

      const headers = ['日時', 'コード', '名称', '種類', '出荷元', '出荷先', '備考', '担当'];

      let tableHtml = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:11px;">';
      tableHtml += '<thead><tr>';
      headers.forEach(h => {
        tableHtml += `<th style="background:#f3f4f6; font-weight:700; padding:8px;">${escapeHtml(h)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      this.state.filteredEvents.forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);

        let fromDisplay = '-';
        let toDisplay = '-';

        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromDisplay = escapeHtml(ev.FromRackLayer || '-');
          toDisplay = escapeHtml(ev.ToRackLayer || '-');
        } else if (isMove(ev.ActionKey)) {
          fromDisplay = escapeHtml(ev.FromCompanyName || '-');
          toDisplay = escapeHtml(ev.ToCompanyName || '-');
        } else if (isInOut(ev.ActionKey)) {
          if (ev.ActionKey === ACTION.SHIP_OUT) {
            toDisplay = escapeHtml(ev.ToCompanyName || '-');
          } else if (ev.ActionKey === ACTION.SHIP_IN) {
            fromDisplay = escapeHtml(ev.FromCompanyName || '-');
          }
        } else {
          if (ev.ToCompanyName) {
            toDisplay = escapeHtml(ev.ToCompanyName);
          }
        }

        tableHtml += `
          <tr>
            <td style="padding:6px;">${escapeHtml(date)} ${escapeHtml(time)}</td>
            <td style="padding:6px;">${escapeHtml(ev.ItemCode)}</td>
            <td style="padding:6px;">${escapeHtml(ev.ItemName)}</td>
            <td style="padding:6px;">${escapeHtml(meta.ja)}</td>
            <td style="padding:6px;">${fromDisplay}</td>
            <td style="padding:6px;">${toDisplay}</td>
            <td style="padding:6px;">${escapeHtml(ev.Notes || '-')}</td>
            <td style="padding:6px;">${escapeHtml(ev.Handler || '-')}</td>
          </tr>
        `;
      });

      tableHtml += '</tbody></table>';

      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      let periodStr = '';
      if (dateFrom || dateTo) {
        periodStr = `期間: ${dateFrom || '...'} ~ ${dateTo || '...'}`;
      }

      const printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>履歴印刷 / History Print</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h2 { margin-bottom: 10px; }
            p { margin: 5px 0; font-size: 12px; color: #555; }
          </style>
        </head>
        <body>
          <h2>履歴 / Lịch sử</h2>
          <p>${periodStr}</p>
          <p>件数: ${this.state.filteredEvents.length}</p>
          <br>
          ${tableHtml}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();

      console.log('[HistoryView] ✅ Print window opened');
    },

    // =========================================================================
    // SEND MAIL
    // =========================================================================
    sendMail() {
      console.log('[HistoryView] Sending mail...');

      if (this.state.filteredEvents.length === 0) {
        alert('メール送信するデータがありません / No data to send');
        return;
      }

      // Generate summary
      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      let periodStr = '';
      if (dateFrom || dateTo) {
        periodStr = `期間: ${dateFrom || '...'} ~ ${dateTo || '...'}`;
      }

      const subject = encodeURIComponent(`履歴レポート / History Report - ${periodStr}`);

      let body = `履歴レポート / History Report\n\n`;
      body += `${periodStr}\n`;
      body += `件数: ${this.state.filteredEvents.length}\n\n`;

      body += `詳細:\n`;
      this.state.filteredEvents.slice(0, 20).forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);
        body += `- ${date} ${time} | ${ev.ItemCode} | ${meta.ja} | ${ev.Notes || ''}\n`;
      });

      if (this.state.filteredEvents.length > 20) {
        body += `\n... (他 ${this.state.filteredEvents.length - 20} 件)\n`;
      }

      const mailtoLink = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;

      console.log('[HistoryView] ✅ Mail client opened');
    }

  }; // End of HistoryView object

  // ===========================================================================
  // AUTO-INITIALIZE
  // ===========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      HistoryView.init();
    });
  } else {
    HistoryView.init();
  }

  // ===========================================================================
  // EXPORT TO GLOBAL
  // ===========================================================================
  window.HistoryView = HistoryView;

  console.log('[HistoryView r7.1.4] Script loaded');

})();
