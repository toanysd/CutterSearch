/**
 * mobile-table-view-r7.0.7.js - FIXED CONFLICTS
 * 
 * Quản lý hiển thị dạng bảng (table view) RIÊNG cho mobile
 * - Tách biệt hoàn toàn với results-table-r6.9.js
 * - Sort logic riêng
 * - Event delegation không conflict
 */

(function() {
    'use strict';

    const MobileTableView = {
        // State management
        state: {
            currentView: 'card',
            allResults: [],
            currentPage: 1,
            pageSize: 50,
            selectedItems: new Set(),
            currentCategory: 'all',
            
            // Sort state
            sortColumn: null,
            sortDirection: 'asc'
        },

        // DOM elements cache
        elements: {},

        /**
         * Initialize module
         */
        init() {
            console.log('[MobileTableView] r7.0.7 Initializing...');
            
            // QUAN TRỌNG: Chỉ chạy trên iPhone (< 768px)
            // KHÔNG chạy trên iPad (768px+) và Desktop
            const screenWidth = window.innerWidth;
            
            if (screenWidth >= 768) {
                console.log(`[MobileTableView] Screen width: ${screenWidth}px - Tablet/Desktop detected, skipping init`);
                return;
            }
            
            console.log(`[MobileTableView] Screen width: ${screenWidth}px - iPhone detected, initializing...`);
            
            // Cache DOM elements
            this.cacheElements();
            
            // Bind events
            this.bindToggleButtons();
            this.bindTableEvents();
            this.bindPagination();
            this.bindSortHeaders();
            
            // Listen to search results updates
            this.listenToSearchResults();
            this.listenToCategoryChanges();
            
            console.log('[MobileTableView] ✅ Initialized (mobile only)');
        },

        /**
         * Cache DOM elements
         */
        cacheElements() {
            this.elements = {
                toggleButtons: document.querySelectorAll('#mobile-view-toggle .toggle-btn'),
                cardContainer: document.getElementById('quick-results-grid'),
                tableContainer: document.getElementById('mobile-table-container'),
                tableBody: document.getElementById('mobile-table-body'),
                table: document.getElementById('mobile-results-table'),
                pagination: document.getElementById('mobile-pagination'),
                selectAllCheckbox: document.getElementById('select-all-mobile'),
                
                // Toolbar in header
                toolbarInline: document.getElementById('table-toolbar-inline'),
                selectedCountInline: document.getElementById('selected-count-inline'),
                printBtnInline: document.getElementById('mobile-print-btn-inline'),
                
                currentPageSpan: document.getElementById('current-page'),
                totalPagesSpan: document.getElementById('total-pages'),
                prevPageBtn: document.getElementById('prev-page-btn'),
                nextPageBtn: document.getElementById('next-page-btn')
            };

            if (!this.elements.table) {
                console.error('[MobileTableView] ❌ mobile-results-table not found!');
            }
        },

        /**
         * Bind toggle buttons
         */
        bindToggleButtons() {
            if (!this.elements.toggleButtons || this.elements.toggleButtons.length === 0) {
                return;
            }

            this.elements.toggleButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const view = btn.getAttribute('data-view');
                    this.switchView(view);
                });
            });

            console.log('[MobileTableView] ✅ Toggle buttons bound');
        },

        /**
         * Bind sort headers
         */
        bindSortHeaders() {
            if (!this.elements.table) return;
            
            // QUAN TRỌNG: Chỉ bind cho mobile table, không dùng querySelector global
            const sortableHeaders = this.elements.table.querySelectorAll('th.sortable');
            
            sortableHeaders.forEach(th => {
                th.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sortKey = th.getAttribute('data-sort');
                    this.sortTable(sortKey);
                });
            });

            console.log('[MobileTableView] ✅ Sort headers bound:', sortableHeaders.length);
        },

        /**
         * Bind table events
         */
        bindTableEvents() {
            // Select all checkbox
            if (this.elements.selectAllCheckbox) {
                this.elements.selectAllCheckbox.addEventListener('change', (e) => {
                    this.toggleSelectAll(e.target.checked);
                });
            }

            // Print button inline
            if (this.elements.printBtnInline) {
                this.elements.printBtnInline.addEventListener('click', () => {
                    this.handlePrint();
                });
            }

            // Table body checkbox delegation - QUAN TRỌNG: Chỉ trong mobile table
            if (this.elements.tableBody) {
                this.elements.tableBody.addEventListener('change', (e) => {
                    if (e.target.type === 'checkbox' && e.target.classList.contains('row-checkbox')) {
                        const itemId = e.target.getAttribute('data-id');
                        const itemType = e.target.getAttribute('data-type');
                        this.toggleItemSelection(itemId, itemType, e.target.checked);
                    }
                });
                
                // Backup: click event
                this.elements.tableBody.addEventListener('click', (e) => {
                    if (e.target.type === 'checkbox' && e.target.classList.contains('row-checkbox')) {
                        const itemId = e.target.getAttribute('data-id');
                        const itemType = e.target.getAttribute('data-type');
                        setTimeout(() => {
                            this.toggleItemSelection(itemId, itemType, e.target.checked);
                        }, 0);
                    }
                });
            }

            console.log('[MobileTableView] ✅ Table events bound');
        },

        /**
         * Bind pagination
         */
        bindPagination() {
            if (this.elements.prevPageBtn) {
                this.elements.prevPageBtn.addEventListener('click', () => {
                    this.goToPreviousPage();
                });
            }

            if (this.elements.nextPageBtn) {
                this.elements.nextPageBtn.addEventListener('click', () => {
                    this.goToNextPage();
                });
            }

            console.log('[MobileTableView] ✅ Pagination bound');
        },

        /**
         * Listen to search results
         */
        listenToSearchResults() {
            document.addEventListener('search:updated', (e) => {
                const { results } = e.detail || {};
                if (results && Array.isArray(results)) {
                    console.log('[MobileTableView] Search results updated:', results.length);
                    this.updateResults(results);
                }
            });
        },

        /**
         * Listen to category changes
         */
        listenToCategoryChanges() {
            document.addEventListener('categoryChanged', (e) => {
                const { category } = e.detail || {};
                if (category) {
                    this.state.currentCategory = category;
                    this.state.currentPage = 1;
                    
                    if (this.state.currentView === 'table') {
                        this.renderTable();
                    }
                }
            });
        },

        /**
         * Switch view
         */
        switchView(view) {
            if (view === this.state.currentView) return;

            console.log('[MobileTableView] Switching to', view);
            this.state.currentView = view;

            // Update toggle buttons
            this.elements.toggleButtons.forEach(btn => {
                if (btn.getAttribute('data-view') === view) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Show/hide
            if (view === 'table') {
                this.elements.cardContainer.style.display = 'none';
                this.elements.tableContainer.style.display = 'flex';
                
                if (this.elements.toolbarInline) {
                    this.elements.toolbarInline.style.display = 'flex';
                }
                
                this.renderTable();
            } else {
                this.elements.cardContainer.style.display = 'grid';
                this.elements.tableContainer.style.display = 'none';
                
                if (this.elements.toolbarInline) {
                    this.elements.toolbarInline.style.display = 'none';
                }
            }

            document.dispatchEvent(new CustomEvent('mobile:viewModeChanged', {
                detail: { view }
            }));

            console.log('[MobileTableView] ✅ Switched to', view);
        },

        /**
         * Update results
         */
        updateResults(results) {
            this.state.allResults = results || [];
            this.state.currentPage = 1;
            this.state.selectedItems.clear();

            if (this.state.currentView === 'table') {
                this.renderTable();
            }

            this.updateSelectionUI();
        },

        /**
         * Render table
         */
        renderTable() {
            if (!this.elements.tableBody) {
                console.error('[MobileTableView] Table body not found');
                return;
            }

            const totalItems = this.state.allResults.length;
            const totalPages = Math.ceil(totalItems / this.state.pageSize);
            const startIdx = (this.state.currentPage - 1) * this.state.pageSize;
            const endIdx = Math.min(startIdx + this.state.pageSize, totalItems);
            const pageItems = this.state.allResults.slice(startIdx, endIdx);

            console.log('[MobileTableView] Rendering:', pageItems.length, 'items');

            // Clear
            this.elements.tableBody.innerHTML = '';

            // Render rows
            if (pageItems.length === 0) {
                this.elements.tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                            検索結果なし
                        </td>
                    </tr>
                `;
            } else {
                pageItems.forEach(item => {
                    const row = this.createTableRow(item);
                    this.elements.tableBody.appendChild(row);
                });
            }

            // Update pagination
            this.updatePaginationUI(totalPages);

            console.log('[MobileTableView] ✅ Table rendered');
        },

        /**
         * Create table row - COMPLETE VERSION
         */
        createTableRow(item) {
            const tr = document.createElement('tr');
            const isMold = item.itemType === 'mold';
            const itemId = isMold ? (item.MoldID || item.MoldCode) : (item.CutterID || item.CutterNo);
            const isSelected = this.state.selectedItems.has(itemId);

            // === COL 1: Checkbox ===
            const tdCheckbox = document.createElement('td');
            tdCheckbox.className = 'col-select';
            tdCheckbox.innerHTML = `
                <input type="checkbox" 
                       class="row-checkbox" 
                       data-id="${this.escapeHtml(itemId)}"
                       data-type="${item.itemType}"
                       ${isSelected ? 'checked' : ''}>
            `;

            // === COL 2: Code (MoldID / CutterNo) ===
            const tdCode = document.createElement('td');
            tdCode.className = 'col-code';
            if (isMold) {
                tdCode.textContent = item.MoldID || '-';
                tdCode.style.cssText = 'color: #1976D2 !important; font-weight: 600 !important;';
            } else {
                tdCode.textContent = item.CutterNo || item.displayCode || '-';
                tdCode.style.cssText = 'color: #E65100 !important; font-weight: 600 !important;';
            }

            // === COL 3: Name (clickable) ===
            const tdName = document.createElement('td');
            tdName.className = 'col-name';
            tdName.textContent = item.displayName || item.MoldName || '-';
            
            if (isMold) {
                tdName.style.cssText = 'color: #1976D2 !important; font-weight: 500; cursor: pointer; text-decoration: underline;';
            } else {
                tdName.style.cssText = 'color: #E65100 !important; font-weight: 500; cursor: pointer; text-decoration: underline;';
            }
            
            tdName.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDetailModal(item, itemId);
            });

            // === COL 4: Size ===
            const tdSize = document.createElement('td');
            tdSize.className = 'col-size';
            tdSize.textContent = item.displayDimensions || item.cutlineSize || 'N/A';
            tdSize.style.color = '#666';

            // === COL 5: Location (Rack-Layer) ===
            const tdLocation = document.createElement('td');
            tdLocation.className = 'col-location';
            const rackId = item.rackInfo?.RackID || '-';
            const layerNum = item.rackLayerInfo?.RackLayerNumber || '-';
            tdLocation.textContent = `${rackId}-${layerNum}`;
            
            tdLocation.style.cssText = 'font-family: "Courier New", monospace; font-weight: 600; text-align: center;';
            if (rackId !== '-') {
                const rackNum = parseInt(rackId);
                if (rackNum >= 70) {
                    tdLocation.style.cssText += ' color: #D32F2F !important; background: #FFEBEE !important;';
                } else {
                    tdLocation.style.cssText += ' color: #1976D2 !important; background: #E3F2FD !important;';
                }
            }

            // === COL 6: Company ===
            const tdCompany = document.createElement('td');
            tdCompany.className = 'col-company';
            const companyName = item.storageCompanyInfo?.CompanyShortName || 
                               item.storageCompanyInfo?.CompanyName || 
                               'N/A';
            tdCompany.textContent = companyName;
            
            if (companyName === 'YSD' || item.storage_company === '2') {
                tdCompany.style.cssText = 'color: #1976D2 !important; font-weight: 600 !important; background: #E3F2FD !important;';
            } else if (companyName !== 'N/A') {
                tdCompany.style.cssText = 'color: #E65100 !important; font-weight: 600 !important; background: #FFF3E0 !important;';
            }

            // === COL 7: Date (DeliveryDeadline) ===
            const tdDate = document.createElement('td');
            tdDate.className = 'col-date';
            const deliveryDate = item.jobInfo?.DeliveryDeadline || 
                                item.MoldDate || 
                                item.DateEntry || 
                                '-';
            tdDate.textContent = this.formatDate(deliveryDate);
            tdDate.style.color = '#757575';

            // Add selected class
            if (isSelected) {
                tr.classList.add('selected');
            }

            // Append all columns IN ORDER
            tr.appendChild(tdCheckbox);
            tr.appendChild(tdCode);
            tr.appendChild(tdName);
            tr.appendChild(tdSize);
            tr.appendChild(tdLocation);
            tr.appendChild(tdCompany);
            tr.appendChild(tdDate);

            return tr;
        },

        /**
         * Format date
         */
        formatDate(dateStr) {
            if (!dateStr || dateStr === '-') return '-';
            
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return dateStr;
                
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                
                return `${year}/${month}/${day}`;
            } catch (e) {
                return dateStr;
            }
        },

        /**
         * Escape HTML
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * Update pagination UI
         */
        updatePaginationUI(totalPages) {
            if (this.elements.currentPageSpan) {
                this.elements.currentPageSpan.textContent = this.state.currentPage;
            }

            if (this.elements.totalPagesSpan) {
                this.elements.totalPagesSpan.textContent = totalPages || 1;
            }

            if (this.elements.prevPageBtn) {
                this.elements.prevPageBtn.disabled = this.state.currentPage <= 1;
            }

            if (this.elements.nextPageBtn) {
                this.elements.nextPageBtn.disabled = this.state.currentPage >= totalPages;
            }
        },

        /**
         * Go to previous page
         */
        goToPreviousPage() {
            if (this.state.currentPage > 1) {
                this.state.currentPage--;
                this.renderTable();
            }
        },

        /**
         * Go to next page
         */
        goToNextPage() {
            const totalPages = Math.ceil(this.state.allResults.length / this.state.pageSize);
            if (this.state.currentPage < totalPages) {
                this.state.currentPage++;
                this.renderTable();
            }
        },

        /**
         * Toggle select all
         */
        toggleSelectAll(checked) {
            const startIdx = (this.state.currentPage - 1) * this.state.pageSize;
            const endIdx = Math.min(startIdx + this.state.pageSize, this.state.allResults.length);
            const pageItems = this.state.allResults.slice(startIdx, endIdx);

            pageItems.forEach(item => {
                const isMold = item.itemType === 'mold';
                const itemId = isMold ? (item.MoldID || item.MoldCode) : (item.CutterID || item.CutterNo);
                
                if (checked) {
                    this.state.selectedItems.add(itemId);
                } else {
                    this.state.selectedItems.delete(itemId);
                }
            });

            // Update checkboxes
            const checkboxes = this.elements.tableBody.querySelectorAll('.row-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = checked;
            });

            // Update rows
            const rows = this.elements.tableBody.querySelectorAll('tr');
            rows.forEach(row => {
                if (checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            });

            this.updateSelectionUI();

            console.log('[MobileTableView] Select all:', checked, '| Total:', this.state.selectedItems.size);
        },

        /**
         * Toggle item selection
         */
        toggleItemSelection(itemId, itemType, checked) {
            if (checked) {
                this.state.selectedItems.add(itemId);
            } else {
                this.state.selectedItems.delete(itemId);
            }

            // Update row class
            const checkbox = this.elements.tableBody.querySelector(`input[data-id="${itemId}"]`);
            if (checkbox) {
                const row = checkbox.closest('tr');
                if (row) {
                    if (checked) {
                        row.classList.add('selected');
                    } else {
                        row.classList.remove('selected');
                    }
                }
            }

            // Update select all checkbox
            const totalCheckboxes = this.elements.tableBody.querySelectorAll('.row-checkbox').length;
            const checkedCheckboxes = this.elements.tableBody.querySelectorAll('.row-checkbox:checked').length;
            
            if (this.elements.selectAllCheckbox) {
                this.elements.selectAllCheckbox.checked = totalCheckboxes > 0 && totalCheckboxes === checkedCheckboxes;
                this.elements.selectAllCheckbox.indeterminate = checkedCheckboxes > 0 && checkedCheckboxes < totalCheckboxes;
            }

            this.updateSelectionUI();

            console.log('[MobileTableView] Item selection:', itemId, checked, '| Total:', this.state.selectedItems.size);
        },

        /**
         * Update selection UI
         */
        updateSelectionUI() {
            const count = this.state.selectedItems.size;

            if (this.elements.selectedCountInline) {
                this.elements.selectedCountInline.textContent = count;
            }

            if (this.elements.printBtnInline) {
                this.elements.printBtnInline.disabled = count === 0;
            }
        },

        /**
         * Handle print
         */
        handlePrint() {
            const selectedIds = Array.from(this.state.selectedItems);
            
            if (selectedIds.length === 0) {
                alert('印刷する項目を選択してください\nVui lòng chọn mục để in');
                return;
            }

            const selectedItems = this.state.allResults.filter(item => {
                const isMold = item.itemType === 'mold';
                const itemId = isMold ? (item.MoldID || item.MoldCode) : (item.CutterID || item.CutterNo);
                return selectedIds.includes(itemId);
            });

            document.dispatchEvent(new CustomEvent('mobile:printRequested', {
                detail: {
                    items: selectedItems,
                    category: this.state.currentCategory
                }
            }));

            console.log('[MobileTableView] ✅ Print event dispatched');
        },

        /**
         * Open detail modal
         */
        openDetailModal(item, itemId) {
            console.log('[MobileTableView] Opening detail modal for:', itemId);
            
            document.dispatchEvent(new CustomEvent('quick:select', {
                detail: {
                    itemType: item.itemType,
                    itemId: itemId,
                    fullData: item
                }
            }));
            
            if (window.MobileDetailModal && typeof window.MobileDetailModal.open === 'function') {
                window.MobileDetailModal.open(item.itemType, itemId);
            }
        },

        /**
         * Sort table
         */
        sortTable(sortKey) {
            console.log('[MobileTableView] Sorting by:', sortKey);
            
            // Toggle direction
            if (this.state.sortColumn === sortKey) {
                this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.state.sortColumn = sortKey;
                this.state.sortDirection = 'asc';
            }
            
            // Sort
            this.state.allResults.sort((a, b) => {
                let valA, valB;
                
                switch (sortKey) {
                    case 'code':
                        valA = a.itemType === 'mold' ? (a.MoldID || 0) : (a.CutterNo || '');
                        valB = b.itemType === 'mold' ? (b.MoldID || 0) : (b.CutterNo || '');
                        if (typeof valA === 'number' && typeof valB === 'number') {
                            return valA - valB;
                        }
                        return String(valA).localeCompare(String(valB));
                        
                    case 'name':
                        valA = a.displayName || a.MoldName || '';
                        valB = b.displayName || b.MoldName || '';
                        return valA.localeCompare(valB, 'ja');
                        
                    case 'size':
                        valA = a.displayDimensions || a.cutlineSize || '';
                        valB = b.displayDimensions || b.cutlineSize || '';
                        return valA.localeCompare(valB);
                        
                    case 'location':
                        const rackA = parseInt(a.rackInfo?.RackID || 999);
                        const rackB = parseInt(b.rackInfo?.RackID || 999);
                        if (rackA !== rackB) return rackA - rackB;
                        
                        const layerA = parseInt(a.rackLayerInfo?.RackLayerNumber || 999);
                        const layerB = parseInt(b.rackLayerInfo?.RackLayerNumber || 999);
                        return layerA - layerB;
                        
                    case 'company':
                        valA = a.storageCompanyInfo?.CompanyShortName || 
                               a.storageCompanyInfo?.CompanyName || 'ZZZ';
                        valB = b.storageCompanyInfo?.CompanyShortName || 
                               b.storageCompanyInfo?.CompanyName || 'ZZZ';
                        return valA.localeCompare(valB);
                        
                    case 'date':
                        valA = a.jobInfo?.DeliveryDeadline || a.MoldDate || a.DateEntry || '';
                        valB = b.jobInfo?.DeliveryDeadline || b.MoldDate || b.DateEntry || '';
                        if (!valA) return 1;
                        if (!valB) return -1;
                        return new Date(valA) - new Date(valB);
                        
                    default:
                        return 0;
                }
            });
            
            // Reverse if desc
            if (this.state.sortDirection === 'desc') {
                this.state.allResults.reverse();
            }
            
            // Update UI
            this.updateSortIndicators();
            
            // Reset to page 1
            this.state.currentPage = 1;
            this.renderTable();
            
            console.log('[MobileTableView] ✅ Sorted:', sortKey, this.state.sortDirection);
        },

        /**
         * Update sort indicators
         */
        updateSortIndicators() {
            if (!this.elements.table) return;
            
            // Remove all sort classes
            const allHeaders = this.elements.table.querySelectorAll('th.sortable');
            allHeaders.forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
            });
            
            // Add to current column
            if (this.state.sortColumn) {
                const activeHeader = this.elements.table.querySelector(
                    `th.sortable[data-sort="${this.state.sortColumn}"]`
                );
                if (activeHeader) {
                    activeHeader.classList.add(`sort-${this.state.sortDirection}`);
                }
            }
        },

        /**
         * Get selected items
         */
        getSelectedItems() {
            return Array.from(this.state.selectedItems);
        },

        /**
         * Clear selection
         */
        clearSelection() {
            this.state.selectedItems.clear();
            
            if (this.elements.selectAllCheckbox) {
                this.elements.selectAllCheckbox.checked = false;
            }

            const checkboxes = this.elements.tableBody.querySelectorAll('.row-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = false;
            });

            const rows = this.elements.tableBody.querySelectorAll('tr');
            rows.forEach(row => {
                row.classList.remove('selected');
            });

            this.updateSelectionUI();

            console.log('[MobileTableView] ✅ Selection cleared');
        }
    };

    // Expose to global
    window.MobileTableView = MobileTableView;

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MobileTableView.init();
        });
    } else {
        MobileTableView.init();
    }

})();
