/* ============================================================================
   APP v8.1.0-3 - Main Application Controller (SearchModule Integrated)
   Coordinates all modules and handles app logic
   Created: 2026-01-23
   Updated: 2026-01-29 (v8.1.0-1 - Integrated SearchModule)

   Compatible with:
   - data-manager-v8.0.3.js
   - search-module-v8.1.0.js (NEW!)
   - results-card-renderer-v8.0.4-4.js
   - results-table-renderer-v8.0.4-4.js
   - detail-panel-v8.0.3-1.js
   - mobile-navbar-v8.0.3-1.js

   Changes in v8.1.0-3:
   - Integrated SearchModule for multi-keyword, multi-field search
   - Listen to 'searchPerformed' event
   - Use searchModule.searchItems() instead of simple includes()
   - Support comma-separated keywords (e.g., "jae, ps")
============================================================================ */
const SIDEBAR_STATE_KEY = 'moldcutter_sidebar_v81';

class App {
  constructor() {
    this.allItems = [];
    this.filteredItems = [];
    this.currentView = 'card';
    this.currentPage = 1;
    this.itemsPerPage = 24;
    this.selectedCategory = 'all';
    this.searchQuery = '';
    this.selectedIds = new Set();
    this.isSyncingSelection = false;

    // Internal sync flags
    this._ignoreNextFilterApplied = false;

    // Modules
    this.searchModule = null; // NEW: SearchModule
    this.cardRenderer = null;
    this.tableRenderer = null;
    this.detailPanel = null;
    this.mobileNavbar = null;

    this.init();
  }

  async init() {
    console.log('🚀 Initializing MoldCutterSearch v8.1.0-1...');

    // Wait for DataManager to be ready
    await this.waitForDataManager();

    // Load data
    await this.loadData();

    // Initialize UI components
    this.initComponents();
    this.attachEventListeners();
    // Khôi phục trạng thái sidebar (mặc định: thu gọn)
    this.restoreSidebarState();

    this.updateUI();

    console.log('✅ App initialized successfully');
    console.log(`📊 Total items: ${this.allItems.length}`);
  }

  /**
   * Wait for DataManager to be ready
   */
  waitForDataManager() {
    return new Promise((resolve) => {
      if (window.DataManager && window.DataManager.isReady) {
        resolve();
      } else {
        document.addEventListener('data-manager:ready', () => {
          resolve();
        });
      }
    });
  }

  /**
   * Load data from DataManager
   */
  async loadData() {
    try {
      console.log('📊 Loading data...');
      if (window.DataManager) {
        this.allItems = window.DataManager.getAllItems();
        this.filteredItems = this.sortForCardView([...this.allItems]);
        console.log(`✅ Loaded ${this.allItems.length} items`);

        // Log data structure for debugging
        if (this.allItems.length > 0) {
          console.log('Sample item:', this.allItems[0]);
        }
      } else {
        console.warn('⚠️ DataManager not available, using empty data');
        this.allItems = [];
        this.filteredItems = [];
      }
    } catch (error) {
      console.error('❌ Error loading data:', error);
      this.allItems = [];
      this.filteredItems = [];
    }
  }

