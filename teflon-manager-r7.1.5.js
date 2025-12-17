/**
 * ========================================================================
 * teflon-manager-r7.1.5.js - Quản lý mạ Teflon (FULL VERSION)
 * ========================================================================
 * 
 * Based on: r7.1.4
 * 
 * NEW in r7.1.5 (2025-12-17):
 * ✅ Fixed layout - label bên trái filter/search
 * ✅ Removed 表示 line
 * ✅ Unlock & Refresh buttons side by side
 * ✅ Footer buttons in single row
 * ✅ Nav badge with kanji characters (発/承/中)
 * ✅ Fixed unlock functionality
 * 
 * Dependencies:
 * - window.DataManager (molds, teflonlog, employees)
 * - window.TeflonProcessManager (optional)
 * 
 * Updated: 2025-12-17 11:02 JST
 * ========================================================================
 */

(function () {
  'use strict';

  // ========================================================================
  // STATE
  // ========================================================================

  let allRows = [];
  let filteredRows = [];
  let currentSort = { column: 'RequestedDate', order: 'desc' };
  let currentFilter = 'active';
  let isRowsBuilt = false;
  let isTableLocked = true;

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
    const compact = val.replace(/[\/-]/g, '');
    return { original: val, compact };
  }

  function matchesSearch(row, searchNorm) {
    if (!searchNorm.original) return true;
    
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
    
    for (let field of fields) {
      const fieldVal = String(field || '').toLowerCase();
      if (fieldVal.indexOf(searchNorm.original) !== -1) return true;
      
      const fieldCompact = fieldVal.replace(/[\/-]/g, '');
      if (fieldCompact.indexOf(searchNorm.compact) !== -1) return true;
      
      if (searchNorm.original.match(/^\d+\/\d+$/)) {
        if (fieldVal.indexOf(searchNorm.original) !== -1) return true;
      }
    }
    
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
    
    if (!coating && !hasLog) {
      return TEFLON_STATUS_KEYS.unprocessed;
    }

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
    console.log('[TeflonManager r7.1.5] buildRows called');
    
    const dm = window.DataManager;
    if (!dm || !dm.data) {
      console.error('[TeflonManager] DataManager not ready');
      return;
    }

    const teflonlog = dm.data.teflonlog || [];
    const molds = dm.data.molds || [];
    const employees = dm.data.employees || [];

    console.log(`[TeflonManager] Data: teflonlog=${teflonlog.length}, molds=${molds.length}, employees=${employees.length}`);

    const moldLogMap = new Map();
    
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

    moldLogMap.forEach((log, moldId) => {
      const mold = molds.find(m => normalizeText(m.MoldID) === String(moldId));
      const moldName = mold ? (mold.MoldName || mold.MoldCode || `ID ${moldId}`) : `ID ${moldId}`;
      
      const statusKey = getTeflonStatusKey({
        TeflonStatus: log.TeflonStatus,
        TeflonCoating: log.CoatingType || mold?.TeflonCoating,
        CoatingType: log.CoatingType
      }, true);

      rows.push({
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
      });
    });

    molds.forEach(mold => {
      const moldId = normalizeText(mold.MoldID);
      if (!moldId) return;
      if (moldLogMap.has(moldId)) return;

      const coating = normalizeText(mold.TeflonCoating);
      const status = normalizeText(mold.TeflonStatus);
      
      if (!coating && !status) {
        const moldName = mold.MoldName || mold.MoldCode || `ID ${moldId}`;
        
        rows.push({
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
        });
      }
    });

    allRows = rows;
    isRowsBuilt = true;
    
    console.log(`[TeflonManager] Built ${rows.length} rows`);
  }

  // ========================================================================
  // FILTER & SORT
  // ========================================================================

  function applyFilterAndSort() {
    const searchVal = (document.getElementById('teflon-search-input') || { value: '' }).value;
    const searchNorm = normalizeSearchValue(searchVal);

    filteredRows = allRows.filter(row => {
      if (currentFilter !== 'all') {
        if (currentFilter === 'active') {
          const ok = (
            row.TeflonStatusKey === TEFLON_STATUS_KEYS.pending ||
            row.TeflonStatusKey === TEFLON_STATUS_KEYS.approved ||
            row.TeflonStatusKey === TEFLON_STATUS_KEYS.processing
          );
          if (!ok) return false;
        } else {
          if (row.TeflonStatusKey !== currentFilter) return false;
        }
      }

      if (!matchesSearch(row, searchNorm)) return false;

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

    renderTable();
    updateSortIndicators();
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
  // EMAIL HELPERS
  // ========================================================================

  function displayWidthOf(str) {
    str = String(str || '');
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0x3000 && code <= 0x9FFF) w += 2;
      else w += 1;
    }
    return w;
  }

  function padRight(str, width) {
    str = String(str || '');
    const w = displayWidthOf(str);
    const pad = width - w;
    if (pad <= 0) return str;
    return str + ' '.repeat(pad);
  }

  function truncate(str, maxLen) {
    str = String(str || '');
    if (str.length <= maxLen) return str;
    return str.substring(0, Math.max(0, maxLen - 2)) + '..';
  }

  // ========================================================================
  // INJECT CORE STYLES
  // ========================================================================

  function injectStyles() {
    if (document.getElementById('teflon-manager-r7-1-5-styles')) return;
    
    const link = document.createElement('link');
    link.id = 'teflon-manager-r7-1-5-styles';
    link.rel = 'stylesheet';
    link.href = 'teflon-manager-r7.1.5.css';
    document.head.appendChild(link);
  }

  // ========================================================================
  // RENDER TABLE
  // ========================================================================

  function renderTable() {
    const tbody = document.getElementById('teflon-tbody');
    if (!tbody) return;

    if (!filteredRows || filteredRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#888;">データなし / Không có dữ liệu</td></tr>';
      return;
    }

    let html = '';

    filteredRows.forEach(row => {
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
      
      if (statusKey === TEFLON_STATUS_KEYS.unprocessed) {
        statusClass = 'status-unprocessed';
        rowClass = 'tef-row-unprocessed';
      } else if (statusKey === TEFLON_STATUS_KEYS.pending) {
        statusClass = 'status-pending';
        rowClass = 'tef-row-pending';
      } else if (statusKey === TEFLON_STATUS_KEYS.approved) {
        statusClass = 'status-approved';
        rowClass = 'tef-row-approved';
      } else if (statusKey === TEFLON_STATUS_KEYS.processing) {
        statusClass = 'status-processing';
        rowClass = 'tef-row-processing';
      } else if (statusKey === TEFLON_STATUS_KEYS.completed) {
        statusClass = 'status-completed';
        rowClass = 'tef-row-completed';
      }

      const reqDateCellClass = getRequestDateWarningClass(statusKey, reqDateObj);

      html += `
<tr data-mold-id="${escapeHtml(row.MoldID)}" class="${rowClass}" style="cursor:pointer;border-bottom:1px solid #eee;">
  <td class="mold-name-cell" style="padding:8px 10px;min-width:120px;max-width:250px;">
    <a href="javascript:void(0)" data-action="open-process" title="更新">${escapeHtml(moldName)}</a>
  </td>
  <td style="padding:8px 10px;text-align:center;">
    <span class="status-badge ${statusClass}" data-action="view-status" title="詳細">${escapeHtml(statusShort)}</span>
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
    });

    tbody.innerHTML = html;

    Array.from(tbody.querySelectorAll('tr[data-mold-id]')).forEach(tr => {
      tr.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        const moldId = tr.getAttribute('data-mold-id');
        const row = filteredRows.find(r => String(r.MoldID) === String(moldId));
        
        if (!row) return;

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
    });
  }

  // ========================================================================
  // SORT INDICATORS
  // ========================================================================

  function updateSortIndicators() {
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
  }

  // ========================================================================
  // OPEN PROCESS MANAGER
  // ========================================================================

  function openProcessManager(row) {
    if (!row || !row.MoldID) return;
    
    console.log('[TeflonManager] Opening process manager for:', row.MoldID);

    if (window.TeflonProcessManager && typeof window.TeflonProcessManager.openPanel === 'function') {
      const dm = window.DataManager?.data;
      let item = null;
      
      if (dm && Array.isArray(dm.molds)) {
        item = dm.molds.find(m => String(m.MoldID).trim() === String(row.MoldID).trim());
      }
      
      if (!item) item = { MoldID: String(row.MoldID) };
      
      window.TeflonProcessManager.openPanel(item);
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent('teflon:open-process-manager', {
        detail: { moldId: row.MoldID, teflonRow: row, source: 'teflon-manager' }
      }));
    } catch (e) {
      console.warn('[TeflonManager] Process manager not available');
    }
  }

  // ========================================================================
  // DETAIL MODAL
  // ========================================================================

  function openDetailModal(row) {
    const existing = document.getElementById('teflon-detail-modal');
    if (existing) existing.remove();

    const statusHtml = getLongStatusLabelHTML(row.TeflonStatusKey);

    function detailRow(label, valueHtml) {
      return `
<tr style="border-bottom:1px solid #eee;">
  <th style="padding:8px;text-align:left;background:#f5f5f5;width:40%;font-size:11px;vertical-align:top;">${label}</th>
  <td style="padding:8px;font-size:12px;">${valueHtml}</td>
</tr>`;
    }

    const html = `
<div id="teflon-detail-modal" class="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:12000;display:flex;align-items:center;justify-content:center;">
  <div class="modal-content" style="background:#fff;width:90%;max-width:720px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-height:90vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="padding:8px 12px;background:#2e7d32;color:#fff;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
      <div style="display:flex;flex-direction:column;">
        <div style="font-size:15px;font-weight:800;line-height:1.1;">テフロン詳細</div>
        <div style="font-size:12px;opacity:0.9;line-height:1.1;">Chi tiết mạ Teflon</div>
      </div>
      <button class="modal-close-x" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div class="modal-body" style="padding:12px 16px;overflow-y:auto;flex:1;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        ${detailRow('型名 | Khuôn', escapeHtml(row.MoldName || '-'))}
        ${detailRow('状態 | Trạng thái', '<strong>' + statusHtml + '</strong>')}
        ${detailRow('依頼日 | Ngày yêu cầu', escapeHtml(formatDate(row.RequestedDate)))}
        ${detailRow('依頼者 | Người yêu cầu', escapeHtml(row.RequestedByName || '-'))}
        ${detailRow('送付日 | Ngày gửi', escapeHtml(formatDate(row.SentDate)))}
        ${detailRow('受領日 | Ngày nhận', escapeHtml(formatDate(row.ReceivedDate)))}
        ${detailRow('担当者 | Người phụ trách', escapeHtml(row.SentByName || '-'))}
        ${detailRow('メモ | Ghi chú', escapeHtml(row.TeflonNotes || '-'))}
        ${detailRow('ソース | Nguồn', escapeHtml(row.source === 'teflonlog' ? 'teflonlog.csv' : 'molds.csv'))}
      </table>
    </div>
    <div class="modal-footer" style="padding:10px 12px;border-top:1px solid #ddd;display:flex;justify-content:space-between;gap:10px;">
      <button class="modal-update-btn tef-btn tef-btn-blue" type="button" style="min-width:170px;">
        <div class="jp">状態更新</div>
        <div class="vi">Cập nhật trạng thái</div>
      </button>
      <button class="modal-close-btn tef-btn tef-btn-green" type="button" style="min-width:120px;">
        <div class="jp">閉じる</div>
        <div class="vi">Đóng</div>
      </button>
    </div>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('teflon-detail-modal');
    const modalContent = overlay?.querySelector('.modal-content');
    const modalHeader = overlay?.querySelector('.modal-header');
    
    const closeModal = () => {
      if (overlay) overlay.remove();
    };

    const closeX = overlay?.querySelector('.modal-close-x');
    if (closeX) closeX.addEventListener('click', closeModal);

    const closeBtn = overlay?.querySelector('.modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const updateBtn = overlay?.querySelector('.modal-update-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        closeModal();
        openProcessManager(row);
      });
    }

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    if (modalHeader && modalContent) {
      attachSwipeToClose(modalHeader, modalContent, closeModal);
    }
  }

  // ========================================================================
  // NAV BADGE UPDATE (r7.1.5: KANJI CHARACTERS)
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

    // r7.1.5: Priority: approved (発) > pending (承) > processing (中)
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
  // EXPORT / PRINT / MAIL
  // ========================================================================

  function exportToCsv() {
    if (!filteredRows || filteredRows.length === 0) {
      alert('エクスポートするデータがありません。\nKhông có dữ liệu để xuất.');
      return;
    }

    const headers = ['No', '型名', '状態', '依頼日', '依頼者', '送付日', '受領日', '担当者', 'メモ'];
    const lines = [headers.join(',')];

    filteredRows.forEach((r, idx) => {
      const row = [
        idx + 1,
        r.MoldName || '',
        r.TeflonStatusLabel || '',
        formatDate(r.RequestedDate),
        r.RequestedByName || '',
        formatDate(r.SentDate),
        formatDate(r.ReceivedDate),
        r.SentByName || '',
        String(r.TeflonNotes || '').replace(/\n/g, ' ')
      ];

      const csvRow = row.map(v => {
        const s = v == null ? '' : String(v);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');

      lines.push(csvRow);
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nowKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `teflon-list-${nowKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printView() {
    if (!filteredRows || filteredRows.length === 0) {
      alert('印刷するデータがありません。\nKhông có dữ liệu để in.');
      return;
    }

    const win = window.open('', '_blank');
    if (!win) return;

    let rowsHtml = '';
    filteredRows.forEach((r, idx) => {
      rowsHtml += `
<tr>
  <td style="text-align:center;">${idx + 1}</td>
  <td>${escapeHtml(r.MoldName || '')}</td>
  <td style="text-align:center;">${escapeHtml(getShortStatusLabel(r.TeflonStatusKey))}</td>
  <td style="text-align:center;">${escapeHtml(formatDate(r.RequestedDate))}</td>
  <td>${escapeHtml(r.RequestedByName || '')}</td>
  <td style="text-align:center;">${escapeHtml(formatDate(r.SentDate))}</td>
  <td style="text-align:center;">${escapeHtml(formatDate(r.ReceivedDate))}</td>
  <td>${escapeHtml(r.SentByName || '')}</td>
  <td>${escapeHtml(r.TeflonNotes || '')}</td>
</tr>`;
    });

    win.document.write(`
<html>
<head>
  <meta charset="utf-8">
  <title>テフロン管理 | Quản lý mạ Teflon</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; font-size: 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 3px 5px; }
    th { background: #eeeeee; font-size: 10px; }
    h3 { margin: 0 0 8px 0; }
  </style>
</head>
<body>
  <h3>テフロン管理 | Quản lý mạ Teflon</h3>
  <table>
    <thead>
      <tr>
        <th>No</th>
        <th>型名</th>
        <th>状態</th>
        <th>依頼日</th>
        <th>依頼者</th>
        <th>送付日</th>
        <th>受領日</th>
        <th>担当者</th>
        <th>メモ</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.print();</script>
</body>
</html>`);

    win.document.close();
  }

  function mailView() {
    if (!filteredRows || filteredRows.length === 0) {
      alert('メール送信するデータがありません。\nKhông có dữ liệu để gửi mail.');
      return;
    }

    const maxLines = 50;
    const lines = [];

    lines.push('テフロン管理 | Quản lý mạ Teflon');
    lines.push('Font: Courier, Consolas, MS Gothic');
    lines.push('');
    
    const separator = '-'.repeat(95);
    lines.push(separator);

    const headerLine = padRight('No', 4) + ' ' + padRight('型名', 20) + ' ' + padRight('状態', 14) + ' ' + padRight('依頼日', 13) + ' ' + padRight('送付日', 13) + ' ' + padRight('受領日', 13) + ' ' + 'メモ';
    lines.push(headerLine);
    lines.push(separator);

    filteredRows.slice(0, maxLines).forEach((r, idx) => {
      const no = padRight(String(idx + 1), 4);
      const moldName = padRight(truncate(r.MoldName || '-', 18), 20);
      const status = padRight(truncate(r.TeflonStatusLabel || '-', 12), 14);
      const reqDate = padRight(formatDate(r.RequestedDate), 13);
      const sentDate = padRight(formatDate(r.SentDate), 13);
      const recvDate = padRight(formatDate(r.ReceivedDate), 13);
      const notes = truncate(String(r.TeflonNotes || '-').replace(/\n/g, ' '), 16);

      lines.push(no + ' ' + moldName + ' ' + status + ' ' + reqDate + ' ' + sentDate + ' ' + recvDate + ' ' + notes);
    });

    lines.push(separator);

    if (filteredRows.length > maxLines) {
      lines.push('');
      lines.push(`... ${filteredRows.length - maxLines} more ...`);
    }

    lines.push('');
    lines.push('---');
    lines.push('MoldCutterSearch');

    const subject = encodeURIComponent(`Teflon status - ${new Date().toISOString().slice(0, 10)}`);
    const body = encodeURIComponent(lines.join('\n'));

    window.location.href = `mailto:teflon@ysd.local?subject=${subject}&body=${body}`;
  }

  // ========================================================================
  // REFRESH DATA
  // ========================================================================

  function refreshData() {
    console.log('[TeflonManager] Refreshing data...');
    
    const btn = document.getElementById('teflon-refresh-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="jp">更新中...</div><div class="vi">Loading...</div>';
    }

    if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
      window.DataManager.loadAllData()
        .then(() => {
          console.log('[TeflonManager] Data refreshed');
          buildRows();
          applyFilterAndSort();
          updateNavBadge();
          
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
          }
        })
        .catch(err => {
          console.error('[TeflonManager] Refresh failed:', err);
          alert('データの更新に失敗しました。\nLỗi khi làm mới dữ liệu.');
          
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
          }
        });
    } else {
      buildRows();
      applyFilterAndSort();
      updateNavBadge();
      
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
      }
    }
  }

  // ========================================================================
  // TOGGLE TABLE LOCK (r7.1.5: FIXED)
  // ========================================================================

  function toggleTableLock() {
    isTableLocked = !isTableLocked;
    
    const panel = document.getElementById('teflon-panel');
const tableWrap = panel ? panel.querySelector('.table-wrapper') : document.querySelector('.table-wrapper');

    const lockBtn = document.getElementById('teflon-lock-btn');
    
    if (tableWrap) {
      if (isTableLocked) {
        tableWrap.classList.add('table-locked');
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
        lockBtn.innerHTML = '<div class="jp">ロック</div><div class="vi">Lock</div>';
        lockBtn.title = 'クリックして列を隠す | Bấm để ẩn cột';
      }
    }
    
    console.log('[TeflonManager] Table lock:', isTableLocked ? 'LOCKED (compact)' : 'UNLOCKED (full)');
  }

  // ========================================================================
  // OPEN PANEL (r7.1.5: UPDATED LAYOUT)
  // ========================================================================

  function openPanel() {
    console.log('[TeflonManager r7.1.5] openPanel called');
    
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
    <button id="teflon-close-btn" title="閉じる | Đóng">×</button>
  </div>
  
  <div class="tef-summary">
    ステータス別に依頼状況を表示します。 | Hiển thị trạng thái theo danh mục.
  </div>
  
  <div class="checkio-body panel-body">
    <div class="filter-row">
      <div class="tef-help">
        ヘッダークリックでソート / Bấm tiêu đề để sắp xếp。金型名クリックで更新 / Bấm tên khuôn để cập nhật。
      </div>
      
      <div class="filter-grid">
  <!-- Line 1: Label + Select (2 cột) -->
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

  <!-- Line 2: Label + Search + Unlock + Refresh (cùng 1 hàng) -->
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
</div>`;

    upper.insertAdjacentHTML('beforeend', html);

    bindPanelEvents();

    currentFilter = 'active';
    applyFilterAndSort();

    console.log('[TeflonManager] Panel opened');
  }

  // ========================================================================
  // BIND PANEL EVENTS
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
        applyFilterAndSort();
      });
    }

    const searchInput = document.getElementById('teflon-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        applyFilterAndSort();
      });
    }

    const lockBtn = document.getElementById('teflon-lock-btn');
    if (lockBtn) {
      lockBtn.addEventListener('click', toggleTableLock);
    }

    const refreshBtn = document.getElementById('teflon-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', refreshData);
    }

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
        
        applyFilterAndSort();
      });
    });

    const exportBtn = document.getElementById('teflon-export-btn');
    const printBtn = document.getElementById('teflon-print-btn');
    const mailBtn = document.getElementById('teflon-mail-btn');
    
    if (exportBtn) exportBtn.addEventListener('click', exportToCsv);
    if (printBtn) printBtn.addEventListener('click', printView);
    if (mailBtn) mailBtn.addEventListener('click', mailView);

    if (header && panel) {
      attachSwipeToClose(header, panel, closePanel);
    }

    if (tableWrap && panel) {
      attachSwipeToClose(tableWrap, panel, closePanel);
    }
  }

  function closePanel() {
    const panel = document.getElementById('teflon-panel');
    if (panel) panel.remove();
    
    document.body.classList.remove('modal-open');
    
    console.log('[TeflonManager] Panel closed');
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  const TeflonManager = {
    version: 'r7.1.5',
    INIT: function () {
      console.log('[TeflonManager r7.1.5] Initializing...');
      injectStyles();
      this.initNavButton();
      
      setTimeout(() => {
        buildRows();
        updateNavBadge();
      }, 100);
    },
    
    initNavButton: function () {
      const btn = document.getElementById('nav-teflon-btn');
      if (!btn) {
        console.warn('[TeflonManager] nav-teflon-btn not found');
        return;
      }
      
      if (btn.__tefBound) return;
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPanel();
      });
      
      btn.__tefBound = true;
      console.log('[TeflonManager] Nav button bound');
    },
    
    openPanel: openPanel,
    closePanel: closePanel,
    buildRows: buildRows,
    renderTable: renderTable,
    updateSortIndicators: updateSortIndicators,
    applyFilterAndSort: applyFilterAndSort,
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

  console.log('[TeflonManager r7.1.5] Module loaded');

})();
