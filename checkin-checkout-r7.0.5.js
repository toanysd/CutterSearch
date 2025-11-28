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
  let isClosingAfterSave = false; // NEW: Flag để tránh dispatch duplicate

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
          // R7.0.4: CRITICAL FIX - Enhanced badge logic supporting both old and new formats
          let badgeClass;
          let badgeText;

          const statusUpper = (l.Status || '').toUpperCase();

          if (l.Status === 'AUDIT' || l.AuditType) {
              badgeClass = 'badge-audit';
              const auditLabel = l.AuditType === 'AUDIT-WITH-RELOCATION' ? '検数移' : '検数';
              badgeText = auditLabel;
          } else if (statusUpper === 'IN' || statusUpper === 'CHECKIN' || l.Status === 'check-in') {
              // Support: 'IN', 'CHECKIN', 'check-in'
              badgeClass = 'badge-in';
              badgeText = 'IN';
          } else if (statusUpper === 'OUT' || statusUpper === 'CHECKOUT' || l.Status === 'check-out') {
              // Support: 'OUT', 'CHECKOUT', 'check-out'
              badgeClass = 'badge-out';
              badgeText = 'OUT';
          } else {
              badgeClass = 'badge-unknown';
              badgeText = l.Status || '?';
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
            // R7.0.4: CRITICAL FIX - Enhanced badge logic supporting both old and new formats
            let badgeClass;
            let badgeText;

            const statusUpper = (l.Status || '').toUpperCase();

            if (l.Status === 'AUDIT' || l.AuditType) {
                badgeClass = 'badge-audit';
                const auditLabel = (l.AuditType === 'AUDIT-WITH-RELOCATION') ? '検数移' : '検数';
                badgeText = auditLabel;
            } else if (statusUpper === 'IN' || statusUpper === 'CHECKIN' || l.Status === 'check-in') {
                // Support: 'IN', 'CHECKIN', 'check-in'
                badgeClass = 'badge-in';
                badgeText = 'IN';
            } else if (statusUpper === 'OUT' || statusUpper === 'CHECKOUT' || l.Status === 'check-out') {
                // Support: 'OUT', 'CHECKOUT', 'check-out'
                badgeClass = 'badge-out';
                badgeText = 'OUT';
            } else {
                badgeClass = 'badge-unknown';
                badgeText = l.Status || '?';
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


    // AUTO-FILL BASED ON STATUS  
    applyAutoFillLogic(item, mode, historyLogs, empList) {
        const currentStatus = this.getCurrentStatus(item.MoldID || item.CutterID, item.MoldID ? 'mold' : 'cutter');
        console.log('[AutoFill] Current status:', currentStatus, 'Requested Mode:', mode);
        
        // === CRITICAL: KHÔNG thay đổi UI mode, chỉ auto-fill data ===
        
        const lastLog = historyLogs[0];
        
        // Auto-fill employee
        const empInput = document.getElementById('cio-emp');
        if (empInput && lastLog) {
            empInput.value = lastLog.EmployeeID || '';
        }
        
        // Auto-fill destination (only if mode is check-out)
        const destInput = document.getElementById('cio-dest');
        if (destInput && lastLog && mode === 'check-out') {
            destInput.value = lastLog.DestinationID || '';
        }
        
        // === CRITICAL FIX: Show/hide destination group BASED ON mode PARAMETER ===
        const destGroup = document.querySelector('.dest-group');
        if (destGroup) {
            // ✅ ĐÚNG: Check biến mode (parameter), KHÔNG check currentStatus
            if (mode === 'check-out') {
                destGroup.classList.remove('hidden');
                console.log('[AutoFill] ✅ Destination group SHOWN for check-out mode');
            } else {  // mode === 'check-in'
                destGroup.classList.add('hidden');
                console.log('[AutoFill] ✅ Destination group HIDDEN for check-in mode');
            }
        }
        
        // Auto-fill note based on current status
        const noteInput = document.getElementById('cio-note');
        if (noteInput && currentStatus) {
            if (mode === 'check-in') {
                noteInput.value = '在庫確認 / Kiểm kê';
            } else if (currentStatus === 'check-out') {
                noteInput.value = '返却 / Trả về';
            }
            console.log('[AutoFill] ✅ Applied note for status:', currentStatus);
        }
    },    

    // ========================================
    // OPEN MODAL
    // ========================================
    openModal(mode = 'check-in', item = currentItem) {
      if (!item) {
        alert('金型を選択してください / Vui lòng chọn khuôn trước.');
        return;
      }

        
      if (!item.MoldID && !item.CutterID) {
          console.error('[CheckInOut] ❌ Item missing ID:', item);
          alert('Lỗi: Không tìm thấy MoldID hoặc CutterID');
          return;
      }

      // Store item globally
      currentMode = mode;
      currentItem = item;

      console.log('[CheckInOut] ✅ Opening modal with item:', {
        MoldID: item.MoldID,
        CutterID: item.CutterID,
        MoldCode: item.MoldCode,
        mode: mode,  // ← Thêm dòng này để log mode
        currentMode: currentMode  // Confirm currentMode is set correctly
    });

      this.close(); // Đóng modal cũ

      // ✅ R7.0.4: Add modal-open class to body for iPhone mobile CSS
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
          document.body.classList.add('modal-open');
          console.log('[CheckInOut] ✅ Added modal-open class to body (iPhone mode)');
      }

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
                <button id="btn-in" class="mode-btn ${mode === 'check-in' ? 'active' : ''}" data-mode="check-in">
                    ✓ チェックイン / Check-in
                </button>
                <button id="btn-out" class="mode-btn ${mode === 'check-out' ? 'active' : ''}" data-mode="check-out">
                    ✗ チェックアウト / Check-out
                </button>
            </div>
            <button class="btn-close-compact" id="cio-close" title="閉じる / Close (ESC)">✕</button>
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

          <!-- CỘT 3: NHẬP LIỆU -->
          <section class="cio-inputs">
              <h4>📝 データ入力 / Nhập liệu</h4>
              
              <!-- R7.0.5: 2. ĐỊA ĐIỂM (CHỈ CHECK-OUT) -->
              <div class="form-group dest-group ${mode === 'check-out' ? '' : 'hidden'}">
                  <label class="form-label">目的地 / Địa điểm *</label>
                  <div id="destination-select-container"></div>
              </div>

              <!-- R7.0.5: 1. NHÂN VIÊN (MẶC ĐỊNH) -->
              <div class="form-group">
                  <label class="form-label">従業員 / Nhân viên *</label>
                  <div id="employee-select-container"></div>
                  <button id="btn-face" class="btn-face" type="button">👤 Face ID</button>
                  <small id="cio-face-status" class="face-status">未確認 / Chưa xác nhận</small>
              </div>
              
                            
              <!-- R7.0.5: 3. GHI CHÚ -->
              <div class="form-group">
                  <label class="form-label">備考 / Ghi chú</label>
                  <textarea id="cio-note" class="form-control" rows="2" placeholder="メモ / Ghi chú..."></textarea>
              </div>
              
              <!-- NÚT XÁC NHẬN/HỦY - FIXED BOTTOM ON MOBILE -->
              <div class="btn-row">
                  <button class="btn-cancel" id="btn-cancel">✕ 戻る / Hủy</button>
                  <button class="btn-confirm" id="btn-save">✓ 確認 / Xác nhận</button>                  
              </div>
          </section>


        </div><!-- end checkio-body -->
      </div><!-- end cio-panel -->`;

      // Chèn vào DOM
      upper.insertAdjacentHTML('beforeend', html);

      // R7.0.5: Initialize searchable selects
      if (window.innerWidth < 768) {
          // Employee select
          const empContainer = document.getElementById('employee-select-container');
          const empOptions = empList.map(e => ({
              id: e.EmployeeID,
              name: e.EmployeeName
          }));
          const empSelect = window.createSearchableSelect('cio-emp', empOptions, (id) => {
              console.log('[CheckInOut] Employee selected:', id);
          });
          empContainer.appendChild(empSelect);
          
          // Destination select (if check-out mode)
          if (mode === 'check-out') {
              const destContainer = document.getElementById('destination-select-container');
              const destOptions = destList.map(d => ({
                  id: d.DestinationID,
                  name: d.DestinationName
              }));
              const destSelect = window.createSearchableSelect('cio-dest', destOptions, (id) => {
                  console.log('[CheckInOut] Destination selected:', id);
              });
              destContainer.appendChild(destSelect);
          }
      }


      // NEW Auto-fill logic sau khi render modal
      this.applyAutoFillLogic(item, mode, historyLogs, empList);     

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
                // R7.0.4: CRITICAL FIX - Enhanced badge logic supporting both old and new formats
                let badgeClass;
                let badgeText;

                const statusUpper = (l.Status || '').toUpperCase();

                if (l.Status === 'AUDIT' || l.AuditType) {
                    badgeClass = 'badge-audit';
                    const auditLabel = (l.AuditType === 'AUDIT-WITH-RELOCATION') ? '検数移' : '検数';
                    badgeText = auditLabel;
                } else if (statusUpper === 'IN' || statusUpper === 'CHECKIN' || l.Status === 'check-in') {
                    // Support: 'IN', 'CHECKIN', 'check-in'
                    badgeClass = 'badge-in';
                    badgeText = 'IN';
                } else if (statusUpper === 'OUT' || statusUpper === 'CHECKOUT' || l.Status === 'check-out') {
                    // Support: 'OUT', 'CHECKOUT', 'check-out'
                    badgeClass = 'badge-out';
                    badgeText = 'OUT';
                } else {
                    badgeClass = 'badge-unknown';
                    badgeText = l.Status || '?';
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

      // FIX: Chuyển đổi mode (sửa lại event listener)
      const inBtn = document.getElementById('btn-in');
      const outBtn = document.getElementById('btn-out');

      if (inBtn) {
          inBtn.addEventListener('click', () => {
              if (currentMode !== 'check-in') {  // Only switch if different
                  this.switchMode('check-in');
              }
          });
      }

      if (outBtn) {
          outBtn.addEventListener('click', () => {
              if (currentMode !== 'check-out') {  // Only switch if different
                  this.switchMode('check-out');
              }
          });
      }

    },

    // R7.0.6: Switch mode with destination dropdown re-init
    switchMode(newMode) {
        if (currentMode === newMode) {
            console.log('[CheckInOut] Mode already set to', newMode);
            return;
        }

        currentMode = newMode;
        console.log('[CheckInOut] Switching mode to:', newMode);

        const inBtn = document.getElementById('btn-in');
        const outBtn = document.getElementById('btn-out');
        const destGroup = document.querySelector('.dest-group');

        // Update button active states
        if (inBtn && outBtn) {
            inBtn.classList.remove('active');
            outBtn.classList.remove('active');
            
            if (newMode === 'check-in') {
                inBtn.classList.add('active');
            } else {
                outBtn.classList.add('active');
            }
        }

        // R7.0.6: CRITICAL FIX - Re-init destination select when switching to checkout
        if (destGroup) {
            if (newMode === 'check-out') {
                destGroup.classList.remove('hidden');
                
                // CRITICAL: Re-initialize searchable select if not exists
                const destContainer = document.getElementById('destination-select-container');
                if (destContainer && destContainer.children.length === 0) {
                    const destList = window.DataManager?.data?.destinations || [];
                    const destOptions = destList.map(d => ({
                        id: d.DestinationID,
                        name: d.DestinationName
                    }));
                    const destSelect = window.createSearchableSelect('cio-dest', destOptions, (id) => {
                        console.log('[CheckInOut] Destination selected:', id);
                    });
                    destContainer.appendChild(destSelect);
                    console.log('[CheckInOut] ✅ Destination select re-initialized');
                }
            } else {
                destGroup.classList.add('hidden');
            }
        }

        console.log('[CheckInOut] ✅ Mode switched to', newMode);
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

        
        // === CRITICAL FIX: VALIDATE ITEM DATA ===
        if (!item || (!item.MoldID && !item.CutterID)) {
            console.error('[CheckInOut] ❌ Missing item data:', item);
            alert('Lỗi: Không tìm thấy MoldID hoặc CutterID');
            this.showBilingualToast('error');
            return;
        }

        // Log validated item
        console.log('[CheckInOut] ✅ Item validated:', {
            MoldID: item.MoldID,
            CutterID: item.CutterID,
            MoldCode: item.MoldCode
        });
        
        // R7.0.4: CRITICAL FIX - Convert mode to correct status format
        // Mode from mobile: 'check-in' / 'check-out'
        // Status to save: 'IN' / 'OUT' (same as iPad logic)
        let status;
        let auditType;
        let auditDate;

        // Check if this is actually an audit (check-in when already checked-in)
        if (currentMode === 'check-in') {
            const currentStatus = this.getCurrentStatus(
                item.MoldID || item.CutterID, 
                item.MoldID ? 'mold' : 'cutter'
            );
            
            // Check if already IN (using multiple format checks)
            if (currentStatus === 'check-in' || currentStatus === 'CHECKIN' || 
                currentStatus === 'IN' || currentStatus?.toLowerCase().includes('in')) {
                console.log('[CheckInOut] Converting to AUDIT (already checked-in)');
                status = 'AUDIT';
                auditType = 'AUDIT-ONLY';
                auditDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                
                // Update notes if empty
                if (!noteValue.trim()) {
                    noteInput.value = '検数 / Kiểm kê';
                }
            } else {
                // Normal check-in -> Status = 'IN'
                status = 'IN';
            }
        } else if (currentMode === 'check-out') {
            // Check-out -> Status = 'OUT'
            status = 'OUT';
        } else {
            // Fallback (should not happen)
            console.warn('[CheckInOut] Unknown mode:', currentMode);
            status = currentMode;
        }

        console.log('[CheckInOut] Final status to save:', status, 'from mode:', currentMode);

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
        
        // === FIX: Đóng modal ngay và dispatch event để đóng modal chi tiết ===
        setTimeout(() => {
            isClosingAfterSave = true; // Set flag trước khi close
            CheckInOut.close();
            
            // Dispatch success event để mobile detail modal biết và tự đóng
            document.dispatchEvent(new CustomEvent('checkin-completed', {
                detail: {
                    item: item,
                    success: true,
                    mode: currentMode,
                    timestamp: new Date().toISOString()
                }
            }));
            
            console.log('[CheckInOut] ✅ Dispatched checkin-completed event');
            // Reset flag sau khi xong
            setTimeout(() => { isClosingAfterSave = false; }, 100);
        }, 300);

        
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
      console.log('[CheckInOut] 🔄 Starting background sync...', { localId, moldId, data });

      try {
          // === CRITICAL VALIDATION ===
          if (!data.MoldID && !data.CutterID) {
              throw new Error('MoldID or CutterID required');
          }

          console.log('[CheckInOut] ✅ Data validated, sending to API...');

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

    // CLOSE MODAL
    close() {
        const panel = document.getElementById('cio-panel');
        if (panel) {
            panel.remove();
            console.log('[CheckInOut] V6 Closed panel');
        }

        // === NEW: Chỉ dispatch cancel event nếu KHÔNG phải từ saveRecord ===
        if (!isClosingAfterSave) {
            document.dispatchEvent(new CustomEvent('module-cancelled', {
                detail: {
                    module: 'checkin',
                    item: currentItem,
                    timestamp: new Date().toISOString()
                }
            }));
            console.log('[CheckInOut] ✅ Dispatched module-cancelled event');
        } else {
            console.log('[CheckInOut] ℹ️ Skipped module-cancelled (closing after save)');
        }

        // R7.0.4: Remove modal-open class from body (for iPhone mobile CSS)
        if (document.body.classList.contains('modal-open')) {
            // THAY BẰNG: Chỉ xóa panel cũ nếu có
            const existingPanel = document.getElementById('checkio-panel');
            if (existingPanel) existingPanel.remove();
        }
        
        document.body.classList.remove('modal-open');
        console.log('[CheckInOut] ✅ Removed modal-open class from body');

        // TRẢ BÀN PHÍM VỀ SEARCHBOX KHI ĐÓNG POPUP
        const searchBox = document.querySelector('search-input');
        if (searchBox) {
            searchBox.focus();
            document.dispatchEvent(new CustomEvent('keyboard:attach', {
                detail: { element: searchBox }
            }));
            console.log('[CheckInOut] V6 Keyboard reattached to searchbox');
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
  // R7.0.9: INLINE AUTOCOMPLETE + SELECT ALL ON FOCUS
  // ========================================
  function createSearchableSelect(inputId, options, onSelect) {
      const wrapper = document.createElement('div');
      wrapper.className = 'searchable-select-wrapper';
      
      // Main input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'search-input';
      input.id = inputId;
      input.placeholder = '検索... / Tìm kiếm...';
      input.autocomplete = 'off';
      
      // Store selected value
      let selectedId = '';
      let selectedName = '';
      let currentSuggestion = null;
      let isAcceptingSuggestion = false; // Flag to prevent loops
      
      // Dropdown icon
      const icon = document.createElement('span');
      icon.className = 'dropdown-icon';
      icon.textContent = '▼';
      
      // Options list
      const optionsList = document.createElement('div');
      optionsList.className = 'options-list';
      
      wrapper.appendChild(input);
      wrapper.appendChild(icon);
      wrapper.appendChild(optionsList);
      
      // R7.0.10: FIX INLINE AUTOCOMPLETE - Match ID first, then name
      function updateInlineAutocomplete(filterText) {
          if (!filterText || filterText.length === 0 || isAcceptingSuggestion) {
              currentSuggestion = null;
              return;
          }
          
          const lowerFilter = filterText.toLowerCase();
          
          // R7.0.10: PRIORITY MATCHING
          // 1. First try exact ID match (e.g., "11" matches ID "11")
          // 2. Then try ID startsWith (e.g., "1" matches ID "10", "11", "12")
          // 3. Then try name startsWith
          // 4. Finally try name includes
          
          let firstMatch = null;
          
          // Priority 1: Exact ID match
          firstMatch = options.find(opt => opt.id.toLowerCase() === lowerFilter);
          
          // Priority 2: ID startsWith
          if (!firstMatch) {
              firstMatch = options.find(opt => opt.id.toLowerCase().startsWith(lowerFilter));
          }
          
          // Priority 3: Name startsWith
          if (!firstMatch) {
              firstMatch = options.find(opt => opt.name.toLowerCase().startsWith(lowerFilter));
          }
          
          // Priority 4: Name includes
          if (!firstMatch) {
              firstMatch = options.find(opt => opt.name.toLowerCase().includes(lowerFilter));
          }
          
          if (firstMatch) {
              currentSuggestion = firstMatch;
              
              // R7.0.10: Show suggestion in input
              const suggestion = firstMatch.name;
              const userTextLength = filterText.length;
              
              // Check if suggestion starts with user's text
              const suggestionLower = suggestion.toLowerCase();
              const idLower = firstMatch.id.toLowerCase();
              
              // Determine what to show as autocomplete
              let displayText = '';
              let selectionStart = 0;
              
              if (idLower === lowerFilter || idLower.startsWith(lowerFilter)) {
                  // User is typing the ID → show full name
                  displayText = suggestion;
                  selectionStart = 0; // Highlight entire name
              } else if (suggestionLower.startsWith(lowerFilter)) {
                  // User is typing the name → autocomplete rest of name
                  displayText = suggestion;
                  selectionStart = userTextLength;
              } else {
                  // User typed something in the middle → just show full name
                  displayText = suggestion;
                  selectionStart = 0;
              }
              
              input.value = displayText;
              input.setSelectionRange(selectionStart, displayText.length);
              
              console.log('[Autocomplete] Suggestion:', displayText, 'ID:', firstMatch.id);
          } else {
              currentSuggestion = null;
          }
      }

      
      // Render options with row highlight
      function renderOptions(filterText = '') {
          const lowerFilter = filterText.toLowerCase().trim();
          
          if (options.length === 0) {
              optionsList.innerHTML = '<div class="no-results">結果なし / Không có kết quả</div>';
              return;
          }
          
          optionsList.innerHTML = options.map(opt => {
              const displayText = `${opt.name} (${opt.id})`;
              
              let isMatched = false;
              if (lowerFilter && lowerFilter.length > 0) {
                  const matchName = opt.name.toLowerCase().includes(lowerFilter);
                  const matchId = opt.id.toLowerCase().includes(lowerFilter);
                  isMatched = matchName || matchId;
              }
              
              const isSelected = opt.id === selectedId ? 'selected' : '';
              const matchedClass = isMatched ? 'matched' : '';
              
              return `
                  <div class="option-item ${isSelected} ${matchedClass}" 
                      data-id="${opt.id}" 
                      data-name="${opt.name}">
                      ${displayText}
                  </div>
              `;
          }).join('');
          
          // Bind click events
          optionsList.querySelectorAll('.option-item').forEach(item => {
              item.addEventListener('click', () => {
                  selectOption(item.getAttribute('data-id'), item.getAttribute('data-name'));
              });
          });
      }
      
      // Select option helper
      function selectOption(id, name) {
          isAcceptingSuggestion = true;
          selectedId = id;
          selectedName = name;
          input.value = name;
          input.dataset.selectedId = id;
          currentSuggestion = null;
          
          optionsList.classList.remove('show');
          wrapper.classList.remove('open');
          
          if (onSelect) onSelect(id, name);
          console.log('[SearchableSelect] Selected:', name, id);
          
          setTimeout(() => { isAcceptingSuggestion = false; }, 100);
      }
      
      // R7.0.9: SELECT ALL ON FOCUS
      input.addEventListener('focus', () => {
          // Select all text when focusing from another field
          if (input.value && input.value.length > 0) {
              setTimeout(() => {
                  input.select(); // Highlight all text
              }, 0);
          }
          
          renderOptions(input.value);
          optionsList.classList.add('show');
          wrapper.classList.add('open');
      });
      
      // R7.0.9: Update on input with inline autocomplete
      input.addEventListener('input', (e) => {
          // Don't trigger if accepting suggestion
          if (isAcceptingSuggestion) return;
          
          const currentValue = input.value;
          renderOptions(currentValue);
          
          // Only show autocomplete if user is typing (not deleting/selecting)
          if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
              updateInlineAutocomplete(currentValue);
          }
          
          if (!optionsList.classList.contains('show')) {
              optionsList.classList.add('show');
              wrapper.classList.add('open');
          }
      });
      
      // R7.0.9: Handle keyboard shortcuts
      input.addEventListener('keydown', (e) => {
          if (e.key === 'Tab' || e.key === 'ArrowRight') {
              // Accept inline autocomplete
              if (currentSuggestion && input.selectionStart !== input.selectionEnd) {
                  e.preventDefault();
                  selectOption(currentSuggestion.id, currentSuggestion.name);
              }
          } else if (e.key === 'Enter') {
              e.preventDefault();
              if (currentSuggestion) {
                  selectOption(currentSuggestion.id, currentSuggestion.name);
              }
          } else if (e.key === 'Escape') {
              optionsList.classList.remove('show');
              wrapper.classList.remove('open');
              currentSuggestion = null;
          } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              // Focus first matched item in dropdown
              const firstMatched = optionsList.querySelector('.option-item.matched');
              if (firstMatched) firstMatched.scrollIntoView({ block: 'nearest' });
          }
      });
      
      // Click outside to close
      document.addEventListener('click', (e) => {
          if (!wrapper.contains(e.target)) {
              optionsList.classList.remove('show');
              wrapper.classList.remove('open');
              currentSuggestion = null;
              
              // Restore selected name if user didn't select
              if (selectedName && input.value !== selectedName) {
                  input.value = selectedName;
              }
          }
      });
      
      // Public methods
      wrapper.setValue = (id) => {
          const option = options.find(o => o.id === id);
          if (option) {
              selectedId = id;
              selectedName = option.name;
              input.value = option.name;
              input.dataset.selectedId = id;
          }
      };
      
      wrapper.getValue = () => selectedId;
      
      return wrapper;
  }

  window.createSearchableSelect = createSearchableSelect;




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