  /**
   * Initialize UI components
   */
  initComponents() {
    // NEW: Initialize SearchModule
    if (window.SearchModule) {
      this.searchModule = new SearchModule({
        historyMaxSize: 20,
        suggestionMaxSize: 10,
        searchDelay: 300
      });
      this.searchModule.init();
      console.log('✅ SearchModule initialized');
    } else {
      console.warn('⚠️ SearchModule not available, using basic search');
    }

    // Card Renderer (v8.0.4)
    this.cardRenderer = new ResultsCardRenderer('cardView');
    this.cardRenderer.onItemClick = (item) => this.handleItemClick(item);
    this.cardRenderer.onSelectionChange = (selected) => this.handleSelectionChange(selected);

    // Table Renderer (v8.0.4-4)
    this.tableRenderer = new ResultsTableRenderer('tableView');
    this.tableRenderer.onItemClick = (item) => this.handleItemClick(item);
    this.tableRenderer.onSelectionChange = (selected) => this.handleSelectionChange(selected);

    // Detail Panel (v8.0.3-1)
    //this.detailPanel = new DetailPanel('detailPanel');

    // Mobile Navbar (v8.0.3-1)
    this.mobileNavbar = new MobileNavbar('mobileNavbar');

    // Update initial counts
    this.updateCategoryDropdown();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // NEW: Listen to SearchModule events
    document.addEventListener('searchPerformed', (e) => {
      this.searchQuery = e.detail.query || '';
      this.applyFilters();
    });
    // Nhận kết quả đã lọc/sắp xếp từ bảng (TableRenderer)
    const _handleTableFiltered = (e) => {
      const detail = (e && e.detail) ? e.detail : {};

      // 1) Cập nhật mảng filteredItems để khi chuyển sang view thẻ dùng lại (kể cả 0 kết quả)
      if (Array.isArray(detail.results)) {
        this.filteredItems = detail.results;
      }

      // 2) Update số lượng kết quả ngay (table đã tự render, App chỉ cập nhật count)
      this.updateResultCount();

      // 3) Đồng bộ sort sang FilterModule (chỉ để UI sidebar hiển thị đúng)
      //    Lưu ý: FilterModule.setState() sẽ bắn event 'filterapplied', nên App phải bỏ qua 1 lần
      if (window.FilterModule && typeof window.FilterModule.setState === 'function') {
        const map = {
          productionDate: 'productionDate',
          date: 'productionDate',
          id: 'id',
          code: 'code',
          dimensions: 'size',
          location: 'location',
          company: 'company'
        };

        const sortCol = detail.sortColumn == null ? 'productionDate' : detail.sortColumn;
        const field = map[sortCol];
        if (field) {
          this._ignoreNextFilterApplied = true;
          window.FilterModule.setState({
            sort: {
              field,
              direction: detail.sortDirection || 'desc'
            },
            silent: true
          });

        }
      }
    };

    // Renderer v8.0.4-9 đang bắn event 'tablefiltered'
    document.addEventListener('tablefiltered', _handleTableFiltered);

    // Giữ tương thích nếu có code cũ bắn 'table:filtered'
    document.addEventListener('table:filtered', _handleTableFiltered);

    // Nhận kết quả lọc/sắp xếp từ Sidebar (FilterModule)
    document.addEventListener('filterapplied', (e) => {

      const detail = (e && e.detail) ? e.detail : {};

      // 1) Cập nhật danh sách kết quả (FilterModule đã lọc + sắp xếp sẵn)
      if (Array.isArray(detail.results)) {
        this.filteredItems = detail.results;
      } else {
        this.filteredItems = this.sortForCardView([...this.allItems]);
      }

      // 2) Đồng bộ category (dropdown phía trên)
      this.selectedCategory = detail.category || 'all';
      const categoryDropdown = document.getElementById('categoryDropdown');
      if (categoryDropdown) categoryDropdown.value = this.selectedCategory;

      // 3) Đồng bộ table state để bảng hiển thị cùng kiểu sort
      if (this.tableRenderer && detail.sort) {
        const field = detail.sort.field;
        const dir = detail.sort.direction || 'desc';

        // Reset filter cột của bảng để tránh bảng lọc thêm 1 lớp làm lệch với thẻ
        this.tableRenderer.columnFilters = {};

        // productionDate là sort mặc định của bảng (sortColumn = null)
        if (field === 'productionDate') {
          this.tableRenderer.sortColumn = null;
          this.tableRenderer.sortDirection = dir;
        } else if (field === 'id') {
          this.tableRenderer.sortColumn = 'id';
          this.tableRenderer.sortDirection = dir;
        } else if (field === 'code') {
          this.tableRenderer.sortColumn = 'code';
          this.tableRenderer.sortDirection = dir;
        } else if (field === 'size') {
          this.tableRenderer.sortColumn = 'dimensions';
          this.tableRenderer.sortDirection = dir;
        } else if (field === 'location') {
          this.tableRenderer.sortColumn = 'location';
          this.tableRenderer.sortDirection = dir;
        } else {
          // field khác thì giữ nguyên sortColumn hiện tại của bảng
          this.tableRenderer.sortDirection = dir;
        }
      }

      // 4) Vẽ lại UI
      this.currentPage = 1;
      this.updateUI();
    });  

    // Search input (fallback if SearchModule not available)
    const searchInput = document.getElementById('searchInput');
    if (searchInput && !this.searchModule) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.applyFilters();
      });
    }

    // Clear search button
    const clearBtn = document.querySelector('.clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearSearch();
      });
    }

    // Category dropdown
    const categoryDropdown = document.getElementById('categoryDropdown');
    if (categoryDropdown) {
      categoryDropdown.addEventListener('change', (e) => {
        this.selectedCategory = e.target.value;
        this.applyFilters();
      });
    }

    // View toggle buttons
    const viewBtns = document.querySelectorAll('.view-toggle-btn');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view || 'card';
        this.switchView(view);
      });
    });

    // Sidebar toggle
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        this.toggleSidebar();
      });
    }

    // Filter toggle
    const filterToggle = document.querySelector('.filter-toggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', () => {
        this.toggleFilter();
      });
    }

    // Action buttons
    const printBtn = document.querySelector('.btn-print');
    if (printBtn) {
      printBtn.addEventListener('click', () => this.handlePrint());
    }

    const inventoryBtn = document.querySelector('.btn-inventory');
    if (inventoryBtn) {
      inventoryBtn.addEventListener('click', () => this.handleInventory());
    }

    const resetAllBtn = document.querySelector('.btn-reset-all');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', () => this.resetAll());
    }

    // Select All button
    const btnSelectAll = document.getElementById('btnSelectAll');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => this.selectAll());
    }

    // Deselect All button
    const btnDeselect = document.getElementById('btnDeselect');
    if (btnDeselect) {
      btnDeselect.addEventListener('click', () => this.deselectAll());
    }

    // QR Scanner button
    const qrBtn = document.querySelector('.qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', () => this.openQRScanner());
    }

    // Listen to quick action events (from cards)
    document.addEventListener('quick-action', (e) => {
      this.handleQuickAction(e.detail.action, e.detail.item);
    });
  }

  

  // ========================================================================
  // Sorting helpers (Card view needs default sort like Table)
  // ========================================================================

  naturalCompare(a, b) {
    const ax = [];
    const bx = [];
    String(a).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
      ax.push([$1 ? parseInt($1, 10) : Infinity, $2 || '']);
    });
    String(b).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
      bx.push([$1 ? parseInt($1, 10) : Infinity, $2 || '']);
    });
    while (ax.length && bx.length) {
      const an = ax.shift();
      const bn = bx.shift();
      const diff = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
      if (diff) return diff;
    }
    return ax.length - bx.length;
  }

  getItemId(item) {
    return item.type === 'mold'
      ? (item.MoldID || item.displayCode || item.MoldCode || '')
      : (item.CutterID || item.displayCode || item.CutterNo || '');
  }

  getItemCode(item) {
    return item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');
  }

  getItemLocation(item) {
    return item.displayRackLocation || item.location || item.rackNo || '';
  }

  getItemCompany(item) {
    return item.displayStorageCompany || item.storageCompany || item.company || '';
  }

  getItemSize(item) {
    return item.displaySize || item.Size || item.Dimensions || item.dimensions || '';
  }

  getItemProductionDate(item) {
    return item.ProductionDate || item.displayDate || '';
  }

  getSidebarSortPref() {
    // Default giống bảng: Ngày chế tạo giảm dần
    const fallback = { field: 'productionDate', direction: 'desc' };

    try {
      if (window.FilterModule && typeof window.FilterModule.getState === 'function') {
        const st = window.FilterModule.getState() || {};
        if (st.sort && st.sort.field) {
          return { field: st.sort.field, direction: st.sort.direction || 'desc' };
        }
      }
    } catch (e) {
      // Ignore
    }

    return fallback;
  }

  sortForCardView(items) {
    const pref = this.getSidebarSortPref();
    const field = pref.field;
    const dir = (pref.direction || 'desc').toLowerCase();
    const mul = dir === 'asc' ? 1 : -1;

    const arr = Array.isArray(items) ? items.slice() : [];

    return arr.sort((a, b) => {
      if (field === 'productionDate') {
        const aVal = this.getItemProductionDate(a);
        const bVal = this.getItemProductionDate(b);
        const aTime = aVal ? new Date(aVal).getTime() : new Date('1900-01-01').getTime();
        const bTime = bVal ? new Date(bVal).getTime() : new Date('1900-01-01').getTime();
        return mul * (aTime - bTime);
      }

      if (field === 'id') {
        return mul * this.naturalCompare(this.getItemId(a), this.getItemId(b));
      }

      if (field === 'code') {
        return mul * this.naturalCompare(this.getItemCode(a), this.getItemCode(b));
      }

      if (field === 'location') {
        return mul * this.naturalCompare(this.getItemLocation(a), this.getItemLocation(b));
      }

      if (field === 'company') {
        return mul * String(this.getItemCompany(a)).localeCompare(String(this.getItemCompany(b)), 'ja');
      }

      if (field === 'size') {
        return mul * String(this.getItemSize(a)).localeCompare(String(this.getItemSize(b)), 'ja');
      }

      // Unknown field -> không đổi
      return 0;
    });
  }

