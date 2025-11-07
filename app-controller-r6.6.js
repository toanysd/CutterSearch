/**
 * ========================================================================
 * APP-CONTROLLER-R6.6.JS
 * V7.7.7 App Controller — Mobile + iPad Dual UI + Mobile Detail Panel
 * ========================================================================
 * Purpose:
 * - Initialize DataManager
 * - Bind search/filter events for BOTH mobile and iPad UI
 * - Manage state persistence (localStorage)
 * - Connect to SearchModule for actual search logic
 * - NEW: Mobile card click handling for Quick Detail Panel & Action Bar
 * ========================================================================

 */

(function () {
  'use strict';

  // ====================================================================
  // SELECTORS - Support BOTH Mobile + iPad UI
  // ====================================================================
  const SEL = {
    // iPad UI search input
    ipadSearchInput: '#search-input, .search-input input',
    
    // Mobile UI search input
    mobileSearchInput: '#mobile-search-input',
    
    // Clear search buttons (X button in search box)
    clearSearchBtn: '#search-clear-btn, #mobile-clear-btn, .search-clear-btn',
    
    // Reset filter button (フィルタリセット)
    resetFilterBtn: '#filter-reset-btn, #mobile-reset-filter-btn, .btn-reset',
    
    // Reset ALL button (全クリア)
    resetAllBtn: '#reset-all-btn, .btn-reset-all',
    
    // Category tabs - iPad
    ipadCategoryTabs: '#category-tabs .category-tab[data-category]',
    
    // Category tabs - Mobile
    mobileCategoryTabs: '.category-tabs-mobile .category-tab[data-category]',
  };


  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  // ====================================================================
  // MAIN APP CONTROLLER
  // ====================================================================
  const AppController = {
    /**
     * Initialize application
     */
    async init() {
      console.log('🚀 V7.7.7-r6.5 Initializing...');
      
      // Load data first
      if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
        await window.DataManager.loadAllData();
      } else {
        console.error('❌ DataManager not available');
        throw new Error('DataManager not initialized');
      }

      // Initialize FilterModule (must be after DataManager)
      if (window.FilterModule && typeof window.FilterModule.initializeFilters === 'function') {
        window.FilterModule.initializeFilters();
        console.log('✅ FilterModule initialized');
      } else {
        console.warn('⚠️ FilterModule not available');
      }

      // Restore saved state
      this.restoreSearchState();

      // Initial category + search
      const cat = this.getActiveCategory() || 'all';
      if (window.SearchModule) {
        window.SearchModule.setCategory(cat);
        window.SearchModule.setQuery(this.getSearchInputValue());
        window.SearchModule.performSearch();
      }

        // Setup event listeners
        this.setupEventListeners();


        console.log('✅ App ready (with FilterModule).');
        
        // ===== MỚI: Initialize Mobile UI (R6.6) =====
        if (window.innerWidth <= 767) {
          this.initMobileUI();
          console.log('📱 Mobile UI initialized');
        }
      }, 

    /**
     * Setup event listeners for BOTH mobile and iPad
     */
    setupEventListeners() {
      console.log('📌 Setting up event listeners...');
      
      // ===== SEARCH INPUT - iPad =====
      const ipadInput = this.getIpadSearchInput();
      if (ipadInput) {
        this.bindSearchInput(ipadInput, 'iPad');
      }

      // ===== SEARCH INPUT - Mobile =====
      const mobileInput = this.getMobileSearchInput();
      if (mobileInput) {
        this.bindSearchInput(mobileInput, 'Mobile');
      }

      // ===== CLEAR BUTTONS =====
      this.bindClearButtons();

      // ===== CATEGORY TABS - iPad =====
      this.bindCategoryTabs(SEL.ipadCategoryTabs, 'iPad');

      // ===== CATEGORY TABS - Mobile =====
      this.bindCategoryTabs(SEL.mobileCategoryTabs, 'Mobile');

      // ===== RESET FILTER BUTTONS =====
      this.bindResetButtons();

      console.log('✅ Event listeners ready.');
    },

    /**
     * Bind search input with debounce
     */
    bindSearchInput(input, uiType) {
      if (!input) return;

      // Input event with debounce
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const query = input.value.trim();
          console.log(`🔍 ${uiType} search:`, query);
          
          if (window.SearchModule) {
            window.SearchModule.setQuery(query);
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
          
          // Sync to other UI
          this.syncSearchInputs(input);
        }, DEBOUNCE_MS);
      });

      // Enter key
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = input.value.trim();
          
          if (window.SearchModule) {
            window.SearchModule.setQuery(query);
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
        }
      });

      console.log(`✅ ${uiType} search input bound`);
    },

    /**
     * Bind clear buttons
     */
    bindClearButtons() {
    // Clear search input only (X button)
    qsAll(SEL.clearSearchBtn).forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('🗑️ Clear search input');
        
        // Clear all search inputs
        const ipadInput = this.getIpadSearchInput();
        const mobileInput = this.getMobileSearchInput();
        
        if (ipadInput) ipadInput.value = '';
        if (mobileInput) mobileInput.value = '';
        
        // Perform empty search (keep category & filter)
        if (window.SearchModule) {
          window.SearchModule.setQuery('');
          window.SearchModule.performSearch();
        }
        
        this.persistSearchState();
        console.log('✅ Search input cleared');
      });
    });
    
    console.log(`✅ Bound ${qsAll(SEL.clearSearchBtn).length} clear search buttons`);
  },


    /**
     * Bind category tabs
     */
    bindCategoryTabs(selector, uiType) {
      const tabs = qsAll(selector);
      
      // ===== BỔ SUNG DEBUG LOG =====
      console.log(`📋 [${uiType}] Binding category tabs:`, {
        selector: selector,
        tabsFound: tabs.length,
        tabs: tabs.map(t => ({
          text: t.textContent.trim(),
          category: t.getAttribute('data-category'),
          hasActive: t.classList.contains('active')
        }))
      });
      // ===== HẾT BỔ SUNG =====
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const category = tab.getAttribute('data-category') || 'all';
          console.log(`📁 ${uiType} category selected:`, category);
          
          // Remove active from same UI type
          qsAll(selector).forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          
          // Sync to other UI
          this.syncCategoryTabs(category);
          
          // Perform search
          if (window.SearchModule) {
            window.SearchModule.setCategory(category);
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
        });
      });

      if (tabs.length > 0) {
        console.log(`✅ ${uiType} category tabs bound (${tabs.length} tabs)`);
      }
    },

    /**
     * Bind reset filter buttons
     */
    bindResetButtons() {
      // Reset filter only (フィルタリセット button)
      qsAll(SEL.resetFilterBtn).forEach(btn => {
        btn.addEventListener('click', () => {
          console.log('↩️ Reset filter only');
          
          // Reset FilterModule (advanced filters)
          if (window.FilterModule && typeof window.FilterModule.reset === 'function') {
            window.FilterModule.reset();
            console.log('✅ FilterModule reset');
          } else {
            console.warn('⚠️ FilterModule not available');
          }
          
          // Re-run search with current query & category
          if (window.SearchModule) {
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
        });
      });
      
      console.log(`✅ Bound ${qsAll(SEL.resetFilterBtn).length} filter reset buttons`);
      
      // Reset ALL (全クリア button)
      qsAll(SEL.resetAllBtn).forEach(btn => {
        btn.addEventListener('click', () => {
          console.log('🔄 Reset ALL (search + filter + category)');
          
          // Clear search inputs
          const ipadInput = this.getIpadSearchInput();
          const mobileInput = this.getMobileSearchInput();
          
          if (ipadInput) ipadInput.value = '';
          if (mobileInput) mobileInput.value = '';
          
          // Reset to 'all' category
          this.setActiveCategory('all');
          
          // Reset FilterModule
          if (window.FilterModule && typeof window.FilterModule.reset === 'function') {
            window.FilterModule.reset();
            console.log('✅ FilterModule reset');
          }
          
          // Perform fresh search
          if (window.SearchModule) {
            window.SearchModule.setQuery('');
            window.SearchModule.setCategory('all');
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
          console.log('✅ Reset ALL complete');
        });
      });
      
      console.log(`✅ Bound ${qsAll(SEL.resetAllBtn).length} reset-all buttons`);
    },

    



    /**
     * Sync search inputs between mobile and iPad
     */
    syncSearchInputs(sourceInput) {
      const value = sourceInput.value;
      const ipadInput = this.getIpadSearchInput();
      const mobileInput = this.getMobileSearchInput();
      
      if (ipadInput && ipadInput !== sourceInput) {
        ipadInput.value = value;
      }
      
      if (mobileInput && mobileInput !== sourceInput) {
        mobileInput.value = value;
      }
    },

    /**
     * Sync category tabs between mobile and iPad
     */
    syncCategoryTabs(category) {
      // iPad tabs
      const ipadTabs = qsAll(SEL.ipadCategoryTabs);
      ipadTabs.forEach(t => t.classList.remove('active'));
      const ipadTarget = qs(`#category-tabs .category-tab[data-category="${category}"]`);
      if (ipadTarget) {
        ipadTarget.classList.add('active');
        console.log(`✅ iPad tab synced: ${category}`);
      }
      
      // Mobile tabs
      const mobileTabs = qsAll(SEL.mobileCategoryTabs);
      mobileTabs.forEach(t => t.classList.remove('active'));
      const mobileTarget = qs(`.category-tabs-mobile .category-tab[data-category="${category}"]`);
      if (mobileTarget) {
        mobileTarget.classList.add('active');
        console.log(`✅ Mobile tab synced: ${category}`);
      }
    },


    /**
     * Set active category programmatically
     */
    setActiveCategory(category) {
      // iPad tabs
      const ipadTabs = qsAll(SEL.ipadCategoryTabs);
      ipadTabs.forEach(t => t.classList.remove('active'));
      const ipadTab = qs(`#category-tabs .category-tab[data-category="${category}"]`);
      if (ipadTab) {
        ipadTab.classList.add('active');
        console.log(`✅ iPad active category set: ${category}`);
      }
      
      // Mobile tabs
      const mobileTabs = qsAll(SEL.mobileCategoryTabs);
      mobileTabs.forEach(t => t.classList.remove('active'));
      const mobileTab = qs(`.category-tabs-mobile .category-tab[data-category="${category}"]`);
      if (mobileTab) {
        mobileTab.classList.add('active');
        console.log(`✅ Mobile active category set: ${category}`);
      }
    },


    /**
     * Get active category
     */
    getActiveCategory() {
      // Try iPad first
      const ipadActive = qs(`${SEL.ipadCategoryTabs}.active`);
      if (ipadActive) {
        return ipadActive.getAttribute('data-category') || 'all';
      }
      
      // Try mobile
      const mobileActive = qs(`${SEL.mobileCategoryTabs}.active`);
      if (mobileActive) {
        return mobileActive.getAttribute('data-category') || 'all';
      }
      
      return 'all';
    },

    /**
     * Get iPad search input element
     */
    getIpadSearchInput() {
      const selectors = SEL.ipadSearchInput.split(',').map(s => s.trim());
      for (const s of selectors) {
        const el = qs(s);
        if (el) return el;
      }
      return null;
    },

    /**
     * Get mobile search input element
     */
    getMobileSearchInput() {
      return qs(SEL.mobileSearchInput);
    },

    /**
     * Get current search input value (from any UI)
     */
    getSearchInputValue() {
      const ipadInput = this.getIpadSearchInput();
      if (ipadInput && ipadInput.value) return ipadInput.value.trim();
      
      const mobileInput = this.getMobileSearchInput();
      if (mobileInput && mobileInput.value) return mobileInput.value.trim();
      
      return '';
    },

    /**
     * Restore search state from localStorage
     */
    restoreSearchState() {
      try {
        const raw = localStorage.getItem('v777_state');
        if (!raw) return;
        
        const state = JSON.parse(raw);
        console.log('📥 Restoring state:', state);
        
        // Restore search query
        if (state.query != null) {
          const ipadInput = this.getIpadSearchInput();
          const mobileInput = this.getMobileSearchInput();
          
          if (ipadInput) ipadInput.value = state.query;
          if (mobileInput) mobileInput.value = state.query;
        }
        
        // Restore category
        if (state.category) {
          this.setActiveCategory(state.category);
        }
      } catch (err) {
        console.warn('⚠️ Failed to restore state:', err);
      }
    },

    /**
     * Persist search state to localStorage
     */
    persistSearchState() {
      try {
        const payload = {
          query: this.getSearchInputValue(),
          category: this.getActiveCategory(),
        };
        localStorage.setItem('v777_state', JSON.stringify(payload));
      } catch (err) {
        console.warn('⚠️ Failed to persist state:', err);
      }
    },

    // ====================================================================
    // PUBLIC API METHODS (for backward compatibility)
    // ====================================================================
    
    search(query) {
      console.log('🔍 API: search():', query);
      if (window.SearchModule) {
        window.SearchModule.setQuery(query);
        window.SearchModule.performSearch();
      }
    },

    filterByCategory(category) {
      console.log('📁 API: filterByCategory():', category);
      this.setActiveCategory(category);
      if (window.SearchModule) {
        window.SearchModule.setCategory(category);
        window.SearchModule.performSearch();
      }
    },

    updateFilterValues(fieldValue) {
      console.log('📝 API: updateFilterValues():', fieldValue);
      // Reserved for advanced filter implementation
    },

    resetFilter() {
      console.log('↩️ API: resetFilter()');
      const ipadInput = this.getIpadSearchInput();
      const mobileInput = this.getMobileSearchInput();
      
      if (ipadInput) ipadInput.value = '';
      if (mobileInput) mobileInput.value = '';
      
      this.setActiveCategory('all');
      
      // Reset FilterModule
      if (window.FilterModule && typeof window.FilterModule.reset === 'function') {
        window.FilterModule.reset();
      }
      
      if (window.SearchModule) {
        window.SearchModule.setQuery('');
        window.SearchModule.setCategory('all');
        window.SearchModule.performSearch();
      }
      
      this.persistSearchState();
    },


    clearAllFilters() {
      console.log('🗑️ API: clearAllFilters()');
      
      // Reset FilterModule explicitly
      if (window.FilterModule && typeof window.FilterModule.reset === 'function') {
        window.FilterModule.reset();
      }
      
      // Then reset search
      this.resetFilter();
    },


        clearSearch() {
      console.log('🗑️ API: clearSearch()');
      const ipadInput = this.getIpadSearchInput();
      const mobileInput = this.getMobileSearchInput();
      
      if (ipadInput) ipadInput.value = '';
      if (mobileInput) mobileInput.value = '';
      
      if (window.SearchModule) {
        window.SearchModule.setQuery('');
        window.SearchModule.performSearch();
      }
      
      this.persistSearchState();
    },

    // ====================================================================
    // MOBILE UI METHODS (R6.6)
    // ====================================================================

    /**
     * Initialize Mobile UI
     */
    initMobileUI() {
      console.log('📱 Initializing Mobile UI...');
      
      // Listen for result card clicks
      document.addEventListener('click', (e) => {
        const card = e.target.closest('.result-card');
        if (!card) return;

        this.handleMobileCardClick(card);
      });
      
      console.log('✅ Mobile card click listener attached');
    },

    /**
     * Handle mobile result card click
     */
    handleMobileCardClick(card) {
      console.log('📱 Mobile card clicked:', card);
      
      // Remove previous selection
      qsAll('.result-card').forEach(c => {
        c.classList.remove('selected');
      });

      // Mark as selected
      card.classList.add('selected');

      // Get item data from card
      const itemData = this.extractItemDataFromCard(card);
      console.log('📦 Item data extracted:', itemData);

      // Show quick detail panel
      if (window.MobileDetailPanel) {
        window.MobileDetailPanel.show(itemData);
        console.log('✅ Quick Detail Panel shown');
      } else {
        console.warn('⚠️ MobileDetailPanel not available');
      }

      // Enable action buttons
      if (window.MobileActionBar) {
        window.MobileActionBar.enableButtons(itemData);
        console.log('✅ Action buttons enabled');
      } else {
        console.warn('⚠️ MobileActionBar not available');
      }
    },

    /**
     * Extract item data from card element
     */
    extractItemDataFromCard(card) {
      // Get item ID from dataset
      const itemId = card.dataset.itemId || card.dataset.moldId || card.dataset.cutterId;
      
      // Determine item type
      let itemType = card.dataset.itemType;
      if (!itemType) {
        itemType = card.classList.contains('mold') ? 'mold' : 
                   card.classList.contains('cutter') ? 'cutter' : 'unknown';
      }
      
      // Try to get from existing data using DataManager
      let fullData = null;
      if (itemId && window.DataManager) {
        if (itemType === 'mold' && window.DataManager.getMolds) {
          const molds = window.DataManager.getMolds();
          fullData = molds.find(m => m.MoldID == itemId);
        } else if (itemType === 'cutter' && window.DataManager.getCutters) {
          const cutters = window.DataManager.getCutters();
          fullData = cutters.find(c => c.CutterID == itemId);
        }
      }
      
      // If full data found, return it
      if (fullData) {
        console.log('✅ Full data from DataManager:', fullData);
        return fullData;
      }
      
      // Otherwise, parse from card content (fallback)
      const codeEl = card.querySelector('.item-code, .card-title, [data-code]');
      const dimensionEl = card.querySelector('.dimension, .card-subtitle, [data-dimension]');
      const companyEl = card.querySelector('.company, [data-company]');
      const locationEl = card.querySelector('.location, [data-location]');
      
      const parsedData = {
        id: itemId || 'unknown',
        Code: codeEl ? codeEl.textContent.trim() : '-',
        CutterCode: itemType === 'cutter' ? (codeEl ? codeEl.textContent.trim() : '-') : null,
        Dimension: dimensionEl ? dimensionEl.textContent.trim() : '-',
        Size: dimensionEl ? dimensionEl.textContent.trim() : '-',
        itemType: itemType,
        MoldID: itemType === 'mold' ? itemId : null,
        CutterID: itemType === 'cutter' ? itemId : null,
        CompanyName: companyEl ? companyEl.textContent.trim() : 'YSD',
        Status: 'in', // Default
        ShelfNumber: locationEl ? locationEl.textContent.trim() : '-',
        ShelfLevel: '-',
        StorageNote: '-'
      };
      
      console.log('ℹ️ Parsed data from card (fallback):', parsedData);
      return parsedData;
    },
  };  // <-- Giữ nguyên dấu này ĐÓNG object AppController


  // ====================================================================
  // UTILITY FUNCTIONS
  // ====================================================================

  function qs(sel) {
    return document.querySelector(sel);
  }

  function qsAll(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  // ====================================================================
  // EXPORT & AUTO-INIT
  // ====================================================================
  window.AppController = AppController;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppController.init());
  } else {
    AppController.init();
  }

})();
