/**
 * bulk-inventory-fab-r7.1.2-FIXED.js
 * 
 * FIXES:
 * 1. ✅ Lấy đúng itemId từ SelectionManager
 * 2. ✅ Toast notification thay loading dialog
 * 3. ✅ Gọi lại InventoryManager.recordAudit (tránh trùng lặp)
 * 4. ✅ Tắt hoàn toàn inventory mode khi exit
 * 
 * Version: r7.1.2-FIXED
 * Date: 2025.12.15
 */

(function() {
    'use strict';

    const BulkInventoryFAB = {
        state: {
            isVisible: false,
            isDragging: false,
            isPopupOpen: false,
            selectedCount: 0,
            position: { x: window.innerWidth - 80, y: window.innerHeight - 150 }
        },

        init() {
            console.log('[BulkInventoryFAB] 🚀 Initializing...');
            this.createFAB();
            this.bindEvents();
            console.log('[BulkInventoryFAB] ✅ Initialized');
        },

        createFAB() {
            if (document.getElementById('bulk-inventory-fab')) {
                console.warn('[BulkInventoryFAB] FAB already exists');
                return;
            }

            const fabHTML = `
                <!-- Floating Action Button -->
                <div id="bulk-inventory-fab" class="bulk-fab hidden" style="left: ${this.state.position.x}px; top: ${this.state.position.y}px;">
                    <div class="bulk-fab-button">
                        <span class="bulk-fab-icon">📋</span>
                        <span class="bulk-fab-badge">0</span>
                    </div>
                </div>

                <!-- Popup Menu -->
                <div id="bulk-inventory-popup" class="bulk-popup hidden">
                    <div class="bulk-popup-header">
                        <h3>一括棚卸し / Kiểm kê hàng loạt</h3>
                        <button class="bulk-popup-close" aria-label="閉じる / Đóng">×</button>
                    </div>
                    
                    <div class="bulk-popup-body">
                        <!-- Số lượng đã chọn -->
                        <div class="bulk-selection-count">
                            <span class="count-label">選択済み / Đã chọn:</span>
                            <span class="count-value" id="bulk-selection-count-value">0</span>
                            <span class="count-unit">件 / mục</span>
                        </div>

                        <!-- Actions -->
                        <div class="bulk-popup-actions">
                            <button class="bulk-action-btn btn-select-all" id="bulk-select-all-btn">
                                <span class="btn-icon">☑️</span>
                                <span class="btn-text">すべて選択 / Chọn tất cả</span>
                                <span class="btn-hint">(表示中の100件)</span>
                            </button>

                            <button class="bulk-action-btn btn-clear" id="bulk-clear-all-btn">
                                <span class="btn-icon">❌</span>
                                <span class="btn-text">選択解除 / Hủy chọn</span>
                            </button>

                            <button class="bulk-action-btn btn-confirm" id="bulk-confirm-btn">
                                <span class="btn-icon">✅</span>
                                <span class="btn-text">確認実行 / Xác nhận kiểm kê</span>
                            </button>

                            <button class="bulk-action-btn btn-exit" id="bulk-exit-btn">
                                <span class="btn-icon">🚪</span>
                                <span class="btn-text">モード終了 / Thoát hoàn toàn</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Overlay (backdrop) -->
                <div id="bulk-popup-overlay" class="bulk-popup-overlay hidden"></div>
                
                <!-- Toast Container -->
                <div id="bulk-toast-container" class="bulk-toast-container"></div>
            `;

            document.body.insertAdjacentHTML('beforeend', fabHTML);
            console.log('[BulkInventoryFAB] ✅ HTML structure created');
        },

        bindEvents() {
            const fab = document.getElementById('bulk-inventory-fab');
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');

            if (!fab || !popup || !overlay) {
                console.error('[BulkInventoryFAB] Required elements not found');
                return;
            }

            // FAB Click
            fab.addEventListener('click', (e) => {
                if (this.state.isDragging) return;
                this.openPopup();
            });

            // Drag & Drop
            this.setupDragAndDrop(fab);

            // Close popup
            const closeBtn = document.querySelector('.bulk-popup-close');
            if (closeBtn) closeBtn.addEventListener('click', () => this.closePopup());
            overlay.addEventListener('click', () => this.closePopup());

            // Action buttons
            document.getElementById('bulk-select-all-btn')?.addEventListener('click', () => this.selectAllRendered());
            document.getElementById('bulk-clear-all-btn')?.addEventListener('click', () => this.clearAllSelection());
            document.getElementById('bulk-confirm-btn')?.addEventListener('click', () => this.confirmAudit());
            document.getElementById('bulk-exit-btn')?.addEventListener('click', () => this.exitBulkMode());

            // Selection changes
            document.addEventListener('selection:changed', (e) => {
                const count = e.detail?.count || 0;
                this.updateBadge(count);
            });

            // Bulk mode toggle
            document.addEventListener('selection:modeChanged', (e) => {
                const enabled = e.detail?.enabled !== false;
                if (enabled) {
                    this.show();
                } else {
                    this.hide();
                    this.closePopup();
                }
            });

            console.log('[BulkInventoryFAB] ✅ Events bound');
        },

        setupDragAndDrop(fab) {
            let startX, startY, initialX, initialY;

            const onTouchStart = (e) => {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                initialX = this.state.position.x;
                initialY = this.state.position.y;
                fab.style.transition = 'none';
            };

            const onTouchMove = (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;

                if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                    this.state.isDragging = true;
                }

                let newX = initialX + deltaX;
                let newY = initialY + deltaY;

                const maxX = window.innerWidth - 70;
                const maxY = window.innerHeight - 70;
                newX = Math.max(10, Math.min(newX, maxX));
                newY = Math.max(10, Math.min(newY, maxY));

                fab.style.left = newX + 'px';
                fab.style.top = newY + 'px';
            };

            const onTouchEnd = () => {
                fab.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                this.state.position.x = parseInt(fab.style.left, 10);
                this.state.position.y = parseInt(fab.style.top, 10);
                setTimeout(() => { this.state.isDragging = false; }, 100);
            };

            fab.addEventListener('touchstart', onTouchStart, { passive: false });
            fab.addEventListener('touchmove', onTouchMove, { passive: false });
            fab.addEventListener('touchend', onTouchEnd);

            // Desktop support
            fab.addEventListener('mousedown', (e) => {
                startX = e.clientX;
                startY = e.clientY;
                initialX = this.state.position.x;
                initialY = this.state.position.y;
                fab.style.transition = 'none';

                const onMouseMove = (e) => {
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;

                    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                        this.state.isDragging = true;
                    }

                    let newX = initialX + deltaX;
                    let newY = initialY + deltaY;

                    const maxX = window.innerWidth - 70;
                    const maxY = window.innerHeight - 70;
                    newX = Math.max(10, Math.min(newX, maxX));
                    newY = Math.max(10, Math.min(newY, maxY));

                    fab.style.left = newX + 'px';
                    fab.style.top = newY + 'px';
                };

                const onMouseUp = () => {
                    fab.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    this.state.position.x = parseInt(fab.style.left, 10);
                    this.state.position.y = parseInt(fab.style.top, 10);
                    setTimeout(() => { this.state.isDragging = false; }, 100);
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        },

        show() {
            const fab = document.getElementById('bulk-inventory-fab');
            if (fab) {
                fab.classList.remove('hidden');
                this.state.isVisible = true;
                console.log('[BulkInventoryFAB] ✅ Shown');
            }
        },

        hide() {
            const fab = document.getElementById('bulk-inventory-fab');
            if (fab) {
                fab.classList.add('hidden');
                this.state.isVisible = false;
                console.log('[BulkInventoryFAB] ✅ Hidden');
            }
        },

        updateBadge(count) {
            const badge = document.querySelector('.bulk-fab-badge');
            const popupCount = document.getElementById('bulk-selection-count-value');
            
            if (badge) {
                badge.textContent = String(count);
                badge.classList.toggle('hidden', count === 0);
            }
            
            if (popupCount) {
                popupCount.textContent = String(count);
            }
            
            this.state.selectedCount = count;
        },

        openPopup() {
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');
            
            if (popup && overlay) {
                popup.classList.remove('hidden');
                overlay.classList.remove('hidden');
                this.state.isPopupOpen = true;
                
                // ✅ FIX: Lấy count từ SelectionManager
                if (window.SelectionManager && typeof SelectionManager.getSelectedItems === 'function') {
                    const count = SelectionManager.getSelectedItems().length;
                    this.updateBadge(count);
                }
                
                console.log('[BulkInventoryFAB] ✅ Popup opened');
            }
        },

        closePopup() {
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');
            
            if (popup && overlay) {
                popup.classList.add('hidden');
                overlay.classList.add('hidden');
                this.state.isPopupOpen = false;
                console.log('[BulkInventoryFAB] ✅ Popup closed');
            }
        },

        selectAllRendered() {
            console.log('[BulkInventoryFAB] Selecting all rendered items...');
            
            const cards = document.querySelectorAll('.result-card[data-id][data-type]');
            console.log(`[BulkInventoryFAB] Found ${cards.length} rendered cards`);
            
            if (cards.length === 0) {
                this.showToast('⚠️ 表示中のアイテムがありません / Không có mục nào', 'warning');
                return;
            }

            if (window.SelectionManager && typeof SelectionManager.toggleItem === 'function') {
                cards.forEach(card => {
                    const itemId = card.getAttribute('data-id');
                    const itemType = card.getAttribute('data-type');
                    const index = parseInt(card.getAttribute('data-index'), 10);
                    
                    let itemData = null;
                    if (!isNaN(index) && window.UIRenderer?.state?.allResults?.[index]) {
                        itemData = window.UIRenderer.state.allResults[index];
                    }
                    
                    if (!SelectionManager.isSelected(itemId, itemType)) {
                        SelectionManager.toggleItem(itemId, itemType, itemData);
                    }
                });
                
                console.log('[BulkInventoryFAB] ✅ Selected all rendered items');
                this.showToast(`✅ ${cards.length}件選択しました / Đã chọn ${cards.length} mục`, 'success');
            } else {
                console.error('[BulkInventoryFAB] SelectionManager not available');
                this.showToast('❌ システムエラー / Lỗi hệ thống', 'error');
            }
        },

        clearAllSelection() {
            console.log('[BulkInventoryFAB] Clearing all selections...');
            
            if (window.SelectionManager && typeof SelectionManager.clear === 'function') {
                SelectionManager.clear();
                console.log('[BulkInventoryFAB] ✅ All selections cleared');
                this.showToast('✅ 選択を解除しました / Đã hủy chọn', 'success');
            } else {
                console.error('[BulkInventoryFAB] SelectionManager not available');
            }
        },

        // ====================================================================
        // ✅ FIX: confirmAudit - GỌI LẠI INVENTORYMANAGER.RECORDAUDIT
        // ====================================================================
        confirmAudit() {
            console.log('[BulkInventoryFAB] Confirming audit...');
            
            if (!window.SelectionManager || typeof SelectionManager.getSelectedItems !== 'function') {
                this.showToast('❌ システムエラー / Lỗi hệ thống', 'error');
                return;
            }

            const selectedItems = SelectionManager.getSelectedItems();
            const count = selectedItems.length;

            if (count === 0) {
                this.showToast('⚠️ アイテムが選択されていません / Chưa chọn mục nào', 'warning');
                return;
            }

            // Confirm dialog
            const confirmMsg = `${count}件のアイテムを棚卸ししますか？\n\nXác nhận kiểm kê ${count} mục?`;
            if (!confirm(confirmMsg)) {
                return;
            }

            // Đóng popup
            this.closePopup();

            // ✅ FIX: Hiển thị toast thay loading dialog
            this.showToast(`🔄 処理中... / Đang xử lý ${count} mục`, 'info', 0); // 0 = không tự đóng

            // Kiểm tra InventoryManager
            if (!window.InventoryManager || typeof InventoryManager.recordAudit !== 'function') {
                console.error('[BulkInventoryFAB] InventoryManager.recordAudit not available');
                this.hideToast();
                this.showToast('❌ システムエラー / Lỗi hệ thống', 'error');
                return;
            }

            // ✅ FIX: Gọi recordAudit cho từng item (GIỐNG PHIÊN BẢN CŨ)
            const auditPromises = selectedItems.map((item, idx) => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        try {
                            // ✅ FIX: Lấy itemId từ cấu trúc SelectionManager
                            // SelectionManager lưu: {id: '5686', type: 'mold', data: {...}}
                            const itemId = item.id || item.itemId || item.MoldID || item.CutterID;
                            const itemType = item.type || item.itemType || 'mold';
                            
                            if (!itemId) {
                                console.warn('[BulkInventoryFAB] Item missing ID:', item);
                                resolve({ success: false, item });
                                return;
                            }

                            console.log(`[BulkInventoryFAB] Recording audit ${idx+1}/${count}: ${itemType} ${itemId}`);

                            // ✅ QUAN TRỌNG: Gọi hàm recordAudit của InventoryManager (TRÁNH TRÙNG LẶP)
                            InventoryManager.recordAudit(itemId, itemType)
                                .then(() => {
                                    console.log(`[BulkInventoryFAB] ✅ Audit success: ${itemId}`);
                                    resolve({ success: true, item, itemId, itemType });
                                })
                                .catch(err => {
                                    console.error(`[BulkInventoryFAB] ❌ Audit failed: ${itemId}`, err);
                                    resolve({ success: false, item, itemId, error: err });
                                });
                        } catch (err) {
                            console.error('[BulkInventoryFAB] Exception:', err);
                            resolve({ success: false, item, error: err });
                        }
                    }, idx * 50); // Delay 50ms giữa mỗi item (tránh quá tải)
                });
            });

            // Đợi tất cả promises
            Promise.all(auditPromises)
                .then(results => {
                    // Ẩn toast loading
                    this.hideToast();

                    // Đếm kết quả
                    const successCount = results.filter(r => r.success).length;
                    const failCount = count - successCount;

                    console.log(`[BulkInventoryFAB] Audit complete: ${successCount}/${count} success`);

                    // Dispatch bulk event
                    const successItems = results
                        .filter(r => r.success)
                        .map(r => ({ itemId: r.itemId, itemType: r.itemType }));

                    document.dispatchEvent(new CustomEvent('inventory:bulkAuditCompleted', {
                        detail: { 
                            items: successItems,
                            date: new Date().toISOString(),
                            count: successCount
                        }
                    }));

                    // Clear selection
                    if (typeof SelectionManager.clear === 'function') {
                        SelectionManager.clear();
                    }

                    // Hiển thị kết quả
                    if (failCount === 0) {
                        this.showToast(`✅ ${successCount}件完了 / Đã kiểm kê ${successCount} mục`, 'success', 3000);
                    } else {
                        this.showToast(`⚠️ 成功:${successCount} 失敗:${failCount}`, 'warning', 5000);
                    }

                    // Re-render UI
                    if (window.UIRenderer && window.UIRenderer.renderResults) {
                        const allResults = window.UIRenderer.state?.allResults || [];
                        UIRenderer.renderResults(allResults);
                    }
                })
                .catch(err => {
                    console.error('[BulkInventoryFAB] Bulk audit error:', err);
                    this.hideToast();
                    this.showToast('❌ 棚卸しに失敗しました / Kiểm kê thất bại', 'error');
                });
        },

        // ====================================================================
        // ✅ FIX: exitBulkMode - TẮT HOÀN TOÀN INVENTORY MODE
        // ====================================================================
        exitBulkMode() {
            console.log('[BulkInventoryFAB] Exiting bulk mode...');
            
            const confirmMsg = '棚卸しモードを完全に終了しますか？\n\nThoát hoàn toàn chế độ kiểm kê?';
            if (!confirm(confirmMsg)) {
                return;
            }

            // 1. Tắt selection mode
            if (window.SelectionManager && typeof SelectionManager.setMode === 'function') {
                SelectionManager.setMode(false);
                SelectionManager.clear();
            }

            // 2. Checkbox toggle
            const toggle = document.getElementById('selection-mode-toggle');
            if (toggle) toggle.checked = false;

            // 3. ✅ FIX: TẮT HẲN INVENTORY MODE
            if (window.InventoryState) {
                window.InventoryState.bulkMode = false;
                window.InventoryState.inventoryMode = false; // ← QUAN TRỌNG
                window.InventoryState.selectedItems = [];
            }

            // 4. Dispatch events
            document.dispatchEvent(new CustomEvent('inventoryModeChanged', {
                detail: { enabled: false }
            }));

            document.dispatchEvent(new CustomEvent('selection:modeChanged', {
                detail: { enabled: false }
            }));

            // 5. Ẩn FAB
            this.hide();
            this.closePopup();

            // 6. Cập nhật badge
            if (window.InventoryManager && typeof InventoryManager.updateInventoryBadge === 'function') {
                InventoryManager.updateInventoryBadge(false);
            }

            // 7. Re-render UI
            if (window.UIRenderer && window.UIRenderer.renderResults) {
                const allResults = window.UIRenderer.state?.allResults || [];
                UIRenderer.renderResults(allResults);
            }

            console.log('[BulkInventoryFAB] ✅ Exited completely');
            this.showToast('✅ 棚卸しモードを終了しました / Đã thoát chế độ kiểm kê', 'success');
        },

        // ====================================================================
        // ✅ NEW: TOAST NOTIFICATION (THAY LOADING DIALOG)
        // ====================================================================
        showToast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('bulk-toast-container');
            if (!container) return;

            // Xóa toast cũ (nếu có)
            this.hideToast();

            // Icon theo type
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: '🔄'
            };

            const icon = icons[type] || '📋';

            // Tạo toast
            const toast = document.createElement('div');
            toast.id = 'bulk-active-toast';
            toast.className = `bulk-toast bulk-toast-${type}`;
            toast.innerHTML = `
                <span class="toast-icon">${icon}</span>
                <span class="toast-message">${message}</span>
            `;

            container.appendChild(toast);

            // Animation fade in
            setTimeout(() => toast.classList.add('show'), 10);

            // Tự động ẩn (nếu duration > 0)
            if (duration > 0) {
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, duration);
            }
        },

        hideToast() {
            const toast = document.getElementById('bulk-active-toast');
            if (toast) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }
    };

    // Export
    window.BulkInventoryFAB = BulkInventoryFAB;

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => BulkInventoryFAB.init(), { once: true });
    } else {
        BulkInventoryFAB.init();
    }

})();
