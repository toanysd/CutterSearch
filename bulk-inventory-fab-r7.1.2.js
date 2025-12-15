/**
 * bulk-inventory-fab-r7.1.2.js
 * 
 * Floating Action Button (FAB) cho chế độ kiểm kê hàng loạt
 * - Hiển thị số thẻ đã chọn (badge)
 * - Có thể kéo thả di chuyển trên màn hình
 * - Popup với 5 chức năng: Chọn tất cả, Hủy tất cả, Xác nhận, Thoát
 * 
 * Version: r7.1.2
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
            position: { x: window.innerWidth - 80, y: window.innerHeight - 150 } // Vị trí mặc định (góc dưới phải)
        },

        init() {
            console.log('[BulkInventoryFAB] 🚀 Initializing...');
            
            // Tạo HTML structure
            this.createFAB();
            
            // Bind events
            this.bindEvents();
            
            console.log('[BulkInventoryFAB] ✅ Initialized');
        },

        createFAB() {
            // Kiểm tra nếu đã tồn tại
            if (document.getElementById('bulk-inventory-fab')) {
                console.warn('[BulkInventoryFAB] FAB already exists');
                return;
            }

            // Tạo FAB container
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
                                <span class="btn-text">モード終了 / Thoát chế độ</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Overlay (backdrop) -->
                <div id="bulk-popup-overlay" class="bulk-popup-overlay hidden"></div>
            `;

            // Append vào body
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

            // ================================================================
            // 1. FAB Click → Mở popup
            // ================================================================
            fab.addEventListener('click', (e) => {
                if (this.state.isDragging) return; // Không mở popup khi đang kéo
                this.openPopup();
            });

            // ================================================================
            // 2. FAB Drag & Drop (Kéo thả)
            // ================================================================
            this.setupDragAndDrop(fab);

            // ================================================================
            // 3. Close popup
            // ================================================================
            const closeBtn = document.querySelector('.bulk-popup-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closePopup());
            }
            overlay.addEventListener('click', () => this.closePopup());

            // ================================================================
            // 4. Action buttons
            // ================================================================
            // Chọn tất cả (100 items đã render)
            const selectAllBtn = document.getElementById('bulk-select-all-btn');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => this.selectAllRendered());
            }

            // Hủy tất cả
            const clearAllBtn = document.getElementById('bulk-clear-all-btn');
            if (clearAllBtn) {
                clearAllBtn.addEventListener('click', () => this.clearAllSelection());
            }

            // Xác nhận kiểm kê
            const confirmBtn = document.getElementById('bulk-confirm-btn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.confirmAudit());
            }

            // Thoát chế độ
            const exitBtn = document.getElementById('bulk-exit-btn');
            if (exitBtn) {
                exitBtn.addEventListener('click', () => this.exitBulkMode());
            }

            // ================================================================
            // 5. Lắng nghe selection changes
            // ================================================================
            document.addEventListener('selection:changed', (e) => {
                const count = e.detail?.count || 0;
                this.updateBadge(count);
            });

            // ================================================================
            // 6. Lắng nghe bulk mode toggle
            // ================================================================
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

        // ====================================================================
        // DRAG & DROP
        // ====================================================================
        setupDragAndDrop(fab) {
            let startX, startY, initialX, initialY;
            let hasMoved = false;

            const onTouchStart = (e) => {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                initialX = this.state.position.x;
                initialY = this.state.position.y;
                hasMoved = false;
                
                fab.style.transition = 'none';
            };

            const onTouchMove = (e) => {
                e.preventDefault(); // Ngăn scroll
                const touch = e.touches[0];
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;

                // Nếu di chuyển > 10px → coi là dragging
                if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                    this.state.isDragging = true;
                    hasMoved = true;
                }

                // Cập nhật vị trí
                let newX = initialX + deltaX;
                let newY = initialY + deltaY;

                // Giới hạn trong viewport
                const maxX = window.innerWidth - 70;
                const maxY = window.innerHeight - 70;
                newX = Math.max(10, Math.min(newX, maxX));
                newY = Math.max(10, Math.min(newY, maxY));

                fab.style.left = newX + 'px';
                fab.style.top = newY + 'px';
            };

            const onTouchEnd = () => {
                fab.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                
                // Lưu vị trí mới
                this.state.position.x = parseInt(fab.style.left, 10);
                this.state.position.y = parseInt(fab.style.top, 10);

                // Reset dragging state sau 100ms (tránh trigger click)
                setTimeout(() => {
                    this.state.isDragging = false;
                }, 100);
            };

            // Bind touch events
            fab.addEventListener('touchstart', onTouchStart, { passive: false });
            fab.addEventListener('touchmove', onTouchMove, { passive: false });
            fab.addEventListener('touchend', onTouchEnd);

            // Desktop support (mouse)
            fab.addEventListener('mousedown', (e) => {
                startX = e.clientX;
                startY = e.clientY;
                initialX = this.state.position.x;
                initialY = this.state.position.y;
                hasMoved = false;
                fab.style.transition = 'none';

                const onMouseMove = (e) => {
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;

                    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                        this.state.isDragging = true;
                        hasMoved = true;
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

                    setTimeout(() => {
                        this.state.isDragging = false;
                    }, 100);

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        },

        // ====================================================================
        // SHOW / HIDE FAB
        // ====================================================================
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

        // ====================================================================
        // UPDATE BADGE
        // ====================================================================
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

        // ====================================================================
        // POPUP OPEN / CLOSE
        // ====================================================================
        openPopup() {
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');
            
            if (popup && overlay) {
                popup.classList.remove('hidden');
                overlay.classList.remove('hidden');
                this.state.isPopupOpen = true;
                
                // Cập nhật số lượng hiện tại
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

        // ====================================================================
        // ACTION HANDLERS
        // ====================================================================
        selectAllRendered() {
            console.log('[BulkInventoryFAB] Selecting all rendered items...');
            
            // Lấy tất cả cards đã render (50-100 items)
            const cards = document.querySelectorAll('.result-card[data-id][data-type]');
            console.log(`[BulkInventoryFAB] Found ${cards.length} rendered cards`);
            
            if (cards.length === 0) {
                alert('表示中のアイテムがありません / Không có mục nào để chọn');
                return;
            }

            // Toggle selection qua SelectionManager
            if (window.SelectionManager && typeof SelectionManager.toggleItem === 'function') {
                cards.forEach(card => {
                    const itemId = card.getAttribute('data-id');
                    const itemType = card.getAttribute('data-type');
                    const index = parseInt(card.getAttribute('data-index'), 10);
                    
                    // Lấy item data từ UIRenderer.state.allResults
                    let itemData = null;
                    if (!isNaN(index) && window.UIRenderer?.state?.allResults?.[index]) {
                        itemData = window.UIRenderer.state.allResults[index];
                    }
                    
                    // Chỉ select nếu chưa được chọn
                    if (!SelectionManager.isSelected(itemId, itemType)) {
                        SelectionManager.toggleItem(itemId, itemType, itemData);
                    }
                });
                
                console.log('[BulkInventoryFAB] ✅ Selected all rendered items');
                alert(`✅ ${cards.length}件のアイテムを選択しました / Đã chọn ${cards.length} mục`);
            } else {
                console.error('[BulkInventoryFAB] SelectionManager not available');
                alert('❌ システムエラー / Lỗi hệ thống');
            }
        },

        clearAllSelection() {
            console.log('[BulkInventoryFAB] Clearing all selections...');
            
            if (window.SelectionManager && typeof SelectionManager.clear === 'function') {
                SelectionManager.clear();
                console.log('[BulkInventoryFAB] ✅ All selections cleared');
                alert('✅ 選択を解除しました / Đã hủy chọn tất cả');
            } else {
                console.error('[BulkInventoryFAB] SelectionManager not available');
            }
        },

        // ✅ MỚI (ĐÚNG)
        confirmAudit() {
            console.log('[BulkInventoryFAB] Confirming audit...');
            
            if (!window.SelectionManager || typeof SelectionManager.getSelectedItems !== 'function') {
                alert('❌ システムエラー / Lỗi hệ thống: SelectionManager not available');
                return;
            }

            const selectedItems = SelectionManager.getSelectedItems();
            const count = selectedItems.length;

            if (count === 0) {
                alert('⚠️ アイテムが選択されていません / Chưa chọn mục nào');
                return;
            }

            // Confirm dialog
            const confirmMsg = `${count}件のアイテムを棚卸ししますか？\n\nXác nhận kiểm kê ${count} mục?`;
            if (!confirm(confirmMsg)) {
                return;
            }

            // Đóng popup trước khi xử lý
            this.closePopup();

            // Show loading indicator
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'bulk-audit-loading';
            loadingMsg.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 24px 32px;
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                z-index: 10000;
                font-size: 16px;
                font-weight: 600;
                text-align: center;
            `;
            loadingMsg.innerHTML = `
                <div style="margin-bottom: 12px;">🔄</div>
                <div>処理中... / Đang xử lý...</div>
                <div style="font-size: 13px; margin-top: 8px; color: #666;">${count}件 / ${count} mục</div>
            `;
            document.body.appendChild(loadingMsg);

            // Kiểm tra InventoryManager có sẵn không
            if (!window.InventoryManager) {
                console.error('[BulkInventoryFAB] InventoryManager not available');
                document.body.removeChild(loadingMsg);
                alert('❌ システムエラー / Lỗi hệ thống: InventoryManager not loaded');
                return;
            }

            // Thực hiện bulk audit
            const auditPromises = selectedItems.map(item => {
                return new Promise((resolve, reject) => {
                    try {
                        // Gọi recordAudit cho từng item
                        const itemId = item.id || item.itemId;
                        const itemType = item.type || item.itemType || 'mold';
                        
                        if (!itemId) {
                            console.warn('[BulkInventoryFAB] Item missing ID:', item);
                            resolve({ success: false, item });
                            return;
                        }

                        // Gọi hàm recordAudit của InventoryManager
                        if (typeof InventoryManager.recordAudit === 'function') {
                            InventoryManager.recordAudit(itemId, itemType)
                                .then(() => resolve({ success: true, item }))
                                .catch(err => {
                                    console.error('[BulkInventoryFAB] Audit failed for:', itemId, err);
                                    resolve({ success: false, item, error: err });
                                });
                        } else {
                            // Fallback: Tạo statuslog entry trực tiếp
                            const now = new Date().toISOString();
                            const auditLog = {
                                MoldID: itemId,
                                Status: 'AUDIT',
                                Timestamp: now,
                                Notes: `Bulk audit (${count} items)`,
                                pending: true
                            };
                            
                            // Thêm vào DataManager
                            if (window.DataManager?.data?.statuslogs) {
                                DataManager.data.statuslogs.push(auditLog);
                            }
                            
                            // Dispatch event
                            document.dispatchEvent(new CustomEvent('inventory:auditRecorded', {
                                detail: { itemId, itemType, date: now }
                            }));
                            
                            resolve({ success: true, item });
                        }
                    } catch (err) {
                        console.error('[BulkInventoryFAB] Exception during audit:', err);
                        resolve({ success: false, item, error: err });
                    }
                });
            });

            // Đợi tất cả promises hoàn thành
            Promise.all(auditPromises)
                .then(results => {
                    // Remove loading
                    if (loadingMsg.parentNode) {
                        document.body.removeChild(loadingMsg);
                    }

                    // Đếm số thành công
                    const successCount = results.filter(r => r.success).length;
                    const failCount = count - successCount;

                    console.log(`[BulkInventoryFAB] Audit complete: ${successCount}/${count} success`);

                    // Dispatch bulk event
                    document.dispatchEvent(new CustomEvent('inventory:bulkAuditCompleted', {
                        detail: { 
                            items: selectedItems,
                            date: new Date().toISOString(),
                            count: successCount
                        }
                    }));

                    // Clear selection
                    if (typeof SelectionManager.clear === 'function') {
                        SelectionManager.clear();
                    }

                    // Show result
                    if (failCount === 0) {
                        alert(`✅ ${successCount}件の棚卸しが完了しました\n\n✅ Đã kiểm kê thành công ${successCount} mục`);
                    } else {
                        alert(`⚠️ ${successCount}件成功、${failCount}件失敗\n\n⚠️ Thành công: ${successCount}, Thất bại: ${failCount}`);
                    }

                    // Re-render UI
                    if (window.UIRenderer && window.UIRenderer.renderResults) {
                        const allResults = window.UIRenderer.state?.allResults || [];
                        UIRenderer.renderResults(allResults);
                    }
                })
                .catch(err => {
                    console.error('[BulkInventoryFAB] Bulk audit error:', err);
                    if (loadingMsg.parentNode) {
                        document.body.removeChild(loadingMsg);
                    }
                    alert('❌ 棚卸しに失敗しました / Kiểm kê thất bại');
                });
        },


        // ✅ MỚI (ĐÚNG - TẮT HẲN CHẾ ĐỘ KIỂM KÊ)
        exitBulkMode() {
            console.log('[BulkInventoryFAB] Exiting bulk mode...');
            
            const confirmMsg = '棚卸しモードを完全に終了しますか？\n選択中のアイテムはクリアされます。\n\nThoát hoàn toàn chế độ kiểm kê?\nCác mục đã chọn sẽ bị xóa.';
            if (!confirm(confirmMsg)) {
                return;
            }

            // 1. Tắt selection mode
            if (window.SelectionManager && typeof SelectionManager.setMode === 'function') {
                SelectionManager.setMode(false);
                SelectionManager.clear(); // Xóa các item đã chọn
            }

            // 2. Đồng bộ checkbox toggle về OFF
            const toggle = document.getElementById('selection-mode-toggle');
            if (toggle) {
                toggle.checked = false;
            }

            // 3. TẮT HẲN INVENTORY MODE (QUAN TRỌNG)
            if (window.InventoryState) {
                window.InventoryState.bulkMode = false;
                window.InventoryState.inventoryMode = false; // ← TẮT CHẾ ĐỘ KIỂM KÊ
                window.InventoryState.selectedItems = [];
            }

            // 4. Dispatch event tắt inventory mode
            document.dispatchEvent(new CustomEvent('inventoryModeChanged', {
                detail: { enabled: false }
            }));

            // 5. Dispatch event tắt selection mode
            document.dispatchEvent(new CustomEvent('selection:modeChanged', {
                detail: { enabled: false }
            }));

            // 6. Ẩn FAB và đóng popup
            this.hide();
            this.closePopup();

            // 7. Cập nhật badge trên nút kiểm kê (desktop)
            if (window.InventoryManager && typeof InventoryManager.updateInventoryBadge === 'function') {
                InventoryManager.updateInventoryBadge(false);
            }

            // 8. Re-render UI về chế độ bình thường
            if (window.UIRenderer && window.UIRenderer.renderResults) {
                const allResults = window.UIRenderer.state?.allResults || [];
                UIRenderer.renderResults(allResults);
            }

            console.log('[BulkInventoryFAB] ✅ Exited bulk mode completely (inventory mode OFF)');
            alert('✅ 棚卸しモードを終了しました / Đã thoát chế độ kiểm kê');
        }

    };

    // ========================================================================
    // EXPORT TO GLOBAL
    // ========================================================================
    window.BulkInventoryFAB = BulkInventoryFAB;

    // ========================================================================
    // AUTO-INIT
    // ========================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => BulkInventoryFAB.init(), { once: true });
    } else {
        BulkInventoryFAB.init();
    }

})();
