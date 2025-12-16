/**
 * =============================================================================
 * history-view-r7.1.5-fixed.js
 *
 * Unified History View Module - Fixed Version
 *
 * CHANGELOG r7.1.5-fixed (2025-12-16):
 * ✅ FIX: Logic CHECKOUT/SHIP_MOVE dữ liệu từ statuslogs & shiplog
 * ✅ FEATURE: Auto-filter (bỏ nút Áp dụng, tự động lọc khi thay đổi)
 * ✅ FEATURE: Layout filter mới - 2 hàng
 *    - Hàng 1: Từ ngày | Đến ngày | Loại | Nhân viên (4 cột đều)
 *    - Hàng 2: Tìm kiếm | Chọn trường | Giá trị (3 cột)
 * ✅ REMOVED: Rack/Company input fields
 * ✅ FEATURE: Field/Value filter (như FilterModule)
 * ✅ KEEP: Tất cả tính năng r7.1.4 (click row, scroll lock, pagination...)
 *
 * Dependencies:
 * - DataManager (window.DataManager)
 * - MobileDetailModal (window.MobileDetailModal)
 * - Papa Parse (window.Papa)
 *
 * Updated: 2025-12-16 15:43 JST
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
        return { ja: '入庫', vi: 'Nhập kho', badgeClass: 'hist-badge-checkin' };
      case ACTION.CHECKOUT:
        return { ja: '出庫', vi: 'Xuất kho', badgeClass: 'hist-badge-checkout' };
      case ACTION.LOCATION_CHANGE:
        return { ja: '位置変更', vi: 'Đổi vị trí', badgeClass: 'hist-badge-location' };
      case ACTION.SHIP_OUT:
        return { ja: '出荷', vi: 'Gửi đi', badgeClass: 'hist-badge-shipout' };
      case ACTION.SHIP_IN:
        return { ja: '返却入庫', vi: 'Nhận về', badgeClass: 'hist-badge-shipin' };
      case ACTION.SHIP_MOVE:
        return { ja: '会社間移動', vi: 'Chuyển công ty', badgeClass: 'hist-badge-shipmove' };
      case ACTION.OTHER:
      default:
        return { ja: 'その他', vi: 'Khác', badgeClass: 'hist-badge-other' };
    }
  }

  // ✅ Filter fields - Tất cả cột trong bảng
  const FILTER_FIELDS = [
    { key: '', label: '-- すべて / Tất cả --', type: 'none' },
    { key: 'date', label: '日時 / Thời gian', type: 'date' },
    { key: 'itemCode', label: 'コード / Mã', type: 'text' },
    { key: 'itemName', label: '名称 / Tên', type: 'text' },
    { key: 'action', label: '種類 / Loại', type: 'action' },
    { key: 'from', label: '出荷元 / Từ', type: 'text' },
    { key: 'to', label: '出荷先 / Đến', type: 'text' },
    { key: 'notes', label: '備考 / Ghi chú', type: 'text' },
    { key: 'handler', label: '担当 / Người xử lý', type: 'employee' }
  ];

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
  // ✅ FIX: ACTION KEY MAPPING - CHECKOUT & SHIP_MOVE LOGIC
  // ===========================================================================
  function toActionKeyFromStatus(row) {
    const status = safeStr(row.Status).trim().toLowerCase();
    const auditType = safeStr(row.AuditType).trim().toLowerCase();
    const notes = safeStr(row.Notes).trim().toLowerCase();

    // AUDIT
    if (auditType === 'audit' || status === 'audit') {
      return ACTION.AUDIT;
    }

    // CHECKIN
    if (status === 'in' || status === 'checkin' || status === 'check_in') {
      return ACTION.CHECKIN;
    }

    // ✅ FIX: CHECKOUT - chính xác hơn
    if (status === 'out' || status === 'checkout' || status === 'check_out') {
      return ACTION.CHECKOUT;
    }

    // SHIP_IN (返却入庫)
    if (notes.includes('shipin') || notes.includes('return')) {
      return ACTION.SHIP_IN;
    }

    // SHIP_OUT (出荷)
    if (notes.includes('出荷') || notes.includes('返却') || notes.includes('shipout') || notes.includes('ship out')) {
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
    const YSD_COMPANY_ID = '2'; // YSD CompanyID
    const fromCID = safeStr(row.FromCompanyID).trim();
    const toCID = safeStr(row.ToCompanyID).trim();
    const notes = safeStr(row.Notes).trim().toLowerCase();

    // ✅ Logic dựa trên FromCompanyID và ToCompanyID
    
    // SHIP_MOVE (会社間移動): Chuyển từ công ty này sang công ty khác (cả 2 đều khác YSD hoặc notes có "移動"/"move"/"chuyển")
    if (fromCID && toCID && fromCID !== YSD_COMPANY_ID && toCID !== YSD_COMPANY_ID) {
      return ACTION.SHIP_MOVE;
    }
    
    if (notes.includes('移動') || notes.includes('move') || notes.includes('chuyển')) {
      return ACTION.SHIP_MOVE;
    }

    // SHIP_OUT (出荷): Từ YSD → công ty khác
    if (fromCID === YSD_COMPANY_ID && toCID && toCID !== YSD_COMPANY_ID) {
      return ACTION.SHIP_OUT;
    }

    // SHIP_IN (返却入庫): Từ công ty khác → YSD
    if (fromCID && fromCID !== YSD_COMPANY_ID && toCID === YSD_COMPANY_ID) {
      return ACTION.SHIP_IN;
    }

    // Fallback notes
    if (notes.includes('返却') || notes.includes('return') || notes.includes('nhận')) {
      return ACTION.SHIP_IN;
    }
    if (notes.includes('出荷') || notes.includes('ship') || notes.includes('gửi')) {
      return ACTION.SHIP_OUT;
    }

    // Default: nếu có toCID → SHIP_OUT
    return toCID ? ACTION.SHIP_OUT : ACTION.OTHER;
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
        cuttersById: new Map(),
        employeesById: new Map()
      },
      // ✅ Field/Value filter
      filterField: '',
      filterValue: ''
    },
    els: {},

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    init() {
      if (this.state.initialized) return;
      console.log('[HistoryView r7.1.5-fixed] Initializing...');
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
      console.log('[HistoryView r7.1.5-fixed] Initialized');
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

      const destinationsById = new Map();
      (destinations || []).forEach(d => {
        const id = String(d.DestinationID || '').trim();
        if (id) destinationsById.set(id, d);
      });

      // Store for detail modal
      this.state.master.moldsById = moldsById;
      this.state.master.cuttersById = cuttersById;
      this.state.master.employeesById = employeesById;

      const events = [];

      // Helper functions
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

      // 1. locationlog => LOCATION_CHANGE
      (locationlog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();
        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;
        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        // ✅ Kiểm tra OldRackLayer ≠ NewRackLayer (bao gồm cả trường hợp rỗng → có giá trị)
        const oldRack = safeStr(row.OldRackLayer || '').trim();
        const newRack = safeStr(row.NewRackLayer || '').trim();
        
        // Bỏ qua nếu cả 2 đều rỗng
        if (!oldRack && !newRack) return;
        
        // Bỏ qua nếu oldRack === newRack (không đổi vị trí)
        if (oldRack === newRack) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);
        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';
        const dateStr = safeStr(row.DateEntry || row.Timestamp || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);

        events.push({
          EventID: `LOC-${safeStr(row.LocationLogID)}`,
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
          FromRackLayer: oldRack || '-',
          ToRackLayer: newRack || '-',
          FromCompanyID: '',
          ToCompanyID: '',
          FromCompanyName: '',
          ToCompanyName: '',
          Notes: normalizeSpaces(safeStr(row.notes || '').trim()),
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
      console.log('[HistoryView r7.1.5-fixed] events built:', events.length);
      
      // ✅ Debug: Log action counts
      const actionCounts = {};
      events.forEach(ev => {
        actionCounts[ev.ActionKey] = (actionCounts[ev.ActionKey] || 0) + 1;
      });
      console.log('[HistoryView] Action counts:', actionCounts);
    },

    // =========================================================================
    // ✅ CREATE MODAL HTML - NEW FILTER LAYOUT
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
  <!-- ✅ FILTERS - RESPONSIVE 2-3 ROW LAYOUT -->
  <div class="hist-filters" id="history-filters">
    
    <!-- ✅ ROW 1: Date From | Date To | Action | Employee (4 cột - tất cả thiết bị) -->
    <div class="hist-filter-row-1">
      <!-- 期間 (始) -->
      <div class="hist-field">
        <label>期間（始）<span class="vi">Từ ngày</span></label>
        <input type="date" class="hist-input hist-auto-filter" id="history-date-from" />
      </div>
      
      <!-- 期間（至） -->
      <div class="hist-field">
        <label>期間（至）<span class="vi">Đến ngày</span></label>
        <input type="date" class="hist-input hist-auto-filter" id="history-date-to" />
      </div>
      
      <!-- 種類 (詳細) -->
      <div class="hist-field">
        <label>種類 (詳細) <span class="vi">Loại (chi tiết)</span></label>
        <select class="hist-select hist-auto-filter" id="history-action-select">
          <option value="">すべて / Tất cả</option>
          <option value="AUDIT">棚卸 / Kiểm kê</option>
          <option value="CHECKIN">入庫 / Nhập kho</option>
          <option value="CHECKOUT">出庫 / Xuất kho</option>
          <option value="LOCATION_CHANGE">位置変更 / Đổi vị trí</option>
          <option value="SHIP_OUT">出荷 / Gửi đi</option>
          <option value="SHIP_IN">返却入庫 / Nhận về</option>
          <option value="SHIP_MOVE">会社間移動 / Chuyển công ty</option>
          <option value="OTHER">その他 / Khác</option>
        </select>
      </div>
      
      <!-- 担当者 -->
      <div class="hist-field">
        <label>担当者 <span class="vi">Nhân viên</span></label>
        <select class="hist-select hist-auto-filter" id="history-employee-select">
          <option value="">すべて / Tất cả</option>
        </select>
      </div>
    </div>

    <!-- ✅ ROW 2: Search | Field | Value | Buttons -->
    <!-- Desktop: 4 mục cùng dòng -->
    <!-- iPad: Search + Field + Value + Buttons cùng dòng -->
    <!-- iPhone: CHỈ Field + Value (2 cột) -->
    <div class="hist-filter-row-2">
      <!-- 検索 (Desktop/iPad: inline; iPhone: xuống row 3) -->
      <div class="hist-field hist-search-field">
        <label>🔍 <span class="vi">Tìm kiếm</span></label>
        <input type="text" class="hist-input" id="history-keyword-input" placeholder="ID, コード, 名称, 備考 / Mã, tên, ghi chú">
      </div>

      <!-- フィールド -->
      <div class="hist-field">
        <label>フィールド <span class="vi">Trường</span></label>
        <select class="hist-select hist-auto-filter" id="history-field-select">
          ${FILTER_FIELDS.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
        </select>
      </div>

      <!-- 値 -->
      <div class="hist-field">
        <label>値 <span class="vi">Giá trị</span></label>
        <select class="hist-select hist-auto-filter" id="history-value-select" disabled>
          <option value="">-- Chọn --</option>
        </select>
      </div>

      <!-- ✅ Buttons (Desktop/iPad: inline; iPhone: xuống row 3) -->
      <div class="hist-filter-actions">
        <button class="hist-btn hist-btn-secondary" id="history-scroll-toggle" title="横スクロール / Scroll ngang">
          <span id="history-scroll-icon">🔒</span> <span class="hist-btn-text">Lock</span>
        </button>
        <button class="hist-btn hist-btn-success" id="history-refresh-btn">
          <span class="hist-btn-text-desktop">更新 / Refresh</span>
          <span class="hist-btn-text-mobile">更新</span>
        </button>
        <button class="hist-btn" id="history-clear-btn">
          <span class="hist-btn-text-desktop">クリア / Xóa lọc</span>
          <span class="hist-btn-text-mobile">クリア</span>
        </button>
      </div>
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
              <th class="sortable hist-col-from" data-sort-key="from">旧<br><span style="font-size:9px;">Cũ</span></th>
              <th class="sortable hist-col-to" data-sort-key="to">新<br><span style="font-size:9px;">Mới</span></th>
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
      this.els.keywordInput = document.getElementById('history-keyword-input');
      
      // ✅ Field/Value filter
      this.els.fieldSelect = document.getElementById('history-field-select');
      this.els.valueSelect = document.getElementById('history-value-select');

      
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

      console.log('[HistoryView] DOM elements cached');
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
    // ✅ BIND INSIDE EVENTS - AUTO-FILTER
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

      // ✅ AUTO-FILTER: Change event cho date/select
      const autoFilterEls = document.querySelectorAll('.hist-auto-filter');
      autoFilterEls.forEach(el => {
        el.addEventListener('change', () => {
          console.log('[HistoryView] Auto-filter triggered');
          this.applyFiltersAndRender(true);
        });
      });

      // Clear filters
      if (this.els.clearBtn) {
        this.els.clearBtn.addEventListener('click', () => this.clearFilters());
      }

      // Refresh
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

      // Row click
      if (this.els.tableBody) {
        this.els.tableBody.addEventListener('click', e => {
          const row = e.target.closest('tr[data-eventid]');
          if (!row) return;
          const eventId = row.getAttribute('data-eventid');
          console.log('[HistoryView] Row clicked, eventId:', eventId);
          if (eventId) {
            this.openDetailForEventId(eventId);
          }
        });
      }

      // Toggle scroll lock
      const scrollToggle = document.getElementById('history-scroll-toggle');
      const tableWrap = this.els.tableWrap;
      if (scrollToggle && tableWrap) {
        scrollToggle.addEventListener('click', (e) => {
          e.preventDefault();
          const isLocked = !tableWrap.classList.contains('scroll-unlocked');
          if (isLocked) {
            tableWrap.classList.add('scroll-unlocked');
            scrollToggle.classList.add('unlocked');
            scrollToggle.innerHTML = '<span id="history-scroll-icon">🔓</span> Unlock';
            console.log('[HistoryView] Scroll unlocked');
          } else {
            tableWrap.classList.remove('scroll-unlocked');
            scrollToggle.classList.remove('unlocked');
            scrollToggle.innerHTML = '<span id="history-scroll-icon">🔒</span> Lock';
            console.log('[HistoryView] Scroll locked');
          }
        });
      }

      // Footer buttons
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

      // ✅ Debounced keyword search (đã có)
      if (this.els.keywordInput) {
        const debouncedApply = debounce(() => this.applyFiltersAndRender(true), 400);
        this.els.keywordInput.addEventListener('input', debouncedApply);
      }

      // Field select: populate value dropdown
      if (this.els.fieldSelect) {
        this.els.fieldSelect.addEventListener('change', () => {
          this.populateValueDropdown();
          // Auto-filter trigger (.hist-auto-filter)
        });
      }

    },

    // =========================================================================
    // OPEN MODAL
    // =========================================================================
    open(preset) {
      console.log('[HistoryView] opened, preset:', preset);
      this.state.lastPreset = preset || 'all';

      if (this.state.allEvents.length === 0) {
        this.ensureHistoryEventsBuilt();
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
      if (this.els.keywordInput) this.els.keywordInput.value = '';
      if (this.els.fieldSelect) this.els.fieldSelect.value = '';
      if (this.els.valueSelect) {
        this.els.valueSelect.value = '';
        this.els.valueSelect.disabled = true;
      }

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
      if (this.els.keywordInput) this.els.keywordInput.value = '';
      if (this.els.fieldSelect) this.els.fieldSelect.value = '';
      if (this.els.valueSelect) {
        this.els.valueSelect.value = '';
        this.els.valueSelect.disabled = true;
      }
      this.applyFiltersAndRender(true);
    },

    // =========================================================================
    // REFRESH DATA
    // =========================================================================
    refreshData() {
      console.log('[HistoryView] Refreshing data...');
      this.ensureHistoryEventsBuilt();
      this.applyFiltersAndRender(true);
    },

    // =========================================================================
    // POPULATE EMPLOYEE DROPDOWN
    // =========================================================================
    populateEmployeeDropdown() {
      if (!this.els.employeeSelect) return;
      
      const handlers = new Set();
      this.state.allEvents.forEach(ev => {
        if (ev.Handler) handlers.add(ev.Handler);
      });

      const sorted = Array.from(handlers).sort();
      let html = '<option value="">すべて / Tất cả</option>';
      sorted.forEach(h => {
        html += `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`;
      });
      this.els.employeeSelect.innerHTML = html;
    },

    // POPULATE VALUE DROPDOWN based on selected field
    populateValueDropdown() {
      if (!this.els.fieldSelect || !this.els.valueSelect) return;

      const field = this.els.fieldSelect.value;
      this.els.valueSelect.innerHTML = '<option value="">-- Chọn --</option>';

      if (!field) {
        this.els.valueSelect.disabled = true;
        return;
      }

      this.els.valueSelect.disabled = false;

      const values = new Set();

      this.state.allEvents.forEach(ev => {
        let val = '';
        if (field === 'date') {
          val = getDateKey(ev.EventDate);
        } else if (field === 'itemCode') {
          val = ev.ItemCode;
        } else if (field === 'itemName') {
          val = ev.ItemName;
        } else if (field === 'action') {
          val = ev.ActionKey;
        } else if (field === 'from') {
          val = ev.FromCompanyName || ev.FromRackLayer;
        } else if (field === 'to') {
          val = ev.ToCompanyName || ev.ToRackLayer;
        } else if (field === 'notes') {
          val = ev.Notes;
        } else if (field === 'handler') {
          val = ev.Handler;
        }

        if (val && val !== '-') {
          values.add(val.trim());
        }
      });

      const sorted = Array.from(values).sort();

      // Special handling for 'action' field
      if (field === 'action') {
        Object.keys(ACTION).forEach(key => {
          if (key !== 'ALL') {
            const meta = actionMeta(ACTION[key]);
            this.els.valueSelect.innerHTML += `<option value="${ACTION[key]}">${meta.ja} / ${meta.vi}</option>`;
          }
        });
      } else {
        sorted.forEach(v => {
          this.els.valueSelect.innerHTML += `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
        });
      }

      console.log('[HistoryView] Value dropdown populated:', sorted.length, 'options');
    },


    // =========================================================================
    // APPLY FILTERS & RENDER
    // =========================================================================
    applyFiltersAndRender(resetPage) {
      if (resetPage) {
        this.state.currentPage = 1;
      }

      // Get filter values
      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      const actionFilter = this.els.actionSelect ? this.els.actionSelect.value : '';
      const employeeFilter = this.els.employeeSelect ? this.els.employeeSelect.value : '';
      const keyword = this.els.keywordInput ? toLower(this.els.keywordInput.value.trim()) : '';
      
      // ✅ Field/Value filter
      const filterField = this.els.fieldSelect ? this.els.fieldSelect.value : '';
      const filterValue = this.els.valueSelect ? toLower(this.els.valueSelect.value.trim()) : '';

      // Filter events
      let filtered = this.state.allEvents.filter(ev => {
        // Date range
        if (dateFrom && ev.EventDateKey < dateFrom) return false;
        if (dateTo && ev.EventDateKey > dateTo) return false;

        // Action
        if (actionFilter && ev.ActionKey !== actionFilter) return false;

        // Employee
        if (employeeFilter && ev.Handler !== employeeFilter) return false;

        // Keyword (search all fields)
        if (keyword) {
          const searchStr = toLower(
            `${ev.ItemCode} ${ev.ItemName} ${ev.Notes} ${ev.Handler} ${ev.FromCompanyName} ${ev.ToCompanyName} ${ev.FromRackLayer} ${ev.ToRackLayer}`
          );
          if (!searchStr.includes(keyword)) return false;
        }

        // ✅ Field/Value filter
        if (filterField && filterValue) {
          let fieldVal = '';
          if (filterField === 'date') {
            fieldVal = toLower(ev.EventDate);
          } else if (filterField === 'itemCode') {
            fieldVal = toLower(ev.ItemCode);
          } else if (filterField === 'itemName') {
            fieldVal = toLower(ev.ItemName);
          } else if (filterField === 'action') {
            fieldVal = toLower(ev.ActionKey);
          } else if (filterField === 'from') {
            fieldVal = toLower(ev.FromCompanyName || ev.FromRackLayer);
          } else if (filterField === 'to') {
            fieldVal = toLower(ev.ToCompanyName || ev.ToRackLayer);
          } else if (filterField === 'notes') {
            fieldVal = toLower(ev.Notes);
          } else if (filterField === 'handler') {
            fieldVal = toLower(ev.Handler);
          }
          if (!fieldVal.includes(filterValue)) return false;
        }

        return true;
      });

      this.state.filteredEvents = filtered;

      // Sort
      this.sortEvents(filtered);

      // Update UI
      this.updateSummary();
      this.updateStats();
      this.renderTable();
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

        // Row class: mold or cutter
        const rowClass = ev.ItemType === 'mold' ? 'hist-row-mold' : 'hist-row-cutter';

        // ✅ From / To display
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
      <div class="ja">${escapeHtml(meta.ja)}</div>
      <div class="vi">${escapeHtml(meta.vi)}</div>
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
          th.classList.add(this.state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
      });
    },

    // =========================================================================
    // RENDER PAGINATION
    // =========================================================================
    renderPagination() {
      const wrap = this.els.paginationWrap;
      if (!wrap) return;

      const inner = wrap.querySelector('.hist-pagination-inner');
      if (!inner) return;

      const total = this.state.filteredEvents.length;
      const pageSize = this.state.pageSize;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const currentPage = this.state.currentPage;

      if (totalPages === 1) {
        inner.innerHTML = '';
        return;
      }

      let html = '';

      // Prev
      html += `<button class="hist-page-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

      // Pages
      const maxButtons = 7;
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      if (startPage > 1) {
        html += `<button class="hist-page-btn" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="hist-page-ellipsis">...</span>`;
      }

      for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? 'active' : '';
        html += `<button class="hist-page-btn ${active}" data-page="${i}">${i}</button>`;
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="hist-page-ellipsis">...</span>`;
        html += `<button class="hist-page-btn" data-page="${totalPages}">${totalPages}</button>`;
      }

      // Next
      html += `<button class="hist-page-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;

      inner.innerHTML = html;

      // Bind click
      inner.querySelectorAll('.hist-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.getAttribute('data-page');
          if (page === 'prev') {
            if (this.state.currentPage > 1) {
              this.state.currentPage--;
              this.applyFiltersAndRender(false);
            }
          } else if (page === 'next') {
            if (this.state.currentPage < totalPages) {
              this.state.currentPage++;
              this.applyFiltersAndRender(false);
            }
          } else {
            this.state.currentPage = parseInt(page, 10);
            this.applyFiltersAndRender(false);
          }
        });
      });
    },

    // =========================================================================
    // OPEN DETAIL FOR EVENT ID
    // =========================================================================
    openDetailForEventId(eventId) {
      const ev = this.state.allEvents.find(e => e.EventID === eventId);
      if (!ev) {
        console.warn('[HistoryView] Event not found:', eventId);
        return;
      }

      console.log('[HistoryView] Opening detail for event:', ev);

      // Use MobileDetailModal if available
      if (window.MobileDetailModal && window.MobileDetailModal.open) {
        if (ev.ItemType === 'mold') {
          const moldObj = this.state.master.moldsById.get(ev.MoldID);
          if (moldObj) {
            window.MobileDetailModal.open(moldObj, 'mold');
          } else {
            alert('Mold not found: ' + ev.MoldID);
          }
        } else if (ev.ItemType === 'cutter') {
          const cutterObj = this.state.master.cuttersById.get(ev.CutterID);
          if (cutterObj) {
            window.MobileDetailModal.open(cutterObj, 'cutter');
          } else {
            alert('Cutter not found: ' + ev.CutterID);
          }
        }
      } else {
        alert(`Event Detail:\n\nCode: ${ev.ItemCode}\nName: ${ev.ItemName}\nAction: ${ev.ActionKey}\nDate: ${ev.EventDate}\nNotes: ${ev.Notes}`);
      }
    },

    // =========================================================================
    // EXPORT CSV
    // =========================================================================
    exportCsv() {
      console.log('[HistoryView] Exporting CSV...');
      const filtered = this.state.filteredEvents;
      if (filtered.length === 0) {
        alert('データがありません / Không có dữ liệu');
        return;
      }

      let csv = 'EventID,Date,Time,ItemCode,ItemName,Action,From,To,Notes,Handler\n';
      filtered.forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);
        const from = ev.FromCompanyName || ev.FromRackLayer || '-';
        const to = ev.ToCompanyName || ev.ToRackLayer || '-';
        csv += `"${ev.EventID}","${date}","${time}","${ev.ItemCode}","${ev.ItemName}","${meta.ja}","${from}","${to}","${ev.Notes}","${ev.Handler}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `history_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      console.log('[HistoryView] CSV exported');
    },

    // =========================================================================
    // PRINT
    // =========================================================================
    print() {
      console.log('[HistoryView] Printing...');
      const filtered = this.state.filteredEvents;
      if (filtered.length === 0) {
        alert('データがありません / Không có dữ liệu');
        return;
      }

      let printContent = '<h2>履歴 / Lịch sử</h2>';
      printContent += '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:12px;">';
      printContent += '<thead><tr><th>日時</th><th>コード</th><th>名称</th><th>種類</th><th>出荷元</th><th>出荷先</th><th>備考</th><th>担当</th></tr></thead><tbody>';

      filtered.forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);
        const from = escapeHtml(ev.FromCompanyName || ev.FromRackLayer || '-');
        const to = escapeHtml(ev.ToCompanyName || ev.ToRackLayer || '-');
        printContent += `<tr>
          <td>${escapeHtml(date)} ${escapeHtml(time)}</td>
          <td>${escapeHtml(ev.ItemCode)}</td>
          <td>${escapeHtml(ev.ItemName)}</td>
          <td>${escapeHtml(meta.ja)}</td>
          <td>${from}</td>
          <td>${to}</td>
          <td>${escapeHtml(ev.Notes || '-')}</td>
          <td>${escapeHtml(ev.Handler || '-')}</td>
        </tr>`;
      });

      printContent += '</tbody></table>';

      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>履歴 / Lịch sử</title>
            <style>body { font-family: Arial, sans-serif; padding: 20px; }</style>
          </head>
          <body>${printContent}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
      console.log('[HistoryView] Print window opened');
    },

    // =========================================================================
    // SEND MAIL
    // =========================================================================
    sendMail() {
      console.log('[HistoryView] Sending mail...');
      const filtered = this.state.filteredEvents;
      if (filtered.length === 0) {
        alert('データがありません / Không có dữ liệu');
        return;
      }

      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      let periodStr = '';
      if (dateFrom || dateTo) {
        periodStr = ` (${dateFrom || '...'} ~ ${dateTo || '...'})`;
      }

      let body = `履歴 / Lịch sử${periodStr}\n\n`;
      body += `件数: ${filtered.length}\n\n`;
      body += 'EventID | Date | Time | Code | Name | Action | From | To | Notes | Handler\n';
      body += '---\n';

      filtered.slice(0, 50).forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const meta = actionMeta(ev.ActionKey);
        const from = ev.FromCompanyName || ev.FromRackLayer || '-';
        const to = ev.ToCompanyName || ev.ToRackLayer || '-';
        body += `${ev.EventID} | ${date} | ${time} | ${ev.ItemCode} | ${ev.ItemName} | ${meta.ja} | ${from} | ${to} | ${ev.Notes} | ${ev.Handler}\n`;
      });

      if (filtered.length > 50) {
        body += `\n...(残り ${filtered.length - 50} 件)\n`;
      }

      const subject = encodeURIComponent(`履歴 / Lịch sử${periodStr}`);
      const mailBody = encodeURIComponent(body);
      window.location.href = `mailto:?subject=${subject}&body=${mailBody}`;
      console.log('[HistoryView] Mail client opened');
    }
  };

  // ===========================================================================
  // AUTO-INIT ON LOAD
  // ===========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      HistoryView.init();
    });
  } else {
    HistoryView.init();
  }

  // Expose globally
  window.HistoryView = HistoryView;

  console.log('[HistoryView r7.1.5-fixed] Module loaded');

})();
