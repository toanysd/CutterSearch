/**
 * =====================================================
 * LOCATION MANAGER R7.0.9 - FULL UPDATE
 * =====================================================
 * Created: 2025.12.24
 * Version: 7.0.9 (Searchable Dropdown + Direct RackLayerID Input + Lock/Unlock History)
 * Framework: Hybrid Architecture (V7.7.7 r6.4)
 *
 * ✅ NEW Features in r7.0.9:
 * - Direct RackLayerID input (e.g., 181 = Rack 18, Layer 1)
 * - Lock/Unlock history table (4 cols <-> 6 cols)
 * - Improved Cutter (dao cắt) support
 * - iPad/PC optimized 3-column layout
 * - Consistent with checkin-checkout-r7.0.9
 *
 * Dependencies:
 * - data-manager-r6.4.js (DataManager)
 * - location-manager-r7.0.9.css
 * - location-manager-mobile-r7.0.9.css
 * - server-r6.4.js (API /api/locationlog)
 * - window.createSearchableSelect() (from checkin-checkout-r7.0.9.js)
 * =====================================================
 */

'use strict';

const GITHUB_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';
let currentItem = null;
let currentOldRackLayerID = null;
let sortColumn = 'DateEntry';
let sortOrder = 'desc';
let isClosingAfterSave = false;

// ✅ Storage keys
const STORAGE_KEY_HISTORY_UNLOCK = 'loc:history-unlocked';

// ✅ NEW: Store searchable select instances
let rackSelectInstance = null;
let layerSelectInstance = null;
let employeeSelectInstance = null;

// ===================================================
// STORAGE FUNCTIONS - Lock/Unlock History
// ===================================================
function isHistoryUnlocked() {
    return localStorage.getItem(STORAGE_KEY_HISTORY_UNLOCK) === '1';
}

function setHistoryUnlocked(value) {
    localStorage.setItem(STORAGE_KEY_HISTORY_UNLOCK, value ? '1' : '0');
}

// ===================================================
// HELPER: Swipe to close (mobile only)
// ===================================================
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

