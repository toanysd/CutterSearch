/* ============================================================================
   RESULTS CARD RENDERER v8.0.4-3
   Exact Copy from Mockup r8.1.0 Design

   Created: 2026-01-27

   Changes from v8.0.4-2:
   - Match exact mockup r8.1.0 card design
   - Dual button footer: 詳細/Xem chi tiết + 編作/Thao tác
   - Gradient background from type color to white
   - Improved data mapping and layout

============================================================================ */


class ResultsCardRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.items = [];
        this.selectedItems = new Set();
        this.itemsPerPage = 50;
        this.currentPage = 1;

        // Callbacks
        this.onItemClick = null;
        this.onSelectionChange = null;

        this.init();
    }

    init() {
        // Card detail button - mở detail panel
        document.addEventListener('click', (e) => {
            const detailBtn = e.target.closest('.card-detail-btn');
            if (detailBtn) {
                e.preventDefault();
                const itemId = (detailBtn.dataset.id || '').trim();

                if (this.onItemClick) {
                const item = this.items.find(it => {
                    const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                    return String(id).trim() === String(itemId);
                });
                if (item) this.onItemClick(item);
                }
            }
        }, true);


        // Card action button - mở action menu/modal
        document.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.card-action-btn');
            if (actionBtn) {
                e.preventDefault();

                const itemId = (actionBtn.dataset.id || '').trim();
                const item = this.items.find(it => {
                const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                return String(id).trim() === String(itemId);
                });

                if (!item) return;

                this.openCardActionMenu(actionBtn, item);
            }
        }, true);


        // Zoom button handler
        document.addEventListener('click', (e) => {
            const zoomBtn = e.target.closest('.image-zoom-btn');
            if (zoomBtn) {
                e.stopPropagation();
                const itemId = zoomBtn.dataset.id;
                console.log('Zoom image for item:', itemId);
                // TODO: Implement image zoom logic
                alert('🔍 画像拡大機能 / Chức năng phóng to ảnh\n開発中... / Đang phát triển...');
            }
        });

        // Location link handler
        document.addEventListener('click', (e) => {
            const locationLink = e.target.closest('.location-link');
            if (locationLink) {
                e.preventDefault();
                e.stopPropagation();
                
                const rackId = locationLink.dataset.rackId;
                const layerId = locationLink.dataset.layerId;
                
                console.log('Open rack map:', { rackId, layerId });
                // TODO: Open rack map or location image
                alert(`📍 位置マップ / Bản đồ vị trí\nRack: ${rackId}\n開発中... / Đang phát triển...`);
            }
        });

        // Checkbox handler
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('card-checkbox')) {
                const itemId = parseInt(e.target.dataset.id);
                if (e.target.checked) {
                    this.selectedItems.add(itemId);
                } else {
                    this.selectedItems.delete(itemId);
                }

                // Update card visual state
                const card = e.target.closest('.result-card');
                if (card) {
                    card.classList.toggle('selected', e.target.checked);
                }

                // Notify parent
                if (this.onSelectionChange) {
                    this.onSelectionChange(Array.from(this.selectedItems));
                }
            }
        });
    }

    openCardActionMenu(buttonEl, item) {
        this.closeCardActionMenu();

        const rect = buttonEl.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'card-action-menu-v8';
        menu.style.position = 'fixed';
        menu.style.zIndex = '40000';
        menu.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 210)) + 'px';
        menu.style.top = Math.min(rect.bottom + 8, window.innerHeight - 180) + 'px';
        menu.style.width = '200px';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #e0e0e0';
        menu.style.borderRadius = '10px';
        menu.style.boxShadow = '0 10px 25px rgba(0,0,0,0.18)';
        menu.style.padding = '10px';

        const code = item.code || item.MoldCode || item.CutterNo || item.displayCode || '';

        menu.innerHTML = `
            <div style="font-weight:700;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${String(code)}</div>
            <button class="cam-btn-detail" style="width:100%;padding:10px;border-radius:8px;border:1px solid #1976d2;background:#1976d2;color:#fff;font-weight:700;cursor:pointer;">Chi tiết</button>
            <div style="height:8px;"></div>
            <button class="cam-btn-close" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;background:#f7f7f7;cursor:pointer;">Đóng</button>
        `;

        menu.querySelector('.cam-btn-detail').addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.closeCardActionMenu();
            if (this.onItemClick) this.onItemClick(item);
        });

        menu.querySelector('.cam-btn-close').addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.closeCardActionMenu();
        });

        // Click ra ngoài thì đóng
        const onOutside = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== buttonEl) {
            this.closeCardActionMenu();
            document.removeEventListener('click', onOutside, true);
            }
        };
        document.addEventListener('click', onOutside, true);

        document.body.appendChild(menu);
        this._cardActionMenuEl = menu;
        }

        closeCardActionMenu() {
        if (this._cardActionMenuEl) {
            this._cardActionMenuEl.remove();
            this._cardActionMenuEl = null;
        }
    }

    /**
     * Render cards from items array
     */
    render(items, page = 1) {
        this.items = items;
        this.currentPage = page;
        // Tính tổng số trang
        this.totalPages = Math.ceil(items.length / this.itemsPerPage);

        if (!this.container) {
            console.error('Card container not found');
            return;
        }

        // Clear container
        this.container.innerHTML = '';

        // Empty state
        if (!items || items.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate pagination
        const startIdx = (page - 1) * this.itemsPerPage;
        const endIdx = startIdx + this.itemsPerPage;
        const pageItems = items.slice(startIdx, endIdx);

        // Render cards
        pageItems.forEach(item => {
        const card = this.createCard(item);
        this.container.appendChild(card);
        });

        // Đồng bộ checkbox với selectedItems
        this.updateCheckboxes();

        // Pagination được xử lý bởi app.js
    }


    /**
     * Create card element - Exact mockup r8.1.0 design
     */
    createCard(item) {
        const card = document.createElement('div');
        card.className = 'result-card';

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        card.dataset.id = itemId;
        card.dataset.type = item.type;

        // Check if selected
        if (this.selectedItems.has(itemId)) {
            card.classList.add('selected');
        }

        // Get data with correct mapping
        const code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');

        // Product name: Priority TrayInfoForMoldDesign > MoldName/CutterName
        let productName = '';
        if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
            productName = item.designInfo.TrayInfoForMoldDesign;
        } else {
            productName = item.type === 'mold' 
                ? (item.MoldName || '') 
                : (item.CutterName || item.CutterDesignName || '');
        }

        const dimensions = item.dimensions || 'N/A';
        
        // Lấy vị trí theo format RackID-LayerNumber
        const rackLocation = this.getRackLocation(item);
        const location = rackLocation.display;
        
        // Lấy trạng thái từ statuslogs
        const statusInfo = this.getLatestStatus(item);
        const statusClass = statusInfo.status ? statusInfo.status.toLowerCase() : '';
        const statusLabel = this.getStatusLabel(statusInfo.status);
        const statusDate = statusInfo.date ? this.formatDate(statusInfo.date) : '';
        
        const company = item.company || '-';


        // Type info
        const itemType = item.type === 'mold' ? 'mold' : 'cutter';
        const typeBadge = item.type === 'mold' ? '金型' : '抜型';
        const typeIcon = item.type === 'mold' ? 'cube' : 'cut';

                // Card HTML - Exact mockup structure r8.1.0
        card.innerHTML = `
            <!-- Checkbox - Top Left -->
            <input type="checkbox" 
                   class="card-checkbox" 
                   data-id="${itemId}" 
                   ${this.selectedItems.has(itemId) ? 'checked' : ''}>
            
            <!-- Type Badge - Top Right -->
            <div class="item-type-badge ${itemType}">${typeBadge}</div>
            
            <!-- Thumbnail Area -->
            <div class="card-thumbnail">
                <div class="placeholder-icon">
                    <i class="fas fa-${typeIcon}"></i>
                </div>
                
                <!-- Zoom Button - Bottom Right -->
                <button class="image-zoom-btn" 
                        data-id="${itemId}" 
                        title="拡大 / Phóng to ảnh"
                        onclick="event.stopPropagation();">
                    <i class="fas fa-search-plus"></i>
                </button>
            </div>
            
            <!-- Card Body -->
            <div class="card-body">
                <!-- ID Label -->
                <div class="item-id">ID: ${itemId}</div>
                
                <!-- Code - Bold -->
                <div class="item-code">${code}</div>
                
                <!-- Product Name -->
                <div class="item-name">${productName}</div>
                
                <!-- Dimensions - Green -->
                <div class="item-dimensions">
                    <i class="fas fa-ruler-combined"></i>
                    ${dimensions}
                </div>
                
                <!-- Meta Info Group: Location + Status + Date -->
                <div class="item-meta-group">
                    <!-- Location - Blue (clickable) -->
                    <div class="meta-item location">
                        <i class="fas fa-map-marker-alt"></i>
                        <a href="#" class="location-link" 
                           data-rack-id="${rackLocation.rackId || ''}" 
                           data-layer-id="${rackLocation.rackLayerId || ''}"
                           onclick="event.stopPropagation(); event.preventDefault();">
                            ${location}
                        </a>
                    </div>
                    
                    ${statusInfo.status ? `
                    <!-- Status Badge -->
                    <div class="meta-item status ${statusClass}">
                        ${statusLabel}
                    </div>
                    ` : '<div class="meta-item status">-</div>'}
                    
                    <!-- Update Date - Right aligned -->
                    <div class="meta-item date">
                        <i class="fas fa-calendar-alt"></i>
                        ${statusDate || '-'}
                    </div>
                </div>
            </div>
            
            <!-- Card Footer - Dual Buttons -->
            <div class="card-footer">
                <button class="card-detail-btn" 
                        data-id="${itemId}" 
                        data-type="${itemType}"
                        onclick="event.stopPropagation();">
                    <i class="fas fa-info-circle"></i>
                    <span>詳細 / Xem chi tiết</span>
                </button>
                
                <button class="card-action-btn" 
                        data-id="${itemId}" 
                        data-type="${itemType}"
                        onclick="event.stopPropagation();">
                    <i class="fas fa-cog"></i>
                    <span>操作 / Thao tác</span>
                </button>
            </div>
        `;

        return card;
    }


    /**
     * Render empty state
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <div class="empty-state-text">
                    検索結果がありません / Không có kết quả
                </div>
                <div class="empty-state-subtext">
                    検索条件を変更してください<br>
                    Vui lòng thay đổi điều kiện tìm kiếm
                </div>
            </div>
        `;
    }

    /**
     * Get total pages
     */
    getTotalPages() {
        return Math.ceil(this.items.length / this.itemsPerPage);
    }

    /**
     * Get selected items
     */
    getSelectedItems() {
        return this.items.filter(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            return this.selectedItems.has(id);
        });
    }

    /**
     * Select all items on current page
     */
    selectAll() {
        const pageItems = this.getCurrentPageItems();
        pageItems.forEach(item => {
        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        this.selectedItems.add(itemId);
        });
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Select ALL results (across all pages)
     */
    selectAllResults() {
        // Chọn TẤT CẢ items trong this.items (không chỉ trang hiện tại)
        this.items.forEach(item => {
        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        this.selectedItems.add(itemId);
        });
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange(Array.from(this.selectedItems));
        }
        console.log(`✅ Đã chọn TẤT CẢ ${this.selectedItems.size} kết quả`);
    }


    selectAllResults() {
        // Chọn toàn bộ items của kết quả tìm kiếm (mọi trang)
        this.selectedItems.clear();

        (this.items || []).forEach(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            const n = parseInt(id);
            if (!isNaN(n)) this.selectedItems.add(n);
        });

        // Cập nhật giao diện trang hiện tại
        const cards = this.container?.querySelectorAll('.result-card') || [];
        cards.forEach(card => {
            const id = parseInt(card.dataset.id);
            const checked = this.selectedItems.has(id);
            card.classList.toggle('selected', checked);

            const cb = card.querySelector('.card-checkbox');
            if (cb) cb.checked = checked;
        });

        if (this.onSelectionChange) {
            this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Deselect all items
     */
    deselectAll() {
        this.selectedItems.clear();
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange([]);
        }
    }

    /**
     * Update checkboxes to match selectedItems state
     */
    updateCheckboxes() {
        const checkboxes = this.container.querySelectorAll('.card-checkbox');
        checkboxes.forEach(checkbox => {
        const itemId = parseInt(checkbox.dataset.id);
        const isSelected = this.selectedItems.has(itemId);
        checkbox.checked = isSelected;
        
        // Update card visual state
        const card = checkbox.closest('.result-card');
        if (card) {
            card.classList.toggle('selected', isSelected);
        }
        });
    }


        /**
     * Lấy trạng thái mới nhất từ statuslogs.csv
     */
    getLatestStatus(item) {
        if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.statuslogs) {
            return { status: null, date: null };
        }

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        const idField = item.type === 'mold' ? 'MoldID' : 'CutterID';

        // Lọc các log của item này
        const logs = window.DataManager.data.statuslogs.filter(log => {
            return String(log[idField] || '').trim() === String(itemId).trim();
        });

        if (!logs || logs.length === 0) {
            return { status: null, date: null };
        }

        // Sắp xếp theo Timestamp (mới nhất trước)
        logs.sort((a, b) => {
            const dateA = new Date(a.Timestamp || 0);
            const dateB = new Date(b.Timestamp || 0);
            return dateB - dateA;
        });

        const latest = logs[0];
        return {
            status: latest.Status || null,
            date: latest.Timestamp || null,
            notes: latest.Notes || ''
        };
    }

    /**
     * Lấy thông tin vị trí dạng RackID-RackLayerNumber
     */
    getRackLocation(item) {
        if (!window.DataManager || !window.DataManager.data) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackLayerId = item.RackLayerID;
        if (!rackLayerId) {
            return { display: '-', rackId: null, layerNum: null };
        }

        // Tìm trong racklayers
        const rackLayer = window.DataManager.data.racklayers?.find(rl => 
            String(rl.RackLayerID).trim() === String(rackLayerId).trim()
        );

        if (!rackLayer) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackId = rackLayer.RackID;
        const layerNum = rackLayer.RackLayerNumber;

        // Tìm tên giá trong racks
        const rack = window.DataManager.data.racks?.find(r => 
            String(r.RackID).trim() === String(rackId).trim()
        );

        const rackName = rack?.RackName || rackId;
        
        return {
            display: `${rackName}-${layerNum}`,
            rackId: rackId,
            layerNum: layerNum,
            rackLayerId: rackLayerId
        };
    }

        /**
     * Chuyển status code thành label hiển thị
     */
    getStatusLabel(status) {
        if (!status) return '-';
        
        const labels = {
            'IN': '入庫 IN',
            'OUT': '出庫 OUT',
            'AUDIT': '棚卸 AUDIT',
            'DISPOSED': '廃棄',
            'RETURNED': '返却'
        };
        
        return labels[status.toUpperCase()] || status;
    }

    /**
     * Format ngày tháng
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date)) return dateStr;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}.${month}.${day}`;
        } catch (e) {
            return dateStr;
        }
    }

}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultsCardRenderer;
}
