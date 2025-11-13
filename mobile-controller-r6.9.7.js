/* ========================================================================
   MOBILE PANEL CONTROLLER R1.3
   ========================================================================
   Quản lý show/hide chi tiết & action buttons trên iPhone
   - Show detail panel khi click result card
   - Bật action buttons
   - Chèn "View full detail" link
   
   Created: 2025-11-07
   Last Updated: 2025-11-07
   ======================================================================== */

class MobilePanelController {
  constructor() {
    this.resultsPanel = document.querySelector('.quick-results-panel');
    this.detailPanel = document.querySelector('.detail-panel');
    // ✅ THÊM: Cache filter panel elements
    this.filterPanel = document.getElementById('mobile-filter-panel');
    this.filterToggle = document.getElementById('mobile-filter-toggle');
    this.filterContent = document.getElementById('mobile-filter-content');
    this.isFilterPanelOpen = false;

    this.isMobile = window.innerWidth < 768;
    
    if (!this.isMobile) {
      console.log('MobilePanelController: Desktop mode - skipping init');
      return;
    }
    
    console.log('MobilePanelController: Mobile mode - initializing');
    this.init();

    // ✅ NEW: Performance limits
    this.maxInitialResults = 50; // Show first 50 results
    this.pageSize = 20; // Load 20 more each time
    this.currentResultPage = 1;
    this.isLoadingMore = false;
  }



  init() {
    if (!this.resultsPanel || !this.detailPanel) {
      console.error('MobilePanelController: Required panels not found');
      return;
    }

    // Bước 1: Bind click event cho result cards
    this.bindResultCardClicks();

    // ✅ NEW R6.9.3: Bind lazy loading
    this.bindResultsLazyLoading();

    // Bước 2: Chèn "View full detail" link vào detail panel
    this.injectViewFullDetailLink();

    // Bước 3: Bind detail close button (unified for mobile + iPad)
    this.bindMobileDetailCloseButton();
    
    // DISABLED R6.9.3: Sẽ dùng popup full màn hình thay vì expand
    // this.bindDetailHeaderViewFull();

    // Bước 6B: Bind category tabs in filter panel (NEW - R7.0)
    this.bindCategoryTabs();

    // After bindCategoryTabs()
    this.bindFilterCloseButton();

        // Bước 7B: Bind filter select change (NEW)
    this.bindFilterSelectChange();

        // Bước 7C: Initial filter active check (NEW)
    setTimeout(() => {
      this.checkFilterActive();
    }, 500); // Delay to ensure DOM is ready

    // After bindDetailHeaderCloseButton()
    this.bindMobileDetailCloseButton();


    // Bước 6C: Bind bottom navigation bar (NEW - R7.0)
    this.bindBottomNavigation();

    // Bước 6D: Bind floating action bar (NEW - R7.0)
    this.bindFloatingActionBar();

    // Bước 7: Bind exit fullscreen button (NEW - R7.0)
    this.bindExitFullscreenButton();


    // Bước 8: Auto-enter fullscreen on load (NEW - R7.0)
    this.autoEnterFullscreen();

    console.log('✅ MobilePanelController: Fully initialized (with fullscreen support)');
    }


    // ========================================================
    // SỰ KIỆN 1: Click result card → Show detail + Enable actions
    // ========================================================
    bindResultCardClicks() {
      this.resultsPanel.addEventListener('click', (e) => {
          // Tìm result card gần nhất
          const card = e.target.closest('.result-card, [data-id], [data-item-id]');
          if (!card) return;

          e.preventDefault();
          e.stopPropagation();

          // Lấy thông tin từ card attributes
          const itemId = card.getAttribute('data-id');
          const itemType = card.getAttribute('data-type'); // 'mold' or 'cutter'
          const cardIndex = parseInt(card.getAttribute('data-index') || '0', 10);

          console.log('🔍 Result card clicked:', { itemId, itemType, cardIndex });

          // ✅ NEW R6.9.3: Phân biệt iPhone vs iPad
          if (this.isMobile && window.MobileDetailModal) {
              // === IPHONE: MỞ FULL-SCREEN MODAL ===
              this.openMobileDetailModal(itemId, itemType, cardIndex);
          } else {
              // === IPAD: SỬ DỤNG DETAIL PANEL CŨ ===
              this.showDetailPanel();
              this.shrinkResultsPanel();
              this.enableActionButtons();
              this.setSelectedItemId(itemId);
          }
      });

      console.log('✅ Result card clicks bound (with modal support)');
  }

