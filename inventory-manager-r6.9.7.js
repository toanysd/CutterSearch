/* ========================================================================
   INVENTORY MANAGER R6.9.5
   ========================================================================
   Quản lý toàn diện chức năng kiểm kê (棚卸 | Inventory Management)
   
   Features:
   - Toggle ON/OFF linh hoạt (iPad: direct toggle, iPhone: via settings)
   - Settings popup với filters nâng cao (Giá/Tầng, Loại, Sắp xếp)
   - Badge "ON" trên nút khi đang bật chế độ kiểm kê
   - Badge kiểm kê trên result cards (ngày + màu xanh nếu kiểm kê hôm nay)
   - Công cụ kiểm kê hàng loạt (Floating icon + Checkbox selection)
   - Tích hợp với CheckInOut và LocationUpdate modules
   
   Created: 2025-11-11
   Last Updated: 2025-11-11
   ======================================================================== */

(function() {
    'use strict';

    // ========================================
    // GLOBAL STATE
    // ========================================
    window.InventoryState = {
        active: false,              // Kiểm kê đang bật
        operator: null,             // Nhân viên thực hiện (EmployeeID)
        operatorName: null,         // Tên nhân viên
        autoClose: true,            // Tự đóng popup sau khi kiểm kê
        sortBy: 'code',             // 'code' | 'rack'
        sortEnabled: false,          // Enable/Disable sorting
        filterRack: null,           // RackID được chọn
        filterLayer: null,          // LayerNum được chọn
        filterType: 'all',          // 'mold' | 'cutter' | 'all'
        bulkMode: false,            // Chế độ kiểm kê hàng loạt
        selectedItems: [],          // Danh sách items được chọn (bulk mode)
        auditHistory: {},           // Cache lịch sử kiểm kê {itemId: lastDate}
        // Lưu/khôi phục cấu hình
        persistKey: 'inventory.settings.v1'
    };

    // ========================================
    // INVENTORY MANAGER CLASS
    // ========================================
    window.InventoryManager = {
        
        /**
         * Khởi tạo
         */
        init() {
            console.log('[InventoryManager] 🚀 Initializing...');
            
            // Load audit history từ localStorage
            this.loadAuditHistory();
            
            // Bind events
            this.bindEvents();
            
            // Set default operator (グエン　ダン　トアン)
            this.setDefaultOperator();

            this.loadSettingsFromStorage();
            this.renderMenubarToggle();

            
            console.log('[InventoryManager] ✅ Initialized');
        },

        /**
         * Set nhân viên mặc định: グエン　ダン　トアン
         */
        setDefaultOperator() {
            const employees = window.DataManager?.data?.employees || [];
            const def = employees.find(e => String(e.EmployeeID) === '1') || employees[0];
            if (def) {
                window.InventoryState.operator = def.EmployeeID;
                window.InventoryState.operatorName = def.EmployeeName || String(def.EmployeeID);
                console.log('[Inventory] Default operator by ID:', def.EmployeeID, def.EmployeeName);
            }
        },

        loadSettingsFromStorage() {
            try {
                const raw = localStorage.getItem(window.InventoryState.persistKey);
                if (!raw) return;
                const s = JSON.parse(raw);
                const st = window.InventoryState;
                st.operator = s.operator ?? st.operator;
                st.operatorName = s.operatorName ?? st.operatorName;
                st.autoClose = !!s.autoClose;
                st.sortBy = s.sortBy || 'code';
                st.sortEnabled = !!s.sortEnabled;
                st.filterRack = s.filterRack ?? null;
                st.filterLayer = s.filterLayer ?? null;
                st.filterType = s.filterType || 'all';
                st.bulkMode = !!s.bulkMode;
                st.active = !!s.active; // Khôi phục trạng thái ON/OFF
            } catch (e) {
                console.warn('[Inventory] loadSettings error', e);
            }
        },

        saveSettingsToStorage() {
            try {
                const st = window.InventoryState;
                const data = {
                operator: st.operator,
                operatorName: st.operatorName,
                autoClose: st.autoClose,
                sortBy: st.sortBy,
                sortEnabled: st.sortEnabled,
                filterRack: st.filterRack,
                filterLayer: st.filterLayer,
                filterType: st.filterType,
                bulkMode: st.bulkMode,
                active: st.active
                };
                localStorage.setItem(st.persistKey, JSON.stringify(data));
            } catch (e) {
                console.warn('[Inventory] saveSettings error', e);
            }
        },




        /**
         * Bind global events
         */
        bindEvents() {
            // Lắng nghe toggle từ action buttons
            document.addEventListener('inventory:toggle', (e) => {
                const forceOpen = e.detail?.open;
                
                if (forceOpen || !window.InventoryState.active) {
                    // Mở settings
                    this.openSettings();
                } else {
                    // Toggle OFF
                    this.toggleOff();
                }
            });

            // Lắng nghe inventory:completed (sau khi kiểm kê xong)
            document.addEventListener('inventory:completed', (e) => {
                const { itemId, itemType, date } = e.detail || {};
                this.recordAudit(itemId, itemType, date);
            });

            console.log('[InventoryManager] ✅ Events bound');
        },

        /**
         * Mở popup settings
         */
        openSettings() {
            console.log('[InventoryManager] 📋 Opening settings...');
            
            // Remove existing modal
            this.closeSettings();
            
            const html = this.renderSettingsModal();
            document.body.insertAdjacentHTML('beforeend', html);
            
            // Load data vào selects
            this.populateSettingsData();
            
            // Bind settings events
            this.bindSettingsEvents();
        },

        /**
         * Render settings modal HTML
         */
        renderSettingsModal() {
            const state = window.InventoryState;
            
            return `
                <div id="inventory-settings-overlay" class="inv-overlay">
                    <div id="inventory-settings-modal" class="inv-modal">

                        <div class="inv-modal-footer">
                            <button class="inv-btn inv-btn-secondary" id="inv-cancel-btn">
                                <i class="fas fa-times"></i>
                                キャンセル | Hủy
                            </button>
                            
                            <button class="inv-btn inv-btn-primary" id="inv-save-btn">
                                <i class="fas fa-save"></i>
                                保存 | Lưu
                            </button>
                        </div>



                        <div class="inv-modal-header">
                            <h3>棚卸設定 | Cài đặt kiểm kê</h3>
                            <button class="inv-close-btn" id="inv-close-settings">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div class="inv-modal-body">
                        
                            <div class="inv-modal-body">
                            <!-- ✅ TOGGLE ENABLE/DISABLE -->
                            <div class="inv-form-group inv-form-group-toggle">
                                <label class="inv-toggle-switch-label">
                                    <span class="inv-toggle-text">
                                        <i class="fas fa-power-off"></i>
                                        <strong>棚卸機能 | Tính năng kiểm kê</strong>
                                    </span>
                                    <label class="inv-toggle-switch">
                                        <input type="checkbox" id="inv-enable-toggle" ${state.active ? 'checked' : ''}>
                                        <span class="inv-toggle-slider"></span>
                                    </label>
                                </label>
                                <small class="inv-help-text">
                                    有効/無効を切り替え | Bật/Tắt chức năng kiểm kê
                                </small>
                            </div>
                            
                            <!-- Nhân viên -->
                            <div class="inv-form-group">

                            <!-- Nhân viên -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-user"></i>
                                    担当者 | Người thực hiện <span class="required">*</span>
                                </label>
                                <select id="inv-operator" class="inv-select">
                                    <option value="">選択してください | Chọn nhân viên</option>
                                </select>
                            </div>

                            <!-- Bộ lọc Giá -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-warehouse"></i>
                                    棚番号 | Giá
                                </label>
                                <select id="inv-rack" class="inv-select">
                                    <option value="">すべて | Tất cả</option>
                                </select>
                            </div>

                            <!-- Bộ lọc Tầng (cascade với Giá) -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-layer-group"></i>
                                    棚の段 | Tầng
                                </label>
                                <select id="inv-layer" class="inv-select" disabled>
                                    <option value="">すべて | Tất cả</option>
                                </select>
                            </div>

                            <!-- Bộ lọc Loại -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-filter"></i>
                                    タイプ | Loại
                                </label>
                                <select id="inv-type" class="inv-select">
                                    <option value="all" ${state.filterType === 'all' ? 'selected' : ''}>すべて | Tất cả</option>
                                    <option value="mold" ${state.filterType === 'mold' ? 'selected' : ''}>金型のみ | Chỉ khuôn</option>
                                    <option value="cutter" ${state.filterType === 'cutter' ? 'selected' : ''}>抜型のみ | Chỉ dao cắt</option>
                                </select>
                            </div>

                            <!-- Sắp xếp -->
                            <div class="inv-form-group">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-sort-enabled" ${state.sortEnabled ? 'checked' : ''}>
                                    <span>並び替え有効 | Bật sắp xếp</span>
                                </label>
                            </div>

                            <div class="inv-form-group" id="inv-sort-group" ${!state.sortEnabled ? 'style="display:none"' : ''}>
                                <label>
                                    <i class="fas fa-sort"></i>
                                    並び順 | Sắp xếp theo
                                </label>
                                <select id="inv-sort-by" class="inv-select" ${!state.sortEnabled ? 'disabled' : ''}>
                                    <option value="code" ${state.sortBy === 'code' ? 'selected' : ''}>コード順 | Theo mã</option>
                                    <option value="rack" ${state.sortBy === 'rack' ? 'selected' : ''}>棚位置順 | Theo vị trí giá</option>
                                </select>
                            </div>

                            <!-- Tự động đóng -->
                            <div class="inv-form-group">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-auto-close" ${state.autoClose ? 'checked' : ''}>
                                    <span>自動閉じる | Tự động đóng popup</span>
                                </label>
                            </div>

                            <!-- Công cụ kiểm kê hàng loạt -->
                            <div class="inv-form-group inv-form-group-highlight">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-bulk-mode" ${state.bulkMode ? 'checked' : ''}>
                                    <span>
                                        <i class="fas fa-boxes"></i>
                                        公具 一括棚卸 | Công cụ kiểm kê nhanh (hàng loạt)
                                    </span>
                                </label>
                                <small class="inv-help-text">
                                    複数項目を選択して一度に棚卸できます
                                    <br>
                                    Chọn nhiều mục và kiểm kê cùng lúc
                                </small>
                            </div>

                            <!-- Lưu cấu hình -->
                            <div class="inv-form-group inv-form-group-save">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-persist-settings" checked>
                                    <span>
                                        <i class="fas fa-save"></i>
                                        保存設定 | Lưu cấu hình cho lần sau
                                    </span>
                                </label>
                                <small class="inv-help-text">
                                    次回も同じ設定を使用します
                                    <br>
                                    Tự động áp dụng lại cấu hình khi mở lại
                                </small>
                            </div>

                        </div>
                        
                        
                    </div>
                </div>
            `;
        },

        /**
         * Populate data vào settings form
         */
        populateSettingsData() {
            const data = window.DataManager?.data || {};
            
            // Employees
            const operatorSelect = document.getElementById('inv-operator');
            if (operatorSelect) {
                (data.employees || []).forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp.EmployeeID;
                    option.textContent = emp.EmployeeName || emp.EmployeeID;
                    option.selected = emp.EmployeeID === window.InventoryState.operator;
                    operatorSelect.appendChild(option);
                });
            }

            // Racks
            const rackSelect = document.getElementById('inv-rack');
            if (rackSelect) {
                // ✅ Sắp xếp theo số (numerical sort)
                const racks = [...new Set((data.racklayers || []).map(r => r.RackID))]
                    .filter(Boolean)
                    .sort((a, b) => {
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        return numA - numB;
                    });
                
                racks.forEach(rackId => {

                    const option = document.createElement('option');
                    option.value = rackId;
                    option.textContent = `棚 ${rackId} | Giá ${rackId}`;
                    option.selected = rackId === window.InventoryState.filterRack;
                    rackSelect.appendChild(option);
                });
            }

            // Layers (populate khi chọn Rack)
            this.updateLayerOptions();
        },

        /**
         * Cập nhật options cho Layer select (cascade với Rack)
         */
        updateLayerOptions() {
            const rackId = document.getElementById('inv-rack')?.value;
            const layerSelect = document.getElementById('inv-layer');
            
            console.log('[Inventory] updateLayerOptions called, rackId:', rackId); // ✅ LOG
            
            if (!layerSelect) return;
            
            // Clear existing options
            layerSelect.innerHTML = '<option value="">すべて | Tất cả</option>';
            
            if (!rackId) {
                layerSelect.disabled = true;
                return;
            }
            
            layerSelect.disabled = false;
            
            // Get layers for selected rack
            const data = window.DataManager?.data;
            
            // ✅ FIX 1: So sánh loose và convert to String
            // ✅ FIX 2: Dùng RackLayerNumber thay vì LayerNum
            const layers = [...new Set(
                data.racklayers
                .filter(r => String(r.RackID) === String(rackId))
                .map(r => r.RackLayerNumber)  // ✅ ĐÚNG CỘT
            )].filter(Boolean).sort((a, b) => a - b);
            
            console.log('[Inventory] Found layers for rack', rackId, ':', layers); // ✅ LOG
            
            layers.forEach(layerNum => {
                const option = document.createElement('option');
                option.value = layerNum;
                option.textContent = `${layerNum} (層 | Tầng ${layerNum})`; // ✅ Song ngữ
                option.selected = (layerNum == window.InventoryState.filterLayer);
                layerSelect.appendChild(option);
            });
            },


        /**
         * Bind events cho settings form
         */
        bindSettingsEvents() {
            // Close buttons
            ['inv-close-settings', 'inv-cancel-btn'].forEach(id => {
                document.getElementById(id)?.addEventListener('click', () => {
                    this.closeSettings();
                });
            });

            // Overlay click
            document.getElementById('inventory-settings-overlay')?.addEventListener('click', (e) => {
                if (e.target.id === 'inventory-settings-overlay') {
                    this.closeSettings();
                }
            });

            // Rack change → update Layer options
            document.getElementById('inv-rack')?.addEventListener('change', () => {
                this.updateLayerOptions();
            });

            // ✅ Enable/Disable toggle
            document.getElementById('inv-enable-toggle')?.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                
                // Disable/Enable tất cả các input khác
                const formGroups = document.querySelectorAll('#inventory-settings-modal .inv-form-group:not(.inv-form-group-toggle)');
                formGroups.forEach(group => {
                    group.style.opacity = enabled ? '1' : '0.5';
                    group.style.pointerEvents = enabled ? 'auto' : 'none';
                });
                
                // Update start button text
                const startBtn = document.getElementById('inv-start-btn');
                if (startBtn) {
                    if (enabled) {
                        startBtn.innerHTML = '<i class="fas fa-play"></i> 開始 | Bắt đầu';
                    } else {
                        startBtn.innerHTML = '<i class="fas fa-power-off"></i> 無効にする | Tắt';
                    }
                }
            });
            
            // Trigger initial state
            const toggleInput = document.getElementById('inv-enable-toggle');
            if (toggleInput) {
                toggleInput.dispatchEvent(new Event('change'));
            }


            // Sort enabled checkbox
            document.getElementById('inv-sort-enabled')?.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                const sortGroup = document.getElementById('inv-sort-group');
                const sortSelect = document.getElementById('inv-sort-by');
                
                if (sortGroup) sortGroup.style.display = enabled ? 'block' : 'none';
                if (sortSelect) sortSelect.disabled = !enabled;
            });

            // Save button
            document.getElementById('inv-save-btn')?.addEventListener('click', () => {
                this.saveInventorySettings();
            });
        },

        /**
         * Lưu cài đặt kiểm kê (không có alert, tự đóng popup)
         */
        saveInventorySettings() {
        // Check enable toggle
        const enableToggle = document.getElementById('inv-enable-toggle')?.checked ?? true;
        
        if (!enableToggle) {
            // Tắt chế độ kiểm kê
            this.toggleOff();
            this.closeSettings();
            return;
        }
        
        // Validate operator
        const operator = document.getElementById('inv-operator')?.value;
        if (!operator) {
            alert('⚠️ Vui lòng chọn nhân viên');
            return;
        }
        
        // Get values
        const operatorName = document.getElementById('inv-operator')?.selectedOptions[0]?.text;
        const filterRack = document.getElementById('inv-rack')?.value || null;
        const filterLayer = document.getElementById('inv-layer')?.value || null;
        const filterType = document.getElementById('inv-type')?.value || 'all';
        const sortEnabled = document.getElementById('inv-sort-enabled')?.checked || false;
        const sortBy = document.getElementById('inv-sort-by')?.value || 'code';
        const autoClose = document.getElementById('inv-auto-close')?.checked || false;
        const bulkMode = document.getElementById('inv-bulk-mode')?.checked || false;
        
        // Update state
        window.InventoryState.active = true;
        window.InventoryState.operator = operator;
        window.InventoryState.operatorName = operatorName;
        window.InventoryState.filterRack = filterRack;
        window.InventoryState.filterLayer = filterLayer;
        window.InventoryState.filterType = filterType;
        window.InventoryState.sortEnabled = sortEnabled;
        window.InventoryState.sortBy = sortBy;
        window.InventoryState.autoClose = autoClose;
        window.InventoryState.bulkMode = bulkMode;
        window.InventoryState.selectedItems = [];
        
        console.log('[InventoryManager] Settings saved:', window.InventoryState);
        
        // ✅ Đóng popup ngay lập tức
        this.closeSettings();
        
        // Update badge ON
        this.updateBadge(true);
        
        // Dispatch events
        document.dispatchEvent(new CustomEvent('inventory:modeChanged', { 
            detail: { ...window.InventoryState } 
        }));
        
        // Apply filters
        this.applyFilters();
        
        // Apply sorting nếu enabled
        if (sortEnabled) {
            document.dispatchEvent(new CustomEvent('inventory:sort', { 
            detail: { by: sortBy } 
            }));
        }
        
        // Show/hide bulk tools
        if (bulkMode) {
            this.showBulkTools();
        } else {
            this.hideBulkTools();
        }
        
        // Lưu cấu hình
        this.saveSettingsToStorage();
        
        // Cập nhật menubar toggle
        this.renderMenubarToggle();
        },


        /**
         * Bắt đầu kiểm kê
         */
        startInventory() {
            // ✅ Check enable toggle
            const enableToggle = document.getElementById('inv-enable-toggle')?.checked ?? true;
            
            if (!enableToggle) {
                // Tắt chế độ kiểm kê
                this.toggleOff();
                this.closeSettings();
                return;
            }
            
            // Validate operator
            const operator = document.getElementById('inv-operator')?.value;
            if (!operator) {
                alert('担当者を選択してください\nVui lòng chọn nhân viên');
                return;
            }


            // Get values
            const operatorName = document.getElementById('inv-operator')?.selectedOptions[0]?.text;
            const filterRack = document.getElementById('inv-rack')?.value || null;
            const filterLayer = document.getElementById('inv-layer')?.value || null;
            const filterType = document.getElementById('inv-type')?.value || 'all';
            const sortEnabled = document.getElementById('inv-sort-enabled')?.checked || false;
            const sortBy = document.getElementById('inv-sort-by')?.value || 'code';
            const autoClose = document.getElementById('inv-auto-close')?.checked || false;
            const bulkMode = document.getElementById('inv-bulk-mode')?.checked || false;

            // Update state
            window.InventoryState.active = true;
            window.InventoryState.operator = operator;
            window.InventoryState.operatorName = operatorName;
            window.InventoryState.filterRack = filterRack;
            window.InventoryState.filterLayer = filterLayer;
            window.InventoryState.filterType = filterType;
            window.InventoryState.sortEnabled = sortEnabled;
            window.InventoryState.sortBy = sortBy;
            window.InventoryState.autoClose = autoClose;
            window.InventoryState.bulkMode = bulkMode;
            window.InventoryState.selectedItems = [];

            console.log('[InventoryManager] ✅ Inventory started:', window.InventoryState);

            // Close settings
            this.closeSettings();

            // Update badge ON
            this.updateBadge(true);

            // Dispatch events
            document.dispatchEvent(new CustomEvent('inventory:modeChanged', {
                detail: { ...window.InventoryState }
            }));

            // Apply filters
            this.applyFilters();

            // Apply sorting (nếu enabled)
            if (sortEnabled) {
                document.dispatchEvent(new CustomEvent('inventory:sort', {
                    detail: { by: sortBy }
                }));
            }

            // Show/hide bulk tools
            if (bulkMode) {
                this.showBulkTools();
            } else {
                this.hideBulkTools();
            }

            // Alert success
            //alert(`棚卸モード開始 | Bắt đầu kiểm kê\n担当者: ${operatorName}`);

            // Lưu cấu hình nếu checkbox được chọn
            const persistSettings = document.getElementById('inv-persist-settings')?.checked ?? true;
            if (persistSettings) {
                this.saveSettingsToStorage();
            }
            
            // Cập nhật menubar toggle
            this.renderMenubarToggle();
        },


        /**
         * Tắt chế độ kiểm kê
         */
        toggleOff() {
            //if (!confirm('棚卸モードを終了しますか？\nKết thúc chế độ kiểm kê?')) {
            //    return;
           // }

            console.log('[InventoryManager] 🛑 Toggling OFF...');

            // ✅ FIX: Reset ALL states including bulkMode
            window.InventoryState.active = false;
            window.InventoryState.bulkMode = false; // ✅ THÊM DÒNG NÀY
            window.InventoryState.selectedItems = [];

            // Update badge
            this.updateBadge(false);

            // ✅ FIX: Hide bulk tools and remove visual highlights
            this.hideBulkTools();
            
            // ✅ THÊM: Xóa class highlight khỏi tất cả thẻ
            document.querySelectorAll('.inv-bulk-selected').forEach(el => {
                el.classList.remove('inv-bulk-selected');
            });
            document.querySelectorAll('.inv-bulk-checkbox.checked').forEach(el => {
                el.classList.remove('checked');
            });

            // Dispatch event
            document.dispatchEvent(new CustomEvent('inventory:modeChanged', {
                detail: { ...window.InventoryState }
            }));

            // Re-render results (remove filters/badges)
            document.dispatchEvent(new CustomEvent('inventory:cleared'));

            // Lưu cấu hình và cập nhật menubar
            this.saveSettingsToStorage();
            this.renderMenubarToggle();

            console.log('[InventoryManager] ✅ Inventory mode OFF, bulkMode reset');
        },

        /**
         * Close settings modal
         */
        closeSettings() {
            document.getElementById('inventory-settings-overlay')?.remove();
        },

        /**
         * Update badge "ON" trên nút
         */
        updateBadge(active) {
            console.log('[InventoryManager] 📛 Badge updated:', active ? 'ON' : 'OFF');
            
            // ========================================
            // 1. UPDATE DESKTOP/IPAD BUTTON
            // ========================================
            const actionBtn = document.getElementById('btn-location');
            if (actionBtn) {
                const existingBadge = actionBtn.querySelector('.inventory-badge');
                if (existingBadge) existingBadge.remove();
                
                if (active) {
                    const badge = document.createElement('span');
                    badge.className = 'inventory-badge';
                    badge.textContent = 'ON';
                    actionBtn.appendChild(badge);
                }
            }
            
            // ========================================
            // 2. UPDATE MOBILE BOTTOM NAV
            // ========================================
            const navBtn = document.getElementById('nav-inventory-btn');
            const navIcon = document.getElementById('nav-inventory-icon');
            const navLabel = document.getElementById('nav-inventory-label');
            
            if (navBtn && navIcon && navLabel) {
                // Remove existing badge
                const existingBadge = navBtn.querySelector('.inventory-badge');
                if (existingBadge) existingBadge.remove();
                
                const jpSpan = navLabel.querySelector('.btn-label-ja');
                const viSpan = navLabel.querySelector('.btn-label-vi');
                
                if (active) {
                    // ✅ MODE ON → "棚卸し" + Badge
                    navIcon.className = 'fas fa-map-marker-alt bottom-nav-icon';
                    if (jpSpan) jpSpan.textContent = '棚卸し';
                    if (viSpan) viSpan.textContent = 'Đang kiểm kê';
                    
                    // Add badge
                    const badge = document.createElement('span');
                    badge.className = 'inventory-badge';
                    badge.textContent = 'ON';
                    navBtn.appendChild(badge);
                } else {
                    // ✅ MODE OFF → "棚卸設定"
                    navIcon.className = 'fas fa-clipboard-check bottom-nav-icon';
                    if (jpSpan) jpSpan.textContent = '棚卸設定';
                    if (viSpan) viSpan.textContent = 'Thiết lập kiểm kê';
                }
            }
            
            // Dispatch event
            document.dispatchEvent(new CustomEvent('inventory:modeChanged', {
                detail: { active }
            }));
        },



        /**
         * Apply inventory filters (Rack, Layer, Type)
         * ✅ FIX: Filter by RackLayerID instead of separate fields
         */
        applyFilters() {
        const { filterRack, filterLayer, filterType } = window.InventoryState;
        
        console.log('[InventoryManager] Applying filters:', { filterRack, filterLayer, filterType });
        
        // ✅ Get all items
        let filtered = window.DataManager?.getAllItems?.() || [];
        
        // ✅ Filter by RackLayerID (combination of Rack + Layer)
        if (filterRack && filterLayer) {
            // Lọc theo RackLayerID kết hợp
            const targetRackLayerID = `${filterRack}${filterLayer}`;
            
            filtered = filtered.filter(item => {
            const itemRackLayerID = item.rackLayerInfo?.RackLayerID || '';
            return String(itemRackLayerID) === targetRackLayerID;
            });
            
            console.log(`[Inventory] Filtered by RackLayerID=${targetRackLayerID}: ${filtered.length} items`);
        } else if (filterRack) {
            // Chỉ lọc theo Giá
            filtered = filtered.filter(item => {
            const rackId = item.rackInfo?.RackID || item.rackLayerInfo?.RackID;
            return String(rackId) === String(filterRack);
            });
            
            console.log(`[Inventory] Filtered by RackID=${filterRack}: ${filtered.length} items`);
        } else if (filterLayer) {
            // Chỉ lọc theo Tầng (ít dùng)
            filtered = filtered.filter(item => {
            const layerNum = item.rackLayerInfo?.RackLayerNumber;
            return String(layerNum) === String(filterLayer);
            });
            
            console.log(`[Inventory] Filtered by LayerNum=${filterLayer}: ${filtered.length} items`);
        }
        
        // ✅ Filter by Type
        if (filterType && filterType !== 'all') {
            filtered = filtered.filter(item => item.itemType === filterType);
            console.log(`[Inventory] Filtered by Type=${filterType}: ${filtered.length} items`);
        }
        
        // ✅ Emit event với kết quả đã lọc
        document.dispatchEvent(new CustomEvent('search:updated', { 
            detail: { 
            results: filtered,
            source: 'inventory-filter',
            origin: 'inventory'
            } 
        }));
        
        console.log(`[Inventory] Final filtered results: ${filtered.length} items`);
        },


        /**
         * Show bulk tools (floating icon + checkboxes)
         */
        showBulkTools() {
            console.log('[InventoryManager] 🧰 Showing bulk tools...');

            // Add floating icon
            if (!document.getElementById('inv-bulk-float')) {
                const floatBtn = document.createElement('button');
                floatBtn.id = 'inv-bulk-float';
                floatBtn.className = 'inv-bulk-float-btn';
                floatBtn.innerHTML = `
                    <i class="fas fa-tasks"></i>
                    <span class="inv-bulk-count">0</span>
                `;
                floatBtn.addEventListener('click', () => {
                    this.openBulkPopup();
                });
                document.body.appendChild(floatBtn);
            }

            // Add checkboxes to result cards
            document.dispatchEvent(new CustomEvent('inventory:bulkMode', {
                detail: { enabled: true }
            }));
        },

        /**
         * Hide bulk tools
         */
        hideBulkTools() {
            document.getElementById('inv-bulk-float')?.remove();
            
            document.dispatchEvent(new CustomEvent('inventory:bulkMode', {
                detail: { enabled: false }
            }));
        },

        /**
         * Open bulk popup
         */
        openBulkPopup() {
            const selectedCount = window.InventoryState.selectedItems.length;
            
            if (selectedCount === 0) {
                alert('項目を選択してください\nVui lòng chọn mục');
                return;
            }

            console.log('[InventoryManager] 📦 Opening bulk popup for', selectedCount, 'items');

            const html = `
                <div id="inv-bulk-popup-overlay" class="inv-overlay">
                    <div id="inv-bulk-popup" class="inv-modal inv-modal-small">
                        <div class="inv-modal-header">
                            <h3>一括棚卸 | Kiểm kê hàng loạt</h3>
                            <span class="inv-badge">${selectedCount} 項目 | mục</span>
                        </div>
                        
                        <div class="inv-modal-body">
                            <div class="inv-bulk-actions">
                                <button class="inv-btn inv-btn-success inv-btn-block" id="inv-bulk-audit">
                                    <i class="fas fa-clipboard-check"></i>
                                    棚卸 | Kiểm kê
                                </button>
                                
                                <button class="inv-btn inv-btn-primary inv-btn-block" id="inv-bulk-relocate">
                                    <i class="fas fa-map-marked-alt"></i>
                                    位置変更＋棚卸 | Đổi vị trí + Kiểm kê
                                </button>
                            </div>
                        </div>
                        
                        <div class="inv-modal-footer">
                            <button class="inv-btn inv-btn-secondary" id="inv-bulk-cancel">
                                キャンセル | Hủy
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', html);

            // Bind events
            document.getElementById('inv-bulk-cancel')?.addEventListener('click', () => {
                document.getElementById('inv-bulk-popup-overlay')?.remove();
            });

            document.getElementById('inv-bulk-audit')?.addEventListener('click', () => {
                this.processBulkAudit();
            });

            document.getElementById('inv-bulk-relocate')?.addEventListener('click', () => {
                this.processBulkRelocate();
            });
        },

        /**
         * Process bulk audit (kiểm kê hàng loạt)
         */
        processBulkAudit() {
            const items = window.InventoryState.selectedItems;
            const operator = window.InventoryState.operator;
            
            console.log('[InventoryManager] 📋 Processing bulk audit for', items.length, 'items');

            items.forEach(item => {
                // Dispatch checkin event
                document.dispatchEvent(new CustomEvent('triggerCheckin', {
                    detail: {
                        item: item.data,
                        type: item.type,
                        mode: 'inventory',
                        operator,
                        source: 'inventoryBulk'
                    }
                }));

                // Record audit
                this.recordAudit(item.id, item.type, new Date().toISOString());
            });

            // Clear selection
            window.InventoryState.selectedItems = [];
            this.updateBulkCount(0);

            // Close popup
            document.getElementById('inv-bulk-popup-overlay')?.remove();

            // Update badges
            document.dispatchEvent(new CustomEvent('inventory:refreshBadges'));

            //alert(`✅ ${items.length} 項目を棚卸しました\nĐã kiểm kê ${items.length} mục`);
        },

        /**
         * Process bulk relocate (thay đổi vị trí + kiểm kê hàng loạt)
         */
        processBulkRelocate() {
            const items = window.InventoryState.selectedItems;
            const rackLayer = prompt(
                '棚段ID (例: 112) を入力\nNhập RackLayerID (vd: 112)'
            );

            if (!rackLayer) return;

            const operator = window.InventoryState.operator;

            console.log('[InventoryManager] 📍 Processing bulk relocate for', items.length, 'items');

            items.forEach(item => {
                // Dispatch location update
                document.dispatchEvent(new CustomEvent('updateLocation', {
                    detail: {
                        item: item.data,
                        type: item.type,
                        rackLayerId: rackLayer,
                        reason: 'inventory',
                        operator,
                        source: 'inventoryBulk'
                    }
                }));

                // Dispatch checkin
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent('triggerCheckin', {
                        detail: {
                            item: item.data,
                            type: item.type,
                            mode: 'inventory',
                            operator,
                            source: 'inventoryBulk'
                        }
                    }));
                }, 200);

                // Record audit
                this.recordAudit(item.id, item.type, new Date().toISOString());
            });

            // Clear selection
            window.InventoryState.selectedItems = [];
            this.updateBulkCount(0);

            // Close popup
            document.getElementById('inv-bulk-popup-overlay')?.remove();

            // Update badges
            document.dispatchEvent(new CustomEvent('inventory:refreshBadges'));

            //alert(`✅ ${items.length} 項目の位置を変更して棚卸しました\nĐã đổi vị trí và kiểm kê ${items.length} mục`);
        },

        /**
         * Toggle item selection (bulk mode)
         */
        toggleItemSelection(itemId, itemType, itemData) {
            const index = window.InventoryState.selectedItems.findIndex(
                item => item.id === itemId && item.type === itemType
            );

            if (index > -1) {
                // Deselect
                window.InventoryState.selectedItems.splice(index, 1);
            } else {
                // Select
                window.InventoryState.selectedItems.push({
                    id: itemId,
                    type: itemType,
                    data: itemData
                });
            }

            this.updateBulkCount(window.InventoryState.selectedItems.length);
        },

        /**
         * Update bulk count badge
         */
        updateBulkCount(count) {
            const badge = document.querySelector('.inv-bulk-count');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        },

        /**
         * Record audit history
         */
          recordAudit(itemId, itemType, date) {
            const key = `${itemType}:${itemId}`;
            window.InventoryState.auditHistory[key] = date;
            
            // Save to statuslogs.csv via server
            this.saveToStatusLogs(itemId, itemType, date, window.InventoryState.operator);
            
            // Save to localStorage (fallback)
            this.saveAuditHistory();
            
            console.log('[InventoryManager] Audit recorded:', key, date);
            
            // ✅ R6.9.7: Dispatch event để UI refresh ngay lập tức
            document.dispatchEvent(new CustomEvent('inventory:auditRecorded', {
            detail: { itemId, itemType, date }
            }));
            console.log('[InventoryManager] 📡 Event dispatched: inventory:auditRecorded');
        },



        /**
         * Save audit record to statuslogs.csv via server API
         */
        async saveToStatusLogs(itemId, itemType, date, operator) {
        const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/audit';
        
        const record = {
            itemId: itemId,
            itemType: itemType,
            auditDate: date,
            operator: operator || window.InventoryState.operator || '',
            notes: 'Inventory audit'
        };
        
        try {
            const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
            });
            
            const result = await response.json();
            
            if (result.success) {
            console.log('[InventoryManager] ✅ Audit saved to server:', result);
            } else {
            console.error('[InventoryManager] ❌ Server error:', result.error);
            // Fallback: Save to localStorage
            this.saveToLocalStorage(itemId, itemType, date);
            }
            
        } catch (error) {
            console.error('[InventoryManager] ❌ Network error:', error);
            // Fallback: Save to localStorage
            this.saveToLocalStorage(itemId, itemType, date);
        }
        },

        /**
         * Fallback: Save to localStorage if server fails
         */
        saveToLocalStorage(itemId, itemType, date) {
        const key = `${itemType}:${itemId}`;
        window.InventoryState.auditHistory[key] = date;
        this.saveAuditHistory();
        console.log('[InventoryManager] Saved to localStorage (fallback):', key);
        },


        /**
         * Get last audit date
         */
        getLastAuditDate(itemId, itemType) {
            const key = `${itemType}:${itemId}`;
            return window.InventoryState.auditHistory[key] || null;
        },

        /**
         * Check if audited today
         */
        isAuditedToday(itemId, itemType) {
            const lastDate = this.getLastAuditDate(itemId, itemType);
            if (!lastDate) return false;

            const today = new Date().toISOString().split('T')[0];
            const auditDate = lastDate.split('T')[0];

            return today === auditDate;
        },

        /**
         * Save audit history to localStorage
         */
        saveAuditHistory() {
            try {
                localStorage.setItem(
                    'inventory_audit_history',
                    JSON.stringify(window.InventoryState.auditHistory)
                );
            } catch (e) {
                console.warn('[InventoryManager] Failed to save audit history:', e);
            }
        },

        /**
         * Load audit history from localStorage
         */
        loadAuditHistory() {
            try {
                const data = localStorage.getItem('inventory_audit_history');
                if (data) {
                    window.InventoryState.auditHistory = JSON.parse(data);
                    console.log('[InventoryManager] ✅ Audit history loaded');
                }
            } catch (e) {
                console.warn('[InventoryManager] Failed to load audit history:', e);
            }
        },

        /**
         * Open modal (alias for action-buttons compatibility)
         */
        openModal(item) {
            // iPad: Toggle directly
            // iPhone: Open settings
            if (!window.InventoryState.active) {
                this.openSettings();
            } else {
                this.toggleOff();
            }
        },

        // Tìm phần tử menubar "Location" để gắn huy hiệu ON/OFF
        getMenubarTargets() {
        const sels = ['#menu-location', '#tab-location', '[data-menu="location"]', '.bottom-nav .menu-location'];
        for (const s of sels) {
            const el = document.querySelector(s);
            if (el) return el;
        }
        return null;
        },

        renderMenubarToggle() {
        const parent = this.getMenubarTargets();
        const st = window.InventoryState;
        if (!parent) return;

        // tạo badge ON/OFF nếu chưa có
        let badge = parent.querySelector('.inv-mode-dot');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'inv-mode-dot';
            parent.style.position = parent.style.position || 'relative';
            parent.appendChild(badge);

            // Click badge → toggle nhanh
            badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleInventoryMode(); // ON/OFF nhanh
            });
        }
        badge.classList.toggle('on', !!st.active);
        badge.title = st.active ? '棚卸 ON' : '棚卸 OFF';

        // phát sự kiện để các nơi khác (button label) cập nhật
        document.dispatchEvent(new CustomEvent('inventory:modeChanged', { detail: { active: st.active } }));
        },

    };

    // ========================================
    // AUTO-INIT
    // ========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.InventoryManager.init();
        });
    } else {
        window.InventoryManager.init();
    }

})();
