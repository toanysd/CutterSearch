/**
 * ========================================================================
 * teflon-manager-r7.2.0.js - テフロン加工管理 / Quản lý mạ Teflon (FULL)
 * ========================================================================
 *
 * Based on: r7.1.9
 *
 * NEW in r7.2.0 (2025-12-17):
 * ✅ CSS inject -> teflon-manager-r7.2.0.css
 * ✅ Performance: debounce search + chunked render + event delegation (全て/大量データでも固まりにくい)
 * ✅ Sync: auto refresh via DataManager.loadAllData() (badge/data 同期・端末依存しない)
 * ✅ Lock/Unlock: keep r7.1.9 behavior (lock時 scrollLeft=0)
 * ✅ CSV: UTF-8 BOM + CRLF (Excel JP ok)
 *
 * Dependencies:
 * - window.DataManager (molds, teflonlog, employees) + loadAllData()
 * - window.TeflonProcessManager (optional)
 *
 * ========================================================================
 */

(function () {
  'use strict';

  // ========================================================================
  // STATE
  // ========================================================================
  let allRows = [];
  let filteredRows = [];
  let rowsByStatus = {
    unprocessed: [],
    pending: [],
    approved: [],
    processing: [],
    completed: []
  };

  let currentSort = { column: 'RequestedDate', order: 'desc' };
  let currentFilter = 'active';
  let isRowsBuilt = false;
  let isTableLocked = true;

  // r7.2.0: performance + sync
  const SEARCH_DEBOUNCE_MS = 180;
  const RENDER_CHUNK_SIZE = 200;
  const AUTO_REFRESH_MS = 30000;

  let __searchTimer = null;
  let __renderToken = 0;
  let __autoRefreshTimer = null;
  let __isRefreshing = false;

  // ========================================================================
  // STATUS MAPPING
  // ========================================================================
  const TEFLON_STATUS_KEYS = {
    unprocessed: 'unprocessed',
    pending: 'pending',
    approved: 'approved',
    processing: 'processing',
    completed: 'completed'
  };

  const TEFLON_COATING_LABELS = {
    unprocessed: '未処理',
    pending: 'テフロン加工承認待ち',
    approved: '承認済(発送待ち)',
    processing: 'テフロン加工中',
    completed: 'テフロン加工済'
  };

  // ========================================================================
  // HELPERS
  // ========================================================================
  function normalizeText(v) {
    return String(v || '').trim();
  }

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function parseFlexibleDate(str) {
    if (!str || str === '') return null;

    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };

    const m = String(str).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = monthMap[m[2]];
      let year = parseInt(m[3], 10);
      year += (year < 50) ? 2000 : 1900;
      if (month !== undefined) return new Date(year, month, day);
    }

    const parts = String(str).split(/[\/\-]/);
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      const dd = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(mo) && !isNaN(dd)) {
        return new Date(y, mo - 1, dd);
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
    return `${yyyy}-${mm}-${dd}`;
  }

  function daysDiffFromNow(dateObj) {
    if (!dateObj) return 0;
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  function normalizeSearchValue(val) {
    val = String(val || '').trim().toLowerCase();
    const compact = val.replace(/[\/\-]/g, '');
    return { original: val, compact };
  }

  // r7.2.0: build per-row search index to reduce repeated string ops
  function buildRowSearchIndex(row) {
    const fields = [
      row.MoldName,
      row.MoldID,
      row.TeflonStatusLabel,
      row.RequestedByName,
      row.SentByName,
      row.TeflonNotes,
      formatDate(row.RequestedDate),
      formatDate(row.SentDate),
      formatDate(row.ReceivedDate)
    ];

    const text = fields.map(v => String(v || '').toLowerCase()).join(' | ');
    const compact = text.replace(/[\/\-]/g, '');
    row.__searchText = text;
    row.__searchCompact = compact;
  }

  function matchesSearchFast(row, searchNorm) {
    if (!searchNorm.original) return true;
    const t = row.__searchText || '';
    if (t.indexOf(searchNorm.original) !== -1) return true;
    const c = row.__searchCompact || '';
    if (c.indexOf(searchNorm.compact) !== -1) return true;
    return false;
  }

  // ========================================================================
  // STATUS MAPPING FUNCTIONS
  // ========================================================================
  function mapCoatingToStatusKey(coating) {
    const v = normalizeText(coating);
    if (!v) return '';

    if (v === TEFLON_COATING_LABELS.pending) return TEFLON_STATUS_KEYS.pending;
    if (v === TEFLON_COATING_LABELS.approved) return TEFLON_STATUS_KEYS.approved;
    if (v === TEFLON_COATING_LABELS.processing) return TEFLON_STATUS_KEYS.processing;
    if (v === TEFLON_COATING_LABELS.completed) return TEFLON_STATUS_KEYS.completed;

    if (v === '承認待ち') return TEFLON_STATUS_KEYS.pending;
    if (v === '承認済') return TEFLON_STATUS_KEYS.approved;
    if (v === '加工中') return TEFLON_STATUS_KEYS.processing;
    if (v === '加工済') return TEFLON_STATUS_KEYS.completed;

    const lower = v.toLowerCase();
    if (lower === 'pending') return TEFLON_STATUS_KEYS.pending;
    if (lower === 'approved') return TEFLON_STATUS_KEYS.approved;
    if (lower === 'processing') return TEFLON_STATUS_KEYS.processing;
    if (lower === 'sent') return TEFLON_STATUS_KEYS.processing;
    if (lower === 'completed' || lower === 'coated') return TEFLON_STATUS_KEYS.completed;

    return '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = normalizeText(logStatus).toLowerCase();
    if (!v) return '';
    if (v === 'pending') return TEFLON_STATUS_KEYS.pending;
    if (v === 'approved') return TEFLON_STATUS_KEYS.approved;
    if (v === 'processing') return TEFLON_STATUS_KEYS.processing;
    if (v === 'completed') return TEFLON_STATUS_KEYS.completed;
    if (v === 'sent') return TEFLON_STATUS_KEYS.processing;
    return '';
  }

  function getTeflonStatusKey(row, hasLog) {
    const coating = normalizeText(row.TeflonCoating || row.TeflonStatus);
    if (!coating && !hasLog) return TEFLON_STATUS_KEYS.unprocessed;

    let key = mapCoatingToStatusKey(row.TeflonStatus);
    if (key) return key;

    key = mapCoatingToStatusKey(row.CoatingType);
    if (key) return key;

    key = logStatusToStatusKey(row.TeflonStatus);
    if (key) return key;

    return '';
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function getShortStatusLabel(statusKey) {
    const labels = {
      unprocessed: '未処理',
      pending: '承認待ち',
      approved: '承認済',
      processing: '加工中',
      completed: '完了'
    };
    return labels[statusKey] || '-';
  }

  function getLongStatusLabelHTML(statusKey) {
    const labels = {
      unprocessed: '未処理<br><span style="font-size:11px;opacity:0.85">Chưa xử lý</span>',
      pending: 'テフロン加工承認待ち<br><span style="font-size:11px;opacity:0.85">Chờ phê duyệt</span>',
      approved: '承認済(発送待ち)<br><span style="font-size:11px;opacity:0.85">Đã duyệt (chờ gửi)</span>',
      processing: 'テフロン加工中<br><span style="font-size:11px;opacity:0.85">Đang mạ</span>',
      completed: 'テフロン加工済<br><span style="font-size:11px;opacity:0.85">Hoàn thành</span>'
    };
    return labels[statusKey] || '-';
  }

  function getEmployeeName(empId, employees) {
    if (!empId || !employees) return '-';
    const emp = employees.find(e => String(e.EmployeeID) === String(empId));
    if (!emp) return '-';
    return emp.EmployeeNameShort || emp.EmployeeName || '-';
  }

  function getRequestDateWarningClass(statusKey, reqDateObj) {
    if (statusKey !== TEFLON_STATUS_KEYS.pending) return '';
    if (!reqDateObj) return 'tef-req-overdue-14';

    const days = daysDiffFromNow(reqDateObj);
    if (days >= 14) return 'tef-req-overdue-14';
    if (days >= 11) return 'tef-req-overdue-11';
    if (days >= 9) return 'tef-req-overdue-9';
    if (days >= 7) return 'tef-req-overdue-7';
    return '';
  }

  // ========================================================================
  // DATA LOADING
  // ========================================================================
  function buildRows() {
    console.log('[TeflonManager r7.2.0] buildRows called');

    const dm = window.DataManager;
    if (!dm || !dm.data) {
      console.error('[TeflonManager] DataManager not ready');
      return;
    }

    const teflonlog = dm.data.teflonlog || [];
    const molds = dm.data.molds || [];
    const employees = dm.data.employees || [];

    const moldLogMap = new Map();

    // pick latest log per MoldID
    teflonlog.forEach(log => {
      const moldId = normalizeText(log.MoldID);
      if (!moldId) return;

      const prev = moldLogMap.get(moldId);
      if (!prev) {
        moldLogMap.set(moldId, log);
        return;
      }

      const logId = parseInt(log.TeflonLogID || 0, 10);
      const prevId = parseInt(prev.TeflonLogID || 0, 10);

      if (logId > prevId) {
        moldLogMap.set(moldId, log);
      } else if (logId === prevId || logId === 0) {
        const logDate = parseFlexibleDate(log.UpdatedDate || log.SentDate || log.RequestedDate || log.CreatedDate);
        const prevDate = parseFlexibleDate(prev.UpdatedDate || prev.SentDate || prev.RequestedDate || prev.CreatedDate);
        if (logDate && (!prevDate || logDate > prevDate)) {
          moldLogMap.set(moldId, log);
        }
      }
    });

    const rows = [];
    const buckets = {
      unprocessed: [],
      pending: [],
      approved: [],
      processing: [],
      completed: []
    };

    function pushRow(r) {
      buildRowSearchIndex(r);
      rows.push(r);
      const k = r.TeflonStatusKey || '';
      if (buckets[k]) buckets[k].push(r);
    }

    moldLogMap.forEach((log, moldId) => {
      const mold = molds.find(m => normalizeText(m.MoldID) === String(moldId));
      const moldName = mold ? (mold.MoldName || mold.MoldCode || `ID ${moldId}`) : `ID ${moldId}`;

      const statusKey = getTeflonStatusKey({
        TeflonStatus: log.TeflonStatus,
        TeflonCoating: log.CoatingType || (mold ? mold.TeflonCoating : ''),
        CoatingType: log.CoatingType
      }, true);

      const r = {
        TeflonLogID: log.TeflonLogID || '',
        MoldID: String(moldId),
        MoldName: moldName,
        TeflonStatus: log.TeflonStatus || '',
        TeflonStatusKey: statusKey,
        TeflonStatusLabel: statusKeyToCoatingLabel(statusKey) || log.TeflonStatus || '',
        RequestedBy: log.RequestedBy || '',
        RequestedByName: getEmployeeName(log.RequestedBy, employees),
        RequestedDate: log.RequestedDate || '',
        SentBy: log.SentBy || '',
        SentByName: getEmployeeName(log.SentBy, employees),
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
        source: 'teflonlog',
        hasLog: true
      };

      pushRow(r);
    });

    // unprocessed rows (only when mold has neither coating nor status and no log)
    molds.forEach(mold => {
      const moldId = normalizeText(mold.MoldID);
      if (!moldId) return;
      if (moldLogMap.has(moldId)) return;

      const coating = normalizeText(mold.TeflonCoating);
      const status = normalizeText(mold.TeflonStatus);

      if (!coating && !status) {
        const moldName = mold.MoldName || mold.MoldCode || `ID ${moldId}`;
        const r = {
          TeflonLogID: '',
          MoldID: String(moldId),
          MoldName: moldName,
          TeflonStatus: '',
          TeflonStatusKey: TEFLON_STATUS_KEYS.unprocessed,
          TeflonStatusLabel: TEFLON_COATING_LABELS.unprocessed,
          RequestedBy: '',
          RequestedByName: '-',
          RequestedDate: '',
          SentBy: '',
          SentByName: '-',
          SentDate: '',
          ReceivedDate: '',
          ExpectedDate: '',
          CoatingType: '',
          Reason: '',
          TeflonCost: '',
          Quality: '',
          TeflonNotes: '',
          CreatedDate: '',
          UpdatedBy: '',
          UpdatedDate: '',
          source: 'molds',
          hasLog: false
        };
        pushRow(r);
      }
    });

    allRows = rows;
    rowsByStatus = buckets;
    isRowsBuilt = true;

    console.log(`[TeflonManager] Built ${rows.length} rows`);
  }

  // ========================================================================
  // FILTER & SORT (core only, no render)
  // ========================================================================
  function getBaseListForFilter() {
    if (currentFilter === 'all') return allRows;
    if (currentFilter === 'active') {
      const a = rowsByStatus.pending || [];
      const b = rowsByStatus.approved || [];
      const c = rowsByStatus.processing || [];
      // concat only these three to reduce scan cost
      return a.concat(b, c);
    }
    return rowsByStatus[currentFilter] || [];
  }

  function applyFilterAndSort() {
    const searchVal = (document.getElementById('teflon-search-input') || { value: '' }).value;
    const searchNorm = normalizeSearchValue(searchVal);

    const base = getBaseListForFilter();

    // search filter (fast by precomputed index)
    const tmp = [];
    for (let i = 0; i < base.length; i++) {
      const r = base[i];
      if (!matchesSearchFast(r, searchNorm)) continue;
      tmp.push(r);
    }
    filteredRows = tmp;

    // sort
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

    updateSortIndicators();
  }

  function applyFilterAndSortAsync() {
    const token = ++__renderToken;

    const tbody = document.getElementById('teflon-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:14px;text-align:center;color:#888;">Loading...</td></tr>';
    }

    setTimeout(() => {
      if (token !== __renderToken) return;
      applyFilterAndSort();
      renderTableChunked(token);
    }, 0);
  }

  // ========================================================================
  // SORT INDICATORS
  // ========================================================================
  function updateSortIndicators() {
    const panel = document.getElementById('teflon-panel');
    if (!panel) return;

    const headers = panel.querySelectorAll('#teflon-table thead th[data-sort]');
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
  }

  // ========================================================================
  // SWIPE TO CLOSE
  // ========================================================================
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

  // ========================================================================
  // INJECT CORE STYLES (r7.2.0)
  // ========================================================================
  function injectStyles() {
    if (document.getElementById('teflon-manager-r7-2-0-styles')) return;

    const link = document.createElement('link');
    link.id = 'teflon-manager-r7-2-0-styles';
    link.rel = 'stylesheet';
    link.href = 'teflon-manager-r7.2.0.css';
    document.head.appendChild(link);
  }

  // ========================================================================
  // TABLE RENDER (chunked + delegation)
  // ========================================================================
  function bindTbodyDelegationOnce() {
    const tbody = document.getElementById('teflon-tbody');
    if (!tbody || tbody.__tefBound) return;

    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-mold-id]');
      if (!tr) return;

      const moldId = tr.getAttribute('data-mold-id');
      const row = filteredRows.find(r => String(r.MoldID) === String(moldId));
      if (!row) return;

      const target = e.target.closest('[data-action]');
      if (target) {
        const action = target.getAttribute('data-action');
        if (action === 'open-process') {
          e.preventDefault();
          e.stopPropagation();
          openProcessManager(row);
          return;
        }
        if (action === 'view-status') {
          e.preventDefault();
          e.stopPropagation();
          openDetailModal(row);
          return;
        }
      }
      openDetailModal(row);
    });

    tbody.__tefBound = true;
  }

  function renderTableChunked(token) {
    const tbody = document.getElementById('teflon-tbody');
    if (!tbody) return;

    bindTbodyDelegationOnce();

    if (!filteredRows || filteredRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#888;">データなし / Không có dữ liệu</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    let index = 0;

    const appendChunk = () => {
      if (token !== __renderToken) return;

      const end = Math.min(index + RENDER_CHUNK_SIZE, filteredRows.length);
      let html = '';

      for (let i = index; i < end; i++) {
        const row = filteredRows[i];
        const moldName = row.MoldName || '-';
        const statusKey = row.TeflonStatusKey || '';
        const statusShort = getShortStatusLabel(statusKey);

        const reqDateObj = parseFlexibleDate(row.RequestedDate);
        const reqDate = formatDate(row.RequestedDate);

        const reqBy = row.RequestedByName || '-';
        const sentDate = formatDate(row.SentDate);
        const recvDate = formatDate(row.ReceivedDate);
        const sentBy = row.SentByName || '-';
        const notes = row.TeflonNotes || '-';

        let statusClass = 'status-default';
        let rowClass = 'tef-row-default';

        if (statusKey === TEFLON_STATUS_KEYS.unprocessed) { statusClass = 'status-unprocessed'; rowClass = 'tef-row-unprocessed'; }
        else if (statusKey === TEFLON_STATUS_KEYS.pending) { statusClass = 'status-pending'; rowClass = 'tef-row-pending'; }
        else if (statusKey === TEFLON_STATUS_KEYS.approved) { statusClass = 'status-approved'; rowClass = 'tef-row-approved'; }
        else if (statusKey === TEFLON_STATUS_KEYS.processing) { statusClass = 'status-processing'; rowClass = 'tef-row-processing'; }
        else if (statusKey === TEFLON_STATUS_KEYS.completed) { statusClass = 'status-completed'; rowClass = 'tef-row-completed'; }

        const reqDateCellClass = getRequestDateWarningClass(statusKey, reqDateObj);

        html += `
          <tr data-mold-id="${escapeHtml(row.MoldID)}" class="${rowClass}" style="cursor:pointer;border-bottom:1px solid #eee;">
            <td class="mold-name-cell" style="padding:8px 10px;min-width:120px;max-width:250px;">
              <a href="javascript:void(0)" data-action="open-process" title="更新 / Cập nhật">${escapeHtml(moldName)}</a>
            </td>
            <td style="padding:8px 10px;text-align:center;">
              <span class="status-badge ${statusClass}" data-action="view-status" title="詳細 / Chi tiết">${escapeHtml(statusShort)}</span>
            </td>
            <td style="padding:8px 10px;text-align:center;">
              <span class="${reqDateCellClass}" style="display:inline-block;">${reqDate}</span>
            </td>
            <td style="padding:8px 10px;">${escapeHtml(reqBy)}</td>
            <td class="col-hidden-locked" style="padding:8px 10px;text-align:center;">${sentDate}</td>
            <td class="col-hidden-locked" style="padding:8px 10px;text-align:center;">${recvDate}</td>
            <td class="col-hidden-locked" style="padding:8px 10px;">${escapeHtml(sentBy)}</td>
            <td class="col-hidden-locked" style="padding:8px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(notes)}</td>
          </tr>`;
      }

      tbody.insertAdjacentHTML('beforeend', html);
      index = end;

      if (index < filteredRows.length) {
        requestAnimationFrame(appendChunk);
      }
    };

    requestAnimationFrame(appendChunk);
  }

  // Backward compatible wrapper
  function renderTable() {
    const token = ++__renderToken;
    renderTableChunked(token);
  }

  // ========================================================================
  // TABLE LOCK (r7.1.9 behavior 유지)
  // ========================================================================
  function toggleTableLock() {
    isTableLocked = !isTableLocked;

    const panel = document.getElementById('teflon-panel');
    const tableWrap = panel ? panel.querySelector('.table-wrapper') : document.querySelector('.table-wrapper');
    const lockBtn = document.getElementById('teflon-lock-btn');

    if (tableWrap) {
      if (isTableLocked) {
        tableWrap.classList.add('table-locked');
        // r7.1.9+: when locking, force horizontal position to 0 (fix iPhone leftover scroll)
        try { tableWrap.scrollLeft = 0; } catch (e) {}
      } else {
        tableWrap.classList.remove('table-locked');
      }
    }

    if (lockBtn) {
      if (isTableLocked) {
        lockBtn.classList.remove('unlocked');
        lockBtn.innerHTML = '<div class="jp">解除</div><div class="vi">Unlock</div>';
        lockBtn.title = 'クリックして全列を表示 | Bấm để hiện tất cả cột';
      } else {
        lockBtn.classList.add('unlocked');
        lockBtn.innerHTML = '<div class="jp">固定</div><div class="vi">Lock</div>';
        lockBtn.title = 'クリックして横固定（列を隠す） | Bấm để ẩn cột';
      }
    }

    console.log('[TeflonManager] Table lock:', isTableLocked ? 'LOCKED (compact)' : 'UNLOCKED (full)');
  }

  // ========================================================================
  // NAV BADGE (承/発/中)
  // ========================================================================
  function updateNavBadge() {
    const btn = document.getElementById('nav-teflon-btn');
    if (!btn) return;

    let badge = btn.querySelector('.tef-nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tef-nav-badge tef-nav-badge-hidden';
      btn.appendChild(badge);
    }

    const hasPending = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending);
    const hasApproved = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved);
    const hasProcessing = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing);

    badge.classList.remove('tef-nav-badge-hidden', 'tef-nav-badge-approved', 'tef-nav-badge-pending', 'tef-nav-badge-processing');

    // Priority: approved (発) > pending (承) > processing (中)
    if (hasApproved) {
      badge.classList.add('tef-nav-badge-approved');
      badge.textContent = '発';
    } else if (hasPending) {
      badge.classList.add('tef-nav-badge-pending');
      badge.textContent = '承';
    } else if (hasProcessing) {
      badge.classList.add('tef-nav-badge-processing');
      badge.textContent = '中';
    } else {
      badge.classList.add('tef-nav-badge-hidden');
      badge.textContent = '';
    }
  }

  // ========================================================================
  // MODAL: DETAIL VIEW
  // ========================================================================
  function openDetailModal(row) {
    if (!row) return;

    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const statusHtml = getLongStatusLabelHTML(row.TeflonStatusKey || '');

    const html = `
      <div class="modal-content" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div style="font-weight:800;">
            詳細 / Chi tiết
          </div>
          <button class="modal-close-x" title="閉じる / Đóng">×</button>
        </div>
        <div class="modal-body">
          <table>
            <tr><th>型名 / Tên khuôn</th><td>${escapeHtml(row.MoldName || '-')}</td></tr>
            <tr><th>金型ID / MoldID</th><td>${escapeHtml(row.MoldID || '-')}</td></tr>
            <tr><th>状態 / Trạng thái</th><td>${statusHtml}</td></tr>
            <tr><th>依頼日 / Ngày yêu cầu</th><td>${escapeHtml(formatDate(row.RequestedDate))}</td></tr>
            <tr><th>依頼者 / Người yêu cầu</th><td>${escapeHtml(row.RequestedByName || '-')}</td></tr>
            <tr><th>送付日 / Ngày gửi</th><td>${escapeHtml(formatDate(row.SentDate))}</td></tr>
            <tr><th>受領日 / Ngày nhận</th><td>${escapeHtml(formatDate(row.ReceivedDate))}</td></tr>
            <tr><th>担当者 / Người xử lý</th><td>${escapeHtml(row.SentByName || '-')}</td></tr>
            <tr><th>メモ / Ghi chú</th><td>${escapeHtml(row.TeflonNotes || '-')}</td></tr>
          </table>
        </div>
        <div class="modal-footer">
          <button class="tef-btn tef-btn-blue" data-action="modal-open-process" type="button">
            <div class="jp">更新</div><div class="vi">Cập nhật</div>
          </button>
          <button class="tef-btn tef-btn-gray" data-action="modal-close" type="button">
            <div class="jp">閉じる</div><div class="vi">Đóng</div>
          </button>
        </div>
      </div>
    `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.modal-content');
    const header = overlay.querySelector('.modal-header');
    const closeX = overlay.querySelector('.modal-close-x');
    const closeBtn = overlay.querySelector('[data-action="modal-close"]');
    const openBtn = overlay.querySelector('[data-action="modal-open-process"]');

    const close = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    if (closeX) closeX.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        close();
        openProcessManager(row);
      });
    }

    if (header && modal) attachSwipeToClose(header, modal, close);
  }

  function openProcessManager(row) {
    if (!row) return;

    if (window.TeflonProcessManager && typeof window.TeflonProcessManager.openForMold === 'function') {
      window.TeflonProcessManager.openForMold(row.MoldID, row);
      return;
    }

    alert('更新画面(TeflonProcessManager)が見つかりません。\nKhông tìm thấy màn hình cập nhật (TeflonProcessManager).');
  }

  // ========================================================================
  // CSV EXPORT (UTF-8 BOM + CRLF)
  // ========================================================================
  function exportToCsv() {
    if (!filteredRows || filteredRows.length === 0) {
      alert('エクスポートするデータがありません。\nKhông có dữ liệu để xuất.');
      return;
    }

    const headers = ['No', '型名', '状態', '依頼日', '依頼者', '送付日', '受領日', '担当者', 'メモ'];
    const lines = [headers.join(',')];

    filteredRows.forEach((r, idx) => {
      const noteClean = String(r.TeflonNotes || '')
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ');

      const row = [
        idx + 1,
        r.MoldName || '',
        r.TeflonStatusLabel || '',
        formatDate(r.RequestedDate),
        r.RequestedByName || '',
        formatDate(r.SentDate),
        formatDate(r.ReceivedDate),
        r.SentByName || '',
        noteClean
      ];

      const csvRow = row.map(v => {
        const s = (v == null) ? '' : String(v);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');

      lines.push(csvRow);
    });

    const bom = '\uFEFF';
    const csvContent = bom + lines.join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const nowKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `teflon-list-${nowKey}.csv`;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  // ========================================================================
  // PRINT
  // ========================================================================
  function printView() {
    if (!filteredRows || filteredRows.length === 0) {
      alert('印刷するデータがありません。\nKhông có dữ liệu để in.');
      return;
    }

    const w = window.open('', '_blank');
    if (!w) {
      alert('ポップアップがブロックされました。\nPopup bị chặn.');
      return;
    }

    const rows = filteredRows.map((r, idx) => {
      const noteClean = escapeHtml(String(r.TeflonNotes || '').replace(/\r?\n/g, ' '));
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(r.MoldName || '')}</td>
          <td>${escapeHtml(r.TeflonStatusLabel || '')}</td>
          <td>${escapeHtml(formatDate(r.RequestedDate))}</td>
          <td>${escapeHtml(r.RequestedByName || '')}</td>
          <td>${escapeHtml(formatDate(r.SentDate))}</td>
          <td>${escapeHtml(formatDate(r.ReceivedDate))}</td>
          <td>${escapeHtml(r.SentByName || '')}</td>
          <td>${noteClean}</td>
        </tr>
      `;
    }).join('');

    w.document.write(`
      <html>
      <head>
        <title>テフロン加工管理 印刷</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, "Hiragino Kaku Gothic ProN", "MS Gothic", sans-serif; padding: 16px; }
          h2 { margin: 0 0 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
          th { background: #f0f0f0; }
        </style>
      </head>
      <body>
        <h2>テフロン加工管理 / Quản lý mạ Teflon</h2>
        <table>
          <thead>
            <tr>
              <th>No</th><th>型名</th><th>状態</th><th>依頼日</th><th>依頼者</th><th>送付日</th><th>受領日</th><th>担当者</th><th>メモ</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);

    w.document.close();
  }

  // ========================================================================
  // EMAIL (mailto)
  // ========================================================================
  function mailView() {
    const actives = allRows.filter(r =>
      r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending ||
      r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved ||
      r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing
    );

    if (!actives.length) {
      alert('送信する対象がありません。\nKhông có mục cần gửi.');
      return;
    }

    // Simple mail template (JP first)
    const subject = `【テフロン加工】状況共有 (${new Date().toISOString().slice(0, 10)})`;
    const lines = [];

    lines.push('テフロン加工の状況を共有します。');
    lines.push('（以下、承認待ち／承認済(発送待ち)／加工中）');
    lines.push('');
    lines.push('No\t型名\t状態\t依頼日\t依頼者\t送付日\t受領日\t担当者\tメモ');

    actives.slice(0, 200).forEach((r, idx) => {
      const note = String(r.TeflonNotes || '').replace(/\r?\n/g, ' ');
      lines.push([
        idx + 1,
        r.MoldName || '',
        r.TeflonStatusLabel || '',
        formatDate(r.RequestedDate),
        r.RequestedByName || '',
        formatDate(r.SentDate),
        formatDate(r.ReceivedDate),
        r.SentByName || '',
        note
      ].join('\t'));
    });

    if (actives.length > 200) {
      lines.push('');
      lines.push(`※ 件数が多いため先頭200件のみ表示（合計: ${actives.length}件）`);
    }

    lines.push('');
    lines.push('---');
    lines.push('Quản lý mạ Teflon: Báo cáo trạng thái (JP/VI).');

    const body = lines.join('\n');
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  // ========================================================================
  // REFRESH DATA (manual)
  // ========================================================================
  function refreshData() {
    console.log('[TeflonManager] Refreshing data...');

    const btn = document.getElementById('teflon-refresh-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="jp">更新</div><div class="vi">Loading...</div>';
    }

    if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
      __isRefreshing = true;
      window.DataManager.loadAllData()
        .then(() => {
          console.log('[TeflonManager] Data refreshed');
          buildRows();
          updateNavBadge();
          applyFilterAndSortAsync();
        })
        .catch((err) => {
          console.error('[TeflonManager] refreshData error', err);
          alert('データ更新に失敗しました。\nKhông thể cập nhật dữ liệu.');
        })
        .finally(() => {
          __isRefreshing = false;
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
          }
        });
    } else {
      alert('DataManager.loadAllData が見つかりません。\nKhông tìm thấy DataManager.loadAllData.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
      }
    }
  }

  // ========================================================================
  // AUTO SYNC (multi-device)
  // ========================================================================
  function silentAutoRefresh() {
    if (__isRefreshing) return;
    if (!window.DataManager || typeof window.DataManager.loadAllData !== 'function') return;

    __isRefreshing = true;
    window.DataManager.loadAllData()
      .then(() => {
        buildRows();
        updateNavBadge();

        // if panel opened: keep current filter/search/sort but redraw
        const panel = document.getElementById('teflon-panel');
        if (panel) applyFilterAndSortAsync();
      })
      .catch(() => {})
      .finally(() => { __isRefreshing = false; });
  }

  function startAutoRefresh() {
    if (__autoRefreshTimer) return;

    __autoRefreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') silentAutoRefresh();
    }, AUTO_REFRESH_MS);

    window.addEventListener('focus', () => silentAutoRefresh());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') silentAutoRefresh();
    });
  }

  // ========================================================================
  // PANEL OPEN/CLOSE
  // ========================================================================
  function openPanel() {
    console.log('[TeflonManager r7.2.0] openPanel called');

    const existing = document.getElementById('teflon-panel');
    if (existing) existing.remove();

    const upper = document.querySelector('.upper-section');
    if (!upper) {
      console.error('[TeflonManager] upper-section not found');
      return;
    }

    const isMobile = window.innerWidth <= 767;
    if (isMobile) document.body.classList.add('modal-open');

    if (!isRowsBuilt) buildRows();

    const html = `
      <div id="teflon-panel" class="checkio-panel teflon-panel" style="display:block;">
        <div class="tef-header">
          <div class="tef-title">
            <div>テフロン加工管理</div>
            <div>Quản lý mạ Teflon</div>
          </div>
          <button id="teflon-close-btn" title="閉じる / Đóng">×</button>
        </div>

        <div class="tef-summary">
          ステータス別に依頼状況を表示します。| Hiển thị trạng thái theo danh mục.
        </div>

        <div class="checkio-body panel-body">
          <div class="filter-row">
            <div class="tef-help">
              ヘッダークリックでソート / Bấm tiêu đề để sắp xếp。金型名クリックで更新 / Bấm tên khuôn để cập nhật。
            </div>

            <!-- Line 1: Label + Select -->
            <div class="filter-line filter-line-1">
              <label class="filter-label filter-label-inline">
                <div class="label-jp">表示フィルター</div>
                <div class="label-vi">Lọc hiển thị</div>
              </label>

              <div class="filter-control">
                <select id="teflon-status-filter">
                  <option value="active">承認待ち・承認済・加工中</option>
                  <option value="unprocessed">未処理 | Chưa xử lý</option>
                  <option value="pending">テフロン加工承認待ち</option>
                  <option value="approved">承認済(発送待ち)</option>
                  <option value="processing">テフロン加工中</option>
                  <option value="completed">テフロン加工済</option>
                  <option value="all">全て | Tất cả</option>
                </select>
              </div>
            </div>

            <!-- Line 2: Label + Search + Unlock + Refresh -->
            <div class="filter-line filter-line-2">
              <label class="filter-label filter-label-inline">
                <div class="label-jp">検索</div>
                <div class="label-vi">Tìm kiếm</div>
              </label>

              <div class="filter-control filter-control-grow">
                <input type="text" id="teflon-search-input" placeholder="金型名・コード・日付 / Tên khuôn, mã, ngày">
              </div>

              <button id="teflon-lock-btn" class="tef-btn tef-btn-lock" type="button"
                title="クリックして全列を表示 | Bấm để hiện tất cả cột">
                <div class="jp">解除</div>
                <div class="vi">Unlock</div>
              </button>

              <button id="teflon-refresh-btn" class="tef-btn tef-btn-blue" type="button">
                <div class="jp">更新</div>
                <div class="vi">Refresh</div>
              </button>
            </div>
          </div>

          <div class="table-wrapper table-locked">
            <table id="teflon-table" class="teflon-table">
              <thead>
                <tr>
                  <th data-sort="MoldName">金型名<span class="sort-indicator"></span></th>
                  <th data-sort="TeflonStatusKey">状態<span class="sort-indicator"></span></th>
                  <th data-sort="RequestedDate">依頼日<span class="sort-indicator">▼</span></th>
                  <th data-sort="RequestedByName">依頼者<span class="sort-indicator"></span></th>
                  <th data-sort="SentDate" class="col-hidden-locked">出荷日<span class="sort-indicator"></span></th>
                  <th data-sort="ReceivedDate" class="col-hidden-locked">受入日<span class="sort-indicator"></span></th>
                  <th data-sort="SentByName" class="col-hidden-locked">担当者<span class="sort-indicator"></span></th>
                  <th class="col-hidden-locked">メモ</th>
                </tr>
              </thead>
              <tbody id="teflon-tbody"></tbody>
            </table>
          </div>

          <div class="tef-actions">
            <button id="teflon-close-bottom" class="tef-btn tef-btn-gray" type="button">
              <div class="jp">閉じる</div>
              <div class="vi">Đóng</div>
            </button>

            <button id="teflon-export-btn" class="tef-btn tef-btn-blue" type="button">
              <div class="jp">CSV出力</div>
              <div class="vi">Xuất CSV</div>
            </button>

            <button id="teflon-print-btn" class="tef-btn tef-btn-blue" type="button">
              <div class="jp">印刷</div>
              <div class="vi">In</div>
            </button>

            <button id="teflon-mail-btn" class="tef-btn tef-btn-green" type="button">
              <div class="jp">メール送信</div>
              <div class="vi">Gửi email</div>
            </button>
          </div>
        </div>
      </div>
    `;

    upper.insertAdjacentHTML('beforeend', html);

    // Reset lock state for new panel
    isTableLocked = true;

    bindPanelEvents();

    // Default filter
    currentFilter = 'active';

    // r7.2.0: async (avoid freezing on large data)
    applyFilterAndSortAsync();

    console.log('[TeflonManager] Panel opened');
  }

  function closePanel() {
    const panel = document.getElementById('teflon-panel');
    if (panel) panel.remove();

    // clear debounce timer (safety)
    if (__searchTimer) {
      clearTimeout(__searchTimer);
      __searchTimer = null;
    }

    document.body.classList.remove('modal-open');
    console.log('[TeflonManager] Panel closed');
  }

  // ========================================================================
  // BIND PANEL EVENTS (r7.2.0: debounce + async)
  // ========================================================================
  function bindPanelEvents() {
    const panel = document.getElementById('teflon-panel');
    if (!panel) return;

    const header = panel.querySelector('.tef-header');
    const tableWrap = panel.querySelector('.table-wrapper');

    const closeBtn = document.getElementById('teflon-close-btn');
    const closeBottomBtn = document.getElementById('teflon-close-bottom');

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (closeBottomBtn) closeBottomBtn.addEventListener('click', closePanel);

    const statusFilter = document.getElementById('teflon-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        applyFilterAndSortAsync();
      });
    }

    const searchInput = document.getElementById('teflon-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (__searchTimer) clearTimeout(__searchTimer);
        __searchTimer = setTimeout(() => {
          applyFilterAndSortAsync();
        }, SEARCH_DEBOUNCE_MS);
      });
    }

    const lockBtn = document.getElementById('teflon-lock-btn');
    if (lockBtn) lockBtn.addEventListener('click', toggleTableLock);

    const refreshBtn = document.getElementById('teflon-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);

    const headers = panel.querySelectorAll('#teflon-table thead th[data-sort]');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (!col) return;

        if (currentSort.column === col) {
          currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.column = col;
          currentSort.order = 'desc';
        }
        applyFilterAndSortAsync();
      });
    });

    const exportBtn = document.getElementById('teflon-export-btn');
    const printBtn = document.getElementById('teflon-print-btn');
    const mailBtn = document.getElementById('teflon-mail-btn');

    if (exportBtn) exportBtn.addEventListener('click', exportToCsv);
    if (printBtn) printBtn.addEventListener('click', printView);
    if (mailBtn) mailBtn.addEventListener('click', mailView);

    // Swipe-to-close for panel (header + table-wrapper)
    if (header && panel) attachSwipeToClose(header, panel, closePanel);
    if (tableWrap && panel) attachSwipeToClose(tableWrap, panel, closePanel);
  }

  // ========================================================================
  // NAV BUTTON INIT
  // ========================================================================
  function initNavButton() {
    const btn = document.getElementById('nav-teflon-btn');
    if (!btn) {
      console.warn('[TeflonManager] nav-teflon-btn not found');
      return;
    }
    if (btn.__tefBound) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openPanel();
    });

    btn.__tefBound = true;
    console.log('[TeflonManager] Nav button bound');
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================
  const TeflonManager = {
    version: 'r7.2.0',

    INIT: function () {
      console.log('[TeflonManager r7.2.0] Initializing...');

      injectStyles();
      initNavButton();

      // r7.2.0: auto refresh for multi-device sync
      startAutoRefresh();

      setTimeout(() => {
        buildRows();
        updateNavBadge();
      }, 100);
    },

    openPanel: openPanel,
    closePanel: closePanel,

    buildRows: buildRows,

    applyFilterAndSort: applyFilterAndSort,
    applyFilterAndSortAsync: applyFilterAndSortAsync,

    renderTable: renderTable,
    updateSortIndicators: updateSortIndicators,

    updateNavBadge: updateNavBadge,
    refreshData: refreshData,

    exportToCsv: exportToCsv,
    printView: printView,
    mailView: mailView,

    toggleTableLock: toggleTableLock
  };

  window.TeflonManager = TeflonManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TeflonManager.INIT());
  } else {
    TeflonManager.INIT();
  }

  console.log('[TeflonManager r7.2.0] Module loaded');
})();