  /**
   * ========================================
   * NEW R6.9.3: Open mobile detail modal
   * ========================================
   */
  openMobileDetailModal(itemId, itemType, cardIndex) {
      console.log('📱 Opening mobile detail modal...', { itemId, itemType });

      // Đóng filter nếu đang mở
      if (this.isFilterPanelOpen) {
          this.toggleFilterPanel();
      }

      // Tìm item data từ DataManager
      let item = null;

      // Kiểm tra DataManager đã ready
      if (!window.DataManager || !window.DataManager.data) {
          console.error('❌ DataManager not ready');
          alert('データがまだ読み込まれていません / Dữ liệu chưa tải xong');
          return;
      }

      const allData = window.DataManager.data;

      // Tìm item theo type
      if (itemType === 'mold') {
          item = allData.molds.find(m => 
              m.MoldID === itemId || m.MoldCode === itemId
          );
      } else if (itemType === 'cutter') {
          item = allData.cutters.find(c => 
              c.CutterID === itemId || c.CutterNo === itemId
          );
      }

      // Fallback: Nếu không tìm thấy, thử từ UIRenderer state
      if (!item && window.UIRenderer) {
          const allResults = window.UIRenderer.state?.allResults || [];
          item = allResults[cardIndex];
      }

      if (!item) {
          console.error('❌ Item not found:', itemId);
          alert('項目が見つかりません / Không tìm thấy mục');
          return;
      }

      console.log('✅ Found item:', item);

      // Dispatch event để mở modal
      const event = new CustomEvent('showMobileDetail', {
          detail: {
              item: item,
              type: itemType
          }
      });
      document.dispatchEvent(event);

      console.log('✅ Mobile detail modal event dispatched');
  }


