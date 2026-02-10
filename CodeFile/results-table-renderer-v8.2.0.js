/* ============================================================================
   RESULTS TABLE RENDERER v8.0.4-6
   Fixed: Sticky columns, Use HTML controls, Better scrollbar
   Created: 2026-01-28

   Changes from v8.0.4-3:
   - Remove self-created controls (lock button, pagination)
   - Use HTML controls from index.html (id="lockBtn", .pagination)
   - Fix sticky column overlap issue
   - Fixed horizontal scrollbar at bottom
   - Better pagination with direct page input
   - Add first/last page navigation
   ============================================================================ */

// So sánh chuỗi theo số tự nhiên: 1, 2, 3, 9, 10, 11, 22...
function naturalCompare(a, b) {
  const ax = [];
  const bx = [];

  String(a).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    ax.push([$1 ? parseInt($1, 10) : Infinity, $2 || ""]);
  });
  String(b).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    bx.push([$1 ? parseInt($1, 10) : Infinity, $2 || ""]);
  });

  while (ax.length && bx.length) {
    const an = ax.shift();
    const bn = bx.shift();

    const diff = an[0] - bn[0] || an[1].localeCompare(bn[1]);
    if (diff) return diff;
  }
  return ax.length - bx.length;
}

class ResultsTableRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.items = [];
        this.filteredItems = [];
        this.selectedItems = new Set();

        // Mặc định: sort theo ngày chế tạo nhưng KHÔNG gắn với cột cụ thể
        this.sortColumn = null;        
        this.sortDirection = 'desc';   // Mới nhất lên đầu


        // Pagination
        this.itemsPerPage = 50;
        this.currentPage = 1;
        this.totalPages = 1;

        // Column filters state
        this.columnFilters = {};
        this.activeFilterPopup = null;

        // Lock/Unlock state
        this.isLocked = true;

        // Callbacks
        this.onItemClick = null;
        this.onSelectionChange = null;

        this.init();
    }

    init() {
        if (this.container && !this.container.querySelector('table')) {
            this.createTableStructure();
        }

        // Bind to existing HTML controls
        this.bindHTMLControls();

        // Close filter popup when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.column-filter-btn') && 
                !e.target.closest('.filter-popup')) {
                this.closeFilterPopup();
            }
        });

        console.log('✅ Table Renderer v8.0.4-4 initialized (Fixed sticky & controls)');
    }

    /**
     * Bind to existing HTML controls (Lock button, Pagination)
     */
    bindHTMLControls() {
        // Lock/Unlock button from HTML
        const lockBtn = document.getElementById('lockBtn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => {
                this.isLocked = !this.isLocked;
                this.updateLockState();
            });
        }

        // Pagination được xử lý bởi app.js
        // Không cần bind pagination controls ở đây

    }

    /**
     * Update lock state
     */
    updateLockState() {
        const lockBtn = document.getElementById('lockBtn');
        const scrollContainer = this.container.querySelector('.table-scroll-container');
        const lockText = document.getElementById('lockText');
        const lockIcon = lockBtn?.querySelector('i');

        if (this.isLocked) {
            lockBtn?.classList.remove('unlocked');
            lockBtn?.classList.add('locked');
            scrollContainer?.classList.remove('unlocked');
            if (lockIcon) lockIcon.className = 'fas fa-lock';
            if (lockText) lockText.textContent = 'Lock';
        } else {
            lockBtn?.classList.remove('locked');
            lockBtn?.classList.add('unlocked');
            scrollContainer?.classList.add('unlocked');
            if (lockIcon) lockIcon.className = 'fas fa-unlock';
            if (lockText) lockText.textContent = 'Unlock';
        }
    }

    /**
     * Go to specific page
     */
    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.renderRows();
    }

    /**
     * Create table HTML structure (simplified - no self controls)
     */
    createTableStructure() {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';

        wrapper.innerHTML = `
            <div class="table-scroll-container" id="tableScrollContainer">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th class="col-checkbox">
                                <input type="checkbox" id="selectAllTable">
                            </th>
                            <th class="col-id">
                                <div class="th-content">
                                    <span>ID</span>
                                    <button class="column-filter-btn" data-column="id">🔽</button>
                                </div>
                            </th>
                            <th class="col-code">
                                <div class="th-content">
                                    <span>コード / Mã</span>
                                    <button class="column-filter-btn" data-column="code">🔽</button>
                                </div>
                            </th>
                            <th class="col-name">
                                <div class="th-content">
                                    <span>製品情報 / Sản phẩm</span>
                                    <button class="column-filter-btn" data-column="name">🔽</button>
                                </div>
                            </th>
                            <th class="col-dimensions">
                                <div class="th-content">
                                    <span>寸法 / Kích thước</span>
                                    <button class="column-filter-btn" data-column="dimensions">🔽</button>
                                </div>
                            </th>
                            <th class="col-location">
                                <div class="th-content">
                                    <span>位置 / Vị trí</span>
                                    <button class="column-filter-btn" data-column="location">🔽</button>
                                </div>
                            </th>
                            <th class="col-type">
                                <div class="th-content">
                                    <span>種類 / Loại</span>
                                    <button class="column-filter-btn" data-column="type">🔽</button>
                                </div>
                            </th>
                            <th class="col-date">
                                <div class="th-content">
                                    <span>日付 / Ngày</span>
                                    <button class="column-filter-btn" data-column="date">🔽</button>
                                </div>
                            </th>
                            <th class="col-status">
                                <div class="th-content">
                                    <span>状態 / Trạng thái</span>
                                    <button class="column-filter-btn" data-column="status">🔽</button>
                                </div>
                            </th>
                            <th class="col-actions">操作</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody">
                        <!-- Rows will be inserted here -->
                    </tbody>
                </table>
            </div>
        `;

        this.container.appendChild(wrapper);

        // Bind events
        this.bindTableEvents();
    }

    /**
     * Bind table events
     */
    bindTableEvents() {
        const table = this.container.querySelector('.results-table');
        if (!table) return;

        // Select all checkbox
        const selectAll = table.querySelector('#selectAllTable');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                e.stopPropagation();
                this.toggleSelectAll(e.target.checked);
            });
        }

        // Column filter buttons
        table.querySelectorAll('.column-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const column = btn.dataset.column;
                this.openFilterPopup(column, btn);
            });
        });
        
        // ===== THÊM: Click header để sort =====
        table.querySelectorAll('th[class^="col-"]').forEach(th => {
            // Bỏ qua cột checkbox và actions
            if (th.classList.contains('col-checkbox') || th.classList.contains('col-actions')) {
                return;
            }
            
            th.addEventListener('click', (e) => {
                // Nếu click vào button filter, không sort
                if (e.target.closest('.column-filter-btn')) {
                    return;
                }

                // Click vào tiêu đề = sort
                const column = th.dataset.column || th.querySelector('.column-filter-btn')?.dataset.column;

                if (column && column !== 'checkbox' && column !== 'actions') {
                    if (this.sortColumn === column) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortColumn = column;
                        this.sortDirection = 'desc';
                    }

                    this.currentPage = 1;
                    this.applyFiltersAndSort();
                    this.calculatePagination();
                    this.renderRows();
                    this.updateAllFilterButtons();
                }
            });

        });
    }

    /**
     * Render items in table
     */
    render(items) {
        this.items = items;
        
        // KHÔNG reset currentPage - giữ nguyên trang hiện tại
                
        // Pagination
        this.applyFiltersAndSort();
        this.calculatePagination();
        
        // Đảm bảo currentPage không vượt quá tổng số trang
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
        
        // Render
        this.renderRows();
  
        // ===== THÊM: Cập nhật biểu tượng =====
        this.updateAllFilterButtons();
    }


    /**
     * Calculate pagination
     */
    calculatePagination() {
        this.totalPages = Math.ceil(this.filteredItems.length / this.itemsPerPage);
        if (this.totalPages < 1) this.totalPages = 1;
        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    }

    /**
     * Apply filters and sorting
     */
    applyFiltersAndSort() {
        let filtered = [...this.items];

        // Apply column filters
        Object.keys(this.columnFilters).forEach(column => {
            const filterValues = this.columnFilters[column];
            if (filterValues && filterValues.length > 0) {
                filtered = filtered.filter(item => {
                    const value = this.getColumnValue(item, column);
                    return filterValues.includes(value);
                });
            }
        });

        // ============ THÊM ĐOẠN NÀY ============
        // Apply sorting (mặc định theo ngày sản xuất nếu chưa sort)
        // Apply sorting
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            // Nếu sortColumn là null → sort theo NGÀY CHẾ TẠO mặc định
            if (this.sortColumn === null || this.sortColumn === 'productionDate') {
                // Lấy displayDate từ DataManager (NGÀY CHẾ TẠO - DeliveryDeadline)
                aVal = a.displayDate || '';
                bVal = b.displayDate || '';
                
                // Items không có ngày (rỗng) → coi như cũ nhất (1900-01-01)
                const aTime = aVal ? new Date(aVal).getTime() : new Date('1900-01-01').getTime();
                const bTime = bVal ? new Date(bVal).getTime() : new Date('1900-01-01').getTime();
                
                return this.sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
            } 
            // Nếu sortColumn === 'date' → sort theo NGÀY CẬP NHẬT (cột 日付)
            else if (this.sortColumn === 'date') {
                aVal = this.getColumnValue(a, 'date');  // Lấy từ getLatestStatus()
                bVal = this.getColumnValue(b, 'date');
                
                const aTime = aVal ? new Date(aVal).getTime() : new Date('1900-01-01').getTime();
                const bTime = bVal ? new Date(bVal).getTime() : new Date('1900-01-01').getTime();
                
                return this.sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
            } 
            // Các cột khác: dùng sort tự nhiên (natural)
            else {
            aVal = this.getColumnValue(a, this.sortColumn) || '';
            bVal = this.getColumnValue(b, this.sortColumn) || '';

            // Sort Kích thước theo số: Dài -> Rộng -> Cao
            if (this.sortColumn === 'dimensions') {
            const dirMul = this.sortDirection === 'asc' ? 1 : -1;

            const norm = (v) => {
                if (v === null || v === undefined) return '';
                return String(v).replace(/\s+/g, ' ').trim();
            };

            const parseNums = (v) => {
                const s = norm(v);
                if (!s || s === 'N/A') return null;
                const t = s.replace(/×/g, 'x').replace(/[X＊*]/g, 'x');
                const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(n => parseFloat(n)).filter(n => !isNaN(n));
                return nums.length ? nums.slice(0, 3) : null;
            };

            const da = parseNums(aVal);
            const db = parseNums(bVal);

            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;

            for (let i = 0; i < 3; i++) {
                const av = (da[i] === undefined) ? null : da[i];
                const bv = (db[i] === undefined) ? null : db[i];
                if (av === null && bv === null) continue;
                if (av === null) return 1;
                if (bv === null) return -1;
                if (av !== bv) return dirMul * (av - bv);
            }
            return 0;
            }

            const cmp = naturalCompare(String(aVal), String(bVal));
            return this.sortDirection === 'asc' ? cmp : -cmp;

            }

        });

        // ============ HẾT ĐOẠN THÊM ============

        this.filteredItems = filtered;

        // Thông báo cho App để đồng bộ với view thẻ
        document.dispatchEvent(new CustomEvent('table:filtered', {
            detail: {
                results: this.filteredItems,
                sortColumn: this.sortColumn,
                sortDirection: this.sortDirection
            }
        }));

    }

    /**
     * Get column value from item
     */
    getColumnValue(item, column) {
        switch (column) {
            case 'id':
                return item.type === 'mold' ? item.MoldID : item.CutterID;
            case 'code':
                return item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');
            case 'name':
                return this.getProductName(item);
            case 'dimensions':
                return item.dimensions || '';
            case 'location':
                return this.getRackLocation(item).display;
            case 'type':
                return item.type || '';
            case 'date':
                const statusInfo = this.getLatestStatus(item);
                return statusInfo.date || '';
            case 'status':
                const status = this.getLatestStatus(item);
                return status.status || '';
            default:
                return '';
        }
    }

    /**
     * Get product name - Match card renderer logic
     */
    getProductName(item) {
        // Priority: TrayInfoForMoldDesign > MoldName/CutterName
        if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
            return item.designInfo.TrayInfoForMoldDesign;
        }

        if (item.type === 'mold') {
            return item.MoldName || '';
        } else {
            return item.CutterName || item.CutterDesignName || '';
        }
    }

    /**
     * Get rack location (RackID-LayerNumber)
     */
    getRackLocation(item) {
        if (!window.DataManager || !window.DataManager.data) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackLayerId = item.RackLayerID;
        if (!rackLayerId) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackLayer = window.DataManager.data.racklayers?.find(rl => 
            String(rl.RackLayerID).trim() === String(rackLayerId).trim()
        );

        if (!rackLayer) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackId = rackLayer.RackID;
        const layerNum = rackLayer.RackLayerNumber;
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
     * Get latest status from statuslogs
     */
    getLatestStatus(item) {
        if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.statuslogs) {
            return { status: null, date: null };
        }

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        const idField = item.type === 'mold' ? 'MoldID' : 'CutterID';

        const logs = window.DataManager.data.statuslogs.filter(log => {
            return String(log[idField] || '').trim() === String(itemId).trim();
        });

        if (!logs || logs.length === 0) {
            return { status: null, date: null };
        }

        logs.sort((a, b) => {
            const dateA = new Date(a.Timestamp || 0);
            const dateB = new Date(b.Timestamp || 0);
            return dateB - dateA;
        });

        const latest = logs[0];
        return {
            status: latest.Status || null,
            date: latest.Timestamp || null
        };
    }

    /**
     * Format date
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

    /**
     * Get status label
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
     * Render table rows with pagination
     */
    renderRows() {
        const tbody = this.container.querySelector('#tableBody');
        if (!tbody) return;

        if (this.filteredItems.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="10">
                        <div class="empty-state">
                            <div style="font-size: 48px; opacity: 0.3; margin-bottom: 12px;">📭</div>
                            <p>結果が見つかりません / Không tìm thấy kết quả</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Calculate page range
        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredItems.length);
        const pageItems = this.filteredItems.slice(startIdx, endIdx);

        tbody.innerHTML = pageItems.map((item, index) => {
            const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
            const code = item.type === 'mold' ? (item.MoldCode || '-') : (item.CutterNo || '-');
            const productName = this.getProductName(item) || '-';
            const dimensions = item.dimensions || '-';
            const rackLocation = this.getRackLocation(item);
            const location = rackLocation.display;

            const typeBadge = item.type === 'mold' ? '金型' : '抜型';
            const typeClass = item.type || 'mold';

            const statusInfo = this.getLatestStatus(item);
            const statusClass = statusInfo.status ? statusInfo.status.toLowerCase() : '';
            const statusLabel = this.getStatusLabel(statusInfo.status);
            const statusDate = statusInfo.date ? this.formatDate(statusInfo.date) : '-';

            const isSelected = this.selectedItems.has(itemId);

            return `
                <tr data-id="${itemId}" data-type="${typeClass}" class="${isSelected ? 'selected' : ''}">
                    <td class="col-checkbox">
                        <input type="checkbox" 
                               class="row-checkbox" 
                               data-id="${itemId}" 
                               ${isSelected ? 'checked' : ''}>
                    </td>
                    <td class="col-id">${itemId}</td>
                    <td class="col-code highlight-code">${code}</td>
                    <td class="col-name">${productName}</td>
                    <td class="col-dimensions highlight-dimensions">${dimensions}</td>
                    <td class="col-location highlight-location">${location}</td>
                    <td class="col-type">
                        <span class="table-type-badge ${typeClass}">${typeBadge}</span>
                    </td>
                    <td class="col-date">${statusDate}</td>
                    <td class="col-status">
                        ${statusInfo.status ? `<span class="table-status-badge ${statusClass}">${statusLabel}</span>` : '-'}
                    </td>
                    <td class="col-actions">
                        <button class="table-action-btn" 
                                data-id="${itemId}" 
                                data-type="${typeClass}">
                            ⚙️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Đồng bộ checkbox với selectedItems
        this.updateCheckboxes();
        this.updateSelectAllState();
        
        // Bind row events
        this.bindRowEvents();
    }

    /**
     * Bind row events
     */
    bindRowEvents() {
        const tbody = this.container.querySelector('#tableBody');
        if (!tbody) return;

        // Checkbox events
        tbody.querySelectorAll('.row-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = parseInt(checkbox.dataset.id);
                if (checkbox.checked) {
                    this.selectedItems.add(id);
                } else {
                    this.selectedItems.delete(id);
                }
                this.updateRowSelection(id);
                this.updateSelectAllState();
                this.notifySelectionChange();
            });
        });

        // Row click (except checkbox and action button)
        const openDetailByRow = (row) => {
            const idStr = String(row.dataset.id || '').trim();
            if (!idStr) return;

            if (!this.onItemClick) return;

            const item = this.filteredItems.find(it => {
                const itemId = it.type === 'mold' ? it.MoldID : it.CutterID;
                return String(itemId).trim() === idStr;
            });

            if (item) this.onItemClick(item);
            };

            // Row click (except checkbox and action button)
            tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.row-checkbox') || e.target.closest('.table-action-btn')) return;
                openDetailByRow(row);
            });

            // Click đúng ô mã thì mở chi tiết (đúng yêu cầu)
            const codeCell = row.querySelector('td.col-code.highlight-code');
            if (codeCell) {
                codeCell.style.cursor = 'pointer';
                codeCell.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openDetailByRow(row);
                });
            }
        });


        // Action button
        tbody.querySelectorAll('.table-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const idStr = String(btn.dataset.id || '').trim();
                const item = this.filteredItems.find(it => {
                const itemId = it.type === 'mold' ? it.MoldID : it.CutterID;
                return String(itemId).trim() === idStr;
                });

                if (item && this.onItemClick) this.onItemClick(item);
            });
        });

    }

    /**
     * Toggle select all
     */
    toggleSelectAll(checked) {
        // Only select items on current page
        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredItems.length);
        const pageItems = this.filteredItems.slice(startIdx, endIdx);

        pageItems.forEach(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            if (checked) {
                this.selectedItems.add(id);
            } else {
                this.selectedItems.delete(id);
            }
        });

        this.renderRows();
        
        this.notifySelectionChange();
    }

    /**
     * Update row selection state
     */
    updateRowSelection(id) {
        const row = this.container.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            if (this.selectedItems.has(id)) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        }
    }

    /**
     * Update select all checkbox state
     */
    updateSelectAllState() {
        const selectAll = this.container.querySelector('#selectAllTable');
        if (!selectAll) return;

        // Check if all items on current page are selected
        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredItems.length);
        const pageItems = this.filteredItems.slice(startIdx, endIdx);

        const allSelected = pageItems.length > 0 && 
                           pageItems.every(item => {
                               const id = item.type === 'mold' ? item.MoldID : item.CutterID;
                               return this.selectedItems.has(id);
                           });

        selectAll.checked = allSelected;
    }

    /**
     * Notify selection change
     */
    notifySelectionChange() {
        if (this.onSelectionChange) {
            this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Open filter popup for column
     */
    openFilterPopup(column, buttonEl) {
        this.closeFilterPopup();

        const rect = buttonEl.getBoundingClientRect();
        const popup = this.createFilterPopup(column);

        document.body.appendChild(popup);

        // Position popup
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 5}px`;

        // Adjust if off screen
        const popupRect = popup.getBoundingClientRect();
        if (popupRect.right > window.innerWidth) {
            popup.style.left = `${window.innerWidth - popupRect.width - 10}px`;
        }
        if (popupRect.bottom > window.innerHeight) {
            popup.style.top = `${rect.top - popupRect.height - 5}px`;
        }

        this.activeFilterPopup = popup;
    }

    /**
     * Create filter popup
     */
    createFilterPopup(column) {
        const popup = document.createElement('div');
        popup.className = 'filter-popup';
        popup.dataset.column = column;

        // Get unique values for this column
        const uniqueValues = [...new Set(
            this.items.map(item => this.getColumnValue(item, column))
        )].filter(v => v).sort();

        const activeFilters = this.columnFilters[column] || [];

        popup.innerHTML = `
            <div class="filter-popup-header">
                <span class="filter-popup-title">フィルター / Filter</span>
                <button class="filter-popup-close">✕</button>
            </div>
            <div class="filter-popup-body">
                <div class="filter-sort-section">
                    <button class="filter-sort-btn" data-dir="asc">
                        ▲ 昇順 / Tăng dần
                    </button>
                    <button class="filter-sort-btn" data-dir="desc">
                        ▼ 降順 / Giảm dần
                    </button>
                </div>
                <div class="filter-divider"></div>
                <div class="filter-values-section">
                    <div class="filter-search">
                        <input type="text" 
                               class="filter-search-input" 
                               placeholder="検索 / Tìm kiếm...">
                    </div>
                    <div class="filter-select-all">
                        <label>
                            <input type="checkbox" class="filter-select-all-cb" ${activeFilters.length === 0 ? 'checked' : ''}>
                            <span>すべて選択 / Chọn tất cả</span>
                        </label>
                    </div>
                    <div class="filter-values-list">
                        ${uniqueValues.map(value => `
                            <label class="filter-value-item">
                                <input type="checkbox" 
                                       value="${value}" 
                                       ${activeFilters.length === 0 || activeFilters.includes(value) ? 'checked' : ''}>
                                <span>${value}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="filter-popup-footer">
                <button class="filter-clear-btn">クリア / Clear</button>
                <button class="filter-apply-btn">適用 / Apply</button>
            </div>
        `;

        // Bind popup events
        this.bindFilterPopupEvents(popup, column);

        return popup;
    }

    /**
     * Bind filter popup events
     */
    bindFilterPopupEvents(popup, column) {
        // Close button
        popup.querySelector('.filter-popup-close').addEventListener('click', () => {
            this.closeFilterPopup();
        });

        // Sort buttons
        popup.querySelectorAll('.filter-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.sortColumn = column;
                this.sortDirection = btn.dataset.dir;
                this.currentPage = 1;
                this.applyFiltersAndSort();
                this.calculatePagination();
                this.renderRows();
                this.updateAllFilterButtons();
                this.closeFilterPopup();
            });
        });

        // Search
        const searchInput = popup.querySelector('.filter-search-input');
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            popup.querySelectorAll('.filter-value-item').forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(query) ? '' : 'none';
            });
        });

        // Select all
        const selectAllCb = popup.querySelector('.filter-select-all-cb');
        selectAllCb.addEventListener('change', () => {
            const checked = selectAllCb.checked;
            popup.querySelectorAll('.filter-value-item input').forEach(cb => {
                cb.checked = checked;
            });
        });

        // Clear button
        popup.querySelector('.filter-clear-btn').addEventListener('click', () => {
            delete this.columnFilters[column];
            this.currentPage = 1;
            this.applyFiltersAndSort();
            this.calculatePagination();
            this.renderRows();

            this.updateFilterButtonState(column, false);
            this.closeFilterPopup();
        });

        // Apply button
        popup.querySelector('.filter-apply-btn').addEventListener('click', () => {
            const selectedValues = Array.from(
                popup.querySelectorAll('.filter-value-item input:checked')
            ).map(cb => cb.value);

            if (selectedValues.length === popup.querySelectorAll('.filter-value-item input').length) {
                delete this.columnFilters[column];
                this.updateFilterButtonState(column, false);
            } else {
                this.columnFilters[column] = selectedValues;
                this.updateFilterButtonState(column, true);
            }

            this.currentPage = 1;
            this.applyFiltersAndSort();
            this.calculatePagination();
            this.renderRows();

            this.closeFilterPopup();
        });
    }

    /**
     * Close filter popup
     */
    closeFilterPopup() {
        if (this.activeFilterPopup) {
            this.activeFilterPopup.remove();
            this.activeFilterPopup = null;
        }
    }

    /**
     * Update filter button active state
     */
    updateFilterButtonState(column, active) {
        const btn = this.container.querySelector(`.column-filter-btn[data-column="${column}"]`);
        if (!btn) return;
        
        // Kiểm tra xem cột này có đang được sắp xếp không
        const isSorted = this.sortColumn === column;
        
        // Xác định icon phù hợp
        let icon = '🔽'; // Icon mặc định
        
        if (isSorted) {
            // Nếu đang sort, hiển thị icon tam giác
            icon = this.sortDirection === 'asc' ? '▲' : '▼';
        }
        
        // Cập nhật icon
        btn.textContent = icon;
        
        // Sáng lên nếu có filter HOẶC đang sort
        if (active || isSorted) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }


    /**
     * Update ALL filter buttons - Sáng khi có filter hoặc sort
     */
    updateAllFilterButtons() {
        ['id', 'code', 'name', 'dimensions', 'location', 'type', 'date', 'status'].forEach(column => {
            const hasFilter = this.columnFilters[column] && this.columnFilters[column].length > 0;
            this.updateFilterButtonState(column, hasFilter);
        });
    }

    /**
     * Get total pages
     */
    getTotalPages() {
        return this.totalPages;
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedItems.clear();
        this.renderRows();
        this.updateSelectAllState();
        this.notifySelectionChange();
    }

    /**
     * Deselect all (alias)
     */
    deselectAll() {
        this.clearSelection();
    }

    /**
     * Select all on current page
     */
    selectAll() {
        this.toggleSelectAll(true);
    }

        /**
     * Select ALL results (all pages) - like card renderer
     */
    selectAllResults() {
        // Chọn tất cả items trong filteredItems
        this.selectedItems.clear();
        this.filteredItems.forEach(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            const n = parseInt(id);
            if (!isNaN(n)) {
                this.selectedItems.add(n);
            }
        });
        
        // Cập nhật giao diện
        this.renderRows();
        this.updateSelectAllState();
        this.notifySelectionChange();
        
        console.log(`✅ Đã chọn TẤT CẢ ${this.selectedItems.size} kết quả`);
    }

    /**
     * Update checkboxes to match selectedItems (sync across pages)
     */
    updateCheckboxes() {
        const rows = this.container.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const id = parseInt(row.dataset.id);
            const isSelected = this.selectedItems.has(id);
            
            // Update checkbox
            const checkbox = row.querySelector('.row-checkbox');
            if (checkbox) {
                checkbox.checked = isSelected;
            }
            
            // Update row visual
            row.classList.toggle('selected', isSelected);
        });
        
        // Update select-all checkbox
        this.updateSelectAllState();
    }

    /**
     * Get selected items
     */
    getSelectedItems() {
        return Array.from(this.selectedItems);
    }

    /**
     * Select items by IDs
     */
    selectItems(itemIds) {
        itemIds.forEach(id => this.selectedItems.add(id));
        this.renderRows();
        this.updateSelectAllState();
        this.notifySelectionChange();
    }

    /**
     * Toggle lock (for compatibility)
     */
    toggleLock() {
        this.isLocked = !this.isLocked;
        this.updateLockState();
    }

    needsReset() {
        // Có sort khác mặc định (null desc)?
        const hasSort = this.sortColumn !== null || this.sortDirection !== 'desc';
        const f = this.columnFilters || {};
        const hasFilter = Object.keys(f).some(k => f[k] && f[k].length > 0);
        return hasSort || hasFilter;
    }


}

// Export to window
window.ResultsTableRenderer = ResultsTableRenderer;
