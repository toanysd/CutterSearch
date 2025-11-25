/**
 * =====================================================
 * LOCATION MANAGER R1.4 - CẬP NHẬT VỊ TRÍ GIÁ-TẦNG
 * =====================================================
 * Created: 2025.11.04 16:03
 * Version: 1.4 Release (Fixed Display Logic)
 * Framework: Hybrid Architecture (V7.7.7 r6.4)
 * 
 * Purpose:
 *   - Quản lý cập nhật vị trí Giá-Tầng (RackLayerID)
 *   - Ghi lịch sử vào locationlog.csv (OldRackLayer → NewRackLayer)
 *   - ✅ FIX: Hiển thị đúng RackSymbol + RackLayerNumber
 *   - ✅ FIX: Lưu đúng RackLayerID (kết hợp RackID + LayerNumber)
 * 
 * Data Structure:
 *   - RackID: Số giá (1, 2, 3, ...)
 *   - RackSymbol: Ký hiệu giá (①, ②, ③, ...)
 *   - RackLocation: Vị trí giá (6号機室, 2F, ...)
 *   - RackLayerID: ID kết hợp (11=Giá 1-Tầng 1, 25=Giá 2-Tầng 5)
 *   - RackLayerNumber: Số tầng (1, 2, 3, ... hoặc "地面①-②")
 * 
 * Dependencies:
 *   - data-manager-r6.4.js (DataManager)
 *   - location-manager-r1.0.css
 *   - server-r6.4.js (API /api/locationlog)
 *   - index-r6.4.html (action button)
 * 
 * ===================================================== */

'use strict';

const GITHUB_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';

let currentItem = null;
let currentOldRackLayerID = null; // RackLayerID hiện tại
let sortColumn = 'DateEntry';
let sortOrder = 'desc';
let isClosingAfterSave = false; // NEW: Flag để tránh dispatch duplicate

// =====================================================
// LOCATION CACHE - Tương tự PendingCache
// =====================================================
const LocationCache = {
  add: function(logData) {
    const pending = {
      ...logData,
      pending: true,
      localId: 'temp-' + Date.now() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };

    // Thêm vào đầu locationlog array
    if (!window.DataManager?.data?.locationlog) {
      window.DataManager.data.locationlog = [];
    }
    window.DataManager.data.locationlog.unshift(pending);

    // Persist to LocalStorage
    this.persist();
    console.log('LocationCache Added:', pending.localId);
    return pending;
  },

  remove: function(localId) {
    if (!window.DataManager?.data?.locationlog) return;

    const beforeLen = window.DataManager.data.locationlog.length;
    window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(
      log => log.localId !== localId
    );
    const afterLen = window.DataManager.data.locationlog.length;

    if (beforeLen !== afterLen) {
      this.persist();
      console.log('LocationCache Removed:', localId);
    }
  },

  markError: function(localId, errorMsg) {
    const log = window.DataManager?.data?.locationlog?.find(l => l.localId === localId);
    if (log) {
      log.syncError = errorMsg;
      log.syncErrorAt = new Date().toISOString();
      this.persist();
      console.warn('LocationCache Marked error:', localId, errorMsg);
    }
  },

  persist: function() {
    try {
      const pending = window.DataManager?.data?.locationlog?.filter(log => log.pending);
      localStorage.setItem('pendingLocationLogs', JSON.stringify(pending));
      console.log('LocationCache Persisted:', pending?.length, 'logs');
    } catch (e) {
      console.warn('Failed to persist pending location logs:', e);
    }
  },

  restore: function() {
    try {
      const saved = localStorage.getItem('pendingLocationLogs');
      if (saved) {
        const pending = JSON.parse(saved);
        console.log('[LocationCache] 🔄 Restoring:', pending?.length, 'pending logs');
        
        if (!window.DataManager?.data?.locationlog) {
          window.DataManager.data.locationlog = [];
        }
        
        // Chỉ restore nếu:
        // 1. Chưa có trong real data (check bằng localId)
        // 2. Chưa có trong real data (check bằng MoldID + DateEntry + NewRackLayer)
        pending.forEach(p => {
          const existsByLocalId = window.DataManager.data.locationlog.some(log => 
            log.localId === p.localId
          );
          
          const existsByData = window.DataManager.data.locationlog.some(log => 
            log.MoldID === p.MoldID && 
            log.DateEntry === p.DateEntry && 
            log.NewRackLayer === p.NewRackLayer
          );
          
          if (!existsByLocalId && !existsByData) {
            window.DataManager.data.locationlog.unshift(p);
            console.log('[LocationCache] ✅ Restored pending log:', p.localId);
          } else {
            console.log('[LocationCache] ⚠️ Skipped duplicate log:', p.localId);
          }
        });
        
        console.log('[LocationCache] ✅ Restore complete:', pending?.length, 'logs');
      }
    } catch (e) {
      console.warn('Failed to restore pending location logs:', e);
    }
  },

  cleanup: function(maxAge = 3600000) { // 1 hour
    if (!window.DataManager?.data?.locationlog) return;

    const now = Date.now();
    const beforeLen = window.DataManager.data.locationlog.length;

    window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(log => {
      if (!log.pending) return true; // Keep real logs
      const age = now - new Date(log.createdAt).getTime();
      return age <= maxAge;
    });

    const afterLen = window.DataManager.data.locationlog.length;
    if (beforeLen !== afterLen) {
      this.persist();
      console.log('LocationCache Cleaned up:', beforeLen - afterLen, 'old logs');
    }
  }
};