  /**
   * ========================================
   * PERFORMANCE: Bind scroll for lazy loading
   * ========================================
   */
  bindResultsLazyLoading() {
      const resultsBody = this.resultsPanel.querySelector('.panel-body');
      if (!resultsBody) return;
      
      let scrollTimeout;
      resultsBody.addEventListener('scroll', () => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
              // Check if near bottom (within 100px)
              const isNearBottom = 
                  resultsBody.scrollHeight - resultsBody.scrollTop - resultsBody.clientHeight < 100;
              
              if (isNearBottom && !this.isLoadingMore) {
                  this.loadMoreResults();
              }
          }, 150); // Debounce 150ms
      });
      
      console.log('✅ Results lazy loading bound');
  }

  /**
   * Load more results (called when scrolling to bottom)
   */
  loadMoreResults() {
      this.isLoadingMore = true;
      console.log(`📥 Loading more results (page ${this.currentResultPage + 1})...`);
      
      // Dispatch event for main app to handle
      const event = new CustomEvent('loadMoreResults', {
          detail: { 
              page: this.currentResultPage + 1,
              pageSize: this.pageSize
          }
      });
      document.dispatchEvent(event);
      
      this.currentResultPage++;
      
      // Reset loading flag after 500ms
      setTimeout(() => {
          this.isLoadingMore = false;
      }, 500);
  }


  /**
   * SỰ KIỆN: Close Filter Popup Button
   */
  bindFilterCloseButton() {
    const closeBtn = document.getElementById('filter-close-btn');
    if (!closeBtn) return;
    
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Close filter
      if (this.isFilterPanelOpen) {
        this.toggleFilterPanel();
      }
      
      console.log('✅ Filter closed via close button');
    });
    
    console.log('✅ Filter close button bound');
  }

  /**
   * SỰ KIỆN: Filter select change
   */
  bindFilterSelectChange() {
    const filterSelects = document.querySelectorAll('.mobile-filter-content select');
    
    if (filterSelects.length === 0) {
      console.warn('No filter selects found');
      return;
    }
    
    filterSelects.forEach(select => {
      select.addEventListener('change', () => {
        // Check filter active state after select change
        this.checkFilterActive();
        console.log('Filter select changed, checking active state');
      });
    });
    
    console.log('✅ Filter selects bound:', filterSelects.length);
  }


  /**
   * Check if filter has active conditions and update indicator
   */
  checkFilterActive() {
    const filterNavBtn = document.getElementById('filter-nav-btn');
    if (!filterNavBtn) {
      console.warn('Filter nav button not found for active check');
      return;
    }
    
    let hasActiveFilter = false;
    
    // Check 1: Category tabs (金型 or 抜型 selected, not すべて)
    const categoryTabs = document.querySelectorAll('#category-tabs-mobile .category-tab');
    const activeCategory = Array.from(categoryTabs).find(tab => 
      tab.classList.contains('active') && tab.getAttribute('data-category') !== 'all'
    );
    
    if (activeCategory) {
      hasActiveFilter = true;
      console.log('Active category filter detected:', activeCategory.getAttribute('data-category'));
    }
    
    // Check 2: Filter select dropdowns
    const filterSelects = document.querySelectorAll('.mobile-filter-content select');
    const hasSelectFilter = Array.from(filterSelects).some(select => {
      const value = select.value;
      // Check if value is not empty and not default
      return value && value !== '' && value !== 'すべて' && !value.includes('選択');
    });
    
    if (hasSelectFilter) {
      hasActiveFilter = true;
      console.log('Active select filter detected');
    }
    
    // Update badge visibility
    if (hasActiveFilter) {
      filterNavBtn.classList.add('has-active-filter');
      console.log('✅ Filter indicator: ACTIVE');
    } else {
      filterNavBtn.classList.remove('has-active-filter');
      console.log('✅ Filter indicator: INACTIVE');
    }
  }



  // ========================================================
  // HÀM TRỢ GIÚP: Show detail panel
  // ========================================================
  showDetailPanel() {
      // ✅ NEW: Close filter if open
      if (this.isFilterPanelOpen) {
          console.log('🔄 Auto-closing filter panel (detail is opening)');
          this.toggleFilterPanel();
      }
      
      this.detailPanel.classList.remove('hidden');
      this.detailPanel.classList.add('show');
      console.log('Detail panel shown');
  }


  // ========================================================
  // HÀM TRỢ GIÚP: Shrink results panel
  // ========================================================
  shrinkResultsPanel() {
    this.resultsPanel.classList.remove('hidden');
    this.resultsPanel.classList.add('shrink');
    console.log('Results panel shrunk');
  }

  // ========================================================
  // HÀM TRỢ GIÚP: Bật tất cả action buttons
  // ========================================================
  enableActionButtons() {
    // ✅ R6.9.5: Tắt floating bar khi Inventory mode đang bật
    if (window.InventoryState?.active) {
        console.log('ℹ️ Inventory mode ON → skip floating action bar');
        return;
    }

    const actionButtons = document.querySelectorAll('#mobile-action-bar .action-btn');
    actionButtons.forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.classList.add('enabled');
    });

    // NEW R7.0: Show floating action bar instead
    this.showFloatingActionBar();
    
    console.log('Action buttons enabled + Floating bar shown:', actionButtons.length);
  }



  // ========================================================
  // HÀM TRỢ GIÚP: Lưu item ID vào DOM
  // ========================================================
  setSelectedItemId(itemId) {
    if (!itemId || itemId.trim() === '') {
      console.warn('Item ID is empty');
      return;
    }

    itemId = itemId.trim();
    document.body.dataset.selectedItemId = itemId;
    document.body.dataset.lastSelectedItemId = itemId;

    // ✅ FIX: Update both iPad panel (separate elements) and iPhone modal (single element)
    
    // 1. Update iPad panel (2 separate badges)
    const ipadItemCode = document.getElementById('modal-item-code');
    if (ipadItemCode) {
      ipadItemCode.textContent = itemId; // MoldID
      ipadItemCode.style.visibility = 'visible';
    }
    
    // 2. Update iPhone modal (combine MoldID + MoldCode in single h2)
    const iphoneModalCode = document.getElementById('detail-item-code');
    if (iphoneModalCode) {
      // Get MoldCode from result card data attribute
      const card = document.querySelector(`.result-card[data-id="${itemId}"]`);
      const moldCode = card?.getAttribute('data-mold-code') || '';
      
      // Display format: "MoldID - MoldCode" hoặc chỉ "MoldID" nếu không có MoldCode
      if (moldCode && moldCode !== itemId) {
        iphoneModalCode.textContent = `${itemId} - ${moldCode}`;
      } else {
        iphoneModalCode.textContent = itemId;
      }
      
      console.log(`✅ Updated modal title: ${iphoneModalCode.textContent}`);
    }

    console.log('Selected item ID:', itemId);
  }

  /**
   * HÀM TRỢ GIÚP: Filter results by category
   */
  filterByCategory(category) {
    // This function should integrate with your existing filter logic
    console.log(`Filtering by category: ${category}`);
    
    // Example: Dispatch custom event for main app to handle
    const event = new CustomEvent('categoryChanged', {
      detail: { category: category }
    });
    document.dispatchEvent(event);
  }

  


  /**
   * ========================================
   * SỰ KIỆN 7: Category Tabs in Filter Panel
   * ========================================
   */
  bindCategoryTabs() {
    const categoryTabs = document.querySelectorAll('.category-tab-inline');
    
    if (categoryTabs.length === 0) {
      console.warn('Category tabs not found in filter panel');
      return;
    }

    categoryTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const category = tab.getAttribute('data-category');
        
        // Remove active from all tabs
        categoryTabs.forEach(t => t.classList.remove('active'));
        
        // Add active to clicked tab
        tab.classList.add('active');
        
        // Trigger category filter (integrate with existing filter logic)
        this.filterByCategory(category);
        
        console.log(`✅ Category selected: ${category}`);
      
      // Check filter active state after category change
      this.checkFilterActive();
    });
  });

  console.log('✅ Category tabs bound:', categoryTabs.length);
}

  /**
   * ========================================
   * SỰ KIỆN 8: Bottom Navigation Bar
   * ========================================
   */
  bindBottomNavigation() {
    const bottomNav = document.getElementById('bottom-nav-bar');
    const navItems = document.querySelectorAll('.bottom-nav-item');
    
    if (!bottomNav || navItems.length === 0) {
      console.warn('Bottom navigation not found');
      return;
    }

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        
        // Remove active from all
        navItems.forEach(i => i.classList.remove('active'));
        
        // Add active to clicked
        item.classList.add('active');
        
        // Handle tab actions
        this.handleBottomNavTab(tab);
        
        console.log(`✅ Bottom nav tab selected: ${tab}`);
      });
    });

    console.log('✅ Bottom navigation bound:', navItems.length);
  }

  /**
   * HÀM TRỢ GIÚP: Handle bottom nav tab actions
   */
  handleBottomNavTab(tab) {
    switch(tab) {
      case 'search':
        // Reset to search mode
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Close filter if open
        if (this.isFilterPanelOpen) {
          this.toggleFilterPanel();
        }
        
        // Close action bar + detail panel
        this.hideFloatingActionBar();
        this.hideDetailPanel();
        
        // Focus searchbox
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.focus();
        }
        
        console.log('✅ Search tab: Reset to search mode');
        break;
        
      case 'history':
        // Future feature: Show history
        console.log('History tab - will show update history');
        this.hideFloatingActionBar();
        break;
        
      case 'qr-scan':
        // Future feature: Open QR scanner
        console.log('QR Scan tab - will open scanner');
        this.hideFloatingActionBar();
        break;
        
      case 'location': // ✅ R6.9.5: Repurposed to INVENTORY
      // 1) Tắt floating action bar hoàn toàn
      this.hideFloatingActionBar();
      
      // 2) Bật Inventory mode + mở panel cài đặt
      document.dispatchEvent(new CustomEvent('inventory:toggle', { 
          detail: { open: true }
      }));
      
      console.log('✅ Inventory mode toggled from bottom-nav');
      break;



        
      case 'settings':
        // Toggle filter panel
        this.toggleFilterPanel();
        
        // Close action bar (not detail panel)
        this.hideFloatingActionBar();
        
        console.log('✅ Settings tab: Filter toggled');
        break;
    }
  }


  /**
   * ========================================
   * SỰ KIỆN 9: Floating Action Bar
   * ========================================
   */
  bindFloatingActionBar() {
    const floatingBar = document.getElementById('floating-action-bar');
    const actionBtns = document.querySelectorAll('.floating-action-btn');
    
    if (!floatingBar) {
      console.warn('Floating action bar not found');
      return;
    }

    actionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        
        const action = btn.classList[1]; // Get second class (action-location, etc.)
        
        if (action === 'action-close') {
          this.hideFloatingActionBar();
          this.hideDetailPanel();
        } else {
          console.log(`Floating action: ${action}`);
          // Integrate with existing action logic
        }
      });
    });

    console.log('✅ Floating action bar bound');
  }

  /**
   * HÀM TRỢ GIÚP: Show floating action bar
   */
  showFloatingActionBar() {
    const floatingBar = document.getElementById('floating-action-bar');
    const bottomNav = document.getElementById('bottom-nav-bar');
    
    if (floatingBar) {
      floatingBar.classList.add('active');
      document.body.classList.add('floating-actions-active');
      
      // Auto-activate Location tab
      if (bottomNav) {
        const locationTab = document.getElementById('nav-inventory-btn');
        if (locationTab) {
            locationTab.addEventListener('click', (e) => {
                e.preventDefault();
                
                const isActive = !!window.InventoryState?.active;
                
                if (isActive) {
                    // Mode ON → Click để TẮT
                    if (confirm('棚卸モードを終了しますか？\nTắt chế độ kiểm kê?')) {
                        if (window.InventoryManager) {
                            window.InventoryManager.toggleOff();
                        }
                    }
                } else {
                    // Mode OFF → Mở Settings
                    console.log('[InventoryManager] 📋 Opening settings...');
                    if (window.InventoryManager) {
                        window.InventoryManager.openSettings();
                    }
                }
                
                console.log('✅ Inventory nav button clicked');
            });
        }

      }
      
      console.log('✅ Floating action bar shown');
    }
  }

  /**
   * HÀM TRỢ GIÚP: Hide floating action bar
   */
  hideFloatingActionBar() {
    const floatingBar = document.getElementById('floating-action-bar');
    const bottomNav = document.getElementById('bottom-nav-bar');
    
    if (floatingBar) {
      floatingBar.classList.remove('active');
      document.body.classList.remove('floating-actions-active');
      
      // Reset to Search tab
      if (bottomNav) {
        const searchTab = bottomNav.querySelector('[data-tab="search"]');
        if (searchTab) {
          document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
          searchTab.classList.add('active');
        }
      }
      
      console.log('✅ Floating action bar hidden');
    }
  }



  // ========================================================
  // SỰ KIỆN 2: Chèn "View full detail" link
  // ========================================================
  injectViewFullDetailLink() {
    if (!this.detailPanel) return;

    // Tìm nơi chèn link
    const detailLower = this.detailPanel.querySelector('.detail-lower') ||
                        this.detailPanel.querySelector('.panel-body');
    
    if (!detailLower) {
      console.warn('Detail lower section not found');
      return;
    }

    // Kiểm tra đã chèn chưa
    if (detailLower.querySelector('.view-full-detail-link')) {
      console.log('View full detail link already exists');
      return;
    }

    // TẠO LINK ELEMENT
    const link = document.createElement('a');
    link.className = 'view-full-detail-link';
    link.href = '#';
    
    // TEXT: Song ngữ Nhật-Việt
    link.innerHTML = `
      <span>詳細情報を見る | Xem trang đầy đủ</span>
      <i class="fas fa-arrow-right"></i>
    `;

    // STYLING CSS (Inline để đảm bảo hiệu lực)
    link.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      padding: 12px 16px;
      margin-top: 12px;
      background: #F5F5F5;
      color: #1976D2;
      font-weight: 600;
      font-size: 13px;
      border-top: 1px solid #E5E7EB;
      cursor: pointer;
      transition: all 0.2s ease-out;
      border-radius: 6px;
      text-decoration: none;
    `;

    // CLICK EVENT: Mở modal detail
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById('mobile-detail-modal');
      if (modal) {
        modal.classList.add('open');
        modal.classList.add('active');
        console.log('Full detail modal opened');
      } else {
        console.warn('Mobile detail modal not found');
      }
    });

    // HOVER EFFECT
    link.addEventListener('mouseenter', () => {
      link.style.background = '#E3F2FD';
    });
    link.addEventListener('mouseleave', () => {
      link.style.background = '#F5F5F5';
    });

    // CHÈN VÀO DETAIL LOWER
    detailLower.appendChild(link);
    console.log('View full detail link injected');
  }



  /**
   * SỰ KIỆN: Close button on mobile detail panel
   */
  bindMobileDetailCloseButton() {
      console.log('🔧 [DEBUG] bindMobileDetailCloseButton called');
      
      // ✅ UNIFIED: Works for both mobile AND iPad
      // Use event delegation to handle dynamically created close button
      document.addEventListener('click', (e) => {
          // Check if click is on close button or its icon
          const closeBtn = e.target.closest('.detail-close-btn');
          if (!closeBtn) return;
          
          console.log('🔘 Close button clicked:', closeBtn);
          
          // Check if close button is inside mobile quick detail OR detail-panel
          const mobileQuickDetail = closeBtn.closest('.mobile-quick-detail');
          const detailPanel = closeBtn.closest('.detail-panel');
          
          if (mobileQuickDetail || detailPanel) {
              e.preventDefault();
              e.stopPropagation();
              console.log('✅ Closing detail panel...');
              
              // Close panel
              this.closeMobileDetailPanel();
              console.log('✅ Detail panel closed via close button');
          }
      });
      
      console.log('✅ Detail close button bound (event delegation)');
  }




  // ========================================================
  // HÀM TRỢ GIÚP: Hide detail panel
  // ========================================================
  hideDetailPanel() {
    if (!this.detailPanel) return;
    
    if (this.isMobile) {
      // MOBILE: Hide mobile quick detail panel
      const mobileQuickDetail = document.querySelector('.mobile-quick-detail');
      if (mobileQuickDetail) {
        mobileQuickDetail.style.display = 'none';
        console.log('✅ Mobile detail panel hidden');
      }
      
      // Also hide floating action bar
      this.hideFloatingActionBar();
      
    } else {
      // IPAD: Hide column 3 panel (desktop behavior)
      this.detailPanel.classList.add('hidden');
      this.detailPanel.style.display = 'none';
      console.log('✅ iPad detail panel (column 3) hidden');
    }
  }

  /**
   * Close mobile detail panel (called by close button on mobile)
   */
  closeMobileDetailPanel() {
    if (!this.isMobile) {
      console.log('Not mobile - using desktop close logic');
      this.hideDetailPanel();
      return;
    }
    
    // MOBILE: Try to find mobile-quick-detail first
    let mobilePanel = document.querySelector('.mobile-quick-detail');
    
    // FALLBACK: If not exists, use .detail-panel
    if (!mobilePanel) {
      console.warn('.mobile-quick-detail not found, using .detail-panel instead');
      mobilePanel = this.detailPanel;
    }
    
    if (!mobilePanel) {
      console.error('No detail panel found to close');
      return;
    }
    
    // Hide panel
    mobilePanel.style.display = 'none';
    mobilePanel.classList.add('hidden');
    mobilePanel.classList.remove('show', 'expanded');
    
    // Hide action bar
    this.hideFloatingActionBar();
    
    // Reset results panel
    if (this.resultsPanel) {
      this.resultsPanel.classList.remove('shrink', 'hidden-by-expand');
    }
    
    // Reset bottom nav to Search tab
    const bottomNav = document.getElementById('bottom-nav-bar');
    if (bottomNav) {
      const searchTab = bottomNav.querySelector('[data-tab="search"]');
      if (searchTab) {
        document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
        searchTab.classList.add('active');
      }
    }
    
    console.log('✅ Mobile detail panel closed via close button');
  }

  // ========================================================
  // SỰ KIỆN 5: Toggle expand detail panel (NO MODAL)
  // ========================================================
  bindDetailHeaderViewFull() {
    const viewFullLink = document.querySelector('.detail-view-full-link');
    if (!viewFullLink) {
      console.warn('Detail view full link not found');
      return;
    }

    viewFullLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle expand state
      const isExpanded = this.detailPanel.classList.contains('expanded');
      
      if (isExpanded) {
        // Collapse back to normal
        this.collapseDetailPanel();
      } else {
        // Expand to full height
        this.expandDetailPanel();
      }
    });
  }

  // ========================================================
  // HÀM MỚI: Expand detail panel to full height
  // ========================================================
  expandDetailPanel() {
    // Add expanded class to detail panel
    this.detailPanel.classList.add('expanded');
    
    // Hide results panel
    this.resultsPanel.classList.add('hidden-by-expand');
    
    // Update button text and icon
    const link = this.detailPanel.querySelector('.detail-view-full-link span');
    if (link) {
      link.textContent = '縮小'; // "Thu nhỏ" in Japanese
    }
    
    // Change icon from arrow-up to arrow-down
    const icon = this.detailPanel.querySelector('.detail-view-full-link i');
    if (icon) {
      icon.classList.remove('fa-arrow-up');
      icon.classList.add('fa-arrow-down');
    }
    
    console.log('Detail panel expanded to full height');
  }

  // ========================================================
  // HÀM MỚI: Collapse detail panel back to normal
  // ========================================================
  collapseDetailPanel() {
    // Remove expanded class
    this.detailPanel.classList.remove('expanded');
    // Show results panel again
    this.resultsPanel.classList.remove('hidden-by-expand');
    
    // Restore button text and icon
    const link = this.detailPanel.querySelector('.detail-view-full-link span');
    if (link) {
      link.textContent = '詳細'; // "Detail" in Japanese
    }
    
    // Change icon back to arrow-up
    const icon = this.detailPanel.querySelector('.detail-view-full-link i');
    if (icon) {
      icon.classList.remove('fa-arrow-down');
      icon.classList.add('fa-arrow-up');
    }
    
    console.log('Detail panel collapsed to normal size');
  }


// DISABLED: Filter toggle button is hidden, controlled by menu bar Settings tab
// bindFilterPanelToggle() {
//   if (!this.filterToggle) {
//     console.warn('Filter toggle button not found');
//     return;
//   }
//
//   this.filterToggle.addEventListener('click', (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     this.toggleFilterPanel();
//   });
//
//   console.log('✅ Filter panel toggle bound');
// }


  /**
   * HÀM TRỢ GIÚP: Toggle filter panel
   */
  toggleFilterPanel() {
    if (!this.filterPanel) return;
    
    this.isFilterPanelOpen = !this.isFilterPanelOpen;
    const resultsPanel = document.querySelector('.mobile-results-panel');

    // ✅ NEW: Close detail panel when opening filter
    if (this.isFilterPanelOpen) {
        console.log('🔄 Auto-closing detail panel (filter is opening)');
        this.hideDetailPanel();
        this.hideFloatingActionBar();
    }

    
    if (this.isFilterPanelOpen) {
      // Open filter - use 'active' class instead of 'collapsed'
      this.filterPanel.classList.add('active');
      this.filterPanel.classList.remove('collapsed'); // Remove if exists
      
      // Show filter content explicitly
      if (this.filterContent) {
        this.filterContent.style.display = 'block';
      }
      
      // Push results panel down
      if (resultsPanel) {
        resultsPanel.classList.add('filter-open');
      }
      
      console.log('✅ Filter panel OPENED (active)');
    } else {
      // Close filter - remove 'active' class
      this.filterPanel.classList.remove('active');
      this.filterPanel.classList.add('collapsed'); // Add back for consistency
      
      // Hide filter content
      if (this.filterContent) {
        this.filterContent.style.display = 'none';
      }
      
      // Restore results panel position
      if (resultsPanel) {
        resultsPanel.classList.remove('filter-open');
      }
      
      console.log('✅ Filter panel CLOSED');
    }

        // In toggleFilterPanel() - after closing/opening
    this.checkFilterActive();
  }





  /**
   * ========================================
   * FULLSCREEN API SUPPORT (iOS PWA)
   * ========================================
   */
  bindExitFullscreenButton() {
    const exitBtn = document.getElementById('exit-fullscreen-btn');
    if (!exitBtn) {
      console.warn('Exit fullscreen button not found');
      return;
    }

    exitBtn.addEventListener('click', () => {
      this.exitFullscreen();
    });

    console.log('✅ Exit fullscreen button bound');
  }

  /**
   * Auto-enter fullscreen on page load (mobile only)
   */
  autoEnterFullscreen() {
    if (!this.isMobile) return;
    
    // Request fullscreen on first user interaction
    document.addEventListener('click', () => {
      this.enterFullscreen();
    }, { once: true });

    console.log('✅ Auto-fullscreen enabled (on first click)');
  }

  /**
   * Enter fullscreen mode
   */
  enterFullscreen() {
    // Check if running in actual mobile device
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobileDevice) {
      // Real mobile: Use fullscreen API
      const elem = document.documentElement;
      
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
          console.warn('Fullscreen request failed:', err);
        });
      } else if (elem.webkitRequestFullscreen) { /* Safari */
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) { /* IE11 */
        elem.msRequestFullscreen();
      }
      
      console.log('✅ Fullscreen mode entered (real device)');
    } else {
      // Web testing: Simulate fullscreen by hiding browser chrome
      document.body.classList.add('simulated-fullscreen');
      
      // Hide exit fullscreen button (not needed in simulation)
      const exitBtn = document.getElementById('exit-fullscreen-btn');
      if (exitBtn) {
        exitBtn.style.display = 'none';
      }
      
      console.log('✅ Simulated fullscreen mode (web testing)');
    }
  }


  /**
   * Exit fullscreen mode
   */
  exitFullscreen() {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobileDevice) {
      // Real mobile: Exit fullscreen API
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
      
      console.log('✅ Fullscreen mode exited (real device)');
    } else {
      // Web testing: Remove simulation
      document.body.classList.remove('simulated-fullscreen');
      
      // Show exit button again
      const exitBtn = document.getElementById('exit-fullscreen-btn');
      if (exitBtn) {
        exitBtn.style.display = 'flex';
      }
      
      console.log('✅ Simulated fullscreen exited (web testing)');
    }
  }

} // ← Đóng class MobilePanelController

// ========================================================
// KHỞI ĐỘNG CONTROLLER
// ========================================================
if (window.innerWidth < 768) {
  window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Initializing MobilePanelController');
    window.mobilePanelController = new MobilePanelController();
  });
} else {
  console.log('Desktop mode - MobilePanelController not loaded');
}

// Export cho nếu cần dùng từ modules khác
if (typeof window !== 'undefined') {
  window.MobilePanelController = MobilePanelController;
}

/**
 * Update inventory badge on mobile bottom nav
 */
function updateMobileInventoryBadge() {
    const isActive = !!window.InventoryState?.active;
    const btn = document.getElementById('mobile-btn-location');
    
    if (!btn) return;
    
    // Remove existing badge
    const oldBadge = btn.querySelector('.inventory-badge');
    if (oldBadge) oldBadge.remove();
    
    if (isActive) {
        // Add badge ON
        const badge = document.createElement('span');
        badge.className = 'inventory-badge';
        badge.textContent = 'ON';
        btn.appendChild(badge);
    }
}

// Listen for inventory mode changes
document.addEventListener('inventory:modeChanged', () => {
    updateMobileInventoryBadge();
});

// Initial call
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateMobileInventoryBadge);
} else {
    updateMobileInventoryBadge();
}