// =====================================================
// LOCATION CACHE - Pending logs management
// =====================================================
const LocationCache = {
    add: function(logData) {
        const pending = {
            ...logData,
            pending: true,
            localId: 'temp-' + Date.now() + Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
        };

        if (!window.DataManager?.data?.locationlog) {
            window.DataManager.data.locationlog = [];
        }

        window.DataManager.data.locationlog.unshift(pending);
        this.persist();
        console.log('[LocationCache] Added:', pending.localId);
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
            console.log('[LocationCache] Removed:', localId);
        }
    },

    markError: function(localId, errorMsg) {
        const log = window.DataManager?.data?.locationlog?.find(l => l.localId === localId);
        if (log) {
            log.syncError = errorMsg;
            log.syncErrorAt = new Date().toISOString();
            this.persist();
            console.warn('[LocationCache] Marked error:', localId, errorMsg);
        }
    },

    persist: function() {
        try {
            const pending = window.DataManager?.data?.locationlog?.filter(log => log.pending);
            localStorage.setItem('pendingLocationLogs', JSON.stringify(pending));
            console.log('[LocationCache] Persisted:', pending?.length, 'logs');
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

    cleanup: function(maxAge = 3600000) {
        if (!window.DataManager?.data?.locationlog) return;
        const now = Date.now();
        const beforeLen = window.DataManager.data.locationlog.length;

        window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(log => {
            if (!log.pending) return true;
            const age = now - new Date(log.createdAt).getTime();
            return age <= maxAge;
        });

        const afterLen = window.DataManager.data.locationlog.length;
        if (beforeLen !== afterLen) {
            this.persist();
            console.log('[LocationCache] Cleaned up:', beforeLen - afterLen, 'old logs');
        }
    }
};

// =====================================================
// LOCATION MANAGER MAIN
// =====================================================
const LocationManager = {
    INIT: function() {
        console.log('LocationManager R7.0.9 Module ready (Direct RackLayerID + Lock/Unlock)');
        LocationCache.restore();

        document.addEventListener('detail:changed', (e) => {
            if (e.detail?.item) {
                currentItem = e.detail.item;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                const panel = document.getElementById('loc-panel');
                if (panel) this.close();
            }
        });
    },

    // ===================================================
    // OPEN MODAL - Display location update popup
    // ===================================================
    openModal: function(mode = 'location', item = currentItem) {
        // ✅ FIX: Support both calling styles
        let actualMode = 'location';
        let actualItem = item;

        if (typeof mode === 'object' && mode !== null) {
            actualItem = mode;
            actualMode = 'location';
            console.log('[LocationManager] 🔄 Detected new calling style: openModal(item)');
        } else if (typeof mode === 'string') {
            actualMode = mode;
            actualItem = item || currentItem;
            console.log('[LocationManager] 🔄 Detected old calling style: openModal(mode, item)');
        }

        // ✅ VALIDATION: Check item validity
        if (!actualItem) {
            alert('Vui lòng chọn khuôn hoặc dao cắt trước.\n金型または刃物を選択してください。');
            console.error('[LocationManager] ❌ Item is null/undefined');
            return;
        }

        // ✅ VALIDATION: Check MoldID or CutterID
        if (!actualItem.MoldID && !actualItem.CutterID) {
            alert('❌ Lỗi: Không tìm thấy ID của thiết bị.\n❌ エラー：デバイスIDが見つかりません。');
            console.error('[LocationManager] ❌ Item has no MoldID or CutterID:', actualItem);
            return;
        }

        // ✅ DEBUG LOG: Display item info
        console.log('[LocationManager] 🔍 Opening modal for item:', {
            MoldID: actualItem.MoldID,
            CutterID: actualItem.CutterID,
            MoldName: actualItem.MoldName,
            MoldCode: actualItem.MoldCode,
            CutterName: actualItem.CutterName,
            CutterCode: actualItem.CutterCode,
            currentRackLayer: actualItem.currentRackLayer,
            RackLayerID: actualItem.RackLayerID,
            fullItem: actualItem
        });

        // Assign to global variables
        currentItem = actualItem;
        currentOldRackLayerID = actualItem.currentRackLayer || actualItem.RackLayerID;
        console.log('[LocationManager] ✅ Validated - currentOldRackLayerID:', currentOldRackLayerID);

        // Remove existing panel
        const existingPanel = document.getElementById('loc-panel');
        if (existingPanel) {
            existingPanel.remove();
            console.log('[LocationManager] Removed existing panel');
        }

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

        // Load data from DataManager
        const racksList = window.DataManager?.data?.racks || [];
        const rackLayersList = window.DataManager?.data?.racklayers || [];
        const locationLogs = window.DataManager?.data?.locationlog || [];
        const employeesList = window.DataManager?.data?.employees || [];

        console.log('LocationManager Loaded:', {
            racks: racksList.length,
            racklayers: rackLayersList.length,
            employees: employeesList.length,
            currentRackLayerID: currentOldRackLayerID
        });

        // Auto-reload in background
        setTimeout(async () => {
            console.log('[LocationManager] 📡 Background reload starting...');
            try {
                await window.DataManager.loadAllData();
                console.log('[LocationManager] ✅ Background reload completed');

                const historyBody = document.querySelector('#loc-his tbody');
                if (historyBody && currentItem) {
                    await this.refreshHistoryInPlace(currentItem);
                    console.log('[LocationManager] ✅ History table auto-refreshed');
                }
            } catch (err) {
                console.warn('[LocationManager] Background reload failed:', err);
            }
        }, 500);

        // ✅ Filter history logs
        console.log('[LocationManager] 🔍 Filtering history:', {
            totalLogs: locationLogs.length,
            itemMoldID: actualItem.MoldID,
            itemCutterID: actualItem.CutterID,
            sampleLog: locationLogs[0]
        });

        const historyLogs = locationLogs.filter(l => {
            const moldMatch = actualItem.MoldID && String(l.MoldID).trim() === String(actualItem.MoldID).trim();
            const cutterMatch = actualItem.CutterID && String(l.CutterID).trim() === String(actualItem.CutterID).trim();
            return moldMatch || cutterMatch;
        });

        console.log('[LocationManager] ✅ Filtered history logs:', historyLogs.length);

        // ✅ Sort by sortColumn / sortOrder
        historyLogs.sort((a, b) => {
            let valA, valB;

            switch (sortColumn) {
                case 'time':
                case 'DateEntry':
                    valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
                    valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
                    break;
                case 'emp':
                    valA = String(a.EmployeeName || a.EmployeeID || a.Employee || '').toLowerCase();
                    valB = String(b.EmployeeName || b.EmployeeID || b.Employee || '').toLowerCase();
                    break;
                case 'note':
                    valA = String(a.LocationNotes || a.notes || '').toLowerCase();
                    valB = String(b.LocationNotes || b.notes || '').toLowerCase();
                    break;
                default:
                    valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
                    valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
                    break;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // ✅ Get current location info
        const moldID = actualItem.MoldID || actualItem.CutterID;
        const moldName = actualItem.MoldName || actualItem.MoldCode || actualItem.CutterName || actualItem.CutterCode || `ID-${moldID}`;

        console.log('[LocationManager] 🔍 Looking up current location:', {
            currentOldRackLayerID: currentOldRackLayerID,
            rackLayersCount: rackLayersList.length,
            racksCount: racksList.length
        });

        const currentRackLayer = rackLayersList.find(
            r => String(r.RackLayerID) === String(currentOldRackLayerID)
        );
        console.log('[LocationManager] Found RackLayer:', currentRackLayer);

        const currentRack = racksList.find(
            r => String(r.RackID) === String(currentRackLayer?.RackID)
        );
        console.log('[LocationManager] Found Rack:', currentRack);

        const rackDisplay = currentRack?.RackSymbol || currentRack?.RackNumber || `Giá ${currentRackLayer?.RackID || '?'}`;
        const layerDisplay = currentRackLayer?.RackLayerNumber || '?';
        const rackLocation = currentRack?.RackLocation || '-';

        console.log('[LocationManager] ✅ Display values:', {
            rackDisplay,
            layerDisplay,
            rackLocation
        });

        // ✅ BUILD HTML MODAL with Direct RackLayerID Input
        const html = `
        <div class="location-panel" id="loc-panel">
            <!-- HEADER -->
            <div class="location-header">
                <div class="location-title">
                    <i class="fas fa-map-marker-alt"></i>
                    <div>
                        <div class="location-title-main">位置変更 / Cập nhật vị trí</div>
                        <div class="location-title-sub">金型 / Khuôn: ${this.escapeHtml(moldName)}</div>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="btn-refresh" id="loc-refresh" title="更新 / Refresh">🔄</button>
                    <button class="btn-close-location" id="btn-close-location" title="閉じる / Đóng">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- BODY -->
            <div class="location-body">
                <!-- COL 1: HISTORY -->
                <section class="loc-history">
                    <h4>📋 履歴 / Lịch sử</h4>
                    <div class="filter-row history-controls">
                        <input type="text" id="loc-search" placeholder="🔍 検索... / Tìm kiếm..." class="location-form-control">
                        <button id="loc-lock-toggle" type="button" class="lock-toggle" title="ロック/アンロック | Khóa/Mở khóa">
                            <span class="lock-text">🔒 Lock</span>
                        </button>
                    </div>
                    <div class="location-history-wrap">
                        ${this.renderHistory(historyLogs, racksList, rackLayersList, employeesList, isHistoryUnlocked())}
                    </div>
                </section>

                <!-- COL 2: STATUS -->
                <section class="loc-status">
                    <h4>📍 情報 / Thông tin hiện tại</h4>
                    <div class="loc-inline-status">
                        <div class="loc-inline-row">
                            <span class="loc-inline-label">ID / Mã:</span>
                            <span class="loc-inline-value">${this.escapeHtml(moldID)}</span>
                            <span class="loc-inline-sep">•</span>
                            <span class="loc-inline-label">名前 / Tên:</span>
                            <span class="loc-inline-value">${this.escapeHtml(moldName)}</span>
                        </div>
                        <div class="loc-inline-row">
                            <span class="loc-inline-label">現在の棚 / Giá hiện tại:</span>
                            <span class="loc-inline-value">${this.escapeHtml(rackDisplay)}</span>
                            <span class="loc-inline-sep">•</span>
                            <span class="loc-inline-label">段 / Tầng:</span>
                            <span class="loc-inline-value">${this.escapeHtml(layerDisplay)}</span>
                        </div>
                        <div class="loc-inline-row">
                            <span class="loc-inline-label">場所 / Vị trí:</span>
                            <span class="loc-inline-value">${this.escapeHtml(rackLocation)}</span>
                        </div>
                    </div>
                </section>

                <!-- COL 3: INPUTS -->
                <section class="loc-inputs">
                    <h4>✏️ 新位置 / Vị trí mới</h4>

                    <!-- ✅ NEW: Direct RackLayerID Input -->
                    <div class="location-form-group">
                        <label class="location-form-label">
                            <span class="label-ja">棚段番号直接入力</span>
                            <span class="label-vi">/ Nhập trực tiếp số giá-tầng</span>
                        </label>
                        <input 
                            type="text" 
                            id="loc-direct-id" 
                            class="location-form-control" 
                            placeholder="例: 181 (棚18・段1) / Ví dụ: 181 (Giá 18, Tầng 1)"
                            maxlength="4"
                            pattern="[0-9]*"
                            inputmode="numeric">
                        <small class="form-hint">例：181 = 棚18・段1 | Ví dụ: 181 = Giá 18, Tầng 1</small>
                    </div>

                    <!-- Giá / Rack -->
                    <div class="location-form-group">
                        <label class="location-form-label">
                            <span class="label-ja">棚</span>
                            <span class="label-vi">/ Giá</span>
                        </label>
                        <div id="rack-select-container"></div>
                    </div>

                    <!-- Tầng / Layer -->
                    <div class="location-form-group">
                        <label class="location-form-label">
                            <span class="label-ja">段</span>
                            <span class="label-vi">/ Tầng</span>
                        </label>
                        <div id="layer-select-container"></div>
                    </div>

                    <!-- Nhân viên / Employee -->
                    <div class="location-form-group">
                        <label class="location-form-label">
                            <span class="label-ja">担当者</span>
                            <span class="label-vi">/ Nhân viên</span>
                        </label>
                        <div id="employee-select-container"></div>
                    </div>

                    <!-- Ghi chú / Note -->
                    <div class="location-form-group">
                        <label class="location-form-label">
                            <span class="label-ja">メモ</span>
                            <span class="label-vi">/ Ghi chú</span>
                        </label>
                        <textarea
                            id="loc-note"
                            class="location-form-control"
                            rows="2"
                            placeholder="メモを入力... / Nhập ghi chú..."></textarea>
                    </div>

                    <!-- Buttons -->
                    <div class="location-btn-row">
                        <button class="btn-cancel-location" id="btn-cancel-location">
                            <i class="fas fa-times"></i> キャンセル / Hủy
                        </button>
                        <button class="btn-confirm-location" id="btn-confirm-location">
                            <i class="fas fa-check"></i> 更新 / Cập nhật
                        </button>
                    </div>
                </section>
            </div>
        </div>
        `;

        upper.insertAdjacentHTML('beforeend', html);

        // ✅ Initialize searchable selects & direct input
        this.initSearchableSelects(racksList, rackLayersList, employeesList, currentRackLayer?.RackID);
        this.initDirectRackLayerInput(racksList, rackLayersList);

        // Bind modal events
        this.bindModalEvents(actualItem, racksList, rackLayersList, employeesList);

        // Enable sort + filter for history table
        this.enableSort();
        this.enableFilter();
        this.bindLockToggle();

                // Swipe to close (mobile)
        const panelEl = document.getElementById('loc-panel');
        const headerEl = document.querySelector('.location-header');
        attachSwipeToClose(headerEl, panelEl, () => this.close());
        
        // ✅ AUTO-FOCUS: Ưu tiên trường nhập trực tiếp vị trí mới
        setTimeout(() => {
            // Ưu tiên focus vào Direct RackLayerID input
            const directInput = document.getElementById('loc-direct-id');
            
            if (directInput) {
                directInput.focus();
                // Chọn toàn bộ text nếu có sẵn
                directInput.select();
                
                // Dispatch keyboard event cho virtual keyboard (mobile)
                document.dispatchEvent(new CustomEvent('keyboard:attach', { 
                    detail: { element: directInput } 
                }));
                
                console.log('[LocationManager] ✅ Auto-focused on Direct Input');
            } else {
                // Fallback: Focus vào input đầu tiên nếu không tìm thấy direct input
                const firstInput = document.querySelector('#loc-panel input, #loc-panel textarea');
                if (firstInput) {
                    firstInput.focus();
                    document.dispatchEvent(new CustomEvent('keyboard:attach', { 
                        detail: { element: firstInput } 
                    }));
                    console.log('[LocationManager] ⚠️ Fallback: Focused on first input');
                }
            }
        }, 300);
    },


    // ===================================================
    // ✅ NEW: INIT DIRECT RACKLAYER ID INPUT
    // Logic: 181 = Rack 18, Layer 1 (last digit is layer)
    // ===================================================
    initDirectRackLayerInput: function(racksList, rackLayersList) {
        const directInput = document.getElementById('loc-direct-id');
        if (!directInput) return;

        console.log('[LocationManager] Initializing Direct RackLayerID Input');

        directInput.addEventListener('input', (e) => {
            // Only allow numbers
            e.target.value = e.target.value.replace(/[^0-9]/g, '');

            const value = e.target.value;
            if (value.length >= 2) {
                // Parse: last digit = layer, rest = rack
                const layerNum = value.slice(-1);
                const rackNum = value.slice(0, -1);

                console.log('[LocationManager] Direct input parsed:', {
                    input: value,
                    rackNum: rackNum,
                    layerNum: layerNum
                });

                // Find matching rack
                const matchingRack = racksList.find(r => 
                    String(r.RackNumber) === rackNum || 
                    String(r.RackSymbol) === rackNum ||
                    String(r.RackID) === rackNum
                );

                if (matchingRack) {
                    // Update rack dropdown
                    if (rackSelectInstance && typeof rackSelectInstance.setValue === 'function') {
                        rackSelectInstance.setValue(String(matchingRack.RackID));
                        console.log('[LocationManager] ✅ Auto-selected rack:', matchingRack.RackID);
                    }

                    // Update layer dropdown
                    this.updateLayerOptions(matchingRack.RackID, rackLayersList);

                    // Find matching layer
                    const matchingLayer = rackLayersList.find(l =>
                        String(l.RackID) === String(matchingRack.RackID) &&
                        String(l.RackLayerNumber) === layerNum
                    );

                    if (matchingLayer && layerSelectInstance && typeof layerSelectInstance.setValue === 'function') {
                        setTimeout(() => {
                            layerSelectInstance.setValue(String(matchingLayer.RackLayerID));
                            console.log('[LocationManager] ✅ Auto-selected layer:', matchingLayer.RackLayerID);
                        }, 100);
                    }
                }
            }
        });

        // Clear dropdowns when direct input is cleared
        directInput.addEventListener('blur', () => {
            if (!directInput.value) {
                console.log('[LocationManager] Direct input cleared, resetting dropdowns');
            }
        });
    },

    // ===================================================
    // ✅ INIT SEARCHABLE SELECTS
    // ===================================================
    initSearchableSelects: function(racksList, rackLayersList, employeesList, defaultRackId) {
        console.log('[LocationManager] Initializing searchable selects...');

        // Check if createSearchableSelect exists
        if (typeof window.createSearchableSelect !== 'function') {
            console.error('[LocationManager] window.createSearchableSelect() not found!');
            alert('Lỗi: Không tìm thấy hàm tạo dropdown tìm kiếm. Vui lòng kiểm tra file checkin-checkout-r7.0.9.js');
            return;
        }

        // ========== 1. RACK SELECT ==========
        const rackContainer = document.getElementById('rack-select-container');
        if (rackContainer) {
            const rackOptions = racksList.map(r => ({
                id: String(r.RackID),
                name: `${r.RackSymbol || r.RackNumber || 'Giá ' + r.RackID} - ${r.RackLocation || ''}`
            }));

            rackSelectInstance = window.createSearchableSelect(
                'loc-rack',
                rackOptions,
                (selectedRackId) => {
                    console.log('[LocationManager] Rack selected:', selectedRackId);

                    // ✅ CASCADE: When select Rack → Reload Layer list
                    this.updateLayerOptions(selectedRackId, rackLayersList);

                    // ✅ Update direct input hint
                    const selectedRack = racksList.find(r => String(r.RackID) === String(selectedRackId));
                    if (selectedRack) {
                        const directInput = document.getElementById('loc-direct-id');
                        if (directInput) {
                            const rackNum = selectedRack.RackNumber || selectedRack.RackSymbol || selectedRackId;
                            directInput.placeholder = `例: ${rackNum}1 (棚${rackNum}・段1) / Ví dụ: ${rackNum}1 (Giá ${rackNum}, Tầng 1)`;
                        }
                    }
                }
            );
            rackContainer.appendChild(rackSelectInstance);

            // Set default value if exists
            if (defaultRackId && typeof rackSelectInstance.setValue === 'function') {
                rackSelectInstance.setValue(String(defaultRackId));
                console.log('[LocationManager] Set default rack:', defaultRackId);
            }
        }

        // ========== 2. LAYER SELECT (initially empty) ==========
        const layerContainer = document.getElementById('layer-select-container');
        if (layerContainer) {
            layerSelectInstance = window.createSearchableSelect(
                'loc-layer',
                [], // Initially empty, will load after selecting Rack
                (selectedLayerId) => {
                    console.log('[LocationManager] Layer selected:', selectedLayerId);

                    // ✅ Update direct input
                    const selectedLayer = rackLayersList.find(l => String(l.RackLayerID) === String(selectedLayerId));
                    if (selectedLayer) {
                        const selectedRackId = selectedLayer.RackID;
                        const selectedRack = racksList.find(r => String(r.RackID) === String(selectedRackId));

                        if (selectedRack) {
                            const rackNum = selectedRack.RackNumber || selectedRack.RackSymbol || selectedRackId;
                            const layerNum = selectedLayer.RackLayerNumber;
                            const directInput = document.getElementById('loc-direct-id');
                            if (directInput) {
                                directInput.value = `${rackNum}${layerNum}`;
                                console.log('[LocationManager] ✅ Updated direct input:', `${rackNum}${layerNum}`);
                            }
                        }
                    }
                }
            );
            layerContainer.appendChild(layerSelectInstance);

            // Load layers for current rack if exists
            if (defaultRackId) {
                this.updateLayerOptions(defaultRackId, rackLayersList);
            }
        }

        // ========== 3. EMPLOYEE SELECT ==========
        const employeeContainer = document.getElementById('employee-select-container');
        if (employeeContainer) {
            const employeeOptions = employeesList.map(e => ({
                id: String(e.EmployeeID),
                name: e.EmployeeName || e.name || `EMP-${e.EmployeeID}`
            }));

            employeeSelectInstance = window.createSearchableSelect(
                'loc-employee',
                employeeOptions,
                (selectedEmpId) => {
                    console.log('[LocationManager] Employee selected:', selectedEmpId);
                }
            );
            employeeContainer.appendChild(employeeSelectInstance);

            // Auto-select first employee
            if (employeesList.length > 0 && typeof employeeSelectInstance.setValue === 'function') {
                employeeSelectInstance.setValue(String(employeesList[0].EmployeeID));
            }
        }

        console.log('[LocationManager] ✅ Searchable selects initialized');
    },

    // ===================================================
    // ✅ UPDATE LAYER OPTIONS WHEN RACK SELECTED
    // ===================================================
    updateLayerOptions: function(rackId, rackLayersList) {
        console.log('[LocationManager] Updating layer options for rack:', rackId);

        if (!layerSelectInstance) {
            console.warn('[LocationManager] layerSelectInstance not found');
            return;
        }

        // Filter layers belonging to selected rack
        const filteredLayers = rackLayersList.filter(layer =>
            String(layer.RackID) === String(rackId)
        );

        console.log('[LocationManager] Filtered layers:', filteredLayers.length);

        // Create new options
        const layerOptions = filteredLayers.map(layer => ({
            id: String(layer.RackLayerID),
            name: layer.RackLayerNumber || `Tầng ${layer.RackLayerID}`
        }));

        // ✅ Recreate dropdown with new options
        const layerContainer = document.getElementById('layer-select-container');
        if (layerContainer) {
            // Remove old instance
            layerContainer.innerHTML = '';

            // Create new instance with new options
            layerSelectInstance = window.createSearchableSelect(
                'loc-layer',
                layerOptions,
                (selectedLayerId) => {
                    console.log('[LocationManager] Layer selected:', selectedLayerId);

                    // ✅ Update direct input
                    const selectedLayer = rackLayersList.find(l => String(l.RackLayerID) === String(selectedLayerId));
                    if (selectedLayer) {
                        const selectedRack = window.DataManager?.data?.racks?.find(r => String(r.RackID) === String(rackId));
                        if (selectedRack) {
                            const rackNum = selectedRack.RackNumber || selectedRack.RackSymbol || rackId;
                            const layerNum = selectedLayer.RackLayerNumber;
                            const directInput = document.getElementById('loc-direct-id');
                            if (directInput) {
                                directInput.value = `${rackNum}${layerNum}`;
                            }
                        }
                    }
                }
            );
            layerContainer.appendChild(layerSelectInstance);

            // Auto-select first layer if exists
            if (layerOptions.length > 0 && typeof layerSelectInstance.setValue === 'function') {
                layerSelectInstance.setValue(layerOptions[0].id);
            }
        }

        console.log('[LocationManager] ✅ Layer options updated:', layerOptions.length);
    },

    // ===================================================
    // BIND MODAL EVENTS
    // ===================================================
    bindModalEvents: function(item, racksList, rackLayersList, employeesList) {
        // Close button
        const closeBtn = document.getElementById('btn-close-location');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Cancel button
        const cancelBtn = document.getElementById('btn-cancel-location');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }

        // Refresh button
        const refreshBtn = document.getElementById('loc-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.classList.add('spinning');

                try {
                    await window.DataManager.loadAllData();
                    await this.refreshHistoryInPlace(item);
                    this.showBilingualToast('refreshed');
                } catch (err) {
                    console.error('[LocationManager] Refresh error:', err);
                    this.showBilingualToast('error');
                } finally {
                    refreshBtn.disabled = false;
                    refreshBtn.classList.remove('spinning');
                }
            });
        }

        // Confirm button
        const confirmBtn = document.getElementById('btn-confirm-location');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                await this.saveRecord(item, racksList, rackLayersList, employeesList);
            });
        }

        console.log('[LocationManager] Modal events bound');
    },

    // ===================================================
    // ✅ BIND LOCK/UNLOCK TOGGLE
    // ===================================================
    bindLockToggle: function() {
        const toggleBtn = document.getElementById('loc-lock-toggle');
        const historyTable = document.querySelector('#loc-his');

        if (!toggleBtn || !historyTable) {
            console.warn('[LocationManager] Lock toggle button or history table not found');
            return;
        }

        // Set initial state
        const isUnlocked = isHistoryUnlocked();
        if (isUnlocked) {
            historyTable.classList.remove('history-locked');
            historyTable.classList.add('history-unlocked');
            toggleBtn.innerHTML = '<span class="lock-text">🔓 Unlock</span>';
        } else {
            historyTable.classList.remove('history-unlocked');
            historyTable.classList.add('history-locked');
            toggleBtn.innerHTML = '<span class="lock-text">🔒 Lock</span>';
        }

        // Toggle on click
        toggleBtn.addEventListener('click', () => {
            const currentUnlocked = historyTable.classList.contains('history-unlocked');

            if (currentUnlocked) {
                // Lock
                historyTable.classList.remove('history-unlocked');
                historyTable.classList.add('history-locked');
                toggleBtn.innerHTML = '<span class="lock-text">🔒 Lock</span>';
                setHistoryUnlocked(false);
                console.log('[LocationManager] History table LOCKED (4 columns)');
            } else {
                // Unlock
                historyTable.classList.remove('history-locked');
                historyTable.classList.add('history-unlocked');
                toggleBtn.innerHTML = '<span class="lock-text">🔓 Unlock</span>';
                setHistoryUnlocked(true);
                console.log('[LocationManager] History table UNLOCKED (6 columns)');
            }
        });

        console.log('[LocationManager] ✅ Lock toggle bound, initial state:', isUnlocked ? 'UNLOCKED' : 'LOCKED');
    },

    // ===================================================
    // RENDER HISTORY TABLE
    // ===================================================
    renderHistory: function(logs, racksList, rackLayersList, employeesList, showActions = false) {
        if (!logs || logs.length === 0) {
            return `<div class="no-history">📭 履歴がありません / Chưa có lịch sử</div>`;
        }

        const lockClass = showActions ? 'history-unlocked' : 'history-locked';

        const rows = logs.map(log => {
            const time = this.fmtDateTime(log.DateEntry);

            // Old Rack-Layer
            const oldRackLayer = rackLayersList.find(rl =>
                String(rl.RackLayerID) === String(log.OldRackLayer)
            );
            const oldRack = racksList.find(r =>
                String(r.RackID) === String(oldRackLayer?.RackID)
            );
            const oldDisplay = oldRack?.RackSymbol || oldRack?.RackNumber || log.OldRackLayer || '-';
            const oldLayerNum = oldRackLayer?.RackLayerNumber || '';

            // New Rack-Layer
            const newRackLayer = rackLayersList.find(rl =>
                String(rl.RackLayerID) === String(log.NewRackLayer)
            );
            const newRack = racksList.find(r =>
                String(r.RackID) === String(newRackLayer?.RackID)
            );
            const newDisplay = newRack?.RackSymbol || newRack?.RackNumber || log.NewRackLayer || '-';
            const newLayerNum = newRackLayer?.RackLayerNumber || '';

            // Employee name
            const empName = this.getEmployeeName(log.EmployeeID || log.Employee, employeesList);

            // Notes
            const notes = log.LocationNotes || log.notes || '-';

            // Sync status
            const isPending = log.pending === true;
            const hasError = !!log.syncError;
            let syncClass = 'sync-dot synced';
            let syncTitle = '同期済み / Đã đồng bộ';
            let syncIcon = '✅';

            if (hasError) {
                syncClass = 'sync-dot error';
                syncTitle = `エラー: ${log.syncError}`;
                syncIcon = '⚠️';
            } else if (isPending) {
                syncClass = 'sync-dot pending';
                syncTitle = '同期中 / Đang đồng bộ...';
                syncIcon = '🔄';
            }

            const syncTd = showActions 
                ? `<td class="col-sync"><span class="${syncClass}" title="${syncTitle}">${syncIcon}</span></td>`
                : '';

            const deleteTd = showActions && !isPending && !hasError
                ? `<td class="col-delete action-cell"><button class="btn-delete-history" data-log-id="${log.LogID || ''}" data-time="${encodeURIComponent(log.DateEntry || '')}" title="削除 / Xóa">❌</button></td>`
                : (showActions ? '<td class="col-delete action-cell"></td>' : '');

            const rowClass = isPending ? 'row-pending' : '';

            return `
            <tr data-log-id="${log.LogID || log.localId}" class="${rowClass}">
                <td data-time="${log.DateEntry}">${time}</td>
                <td>
                    <span class="location-badge old-location">${this.escapeHtml(oldDisplay)}-${this.escapeHtml(oldLayerNum)}</span>
                    →
                    <span class="location-badge new-location">${this.escapeHtml(newDisplay)}-${this.escapeHtml(newLayerNum)}</span>
                </td>
                <td>${this.escapeHtml(empName)}</td>
                <td class="note-cell">${this.escapeHtml(notes)}</td>
                ${syncTd}
                ${deleteTd}
            </tr>
            `;
        }).join('');

        return `
        <table class="location-history-table ${lockClass}" id="loc-his">
            <thead>
                <tr>
                    <th data-sort="time">日時 / Thời gian</th>
                    <th data-sort="location">移動 / Di chuyển</th>
                    <th data-sort="emp">担当者 / NV</th>
                    <th data-sort="note">メモ / Ghi chú</th>
                    ${showActions ? '<th>同期 / Sync</th>' : ''}
                    ${showActions ? '<th>削除 / Xóa</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
        `;
    },

    // ===================================================
    // REFRESH HISTORY IN PLACE
    // ===================================================
    async refreshHistoryInPlace(item) {
        const tbody = document.querySelector('#loc-his tbody');
        if (!tbody) {
            console.warn('[LocationManager] History table not found, skipping refresh');
            return;
        }

        console.log(`[LocationManager] 🔄 Refreshing history IN-PLACE for item:`, item);

        const allLogs = window.DataManager?.data?.locationlog || [];
        const racksList = window.DataManager?.data?.racks || [];
        const rackLayersList = window.DataManager?.data?.racklayers || [];
        const employeesList = window.DataManager?.data?.employees || [];

        // Filter logs for this item
        const historyLogs = allLogs.filter(l => {
            const moldMatch = item.MoldID && String(l.MoldID).trim() === String(item.MoldID).trim();
            const cutterMatch = item.CutterID && String(l.CutterID).trim() === String(item.CutterID).trim();
            return moldMatch || cutterMatch;
        });

        // Sort by current sortColumn/sortOrder
        historyLogs.sort((a, b) => {
            let valA, valB;
            switch (sortColumn) {
                case 'time':
                case 'DateEntry':
                    valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
                    valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
                    break;
                case 'emp':
                    valA = String(a.EmployeeName || a.EmployeeID || a.Employee || '').toLowerCase();
                    valB = String(b.EmployeeName || b.EmployeeID || b.Employee || '').toLowerCase();
                    break;
                case 'note':
                    valA = String(a.LocationNotes || a.notes || '').toLowerCase();
                    valB = String(b.LocationNotes || b.notes || '').toLowerCase();
                    break;
                default:
                    valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
                    valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
                    break;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        console.log('[LocationManager] 📊 Refresh counts:', {
            total: historyLogs.length
        });

        if (historyLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1rem;color:#888;">履歴がありません<br>Chưa có lịch sử</td></tr>';
            return;
        }

        const showActions = isHistoryUnlocked();

        // Rebuild rows
        const rows = historyLogs.map(log => {
            const time = this.fmtDateTime(log.DateEntry);

            const oldRackLayer = rackLayersList.find(rl => String(rl.RackLayerID) === String(log.OldRackLayer));
            const oldRack = racksList.find(r => String(r.RackID) === String(oldRackLayer?.RackID));
            const oldDisplay = oldRack?.RackSymbol || oldRack?.RackNumber || log.OldRackLayer || '-';
            const oldLayerNum = oldRackLayer?.RackLayerNumber || '';

            const newRackLayer = rackLayersList.find(rl => String(rl.RackLayerID) === String(log.NewRackLayer));
            const newRack = racksList.find(r => String(r.RackID) === String(newRackLayer?.RackID));
            const newDisplay = newRack?.RackSymbol || newRack?.RackNumber || log.NewRackLayer || '-';
            const newLayerNum = newRackLayer?.RackLayerNumber || '';

            const empName = this.getEmployeeName(log.EmployeeID || log.Employee, employeesList);
            const notes = log.LocationNotes || log.notes || '-';

            const isPending = log.pending === true;
            const hasError = !!log.syncError;
            let syncClass = 'sync-dot synced', syncTitle = '同期済み / Đã đồng bộ', syncIcon = '✅';

            if (hasError) {
                syncClass = 'sync-dot error';
                syncTitle = `エラー: ${log.syncError}`;
                syncIcon = '⚠️';
            } else if (isPending) {
                syncClass = 'sync-dot pending';
                syncTitle = '同期中 / Đang đồng bộ...';
                syncIcon = '🔄';
            }

            const syncTd = showActions 
                ? `<td class="col-sync"><span class="${syncClass}" title="${syncTitle}">${syncIcon}</span></td>`
                : '';

            const deleteTd = showActions && !isPending && !hasError
                ? `<td class="col-delete action-cell"><button class="btn-delete-history" data-log-id="${log.LogID || ''}" data-time="${encodeURIComponent(log.DateEntry || '')}" title="削除 / Xóa">❌</button></td>`
                : (showActions ? '<td class="col-delete action-cell"></td>' : '');

            return `
            <tr data-log-id="${log.LogID || log.localId}" class="${isPending ? 'row-pending' : ''}">
                <td data-time="${log.DateEntry}">${time}</td>
                <td>
                    <span class="location-badge old-location">${this.escapeHtml(oldDisplay)}-${this.escapeHtml(oldLayerNum)}</span>
                    →
                    <span class="location-badge new-location">${this.escapeHtml(newDisplay)}-${this.escapeHtml(newLayerNum)}</span>
                </td>
                <td>${this.escapeHtml(empName)}</td>
                <td class="note-cell">${this.escapeHtml(notes)}</td>
                ${syncTd}
                ${deleteTd}
            </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;

        if (showActions) {
            this.bindDeleteHistoryEvents(item);
        }

        console.log('[LocationManager] 📊 Refreshed', historyLogs.length, 'history rows in place');
    },

    // ===================================================
    // SAVE RECORD - Handle location update
    // ===================================================
    async saveRecord(item, racksList, rackLayersList, employeesList) {
        console.log('[LocationManager] 💾 Save record triggered');

        // Get selected values
        let newRackLayerId = null;

        // Priority 1: Direct input (if filled)
        const directInput = document.getElementById('loc-direct-id');
        if (directInput && directInput.value) {
            const directValue = directInput.value;
            const layerNum = directValue.slice(-1);
            const rackNum = directValue.slice(0, -1);

            // Find matching rack
            const matchingRack = racksList.find(r => 
                String(r.RackNumber) === rackNum || 
                String(r.RackSymbol) === rackNum ||
                String(r.RackID) === rackNum
            );

            if (matchingRack) {
                // Find matching layer
                const matchingLayer = rackLayersList.find(l =>
                    String(l.RackID) === String(matchingRack.RackID) &&
                    String(l.RackLayerNumber) === layerNum
                );

                if (matchingLayer) {
                    newRackLayerId = matchingLayer.RackLayerID;
                    console.log('[LocationManager] ✅ Using direct input:', directValue, '→ RackLayerID:', newRackLayerId);
                } else {
                    alert(`⚠️ Không tìm thấy tầng ${layerNum} trong giá ${rackNum}\n⚠️ 段${layerNum}が棚${rackNum}に見つかりません`);
                    return;
                }
            } else {
                alert(`⚠️ Không tìm thấy giá số ${rackNum}\n⚠️ 棚${rackNum}が見つかりません`);
                return;
            }
        }

        // Priority 2: Dropdown selection
        if (!newRackLayerId) {
            const layerInput = document.querySelector('#loc-layer');
            if (layerInput) {
                newRackLayerId = layerInput.value;
            }
        }

        // Validate
        if (!newRackLayerId) {
            alert('⚠️ Vui lòng chọn vị trí mới (Giá-Tầng)\n⚠️ 新しい位置（棚・段）を選択してください');
            return;
        }

        const selectedEmployeeId = document.querySelector('#loc-employee')?.value;
        if (!selectedEmployeeId) {
            alert('⚠️ Vui lòng chọn nhân viên\n⚠️ 担当者を選択してください');
            return;
        }

        const noteValue = document.getElementById('loc-note')?.value || '';

        // Check if new location is same as old
        if (String(newRackLayerId) === String(currentOldRackLayerID)) {
            const confirmChange = confirm(
                '⚠️ Vị trí mới giống vị trí cũ. Bạn có chắc chắn muốn tiếp tục?\n' +
                '⚠️ 新しい位置は古い位置と同じです。続行しますか？'
            );
            if (!confirmChange) return;
        }

        // ===== PREPARE DATA =====
        let targetItem = item || currentItem;
        if (!targetItem || (!targetItem.MoldID && !targetItem.CutterID)) {
            alert('❌ Lỗi: Không tìm thấy ID của thiết bị.\n❌ エラー：デバイスIDが見つかりません。');
            console.error('[LocationManager] ❌ saveRecord: item invalid', targetItem);
            return;
        }

        // ✅ FIX: Support both Mold and Cutter
        const itemId = targetItem.MoldID || targetItem.CutterID;
        const itemType = targetItem.MoldID ? 'mold' : 'cutter';
        const nowIso = new Date().toISOString();

        // Build location entry
        const locationEntry = {
            MoldID: targetItem.MoldID || null,
            CutterID: targetItem.CutterID || null,
            OldRackLayer: currentOldRackLayerID,
            NewRackLayer: newRackLayerId,
            Employee: selectedEmployeeId,
            notes: noteValue,
            EmployeeID: selectedEmployeeId,
            LocationNotes: noteValue,
            DateEntry: nowIso,
        };

        console.log('[LocationManager] Location entry:', locationEntry);

        // ===== STEP 1: OPTIMISTIC UPDATE =====
        this.showBilingualToast('processing');
        const pendingLog = LocationCache.add(locationEntry);
        console.log('[LocationManager] Added to cache:', pendingLog.localId);

        // ===== STEP 2: CLOSE MODAL IMMEDIATELY =====
        isClosingAfterSave = true;
        this.close();

        // Event 1: Update detail & close MobileDetailModal
        document.dispatchEvent(new CustomEvent('location-updated', {
            detail: {
                item: targetItem,
                success: true,
                oldRackLayer: currentOldRackLayerID,
                newRackLayer: newRackLayerId,
                timestamp: nowIso
            }
        }));

        // Event 2: Keep for backward compatibility
        document.dispatchEvent(new CustomEvent('location-completed', {
            detail: {
                item: targetItem,
                success: true,
                oldRackLayer: currentOldRackLayerID,
                newRackLayer: newRackLayerId,
                timestamp: nowIso
            }
        }));

        // Dispatch event to update badge
        document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: {
                item: { ...targetItem, currentRackLayer: newRackLayerId },
                itemType: itemType,
                itemId: itemId,
                source: 'location-pending'
            }
        }));

        console.log('[LocationManager] Dispatched location-updated & location-completed events');

        // Reset flag
        setTimeout(() => {
            isClosingAfterSave = false;
        }, 100);

        // ===== STEP 3: BACKGROUND SYNC =====
        setTimeout(async () => {
            try {
                await this.syncToGitHub(locationEntry, pendingLog.localId, itemId, newRackLayerId, itemType);
            } catch (err) {
                console.error('[LocationManager] Sync error:', err);
            }
        }, 100);
    },

    // ===================================================
    // SYNC TO GITHUB - BACKGROUND
    // ===================================================
    async syncToGitHub(data, localId, itemId, newRackLayerId, itemType) {
        console.log('[LocationManager] Starting background sync...', localId);

        try {
            // STEP 1: POST TO GITHUB VIA SERVER
            const payload = {
                MoldID: data.MoldID || null,
                CutterID: data.CutterID || null,
                OldRackLayer: data.OldRackLayer,
                NewRackLayer: data.NewRackLayer,
                notes: data.notes || data.LocationNotes || '',
                Employee: data.Employee || data.EmployeeID,
                DateEntry: data.DateEntry,
            };

            const res = await fetch(GITHUB_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const rj = await res.json();

            if (!rj.success) {
                throw new Error(rj.message || 'Server error');
            }

            console.log('[LocationManager] GitHub sync SUCCESS');

            // STEP 2: REMOVE PENDING LOG FROM CACHE
            LocationCache.remove(localId);
            console.log('[LocationManager] Removed pending log from cache:', localId);

            // STEP 3: ADD REAL LOG TO LOCATIONLOG ARRAY
            const realLog = {
                LogID: rj.logId || Date.now(),
                MoldID: data.MoldID || null,
                CutterID: data.CutterID || null,
                OldRackLayer: data.OldRackLayer,
                NewRackLayer: data.NewRackLayer,
                Employee: data.Employee || data.EmployeeID,
                notes: data.notes || data.LocationNotes || '',
                EmployeeID: data.EmployeeID || data.Employee,
                LocationNotes: data.LocationNotes || data.notes || '',
                DateEntry: data.DateEntry,
                synced: true,
            };

            // Check duplicate before adding
            const exists = window.DataManager?.data?.locationlog?.some(log =>
                log.DateEntry === realLog.DateEntry &&
                ((realLog.MoldID && String(log.MoldID).trim() === String(realLog.MoldID).trim()) ||
                 (realLog.CutterID && String(log.CutterID).trim() === String(realLog.CutterID).trim()))
            );

            if (!exists) {
                window.DataManager.data.locationlog.unshift(realLog);
                console.log('[LocationManager] Added real log to locationlog array');
            } else {
                console.log('[LocationManager] Log already exists, skipping');
            }

            // STEP 4: UPDATE CURRENTRACKLAYER IN MOLDS OR CUTTERS
            if (itemType === 'mold') {
                const mold = window.DataManager?.data?.molds?.find(m =>
                    String(m.MoldID).trim() === String(itemId).trim()
                );
                if (mold) {
                    mold.currentRackLayer = newRackLayerId;
                    mold.RackLayerID = newRackLayerId;
                    console.log('[LocationManager] Updated mold currentRackLayer:', newRackLayerId);
                }
            } else if (itemType === 'cutter') {
                const cutter = window.DataManager?.data?.cutters?.find(c =>
                    String(c.CutterID).trim() === String(itemId).trim()
                );
                if (cutter) {
                    cutter.currentRackLayer = newRackLayerId;
                    cutter.RackLayerID = newRackLayerId;
                    console.log('[LocationManager] Updated cutter currentRackLayer:', newRackLayerId);
                }
            }

            // STEP 5: REFRESH HISTORY TABLE IF STILL OPEN
            const historyBody = document.querySelector('#loc-his tbody');
            if (historyBody && currentItem) {
                console.log('[LocationManager] Refreshing history table...');
                await this.refreshHistoryInPlace(currentItem);
                console.log('[LocationManager] History table refreshed');
            }

            // STEP 6: DISPATCH EVENT UPDATE BADGE
            if (currentItem && 
                ((itemType === 'mold' && String(currentItem.MoldID) === String(itemId)) ||
                 (itemType === 'cutter' && String(currentItem.CutterID) === String(itemId)))) {
                document.dispatchEvent(new CustomEvent('detail:changed', {
                    detail: {
                        item: { ...currentItem, currentRackLayer: newRackLayerId },
                        itemType: itemType,
                        itemId: itemId,
                        source: 'location-synced'
                    }
                }));
                console.log('[LocationManager] Dispatched detail:changed event');
            }

            // STEP 7: TOAST SUCCESS
            this.showBilingualToast('success');
            console.log('[LocationManager] Sync completed successfully');

        } catch (err) {
            console.error('[LocationManager] Sync error:', err);

            // Mark error in PendingCache
            LocationCache.markError(localId, err.message);

            // Refresh UI to show error state
            const historyBody = document.querySelector('#loc-his tbody');
            if (historyBody && currentItem) {
                await this.refreshHistoryInPlace(currentItem);
            }

            // Toast error
            this.showBilingualToast('error');

            // Retry after 30s
            console.log('[LocationManager] Will retry sync after 30s...');
            setTimeout(() => {
                const pendingLogs = window.DataManager?.data?.locationlog?.filter(l => l.pending && l.localId === localId);
                if (pendingLogs && pendingLogs.length > 0) {
                    console.log('[LocationManager] Retrying sync for:', localId);
                    this.syncToGitHub(data, localId, itemId, newRackLayerId, itemType);
                }
            }, 30000);
        }
    },

    // ===================================================
    // BIND DELETE HISTORY EVENTS
    // ===================================================
    bindDeleteHistoryEvents: function(item) {
        const buttons = document.querySelectorAll('.btn-delete-history');
        const self = this;

        buttons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();

                const logId = btn.getAttribute('data-log-id');
                const timestamp = btn.getAttribute('data-time');

                if (!confirm('Bạn chắc chắn muốn xóa? / 削除しますか？')) return;

                const row = btn.closest('tr');
                if (row) row.classList.add('deleting');

                self.showBilingualToast('deleting');

                try {
                    const itemId = item.MoldID || item.CutterID;
                    const itemType = item.MoldID ? 'MoldID' : 'CutterID';

                    const res = await fetch('https://ysd-moldcutter-backend.onrender.com/api/deletelocationlog', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            [itemType]: itemId,
                            Timestamp: decodeURIComponent(timestamp || '')
                        })
                    });

                    const rj = await res.json();

                    if (rj.success) {
                        console.log('[LocationManager] ✅ Deleted from server:', logId);

                        if (window.DataManager?.data?.locationlog) {
                            const beforeLen = window.DataManager.data.locationlog.length;
                            const timestampToDelete = decodeURIComponent(timestamp || '');

                            window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(
                                l => l.DateEntry !== timestampToDelete
                            );

                            const afterLen = window.DataManager.data.locationlog.length;
                            console.log('[LocationManager] 🗑 Removed from local:', beforeLen - afterLen, 'rows');

                            if (beforeLen === afterLen) {
                                console.warn('[LocationManager] ⚠️ Failed to remove from local! Timestamp:', timestampToDelete);
                            }
                        }

                        if (row) {
                            row.remove();
                            console.log('[LocationManager] 🔄 History row removed from UI');
                        }

                        self.showBilingualToast('deleted');

                        setTimeout(async () => {
                            try {
                                const historyBody = document.querySelector('#loc-his tbody');
                                if (historyBody && currentItem) {
                                    await self.refreshHistoryInPlace(currentItem);
                                    console.log('[LocationManager] ✅ History table refreshed (no GitHub reload)');
                                }

                                if (currentItem) {
                                    document.dispatchEvent(new CustomEvent('detail:changed', {
                                        detail: {
                                            item: currentItem,
                                            itemType: item.MoldID ? 'mold' : 'cutter',
                                            itemId: itemId,
                                            source: 'location-delete'
                                        }
                                    }));
                                }
                            } catch (err) {
                                console.warn('[LocationManager] Refresh failed:', err);
                            }
                        }, 500);
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

    // ===================================================
    // ENABLE SORT
    // ===================================================
    enableSort: function() {
        const headers = document.querySelectorAll('#loc-his th[data-sort]');

        headers.forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const column = th.getAttribute('data-sort');

                if (sortColumn === column) {
                    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = column;
                    sortOrder = 'desc';
                }

                // Remove all sort classes
                headers.forEach(h => {
                    h.classList.remove('asc', 'desc');
                });

                // Add current sort class
                th.classList.add(sortOrder);

                console.log('[LocationManager] Sort by:', sortColumn, sortOrder);

                // Re-render history
                if (currentItem) {
                    this.refreshHistoryInPlace(currentItem);
                }
            });
        });

        console.log('[LocationManager] Sort enabled');
    },

    // ===================================================
    // ENABLE FILTER
    // ===================================================
    enableFilter: function() {
        const searchInput = document.getElementById('loc-search');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#loc-his tbody tr');

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });

        console.log('[LocationManager] Filter enabled');
    },

    // ===================================================
    // CLOSE MODAL
    // ===================================================
    close: function() {
        const panel = document.getElementById('loc-panel');
        if (panel) {
            panel.remove();
            console.log('[LocationManager] Panel closed');
        }

        // Remove modal-open class on mobile
        document.body.classList.remove('modal-open');

        // If closing after save, don't dispatch cancel event
        if (isClosingAfterSave) {
            console.log('[LocationManager] Closed after save, skipping cancel event');
            return;
        }

        console.log('[LocationManager] Modal closed');
    },

    // ===================================================
    // HELPER: Format DateTime
    // ===================================================
    fmtDateTime: function(isoStr) {
        if (!isoStr) return '-';
        try {
            const d = new Date(isoStr);
            const MM = String(d.getMonth() + 1).padStart(2, '0');
            const DD = String(d.getDate()).padStart(2, '0');
            const HH = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${MM}/${DD} ${HH}:${mm}`;
        } catch (e) {
            return '-';
        }
    },

    // ===================================================
    // HELPER: Get Employee Name
    // ===================================================
    getEmployeeName: function(empId, employeesList) {
        if (!empId) return '-';
        const emp = employeesList.find(e => String(e.EmployeeID) === String(empId));
        return emp?.EmployeeName || emp?.name || `EMP-${empId}`;
    },

    // ===================================================
    // HELPER: Escape HTML
    // ===================================================
    escapeHtml: function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // ===================================================
    // SHOW BILINGUAL TOAST
    // ===================================================
    showBilingualToast: function(type) {
        const messages = {
            processing: {
                text: '処理中... / Đang xử lý...',
                class: 'loc-toast-info'
            },
            success: {
                text: '✅ 更新成功 / Cập nhật thành công',
                class: 'loc-toast-success'
            },
            error: {
                text: '❌ エラーが発生しました / Có lỗi xảy ra',
                class: 'loc-toast-error'
            },
            refreshed: {
                text: '🔄 データを更新しました / Đã làm mới dữ liệu',
                class: 'loc-toast-success'
            },
            deleting: {
                text: '🗑️ 削除中... / Đang xóa...',
                class: 'loc-toast-info'
            },
            deleted: {
                text: '✅ 削除成功 / Xóa thành công',
                class: 'loc-toast-success'
            }
        };

        const config = messages[type] || messages.error;

        // Remove existing toasts
        document.querySelectorAll('.loc-toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `loc-toast ${config.class}`;
        toast.textContent = config.text;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// ===================================================
// AUTO-INIT ON DOM READY
// ===================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        LocationManager.INIT();
    });
} else {
    LocationManager.INIT();
}

// Export to window
window.LocationManager = LocationManager;

console.log('✅ LocationManager R7.0.9 loaded successfully');
