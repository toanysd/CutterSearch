// ========================================
// CHECK-IN / CHECK-OUT MODULE - V6
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

    // ========================================
    // REFRESH HISTORY TABLE
    // ========================================
    refreshHistory(moldId) {
        const historyContainer = document.querySelector('.history-wrap');
        if (!historyContainer) return;
        console.log(`[CheckInOut V6] 🔄 Refreshing history for MoldID: ${moldId}`);
        // Luôn lấy dữ liệu mới nhất từ DataManager
        const allLogs = window.DataManager?.data?.statuslogs || [];
        const destList = window.DataManager?.data?.destinations || [];
        const empList = window.DataManager?.data?.employees || [];
        const historyLogs = allLogs.filter(l => String(l.MoldID).trim() === String(moldId).trim());
        historyLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        if (historyLogs.length === 0) {
            historyContainer.innerHTML = '<p style="text-align:center;padding:1rem;color:#888;">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</p>';
            return;
        }

        const tableRows = historyLogs.map((l, idx) => {
            const status = (l.Status || '').toLowerCase();
            const badgeClass = status.includes('in') ? 'badge-green' : 'badge-red';
            const badgeText = status.includes('in') ? '在庫<br>Check-in' : '出庫<br>Check-out';
            // 🗑️ Thêm nút xóa lịch sử
            return `
                <tr data-log-id="${l.LogID || idx}">
                <td>${this.fmt(l.Timestamp)}</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>${this.getEmployeeName(l.EmployeeID, empList)}</td>
                <td>${this.getDestinationName(l.DestinationID, destList)}</td>
                <td class="note-cell">${l.Notes || '-'}</td>
                <td class="action-cell"><button class="btn-delete-history" data-log-id="${l.LogID || idx}" title="削除 / Xóa">🗑️</button></td>
              </tr>`;
        }).join('');
        historyContainer.innerHTML = `
            <table class="cio-history-table">
                <thead>
                    <tr>
                      <th>時間 / Thời gian</th>
                      <th>状態 / Status</th>
                      <th>従業員 / NV</th>
                      <th>目的地 / Nơi đến</th>
                      <th>備考 / Ghi chú</th>
                      <th style="width:40px">削除</th>
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
    // DELETE HISTORY LOG - MỚI
    // ========================================
    bindDeleteHistoryEvents(moldId) {
      const buttons = document.querySelectorAll('.btn-delete-history');
      buttons.forEach(btn => {
          btn.addEventListener('click', async (e) => {
              e.preventDefault();
              
              const logId = btn.getAttribute('data-log-id');
              const timestamp = btn.getAttribute('data-time');
              
              if (!confirm('Bạn chắc chắn muốn xóa? / 削除しますか？')) return;
              
              const row = btn.closest('tr');
              if (row) row.classList.add('deleting');
              
              try {
                  // ✅ FIX: Đúng format API
                  const res = await fetch(`${APIURL}/${logId}`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          MoldID: moldId,
                          Timestamp: decodeURIComponent(timestamp || '')
                      })
                  });
                  
                  const rj = await res.json();
                  
                  if (rj.success) {
                      this.showBilingualToast('deleted');
                      await window.DataManager.loadAllData();
                      await this.refreshHistory(moldId);
                  } else {
                      this.showBilingualToast('error');
                      if (row) row.classList.remove('deleting');
                  }
              } catch (err) {
                  console.error('Delete error', err);
                  this.showBilingualToast('error');
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
      this.alignGrid();

      // Bind events
      this.bindModalEvents(item, destList, empList);
      
      // Enable filter và sort
      this.enableFilter();
      this.enableSort();
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
                const isIn = l.Status === 'check-in';
                const badgeClass = isIn ? 'badge-in' : 'badge-out';
                const badgeText = isIn ? 'IN' : 'OUT';
                
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
        
        const data = {
            MoldID: item.MoldID,
            Status: currentMode,
            EmployeeID: empValue,
            DestinationID: currentMode === 'check-in' ? 'AREA-MOLDROOM' : destValue,
            Notes: noteValue,
            Timestamp: new Date().toISOString()
        };
        
        console.log('CheckInOut R6.2: Submitting', data);
        
        // ✅ BƯỚC 1: OPTIMISTIC UPDATE - Thêm vào cache ngay
        const pendingLog = window.DataManager?.PendingCache?.add(data);
        if (!pendingLog) {
            console.error('CheckInOut R6.2: PendingCache not available');
            return;
        }
        
        // ✅ BƯỚC 2: UI Update tức thì
        this.showBilingualToast('processing');
        
     
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
        
        // ✅ BƯỚC 3: Background GitHub sync
        this.syncToGitHub(data, pendingLog._localId, item.MoldID);
    },

    /**
     * ✅ MỚI: Background sync to GitHub
     */
    async syncToGitHub(data, localId, moldId) {
        const APIURL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
        
        try {
            console.log('📤 Sending POST to:', APIURL);
            const res = await fetch(APIURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            console.log('📥 Response status:', res.status, res.statusText);
        
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
            const rj = await res.json();
            console.log('✅ Response data:', rj);
            if (rj.success) {
                console.log('✅ CheckInOut R6.2: GitHub sync SUCCESS', rj);
                
                // Remove pending log
                window.DataManager.PendingCache.remove(localId);
                
                // ✅ 2. Thêm log thật từ GitHub (KHÔNG reload toàn bộ)
                const realLog = {
                    LogID: rj.logId || `SL${Date.now()}`,
                    MoldID: data.MoldID,
                    Status: data.Status,
                    EmployeeID: data.EmployeeID,
                    DestinationID: data.DestinationID,
                    Notes: data.Notes,
                    Timestamp: data.Timestamp
                };

                if (window.DataManager?.data?.statuslogs) {
                    // Kiểm tra trùng trước khi thêm
                    const exists = window.DataManager.data.statuslogs.some(log => 
                        log.Timestamp === realLog.Timestamp && log.MoldID === realLog.MoldID
                    );
                    
                    if (!exists) {
                        window.DataManager.data.statuslogs.unshift(realLog);
                        console.log('✅ Added real log to statuslogs array');
                    }
                }
                
                // ✅ FIX: Refresh history NẾU popup đang mở
                const historyWrap = document.querySelector('.history-wrap');
                if (historyWrap) {
                    console.log('🔄 Refreshing history table after sync...');
                    await CheckInOut.refreshHistory(moldId);
                }
                
                // Toast success
                this.showBilingualToast('success', data.Status);
                
                // ✅ 5. Dispatch event để update badge (CHỈ NẾU popup ĐÓNG)
                if (!historyWrap) {
                    const currentItem = window.UIRenderer?.state?.currentDetailItem;
                    if (currentItem && (currentItem.MoldID === moldId || currentItem.MoldCode === String(moldId))) {
                        document.dispatchEvent(new CustomEvent('detail:changed', {
                            detail: { 
                                item: currentItem,
                                itemType: 'mold',
                                itemId: moldId,
                                source: 'checkin-sync'
                            }
                        }));
                    }
                }
            } else {
                console.error('❌ CheckInOut R6.2: GitHub sync FAILED', rj.message);
                this.handleSyncError(localId, rj.message);
            }
        } catch (err) {
            console.error('❌ CheckInOut R6.2: Network error', err);
            this.handleSyncError(localId, err.message);
        }
    },

    /**
     * ✅ MỚI: Xử lý lỗi sync
     */
    handleSyncError(localId, errorMsg) {
        // Mark pending log as error
        window.DataManager?.PendingCache?.markError(localId, errorMsg);
        
        // Toast lỗi
        this.showBilingualToast('error');
        
        // Retry after 30s
        console.log('⏳ Will retry sync after 30s...');
        setTimeout(() => {
            const log = window.DataManager?.data?.statuslogs?.find(l => l._localId === localId);
            if (log && log._pending && log._syncError) {
                console.log('🔄 Retrying sync for', localId);
                this.syncToGitHub(log, localId, log.MoldID);
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
            deleted: 'Đã xóa / 削除しました'
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
