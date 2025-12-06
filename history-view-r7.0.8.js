/**
 * history-view-r7.0.8.js
 * ===========================================================
 * Popup Lịch sử (履歴) cho Mold/Cutter
 * - Mở bằng nút History trên navibar (bottom-nav-item[data-tab="history"])
 * - Không thay đổi layout hiện tại (popup overlay trên màn hình Search)
 *
 * Dữ liệu:
 *  - DataManager.data.locationlog  (đổi RackLayer)  [file:11]
 *  - DataManager.data.shiplog      (vận chuyển)     [file:13]
 *  - DataManager.data.molds / cutters / companies   [file:12]
 *
 * Tạo mảng chuẩn hóa: DataManager.historyEvents
 *  - EventType: location-change / ship-out / ship-in / shipment
 *  - Thuộc tính song ngữ Nhật - Việt để hiển thị.
 * ===========================================================
 */

(function () {
  'use strict';

    // Lấy dữ liệu lịch sử trực tiếp từ GitHub (giống statuslogs.csv trong ui-renderer) [file:2]
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


  const DATE_FMT_OPTIONS = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

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
      filteredEvents: []
    },

    els: {
      root: null,
      backdrop: null,
      dialog: null,
      tableBody: null,
      dateFrom: null,
      dateTo: null,
      typeSelect: null,
      keywordInput: null,
      companyInput: null,
      summaryEl: null,
      exportBtn: null,
      printBtn: null,
      mailBtn: null,
      closeBtn: null
    },

    init() {
      if (this.state.initialized) return;

      this.injectStyles();
      this.createModal();
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
          height: 90vh;        /* Gần full chiều cao màn hình */
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
        }
        .hist-title {
          font-size: 16px;
          font-weight: 600;
        }
        .hist-title span {
          display: block;
          line-height: 1.3;
        }
        .hist-title .vi {
          font-size: 12px;
          color: #555;
        }
        .hist-close {
          border: none;
          background: transparent;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
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
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 6px 8px;
          background: #fafafa;
          font-size: 12px;
        }
        .hist-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          margin-bottom: 4px;
        }
        .hist-filter-row label {
          font-size: 11px;
        }
        .hist-filter-row input,
        .hist-filter-row select {
          font-size: 11px;
          padding: 2px 4px;
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
          justify-content: flex-end;
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
            height: 100vh;       /* Full màn hình trên mobile */
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
            </div>

            <div class="hist-table-wrap">
              <table id="history-table" class="hist-table">
                <thead>
                  <tr>
                    <th>日付 / Ngày giờ</th>
                    <th>コード・名称 / Mã & tên</th>
                    <th>種類 / Loại</th>
                    <th>From → To</th>
                    <th>備考 / Ghi chú</th>
                    <th>ID</th>
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
      this.els.tableBody = root.querySelector('#history-table tbody');
      this.els.dateFrom = root.querySelector('#history-date-from');
      this.els.dateTo = root.querySelector('#history-date-to');
      this.els.typeSelect = root.querySelector('#history-type-select');
      this.els.keywordInput = root.querySelector('#history-keyword');
      this.els.companyInput = root.querySelector('#history-company-input');
      this.els.summaryEl = root.querySelector('#history-summary');
      this.els.exportBtn = root.querySelector('#history-export-csv');
      this.els.printBtn = root.querySelector('#history-print');
      this.els.mailBtn = root.querySelector('#history-send-mail');
      this.els.closeBtn = root.querySelector('.hist-close');

      if (this.els.backdrop) {
        this.els.backdrop.addEventListener('click', () => this.close());
      }
      if (this.els.closeBtn) {
        this.els.closeBtn.addEventListener('click', () => this.close());
      }
    },

    bindTriggers() {
      const selectors = [
        '.bottom-nav-item[data-tab="history"]',
        '#nav-history',
        '.btn-history',
        '[data-role="history-trigger"]'
      ];

      const bound = new Set();
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
          if (bound.has(btn)) return;
          bound.add(btn);
          btn.addEventListener('click', (e) => {
            // Ngăn không cho script tab khác can thiệp (không đổi layout)
            e.preventDefault();
            e.stopPropagation();
            this.open();
          }, true); // capture để chắn sớm
        });
      });

      console.log('[HistoryView] Bound triggers:', bound.size);
    },

    bindInsideEvents() {
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
      if (this.els.exportBtn) {
        this.els.exportBtn.addEventListener('click', () => this.exportCsv());
      }
      if (this.els.printBtn) {
        this.els.printBtn.addEventListener('click', () => this.print());
      }
      if (this.els.mailBtn) {
        this.els.mailBtn.addEventListener('click', () => this.sendMail());
      }
            // Click tên thiết bị → mở modal chi tiết
      if (this.els.tableBody) {
        this.els.tableBody.addEventListener('click', (e) => {
          const btn = e.target.closest('.hist-item-link');
          if (!btn) return;
          const type = (btn.getAttribute('data-type') || '').toLowerCase();
          const id = btn.getAttribute('data-id') || '';
          if (!type || !id) return;
          this.openItemDetail(type, id);
        });
      }


      document.addEventListener('history:focus-item', (e) => {
        const detail = e.detail || {};
        const code = detail.code || '';
        if (code && this.els.keywordInput) {
          this.open();
          this.els.keywordInput.value = code;
          this.applyFilters();
        }
      });
    },

        openItemDetail(itemType, itemId) {
      const dm = window.DataManager;
      if (!dm || !dm.data) return;

      const isMold = itemType === 'mold';
      const list = isMold ? (dm.data.molds || []) : (dm.data.cutters || []);
      const key = isMold ? 'MoldID' : 'CutterID';
      const item = list.find(row => String(row[key]) === String(itemId));
      if (!item) {
        alert('対象データが見つかりません / Không tìm thấy dữ liệu thiết bị.');
        return;
      }

      const type = isMold ? 'mold' : 'cutter';
      const id = String(itemId);

      const isMobile = window.innerWidth <= 1024;
      if (isMobile && window.MobileDetailModal && typeof window.MobileDetailModal.show === 'function') {
        console.log('[HistoryView] Open MobileDetailModal from history, id:', id, 'type:', type);
        window.MobileDetailModal.show(item, type);
        return;
      }

      // Desktop: phát event detailchanged giống các module khác
      const evt = new CustomEvent('detailchanged', {
        detail: {
          item,
          itemType: type,
          itemId: id,
          source: 'history'
        }
      });
      document.dispatchEvent(evt);
      console.log('[HistoryView] detailchanged dispatched from history, id:', id, 'type:', type);
    },


    open() {
      if (!this.state.initialized) this.init();
      if (this.els.root) {
        this.els.root.classList.add('hist-open');
        document.body.style.overflow = 'hidden';
      }
      this.applyFilters();
    },

    close() {
      if (this.els.root) {
        this.els.root.classList.remove('hist-open');
        document.body.style.overflow = '';
      }
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
        dm.data.companies || []
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
        companies: base + 'companies.csv'
      };

      Promise.all([
        fetchText(urls.location),
        fetchText(urls.ship),
        fetchText(urls.molds),
        fetchText(urls.cutters),
        fetchText(urls.companies)
      ])
        .then(([locationText, shipText, moldsText, cuttersText, companiesText]) => {
          const locationlog = parseCsv(locationText);
          const shiplog = parseCsv(shipText);
          const molds = parseCsv(moldsText);
          const cutters = parseCsv(cuttersText);
          const companies = parseCsv(companiesText);

          this.buildHistoryEvents(locationlog, shiplog, molds, cutters, companies);
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

    buildHistoryEvents(locationlog, shiplog, molds, cutters, companies) {
      const moldById = new Map();
      molds.forEach(m => {
        if (m.MoldID) moldById.set(String(m.MoldID), m);
      });

      const cutterById = new Map();
      cutters.forEach(c => {
        if (c.CutterID) cutterById.set(String(c.CutterID), c);
      });

      const companyById = new Map();
      companies.forEach(c => {
        const id = String(c.CompanyID || c.ID || '');
        if (id) companyById.set(id, c);
      });

      const events = [];

      // 1) LocationLog → đổi rack
      locationlog.forEach(row => {
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
          Handler: ''
        });
      });

      // 2) Shiplog → vận chuyển giữa công ty
      shiplog.forEach(row => {
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
          Handler: row.handler || row.Handler || ''
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
        companies: base + 'companies.csv'
      };

      Promise.all([
        fetchText(urls.location),
        fetchText(urls.ship),
        fetchText(urls.molds),
        fetchText(urls.cutters),
        fetchText(urls.companies)
      ])
        .then(([locationText, shipText, moldsText, cuttersText, companiesText]) => {
          const locationlog = parseCsv(locationText);
          const shiplog = parseCsv(shipText);
          const molds = parseCsv(moldsText);
          const cutters = parseCsv(cuttersText);
          const companies = parseCsv(companiesText);

          this.buildHistoryEvents(locationlog, shiplog, molds, cutters, companies);
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

    buildHistoryEvents(locationlog, shiplog, molds, cutters, companies) {
      const moldById = new Map();
      molds.forEach(m => {
        if (m.MoldID) moldById.set(String(m.MoldID), m);
      });

      const cutterById = new Map();
      cutters.forEach(c => {
        if (c.CutterID) cutterById.set(String(c.CutterID), c);
      });

      const companyById = new Map();
      companies.forEach(c => {
        const id = String(c.CompanyID || c.ID || '');
        if (id) companyById.set(id, c);
      });

      const events = [];

      // 1) LocationLog → 位置変更 [file:11][file:12]
      locationlog.forEach(row => {
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
          Handler: ''
        });
      });

      // 2) Shiplog → 出荷・返却 [file:13][file:12]
      shiplog.forEach(row => {
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
          Handler: row.handler || row.Handler || ''
        });
      });

      events.sort((a, b) => {
        const da = new Date(a.EventDate || a.EventDateKey);
        const db = new Date(b.EventDate || b.EventDateKey);
        return db - da;
      });

      this.state.allEvents = events.slice();
      // Nếu muốn share cho chỗ khác dùng:
      if (window.DataManager) {
        window.DataManager.historyEvents = events;
      }
    },


    applyDefaultDateRange() {
      if (!this.els.dateFrom || !this.els.dateTo) return;
      const all = this.state.allEvents;
      if (!all.length) return;
      const newest = all[0];
      const newestDate = newest.EventDate || newest.EventDateKey || '';
      const d = new Date(newestDate);
      if (Number.isNaN(d.getTime())) return;

      const toKey = getDateKey(d);
      const from = new Date(d.getTime() - 29 * 24 * 60 * 60 * 1000);
      const fromKey = getDateKey(from);

      this.els.dateFrom.value = fromKey;
      this.els.dateTo.value = toKey;
    },

    applyFilters() {
      const all = this.state.allEvents || [];
      if (!all.length || !this.els.tableBody) {
        this.renderTable([]);
        return;
      }

      const fromStr = this.els.dateFrom ? this.els.dateFrom.value : '';
      const toStr = this.els.dateTo ? this.els.dateTo.value : '';
      const typeVal = this.els.typeSelect ? this.els.typeSelect.value : 'all';
      const keyword = toLower(this.els.keywordInput ? this.els.keywordInput.value : '');
      const company = toLower(this.els.companyInput ? this.els.companyInput.value : '');

      const fromTime = fromStr ? new Date(fromStr + 'T00:00:00').getTime() : null;
      const toTime = toStr ? new Date(toStr + 'T23:59:59').getTime() : null;

      const filtered = all.filter(ev => {
        const t = new Date(ev.EventDate || ev.EventDateKey).getTime();
        if (!Number.isNaN(t)) {
          if (fromTime !== null && t < fromTime) return false;
          if (toTime !== null && t > toTime) return false;
        }

                if (typeVal && typeVal !== 'all') {
          if (typeVal === 'rack') {
            // Nhóm 1: chỉ log đổi rack
            if (ev.EventType !== 'location-change') return false;
          } else if (typeVal === 'ship') {
            // Nhóm 2: tất cả log vận chuyển / giữa công ty
            if (['ship-out', 'ship-in', 'shipment'].indexOf(ev.EventType) === -1) return false;
          }
        }


        if (keyword) {
          const hay = [
            ev.ItemCode,
            ev.ItemName,
            ev.MoldID,
            ev.CutterID,
            ev.Notes,
            ev.Handler
          ].map(toLower).join(' ');
          if (!hay.includes(keyword)) return false;
        }

        if (company) {
          const fromName = toLower(ev.FromCompanyName);
          const toName = toLower(ev.ToCompanyName);
          if (!fromName.includes(company) && !toName.includes(company)) return false;
        }

        return true;
      });

      this.state.filteredEvents = filtered;
      this.renderTable(filtered);
      this.updateSummary();
    },

    renderTable(events) {
      const tbody = this.els.tableBody;
      if (!tbody) return;

      if (!events || !events.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:6px;">
              履歴がありません / Không có dữ liệu lịch sử
            </td>
          </tr>
        `;
        return;
      }

      const frag = document.createDocumentFragment();

      events.forEach(ev => {
        const tr = document.createElement('tr');

        const dateTd = document.createElement('td');
        dateTd.textContent = formatDateTime(ev.EventDate || ev.EventDateKey);

                const itemTd = document.createElement('td');
        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'hist-item-link';
        linkBtn.setAttribute('data-type', ev.ItemType || '');
        linkBtn.setAttribute('data-id', ev.ItemId || '');
        // Hiển thị cả code và tên trên nút
        const codeSpan = document.createElement('span');
        codeSpan.className = 'hist-item-code';
        codeSpan.textContent = ev.ItemCode || '-';
        linkBtn.appendChild(codeSpan);
        if (ev.ItemName) {
          linkBtn.appendChild(document.createElement('br'));
          const nameSpan = document.createElement('span');
          nameSpan.className = 'hist-item-name';
          nameSpan.textContent = ev.ItemName;
          linkBtn.appendChild(nameSpan);
        }
        itemTd.appendChild(linkBtn);


        const typeTd = document.createElement('td');
        const jaSpan = document.createElement('span');
        jaSpan.textContent = ev.EventTypeLabelJa || '';
        const viSpan = document.createElement('span');
        viSpan.className = 'hist-type-vi';
        viSpan.textContent = ev.EventTypeLabelVi ? (' / ' + ev.EventTypeLabelVi) : '';
        typeTd.appendChild(jaSpan);
        typeTd.appendChild(viSpan);

        const fromToTd = document.createElement('td');
        const fromParts = [];
        const toParts = [];
        if (ev.FromRackLayer) fromParts.push('Rack ' + ev.FromRackLayer);
        if (ev.FromCompanyName) fromParts.push(ev.FromCompanyName);
        if (ev.ToRackLayer) toParts.push('Rack ' + ev.ToRackLayer);
        if (ev.ToCompanyName) toParts.push(ev.ToCompanyName);
        const fromText = fromParts.join(' / ') || '-';
        const toText = toParts.join(' / ') || '-';
        fromToTd.innerHTML =
          `<span class="hist-from-label">From:</span> ${fromText}<br>` +
          `<span class="hist-to-label">To:</span> ${toText}`;

        const notesTd = document.createElement('td');
        const notesText = ev.Notes || '';
        const handlerText = ev.Handler ? `(${ev.Handler})` : '';
        notesTd.textContent = [notesText, handlerText].filter(Boolean).join(' ');

        const idTd = document.createElement('td');
        if (ev.MoldID) {
          idTd.textContent = `MoldID: ${ev.MoldID}`;
        } else if (ev.CutterID) {
          idTd.textContent = `CutterID: ${ev.CutterID}`;
        } else {
          idTd.textContent = ev.EventID || '';
        }

        tr.appendChild(dateTd);
        tr.appendChild(itemTd);
        tr.appendChild(typeTd);
        tr.appendChild(fromToTd);
        tr.appendChild(notesTd);
        tr.appendChild(idTd);

        frag.appendChild(tr);
      });

      tbody.innerHTML = '';
      tbody.appendChild(frag);
    },

    updateSummary() {
      if (!this.els.summaryEl) return;
      const total = this.state.allEvents.length;
      const shown = this.state.filteredEvents.length;
      const from = this.els.dateFrom ? this.els.dateFrom.value : '';
      const to = this.els.dateTo ? this.els.dateTo.value : '';
      const rangeJa = (from || to) ? `${from || '?'} ～ ${to || '?'}` : '全期間';

      this.els.summaryEl.textContent =
        `表示 ${shown} / 全${total} 件 （期間: ${rangeJa}） / ` +
        `Đang hiển thị ${shown} / tổng ${total} bản ghi`;
    },

    exportCsv() {
      const rows = this.state.filteredEvents || [];
      if (!rows.length) {
        alert('出力する履歴がありません / Không có dữ liệu để xuất.');
        return;
      }

      const header = [
        'EventID','Source','EventType','EventTypeJa','EventTypeVi',
        'ItemType','ItemId','ItemCode','ItemName','EventDate',
        'FromRackLayer','ToRackLayer','FromCompany','ToCompany',
        'Direction','Notes','Handler'
      ];

      const lines = [];
      lines.push(header.join(','));

      rows.forEach(ev => {
        const line = [
          ev.EventID,
          ev.Source,
          ev.EventType,
          ev.EventTypeLabelJa,
          ev.EventTypeLabelVi,
          ev.ItemType,
          ev.ItemId,
          ev.ItemCode,
          ev.ItemName,
          formatDateTime(ev.EventDate || ev.EventDateKey),
          ev.FromRackLayer,
          ev.ToRackLayer,
          ev.FromCompanyName,
          ev.ToCompanyName,
          ev.Direction,
          (ev.Notes || '').replace(/\r?\n/g, ' '),
          (ev.Handler || '').replace(/\r?\n/g, ' ')
        ].map(v => {
          const s = String(v == null ? '' : v);
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        }).join(',');
        lines.push(line);
      });

      const csvContent = '\uFEFF' + lines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const todayKey = getDateKey(new Date());
      a.href = url;
      a.download = `history-${todayKey}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

      const payload = { eventsCount: events.length, filters };
      const evt = new CustomEvent('history-report-send', { detail: payload });
      document.dispatchEvent(evt);

      alert('履歴レポート送信要求を発行しました / Đã phát yêu cầu gửi báo cáo lịch sử.\nバックエンド側で処理を行ってください。');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistoryView.init(), { once: true });
  } else {
    HistoryView.init();
  }

  window.HistoryView = HistoryView;
})();
