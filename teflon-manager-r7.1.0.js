/**
 * teflon-manager-r7.1.0.js
 * テフロン加工履歴 / Lịch sử mạ Teflon モジュール
 *
 * NEW in r7.1.0:
 *  ✅ Email format: Fixed-width columns, no pipes, clean layout
 *  ✅ Monospace font optimization for Outlook/Gmail
 *  ✅ Proper padding with exact character positions
 */
(function () {
  'use strict';

  let allRows = [];
  let filteredRows = [];
  let currentSort = { column: 'RequestedDate', order: 'desc' };
  let currentFilter = 'pending';

  // ============================
  // Status Mapping
  // ============================
  const TEFLON_COATING_LABELS = {
    pending: 'テフロン加工承認待ち',
    sent: 'テフロン加工中',
    completed: 'テフロン加工済'
  };

  const TEFLON_LOG_STATUS = {
    pending: 'Pending',
    sent: 'Sent',
    completed: 'Completed'
  };

  function mapCoatingToStatusKey(coating) {
    const v = String(coating || '').trim();
    if (!v) return '';

    if (v === TEFLON_COATING_LABELS.pending) return 'pending';
    if (v === TEFLON_COATING_LABELS.sent) return 'sent';
    if (v === TEFLON_COATING_LABELS.completed) return 'completed';

    const lower = v.toLowerCase();
    if (lower === 'pending') return 'pending';
    if (lower === 'sent') return 'sent';
    if (lower === 'completed' || lower === 'coated') return 'completed';

    return '';
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function statusKeyToLogStatus(key) {
    return TEFLON_LOG_STATUS[key] || '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = String(logStatus || '').toLowerCase();
    if (v === 'pending') return 'pending';
    if (v === 'sent') return 'sent';
    if (v === 'completed') return 'completed';
    return '';
  }

  // Lấy statusKey thống nhất từ nhiều nguồn (CSV cũ & mới)
  function getTeflonStatusKey(row) {
    // 1) Ưu tiên TeflonStatus (tiếng Nhật hoặc tiếng Anh)
    let key = mapCoatingToStatusKey(row.TeflonStatus);
    if (key) return key;

    // 2) Nếu không có, thử CoatingType (value list Access)
    key = mapCoatingToStatusKey(row.CoatingType);
    if (key) return key;

    // 3) Cuối cùng, nếu TeflonStatus đã được lưu tiếng Anh
    key = logStatusToStatusKey(row.TeflonStatus);
    if (key) return key;

    return ''; // Không xác định → chỉ xuất hiện ở filter "全て"
  }


  // ========= Helpers =========
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

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========= String padding helper for fixed-width =========
  function padRight(str, width) {
    str = String(str || '');
    // Count full-width characters (Japanese) as 2 chars
    let displayWidth = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Japanese/Chinese characters range
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

  // ========= TeflonManager =========
  const TeflonManager = {
    INIT: function () {
      console.log('TeflonManager r7.1.0 loaded');
      this.injectStyles();
      this.initNavButton();
    },

    injectStyles: function () {
      if (document.getElementById('teflon-manager-styles')) return;

      const style = document.createElement('style');
      style.id = 'teflon-manager-styles';
      style.textContent = ''
        + '.teflon-panel { position:relative; z-index:5000; background:#ffffff; border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,0.25); }'
        + '.teflon-table { width:100%; border-collapse:collapse; font-size:10px; }'
        + '.teflon-table th, .teflon-table td { border-bottom:1px solid #eee; padding:3px 4px; }'
        + '.teflon-table tbody tr:nth-child(odd) { background:#fafafa; }'
        + '.teflon-table tbody tr:hover { background:#e3f2fd; }'
        + '.status-badge { padding:2px 5px; border-radius:3px; font-size:9px; font-weight:600; white-space:nowrap; }'
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
        '      <div class="tef-help" style="padding:4px 8px 2px;font-size:10px;color:#666;">',
        '        テーブルのヘッダーをクリックしてソートできます。金型名をクリックすると詳細画面が開きます。',
        '      </div>',
        '      <label style="font-weight:600;">ステータス:</label>',
        '      <select id="teflon-status-filter" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;">',
        '        <option value="all">全て</option>',
        '        <option value="pending">テフロン加工承認待ち</option>',
        '        <option value="sent">テフロン加工中</option>',
        '        <option value="completed">テフロン加工済</option>',
        '      </select>',
        '      <input type="text" id="teflon-search-input" placeholder="金型名・コード検索" style="flex:1;min-width:200px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;">',
        '    </div>',
        '    <div class="table-wrapper" style="flex:1;overflow:auto;min-height:160px;">',
        '      <table id="teflon-table" class="teflon-table">',
        '        <thead style="position:sticky;top:0;background:#0056b3;color:#fff;z-index:10;font-size:10px;">',
        '          <tr>',
        '            <th data-sort="MoldName" style="width:20%;padding:5px 4px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">金型名<span class="sort-indicator"></span></th>',
        '            <th data-sort="TeflonStatusKey" style="width:12%;padding:5px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">状態<span class="sort-indicator"></span></th>',
        '            <th data-sort="RequestedDate" style="width:11%;padding:5px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">依頼日<span class="sort-indicator">▼</span></th>',
        '            <th data-sort="RequestedByName" style="width:10%;padding:5px 4px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">依頼者<span class="sort-indicator"></span></th>',
        '            <th data-sort="SentDate" style="width:11%;padding:5px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">出荷日<span class="sort-indicator"></span></th>',
        '            <th data-sort="ReceivedDate" style="width:11%;padding:5px 4px;cursor:pointer;text-align:center;border-right:1px solid #fff;white-space:nowrap;">受入日<span class="sort-indicator"></span></th>',
        '            <th data-sort="SentByName" style="width:10%;padding:5px 4px;cursor:pointer;text-align:left;border-right:1px solid #fff;white-space:nowrap;">担当者<span class="sort-indicator"></span></th>',
        '            <th style="width:15%;padding:5px 4px;text-align:left;white-space:nowrap;">メモ</th>',
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
        '        <button id="teflon-print-btn" style="font-size:12px;padding:5px 14px;border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;">印刷</button>',
        '        <button id="teflon-mail-btn" style="font-size:12px;padding:5px 14px;border-radius:4px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;cursor:pointer;">メール送信</button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');

      upper.insertAdjacentHTML('beforeend', html);

      // === Vuốt từ header để đóng modal (mobile) ===
      const panelEl = document.getElementById('teflon-panel');
      if (panelEl) {
        // Header của panel (thanh tiêu đề, nơi có nút Đóng)
        const headerEl = panelEl.querySelector('.teflon-header'); // đổi class nếu bạn đang dùng class khác

        // Nút đóng đang có sẵn trong header
        const closeBtn = panelEl.querySelector('.teflon-close');  // đổi selector này cho đúng nút Đóng hiện tại

        if (headerEl && closeBtn) {
          attachSwipeToClose(headerEl, panelEl, () => {
            // Tái sử dụng logic đóng sẵn có bằng cách trigger click
            closeBtn.click();
          });
        }
      }


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

      const rows = [];
      const moldStatusMap = new Map();

      teflonlog.forEach(log => {
        const moldId = String(log.MoldID || '').trim();
        if (!moldId) return;

        const logDate = parseFlexibleDate(log.SentDate || log.RequestedDate || log.CreatedDate);
        const existing = moldStatusMap.get(moldId);

        if (!existing) {
          moldStatusMap.set(moldId, log);
        } else {
          const existingDate = parseFlexibleDate(
            existing.SentDate || existing.RequestedDate || existing.CreatedDate
          );
          if (logDate && existingDate && logDate > existingDate) {
            moldStatusMap.set(moldId, log);
          }
        }
      });

      moldStatusMap.forEach((log, moldId) => {
        const mold = molds.find(m => String(m.MoldID).trim() === moldId);
        const moldName = mold
          ? (mold.MoldName || mold.MoldCode || ('ID:' + moldId))
          : ('ID:' + moldId);

        const requestedByName = this.getEmployeeName(log.RequestedBy, employees);
        const sentByName = this.getEmployeeName(log.SentBy, employees);

        const statusKey = logStatusToStatusKey(log.TeflonStatus);
        const statusLabel = statusKeyToCoatingLabel(statusKey) || log.TeflonStatus || '';

        rows.push({
          TeflonLogID: log.TeflonLogID || '',
          MoldID: moldId,
          MoldName: moldName,
          TeflonStatus: log.TeflonStatus || '',
          TeflonStatusKey: statusKey,
          TeflonStatusLabel: statusLabel,
          RequestedBy: log.RequestedBy || '',
          RequestedByName: requestedByName,
          RequestedDate: log.RequestedDate || '',
          SentBy: log.SentBy || '',
          SentByName: sentByName,
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

      molds.forEach(mold => {
        const moldId = String(mold.MoldID || '').trim();
        if (!moldId) return;
        if (moldStatusMap.has(moldId)) return;

        const coating = mold.TeflonCoating || '';
        if (!coating || coating === 'FALSE' || coating === 'false' || coating === '0') return;

        const statusKey = getTeflonStatusKey(row);
        if (!statusKey) return;

        const moldName = mold.MoldName || mold.MoldCode || ('ID:' + moldId);
        const statusLabel = statusKeyToCoatingLabel(statusKey) || coating;

        rows.push({
          TeflonLogID: '',
          MoldID: moldId,
          MoldName: moldName,
          TeflonStatus: coating,
          TeflonStatusKey: statusKey,
          TeflonStatusLabel: statusLabel,
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
    },

    getEmployeeName: function (empId, employees) {
      if (!empId) return '-';
      const emp = employees.find(e => String(e.EmployeeID) === String(empId));
      if (!emp) return '-';
      return emp.EmployeeNameShort || emp.EmployeeName || '-';
    },

    getShortStatusLabel: function (statusKey) {
      if (statusKey === 'pending') return '承認待ち';
      if (statusKey === 'sent') return '加工中';
      if (statusKey === 'completed') return '加工済';
      return statusKey || '-';
    },

    applyFilterAndSort: function () {
      const searchVal = (document.getElementById('teflon-search-input') || { value: '' }).value.toLowerCase();

      filteredRows = allRows.filter(row => {
        if (currentFilter !== 'all' && row.TeflonStatusKey !== currentFilter) return false;

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
        tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#888;">データなし</td></tr>';
        return;
      }

      let html = '';

      filteredRows.forEach(row => {
        const moldName = row.MoldName || '-';
        const statusKey = row.TeflonStatusKey || '';
        const statusShort = this.getShortStatusLabel(statusKey);
        const reqDate = formatDate(row.RequestedDate);
        const reqBy = row.RequestedByName || '-';
        const sentDate = formatDate(row.SentDate);
        const recvDate = formatDate(row.ReceivedDate);
        const sentBy = row.SentByName || '-';
        const notes = row.TeflonNotes || '-';

        let statusClass = 'status-default';
        let rowClass = 'tef-row-default';

        if (statusKey === 'pending') {
          statusClass = 'status-pending';
          rowClass = 'tef-row-pending';
        } else if (statusKey === 'sent') {
          statusClass = 'status-processing';
          rowClass = 'tef-row-processing';
        } else if (statusKey === 'completed') {
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
          + '<td class="mold-name-cell" style="padding:3px 4px;min-width:120px;max-width:220px;color:#0056b3;text-decoration:underline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(moldName) + '</td>'
          + '<td style="padding:3px 4px;text-align:center;"><span class="status-badge ' + statusClass + '">' + escapeHtml(statusShort) + '</span></td>'
          + '<td style="padding:3px 4px;text-align:center;">' + reqDate + '</td>'
          + '<td style="padding:3px 4px;">' + escapeHtml(reqBy) + '</td>'
          + '<td style="padding:3px 4px;text-align:center;">' + sentDate + '</td>'
          + '<td style="padding:3px 4px;text-align:center;">' + recvDate + '</td>'
          + '<td style="padding:3px 4px;">' + escapeHtml(sentBy) + '</td>'
          + '<td style="padding:3px 4px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(notes) + '</td>'
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
        detailRow('金型名 / Khuôn', escapeHtml(row.MoldName || '-')),
        detailRow('状態 / Tình trạng', '<strong>' + escapeHtml(row.TeflonStatusLabel || '-') + '</strong>'),
        detailRow('依頼日 / Ngày yêu cầu', formatDate(row.RequestedDate)),
        detailRow('依頼者 / Người yêu cầu', escapeHtml(row.RequestedByName || '-')),
        detailRow('出荷日 / Ngày gửi', formatDate(row.SentDate)),
        detailRow('受入日 / Ngày nhận', formatDate(row.ReceivedDate)),
        detailRow('担当者 / Người phụ trách', escapeHtml(row.SentByName || '-')),
        detailRow('予定日 / Ngày dự kiến', formatDate(row.ExpectedDate)),
        detailRow('加工タイプ / Loại mạ', escapeHtml(row.CoatingType || '-')),
        detailRow('理由 / Lý do', escapeHtml(row.Reason || '-')),
        detailRow('コスト / Chi phí', escapeHtml(row.TeflonCost || '-')),
        detailRow('品質 / Chất lượng', escapeHtml(row.Quality || '-')),
        detailRow('メモ / Ghi chú', escapeHtml(row.TeflonNotes || '-')),
        detailRow('データソース / Nguồn', (row.source === 'teflonlog' ? 'teflonlog.csv' : 'molds.csv (fallback)')),
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
    },

    exportCurrentToCsv: function () {
      if (!filteredRows || filteredRows.length === 0) {
        alert('エクスポートするデータがありません。');
        return;
      }

      const headers = [
        'No', '金型名', '状態', '依頼日', '依頼者', '出荷日', '受入日', '担当者', 'メモ'
      ];

      const lines = [];
      lines.push(headers.join(','));

      filteredRows.forEach(function (r, idx) {
        const row = [
          idx + 1,
          r.MoldName,
          r.TeflonStatusLabel,
          formatDate(r.RequestedDate),
          r.RequestedByName || '',
          formatDate(r.SentDate),
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

      let rowsHtml = '';
      filteredRows.forEach((r, idx) => {
        rowsHtml += ''
          + '<tr>'
          + '<td style="text-align:center;">' + (idx + 1) + '</td>'
          + '<td>' + escapeHtml(r.MoldName || '') + '</td>'
          + '<td style="text-align:center;">' + escapeHtml(this.getShortStatusLabel(r.TeflonStatusKey)) + '</td>'
          + '<td style="text-align:center;">' + formatDate(r.RequestedDate) + '</td>'
          + '<td>' + escapeHtml(r.RequestedByName || '') + '</td>'
          + '<td style="text-align:center;">' + formatDate(r.SentDate) + '</td>'
          + '<td style="text-align:center;">' + formatDate(r.ReceivedDate) + '</td>'
          + '<td>' + escapeHtml(r.SentByName || '') + '</td>'
          + '<td>' + escapeHtml(r.TeflonNotes || '') + '</td>'
          + '</tr>';
      });

      win.document.write(
        '<html><head><meta charset="utf-8"><title>テフロン加工一覧</title>'
        + '<style>'
        + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:10px;}'
        + 'table{border-collapse:collapse;width:100%;}'
        + 'th,td{border:1px solid #ccc;padding:3px 5px;}'
        + 'th{background:#eeeeee;font-size:10px;}'
        + '</style></head><body>'
        + '<h3>テフロン加工一覧</h3>'
        + '<table><thead><tr>'
        + '<th>No</th><th>金型名</th><th>状態</th><th>依頼日</th>'
        + '<th>依頼者</th><th>出荷日</th><th>受入日</th><th>担当者</th><th>メモ</th>'
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

      lines.push('【テフロン加工依頼一覧】');
      lines.push('');
      lines.push('※ この表を等幅フォント (Courier, Consolas, MS Gothic) で表示してください。');
      lines.push('');

      // Header with fixed width columns (no pipes, clean spacing)
      const separator = '='.repeat(95);
      lines.push(separator);
      
      // Column headers - aligned with padRight for proper spacing
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

      // Data rows with exact padding
      filteredRows.slice(0, maxLines).forEach(function (r, idx) {
        const no = padRight(String(idx + 1), 4);
        const moldName = padRight(truncate(r.MoldName || '-', 18), 20);
        const status = padRight(truncate(r.TeflonStatusLabel || '承認待ち', 12), 14);
        const reqDate = padRight(formatDate(r.RequestedDate), 13);
        const sentDate = padRight(formatDate(r.SentDate), 13);
        const recvDate = padRight(formatDate(r.ReceivedDate), 13);
        const notes = truncate(r.TeflonNotes || '-', 16);

        const row = no + moldName + status + reqDate + sentDate + recvDate + notes;
        lines.push(row);
      });

      lines.push(separator);

      if (filteredRows.length > maxLines) {
        lines.push('');
        lines.push('... 他 ' + (filteredRows.length - maxLines) + ' 件のデータがあります。');
      }

      lines.push('');
      lines.push('---');
      lines.push('この一覧は MoldCutterSearch システムから自動生成されました。');
      lines.push('詳細は F:/MoldCutterSearch/index.html をご覧ください。');

      const body = encodeURIComponent(lines.join('\n'));
      const subject = encodeURIComponent('テフロン加工依頼一覧 - ' + new Date().toISOString().slice(0, 10));
      const mailto = 'mailto:teflon@ysd.local?subject=' + subject + '&body=' + body;

      window.location.href = mailto;
    }
  };

  // ========= Export =========
  window.TeflonManager = TeflonManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { TeflonManager.INIT(); });
  } else {
    TeflonManager.INIT();
  }
})();
