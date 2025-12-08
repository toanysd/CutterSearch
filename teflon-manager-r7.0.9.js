/**
 * teflon-manager-r7.0.9.js
 * テフロン加工履歴 / Lịch sử mạ Teflon モジュール
 *
 * - Hiển thị danh sách khuôn theo tình trạng mạ teflon từ teflonlog.csv
 * - Fallback: molds.csv (TeflonCoating, TeflonSentDate, TeflonReceivedDate)
 * - Join: MoldID → molds, RequestedBy/SentBy → employees, SupplierID → companies
 * - Giao diện: bảng + filter status + sort + modal chi tiết
 * - Mặc định chỉ hiển thị テフロン加工承認待ち, cảnh báo yêu cầu > 7 ngày (màu đỏ)
 * - Export CSV (UTF‑8 BOM), in, gửi mail (mailto)
 */

(function () {
  'use strict';

  let allRows = [];
  let filteredRows = [];
  let currentSort = { column: 'RequestedDate', order: 'desc' };
  let currentFilter = 'テフロン加工承認待ち';

  // ========= Helpers chung =========

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
      modalEl.style.transform = 'translateY(' + translateY + 'px)';
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

  function parseFlexibleDate(str) {
    if (!str || str === '') return null;
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const match = String(str).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = monthMap[match[2]];
      let year = parseInt(match[3], 10);
      year += (year < 50) ? 2000 : 1900;
      if (month !== undefined) return new Date(year, month, day);
    }

    const parts = String(str).split(/[\/\-]/);
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const dd = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(dd)) {
        return new Date(y, m - 1, dd);
      }
    }
    return null;
  }

  function formatDate(dateStr) {
    const d = parseFlexibleDate(dateStr);
    if (!d) return '-';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  // ========= TeflonManager =========

  const TeflonManager = {

    INIT: function () {
      console.log('TeflonManager r7.0.9 loaded');
      this.injectStyles();
      this.initNavButton();
    },

    injectStyles: function () {
      if (document.getElementById('teflon-manager-styles')) return;
      const style = document.createElement('style');
      style.id = 'teflon-manager-styles';
      style.textContent = ''
        + '.teflon-panel { position:relative; z-index:5000; background:#ffffff; border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,0.25); }'
        + '.teflon-table { width:100%; border-collapse:collapse; font-size:11px; }'
        + '.teflon-table th, .teflon-table td { border-bottom:1px solid #eee; padding:4px 6px; }'
        + '.teflon-table tbody tr:nth-child(odd) { background:#fafafa; }'
        + '.teflon-table tbody tr:hover { background:#e3f2fd; }'
        + '.status-badge { padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; white-space:nowrap; }'
        + '.status-pending { background:#ffe0b2; color:#e65100; }'
        + '.status-processing { background:#fff9c4; color:#f57f17; }'
        + '.status-completed { background:#c8e6c9; color:#1b5e20; }'
        + '.status-default { background:#e0e0e0; color:#424242; }'
        + '.tef-row-pending { background:#fff8e1; }'
        + '.tef-row-processing { background:#fffde7; }'
        + '.tef-row-completed { background:#f1f8e9; }'
        + '.tef-row-overdue { background:#ffebee !important; }'
        + '.tef-row-overdue .mold-name-cell { color:#c62828 !important; font-weight:700; }';
      document.head.appendChild(style);
    },

    initNavButton: function () {
      const btn = document.getElementById('nav-teflon-btn');
      if (!btn) {
        console.warn('[TeflonManager] nav-teflon-btn not found');
        return;
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPanel();
      });
      console.log('[TeflonManager] nav-teflon-btn bound to openPanel');
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

      this.buildRows();

      const html = [
        '<div id="teflon-panel" class="checkio-panel teflon-panel" style="display:block;">',
        '  <div class="tef-header" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:6px 6px 0 0;background:linear-gradient(90deg,#2e7d32 0%,#66bb6a 100%);color:#fff;">',
        '    <div class="tef-title">',
        '      <div style="font-size:15px;font-weight:600;">テフロン加工履歴</div>',
        '      <div style="font-size:12px;opacity:0.85;">Lịch sử mạ Teflon</div>',
        '    </div>',
        '    <button id="teflon-close-btn" title="閉じる" style="border:none;background:transparent;color:#fff;font-size:20px;cursor:pointer;padding:0 4px;">×</button>',
        '  </div>',
        '  <div class="tef-summary" style="font-size:11px;color:#444;text-align:right;padding:4px 6px 2px;">ステータス別にテフロン加工依頼を一覧表示します。</div>',
        '  <div class="checkio-body panel-body" style="display:flex;flex-direction:column;max-height:calc(100vh - 110px);padding-bottom:56px;">',

        '    <div class="filter-row" style="padding:8px;background:#f9f9f9;border-bottom:1px solid #ddd;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;">',
        '    <div class="tef-help" style="padding:4px 8px 2px;font-size:10px;color:#666;">',
'      テーブルのヘッダーをクリックしてソートできます。金型名をクリックすると詳細画面が開きます。',
'    </div>',

        '      <label style="font-weight:600;">ステータス:</label>',
        '      <select id="teflon-status-filter" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;">',
        '        <option value="all">全て</option>',
        '        <option value="テフロン加工承認待ち">テフロン加工承認待ち</option>',
        '        <option value="テフロン加工中">テフロン加工中</option>',
        '        <option value="テフロン加工済">テフロン加工済</option>',
        '        <option value="Sent">Sent (旧)</option>',
        '        <option value="Completed">Completed (旧)</option>',
        '      </select>',
        '      <input type="text" id="teflon-search-input" placeholder="金型名・コード検索" style="flex:1;min-width:200px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;">',
        '    </div>',
        '    <div class="table-wrapper" style="flex:1;overflow:auto;min-height:160px;">',
        '      <table id="teflon-table" class="teflon-table">',
        '        <thead style="position:sticky;top:0;background:#0056b3;color:#fff;z-index:10;font-size:11px;">',
        '          <tr>',
        '            <th data-sort="MoldName" style="width:22%;padding:6px 6px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">金型<span class="sort-indicator"></span></th>',
        '            <th data-sort="TeflonStatus" style="width:11%;padding:6px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">ステータス<span class="sort-indicator"></span></th>',
        '            <th data-sort="RequestedDate" style="width:10%;padding:6px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">要求日<span class="sort-indicator">▼</span></th>',
        '            <th data-sort="RequestedByName" style="width:11%;padding:6px 4px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">要求者<span class="sort-indicator"></span></th>',
        '            <th data-sort="SentDate" style="width:10%;padding:6px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">送信日<span class="sort-indicator"></span></th>',
        '            <th data-sort="SupplierName" style="width:13%;padding:6px 4px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">業者<span class="sort-indicator"></span></th>',
        '            <th data-sort="ReceivedDate" style="width:10%;padding:6px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">受信日<span class="sort-indicator"></span></th>',
        '            <th data-sort="SentByName" style="width:8%;padding:6px 4px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">送信者<span class="sort-indicator"></span></th>',
        '            <th style="width:15%;padding:6px 4px;text-align:left;white-space:nowrap;">メモ</th>',
        '          </tr>',
        '        </thead>',
        '        <tbody id="teflon-tbody"></tbody>',
        '      </table>',
        '    </div>',
        '    <div class="tef-actions" style="position:fixed;left:0;right:0;bottom:0;z-index:6000;padding:6px 10px;border-top:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;gap:6px;background:#f5f5f5;">',

        '      <div class="tef-actions-left">',
'        <button id="teflon-close-bottom" style="font-size:12px;padding:5px 14px;border-radius:4px;border:1px solid #ccc;background:#ffffff;cursor:pointer;">閉じる</button>',
'      </div>',
'      <div class="tef-actions-right" style="display:flex;gap:6px;">',
'        <button id="teflon-export-btn" style="font-size:12px;padding:5px 14px;border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;">CSV出力</button>',
'        <button id="teflon-print-btn"  style="font-size:12px;padding:5px 14px;border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;">印刷</button>',
'        <button id="teflon-mail-btn"   style="font-size:12px;padding:5px 14px;border-radius:4px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;cursor:pointer;">メール送信</button>',

        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');

      upper.insertAdjacentHTML('beforeend', html);

      // Gán sự kiện
      document.getElementById('teflon-close-btn').addEventListener('click', () => this.closePanel());
      const statusFilterEl = document.getElementById('teflon-status-filter');
      statusFilterEl.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        this.applyFilterAndSort();
      });
      document.getElementById('teflon-search-input').addEventListener('input', () => {
        this.applyFilterAndSort();
      });
      statusFilterEl.value = currentFilter;

      const bottomCloseBtn = document.getElementById('teflon-close-bottom');
      if (bottomCloseBtn) bottomCloseBtn.addEventListener('click', () => this.closePanel());

      const exportBtn = document.getElementById('teflon-export-btn');
      if (exportBtn) exportBtn.addEventListener('click', () => this.exportCurrentToCsv());
      const printBtn = document.getElementById('teflon-print-btn');
      if (printBtn) printBtn.addEventListener('click', () => this.printCurrentView());
      const mailBtn = document.getElementById('teflon-mail-btn');
      if (mailBtn) mailBtn.addEventListener('click', () => this.mailCurrentView());

      const headers = document.querySelectorAll('#teflon-table thead th[data-sort]');
      headers.forEach(th => {
        th.addEventListener('click', () => {
          const col = th.getAttribute('data-sort');
          if (currentSort.column === col) {
            currentSort.order = (currentSort.order === 'asc') ? 'desc' : 'asc';
          } else {
            currentSort.column = col;
            currentSort.order = 'asc';
          }
          this.applyFilterAndSort();
        });
      });

      this.applyFilterAndSort();
      console.log('[TeflonManager] Panel opened, rows:', allRows.length);
    },

    closePanel: function () {
      const panel = document.getElementById('teflon-panel');
      if (panel) panel.remove();
      document.body.classList.remove('modal-open');
    },

    buildRows: function () {
      const dm = window.DataManager;
      if (!dm || !dm.data) {
        console.error('[TeflonManager] DataManager not ready');
        allRows = [];
        return;
      }
      const teflonlog = dm.data.teflonlog || [];
      const molds = dm.data.molds || [];
      const employees = dm.data.employees || [];
      const companies = dm.data.companies || [];

      const rows = [];
      const processedMoldIDs = new Set();

      teflonlog.forEach(log => {
        const moldId = log.MoldID;
        if (!moldId) return;
        processedMoldIDs.add(moldId);

        const mold = molds.find(m => String(m.MoldID) === String(moldId));
        const moldName = mold ? (mold.MoldName || mold.MoldCode || ('ID:' + moldId)) : ('ID:' + moldId);

        const requestedByName = this.getEmployeeName(log.RequestedBy, employees);
        const sentByName = this.getEmployeeName(log.SentBy, employees);
        const supplierName = this.getCompanyName(log.SupplierID, companies);

        rows.push({
          TeflonLogID: log.TeflonLogID || '',
          MoldID: moldId,
          MoldName: moldName,
          TeflonStatus: log.TeflonStatus || '',
          RequestedBy: log.RequestedBy || '',
          RequestedByName: requestedByName,
          RequestedDate: log.RequestedDate || '',
          SentBy: log.SentBy || '',
          SentByName: sentByName,
          SentDate: log.SentDate || '',
          ReceivedDate: log.ReceivedDate || '',
          ExpectedDate: log.ExpectedDate || '',
          SupplierID: log.SupplierID || '',
          SupplierName: supplierName,
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

      molds.forEach(mold => {
        const moldId = mold.MoldID;
        if (processedMoldIDs.has(moldId)) return;
        const coating = mold.TeflonCoating || '';
        if (!coating || coating === 'FALSE' || coating === 'false' || coating === '0') return;
        const valid = ['テフロン加工承認待ち', 'テフロン加工中', 'テフロン加工済'];
        if (valid.indexOf(coating) === -1) return;

        const moldName = mold.MoldName || mold.MoldCode || ('ID:' + moldId);
        rows.push({
          TeflonLogID: '',
          MoldID: moldId,
          MoldName: moldName,
          TeflonStatus: coating,
          RequestedBy: '',
          RequestedByName: '-',
          RequestedDate: '',
          SentBy: '',
          SentByName: '-',
          SentDate: mold.TeflonSentDate || '',
          ReceivedDate: mold.TeflonReceivedDate || '',
          ExpectedDate: '',
          SupplierID: '',
          SupplierName: '-',
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
    },

    getEmployeeName: function (empId, employees) {
      if (!empId) return '-';
      const emp = employees.find(e => String(e.EmployeeID) === String(empId));
      if (!emp) return '-';
      return emp.EmployeeNameShort || emp.EmployeeName || '-';
    },

    getCompanyName: function (compId, companies) {
      if (!compId) return '-';
      const comp = companies.find(c => String(c.CompanyID) === String(compId));
      return comp ? (comp.CompanyName || '-') : '-';
    },

    getShortStatusLabel: function (status) {
      const s = String(status || '');
      if (s.indexOf('承認待ち') !== -1 || s.indexOf('Pending') !== -1) return '承認待ち';
      if (s.indexOf('加工中') !== -1 || s === 'Sent') return '加工中';
      if (s.indexOf('加工済') !== -1 || s === 'Completed') return '加工済';
      return s;
    },

    applyFilterAndSort: function () {
      const searchVal = (document.getElementById('teflon-search-input') || { value: '' }).value.toLowerCase();

      filteredRows = allRows.filter(row => {
        if (currentFilter !== 'all' && row.TeflonStatus !== currentFilter) return false;
        if (searchVal) {
          const name = (row.MoldName || '').toLowerCase();
          if (name.indexOf(searchVal) === -1) return false;
        }
        return true;
      });

      const col = currentSort.column;
      const order = currentSort.order;

      filteredRows.sort((a, b) => {
        let valA = a[col] || '';
        let valB = b[col] || '';

        if (col.indexOf('Date') !== -1) {
          const dA = parseFlexibleDate(valA);
          const dB = parseFlexibleDate(valB);
          const tA = dA ? dA.getTime() : 0;
          const tB = dB ? dB.getTime() : 0;
          return (order === 'asc') ? (tA - tB) : (tB - tA);
        }

        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        if (valA < valB) return (order === 'asc') ? -1 : 1;
        if (valA > valB) return (order === 'asc') ? 1 : -1;
        return 0;
      });

      this.renderTable();
      this.updateSortIndicators();
    },

    renderTable: function () {
      const tbody = document.getElementById('teflon-tbody');
      if (!tbody) return;

      if (!filteredRows || filteredRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="padding:16px;text-align:center;color:#888;">データなし</td></tr>';
        return;
      }

      let html = '';
      filteredRows.forEach(row => {
        const moldName = row.MoldName || '-';
        const status = row.TeflonStatus || '-';
        const statusShort = this.getShortStatusLabel(status);
        const reqDate = formatDate(row.RequestedDate);
        const reqBy = row.RequestedByName || '-';
        const sentDate = formatDate(row.SentDate);
        const supplier = row.SupplierName || '-';
        const recvDate = formatDate(row.ReceivedDate);
        const sentBy = row.SentByName || '-';
        const notes = row.TeflonNotes || '-';

        let statusClass = 'status-default';
        let rowClass = 'tef-row-default';
        if (status.indexOf('承認待ち') !== -1 || status.indexOf('Pending') !== -1) {
          statusClass = 'status-pending';
          rowClass = 'tef-row-pending';
        } else if (status.indexOf('加工中') !== -1 || status === 'Sent') {
          statusClass = 'status-processing';
          rowClass = 'tef-row-processing';
        } else if (status.indexOf('加工済') !== -1 || status === 'Completed') {
          statusClass = 'status-completed';
          rowClass = 'tef-row-completed';
        }

        let overdueClass = '';
        const reqDateObj = parseFlexibleDate(row.RequestedDate);
        if (reqDateObj && rowClass === 'tef-row-pending') {
          const now = new Date();
          const diffMs = now.getTime() - reqDateObj.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays > 7) overdueClass = ' tef-row-overdue';
        }

        html += ''
          + '<tr data-mold-id="' + row.MoldID + '" class="' + rowClass + overdueClass + '" style="cursor:pointer;border-bottom:1px solid #eee;">'
          + '<td class="mold-name-cell" style="padding:4px 6px;min-width:140px;max-width:260px;color:#0056b3;text-decoration:underline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + this.escapeHtml(moldName) + '</td>'
          + '<td style="padding:4px 4px;text-align:center;"><span class="status-badge ' + statusClass + '">' + this.escapeHtml(statusShort) + '</span></td>'
          + '<td style="padding:4px 4px;text-align:center;">' + reqDate + '</td>'
          + '<td style="padding:4px 4px;">' + this.escapeHtml(reqBy) + '</td>'
          + '<td style="padding:4px 4px;text-align:center;">' + sentDate + '</td>'
          + '<td style="padding:4px 4px;">' + this.escapeHtml(supplier) + '</td>'
          + '<td style="padding:4px 4px;text-align:center;">' + recvDate + '</td>'
          + '<td style="padding:4px 4px;">' + this.escapeHtml(sentBy) + '</td>'
          + '<td style="padding:4px 4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + this.escapeHtml(notes) + '</td>'
          + '</tr>';
      });

      tbody.innerHTML = html;

      const self = this;
      Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-mold-id]'), function (tr) {
        tr.addEventListener('click', function () {
          const moldId = tr.getAttribute('data-mold-id');
          const row = filteredRows.find(r => String(r.MoldID) === String(moldId));
          if (row) self.openDetailModal(row);
        });
      });
    },

    updateSortIndicators: function () {
      const headers = document.querySelectorAll('#teflon-table thead th[data-sort]');
      headers.forEach(th => {
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

      function detailRow(label, valueHtml) {
        return ''
          + '<tr style="border-bottom:1px solid #eee;">'
          + '<th style="padding:6px 6px;text-align:left;background:#f5f5f5;width:40%;font-size:11px;">' + label + '</th>'
          + '<td style="padding:6px 6px;font-size:12px;">' + valueHtml + '</td>'
          + '</tr>';
      }

      const html = [
        '<div id="teflon-detail-modal" class="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:12000;display:flex;align-items:center;justify-content:center;">',
        '  <div class="modal-content" style="background:#fff;width:90%;max-width:700px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-height:90vh;display:flex;flex-direction:column;">',
        '    <div class="modal-header" style="padding:8px 12px;background:#2e7d32;color:#fff;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">',
        '      <h3 style="margin:0;font-size:15px;font-weight:600;">テフロン加工詳細 / Chi tiết mạ Teflon</h3>',
        '      <button class="modal-close-x" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">&times;</button>',
        '    </div>',
        '    <div class="modal-body" style="padding:12px 16px;overflow-y:auto;flex:1;">',
        '      <table style="width:100%;border-collapse:collapse;font-size:12px;">',
        detailRow('金型 / Khuôn', this.escapeHtml(row.MoldName || '-')),
        detailRow('ステータス / Tình trạng', '<strong>' + this.escapeHtml(row.TeflonStatus || '-') + '</strong>'),
        detailRow('要求日 / Ngày yêu cầu', formatDate(row.RequestedDate)),
        detailRow('要求者 / Người yêu cầu', this.escapeHtml(row.RequestedByName || '-')),
        detailRow('送信日 / Ngày gửi', formatDate(row.SentDate)),
        detailRow('送信者 / Người gửi', this.escapeHtml(row.SentByName || '-')),
        detailRow('業者 / Nhà cung cấp', this.escapeHtml(row.SupplierName || '-')),
        detailRow('予定日 / Ngày dự kiến', formatDate(row.ExpectedDate)),
        detailRow('受信日 / Ngày nhận', formatDate(row.ReceivedDate)),
        detailRow('加工タイプ / Loại mạ', this.escapeHtml(row.CoatingType || '-')),
        detailRow('理由 / Lý do', this.escapeHtml(row.Reason || '-')),
        detailRow('コスト / Chi phí', this.escapeHtml(row.TeflonCost || '-')),
        detailRow('品質 / Chất lượng', this.escapeHtml(row.Quality || '-')),
        detailRow('メモ / Ghi chú', this.escapeHtml(row.TeflonNotes || '-')),
        detailRow('データソース / Nguồn dữ liệu', (row.source === 'teflonlog' ? 'teflonlog.csv' : 'molds.csv (fallback)')),
        '      </table>',
        '    </div>',
        '    <div class="modal-footer" style="padding:8px 12px;border-top:1px solid:#ddd;text-align:right;">',
        '      <button class="modal-close-btn" style="padding:5px 14px;background:#2e7d32;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">閉じる / Đóng</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');

      document.body.insertAdjacentHTML('beforeend', html);

      const modalOverlay = document.getElementById('teflon-detail-modal');
      const modalContent = modalOverlay.querySelector('.modal-content');
      const modalHeader = modalOverlay.querySelector('.modal-header');

      const closeModal = function () {
        modalOverlay.remove();
      };

      modalOverlay.querySelector('.modal-close-x').addEventListener('click', closeModal);
      modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal();
      });

      if (isMobile) {
        attachSwipeToClose(modalHeader, modalContent, closeModal);
      }

      console.log('[TeflonManager] Detail modal opened:', row.MoldName);
    },

    exportCurrentToCsv: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('エクスポートするデータがありません。');
        return;
      }
      const headers = [
        '金型ID', '金型名', 'ステータス',
        '要求日', '要求者',
        '送信日', '業者', '受信日', '送信者', 'メモ'
      ];
      const lines = [];
      lines.push(headers.join(','));

      filteredRows.forEach(function (r) {
        const row = [
          r.MoldID,
          r.MoldName,
          r.TeflonStatus,
          formatDate(r.RequestedDate),
          r.RequestedByName || '',
          formatDate(r.SentDate),
          r.SupplierName || '',
          formatDate(r.ReceivedDate),
          r.SentByName || '',
          (r.TeflonNotes || '').replace(/\r?\n/g, ' ')
        ];
        const csvRow = row.map(function (v) {
          const s = (v == null ? '' : String(v)).replace(/"/g, '""');
          return '"' + s + '"';
        }).join(',');
        lines.push(csvRow);
      });

      const csvContent = '\ufeff' + lines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nowKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = 'teflon-list-' + nowKey + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    printCurrentView: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('印刷するデータがありません。');
        return;
      }
      const win = window.open('', '_blank');
      if (!win) return;

      const rowsHtml = filteredRows.map(r => {
        return ''
          + '<tr>'
          + '<td>' + this.escapeHtml(r.MoldName || '') + '</td>'
          + '<td>' + this.escapeHtml(r.TeflonStatus || '') + '</td>'
          + '<td>' + formatDate(r.RequestedDate) + '</td>'
          + '<td>' + this.escapeHtml(r.RequestedByName || '') + '</td>'
          + '<td>' + formatDate(r.SentDate) + '</td>'
          + '<td>' + this.escapeHtml(r.SupplierName || '') + '</td>'
          + '<td>' + formatDate(r.ReceivedDate) + '</td>'
          + '</tr>';
      }, this).join('');

      win.document.write(
        '<html><head><meta charset="utf-8"><title>テフロン加工一覧</title>'
        + '<style>'
        + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:11px;}'
        + 'table{border-collapse:collapse;width:100%;}'
        + 'th,td{border:1px solid #ccc;padding:4px 6px;}'
        + 'th{background:#eeeeee;}'
        + '</style></head><body>'
        + '<h3>テフロン加工一覧</h3>'
        + '<table><thead><tr>'
        + '<th>金型</th><th>ステータス</th><th>要求日</th>'
        + '<th>要求者</th><th>送信日</th><th>業者</th><th>受信日</th>'
        + '</tr></thead><tbody>'
        + rowsHtml
        + '</tbody></table>'
        + '<script>window.print();<\/script>'
        + '</body></html>'
      );
      win.document.close();
    },

    mailCurrentView: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('メール送信するデータがありません。');
        return;
      }
      const maxLines = 50;
      const lines = [];
      lines.push('テフロン加工依頼一覧');
      lines.push('');
      filteredRows.slice(0, maxLines).forEach(function (r) {
        const line = [
          '金型:' + (r.MoldName || ''),
          'ステータス:' + (r.TeflonStatus || ''),
          '要求日:' + formatDate(r.RequestedDate),
          '送信日:' + formatDate(r.SentDate),
          '受信日:' + formatDate(r.ReceivedDate)
        ].join(' / ');
        lines.push(line);
      });
      if (filteredRows.length > maxLines) {
        lines.push('... 他 ' + (filteredRows.length - maxLines) + ' 件');
      }
      const body = encodeURIComponent(lines.join('\n'));
      const subject = encodeURIComponent('テフロン加工依頼一覧');
      const mailto = 'mailto:teflon@ysd.local?subject=' + subject + '&body=' + body;
      window.location.href = mailto;
    },

    escapeHtml: function (text) {
      if (text == null) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };

  window.TeflonManager = TeflonManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { TeflonManager.INIT(); });
  } else {
    TeflonManager.INIT();
  }

})();
