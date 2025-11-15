// ========================================
// CHECK-IN / CHECK-OUT MODULE - V6.9.8
// - Force reload ngay sau save
// - Badge IN/OUT
// - Fix mode switching
// - Layout 50-25-25
// ========================================

(function() {
  'use strict';
  const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
  
  let currentItem = null;
  let currentMode = 'check-in';

  // ✅ NEW: SESSION STORAGE TRACKER (THÊM ĐOẠN NÀY)
  const SESSION_KEY_LAST_ACTION = 'checkin_last_action_timestamp';

  function setLastActionTime() {
    sessionStorage.setItem(SESSION_KEY_LAST_ACTION, Date.now().toString());
    console.log('[CheckInOut] 📝 Last action time updated');
  }

  function shouldSkipBackgroundReload(moldId) {
    const pendingLogs = window.DataManager?.PendingCache?.logs || [];
    const hasPending = pendingLogs.some(p => 
      String(p.MoldID) === String(moldId) && 
      p._pending === true
    );
    
    if (hasPending) {
      console.log('[CheckInOut] ⏭️ Skip reload: pending logs exist');
      return true;
    }
    
    const lastActionTime = parseInt(sessionStorage.getItem(SESSION_KEY_LAST_ACTION) || '0');
    const timeSinceAction = Date.now() - lastActionTime;
    
    if (timeSinceAction < 3000) {
      console.log('[CheckInOut] ⏭️ Skip reload: recent action', timeSinceAction, 'ms ago');
      return true;
    }
    
    return false;
  }
  // ✅ END NEW TRACKER

  const CheckInOut = {
    // ========================================
    // INIT
    // ========================================
    init() {
      console.log('[CheckInOut V6] Module ready');
      
      // Listen currentItem changes
      document.addEventListener('detail:changed', (e) => {
        if (e.detail?.item) {
          currentItem = e.detail.item;
        }
      });

      // ESC key to close modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          const panel = document.getElementById('cio-panel');
          if (panel) {
            this.close();
          }
        }
      });
    },

    /**
     * ✅ R6.9.8: Get current status of item
     * Returns: 'CHECK_IN' | 'CHECK_OUT' | 'AUDIT' | null
     */
    getCurrentStatus(itemId, itemType = 'mold') {
        const logs = window.DataManager?.data?.statuslogs || [];
        
        // Filter logs for this item
        const itemLogs = logs.filter(log => {
            if (itemType === 'mold') {
                return String(log.MoldID).trim() === String(itemId).trim();
            } else {
                return String(log.CutterID).trim() === String(itemId).trim();
            }
        });

        if (itemLogs.length === 0) return null;

        // Sort by timestamp (newest first)
        const sortedLogs = itemLogs.sort((a, b) => 
            new Date(b.Timestamp) - new Date(a.Timestamp)
        );

        const latestLog = sortedLogs[0];
        console.log('[CheckInOut] Current status:', latestLog.Status, 'for', itemId);
        
        return latestLog.Status || null;
    },


    // ========================================
    // REFRESH HISTORY TABLE
    // ========================================
    refreshHistory(moldId) {
      const historyContainer = document.querySelector('.history-wrap');
      if (!historyContainer) return;
      
      console.log(`[CheckInOut V6] 🔄 Refreshing history for MoldID: ${moldId}`);
      
      const allLogs = window.DataManager?.data?.statuslogs || [];
      const destList = window.DataManager?.data?.destinations || [];
      const empList = window.DataManager?.data?.employees || [];
      const pendingLogs = window.DataManager?.PendingCache?.logs || [];

      // ✅ OVERLAY: Chỉ lấy pending logs CHƯA SYNC (check bằng Timestamp)
      const moldPendingLogs = pendingLogs.filter(p =>
          String(p.MoldID).trim() === String(moldId).trim() &&
          p._pending === true  // Chỉ lọc theo _pending, KHÔNG lọc trùng Timestamp
      );


      const moldRealLogs = allLogs.filter(l => 
          String(l.MoldID).trim() === String(moldId).trim()
      );

      // Merge và sort
      const historyLogs = [
        ...moldPendingLogs,
        ...moldRealLogs
      ].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

      
      if (historyLogs.length === 0) {
          historyContainer.innerHTML = '<p style="text-align:center;padding:1rem;color:#888;">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</p>';
          return;
      }
      
      // ✅ RENDER GIỐNG renderHistory (7 CỘT, CÓ SYNC STATUS)
      const tableRows = historyLogs.map(l => {
          // ✅ R6.9.8: Enhanced badge logic with AUDIT support
          let badgeClass = '';
          let badgeText = '';
          
          if (l.Status === 'AUDIT' || l.AuditType) {
              badgeClass = 'badge-audit';
              const auditLabel = l.AuditType === 'AUDIT_WITH_RELOCATION' 
                  ? '棚卸+移動' 
                  : '棚卸';
              badgeText = auditLabel;
          } else if (l.Status === 'check-in' || l.Status === 'CHECK_IN') {
              badgeClass = 'badge-in';
              badgeText = 'IN';
          } else if (l.Status === 'check-out' || l.Status === 'CHECK_OUT') {
              badgeClass = 'badge-out';
              badgeText = 'OUT';
          } else {
              badgeClass = 'badge-unknown';
              badgeText = l.Status || '-';
          }

          
          // ✅ Sync status (HỖ TRỢ _synced)
          const isPending = l._pending === true;
          const isSynced = l._synced === true;
          const hasError = l._syncError;

          let syncClass, syncTitle, syncIcon;
          if (hasError) {
              syncClass = 'sync-dot error';
              syncTitle = `Lỗi: ${l._syncError} / エラー`;
              syncIcon = '⚠️';
          } else if (isPending) {
              syncClass = 'sync-dot pending';
              syncTitle = 'Đang đồng bộ... / 同期中...';
              syncIcon = '🔄';
          } else if (isSynced) {
              syncClass = 'sync-dot synced-new';
              syncTitle = 'Đã đồng bộ (mới) / 同期済み（新）';
              syncIcon = '✅';
          } else {
              syncClass = 'sync-dot synced';
              syncTitle = 'Đã đồng bộ / 同期済み';
              syncIcon = '✅';
          }

          
          // ✅ Delete button (chỉ hiện với synced logs)
          const deleteBtn = !isPending && !hasError ? `
              <button class="btn-delete-history"
                      data-log-id="${l.LogID || ''}"
                      data-time="${encodeURIComponent(l.Timestamp)}"
                      title="Xóa / 削除">
                  ❌
              </button>
          ` : '';
          
          return `
          <tr data-log-id="${l.LogID || l._localId}" class="${isPending ? 'row-pending' : ''}">
            <td data-time="${l.Timestamp}">${this.fmt(l.Timestamp)}</td>
            <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
            <td>${this.getEmployeeName(l.EmployeeID, empList)}</td>
            <td>${this.getDestinationName(l.DestinationID, destList)}</td>
            <td class="note-cell">${l.Notes || '-'}</td>
            <td class="sync-cell">
              <span class="${syncClass}" title="${syncTitle}">${syncIcon}</span>
            </td>
            <td class="action-cell">${deleteBtn}</td>
          </tr>
          `;
      }).join('');
      
      historyContainer.innerHTML = `
      <table class="history-table" id="cio-his">
        <thead>
          <tr>
            <th data-sort="time">🕐 Thời gian</th>
            <th data-sort="status">📊</th>
            <th data-sort="emp">👤 NV</th>
            <th data-sort="dest">📍 Địch</th>
            <th data-sort="note">📝 Ghi chú</th>
            <th style="width:60px">🔄 Sync</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>`;
      
      // 🗑️ Bind sự kiện xóa lịch sử
      this.bindDeleteHistoryEvents(moldId);
    },

    // ========================================
    // REFRESH HISTORY IN-PLACE - Chỉ update tbody (HỌC TỪ LOCATION)
    // ========================================
    refreshHistoryInPlace(moldId) {
        const tbody = document.querySelector('#cio-his tbody');
        if (!tbody) {
            console.warn('[CheckInOut] History table not found, skipping refresh');
            return;
        }
        
        console.log(`[CheckInOut V6] 🔄 Refreshing history IN-PLACE for MoldID: ${moldId}`);
        
        const allLogs = window.DataManager?.data?.statuslogs || [];
        const destList = window.DataManager?.data?.destinations || [];
        const empList = window.DataManager?.data?.employees || [];
        const pendingLogs = window.DataManager?.PendingCache?.logs || [];
        
        // ✅ OVERLAY PENDING LOGS (GIỐNG refreshHistory)
        const moldPendingLogs = pendingLogs.filter(p =>
            String(p.MoldID).trim() === String(moldId).trim() &&
            p._pending === true
            // ✅ BỎ lọc trùng Timestamp - Giữ pending log dù GitHub đã có
        );

        const moldRealLogs = allLogs.filter(l =>
            String(l.MoldID).trim() === String(moldId).trim()
        );
        
        // Merge và sort
        const historyLogs = [
            ...moldPendingLogs,
            ...moldRealLogs
        ].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        
        console.log('[CheckInOut] 📊 Overlay counts:', {
            pending: moldPendingLogs.length,
            real: moldRealLogs.length,
            total: historyLogs.length
        });

        
        if (historyLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1rem;color:#888;">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</td></tr>';
            return;
        }
        
        // ✅ CHỈ UPDATE tbody, KHÔNG render lại toàn bộ table
        const tableRows = historyLogs.map(l => {
            // ✅ R6.9.8: Enhanced badge logic with AUDIT support
            let badgeClass = '';
            let badgeText = '';
            
            if (l.Status === 'AUDIT' || l.AuditType) {
                badgeClass = 'badge-audit';
                const auditLabel = l.AuditType === 'AUDIT_WITH_RELOCATION' 
                    ? '棚卸+移動' 
                    : '棚卸';
                badgeText = auditLabel;
            } else if (l.Status === 'check-in' || l.Status === 'CHECK_IN') {
                badgeClass = 'badge-in';
                badgeText = 'IN';
            } else if (l.Status === 'check-out' || l.Status === 'CHECK_OUT') {
                badgeClass = 'badge-out';
                badgeText = 'OUT';
            } else {
                badgeClass = 'badge-unknown';
                badgeText = l.Status || '-';
            }

            
            // ✅ Sync status (HỖ TRỢ _synced)
            const isPending = l._pending === true;
            const isSynced = l._synced === true;
            const hasError = l._syncError;

            let syncClass, syncTitle, syncIcon;
            if (hasError) {
                syncClass = 'sync-dot error';
                syncTitle = `Lỗi: ${l._syncError} / エラー`;
                syncIcon = '⚠️';
            } else if (isPending) {
                syncClass = 'sync-dot pending';
                syncTitle = 'Đang đồng bộ... / 同期中...';
                syncIcon = '🔄';
            } else if (isSynced) {
                syncClass = 'sync-dot synced-new';
                syncTitle = 'Đã đồng bộ (mới) / 同期済み（新）';
                syncIcon = '✅';
            } else {
                syncClass = 'sync-dot synced';
                syncTitle = 'Đã đồng bộ / 同期済み';
                syncIcon = '✅';
            }
            
            const deleteBtn = !isPending && !hasError ? `
                <button class="btn-delete-history"
                        data-log-id="${l.LogID || ''}"
                        data-time="${encodeURIComponent(l.Timestamp)}"
                        title="Xóa / 削除">
                    ❌
                </button>
            ` : '';
            
            return `
            <tr data-log-id="${l.LogID || l._localId}" class="${isPending ? 'row-pending' : ''}">
              <td data-time="${l.Timestamp}">${this.fmt(l.Timestamp)}</td>
              <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
              <td>${this.getEmployeeName(l.EmployeeID, empList)}</td>
              <td>${this.getDestinationName(l.DestinationID, destList)}</td>
              <td class="note-cell">${l.Notes || '-'}</td>
              <td class="sync-cell">
                <span class="${syncClass}" title="${syncTitle}">${syncIcon}</span>
              </td>
              <td class="action-cell">${deleteBtn}</td>
            </tr>
            `;
        }).join('');
        
        tbody.innerHTML = tableRows;
        
        // Rebind delete events
        this.bindDeleteHistoryEvents(moldId);
        
        console.log('[CheckInOut] 📊 Refreshed', historyLogs.length, 'history rows in place');
    },

    // ========================================
    // DELETE HISTORY LOG - MỚI
    // ========================================
    bindDeleteHistoryEvents(moldId) {
      const buttons = document.querySelectorAll('.btn-delete-history');
      const self = this; // ✅ LƯU CONTEXT
      
      
      buttons.forEach(btn => {
          btn.addEventListener('click', async (e) => {
              e.preventDefault();
              
              const logId = btn.getAttribute('data-log-id');
              const timestamp = btn.getAttribute('data-time');
              
              if (!confirm('Bạn chắc chắn muốn xóa? / 削除しますか？')) return;

              const row = btn.closest('tr');
              if (row) row.classList.add('deleting');

              // ✅ TOAST: Đang xóa
              self.showBilingualToast('deleting');

              try {

                  // ✅ FIX: Dùng đúng endpoint /api/deletelog (POST, không phải DELETE)
                  const res = await fetch('https://ysd-moldcutter-backend.onrender.com/api/deletelog', {
                      method: 'POST',  // ✅ POST, không phải DELETE
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          MoldID: moldId,
                          Timestamp: decodeURIComponent(timestamp || '')
                      })
                  });

                  
                  const rj = await res.json();
                  
                  if (rj.success) {
                      console.log('[CheckInOut] ✅ Deleted from server:', logId);
                      
                      // ✅ XÓA KHỎI LOCAL DATA (HỌC TỪ LOCATION: Dùng Timestamp thay vì LogID)
                      if (window.DataManager?.data?.statuslogs) {
                          const beforeLen = window.DataManager.data.statuslogs.length;
                          const timestampToDelete = decodeURIComponent(timestamp || '');
                          
                          window.DataManager.data.statuslogs = window.DataManager.data.statuslogs.filter(
                              l => l.Timestamp !== timestampToDelete  // ✅ ĐÚNG: Dùng Timestamp (luôn có giá trị)
                          );
                          
                          const afterLen = window.DataManager.data.statuslogs.length;
                          console.log('[CheckInOut] 🗑 Removed from local:', beforeLen - afterLen, 'rows');
                          
                          if (beforeLen === afterLen) {
                              console.warn('[CheckInOut] ⚠️ Failed to remove from local! Timestamp:', timestampToDelete);
                          }
                      }

                      
                      // ✅ XÓA ROW KHỎI TABLE
                      if (row) {
                          row.remove();
                          console.log('[CheckInOut] 🔄 History row removed from UI');
                      }
                      
                      // ✅ TOAST SUCCESS (DÙNG self)
                      self.showBilingualToast('deleted');
                      
                      // ✅ NEW: SET LAST ACTION TIME
                      setLastActionTime();
                      
                      // ✅ FIX: Không reload ngay, chỉ refresh UI từ data đã xóa
                      setTimeout(async () => {

                          try {
                              // ✅ KHÔNG RELOAD từ GitHub (vì có thể chưa kịp commit)
                              // Chỉ refresh UI từ data đã xóa trong local
                              
                              const historyBody = document.querySelector('#cio-his tbody');
                              if (historyBody && currentItem) {
                                  await self.refreshHistoryInPlace(currentItem.MoldID);
                                  console.log('[CheckInOut] ✅ History table refreshed (no GitHub reload)');
                              }
                              
                              // Dispatch event để update badge
                              if (currentItem) {
                                  document.dispatchEvent(new CustomEvent('detail:changed', {
                                      detail: {
                                          item: currentItem,
                                          itemType: 'mold',
                                          itemId: moldId,
                                          source: 'checkin-delete'
                                      }
                                  }));
                              }
                          } catch (err) {
                              console.warn('[CheckInOut] Refresh failed:', err);
                          }
                      }, 500);  // ✅ Giảm xuống 500ms, không cần chờ GitHub

                  } else {
                      self.showBilingualToast('error');
                      if (row) row.classList.remove('deleting');
                  }
              } catch (err) {
                  console.error('Delete error', err);
                  self.showBilingualToast('error');
                  if (row) row.classList.remove('deleting');
              }
          });
      });
    },


    // ✅ NEW METHOD: Auto-fill employee and notes logic
    applyAutoFillLogic(item, mode, historyLogs, empList) {
        const empSelect = document.getElementById('cio-emp');
        const noteInput = document.getElementById('cio-note');
        
        if (!empSelect || !noteInput) return;
        
        const latestLog = historyLogs[0];
        const currentStatus = latestLog ? latestLog.Status : null;
        
        console.log('[AutoFill] Current status:', currentStatus, 'Mode:', mode);
        
        if (mode === 'check-in') {
            // Logic 1: Khuôn đang OUT → auto-select người đã checkout
            if (currentStatus === 'check-out' && latestLog?.EmployeeID) {
                const employee = empList.find(e => e.EmployeeID === latestLog.EmployeeID);
                if (employee) {
                    empSelect.value = latestLog.EmployeeID;
                    console.log('[AutoFill] ✅ Selected last checkout employee:', employee.EmployeeName);
                    
                    // Visual feedback
                    empSelect.style.background = '#FEF3C7';
                    setTimeout(() => { empSelect.style.background = ''; }, 2000);
                }
            }
            
            // Logic 2: Không có lịch sử HOẶC đang IN → default note "棚卸し"
            if (!currentStatus || currentStatus === 'check-in') {
                if (!noteInput.value.trim()) {
                    noteInput.value = '棚卸し';
                    noteInput.placeholder = 'Kiểm kê kho / 棚卸し';
                    console.log('[AutoFill] ✅ Applied inventory note');
                }
            }
        }
        
        // Focus vào trường đầu tiên chưa điền
        setTimeout(() => {
            if (!empSelect.value) {
                empSelect.focus();
            } else if (mode === 'check-out') {
                const destSelect = document.getElementById('cio-dest');
                if (destSelect && !destSelect.value) {
                    destSelect.focus();
                }
            } else {
                noteInput.focus();
            }
        }, 100);
    },

    

    // ========================================
    // OPEN MODAL
    // ========================================
    openModal(mode = 'check-in', item = currentItem) {
      if (!item) {
        alert('金型を選択してください / Vui lòng chọn khuôn trước.');
        return;
      }

      currentMode = mode;
      currentItem = item;
      this.close(); // Đóng modal cũ

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[CheckInOut V6] Upper section not found');
        return;
      }

      // 🧩 GỬI SỰ KIỆN CHO BÀN PHÍM ẢO KHI MỞ POPUP
      setTimeout(() => {
          const firstInput = document.querySelector('#cio-panel input, #cio-panel textarea, #cio-panel select');
          if (firstInput) {
              firstInput.focus();
              document.dispatchEvent(new CustomEvent("keyboardattach", { detail: { element: firstInput } }));
              console.log("[CheckInOut V6] 🧩 Keyboard attached to popup input");
          }
      }, 300);

      // Load data từ DataManager
      const destList = window.DataManager?.data?.destinations || [];
      const empList = window.DataManager?.data?.employees || [];
      const allLogs = window.DataManager?.data?.statuslogs || [];
      const racksList = window.DataManager?.data?.racks || [];
      
      console.log('[CheckInOut V6] Loaded', destList.length, 'destinations,', empList.length, 'employees,', racksList.length, 'racks');

      // ✅ FIX: BỎ BACKGROUND RELOAD (Tránh ghi đè data đã xóa/thêm)
      // Chỉ hiển thị data từ cache + statuslogs array
      console.log('[CheckInOut] 📊 Displaying data from cache (no background reload)');



      // Lọc lịch sử
      const historyLogs = allLogs.filter(l => l.MoldID === item.MoldID);
      historyLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

      // Xác định trạng thái hiện tại
      const latestLog = historyLogs[0];
      let currentStatus = '履歴なし / Chưa có lịch sử'; // ✅ THAY ĐỔI
      let statusClass = '';

      if (latestLog) {
        if (latestLog.Status === 'check-in') {
          const destName = this.getDestinationName(latestLog.DestinationID || 'AREA-MOLDROOM', destList);
          currentStatus = `在庫 / Trong kho - ${destName}`;
          statusClass = 'badge-green';
        } else if (latestLog.Status === 'check-out') {
          const destName = this.getDestinationName(latestLog.DestinationID, destList);
          currentStatus = `出庫中 / Đã xuất - ${destName}`;
          statusClass = 'badge-red';
        }
      }

      // Lấy thông tin vị trí
      const moldID = item.MoldID || '';
      const moldName = item.MoldName || '';
      const rackNum = item.rackInfo?.RackNumber || item.RackID || '-';
      const layerNum = item.rackLayerInfo?.RackLayerNumber || item.RackLayerID || '-';
      
      // Lấy RackLocation từ racks.csv
      const rackInfo = racksList.find(r => r.RackID === item.RackID);
      const rackLocation = rackInfo?.RackLocation || '-';

      // Tạo HTML modal
      const html = `
      <div class="checkio-panel" id="cio-panel">
        
        <!-- HEADER với mode switching -->
        <div class="checkio-header">
          <div class="checkio-mode">
            <button id="btn-in" class="mode-btn ${mode === 'check-in' ? 'active' : ''}">
              チェックイン / Check-in
            </button>
            <button id="btn-out" class="mode-btn ${mode === 'check-out' ? 'active' : ''}">
              チェックアウト / Check-out
            </button>
          </div>
          <button class="btn-close-compact" id="cio-close" title="Close (ESC)">✕</button>
        </div>

        <!-- BODY 3 CỘT -->
        <div class="checkio-body">
          
          <!-- CỘT 1: LỊCH SỬ (50% width) -->
          <section class="cio-history">
            <h4>履歴 / Lịch sử</h4>
            <div class="filter-row">
              <input type="text" id="cio-search" placeholder="検索... / Tìm kiếm...">
            </div>
            <div class="history-wrap">${this.renderHistory(historyLogs, destList, empList)}</div>
          </section>

          <!-- CỘT 2: TRẠNG THÁI (25% width) -->
          <section class="cio-status">
            <h4>現在の状態 / Trạng thái</h4>
            <div class="status-badges">
              <div class="badge-row">
                <span class="badge-label">金型ID / Mã khuôn:</span>
                <div class="badge badge-mold">${moldID}</div>
              </div>
              <div class="badge-row">
                <span class="badge-label">金型名 / Tên:</span>
                <div class="badge badge-mold-name">${moldName}</div>
              </div>
              <div class="badge-row">
                <span class="badge-label">状態 / Tình trạng:</span>
                <div class="badge ${statusClass}">${currentStatus}</div>
              </div>
              <div class="badge-row">
                <span class="badge-label">位置 / Vị trí:</span>
                <div class="badge-group">
                  <div class="badge badge-rack">${rackNum}</div>
                  <span class="badge-sep">-</span>
                  <div class="badge badge-layer">${layerNum}</div>
                </div>
              </div>
              <div class="rack-location">
                <span class="loc-label">保管場所 / Nơi lưu:</span>
                <span class="loc-value">${rackLocation}</span>
              </div>
            </div>
          </section>

          <!-- CỘT 3: NHẬP LIỆU (25% width) -->
          <section class="cio-inputs">
            <h4>データ入力 / Nhập liệu</h4>
            
            <!-- Địa điểm (chỉ hiện với check-out) -->
            <div class="form-group dest-group ${mode === 'check-out' ? '' : 'hidden'}">
              <label class="form-label">目的地 / Địa điểm *</label>
              <select id="cio-dest" class="form-control">
                <option value="">-- 選択 / Chọn --</option>
                ${destList.map(d => `<option value="${d.DestinationID}">${d.DestinationName}</option>`).join('')}
              </select>
            </div>

            <!-- Ghi chú -->
            <div class="form-group">
              <label class="form-label">備考 / Ghi chú</label>
              <textarea id="cio-note" class="form-control" rows="2" placeholder="修理 / Sửa chữa"></textarea>
            </div>

            <!-- Nhân viên + Face ID -->
            <div class="form-group">
              <label class="form-label">従業員 / Nhân viên *</label>
              <div class="employee-row">
                <select id="cio-emp" class="form-control">
                  <option value="">-- 選択 / Chọn --</option>
                  ${empList.map(e => `<option value="${e.EmployeeID}">${e.EmployeeName || e.EmployeeID}</option>`).join('')}
                </select>
                <button id="btn-face" class="btn-face" type="button">Face ID</button>
              </div>
              <small id="cio-face-status" class="face-status">未確認 / Chưa xác nhận</small>
            </div>

            <!-- Nút xác nhận / hủy -->
            <div class="btn-row">
              <button class="btn-confirm" id="btn-save">確認 / Xác nhận</button>
              <button class="btn-cancel" id="btn-cancel">キャンセル / Hủy</button>
            </div>
          </section>

        </div><!-- end checkio-body -->
      </div><!-- end cio-panel -->`;

      // Chèn vào DOM
      upper.insertAdjacentHTML('beforeend', html);

      // ✅ NEW: Auto-fill logic sau khi render modal
      this.applyAutoFillLogic(item, mode, historyLogs, empList);
      
      // Căn kích thước
      //this.alignGrid();  // ← ❌ BỎ DÒNG NÀY DO LÀM SAI KÍCH THƯỚC POPUP

      // Bind events
      this.bindModalEvents(item, destList, empList);
      
      // Enable filter và sort
      this.enableFilter();
      this.enableSort();

      // ✅ THÊM: Bind delete events
      this.bindDeleteHistoryEvents(item.MoldID);
      console.log('[CheckInOut] ✅ Delete buttons bound in openModal');
    },

    /**
     * RENDER HISTORY TABLE - R6.2 WITH SYNC INDICATOR
     */
    renderHistory(logs, destList, empList) {
        if (!logs.length) {
            return `<div class="no-history">Chưa có lịch sử</div>`;
        }
        
        return `
        <table class="history-table" id="cio-his">
          <thead>
            <tr>
              <th data-sort="time">🕐 Thời gian</th>
              <th data-sort="status">📊</th>
              <th data-sort="emp">👤 NV</th>
              <th data-sort="dest">📍 Địch</th>
              <th data-sort="note">📝 Ghi chú</th>
              <th style="width:60px">🔄 Sync</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => {
                // ✅ R6.9.8: Enhanced badge logic with AUDIT support
                let badgeClass = '';
                let badgeText = '';
                
                if (l.Status === 'AUDIT' || l.AuditType) {
                    badgeClass = 'badge-audit';
                    const auditLabel = l.AuditType === 'AUDIT_WITH_RELOCATION' 
                        ? '棚卸+移動' 
                        : '棚卸';
                    badgeText = auditLabel;
                } else if (l.Status === 'check-in' || l.Status === 'CHECK_IN') {
                    badgeClass = 'badge-in';
                    badgeText = 'IN';
                } else if (l.Status === 'check-out' || l.Status === 'CHECK_OUT') {
                    badgeClass = 'badge-out';
                    badgeText = 'OUT';
                } else {
                    badgeClass = 'badge-unknown';
                    badgeText = l.Status || '-';
                }

                
                // ✅ Sync status
                const isPending = l._pending === true;
                const hasError = l._syncError;
                
                let syncClass, syncTitle, syncIcon;
                if (hasError) {
                    syncClass = 'sync-dot error';
                    syncTitle = `Lỗi: ${l._syncError} / エラー`;
                    syncIcon = '⚠️';
                } else if (isPending) {
                    syncClass = 'sync-dot pending';
                    syncTitle = 'Đang đồng bộ... / 同期中...';
                    syncIcon = '🔄';
                } else {
                    syncClass = 'sync-dot synced';
                    syncTitle = 'Đã đồng bộ / 同期済み';
                    syncIcon = '✅';
                }
                
                // ✅ Delete button (chỉ hiện với synced logs)
                const deleteBtn = !isPending && !hasError ? `
                    <button class="btn-delete-history" 
                            data-log-id="${l.LogID || ''}" 
                            data-time="${encodeURIComponent(l.Timestamp)}"
                            title="Xóa / 削除">
                        ❌
                    </button>
                ` : '';
                
                return `
                <tr data-log-id="${l.LogID || l._localId}" class="${isPending ? 'row-pending' : ''}">
                  <td data-time="${l.Timestamp}">${this.fmt(l.Timestamp)}</td>
                  <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                  <td>${this.getEmployeeName(l.EmployeeID, empList)}</td>
                  <td>${this.getDestinationName(l.DestinationID, destList)}</td>
                  <td class="note-cell">${l.Notes || '-'}</td>
                  <td class="sync-cell">
                    <span class="${syncClass}" title="${syncTitle}">${syncIcon}</span>
                  </td>
                  <td class="action-cell">${deleteBtn}</td>
                </tr>
                `;
            }).join('')}
          </tbody>
        </table>
        `;
    },

    // ========================================
    // GET EMPLOYEE NAME
    // ========================================
    getEmployeeName(empId, empList) {
      if (!empId) return '-';
      if (!empList || empList.length === 0) return empId;
      
      const emp = empList.find(e => e.EmployeeID === empId);
      return emp ? (emp.EmployeeName || empId) : empId;
    },

    
    // ========================================
    // BIND EVENTS - FIX MODE SWITCHING
    // ========================================
    bindModalEvents(item, destList, empList) {
      // Đóng modal
      const closeBtn = document.getElementById('cio-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      // Nút hủy
      const cancelBtn = document.getElementById('btn-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.close());
      }

      // Face ID mock
      const faceBtn = document.getElementById('btn-face');
      if (faceBtn) {
        faceBtn.addEventListener('click', () => this.mockFaceID(empList));
      }

      // Nút xác nhận
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveRecord(item));
      }

      // ========================================
      // FIX: Chuyển đổi mode (Đã sửa lỗi event listener)
      // ========================================
      const inBtn = document.getElementById('btn-in');
      const outBtn = document.getElementById('btn-out');
      
      if (inBtn) {
        inBtn.addEventListener('click', () => this.switchMode('check-in'));
      }
      if (outBtn) {
        outBtn.addEventListener('click', () => this.switchMode('check-out'));
      }
    },

    // ========================================
    // SWITCH MODE
    // ========================================
    switchMode(newMode) {
      currentMode = newMode;
      
      const inBtn = document.getElementById('btn-in');
      const outBtn = document.getElementById('btn-out');
      
      if (inBtn && outBtn) {
        inBtn.classList.toggle('active', newMode === 'check-in');
        outBtn.classList.toggle('active', newMode === 'check-out');
      }

      // Hiển thị/ẩn dropdown địa điểm
      const destGroup = document.querySelector('.dest-group');
      if (destGroup) {
        if (newMode === 'check-out') {
          destGroup.classList.remove('hidden');
        } else {
          destGroup.classList.add('hidden');
        }
      }

      console.log('[CheckInOut V6] Mode switched to:', newMode);
    },


    // ========================================
    // MOCK FACE ID
    // ========================================
    mockFaceID(empList) {
      const empSel = document.getElementById('cio-emp');
      const faceStat = document.getElementById('cio-face-status');
      
      if (!empSel || !empList || empList.length === 0) {
        alert('従業員リストが空です / Danh sách nhân viên trống');
        return;
      }

      const rndIdx = Math.floor(Math.random() * empList.length);
      const emp = empList[rndIdx];
      
      empSel.value = emp.EmployeeID;
      
      if (faceStat) {
        faceStat.innerHTML = `✅ ${emp.EmployeeName || emp.EmployeeID}`;
        faceStat.style.color = '#16a34a';
        faceStat.style.fontWeight = '600';
      }

      console.log('[CheckInOut V6] Face ID selected:', emp.EmployeeID);
    },

    /**
     * SAVE RECORD - R6.2 OPTIMISTIC UPDATE
     */
        async saveRecord(item) {
        const empInput = document.getElementById('cio-emp');
        const destInput = document.getElementById('cio-dest');
        const noteInput = document.getElementById('cio-note');
        
        const empValue = empInput?.value.trim();
        const destValue = destInput?.value.trim();
        const noteValue = noteInput?.value.trim();
        
        // Validation
        if (!empValue) {
            alert('Vui lòng chọn nhân viên / 従業員を選択してください');
            empInput?.focus();
            return;
        }
        
        if (currentMode === 'check-out' && !destValue) {
            alert('Vui lòng chọn địa điểm đến / 送り先を選択してください');
            destInput?.focus();
            return;
        }
        
        // ✅ R6.9.8: Determine status based on current state
        let status = currentMode;
        let auditType = '';
        let auditDate = '';
        
        // Check if this is actually an audit (check-in when already checked-in)
        if (currentMode === 'check-in') {
            const currentStatus = this.getCurrentStatus(
                item.MoldID || item.CutterID,
                item.MoldID ? 'mold' : 'cutter'
            );
            
            if (currentStatus === 'check-in' || currentStatus === 'CHECK_IN') {
                console.log('[CheckInOut] 🔄 Converting to AUDIT (already checked-in)');
                status = 'AUDIT';
                auditType = 'AUDIT_ONLY';
                auditDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                
                // Update notes if empty
                if (!noteValue.trim()) {
                    noteInput.value = '棚卸 | Kiểm kê (自動)';
                }
            }
        }
        
        const data = {
            MoldID: item.MoldID,
            CutterID: item.CutterID || '',
            ItemType: item.MoldID ? 'mold' : 'cutter',
            Status: status,
            EmployeeID: empValue,
            DestinationID: currentMode === 'check-in' ? 'AREA-MOLDROOM' : destValue,
            Notes: noteInput?.value.trim() || noteValue, // ✅ Get updated value
            Timestamp: new Date().toISOString(),
            AuditDate: auditDate,      // ✅ NEW
            AuditType: auditType        // ✅ NEW
        };

        
        console.log('CheckInOut R6.2: Submitting', data);
        
        // ✅ BƯỚC 1: OPTIMISTIC UPDATE - Thêm vào cache ngay
        const pendingLog = window.DataManager?.PendingCache?.add(data);
        if (!pendingLog) {
            console.error('CheckInOut R6.2: PendingCache not available');
            return;
        }

        // ✅ BƯỚC 1.5: THÊM VÀO STATUSLOGS ARRAY (ĐỂ UI HIỂN THỊ NGAY)
        //if (!window.DataManager.data.statuslogs) {
        //    window.DataManager.data.statuslogs = [];
        //}
        //window.DataManager.data.statuslogs.unshift(pendingLog);
        //console.log('[CheckInOut] ✅ Added pending log to statuslogs array');

        // ✅ BƯỚC 2: UI Update tức thì
        this.showBilingualToast('processing');

        // ✅ NEW: SET LAST ACTION TIME
        setLastActionTime();

        
     
        // ✅ 3. Dispatch event để badge update NGAY (với pending state)
        document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: { 
                item: item,
                itemType: 'mold',
                itemId: item.MoldID,
                source: 'checkin-pending'
            }
        }));
        
        // Đóng modal ngay (không chờ GitHub)
        setTimeout(() => { CheckInOut.close(); }, 300);
        
        // ✅ BƯỚC 3: Background GitHub sync (Wrap trong setTimeout để không chặn UI)
        setTimeout(async () => {
            try {
                await CheckInOut.syncToGitHub(data, pendingLog._localId, item.MoldID);
            } catch (err) {
                console.error('[CheckInOut] Sync error:', err);
            }
        }, 100);  // ✅ Delay 100ms để UI không bị chặn

    },

    /**
     * ✅ R6.5: Background sync to GitHub - HỌC THEO LOCATION MODULE
     */
    async syncToGitHub(data, localId, moldId) {
        console.log('[CheckInOut] 🔄 Starting background sync...', { localId, moldId });
        
        try {
            // ===================================================
            // BƯỚC 1: POST TO GITHUB VIA SERVER
            // ===================================================
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const rj = await res.json();

            if (!rj.success) {
                throw new Error(rj.message || 'Server error');
            }

            console.log('[CheckInOut] ✅ GitHub sync SUCCESS:', rj.logId);

            // ===================================================
            // BƯỚC 2: XÓA PENDING LOG KHỎI CACHE
            // ===================================================
            window.DataManager.PendingCache.remove(localId);
            console.log('[CheckInOut] ✅ Removed pending log from cache:', localId);

            // ===================================================
            // BƯỚC 3: THÊM REAL LOG VÀO STATUSLOGS ARRAY (KHÔNG RELOAD)
            // ===================================================
            const realLog = {
                LogID: rj.logId,
                MoldID: data.MoldID,
                Status: data.Status,
                EmployeeID: data.EmployeeID,
                DestinationID: data.DestinationID,
                Notes: data.Notes,
                Timestamp: data.Timestamp,
                _synced: true  // Đánh dấu đã sync
            };

            // Kiểm tra trùng trước khi thêm
            const exists = window.DataManager?.data?.statuslogs?.some(log =>
                log.Timestamp === realLog.Timestamp &&
                String(log.MoldID).trim() === String(realLog.MoldID).trim()
            );

            if (!exists) {
                window.DataManager.data.statuslogs.unshift(realLog);
                console.log('[CheckInOut] ✅ Added real log to statuslogs array');
            } else {
                console.log('[CheckInOut] ⚠️ Log already exists, skipping');
            }

            // ===================================================
            // BƯỚC 4: REFRESH HISTORY TABLE (KHÔNG RELOAD)
            // ===================================================
            const historyBody = document.querySelector('#cio-his tbody');
            if (historyBody) {
                console.log('[CheckInOut] 🔄 Refreshing history table...');
                await this.refreshHistoryInPlace(moldId);
                console.log('[CheckInOut] ✅ History table refreshed');
            }

            // ===================================================
            // BƯỚC 5: DISPATCH EVENT ĐỂ UPDATE BADGE
            // ===================================================
            if (currentItem && String(currentItem.MoldID) === String(moldId)) {
                document.dispatchEvent(new CustomEvent('detail:changed', {
                    detail: {
                        item: currentItem,
                        itemType: 'mold',
                        itemId: moldId,
                        source: 'checkin-synced'
                    }
                }));
                console.log('[CheckInOut] 📡 Dispatched detail:changed event');
            }

            // ===================================================
            // BƯỚC 6: TOAST SUCCESS
            // ===================================================
            this.showBilingualToast('success', currentMode);
            console.log('[CheckInOut] ✅ Sync completed successfully');

        } catch (err) {
            console.error('[CheckInOut] ❌ Sync error:', err);
            
            // Mark error trong PendingCache
            window.DataManager.PendingCache.markError(localId, err.message);
            
            // Refresh UI để hiển thị error state
            const historyBody = document.querySelector('#cio-his tbody');
            if (historyBody) {
                await this.refreshHistoryInPlace(moldId);
            }
            
            this.showBilingualToast('error');
        }
    },



    /**
     * ✅ MỚI: Xử lý lỗi sync
     */
    handleSyncError(localId, errorMsg) {
        // Mark pending log as error
        window.DataManager?.PendingCache?.markError(localId, errorMsg);
        
        // Toast lỗi
        CheckInOut.showBilingualToast('error');
        
        // Retry after 30s (CHỈ NẾU pending log VẪN CÒN)
        console.log('⏳ Will retry sync after 30s...');
        setTimeout(() => {
            // ✅ FIX: Kiểm tra pending log TRONG CACHE, không trong statuslogs
            const pendingLogs = window.DataManager?.PendingCache?.logs || [];
            const log = pendingLogs.find(l => l._localId === localId);
            
            if (log && log._syncError) {
                console.log('🔄 Retrying sync for', localId);
                CheckInOut.syncToGitHub(log, localId, log.MoldID);
            } else {
                console.log('⏭️ Retry skipped: pending log not found or already synced');
            }
        }, 30000);
    },

    /**
     * ✅ MULTILINGUAL TOAST - R6.2
     */
    showBilingualToast(type, mode) {
        const messages = {
            success: {
                'check-in': 'Nhập kho thành công / チェックインしました',
                'check-out': 'Xuất kho thành công / チェックアウトしました'
            },
            error: 'Lỗi ghi dữ liệu / データの保存に失敗しました',
            processing: 'Đang xử lý... / 処理中...',
            deleting: 'Đang xóa... / 削除中...',
            deleted: 'Đã xóa thành công / 削除しました'
        };

        
        let message;
        if (type === 'success' && mode) {
            message = messages.success[mode];
        } else {
            message = messages[type] || 'Unknown';
        }
        
        this.showToast(message, type);
    },

    // ========================================
    // TOAST NOTIFICATIONS
    // ========================================
    showOptimisticToast() {
      this.showToast(
        `${currentMode === 'check-in' ? 'チェックイン' : 'チェックアウト'} 処理中... / Đang xử lý...`, 
        'info'
      );
    },

    showSuccessToast() {
      this.showToast(
        `✅ ${currentMode === 'check-in' ? 'チェックイン' : 'チェックアウト'} 成功 / Thành công!`, 
        'success'
      );
    },

    showErrorToast(msg) {
      this.showToast(`❌ エラー / Lỗi: ${msg}`, 'error');
    },

    showToast(message, type = 'info') {
      const existing = document.getElementById('cio-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'cio-toast';
      toast.className = `cio-toast cio-toast-${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('show'), 10);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    },

    

    // ========================================
    // ENABLE FILTER
    // ========================================
    enableFilter() {
      const input = document.getElementById('cio-search');
      const table = document.getElementById('cio-his');
      if (!input || !table) return;

      input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          const text = row.innerText.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      });
    },

    // ========================================
    // ENABLE SORT
    // ========================================
    enableSort() {
      const headers = document.querySelectorAll('#cio-his thead th');
      
      headers.forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const table = th.closest('table');
          const tbody = table.querySelector('tbody');
          const rows = Array.from(tbody.querySelectorAll('tr'));
          const idx = Array.from(th.parentNode.children).indexOf(th);
          const isAsc = !th.classList.contains('asc');

          headers.forEach(h => {
            h.classList.remove('asc', 'desc');
          });

          th.classList.add(isAsc ? 'asc' : 'desc');

          rows.sort((a, b) => {
            const aText = a.cells[idx].getAttribute('data-time') || a.cells[idx].innerText;
            const bText = b.cells[idx].getAttribute('data-time') || b.cells[idx].innerText;
            
            return isAsc 
              ? aText.localeCompare(bText) 
              : bText.localeCompare(aText);
          });

          rows.forEach(row => tbody.appendChild(row));
        });
      });
    },

    // ========================================
    // FORMAT DATE
    // ========================================
    fmt(dateStr) {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      
      return `${year}/${month}/${day} ${hour}:${min}`;
    },

    // ========================================
    // GET DESTINATION NAME
    // ========================================
    getDestinationName(destId, destList) {
      if (!destId) return 'N/A';
      if (!destList || destList.length === 0) return destId;
      
      const dest = destList.find(d => d.DestinationID === destId);
      return dest ? dest.DestinationName : destId;
    },

    // ========================================
    // CLOSE MODAL
    // ========================================
    close() {
        const panel = document.getElementById('cio-panel');
        if (panel) {
            panel.remove();
            console.log('[CheckInOut V6] Closed panel');
        }

        // 🧩 TRẢ BÀN PHÍM VỀ SEARCHBOX KHI ĐÓNG POPUP
        const searchBox = document.querySelector('#search-input');
        if (searchBox) {
            searchBox.focus();
            document.dispatchEvent(new CustomEvent("keyboardattach", { detail: { element: searchBox } }));
            console.log("[CheckInOut V6] 🧩 Keyboard reattached to searchbox");
        }
    },

    // ========================================
    // ALIGN GRID
    // ========================================
    alignGrid() {
      const panel = document.getElementById('cio-panel');
      const upper = document.querySelector('.upper-section');
      const lowerTabs = document.querySelector('.lower-tabs');
      
      if (!panel || !upper || !lowerTabs) return;

      const upperRect = upper.getBoundingClientRect();
      const tabsRect = lowerTabs.getBoundingClientRect();
      const parentRect = upper.offsetParent.getBoundingClientRect();

      const top = upperRect.top - parentRect.top;
      const left = upperRect.left - parentRect.left;
      const right = parentRect.right - upperRect.right;
      const height = tabsRect.top - upperRect.top;

      panel.style.position = 'absolute';
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      panel.style.right = `${right}px`;
      panel.style.height = `${height}px`;

      console.log('[CheckInOut V6] Aligned to grid:', { top, left, right, height });
    }
  };

  // ========================================
  // EXPORT GLOBAL
  // ========================================
  window.CheckInOut = {
    openModal: (mode, item) => CheckInOut.openModal(mode, item)
  };

  // ========================================
  // INIT
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CheckInOut.init());
  } else {
    CheckInOut.init();
  }

  console.log('[CheckInOut V6] Module loaded - FORCE RELOAD + BADGE IN/OUT + FIX MODE SWITCH');
})();