/**
   * Apply filters (search + category)
   * NEW: Use SearchModule.searchItems() for advanced search
   */
  applyFilters() {
    let filtered = [...this.allItems];

    // Category filter
    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.type === this.selectedCategory);
    }

    // Search filter - NEW: Use SearchModule
    if (this.searchQuery.trim()) {
      if (this.searchModule) {
        // Use advanced multi-keyword search
        filtered = this.searchModule.searchItems(filtered, this.searchQuery, this.selectedCategory);

        // Update history with result count
        const query = this.searchQuery.trim();
        if (query) {
          this.searchModule.addToHistory(query, filtered.length);
        }
      } else {
        // Fallback to basic search
        const query = this.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => {
          const code = (item.type === 'mold' ?
            (item.MoldCode || '') :
            (item.CutterNo || '')).toLowerCase();

          let name = '';
          if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
            name = item.designInfo.TrayInfoForMoldDesign.toLowerCase();
          } else {
            name = (item.type === 'mold' ?
              (item.MoldName || '') :
              (item.CutterName || item.CutterDesignName || '')).toLowerCase();
          }

          const location = (item.location || item.rackNo || '').toLowerCase();
          const company = (item.company || '').toLowerCase();

          return code.includes(query) ||
                 name.includes(query) ||
                 location.includes(query) ||
                 company.includes(query);
        });
      }
    }

    filtered = this.sortForCardView(filtered);
    this.filteredItems = filtered;
    this.currentPage = 1;
    this.updateUI();
  }

  /**
   * Clear search
   */
  clearSearch() {
    this.searchQuery = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
    }

    // Clear SearchModule if available
    if (this.searchModule) {
      this.searchModule.clearSearch();
    }

    this.applyFilters();
  }

  /**
   * Switch view (card/table)
   */
  switchView(view) {
    // Sync page before switching
    if (view === 'table' && this.cardRenderer) {
      this.currentPage = this.cardRenderer.currentPage || 1;
    } else if (view === 'card' && this.tableRenderer) {
      this.currentPage = this.tableRenderer.currentPage || 1;
    }

    this.currentView = view;

    // Update view toggle buttons
    const viewBtns = document.querySelectorAll('.view-toggle-btn');
    viewBtns.forEach(btn => {
      const btnView = btn.dataset.view || 'card';
      btn.classList.toggle('active', btnView === view);
    });

    // Show/hide views & pagination
    const cardView = document.getElementById('cardView');
    const tableView = document.getElementById('tableView');
    const cardPagination = document.querySelector('.pagination-card');
    const tablePagination = document.querySelector('.pagination-table');

    if (view === 'card') {
      if (cardView) cardView.style.display = 'grid';
      if (tableView) tableView.style.display = 'none';
      if (cardPagination) cardPagination.classList.add('active');
      if (tablePagination) tablePagination.classList.remove('active');
    } else {
      if (cardView) cardView.style.display = 'none';
      if (tableView) {
        tableView.style.display = 'flex';
        tableView.classList.add('active');
      }
      if (cardPagination) cardPagination.classList.remove('active');
      if (tablePagination) tablePagination.classList.add('active');
    }

    // Re-render with synced page
    this.renderResults();
  }

  /**
   * Toggle sidebar
   */
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const isCollapsed = sidebar.classList.toggle('collapsed');

    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, isCollapsed ? '1' : '0');
    } catch (e) {
      console.warn('⚠️ Failed to save sidebar state:', e);
    }
  }


  restoreSidebarState() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Mặc định: thu gọn nếu chưa có gì trong localStorage
    let collapsed = true;
    try {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (saved === '0') {
        collapsed = false;
      }
    } catch (e) {
      console.warn('⚠️ Failed to restore sidebar state:', e);
    }

    if (collapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }

  /**
   * Toggle filter section
   */
  toggleFilter() {
    const filterToggle = document.querySelector('.filter-toggle');
    const filterContent = document.getElementById('filterContent');

    if (filterToggle && filterContent) {
      const isExpanded = filterContent.classList.toggle('expanded');
      filterToggle.classList.toggle('expanded', isExpanded);
    }
  }

  /**
   * Render pagination
   */
  renderPagination(currentPage, totalPages, onPageClick) {
    const selector = this.currentView === 'card' ? '.pagination-card' : '.pagination-table';
    const paginationDiv = document.querySelector(selector);
    if (!paginationDiv) return;

    this.currentPage = currentPage;

    if (totalPages <= 1) {
      paginationDiv.style.display = 'none';
      return;
    }

    paginationDiv.style.display = 'flex';
    let html = '';

    // First button
    html += '<button class="pagination-btn btn-first" ' + (currentPage === 1 ? 'disabled' : '') + '>«</button>';

    // Previous button
    html += '<button class="pagination-btn btn-prev" ' + (currentPage === 1 ? 'disabled' : '') + '>‹</button>';

    // Page numbers
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      const maxPages = 7;
      let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
      let endPage = Math.min(totalPages, startPage + maxPages - 1);
      if (endPage - startPage < maxPages - 1) {
        startPage = Math.max(1, endPage - maxPages + 1);
      }
      for (let i = startPage; i <= endPage; i++) {
        html += '<button class="pagination-btn btn-page ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
      }
    } else {
      const startPage = Math.max(1, currentPage - 1);
      const endPage = Math.min(totalPages, currentPage + 1);
      for (let i = startPage; i <= endPage; i++) {
        html += '<button class="pagination-btn btn-page ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
      }
    }

    // Next button
    html += '<button class="pagination-btn btn-next" ' + (currentPage === totalPages ? 'disabled' : '') + '>›</button>';

    // Last button
    html += '<button class="pagination-btn btn-last" ' + (currentPage === totalPages ? 'disabled' : '') + '>»</button>';

    // Page info
    html += '<span class="pagination-info">' + currentPage + '/' + totalPages + '</span>';

    // Jump to page
    html += '<input type="number" class="page-input" min="1" max="' + totalPages + '" value="' + currentPage + '">';
    html += '<button class="pagination-btn btn-go">→</button>';

    paginationDiv.innerHTML = html;

    // Attach events
    this.attachPaginationEvents(paginationDiv, (page) => {
      this.currentPage = page;
      onPageClick(page);
      const total = this.currentView === 'card'
        ? (this.cardRenderer?.totalPages || 1)
        : (this.tableRenderer?.totalPages || 1);
      this.renderPagination(this.currentPage, total, onPageClick);
    });
  }

  /**
   * Attach pagination events
   */
  attachPaginationEvents(container, onPageClick) {
    container.querySelector('.btn-first')?.addEventListener('click', () => {
      onPageClick(1);
    });

    container.querySelector('.btn-prev')?.addEventListener('click', () => {
      const prevPage = this.currentPage - 1;
      if (prevPage >= 1) onPageClick(prevPage);
    });

    container.querySelector('.btn-next')?.addEventListener('click', () => {
      const nextPage = this.currentPage + 1;
      const maxPage = this.currentView === 'card'
        ? this.cardRenderer?.totalPages || 1
        : this.tableRenderer?.totalPages || 1;
      if (nextPage <= maxPage) onPageClick(nextPage);
    });

    container.querySelector('.btn-last')?.addEventListener('click', () => {
      const lastPage = this.currentView === 'card'
        ? this.cardRenderer?.totalPages || 1
        : this.tableRenderer?.totalPages || 1;
      onPageClick(lastPage);
    });

    container.querySelectorAll('.btn-page').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page);
        if (page && page !== this.currentPage) {
          onPageClick(page);
        }
      });
    });

    container.querySelector('.btn-go')?.addEventListener('click', () => {
      const input = container.querySelector('.page-input');
      const page = parseInt(input.value);
      const maxPage = this.currentView === 'card'
        ? this.cardRenderer?.totalPages || 1
        : this.tableRenderer?.totalPages || 1;
      if (page >= 1 && page <= maxPage && page !== this.currentPage) {
        onPageClick(page);
      }
    });
  }

  /**
   * Update UI
   */
  updateUI() {
    this.renderResults();
    this.updateResultCount();
  }

  /**
   * Render results
   */
  renderResults() {
    if (this.currentView === 'card') {
      this.cardRenderer.render(this.filteredItems, this.currentPage);
      this.currentPage = this.cardRenderer.currentPage;
    } else {
      this.tableRenderer.currentPage = this.currentPage;
      this.tableRenderer.render(this.filteredItems);
      this.currentPage = this.tableRenderer.currentPage;
    }

    this.updatePagination();
  }

  /**
   * Update result count
   */
  updateResultCount() {
    const resultCount = document.querySelector('.result-count .count');
    if (resultCount) {
      resultCount.textContent = this.filteredItems.length;
    }
  }

  /**
   * Update category dropdown
   */
  updateCategoryDropdown() {
    const categoryDropdown = document.getElementById('categoryDropdown');
    if (!categoryDropdown) return;

    const allCount = this.allItems.length;
    const moldCount = this.allItems.filter(item => item.type === 'mold').length;
    const cutterCount = this.allItems.filter(item => item.type === 'cutter').length;

    categoryDropdown.innerHTML = `
      <option value="all">全て (${allCount})</option>
      <option value="mold">金型 (${moldCount})</option>
      <option value="cutter">抜型 (${cutterCount})</option>
    `;
  }

  /**
   * Update pagination
   */
  updatePagination() {
    if (this.currentView === 'card' && this.cardRenderer) {
      const currentPage = this.cardRenderer.currentPage || 1;
      const totalPages = this.cardRenderer.totalPages || 1;
      this.renderPagination(currentPage, totalPages, (page) => {
        this.currentPage = page;
        this.cardRenderer.currentPage = page;
        this.cardRenderer.render(this.filteredItems, page);
      });
    } else if (this.currentView === 'table' && this.tableRenderer) {
      const currentPage = this.tableRenderer.currentPage || 1;
      const totalPages = this.tableRenderer.totalPages || 1;
      this.renderPagination(currentPage, totalPages, (page) => {
        this.currentPage = page;
        this.tableRenderer.goToPage(page);
      });
    }
  }

  /**
   * Handle item click
   */
  handleItemClick(item) {
    console.log('Item clicked:', item.code || item.MoldCode || item.CutterNo);
    
    // Xác định itemType
    const itemType = item.type || item.itemType || 'mold';
    
    // Mở DetailPanel (v8.2.3)
    if (window.DetailPanel) {
      window.DetailPanel.open(item, itemType);
    } else {
      console.warn('[App] DetailPanel chưa sẵn sàng');
    }
  }


  /**
   * Handle selection change
   */
  handleSelectionChange(selectedCodes) {
    console.log('Selection changed:', selectedCodes.length);

    if (this.isSyncingSelection) return;
    this.isSyncingSelection = true;

    const ids = (selectedCodes || []).map(n => parseInt(n)).filter(n => !isNaN(n));
    this.selectedIds = new Set(ids);

    // Sync to Card
    if (this.cardRenderer) {
      this.cardRenderer.selectedItems = new Set(ids);
      if (this.currentView === 'card' && typeof this.cardRenderer.updateCheckboxes === 'function') {
        this.cardRenderer.updateCheckboxes();
      }
    }

    // Sync to Table
    if (this.tableRenderer) {
      this.tableRenderer.selectedItems = new Set(ids);
      if (this.currentView === 'table') {
        if (typeof this.tableRenderer.renderRows === 'function') this.tableRenderer.renderRows();
        if (typeof this.tableRenderer.updateSelectAllState === 'function') this.tableRenderer.updateSelectAllState();
      }
    }

    this.isSyncingSelection = false;

    // Update selection info
    const selectionInfo = document.querySelector('.selection-info');
    if (selectionInfo) {
      if (selectedCodes.length > 0) {
        selectionInfo.style.display = 'flex';
        selectionInfo.innerHTML = selectedCodes.length + ' 件選択';
      } else {
        selectionInfo.style.display = 'none';
      }
    }

    // Update button states
    const hasSelected = selectedCodes.length > 0;
    const hasResults = this.filteredItems && this.filteredItems.length > 0;

    const btnSelectAll = document.getElementById('btnSelectAll');
    if (btnSelectAll) btnSelectAll.disabled = !hasResults;

    const btnDeselect = document.getElementById('btnDeselect');
    if (btnDeselect) btnDeselect.disabled = !hasSelected;

    const printBtn = document.querySelector('.btn-print');
    if (printBtn) printBtn.disabled = !hasSelected;

    const inventoryBtn = document.querySelector('.btn-inventory');
    if (inventoryBtn) inventoryBtn.disabled = !hasSelected;

    const resetBtn = document.querySelector('.btn-reset-all');
    if (resetBtn) {
      let needsReset = false;
      if (this.selectedCategory !== 'all') {
        needsReset = true;
      }
      if (this.currentView === 'table' &&
          this.tableRenderer &&
          typeof this.tableRenderer.needsReset === 'function' &&
          this.tableRenderer.needsReset()) {
        needsReset = true;
      }
      if (needsReset || (this.filteredItems && this.filteredItems.length > 0)) {
        resetBtn.disabled = false;
      } else {
        resetBtn.disabled = true;
      }
    }

    const lockBtn = document.getElementById('lockBtn');
    if (lockBtn) lockBtn.disabled = false;
  }

  /**
   * Handle quick action
   */
  handleQuickAction(action, item) {
    console.log('Quick action: ' + action + ' for ' + (item.code || item.MoldCode || item.CutterNo));
    const code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');

    switch(action) {
      case 'checkin':
        alert('入庫: ' + code + '\n機能は開発中です');
        break;
      case 'checkout':
        alert('出庫: ' + code + '\n機能は開発中です');
        break;
      case 'move':
        alert('移動: ' + code + '\n機能は開発中です');
        break;
      case 'inventory':
        alert('棚卸: ' + code + '\n機能は開発中です');
        break;
      case 'print':
        this.printItem(item);
        break;
      case 'qr':
        alert('QRコード: ' + code + '\n機能は開発中です');
        break;
      case 'photo':
        alert('写真: ' + code + '\n機能は開発中です');
        break;
    }
  }

  /**
   * Handle print
   */
  handlePrint() {
    const selected = this.getSelectedItems();
    if (selected.length === 0) {
      alert('印刷するアイテムを選択してください');
      return;
    }

    console.log('Printing selected items:', selected.length);
    alert(selected.length + '件のアイテムを印刷します\n機能は開発中です');
  }

  /**
   * Handle inventory
   */
  handleInventory() {
    const selected = this.getSelectedItems();
    if (selected.length === 0) {
      alert('棚卸するアイテムを選択してください');
      return;
    }

    console.log('Inventory audit:', selected.length);
    alert(selected.length + '件のアイテムを棚卸します\n機能は開発中です');
  }

  /**
   * Print single item
   */
  printItem(item) {
    console.log('Printing item:', item.code || item.MoldCode || item.CutterNo);
    
    // DetailPanel v8.2.3 chưa có handlePrint(), dùng alert tạm
    alert(`🖨️ 印刷 / In ấn\n${item.MoldCode || item.CutterNo}\n開発中... / Đang phát triển...`);
    
    // TODO: Implement print function
  }

  /**
   * Reset all
   */
  resetAll() {
    this.selectedCategory = 'all';
    this.currentPage = 1;

    const categoryDropdown = document.getElementById('categoryDropdown');
    if (categoryDropdown) categoryDropdown.value = 'all';

    if (this.cardRenderer) {
      this.cardRenderer.deselectAll();
    }

    if (this.tableRenderer) {
      this.tableRenderer.deselectAll();
      this.tableRenderer.sortColumn = null;
      this.tableRenderer.sortDirection = 'desc';
      this.tableRenderer.columnFilters = {};

      ['code', 'name', 'dimensions', 'location', 'type', 'date', 'status'].forEach(column => {
        this.tableRenderer.updateFilterButtonState(column, false);
      });

      this.tableRenderer.applyFiltersAndSort();
      this.tableRenderer.calculatePagination();
      this.tableRenderer.currentPage = 1;
      this.tableRenderer.renderRows();
      this.tableRenderer.updateAllFilterButtons();
    }

    if (this.currentView === 'card') {
      this.applyFilters();
    }
  }

  /**
   * Open QR Scanner
   */
  openQRScanner() {
    alert('QRスキャナー機能は開発中です\nTính năng quét QR đang phát triển');
  }

  /**
   * Get selected items
   */
  getSelectedItems() {
    if (this.currentView === 'card') {
      return this.cardRenderer.getSelectedItems();
    } else {
      return this.tableRenderer.getSelectedItems();
    }
  }

  /**
   * Select all
   */
  selectAll() {
    if (this.currentView === 'card') {
      if (this.cardRenderer?.selectAllResults) this.cardRenderer.selectAllResults();
      else this.cardRenderer.selectAll();
    } else {
      if (this.tableRenderer?.selectAllResults) this.tableRenderer.selectAllResults();
      else this.tableRenderer.selectAll();
    }
  }

  /**
   * Deselect all
   */
  deselectAll() {
    if (this.currentView === 'card') {
      this.cardRenderer.deselectAll();
    } else {
      this.tableRenderer.deselectAll();
    }
  }
}

// Initialize app
let app;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = new App();
    window.app = app;
  });
} else {
  app = new App();
  window.app = app;
}
