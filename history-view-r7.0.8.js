/**
 * history-view-r7.0.8.js
 * ===========================================================
 * Popup Lịch sử (履歴) cho Mold/Cutter
 * - Mở bằng nút History trên navibar (bottom-nav-item[data-tab="history"])
 * - Không thay đổi layout hiện tại (popup overlay trên màn hình Search)
 *
 * Dữ liệu:
 *   - DataManager.data.locationlog (đổi RackLayer)
 *   - DataManager.data.shiplog (vận chuyển)
 *   - DataManager.data.molds / cutters / companies / employees
 *
 * Tạo mảng chuẩn hóa: DataManager.historyEvents
 *   - EventType: location-change / ship-out / ship-in / shipment
 *   - Thuộc tính song ngữ Nhật - Việt để hiển thị.
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
      console.log('[HistoryView] Initialized with', this.state.allEvents.length, 'events');
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
          padding: 10px 12px 12px;
        }
        .hist-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          padding: 6px 8px;
          border-radius: 8px;
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
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
          color: #ffffff;
        }
        .hist-summary {
          font-size: 12px;
          color: #555;
          text-align: right;
          margin-bottom: 4px;
        }
        .hist-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow: hidden;
        }
        .hist-filters {
          border: 1px solid #bbdefb;
          border-radius: 8px;
          padding: 6px 8px;
          background: linear-gradient(180deg, #e3f2fd 0%, #ffffff 60%);
          font-size: 12px;
        }
        .hist-filter-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 12px;
          margin-bottom: 4px;
        }
        .hist-filter-row label {
          font-size: 11px;
          min-width: 90px;
          color: #0d47a1;
          font-weight: 600;
        }
        .hist-filter-row input,
        .hist-filter-row select {
          font-size: 11px;
          padding: 3px 4px;
          border-radius: 4px;
          border: 1px solid #b0bec5;
        }
        .hist-table-wrap {
          flex: 1 1 auto;
          max-height: 55vh;
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
          padding: 3px 5px;
          vertical-align: top;
        }
        .hist-table th {
          background: #f5f5f5;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .hist-table th.sortable {
          cursor: pointer;
          background: #e3f2fd;
          color: #0d47a1;
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
        }
        .hist-actions {
          margin-top: 4px;
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
          font-size: 11px;
          padding: 4px 8px;
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
        @media (max-width: 600px) {
          .hist-dialog {
            width: 100%;
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
            padding: 8px 8px 10px;
          }
          .hist-table-wrap {
            max-height: calc(100vh - 210px);
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
                <label for="history-date-from">日付（自）/ Từ ngày:</label>
                <input type="date" id="history-date-from">
                <label for="history-date-to">（至）/ Đến ngày:</label>
                <input type="date" id="history-date-to">
              </div>
              <div class="hist-filter-row">
                <label for="history-type-select">種類 / Loại:</label>
                <select id="history-type-select">
                  <option value="all">すべて / Tất cả</option>
                  <option value="rack">ラック履歴のみ / Chỉ thay đổi rack</option>
                  <option value="ship">出荷・会社間移動 / Chỉ vận chuyển</option>
                </select>
                <label for="history-company-input">会社 / Công ty:</label>
                <input type="text" id="history-company-input"
                       placeholder="会社名でフィルタ / Lọc theo tên công ty">
              </div>
              <div class="hist-filter-row">
                <label for="history-keyword">コード・名称 / Mã, tên:</label>
                <input type="text" id="history-keyword"
                       placeholder="例: TIH014, TOK001 / ví dụ: TIH014, TOK001">
              </div>
              <div class="hist-filter-row">
                <label for="history-mail-to">メール宛先 / Người nhận:</label>
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
                    <td colspan="6" style="text-align:center; padding:6px;">
                      履歴がありません / Không có dữ liệu lịch sử
                    </td>
                  </tr>
                </tbody>
              </table>
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
        </div>
      `;

      document.body.appendChild(root);

      this.els.root = root;
      this.els.backdrop = root.querySelector('.hist-backdrop');
      this.els.dialog = root.querySelector('.hist-dialog');
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
      // Nếu đã có dữ liệu thì không cần load lại
      if (this.state.allEvents && this.state.allEvents.length) return;
      if (this.state.loading) return;

      // Ưu tiên đọc trực tiếp từ GitHub
      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub();
        return;
      }

      // Fallback: dùng DataManager.data nếu cần (offline)
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
          'GitHubから履歴データを読込中… / Đang tải dữ liệu lịch sử từ GitHub…';
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
          handlerName = row.handler || row.Handler; // fallback nếu chưa gắn EmployeeID
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

      // Nếu muốn dùng chung ở nơi khác
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

      // Vuốt xuống để đóng popup (mobile)
      if (this.els.dialog) {
        let startY = null;
        let startX = null;
        let lastY = null;
        let lastX = null;

        this.els.dialog.addEventListener('touchstart', (e) => {
          if (!e.touches || !e.touches.length) return;
          const t = e.touches[0];
          startY = t.clientY;
          startX = t.clientX;
          lastY = t.clientY;
          lastX = t.clientX;
        }, { passive: true });

        this.els.dialog.addEventListener('touchmove', (e) => {
          if (!e.touches || !e.touches.length) return;
          const t = e.touches[0];
          lastY = t.clientY;
          lastX = t.clientX;
        }, { passive: true });

        this.els.dialog.addEventListener('touchend', () => {
          if (startY == null || lastY == null) return;
          const dy = lastY - startY;
          const dx = lastX - startX;
          // Vuốt chủ yếu theo chiều dọc xuống, dài hơn 80px
          if (dy > 80 && Math.abs(dx) < 60) {
            this.close();
          }
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
        td.style.padding = '6px';
        td.textContent = '履歴がありません / Không có dữ liệu lịch sử';
        tr.appendChild(td);
        this.els.tableBody.appendChild(tr);
        return;
      }

      events.forEach(ev => {
        const tr = document.createElement('tr');

        const dateTd = document.createElement('td');
        dateTd.textContent = formatDateTime(ev.EventDate);

        const itemTd = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'hist-item-link';
        btn.innerHTML = `
          <div class="hist-item-code">${ev.ItemCode || ''}</div>
          <div class="hist-item-name">${ev.ItemName || ''}</div>
        `;
        btn.addEventListener('click', () => {
          this.close();
          const detailEvt = new CustomEvent('history:item-select', {
            detail: { type: ev.ItemType, id: ev.ItemId }
          });
          document.dispatchEvent(detailEvt);
        });
        itemTd.appendChild(btn);

        const typeTd = document.createElement('td');
        typeTd.innerHTML = `
          ${ev.EventTypeLabelJa || ''}<br>
          <span class="hist-type-vi">${ev.EventTypeLabelVi || ''}</span>
        `;

        const fromToTd = document.createElement('td');
        if (ev.EventType === 'location-change') {
          fromToTd.innerHTML = `
            <span class="hist-from-label">From:</span> Rack ${ev.FromRackLayer}<br>
            <span class="hist-to-label">To:</span> Rack ${ev.ToRackLayer}
          `;
        } else {
          fromToTd.innerHTML = `
            <span class="hist-from-label">From:</span> ${ev.FromCompanyName || '-'}<br>
            <span class="hist-to-label">To:</span> ${ev.ToCompanyName || '-'}
          `;
        }

        const notesTd = document.createElement('td');
        notesTd.textContent = ev.Notes || '';

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
      let csv = 'Date,Code,Name,Type,From,To,Notes,Handler\n';
      events.forEach(ev => {
        const row = [
          formatDateTime(ev.EventDate),
          ev.ItemCode || '',
          ev.ItemName || '',
          ev.EventTypeLabelJa || '',
          ev.FromCompanyName || ev.FromRackLayer || '',
          ev.ToCompanyName || ev.ToRackLayer || '',
          ev.Notes || '',
          ev.Handler || ''
        ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        csv += row + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'history_' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    },

    print() {
      window.print();
    },

    sendMail() {
      const events = this.state.filteredEvents || [];
      const filters = {
        from: this.els.dateFrom ? this.els.dateFrom.value : '',
        to: this.els.dateTo ? this.els.dateTo.value : '',
        type: this.els.typeSelect ? this.els.typeSelect.value : 'all',
        keyword: this.els.keywordInput ? this.els.keywordInput.value : '',
        company: this.els.companyInput ? this.els.companyInput.value : ''
      };

      const recipientsRaw = this.els.mailToInput ? this.els.mailToInput.value : '';
      const recipients = recipientsRaw
        ? recipientsRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean)
        : [];

      const payload = {
        eventsCount: events.length,
        filters,
        recipients
      };

      const evt = new CustomEvent('history-report-send', {
        detail: payload
      });
      document.dispatchEvent(evt);

      alert(
        '履歴レポート送信要求を発行しました / Đã phát yêu cầu gửi báo cáo lịch sử.\n' +
        (recipients.length
          ? '宛先: ' + recipients.join(', ')
          : '※メール宛先が未設定です。設定フィールドでメールを登録してください。')
      );
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistoryView.init());
  } else {
    HistoryView.init();
  }
})();