// =====================================================
// LOCATION MANAGER MAIN
// =====================================================
const LocationManager = {
  INIT: function() {
    console.log('LocationManager R1.1 Module ready');

    // Restore pending logs từ localStorage
    LocationCache.restore();

    // Listen currentItem changes
    document.addEventListener('detail:changed', (e) => {
      if (e.detail?.item) {
        currentItem = e.detail.item;
      }
    });

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const panel = document.getElementById('loc-panel');
        if (panel) this.close();
      }
    });
  },

    // =================================================== 
    // OPEN MODAL - Hiển thị popup cập nhật vị trí
    // ===================================================
    openModal: function(mode = 'location', item = currentItem) {
        if (!item) {
            alert('Vui lòng chọn khuôn trước.');
            return;
        }

        currentItem = item;
        currentOldRackLayerID = item.currentRackLayer || item.RackLayerID;

        // Close existing modal
        //this.close();
        // ✅ R7.0.4: Chỉ đóng popup location (nếu có), KHÔNG đóng detail modal
        const existingPanel = document.getElementById('loc-panel');
        if (existingPanel) {
            existingPanel.remove(); // Chỉ xoá popup location cũ
            console.log('[LocationManager] Removed existing panel');
        }
        // ❌ KHÔNG gọi this.close() ở đây vì nó xoá class modal-open của detail modal


        // ✅ R7.0.4: Add modal-open class to body for iPhone mobile CSS
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            document.body.classList.add('modal-open');
            console.log('[LocationManager] ✅ Added modal-open class to body (iPhone mode)');
        }

        const upper = document.querySelector('.upper-section');
        if (!upper) {
            console.error('LocationManager: Upper section not found');
            return;
        }


    // Load data từ DataManager
    const racksList = window.DataManager?.data?.racks || [];
    const rackLayersList = window.DataManager?.data?.racklayers || [];
    const locationLogs = window.DataManager?.data?.locationlog || [];
    const employeesList = window.DataManager?.data?.employees || []; // ✅ THÊM

    console.log('LocationManager Loaded:', {
      racks: racksList.length,
      racklayers: rackLayersList.length,
      employees: employeesList.length, // ✅ THÊM
      currentRackLayerID: currentOldRackLayerID
    });

    // ✅ THÊM: AUTO-RELOAD NỀN (không chặn UI)
    setTimeout(async () => {
      console.log('[LocationManager] 📡 Background reload starting...');
      try {
        await window.DataManager.loadAllData();
        console.log('[LocationManager] ✅ Background reload completed');
        
        // Refresh history table nếu popup vẫn mở
        const historyBody = document.querySelector('#loc-his tbody');
        if (historyBody && currentItem) {
          await this.refreshHistoryInPlace(currentItem);
          console.log('[LocationManager] ✅ History table auto-refreshed');
        }
      } catch (err) {
        console.warn('[LocationManager] Background reload failed:', err);
      }
    }, 500); // Delay 500ms để UI render trước

    // Lọc lịch sử cho item này
    const historyLogs = locationLogs.filter(
      l => String(l.MoldID).trim() === String(item.MoldID).trim()
    );
    historyLogs.sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));

    // Lấy thông tin rack-layer hiện tại
    const moldID = item.MoldID;
    const moldName = item.MoldName || item.MoldCode;
    
    // ✅ FIX: Tìm RackLayer theo RackLayerID
    const currentRackLayer = rackLayersList.find(
      r => String(r.RackLayerID) === String(currentOldRackLayerID)
    );
    
    // ✅ FIX: Tìm Rack theo RackID
    const currentRack = racksList.find(
      r => String(r.RackID) === String(currentRackLayer?.RackID)
    );

    // ✅ FIX: Hiển thị đúng RackSymbol và RackLayerNumber
    const rackDisplay = currentRack?.RackSymbol || currentRack?.RackNumber || `Giá ${currentRackLayer?.RackID || '?'}`;
    const layerDisplay = currentRackLayer?.RackLayerNumber || '?';
    const rackLocation = currentRack?.RackLocation || '-';

    // Build HTML modal
    const html = `
    <div class="location-panel" id="loc-panel">
      <!-- HEADER -->
      <div class="location-header">
        <div class="location-title">
          <i class="fas fa-map-marker-alt"></i>
          <div class="location-title-text">
            <span class="location-title-main">位置変更 / Cập nhật vị trí</span>
            <span class="location-title-sub">Thay đổi Giá - Tầng lưu kho</span>
          </div>
        </div>
        <button class="btn-close-location" id="loc-close" title="Close (ESC)">×</button>
      </div>

      <!-- BODY: 3 COLUMNS -->
      <div class="location-body">
        <!-- CỘT 1: LỊCH SỬ - 50% -->
        <section class="loc-history">
          <h4>📋 履歴 / Lịch sử thay đổi (${historyLogs.length})</h4>
          <div class="location-filter-row">
            <input type="text" id="loc-search" class="location-form-control" 
              <input placeholder="検索... / Tìm kiếm...">
          </div>
          <div class="location-history-wrap">
            ${this.renderHistory(historyLogs, racksList, rackLayersList)}
          </div>
        </section>

        <!-- CỘT 2: TRẠNG THÁI - 25% -->
        <section class="loc-status">
          <h4>📊 情報 / Thông tin hiện tại</h4>

          <div class="loc-inline-status">
            <!-- Hàng 1: ID + Tên -->
            <div class="loc-inline-row">
              <span class="loc-inline-label">ID / Mã</span>
              <span class="loc-inline-value">${moldID}</span>
              <span class="loc-inline-sep">｜</span>
              <span class="loc-inline-label">名称 / Tên</span>
              <span class="loc-inline-value">${moldName}</span>
            </div>

            <!-- Hàng 2: Giá + Tầng -->
            <div class="loc-inline-row">
              <span class="loc-inline-label">現在位置 / Vị trí hiện tại:</span>
              <span class="loc-inline-value">${rackDisplay} - Tầng ${layerDisplay}</span>
            </div>

            <!-- Hàng 3: Vị trí kho -->
            <div class="loc-inline-row">
              <span class="loc-inline-label">保管場所 / Vị trí kho:</span>
              <span class="loc-inline-value">${rackLocation}</span>
            </div>
          </div>
        </section>


        <!-- CỘT 3: NHẬP LIỆU - 25% -->
        <section class="loc-inputs">
          <h4>✏️ 新位置 / Vị trí mới</h4>

          <!-- Chọn Giá -->
          <div class="location-form-group">
            <label class="location-form-label">* 棚番号 / Giá</label>
            <select id="loc-rack" class="location-form-control">
              <option value="">-- 棚選択・Chọn Giá --</option>
              ${racksList.map(r => {
                const displayText = `${r.RackSymbol || r.RackNumber || `Giá ${r.RackID}`} (${r.RackLocation || '-'})`;
                return `<option value="${r.RackID}" data-rack-symbol="${r.RackSymbol}" data-rack-loc="${r.RackLocation}">
                  ${displayText}
                </option>`;
              }).join('') || ''}
            </select>
          </div>

          <!-- Chọn Tầng -->
          <div class="location-form-group">
            <label class="location-form-label">* 棚の段 / Tầng</label>
            <select id="loc-layer" class="location-form-control" disabled>
              <option value="">-- 棚の段選択・Chọn Tầng --</option>
            </select>
          </div>

          <!-- ✅ THÊM: Dropdown nhân viên -->
          <div class="location-form-group">
            <label class="location-form-label">* 担当者 / Nhân viên</label>
            <select id="loc-employee" class="location-form-control">
              <option value="">-- 担当者選択・Chọn --</option>
            </select>
          </div>

          <!-- Ghi chú -->
          <div class="location-form-group">
            <label class="location-form-label">メモ / Ghi chú</label>
            <textarea id="loc-note" class="location-form-control" 
                      rows="2" placeholder="Lý do thay đổi vị trí..."></textarea>
          </div>

          <!-- Nút xác nhận / hủy -->
          <div class="location-btn-row">
            <button class="btn-confirm-location" id="btn-loc-confirm">
              ✓ 更新 / Cập nhật
            </button>
            <button class="btn-cancel-location" id="btn-loc-cancel">
              ✕ キャンセル / Hủy
            </button>
          </div>
        </section>
      </div>
    </div>
    `;

    upper.insertAdjacentHTML('beforeend', html);

    // Auto-focus modal
    setTimeout(() => {
      const firstSelect = document.getElementById('loc-rack');
      if (firstSelect) firstSelect.focus();
      document.dispatchEvent(new CustomEvent('keyboardattach', {
        detail: { element: firstSelect }
      }));
    }, 300);

    // ✅ THÊM: Populate employee dropdown
    const employeeSelect = document.getElementById('loc-employee');
    if (employeeSelect && employeesList.length > 0) {
      employeesList.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.EmployeeID;  // ✅ THỐNG NHẤT dùng EmployeeID
        // ✅ Hiển thị EmployeeName hoặc name hoặc EmployeeID
        option.textContent = emp.EmployeeName || emp.name || emp.EmployeeID;
        employeeSelect.appendChild(option);
      });
      
      // Set default to first employee
      if (employeesList[0]) {
        employeeSelect.value = employeesList[0].EmployeeID;
      }

      
      console.log('[LocationManager] ✅ Loaded', employeesList.length, 'employees');
    }


    // Bind events
    this.bindModalEvents(item, racksList, rackLayersList);

    // Enable filter, sort, dropdown logic
    this.enableFilter();
    this.enableLayerDropdown(rackLayersList);
    this.enableSort();
  },

  // ===================================================
  // RENDER HISTORY TABLE
  // ===================================================
  renderHistory: function(logs, racksList, rackLayersList) {
    if (!logs || logs.length === 0) {
      return '<div class="no-location-history">Chưa có lịch sử thay đổi vị trí</div>';
    }

    const tableRows = logs.map((l, idx) => {
      // ✅ FIX: Lấy thông tin Old Location
      const oldRackLayer = rackLayersList.find(r => String(r.RackLayerID) === String(l.OldRackLayer));
      const oldRack = racksList.find(r => String(r.RackID) === String(oldRackLayer?.RackID));
      const oldDisplay = oldRack 
        ? `${oldRack.RackSymbol || oldRack.RackNumber || `Giá ${oldRack.RackID}`} - T${oldRackLayer?.RackLayerNumber || '?'}`
        : `ID ${l.OldRackLayer || '?'}`;

      // ✅ FIX: Lấy thông tin New Location
      const newRackLayer = rackLayersList.find(r => String(r.RackLayerID) === String(l.NewRackLayer));
      const newRack = racksList.find(r => String(r.RackID) === String(newRackLayer?.RackID));
      const newDisplay = newRack
        ? `${newRack.RackSymbol || newRack.RackNumber || `Giá ${newRack.RackID}`} - T${newRackLayer?.RackLayerNumber || '?'}`
        : `ID ${l.NewRackLayer || '?'}`;

      const isPending = l.pending === true;
      const hasError = l.syncError;

      let syncClass = 'sync-dot synced';
      let syncTitle = 'Đã đồng bộ';
      let syncIcon = '✓';
      if (hasError) {
        syncClass = 'sync-dot error';
        syncTitle = 'Lỗi: ' + l.syncError;
        syncIcon = '!';
      } else if (isPending) {
        syncClass = 'sync-dot pending';
        syncTitle = 'Đang chờ đồng bộ...';
        syncIcon = '◉';
      }

      // Delete button - chỉ show nếu đã sync thành công
      const deleteBtn = !isPending && !hasError
        ? `<button class="btn-delete-history" data-log-id="${l.LocationLogID}" 
                   data-mold-id="${l.MoldID}"
                   data-time="${encodeURIComponent(l.DateEntry)}" title="Xóa">
            🗑
          </button>`
        : '';

      return `
        <tr data-log-id="${l.LocationLogID}" class="${isPending ? 'row-pending' : ''}">
          <td data-time="${l.DateEntry}">${this.fmt(l.DateEntry)}</td>
          <td>
            <span class="location-badge old-location">${oldDisplay}</span>
            <span class="badge-sep">→</span>
            <span class="location-badge new-location">${newDisplay}</span>
          </td>
          <td>${this.getEmployeeName(l.Employee || l.EmployeeID)}</td>
          <td class="note-cell">${l.notes || '-'}</td>
          <td class="sync-cell">
            <span class="sync-cell" title="${syncTitle}">${syncIcon}</span>
          </td>
          <td class="action-cell">${deleteBtn}</td>
        </tr>
      `;

    }).join('');

    return `
      <table class="location-history-table" id="loc-his">
        <thead>
          <tr>
            <th data-sort="DateEntry">日時</th>
            <th>旧→新</th>
            <th>担当者</th>
            <th>メモ</th>
            <th class="action-cell">削除</th>
          </tr>
        </thead>

        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  },

  // ===================================================
  // RENDER HISTORY ROWS ONLY - Tách riêng để tái sử dụng
  // ===================================================
  renderHistoryRows: function(logs, racksList, rackLayersList) {
    if (!logs || logs.length === 0) {
      return '<tr><td colspan="5" class="no-location-history">Chưa có lịch sử</td></tr>';
    }

    return logs.map((l, idx) => {
      // ✅ Copy nguyên logic từ hàm renderHistory
      const oldRackLayer = rackLayersList.find(r => String(r.RackLayerID) === String(l.OldRackLayer));
      const oldRack = racksList.find(r => String(r.RackID) === String(oldRackLayer?.RackID));
      const oldDisplay = oldRack 
        ? `${oldRack.RackSymbol || oldRack.RackNumber || `Giá ${oldRack.RackID}`} - T${oldRackLayer?.RackLayerNumber || '?'}`
        : `ID ${l.OldRackLayer || '?'}`;

      const newRackLayer = rackLayersList.find(r => String(r.RackLayerID) === String(l.NewRackLayer));
      const newRack = racksList.find(r => String(r.RackID) === String(newRackLayer?.RackID));
      const newDisplay = newRack
        ? `${newRack.RackSymbol || newRack.RackNumber || `Giá ${newRack.RackID}`} - T${newRackLayer?.RackLayerNumber || '?'}`
        : `ID ${l.NewRackLayer || '?'}`;

      const isPending = l.pending === true;
      const hasError = l.syncError;

      let syncClass = 'sync-dot synced';
      let syncTitle = 'Đã đồng bộ';
      let syncIcon = '✓';
      if (hasError) {
        syncClass = 'sync-dot error';
        syncTitle = 'Lỗi: ' + l.syncError;
        syncIcon = '!';
      } else if (isPending) {
        syncClass = 'sync-dot pending';
        syncTitle = 'Đang chờ đồng bộ...';
        syncIcon = '◉';
      }

      const deleteBtn = !isPending && !hasError
        ? `<button class="btn-delete-history" data-log-id="${l.LocationLogID}" 
                  data-mold-id="${l.MoldID}"
                  data-time="${encodeURIComponent(l.DateEntry)}" title="Xóa">
            🗑
          </button>`
        : '';

      return `
        <tr data-log-id="${l.LocationLogID}" ${l.localId || ''}
            class="${isPending ? 'row-pending' : ''}">
          <td data-time="${l.DateEntry}">${this.fmt(l.DateEntry)}</td>
          <td>
            <span class="location-badge old-location">${oldDisplay}</span>
            <span class="badge-sep">→</span>
            <span class="location-badge new-location">${newDisplay}</span>
          </td>
          <td>${this.getEmployeeName(l.Employee || l.EmployeeID)}</td>
          <td class="note-cell">${l.notes || '-'}</td>
          <td class="sync-cell">
            <span class="${syncClass}" title="${syncTitle}">${syncIcon}</span>
          </td>
          <td class="action-cell">${deleteBtn}</td>
        </tr>
      `;

    }).join('');
  },

  // ===================================================
  // BIND MODAL EVENTS
  // ===================================================
  bindModalEvents: function(item, racksList, rackLayersList) {
    // Close button
    const closeBtn = document.getElementById('loc-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // ✅ Cancel button: Chỉ đóng popup, KHÔNG đóng detail modal
    const cancelBtn = document.getElementById('btn-loc-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            console.log('[LocationManager] Cancel clicked -> Close popup only');
            LocationManager.close(false); // ✅ false = giữ detail modal
        });
    }

    // ✅ Confirm button: Gọi saveRecord(), trong saveRecord() đã có logic đóng
    const confirmBtn = document.getElementById('btn-loc-confirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            console.log('[LocationManager] Confirm clicked -> Process update');
            await this.saveRecord(item, rackLayersList);
            // Lưu ý: saveRecord() sẽ tự gọi this.close() sau khi lưu thành công
        });
    }



    // Bind delete history buttons
    this.bindDeleteHistoryEvents(item.MoldID);
  },

  // ===================================================
  // ENABLE LAYER DROPDOWN - Phụ thuộc vào Rack selection
  // ===================================================
  enableLayerDropdown: function(rackLayersList) {
    const rackSelect = document.getElementById('loc-rack');
    const layerSelect = document.getElementById('loc-layer');

    if (!rackSelect || !layerSelect) return;

    rackSelect.addEventListener('change', (e) => {
      const selectedRackId = e.target.value;

      // Clear layer select
      layerSelect.innerHTML = '<option value="">-- Chọn Tầng --</option>';
      layerSelect.disabled = !selectedRackId;

      if (!selectedRackId) return;

      // ✅ FIX: Filter racklayers by RackID (not RackLayerID)
      const layers = rackLayersList.filter(l => String(l.RackID) === String(selectedRackId));
      
      layers.forEach(layer => {
        const option = document.createElement('option');
        option.value = layer.RackLayerID; // Lưu RackLayerID (VD: 25)
        option.textContent = `Tầng ${layer.RackLayerNumber}`; // Hiển thị RackLayerNumber (VD: "5")
        layerSelect.appendChild(option);
      });

      console.log('LocationManager: Loaded', layers.length, 'layers for RackID', selectedRackId);
    });
  },

  // ===================================================
  // ENABLE FILTER
  // ===================================================
  enableFilter: function() {
    const input = document.getElementById('loc-search');
    const table = document.getElementById('loc-his');

    if (!input || !table) return;

    input.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const rows = table.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    });
  },

  // ===================================================
  // ENABLE SORT
  // ===================================================
  enableSort: function() {
    const table = document.getElementById('loc-his');
    if (!table) return;

    const headers = table.querySelectorAll('thead th[data-sort]');
    headers.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const column = th.getAttribute('data-sort');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        const isAsc = !th.classList.contains('asc');

        // Reset all headers
        headers.forEach(h => h.classList.remove('asc', 'desc'));
        th.classList.add(isAsc ? 'asc' : 'desc');

        rows.sort((a, b) => {
          let aText, bText;

          if (column === 'DateEntry') {
            aText = new Date(a.cells[0]?.getAttribute('data-time'));
            bText = new Date(b.cells[0]?.getAttribute('data-time'));
          } else {
            aText = a.cells[2]?.innerText || '';
            bText = b.cells[2]?.innerText || '';
          }

          if (column === 'DateEntry') {
            return isAsc ? aText - bText : bText - aText;
          } else {
            return isAsc
              ? aText.localeCompare(bText)
              : bText.localeCompare(aText);
          }
        });

        rows.forEach(row => tbody.appendChild(row));
      });
    });
  },

  // ===================================================
  // BIND DELETE HISTORY EVENTS
  // ===================================================
  bindDeleteHistoryEvents: function(itemMoldId) {
    const buttons = document.querySelectorAll('.btn-delete-history');

    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();

        const logId = btn.getAttribute('data-log-id');
        const timestamp = btn.getAttribute('data-time');
        const moldID = btn.getAttribute('data-mold-id');

        // ✅ FIX: Lấy localId từ button hoặc log object
        let localIdToRemove = btn.getAttribute('data-local-id');
        
        if (!localIdToRemove) {
          // Tìm trong log object
          const log = window.DataManager?.data?.locationlog?.find(
            l => l.LocationLogID === logId
          );
          localIdToRemove = log?.localId;
          
          if (localIdToRemove) {
            console.log('[LocationManager] localId found from log object:', localIdToRemove);
          } else {
            console.warn('[LocationManager] WARNING: localId not found for logId', logId);
          }
        }

        if (!confirm('Bạn chắc chắn muốn xóa lịch sử này không?')) return;

        const row = btn.closest('tr');
        if (row) row.classList.add('deleting');

        try {
          const res = await fetch(`${GITHUB_API_URL}/${logId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              MoldID: moldID,
              DateEntry: decodeURIComponent(timestamp)
            })
          });

          const rj = await res.json();

          if (rj.success) {
            console.log('[LocationManager] GitHub sync SUCCESS', rj);

            // Lưu pending logs
            const allPendingLogs = (window.DataManager?.data?.locationlog || []).filter(
              log => log.pending === true || log.localId?.startsWith('temp-')
            );

            console.log('[LocationManager] Preserving', allPendingLogs.length, 'pending logs before reload');

            // Reload data
            await window.DataManager.loadAllData();
            console.log('[LocationManager] ✅ Data reloaded from GitHub');

            // Merge pending logs
            const remainingPendingLogs = allPendingLogs.filter(log => log.localId !== localIdToRemove);

            if (remainingPendingLogs.length > 0) {
              window.DataManager.data.locationlog = [
                ...remainingPendingLogs,
                ...window.DataManager.data.locationlog
              ];
              console.log('[LocationManager] ✅ Merged', remainingPendingLogs.length, 'pending logs back');
            }
            
            // ✅ FIX: Only remove if localId exists
            if (localIdToRemove) {
              LocationCache.remove(localIdToRemove);
              console.log('[LocationManager] ✅ Removed synced log from cache:', localIdToRemove);
            }

            // Update mold trong data
            const moldToUpdate = window.DataManager?.data?.molds?.find(
              m => String(m.MoldID).trim() === String(moldID).trim()
            );

            if (moldToUpdate) {
              console.log('[LocationManager] ✅ Mold found in data, ready for detail refresh');
            }

            // Dispatch event
            if (currentItem) {
              document.dispatchEvent(new CustomEvent('detail:changed', {
                detail: {
                  item: currentItem,
                  itemType: 'mold',
                  itemId: moldID,
                  source: 'location-delete'
                }
              }));
              console.log('[LocationManager] ✅ Dispatched detail:changed event');
            }

            this.showToast('✓ 削除成功 / Xóa lịch sử thành công!', 'success');
          } else {
            console.error('[LocationManager] GitHub sync FAILED', rj.message);
            this.showToast('✕ Lỗi xóa: ' + (rj.message || 'Unknown error'), 'error');
          }
        } catch (err) {
          console.error('[LocationManager] Network error', err);
          this.showToast('✕ Lỗi mạng: ' + err.message, 'error');
        } finally {
          if (row) row.classList.remove('deleting');
        }
      });
    });
  },

  // ===================================================
  // SAVE RECORD - Cập nhật vị trí (Optimistic Update)
  // ===================================================
  saveRecord: async function(item, rackLayersList) {
  const rackSelect = document.getElementById('loc-rack');
  const layerSelect = document.getElementById('loc-layer');
  const noteInput = document.getElementById('loc-note');
  const employeeSelect = document.getElementById('loc-employee'); // ✅ THÊM
  
  const rackValue = rackSelect?.value?.trim();
  const layerValue = layerSelect?.value?.trim();
  const noteValue = noteInput?.value?.trim();
  const employeeValue = employeeSelect?.value?.trim(); // ✅ THÊM

    // Validation
    if (!rackValue) {
      alert('Vui lòng chọn Giá');
      rackSelect?.focus();
      return;
    }

    if (!layerValue) {
      alert('Vui lòng chọn Tầng');
      layerSelect?.focus();
      return;
    }

    // ✅ THÊM: Validate employee
    if (!employeeValue) {
      alert('担当者を選択してください / Vui lòng chọn nhân viên');
      employeeSelect?.focus();
      return;
    }

    // ✅ FIX: Lưu RackLayerID (không phải RackID)
    const data = {
      MoldID: item.MoldID,
      OldRackLayer: currentOldRackLayerID,
      NewRackLayer: layerValue,
      notes: noteValue,
      Employee: employeeValue, // ✅ THÊM
      DateEntry: new Date().toISOString()
    };

    console.log('LocationManager: Submitting', data);

    // BC 1: OPTIMISTIC UPDATE - Thêm vào cache ngay
    const pendingLog = LocationCache.add(data);

    if (!pendingLog) {
      console.error('LocationManager: LocationCache not available');
      this.showToast('✗ Lỗi: Cache không khả dụng', 'error');
      return;
    }

    // BC 2: UI Update tức thời
    this.showToast('⏳ Đang cập nhật...', 'info');

    // BC 3: Dispatch event để update badge

    // ✅ THÊM: Update currentRackLayer trong item ngay lập tức
    item.currentRackLayer = layerValue;
    item.RackLayerID = layerValue;

    document.dispatchEvent(new CustomEvent('detail:changed', {
      detail: {
        item: item,
        itemType: 'mold',
        itemId: item.MoldID,
        source: 'location-pending'
      }
    }));

    // === FIX: Close modal và dispatch event để đóng detail modal ===
    setTimeout(() => {
        isClosingAfterSave = true; // Set flag trước khi close
        LocationManager.close(false); // false = chỉ đóng popup location
        
        // Dispatch success event để mobile detail modal biết và tự đóng
        document.dispatchEvent(new CustomEvent('location-updated', {
            detail: {
                item: item,
                success: true,
                oldRackLayer: currentOldRackLayerID,
                newRackLayer: data.NewRackLayer,
                timestamp: new Date().toISOString()
            }
        }));
        
        console.log('[LocationManager] ✅ Dispatched location-updated event');
        
        // Reset flag sau khi xong
        setTimeout(() => { isClosingAfterSave = false; }, 100);
    }, 300);




    // BC 4: Background sync to GitHub
    this.syncToGitHub(data, pendingLog.localId, item.MoldID);
  },

  // ===================================================
  // BACKGROUND SYNC TO GITHUB
  // ===================================================
  syncToGitHub: async function(data, localId, moldId) {
    try {
      console.log('Sending POST to:', GITHUB_API_URL);

      const res = await fetch(GITHUB_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      console.log('Response status:', res.status, res.statusText);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const rj = await res.json();
      console.log('Response data:', rj);

      if (rj.success) {
        console.log('[LocationManager] ✅ GitHub sync SUCCESS', rj);
        
        // ===================================================
        // BC 1: REMOVE PENDING LOG (XÓA KHỎI ARRAY VÀ LOCALSTORAGE)
        // ===================================================
        // Xóa khỏi locationlog array
        if (window.DataManager?.data?.locationlog) {
          const beforeLen = window.DataManager.data.locationlog.length;
          window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(
            log => log.localId !== localId
          );
          const afterLen = window.DataManager.data.locationlog.length;
          console.log('[LocationManager] ✅ Removed pending log from array:', localId, `(${beforeLen} → ${afterLen})`);
        }

        // Xóa khỏi LocationCache (persist to LocalStorage)
        LocationCache.remove(localId);
        console.log('[LocationManager] ✅ Removed pending log from cache:', localId);
        
        // ===================================================
        // BƯỚC 2: THÊM REAL LOG VÀO locationlog ARRAY
        // (HỌC THEO CHECK-IN MODULE - KHÔNG reload DataManager!)
        // ===================================================
        const realLog = {
          LocationLogID: rj.logId || `LOC${Date.now()}`,
          MoldID: data.MoldID,
          OldRackLayer: data.OldRackLayer,
          NewRackLayer: data.NewRackLayer,
          DateEntry: data.DateEntry,
          notes: data.notes || '',
          Employee: data.Employee || data.EmployeeID || '-',  // ✅ THÊM TRƯỜNG NÀY
          EmployeeID: data.Employee || data.EmployeeID || '-' // ✅ Đảm bảo cả 2 field
        };
        
        // Kiểm tra trùng TRƯỚC KHI thêm
        if (window.DataManager?.data?.locationlog) {
          const exists = window.DataManager.data.locationlog.some(log => 
            log.DateEntry === realLog.DateEntry && 
            log.MoldID === realLog.MoldID &&
            log.NewRackLayer === realLog.NewRackLayer
          );
          if (!exists) {
            // THÊM VÀO ĐẦU array để hiển thị ở đầu table
            window.DataManager.data.locationlog.unshift(realLog);
            console.log('[LocationManager] ✅ Added real log to locationlog array');
          } else {
            console.log('[LocationManager] ⚠️ Log already exists, skipping');
          }
        }
        
        // ===================================================
        // BC 3: UPDATE MOLD TRONG MOLDS ARRAY (IN-MEMORY)
        // ===================================================
        const moldToUpdate = window.DataManager?.data?.molds?.find(
          m => String(m.MoldID) === String(data.MoldID)
        );

        if (moldToUpdate) {
          // Update currentRackLayer trong molds array (IN-MEMORY)
          moldToUpdate.currentRackLayer = data.NewRackLayer;
          moldToUpdate.RackLayerID = data.NewRackLayer;
          
          // Lookup rack info
          const rackLayer = window.DataManager?.data?.racklayers?.find(
            rl => String(rl.RackLayerID) === String(data.NewRackLayer)
          );
          if (rackLayer) {
            moldToUpdate.rackLayerInfo = rackLayer;
            moldToUpdate.rackId = rackLayer.RackID;
            
            const rack = window.DataManager?.data?.racks?.find(
              r => String(r.RackID) === String(rackLayer.RackID)
            );
            if (rack) {
              moldToUpdate.rackInfo = rack;
            }
          }
          
          console.log('[LocationManager] ✅ Updated mold in-memory:', data.NewRackLayer);
          
          console.log('[LocationManager] ℹ️ Server already updated molds.csv via POST /api/locationlog');
          
        }
        // ===================================================
        // BƯỚC 4: UPDATE CURRENT ITEM (nếu đang xem item này)
        // ===================================================
        if (currentItem && String(currentItem.MoldID) === String(data.MoldID)) {
          currentItem.currentRackLayer = data.NewRackLayer;
          currentItem.RackLayerID = data.NewRackLayer;
          
          // Sync rack info
          if (moldToUpdate) {
            currentItem.rackLayerInfo = moldToUpdate.rackLayerInfo;
            currentItem.rackInfo = moldToUpdate.rackInfo;
            currentItem.rackId = moldToUpdate.rackId;
          }
          
          console.log('[LocationManager] ✅ Updated currentItem:', data.NewRackLayer);
        }
        
        // ===================================================
        // BƯỚC 5: REFRESH HISTORY TABLE (nếu popup đang mở)
        // (HỌC THEO CHECK-IN MODULE - CHỈ re-render, KHÔNG reload!)
        // ===================================================
        const historyWrap = document.querySelector('#loc-panel .location-history-table tbody');
        if (historyWrap && currentItem) {
          console.log('[LocationManager] 🔄 Refreshing history table...');
          await this.refreshHistoryInPlace(currentItem);
          console.log('[LocationManager] ✅ History table refreshed');
        }
        
        // ===================================================
        // BƯỚC 6: REFRESH HISTORY TABLE (nếu popup đang mở)
        // ===================================================
        const historyBody = document.querySelector('#loc-his tbody');
        if (historyBody && currentItem) {
          console.log('[LocationManager] 🔄 Refreshing history table...');
          this.refreshHistoryInPlace(currentItem);
          console.log('[LocationManager] ✅ History table refreshed');
        } else if (currentItem) {
          // Popup đã đóng → dispatch event để update badge
          document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: {
              item: currentItem,
              itemType: 'mold',
              itemId: data.MoldID,
              source: 'location-sync'
            }
          }));
          console.log('[LocationManager] ✅ Dispatched detail:changed event');
        }

        
        // ===================================================
        // BƯỚC 7: TOAST SUCCESS
        // ===================================================
        this.showToast('✓ 位置更新成功 / Cập nhật vị trí thành công!', 'success');
      } else {
        console.error('LocationManager: GitHub sync FAILED', rj.message);
        this.handleSyncError(localId, rj.message || 'Unknown error');
      }
    } catch (err) {
      console.error('LocationManager: Network error', err);
      this.handleSyncError(localId, err.message);
    }
  },

  // ===================================================
  // REFRESH HISTORY IN PLACE - Refresh history table without reopening modal
  // ===================================================
  refreshHistoryInPlace: function(item) {
    const historyBody = document.querySelector('#loc-his tbody');
    if (!historyBody) {
      console.warn('[LocationManager] History table not found');
      return;
    }

    // Get data
    const locationLogs = window.DataManager?.data?.locationlog || [];
    const racksList = window.DataManager?.data?.racks || [];
    const rackLayersList = window.DataManager?.data?.racklayers || [];

    // Filter logs for current item
    const historyLogs = locationLogs.filter(
      l => String(l.MoldID).trim() === String(item.MoldID).trim()
    );
    historyLogs.sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));

    // Re-render history table
    historyBody.innerHTML = '';

    historyLogs.forEach(log => {
      const tr = document.createElement('tr');
      
      // Time
      const tdTime = document.createElement('td');
      const date = new Date(log.DateEntry);
      tdTime.textContent = date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      tr.appendChild(tdTime);

      // From → To
      const tdMove = document.createElement('td');
      
      const oldRackLayer = rackLayersList.find(r => String(r.RackLayerID) === String(log.OldRackLayer));
      const oldRack = racksList.find(r => String(r.RackID) === String(oldRackLayer?.RackID));
      const oldDisplay = `${oldRack?.RackSymbol || oldRack?.RackNumber || `Giá ${oldRackLayer?.RackID || '?'}`} - T${oldRackLayer?.RackLayerNumber || '?'}`;
      
      const newRackLayer = rackLayersList.find(r => String(r.RackLayerID) === String(log.NewRackLayer));
      const newRack = racksList.find(r => String(r.RackID) === String(newRackLayer?.RackID));
      const newDisplay = `${newRack?.RackSymbol || newRack?.RackNumber || `Giá ${newRack?.RackID || '?'}`} - T${newRackLayer?.RackLayerNumber || '?'}`;
      
      tdMove.innerHTML = `<span class="location-badge old-location">${oldDisplay}</span>
                          <span class="badge-sep">→</span>
                          <span class="location-badge new-location">${newDisplay}</span>`;
      tr.appendChild(tdMove);

      // Employee / 担当者
      const tdEmployee = document.createElement('td');
      tdEmployee.textContent = this.getEmployeeName(log.Employee || log.EmployeeID);
      tr.appendChild(tdEmployee);

      // Notes
      const tdNote = document.createElement('td');
      tdNote.textContent = log.notes || '-';
      tr.appendChild(tdNote);

      // Sync status
      const tdSync = document.createElement('td');

      if (log.syncError) {
        tdSync.innerHTML = '<span class="sync-dot error" title="' + log.syncError + '">!</span>';
      } else if (log.pending) {
        tdSync.innerHTML = '<span class="sync-dot pending" title="Đang chờ đồng bộ...">◉</span>';
      } else {
        tdSync.innerHTML = '<span class="sync-dot synced" title="Đã đồng bộ">✓</span>';
      }
      tr.appendChild(tdSync);

      // Delete button
      const tdAction = document.createElement('td');
      if (!log.pending && !log.syncError) {
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-delete-history';
        btnDel.innerHTML = '🗑';
        btnDel.title = '削除 / Xóa';
        btnDel.onclick = async () => {
          if (!confirm('この履歴を削除してもよろしいですか？ / Bạn có chắc muốn xóa lịch sử này?')) return;
         
          tr.classList.add('deleting');
         
          try {
            const res = await fetch(`${GITHUB_API_URL}/${log.LocationLogID}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                MoldID: log.MoldID,
                DateEntry: log.DateEntry
              })
            });
           
            const rj = await res.json();
           
            if (rj.success) {
              console.log('[LocationManager] ✅ Deleted from server:', log.LocationLogID);
              
              // ✅ BƯỚC 1: XÓA KHỎI LOCAL DATA NGAY LẬP TỨC
              if (window.DataManager?.data?.locationlog) {
                const beforeLen = window.DataManager.data.locationlog.length;
                window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(
                  l => String(l.LocationLogID) !== String(log.LocationLogID)
                );
                console.log('[LocationManager] 🗑 Removed from local:', beforeLen - window.DataManager.data.locationlog.length, 'rows');
              }
              
              // ✅ BƯỚC 2: REMOVE ROW NGAY LẬP TỨC
              tr.remove();
              console.log('[LocationManager] 🔄 History row removed from UI');
              
              // ✅ BƯỚC 3: TOAST SUCCESS
              this.showToast('✓ 削除しました / Đã xóa thành công', 'success');
              
              // ✅ BƯỚC 4: RELOAD NỀN (DELAY 2 GIÂY)
              setTimeout(async () => {
                try {
                  await window.DataManager.loadAllData();
                  console.log('[LocationManager] 📡 Background reload completed');
                  
                  // Refresh lại bảng (nếu popup vẫn mở)
                  const historyBody = document.querySelector('#loc-his tbody');
                  if (historyBody && currentItem) {
                    await this.refreshHistoryInPlace(currentItem);
                  }
                } catch (err) {
                  console.warn('[LocationManager] Background reload failed:', err);
                }
              }, 2000); // ← Delay 2 giây để GitHub cập nhật CSV
              
            } else {
              this.showToast('✗ エラー / Lỗi: ' + (rj.message || 'Unknown error'), 'error');
              tr.classList.remove('deleting');
            }
          } catch (err) {
            console.error('Delete error:', err);
            this.showToast('✗ 接続エラー / Lỗi kết nối: ' + err.message, 'error');
            tr.classList.remove('deleting');
          }
        };
        tdAction.appendChild(btnDel);
      }

      tr.appendChild(tdAction);

      historyBody.appendChild(tr);
    });

    console.log('[LocationManager] 📊 Refreshed', historyLogs.length, 'history rows in place');
  },


  // ===================================================
  // HANDLE SYNC ERROR
  // ===================================================
  handleSyncError: function(localId, errorMsg) {
    LocationCache.markError(localId, errorMsg);

    this.showToast('✗ Lỗi: ' + errorMsg, 'error');

    console.log('Will retry sync after 30s...');
    setTimeout(() => {
      const log = window.DataManager?.data?.locationlog?.find(l => l.localId === localId);
      if (log && log.pending) {
        log.syncError = undefined; // Reset error
        console.log('Retrying sync for:', localId);
        const data = {
          MoldID: log.MoldID,
          OldRackLayer: log.OldRackLayer,
          NewRackLayer: log.NewRackLayer,
          notes: log.notes,
          DateEntry: log.DateEntry
        };
        this.syncToGitHub(data, localId, log.MoldID);
      }
    }, 30000);
  },

  // ===================================================
  // TOAST NOTIFICATIONS
  // ===================================================
  showToast: function(message, type = 'info') {
    const existing = document.getElementById('loc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'loc-toast';
    toast.className = `loc-toast loc-toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // ===================================================
  // UTILITY: FORMAT DATE
  // ===================================================
  fmt: function(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    
    // ✅ SỬA: Dùng toLocaleString để đồng nhất với refreshHistoryInPlace
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // ===================================================
  // UTILITY: GET EMPLOYEE NAME
  // ===================================================
  getEmployeeName: function(employeeId) {
    if (!employeeId || employeeId === '-') return '-';
    const emp = (window.DataManager?.data?.employees || [])
      .find(e => String(e.EmployeeID).trim() === String(employeeId).trim());
    return emp?.EmployeeName || emp?.name || employeeId;
  },


  // CLOSE MODAL
  close: function(closeDetail = false) {
      const panel = document.getElementById('loc-panel');
      if (!panel) {
          console.log('[LocationManager] Panel not found, nothing to close');
          return; // Không làm gì nếu popup không tồn tại
      }

      panel.remove();
      console.log('[LocationManager] Closed panel');

      // === NEW: Dispatch cancel event nếu KHÔNG phải từ saveRecord ===
      if (!isClosingAfterSave) {
          document.dispatchEvent(new CustomEvent('module-cancelled', {
              detail: {
                  module: 'location',
                  item: currentItem,
                  timestamp: new Date().toISOString()
              }
          }));
          console.log('[LocationManager] ✅ Dispatched module-cancelled event');
      } else {
          console.log('[LocationManager] ℹ️ Skipped module-cancelled (closing after save)');
      }

      // R7.0.4: Chỉ xóa modal-open NẾU KHÔNG có detail modal đang hiển thị
      // HOẶC nếu closeDetail = true (đóng cả detail modal)
      const detailModal = document.querySelector('.mobile-detail-modal.active');
      
      if (closeDetail && detailModal) {
          // Trường hợp: Confirm thành công, đóng cả detail modal
          console.log('[LocationManager] Closing Detail Modal after confirm');
          document.body.classList.remove('modal-open');
          detailModal.classList.remove('active');
          
          // Gọi hàm close của detail modal nếu có
          if (window.MobileDetailModal && typeof window.MobileDetailModal.close === 'function') {
              window.MobileDetailModal.close();
          }
      } else if (!detailModal) {
          // Trường hợp: Không có detail modal, xóa modal-open an toàn
          document.body.classList.remove('modal-open');
          console.log('[LocationManager] Removed modal-open (no detail modal)');
      } else {
          // Trường hợp: Có detail modal, GIỮ NGUYÊN modal-open
          console.log('[LocationManager] Keeping modal-open for Detail Modal');
      }

      // Reattach keyboard to searchbox
      const searchBox = document.querySelector('input.search-input');
      if (searchBox) {
          searchBox.focus();
          document.dispatchEvent(new CustomEvent('keyboard:attach', {
              detail: { element: searchBox }
          }));
      }

      // Cleanup old pending logs
      LocationCache.cleanup();
  }

};

// =====================================================
// EXPORT & INIT - Tương thích với action-buttons.js
// =====================================================
window.LocationUpdate = {
  openModal: (item) => LocationManager.openModal('location', item),
  close: () => LocationManager.close(),
  init: () => LocationManager.INIT(),

  // Expose cache for external use
  LocationCache: LocationCache
};

// Alias cho tương thích với các module khác
window.LocationManager = window.LocationUpdate;

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', LocationManager.INIT);
} else {
  LocationManager.INIT();
}
console.log('✅ LocationUpdate R1.1.2 Module loaded (Bilingual + Badge Sync)');

console.log('✅ LocationUpdate R1.1 Module loaded (alias: LocationManager)');
