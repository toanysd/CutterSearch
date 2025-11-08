/**
 * Search Controller - Binds search inputs to SearchModule
 * Handles both Desktop (iPad) and Mobile (iPhone) search boxes
 */
(function() {
  'use strict';

  // Debounce settings
  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  const SearchController = {
    /**
     * Initialize search inputs binding
     */
    init() {
      console.log('🔍 SearchController initializing...');
      
      this.bindDesktopSearch();
      this.bindMobileSearch();
      this.bindResetButtons();
      
      console.log('✅ SearchController initialized');
    },

    /**
     * Bind Desktop/iPad search input
     */
    bindDesktopSearch() {
      // Multiple selectors for robustness
      const selectors = [
        '#search-input',
        '.search-input:not(#mobile-search-input)',
        '[data-role="search-input"]:not([id*="mobile"])'
      ];
      
      let searchInput = null;
      for (const selector of selectors) {
        searchInput = document.querySelector(selector);
        if (searchInput) break;
      }
      
      if (!searchInput) {
        console.warn('⚠️ Desktop search input not found');
        return;
      }
      
      console.log('✅ Bound desktop search input:', searchInput.id || searchInput.className);
      
      // Input event with debounce
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log('🖥️ [Desktop] Search query:', query);
          this.performSearch(query);
        }, DEBOUNCE_MS);
      });
      
      // Immediate search on Enter
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(debounceTimer);
          const query = e.target.value.trim();
          console.log('🖥️ [Desktop] Search Enter:', query);
          this.performSearch(query);
        }
      });
    },

    /**
     * Bind Mobile/iPhone search input
     */
    bindMobileSearch() {
      const selectors = [
        '#mobile-search-input',
        '.mobile-search-input',
        '[data-role="mobile-search-input"]'
      ];
      
      let searchInput = null;
      for (const selector of selectors) {
        searchInput = document.querySelector(selector);
        if (searchInput) break;
      }
      
      if (!searchInput) {
        console.warn('⚠️ Mobile search input not found');
        return;
      }
      
      console.log('✅ Bound mobile search input:', searchInput.id || searchInput.className);
      
      // Input event with debounce
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log('📱 [Mobile] Search query:', query);
          this.performSearch(query);
        }, DEBOUNCE_MS);
      });
      
      // Immediate search on Enter
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(debounceTimer);
          const query = e.target.value.trim();
          console.log('📱 [Mobile] Search Enter:', query);
          this.performSearch(query);
          
          // Blur on mobile to hide keyboard
          e.target.blur();
        }
      });
    },

    /**
     * Bind reset buttons to clear search
     */
    bindResetButtons() {
      const resetSelectors = [
        '#reset-all-btn',
        '.btn-reset-all',
        '[data-action="reset-all"]'
      ];
      
      resetSelectors.forEach(selector => {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => {
          btn.addEventListener('click', () => {
            console.log('🔄 Reset search triggered');
            this.clearSearch();
          });
        });
      });
    },

    /**
     * Perform search with query
     */
    performSearch(query) {
      if (!window.SearchModule) {
        console.error('❌ SearchModule not loaded');
        return;
      }
      
      // Set query and perform search
      window.SearchModule.setQuery(query);
      
      // Apply filter if FilterModule exists
      let results = window.SearchModule.performSearch();
      
      if (window.FilterModule && window.FilterModule.isActive()) {
        const filterState = window.FilterModule.state;
        results = window.FilterModule.applyFilter(results, filterState.fieldId, filterState.value);
        
        // Re-emit with filtered results
        document.dispatchEvent(new CustomEvent('search:updated', {
          detail: { 
            results, 
            query,
            filtered: true,
            source: 'search-controller'
          }
        }));
      }
      
      console.log(`✅ Search complete: ${results.length} results`);
    },

    /**
     * Clear search inputs and perform empty search
     */
    clearSearch() {
      // Clear all search inputs
      const inputs = [
        document.getElementById('search-input'),
        document.getElementById('mobile-search-input'),
        ...document.querySelectorAll('.search-input')
      ];
      
      inputs.forEach(input => {
        if (input) input.value = '';
      });
      
      // Perform empty search
      this.performSearch('');
    },

    /**
     * Handle resize for responsive layout
     */
    handleResize() {
      // Re-bind if needed when switching between desktop/mobile
      const isMobile = window.innerWidth <= 768;
      console.log(`📐 Layout: ${isMobile ? 'Mobile' : 'Desktop'}`);
    }
  };

  // Expose globally
  window.SearchController = SearchController;

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SearchController.init());
  } else {
    SearchController.init();
  }
})();
