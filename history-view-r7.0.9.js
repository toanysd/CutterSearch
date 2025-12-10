/**
 * history-view-r7.1.0.js
 * ===========================================================
 * Popup Lịch sử (履歴) cho Mold/Cutter
 * - Mở bằng nút History trên navibar (bottom-nav-item[data-tab="history"])
 * - Không thay đổi layout hiện tại (popup overlay trên màn hình Search)
 *
 * NEW in r7.1.0:
 *  ✅ Fixed mobile header/footer position
 *  ✅ CSV export với UTF-8 BOM
 *  ✅ Print function mở window mới
 *  ✅ Mail function với fixed-width text table
 *  ✅ Filter labels hiển thị 2 dòng (Nhật/Việt)
 * ===========================================================
 */
(function () {
  'use strict';

  // Lấy dữ liệu lịch sử trực tiếp từ GitHub (giống statuslogs.csv trong ui-renderer)
  const GITHUB_DATA_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  const USE_GITHUB_SOURCE_FOR_HISTORY = true; // Nếu muốn quay lại dùng DataManager, chỉ cần đặt false

  function fetchText(url) {
    return fetch(url).then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.text();
    });
  }

  function parseCsv(text) {
    if (!text) return [];
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const row = {};
      header.forEach((h, idx) => {
        row[h] = (parts[idx] || '').trim();
      });
      data.push(row);
    }
    return data;
  }

  const DATE_FMT_OPTIONS = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    try {
      return d.toLocaleString('ja-JP', DATE_FMT_OPTIONS);
    } catch (e) {
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

  function getYear(dateStr) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d.getFullYear();
  }

  function getMonth(dateStr) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : (d.getMonth() + 1);
  }

  function toLower(str) {
    return String(str || '').toLowerCase();
  }

  // ========= String padding helper for fixed-width email ==========
  function padRight(str, width) {
    str = String(str || '');
    let displayWidth = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code > 0x3000 && code < 0x9FFF) {
        displayWidth += 2;
      } else {
        displayWidth += 1;
      }
    }
    const padding = width - displayWidth;
    if (padding > 0) {
      return str + ' '.repeat(padding);
    }
    return str;
  }

  function truncate(str, maxLen) {
    str = String(str || '');
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 2) + '..';
  }

  const HistoryView = {
    state: {
      initialized: false,
      allEvents: [],
      filteredEvents: [],
      sortKey: 'date',
      sortDir: 'desc'
    },
    els: {
      root: null,
      backdrop: null,
      dialog: null,
      header: null,
      filters: null,        // ⇦ NEW: khối Lọc dùng để vuốt đóng
      tableBody: null,
      tableHead: null,
      dateFrom: null,
      dateTo: null,
      typeSelect: null,
      keywordInput: null,
      companyInput: null,
      mailToInput: null,
      summaryEl: null,
      exportBtn: null,
      printBtn: null,
      mailBtn: null,
      closeBtn: null,
      cancelBtn: null
    },

    init() {
      if (this.state.initialized) return;
      this.injectStyles();
      this.createModal();
      this.loadMailRecipients();
      this.ensureHistoryEventsBuilt();
      this.bindTriggers();
      this.bindInsideEvents();
      this.applyDefaultDateRange();
      this.applyFilters();
      this.state.initialized = true;
      console.log('[HistoryView r7.1.0] Initialized with', this.state.allEvents.length, 'events');
    },

    injectStyles() {
      if (document.getElementById('history-view-styles')) return;
      const style = document.createElement('style');
      style.id = 'history-view-styles';
      style.textContent = `
      .hist-root {
        position: fixed;
        inset: 0;
        z-index: 9998;
        display: none;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .hist-root.hist-open {
        display: flex;
      }
      .hist-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
      }
      .hist-dialog {
        position: relative;
        z-index: 1;
        background: #ffffff;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        width: 98%;
        max-width: 1100px;
        height: 90vh;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }
      .hist-header {
        flex-shrink: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        border-radius: 10px 10px 0 0;
        background: linear-gradient(90deg, #1976d2 0%, #42a5f5 100%);
        color: #ffffff;
      }
      .hist-title {
        font-size: 15px;
        font-weight: 600;
      }
      .hist-title span {
        display: block;
        line-height: 1.3;
      }
      .hist-title .ja {
        font-size: 15px;
      }
      .hist-title .vi {
        font-size: 12px;
        color: #e3f2fd;
      }
      .hist-close {
        border: none;
        background: transparent;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
        color: #ffffff;
      }
      .hist-summary {
        flex-shrink: 0;
        font-size: 12px;
        color: #555;
        text-align: right;
        padding: 4px 10px 2px;
      }
      .hist-body {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 0 10px;
        overflow: hidden;
        padding-bottom: 60px;
      }
      .hist-filters {
        flex-shrink: 0;
        border: 1px solid #bbdefb;
        border-radius: 8px;
        padding: 8px;
        background: linear-gradient(180deg, #e3f2fd 0%, #ffffff 60%);
        font-size: 12px;
      }
      .hist-filter-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 8px 12px;
        margin-bottom: 6px;
      }
      .hist-filter-row label {
        font-size: 11px;
        min-width: 80px;
        color: #0d47a1;
        font-weight: 600;
        display: flex;
        flex-direction: column;
        line-height: 1.3;
      }
      .hist-filter-row label .ja {
        font-size: 11px;
      }
      .hist-filter-row label .vi {
        font-size: 10px;
        color: #1565c0;
        font-weight: 400;
      }
      .hist-filter-row input,
      .hist-filter-row select {
        font-size: 11px;
        padding: 4px 6px;
        border-radius: 4px;
        border: 1px solid #b0bec5;
        flex: 1;
        min-width: 120px;
      }
      .hist-table-wrap {
        flex: 1 1 auto;
        overflow: auto;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        background: #ffffff;
      }
      .hist-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .hist-table th,
      .hist-table td {
        border-bottom: 1px solid #eee;
        padding: 4px 6px;
        vertical-align: top;
      }
      .hist-table th {
        background: #e3f2fd;
        color: #0d47a1;
        position: sticky;
        top: 0;
        z-index: 1;
        font-size: 11px;
      }
      .hist-table th.sortable {
        cursor: pointer;
      }
      .hist-table th.sortable:hover {
        background: #bbdefb;
      }
      .hist-table th.sort-asc::after {
        content: ' ▲';
        font-size: 9px;
      }
      .hist-table th.sort-desc::after {
        content: ' ▼';
        font-size: 9px;
      }
      .hist-table tbody tr:nth-child(odd) {
        background-color: #fafafa;
      }
      .hist-table tbody tr:hover {
        background-color: #e3f2fd;
      }
      .hist-item-code {
        font-weight: 600;
        color: #0056b3;
      }
      .hist-item-name {
        font-size: 10px;
        color: #555;
      }
      .hist-type-vi {
        font-size: 10px;
        color: #666;
      }
      .hist-from-label,
      .hist-to-label {
        font-size: 10px;
        color: #777;
        font-weight: 600;
      }
      .hist-actions {
        flex-shrink: 0;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        padding: 8px 12px;
        background: #f5f5f5;
        border-top: 1px solid #ccc;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .hist-actions-left,
      .hist-actions-right {
        display: flex;
        gap: 8px;
      }
      .hist-btn {
        font-size: 12px;
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid #ccc;
        background: #f5f5f5;
        cursor: pointer;
      }
      .hist-btn-primary {
        background: #1976d2;
        color: #fff;
        border-color: #1976d2;
      }
      .hist-btn-cancel {
        background: #ffffff;
        color: #555;
      }
      .hist-item-link {
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        text-align: left;
        cursor: pointer;
      }
      .hist-item-link:hover .hist-item-code {
        text-decoration: underline;
      }

      @media (max-width: 767px) {
        /* Căn dialog từ mép trên giống Teflon, tránh che header */
        .hist-root {
          align-items: flex-start;
          justify-content: center;
        }

        .hist-dialog {
          width: 100%;
          max-width: 100%;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
          margin-top: env(safe-area-inset-top, 8px); /* chừa chỗ cho notch/status bar */
        }
        .hist-body {
          padding-bottom: 56px;
        }
        .hist-table-wrap {
          max-height: none;
        }
      }
    `;
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
      <span class="vi">Lịch sử di chuyển / vận chuyển</span>
    </div>
    <button type="button" class="hist-close" aria-label="Close">&times;</button>
  </div>
  <div id="history-summary" class="hist-summary">
    表示 0 / 全0 件 （期間: -） / Đang hiển thị 0 / tổng 0 bản ghi
  </div>
  <div class="hist-body">
    <div class="hist-filters">
      <div class="hist-filter-row">
        <label for="history-date-from">
          <span class="ja">日付（自）</span>
          <span class="vi">Từ ngày</span>
        </label>
        <input type="date" id="history-date-from">
        <label for="history-date-to">
          <span class="ja">（至）</span>
          <span class="vi">Đến ngày</span>
        </label>
        <input type="date" id="history-date-to">
      </div>
      <div class="hist-filter-row">
        <label for="history-type-select">
          <span class="ja">種類</span>
          <span class="vi">Loại</span>
        </label>
        <select id="history-type-select">
          <option value="all">すべて / Tất cả</option>
          <option value="rack">ラック履歴のみ / Chỉ thay đổi rack</option>
          <option value="ship">出荷・会社間移動 / Chỉ vận chuyển</option>
        </select>
      </div>
      <div class="hist-filter-row">
        <label for="history-company-input">
          <span class="ja">会社</span>
          <span class="vi">Công ty</span>
        </label>
        <input type="text" id="history-company-input"
               placeholder="会社名でフィルタ / Lọc theo tên công ty">
      </div>
      <div class="hist-filter-row">
        <label for="history-keyword">
          <span class="ja">コード・名称</span>
          <span class="vi">Mã, tên</span>
        </label>
        <input type="text" id="history-keyword"
               placeholder="例: TIH014, TOK001 / ví dụ: TIH014, TOK001">
      </div>
      <div class="hist-filter-row">
        <label for="history-mail-to">
          <span class="ja">メール宛先</span>
          <span class="vi">Người nhận</span>
        </label>
        <input type="text" id="history-mail-to"
               placeholder="example@ysd.co.jp; another@ysd.co.jp">
      </div>
    </div>
    <div class="hist-table-wrap">
      <table id="history-table" class="hist-table">
        <thead>
          <tr>
            <th class="sortable" data-sort-key="date">日付 / Ngày giờ</th>
            <th class="sortable" data-sort-key="item">コード・名称 / Mã & tên</th>
            <th class="sortable" data-sort-key="type">種類 / Loại</th>
            <th class="sortable" data-sort-key="fromto">From → To</th>
            <th class="sortable" data-sort-key="notes">備考 / Ghi chú</th>
            <th class="sortable" data-sort-key="handler">担当 / Nhân viên</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="6" style="text-align:center; padding:8px;">
              履歴がありません / Không có dữ liệu lịch sử
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="hist-actions">
    <div class="hist-actions-left">
      <button id="history-cancel" class="hist-btn hist-btn-cancel">
        閉じる / Đóng
      </button>
    </div>
    <div class="hist-actions-right">
      <button id="history-export-csv" class="hist-btn">
        CSV出力 / Xuất CSV
      </button>
      <button id="history-print" class="hist-btn">
        印刷 / In
      </button>
      <button id="history-send-mail" class="hist-btn hist-btn-primary">
        メール送信 / Gửi mail
      </button>
    </div>
  </div>
</div>
`;
      document.body.appendChild(root);

      this.els.root = root;
      this.els.backdrop = root.querySelector('.hist-backdrop');
      this.els.dialog = root.querySelector('.hist-dialog');
      this.els.header = root.querySelector('.hist-header');
      this.els.filters = root.querySelector('.hist-filters');   // ⇦ NEW
      this.els.tableBody = root.querySelector('#history-table tbody');
      this.els.tableHead = root.querySelector('#history-table thead');
      this.els.dateFrom = root.querySelector('#history-date-from');
      this.els.dateTo = root.querySelector('#history-date-to');
      this.els.typeSelect = root.querySelector('#history-type-select');
      this.els.keywordInput = root.querySelector('#history-keyword');
      this.els.companyInput = root.querySelector('#history-company-input');
      this.els.mailToInput = root.querySelector('#history-mail-to');
      this.els.summaryEl = root.querySelector('#history-summary');
      this.els.exportBtn = root.querySelector('#history-export-csv');
      this.els.printBtn = root.querySelector('#history-print');
      this.els.mailBtn = root.querySelector('#history-send-mail');
      this.els.closeBtn = root.querySelector('.hist-close');
      this.els.cancelBtn = root.querySelector('#history-cancel');
    },

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
        dm.data.molds || [],
        dm.data.cutters || [],
        dm.data.companies || [],
        dm.data.employees || []
      );
    },

    loadHistoryFromGithub() {
      this.state.loading = true;
      if (this.els.summaryEl) {
        this.els.summaryEl.textContent =
          'GitHubから履歴データを読込中... / Đang tải dữ liệu lịch sử từ GitHub...';
      }

      const base = GITHUB_DATA_BASE_URL;
      const urls = {
        location: base + 'locationlog.csv',
        ship: base + 'shiplog.csv',
        molds: base + 'molds.csv',
        cutters: base + 'cutters.csv',
        companies: base + 'companies.csv',
        employees: base + 'employees.csv'
      };

      Promise.all([
        fetchText(urls.location),
        fetchText(urls.ship),
        fetchText(urls.molds),
        fetchText(urls.cutters),
        fetchText(urls.companies),
        fetchText(urls.employees)
      ])
        .then(([locationText, shipText, moldsText, cuttersText, companiesText, employeesText]) => {
          const locationlog = parseCsv(locationText);
          const shiplog = parseCsv(shipText);
          const molds = parseCsv(moldsText);
          const cutters = parseCsv(cuttersText);
          const companies = parseCsv(companiesText);
          const employees = parseCsv(employeesText);

          this.buildHistoryEvents(locationlog, shiplog, molds, cutters, companies, employees);
          this.applyDefaultDateRange();
          this.applyFilters();
        })
        .catch(err => {
          console.error('[HistoryView] ❌ Failed to load history CSV from GitHub:', err);
          if (this.els.summaryEl) {
            this.els.summaryEl.textContent =
              '履歴データ読込エラー / Lỗi tải dữ liệu lịch sử từ GitHub';
          }
        })
        .finally(() => {
          this.state.loading = false;
        });
    },

    buildHistoryEvents(locationlog, shiplog, molds, cutters, companies, employees) {
      const moldById = new Map();
      (molds || []).forEach(m => {
        if (m.MoldID) moldById.set(String(m.MoldID), m);
      });

      const cutterById = new Map();
      (cutters || []).forEach(c => {
        if (c.CutterID) cutterById.set(String(c.CutterID), c);
      });

      const companyById = new Map();
      (companies || []).forEach(c => {
        const id = String(c.CompanyID || c.ID || '');
        if (id) companyById.set(id, c);
      });

      const employeeById = new Map();
      (employees || []).forEach(emp => {
        if (emp.EmployeeID) {
          employeeById.set(String(emp.EmployeeID), emp);
        }
      });

      const events = [];

      // 1) LocationLog → đổi rack
      (locationlog || []).forEach(row => {
        const moldIdRaw = row.MoldID;
        const cutterIdRaw = row.CutterID;
        const hasMold = moldIdRaw && String(moldIdRaw).trim() !== '';
        const hasCutter = cutterIdRaw && String(cutterIdRaw).trim() !== '';
        const itemType = hasMold ? 'mold' : (hasCutter ? 'cutter' : 'unknown');
        const itemId = hasMold ? String(moldIdRaw) : (hasCutter ? String(cutterIdRaw) : '');

        let itemCode = '';
        let itemName = '';

        if (itemType === 'mold') {
          const m = moldById.get(String(moldIdRaw));
          if (m) {
            itemCode = m.MoldCode || m.MoldID || '';
            itemName = m.MoldName || '';
          }
        } else if (itemType === 'cutter') {
          const c = cutterById.get(String(cutterIdRaw));
          if (c) {
            itemCode = c.CutterNo || c.CutterCode || c.CutterID || '';
            itemName = c.CutterName || c.Name || '';
          }
        }

        const eventDate = row.DateEntry || row.date || '';
        const locEmpId = row.EmployeeID || row.EmployeeId || '';
        let locHandlerName = '';

        if (locEmpId && employeeById.has(String(locEmpId))) {
          const emp = employeeById.get(String(locEmpId));
          locHandlerName = emp.EmployeeNameShort || emp.EmployeeName || '';
        }

        events.push({
          EventID: 'L' + (row.LocationLogID || row.LocationLogId || ''),
          Source: 'locationlog',
          EventType: 'location-change',
          EventTypeLabelJa: '位置変更',
          EventTypeLabelVi: 'Đổi vị trí',
          ItemType: itemType,
          ItemId: itemId,
          ItemCode: itemCode,
          ItemName: itemName,
          MoldID: hasMold ? String(moldIdRaw) : '',
          CutterID: hasCutter ? String(cutterIdRaw) : '',
          EventDate: eventDate,
          EventDateKey: getDateKey(eventDate),
          Year: getYear(eventDate),
          Month: getMonth(eventDate),
          FromRackLayer: row.OldRackLayer || row.oldracklayer || '',
          ToRackLayer: row.NewRackLayer || row.newracklayer || '',
          FromCompanyID: '',
          ToCompanyID: '',
          FromCompanyName: '',
          ToCompanyName: '',
          Direction: 'INTERNAL',
          Notes: row.notes || row.Notes || '',
          HandlerID: locEmpId || '',
          Handler: locHandlerName || ''
        });
      });

      // 2) Shiplog → vận chuyển giữa công ty
      (shiplog || []).forEach(row => {
        const moldIdRaw = row.MoldID;
        const cutterIdRaw = row.CutterID;
        const hasMold = moldIdRaw && String(moldIdRaw).trim() !== '';
        const hasCutter = cutterIdRaw && String(cutterIdRaw).trim() !== '';
        const itemType = hasMold ? 'mold' : (hasCutter ? 'cutter' : 'unknown');
        const itemId = hasMold ? String(moldIdRaw) : (hasCutter ? String(cutterIdRaw) : '');

        let itemCode = '';
        let itemName = '';

        if (itemType === 'mold') {
          const m = moldById.get(String(moldIdRaw));
          if (m) {
            itemCode = m.MoldCode || m.MoldID || '';
            itemName = m.MoldName || '';
          }
        } else if (itemType === 'cutter') {
          const c = cutterById.get(String(cutterIdRaw));
          if (c) {
            itemCode = c.CutterNo || c.CutterCode || c.CutterID || '';
            itemName = c.CutterName || c.Name || '';
          }
        }

        const eventDate = row.ShipDate || row.DateEntry || '';
        const fromId = row.FromCompanyID ? String(row.FromCompanyID) : '';
        const toId = row.ToCompanyID ? String(row.ToCompanyID) : '';

        const fromCompany = companyById.get(fromId);
        const toCompany = companyById.get(toId);

        const fromName = (row.FromCompany && String(row.FromCompany).trim() !== '')
          ? String(row.FromCompany)
          : (fromCompany ? (fromCompany.CompanyName || fromCompany.Name || '') : '');

        const toName = (row.ToCompany && String(row.ToCompany).trim() !== '')
          ? String(row.ToCompany)
          : (toCompany ? (toCompany.CompanyName || toCompany.Name || '') : '');

        let eventType = 'shipment';
        let eventTypeJa = '出荷 / 移動';
        let eventTypeVi = 'Vận chuyển';

        if (fromId && !toId) {
          eventType = 'ship-out';
          eventTypeJa = '出荷';
          eventTypeVi = 'Xuất kho / gửi đi';
        } else if (!fromId && toId) {
          eventType = 'ship-in';
          eventTypeJa = '入庫';
          eventTypeVi = 'Nhập kho / trả về';
        }

        const shipEmpId = row.EmployeeID || row.EmployeeId || '';
        let handlerName = '';

        if (shipEmpId && employeeById.has(String(shipEmpId))) {
          const emp = employeeById.get(String(shipEmpId));
          handlerName = emp.EmployeeNameShort || emp.EmployeeName || '';
        } else if (row.handler || row.Handler) {
          handlerName = row.handler || row.Handler;
        }

        events.push({
          EventID: 'S' + (row.ShipID || row.ShipId || ''),
          Source: 'shiplog',
          EventType: eventType,
          EventTypeLabelJa: eventTypeJa,
          EventTypeLabelVi: eventTypeVi,
          ItemType: itemType,
          ItemId: itemId,
          ItemCode: itemCode,
          ItemName: itemName,
          MoldID: hasMold ? String(moldIdRaw) : '',
          CutterID: hasCutter ? String(cutterIdRaw) : '',
          EventDate: eventDate,
          EventDateKey: getDateKey(eventDate),
          Year: getYear(eventDate),
          Month: getMonth(eventDate),
          FromRackLayer: '',
          ToRackLayer: '',
          FromCompanyID: fromId,
          ToCompanyID: toId,
          FromCompanyName: fromName,
          ToCompanyName: toName,
          Direction: eventType === 'ship-in' ? 'IN' : (eventType === 'ship-out' ? 'OUT' : 'MOVE'),
          Notes: row.ShipNotes || row.Notes || '',
          HandlerID: shipEmpId || '',
          Handler: handlerName || ''
        });
      });

      // Sắp xếp mới nhất → cũ
      events.sort((a, b) => {
        const da = new Date(a.EventDate || a.EventDateKey);
        const db = new Date(b.EventDate || b.EventDateKey);
        return db - da;
      });

      this.state.allEvents = events.slice();

      if (window.DataManager) {
        window.DataManager.historyEvents = events;
      }
    },

    bindTriggers() {
      const triggers = document.querySelectorAll('.bottom-nav-item[data-tab="history"]');
      triggers.forEach(t => {
        t.addEventListener('click', (e) => {
          e.preventDefault();
          this.open();
        });
      });
      console.log('[HistoryView] Bound triggers:', triggers.length);
    },

    bindInsideEvents() {
      if (this.els.closeBtn) {
        this.els.closeBtn.addEventListener('click', () => this.close());
      }
      if (this.els.cancelBtn) {
        this.els.cancelBtn.addEventListener('click', () => this.close());
      }
      if (this.els.backdrop) {
        this.els.backdrop.addEventListener('click', () => this.close());
      }

      // Filters
      if (this.els.dateFrom) {
        this.els.dateFrom.addEventListener('change', () => this.applyFilters());
      }
      if (this.els.dateTo) {
        this.els.dateTo.addEventListener('change', () => this.applyFilters());
      }
      if (this.els.typeSelect) {
        this.els.typeSelect.addEventListener('change', () => this.applyFilters());
      }
      if (this.els.keywordInput) {
        this.els.keywordInput.addEventListener('input', () => this.applyFilters());
      }
      if (this.els.companyInput) {
        this.els.companyInput.addEventListener('input', () => this.applyFilters());
      }

      // Mail recipients
      if (this.els.mailToInput) {
        this.els.mailToInput.addEventListener('change', () => this.saveMailRecipients());
        this.els.mailToInput.addEventListener('blur', () => this.saveMailRecipients());
      }

      // Buttons
      if (this.els.exportBtn) {
        this.els.exportBtn.addEventListener('click', () => this.exportCsv());
      }
      if (this.els.printBtn) {
        this.els.printBtn.addEventListener('click', () => this.print());
      }
      if (this.els.mailBtn) {
        this.els.mailBtn.addEventListener('click', () => this.sendMail());
      }

      // Sort khi click tiêu đề cột
      if (this.els.tableHead) {
        this.els.tableHead.addEventListener('click', (e) => {
          const th = e.target.closest('th.sortable');
          if (!th) return;
          const key = th.getAttribute('data-sort-key') || 'date';

          if (this.state.sortKey === key) {
            this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            this.state.sortKey = key;
            this.state.sortDir = (key === 'date') ? 'desc' : 'asc';
          }

          this.applyFilters();
        });
      }

      // Vuốt xuống để đóng popup (mobile) – ưu tiên vuốt từ khối Lọc
      const swipeTarget = this.els.filters || this.els.header || this.els.dialog;
      if (swipeTarget) {
        let startY = null;
        let startX = null;
        let lastY = null;
        let lastX = null;

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

          // Vuốt chủ yếu theo chiều dọc xuống, dài hơn 80px
          if (dy > 80 && Math.abs(dx) < 60) {
            this.close();
          }
          startY = startX = lastY = lastX = null;
        });

        swipeTarget.addEventListener('touchcancel', () => {
          startY = startX = lastY = lastX = null;
        });
      }
    },

    applyDefaultDateRange() {
      if (!this.els.dateFrom || !this.els.dateTo) return;
      const today = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(today.getMonth() - 1);

      const from = oneMonthAgo.toISOString().split('T')[0];
      const to = today.toISOString().split('T')[0];

      this.els.dateFrom.value = from;
      this.els.dateTo.value = to;
    },

    applyFilters() {
      const all = this.state.allEvents || [];
      const from = this.els.dateFrom ? this.els.dateFrom.value : '';
      const to = this.els.dateTo ? this.els.dateTo.value : '';
      const typeFilter = this.els.typeSelect ? this.els.typeSelect.value : 'all';
      const keyword = this.els.keywordInput ? toLower(this.els.keywordInput.value) : '';
      const companyStr = this.els.companyInput ? toLower(this.els.companyInput.value) : '';

      const filtered = all.filter(ev => {
        const dk = ev.EventDateKey || '';
        if (from && dk < from) return false;
        if (to && dk > to) return false;

        if (typeFilter === 'rack') {
          if (ev.EventType !== 'location-change') return false;
        } else if (typeFilter === 'ship') {
          if (!['ship-out', 'ship-in', 'shipment'].includes(ev.EventType)) return false;
        }

        if (keyword) {
          const code = toLower(ev.ItemCode || '');
          const name = toLower(ev.ItemName || '');
          if (!code.includes(keyword) && !name.includes(keyword)) return false;
        }

        if (companyStr) {
          const fromC = toLower(ev.FromCompanyName || '');
          const toC = toLower(ev.ToCompanyName || '');
          if (!fromC.includes(companyStr) && !toC.includes(companyStr)) return false;
        }

        return true;
      });

      this.sortEvents(filtered);
      this.state.filteredEvents = filtered;
      this.renderTable(filtered);
      this.updateSummary(filtered, from, to);
    },
    sortEvents(events) {
      const key = this.state.sortKey || 'date';
      const dir = this.state.sortDir === 'asc' ? 1 : -1;

      events.sort((a, b) => {
        let va = '';
        let vb = '';

        switch (key) {
          case 'item':
            va = (a.ItemCode || '') + ' ' + (a.ItemName || '');
            vb = (b.ItemCode || '') + ' ' + (b.ItemName || '');
            break;
          case 'type':
            va = a.EventTypeLabelJa || '';
            vb = b.EventTypeLabelJa || '';
            break;
          case 'fromto':
            va = (a.FromCompanyName || a.FromRackLayer || '') + ' ' + (a.ToCompanyName || a.ToRackLayer || '');
            vb = (b.FromCompanyName || b.FromRackLayer || '') + ' ' + (b.ToCompanyName || b.ToRackLayer || '');
            break;
          case 'notes':
            va = a.Notes || '';
            vb = b.Notes || '';
            break;
          case 'handler':
            va = a.Handler || '';
            vb = b.Handler || '';
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

        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();

        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });

      // Cập nhật trạng thái visual trên header
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

    renderTable(events) {
      if (!this.els.tableBody) return;
      this.els.tableBody.innerHTML = '';

      if (!events || !events.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.textAlign = 'center';
        td.style.padding = '8px';
        td.textContent = '履歴がありません / Không có dữ liệu lịch sử';
        tr.appendChild(td);
        this.els.tableBody.appendChild(tr);
        return;
      }

      events.forEach(ev => {
        const tr = document.createElement('tr');

        // Date column
        const dateTd = document.createElement('td');
        dateTd.textContent = formatDateTime(ev.EventDate);

        // Item column (clickable)
        const itemTd = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'hist-item-link';
        btn.innerHTML = `
<div class="hist-item-code">${ev.ItemCode || ''}</div>
<div class="hist-item-name">${ev.ItemName || ''}</div>
`;

        btn.addEventListener('click', () => {
          const dm = window.DataManager;
          if (!dm || !dm.data) return;
          const data = dm.data;

          let item = null;
          let itemType = ev.ItemType;

          if (itemType === 'mold') {
            const moldId = String(ev.MoldID || ev.ItemId || '').trim();
            if (!moldId) return;
            const molds = Array.isArray(data.molds) ? data.molds : [];
            item = molds.find(m => String(m.MoldID).trim() === moldId);
            itemType = 'mold';
          } else if (itemType === 'cutter') {
            const cutterId = String(ev.CutterID || ev.ItemId || '').trim();
            if (!cutterId) return;
            const cutters = Array.isArray(data.cutters) ? data.cutters : [];
            item = cutters.find(c => String(c.CutterID).trim() === cutterId);
            itemType = 'cutter';
          }

          if (!item) {
            console.warn('HistoryView: item not found for history row', ev);
            return;
          }

          // 🔁 Phân nhánh theo thiết bị
          if (window.innerWidth < 768 && window.MobileDetailModal) {
            // 📱 iPhone: Mở MobileDetailModal
            const evt = new CustomEvent('showMobileDetail', {
              detail: { item, type: itemType }
            });
            document.dispatchEvent(evt);
            console.log('HistoryView: showMobileDetail dispatched from history table');
          } else if (window.UIRenderer && typeof window.UIRenderer.showDetail === 'function') {
            // 💻 iPad / Desktop: Gọi UIRenderer.showDetail
            window.UIRenderer.showDetail(item, itemType);
            console.log('HistoryView: UIRenderer.showDetail called from history table');
          }
        });

        itemTd.appendChild(btn);

        // Type column
        const typeTd = document.createElement('td');
        typeTd.innerHTML = `
${ev.EventTypeLabelJa || ''}<br>
<span class="hist-type-vi">${ev.EventTypeLabelVi || ''}</span>
`;

        // From-To column
        const fromToTd = document.createElement('td');
        if (ev.EventType === 'location-change') {
          fromToTd.innerHTML = `
<span class="hist-from-label">From:</span> Rack ${ev.FromRackLayer || '-'}<br>
<span class="hist-to-label">To:</span> Rack ${ev.ToRackLayer || '-'}
`;
        } else {
          fromToTd.innerHTML = `
<span class="hist-from-label">From:</span> ${ev.FromCompanyName || '-'}<br>
<span class="hist-to-label">To:</span> ${ev.ToCompanyName || '-'}
`;
        }

        // Notes column
        const notesTd = document.createElement('td');
        notesTd.textContent = ev.Notes || '';

        // Handler column
        const staffTd = document.createElement('td');
        staffTd.textContent = ev.Handler || '-';

        tr.appendChild(dateTd);
        tr.appendChild(itemTd);
        tr.appendChild(typeTd);
        tr.appendChild(fromToTd);
        tr.appendChild(notesTd);
        tr.appendChild(staffTd);

        this.els.tableBody.appendChild(tr);
      });
    },

    updateSummary(filtered, from, to) {
      if (!this.els.summaryEl) return;
      const total = this.state.allEvents.length;
      const shown = filtered.length;

      let dateRange = '-';
      if (from && to) {
        dateRange = `${from} 〜 ${to}`;
      } else if (from) {
        dateRange = `${from} 〜`;
      } else if (to) {
        dateRange = `〜 ${to}`;
      }

      this.els.summaryEl.textContent =
        `表示 ${shown} / 全${total} 件 （期間: ${dateRange}） / Đang hiển thị ${shown} / tổng ${total} bản ghi`;
    },

    open() {
      if (!this.els.root) return;
      this.els.root.classList.add('hist-open');
    },

    close() {
      if (!this.els.root) return;
      this.els.root.classList.remove('hist-open');
    },

    exportCsv() {
      const events = this.state.filteredEvents || [];
      if (!events || !events.length) {
        alert('エクスポートするデータがありません。\nKhông có dữ liệu để xuất.');
        return;
      }

      // ✅ UTF-8 BOM for Japanese characters
      let csv = '\ufeff日付 / Date,コード / Code,名称 / Name,種類 / Type,From,To,備考 / Notes,担当 / Handler\n';

      events.forEach(ev => {
        const row = [
          formatDateTime(ev.EventDate),
          ev.ItemCode || '',
          ev.ItemName || '',
          ev.EventTypeLabelJa || '',
          ev.FromCompanyName || ev.FromRackLayer || '',
          ev.ToCompanyName || ev.ToRackLayer || '',
          (ev.Notes || '').replace(/\r?\n/g, ' '),
          ev.Handler || ''
        ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');

        csv += row + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'history_' + new Date().toISOString().split('T')[0] + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[HistoryView] CSV exported:', events.length, 'records');
    },

    print() {
      const events = this.state.filteredEvents || [];
      if (!events || !events.length) {
        alert('印刷するデータがありません。\nKhông có dữ liệu để in.');
        return;
      }

      const win = window.open('', '_blank');
      if (!win) return;

      let rowsHtml = '';
      events.forEach((ev, idx) => {
        const fromTo = ev.EventType === 'location-change'
          ? `Rack ${ev.FromRackLayer || '-'} → Rack ${ev.ToRackLayer || '-'}`
          : `${ev.FromCompanyName || '-'} → ${ev.ToCompanyName || '-'}`;

        rowsHtml += `
<tr>
  <td style="text-align:center;">${idx + 1}</td>
  <td style="text-align:center;">${formatDateTime(ev.EventDate)}</td>
  <td>${ev.ItemCode || ''}</td>
  <td>${ev.ItemName || ''}</td>
  <td>${ev.EventTypeLabelJa || ''}</td>
  <td>${fromTo}</td>
  <td>${ev.Notes || ''}</td>
  <td>${ev.Handler || ''}</td>
</tr>
`;
      });

      win.document.write(
        '<html><head><meta charset="utf-8"><title>履歴一覧 / History Report</title>'
        + '<style>'
        + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:11px;margin:20px;}'
        + 'h3{margin:10px 0;}'
        + 'table{border-collapse:collapse;width:100%;}'
        + 'th,td{border:1px solid #ccc;padding:4px 6px;}'
        + 'th{background:#e3f2fd;font-size:10px;}'
        + '</style></head><body>'
        + '<h3>履歴一覧 / History Report</h3>'
        + '<table><thead><tr>'
        + '<th>No</th><th>日付 / Date</th><th>コード / Code</th><th>名称 / Name</th>'
        + '<th>種類 / Type</th><th>From → To</th><th>備考 / Notes</th><th>担当 / Handler</th>'
        + '</tr></thead><tbody>'
        + rowsHtml
        + '</tbody></table>'
        + '<script>window.print();<\/script>'
        + '</body></html>'
      );

      win.document.close();
      console.log('[HistoryView] Print window opened:', events.length, 'records');
    },

    sendMail() {
      const events = this.state.filteredEvents || [];
      if (!events || !events.length) {
        alert('メール送信するデータがありません。\nKhông có dữ liệu để gửi mail.');
        return;
      }

      const maxLines = 50;
      const lines = [];

      lines.push('【履歴一覧 / History Report】');
      lines.push('');
      lines.push('※ この表を等幅フォント (Courier, Consolas, MS Gothic) で表示してください。');
      lines.push('※ Please view this table with a monospace font.');
      lines.push('');

      // Header with fixed width columns
      const separator = '='.repeat(110);
      lines.push(separator);

      const headerLine =
        padRight('No', 4) +
        padRight('日付 / Date', 18) +
        padRight('コード', 14) +
        padRight('名称', 16) +
        padRight('種類', 12) +
        padRight('From → To', 30) +
        padRight('担当', 16);

      lines.push(headerLine);
      lines.push(separator);

      // Data rows
      events.slice(0, maxLines).forEach((ev, idx) => {
        const no = padRight(String(idx + 1), 4);
        const date = padRight(formatDateTime(ev.EventDate).substring(0, 16), 18);
        const code = padRight(truncate(ev.ItemCode || '-', 12), 14);
        const name = padRight(truncate(ev.ItemName || '-', 14), 16);
        const type = padRight(truncate(ev.EventTypeLabelJa || '-', 10), 12);

        const fromTo = ev.EventType === 'location-change'
          ? `R${ev.FromRackLayer || '-'} → R${ev.ToRackLayer || '-'}`
          : `${truncate(ev.FromCompanyName || '-', 12)} → ${truncate(ev.ToCompanyName || '-', 12)}`;
        const fromToCell = padRight(truncate(fromTo, 28), 30);

        const handler = truncate(ev.Handler || '-', 14);

        const row = no + date + code + name + type + fromToCell + handler;
        lines.push(row);
      });

      lines.push(separator);

      if (events.length > maxLines) {
        lines.push('');
        lines.push('... 他 ' + (events.length - maxLines) + ' 件のデータがあります。');
        lines.push('... Other ' + (events.length - maxLines) + ' records exist.');
      }

      lines.push('');
      lines.push('---');
      lines.push('この一覧は MoldCutterSearch システムから自動生成されました。');
      lines.push('This report is auto-generated from MoldCutterSearch system.');
      lines.push('詳細は F:/MoldCutterSearch/index.html をご覧ください。');

      const body = encodeURIComponent(lines.join('\n'));
      const subject = encodeURIComponent('履歴一覧 / History Report - ' + new Date().toISOString().slice(0, 10));

      // Get recipients
      const recipientsRaw = this.els.mailToInput ? this.els.mailToInput.value : '';
      const recipients = recipientsRaw
        ? recipientsRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean).join(';')
        : '';

      const mailto = recipients
        ? `mailto:${recipients}?subject=${subject}&body=${body}`
        : `mailto:?subject=${subject}&body=${body}`;

      window.location.href = mailto;
      console.log('[HistoryView] Mail mailto link triggered:', events.length, 'records');
    },

    loadMailRecipients() {
      if (!this.els.mailToInput) return;
      try {
        const raw = localStorage.getItem('historyMailRecipients') || '';
        this.els.mailToInput.value = raw;
      } catch (e) {
        console.warn('[HistoryView] Cannot load mail recipients from localStorage', e);
      }
    },

    saveMailRecipients() {
      if (!this.els.mailToInput) return;
      try {
        const raw = this.els.mailToInput.value || '';
        localStorage.setItem('historyMailRecipients', raw);
      } catch (e) {
        console.warn('[HistoryView] Cannot save mail recipients to localStorage', e);
      }
    }
  };

  // ========= Module Initialization =========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistoryView.init());
  } else {
    HistoryView.init();
  }

  // Export for debugging
  window.HistoryView = HistoryView;

})();
