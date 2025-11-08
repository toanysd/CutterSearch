/**
 * ========================================================================
 * FILTER-MODULE-R6.5.JS
 * V7.7.7 Advanced Filter Module — Dual UI (Desktop + Mobile)
 * ========================================================================
 * Purpose:
 * - Advanced filtering with field + value dropdown selection
 * - Support BOTH Desktop (iPad) and Mobile (iPhone) UI
 * - Sync filter state between both interfaces
 * - Listen to 'search:updated' → apply filter → re-emit 'search:updated'
 * - Public API: reset(), getState(), setState()
 * ========================================================================
 * Created: 2025.11.06 Original
 * Updated: 2025.11.06 16:00 JST (r6.5 - Dual UI Support)
 * Author: System Architect
 * ========================================================================
 */

(function () {
  'use strict';

  // ====================================================================
  // SELECTORS - Support BOTH Desktop + Mobile
  // ====================================================================
  const SELECTORS = {
    // Desktop (iPad) filter selectors
    desktopFieldSelect: [
      '#filter-field',
      '#filter-field-select',
      '.filter-field',
      '[data-role="filter-field"]',
      '#filter-key'
    ],
    desktopValueSelect: [
      '#filter-value',
      '#filter-value-select',
      '.filter-value',
      '[data-role="filter-value"]',
      '#filter-val'
    ],
    desktopResetBtn: [
      '#btn-filter-reset',
      '.btn-filter-reset',
      '#filter-reset',
      '#filter-reset-btn',
      '.filter-reset-btn'
    ],

    // Mobile (iPhone) filter selectors
    mobileFieldSelect: [
      '#mobile-filter-field',
      '.mobile-filter-field',
      '[data-role="mobile-filter-field"]'
    ],
    mobileValueSelect: [
      '#mobile-filter-value',
      '.mobile-filter-value',
      '[data-role="mobile-filter-value"]'
    ],
    mobileResetBtn: [
      '#mobile-filter-reset-btn',      // ✅ ĐÚNG - match với HTML
      '#mobile-reset-filter-btn',
      '#mobile-filter-reset',
      '.mobile-reset-filter-btn',
      '.mobile-filter-reset-btn'
    ],
  };

  // ====================================================================
  // FILTER FIELDS CONFIGURATION
  // ====================================================================
  const FILTER_FIELDS = [
    { id: 'itemType', label: '種別/Loại', get: it => it.itemType },
    { id: 'storageCompany', label: '保管会社/Cty giữ', get: it => (it.storageCompanyInfo?.CompanyShortName || it.storageCompanyInfo?.CompanyName || it.storageCompany || '') },
    { id: 'rackLocation', label: '棚位置/Vị trí kệ', get: it => it.rackInfo?.RackLocation || '' },
    { id: 'rackId', label: '棚番号/Mã kệ', get: it => it.rackLayerInfo?.RackID || '' },
    { id: 'layerNum', label: '階層番号/Tầng', get: it => it.rackLayerInfo?.RackLayerNumber || '' },
    { id: 'customer', label: '顧客名/Khách hàng', get: it => (it.customerInfo?.CustomerShortName || it.customerInfo?.CustomerName || '') },
    { id: 'company', label: '会社名/Công ty', get: it => (it.companyInfo?.CompanyShortName || it.companyInfo?.CompanyName || '') },
    { id: 'status', label: '状態/Trạng thái', get: it => (it.currentStatus?.text || '') },
    { id: 'teflon', label: 'テフロン/Teflon', get: it => it.TeflonCoating || '' },
    { id: 'returning', label: '返却/MoldReturning', get: it => (it.MoldReturning || '') },
    { id: 'disposing', label: '廃棄/MoldDisposing', get: it => (it.MoldDisposing || '') },
    { id: 'drawing', label: '図番/Mã bản vẽ', get: it => it.designInfo?.DrawingNumber || '' },
    { id: 'equip', label: '設備コード/Thiết bị', get: it => it.designInfo?.EquipmentCode || '' },
    { id: 'plastic', label: '樹脂/Loại nhựa', get: it => it.designInfo?.DesignForPlasticType || '' },
    { id: 'dim', label: '寸法/Kích thước', get: it => (it.displayDimensions || it.cutlineSize || '') },
  ];

  // ====================================================================
  // STATE MANAGEMENT
  // ====================================================================
  const state = {
    fieldId: '',
    value: '',
    _reEmitting: false,
    desktopFieldEl: null,
    desktopValueEl: null,
    mobileFieldEl: null,
    mobileValueEl: null,
  };

  // ====================================================================
  // FILTER MODULE
  // ====================================================================
  const FilterModule = {
    /**
     * Initialize filter module for both Desktop and Mobile
     */
    initializeFilters() {
      console.log('🔧 FilterModule r6.5: Initializing...');

      // Initialize Desktop filters
      this.initDesktopFilters();

      // Initialize Mobile filters
      this.initMobileFilters();

      // Setup global event listeners
      this.setupGlobalListeners();

      // Restore saved filter state
      this.restoreState();

      console.log('✅ FilterModule r6.5: Ready!');
    },

    /**
     * Initialize Desktop (iPad) filter UI
     */
    initDesktopFilters() {
      const fieldEl = resolveSelect(SELECTORS.desktopFieldSelect);
      const valueEl = resolveSelect(SELECTORS.desktopValueSelect);
      const resetBtn = resolveFirst(SELECTORS.desktopResetBtn);

      if (!fieldEl) {
        console.warn('⚠️ Desktop filter field select not found');
        return;
      }

      state.desktopFieldEl = fieldEl;
      state.desktopValueEl = valueEl;

      // Populate field options
      this.populateFieldOptions(fieldEl);

      // Field change event
      fieldEl.addEventListener('change', () => {
        const fieldId = fieldEl.value || '';
        console.log('🖥️ [Desktop] Filter field changed:', fieldId);
        
        state.fieldId = fieldId;
        this.buildValueOptions(valueEl, fieldId);
        
        if (valueEl) valueEl.value = '';
        state.value = '';
        
        // Sync to mobile
        this.syncFieldToMobile(fieldId);
        
        this.triggerFilter();
        this.persistState();
      });

      // Value change event
      if (valueEl) {
        valueEl.addEventListener('change', () => {
          const value = valueEl.value || '';
          console.log('🖥️ [Desktop] Filter value changed:', value);
          
          state.value = value;
          
          // Sync to mobile
          this.syncValueToMobile(value);
          
          this.triggerFilter();
          this.persistState();
        });
      }

      // Reset button
      // Filter reset button
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          console.log('🖥️ [Desktop] Reset filter clicked');
          this.reset();
        });
      }

      // ✅ NEW: Bind reset-all button (clear filter + search)
      const resetAllBtns = document.querySelectorAll('#reset-all-btn');
      resetAllBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          console.log('🖥️ [Desktop] Reset ALL clicked');
          this.resetAll();
        });
      });

      // Initialize value options
      this.buildValueOptions(valueEl, '');

      console.log('✅ Desktop filters initialized');
    },

    /**
     * Initialize Mobile (iPhone) filter UI
     */
    initMobileFilters() {
      const fieldEl = resolveSelect(SELECTORS.mobileFieldSelect);
      const valueEl = resolveSelect(SELECTORS.mobileValueSelect);
      const resetBtn = resolveFirst(SELECTORS.mobileResetBtn);

      if (!fieldEl) {
        console.warn('⚠️ Mobile filter field select not found');
        return;
      }

      state.mobileFieldEl = fieldEl;
      state.mobileValueEl = valueEl;

      // Populate field options
      this.populateFieldOptions(fieldEl);

      // Field change event
      fieldEl.addEventListener('change', () => {
        const fieldId = fieldEl.value || '';
        console.log('📱 [Mobile] Filter field changed:', fieldId);
        
        state.fieldId = fieldId;
        this.buildValueOptions(valueEl, fieldId);
        
        if (valueEl) valueEl.value = '';
        state.value = '';
        
        // Sync to desktop
        this.syncFieldToDesktop(fieldId);
        
        this.triggerFilter();
        this.persistState();
      });

      // Value change event
      if (valueEl) {
        valueEl.addEventListener('change', () => {
          const value = valueEl.value || '';
          console.log('📱 [Mobile] Filter value changed:', value);
          
          state.value = value;
          
          // Sync to desktop
          this.syncValueToDesktop(value);
          
          this.triggerFilter();
          this.persistState();
        });
      }

      // Reset button
      // Filter reset button
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          console.log('📱 [Mobile] Reset filter clicked');
          this.reset();
        });
      }

      // ✅ NEW: Bind mobile reset-all button
      const mobileResetAllBtns = document.querySelectorAll('#reset-all-btn');
      mobileResetAllBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          console.log('📱 [Mobile] Reset ALL clicked');
          this.resetAll();
        });
      });


      // Initialize value options
      this.buildValueOptions(valueEl, '');

      console.log('✅ Mobile filters initialized');
    },

    /**
     * Setup global event listeners
     */
    setupGlobalListeners() {
      // Listen to search results → apply filter → re-emit
      document.addEventListener('search:updated', (e) => {
        const origin = e.detail?.origin || '';
        if (origin === 'filter') return; // Avoid infinite loop

        const base = e.detail?.results || [];
        const filtered = this.applyFilter(base, state.fieldId, state.value);

        console.log(`🔍 Filter applied: ${base.length} → ${filtered.length} results`);

        state._reEmitting = true;
        document.dispatchEvent(new CustomEvent('search:updated', {
          detail: { 
            ...e.detail, 
            results: filtered, 
            total: filtered.length, 
            origin: 'filter' 
          }
        }));
        state._reEmitting = false;
      });

      // Listen to global filter reset event
      document.addEventListener('filter:reset', () => {
        console.log('📢 Global filter:reset event received');
        this.reset();
      });
    },

    /**
     * Populate field dropdown with filter fields
     */
    populateFieldOptions(selectEl) {
      if (!selectEl) return;
      
      selectEl.innerHTML = '';
      this.appendOption(selectEl, '', 'まずフィールドを選択');
      
      FILTER_FIELDS.forEach(f => {
        this.appendOption(selectEl, f.id, f.label);
      });
    },

    /**
     * Build value dropdown options based on selected field
     */
    buildValueOptions(selectEl, fieldId) {
      const sel = ensureSelect(selectEl);
      if (!sel) return;

      sel.innerHTML = '';
      this.appendOption(sel, '', 'すべて | Tất cả'); // All

      if (!fieldId) return;

      const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
      if (!getter) return;

      const items = window.DataManager?.getAllItems?.() || [];
      const valueSet = new Set();

      for (const it of items) {
        const v = (getter(it) || '').toString().trim();
        if (v) valueSet.add(v);
      }

      Array.from(valueSet)
        .sort((a, b) => a.localeCompare(b, 'ja'))
        .forEach(v => this.appendOption(sel, v, v));

      console.log(`📋 Built ${valueSet.size} value options for field: ${fieldId}`);
    },

    /**
     * Apply filter to results array
     */
    applyFilter(list, fieldId, value) {
      if (!fieldId || !value) return list;

      const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
      if (!getter) return list;

      const val = value.toString().toLowerCase();
      return list.filter(it => {
        const itemValue = (getter(it) || '').toString().toLowerCase();
        return itemValue.includes(val);
      });
    },

    /**
     * Trigger filter by calling SearchModule
     */
    triggerFilter() {
      console.log(`🔄 Triggering filter: field=${state.fieldId}, value=${state.value}`);
      window.SearchModule?.performSearch?.();
    },

    /**
     * Sync field selection from Desktop to Mobile
     */
    syncFieldToMobile(fieldId) {
      if (state.mobileFieldEl && state.mobileFieldEl !== document.activeElement) {
        state.mobileFieldEl.value = fieldId;
        this.buildValueOptions(state.mobileValueEl, fieldId);
        console.log(`🔄 Synced field to mobile: ${fieldId}`);
      }
    },

    /**
     * Sync field selection from Mobile to Desktop
     */
    syncFieldToDesktop(fieldId) {
      if (state.desktopFieldEl && state.desktopFieldEl !== document.activeElement) {
        state.desktopFieldEl.value = fieldId;
        this.buildValueOptions(state.desktopValueEl, fieldId);
        console.log(`🔄 Synced field to desktop: ${fieldId}`);
      }
    },

    /**
     * Sync value selection from Desktop to Mobile
     */
    syncValueToMobile(value) {
      if (state.mobileValueEl && state.mobileValueEl !== document.activeElement) {
        state.mobileValueEl.value = value;
        console.log(`🔄 Synced value to mobile: ${value}`);
      }
    },

    /**
     * Sync value selection from Mobile to Desktop
     */
    syncValueToDesktop(value) {
      if (state.desktopValueEl && state.desktopValueEl !== document.activeElement) {
        state.desktopValueEl.value = value;
        console.log(`🔄 Synced value to desktop: ${value}`);
      }
    },

    /**
     * Reset filter to default state
     */
    reset() {
      console.log('↩️ Resetting filter module...');

      // Reset desktop UI
      if (state.desktopFieldEl) state.desktopFieldEl.selectedIndex = 0;
      if (state.desktopValueEl) state.desktopValueEl.selectedIndex = 0;

      // Reset mobile UI
      if (state.mobileFieldEl) state.mobileFieldEl.selectedIndex = 0;
      if (state.mobileValueEl) state.mobileValueEl.selectedIndex = 0;

      // Reset state
      state.fieldId = '';
      state.value = '';

      // Rebuild value options
      this.buildValueOptions(state.desktopValueEl, '');
      this.buildValueOptions(state.mobileValueEl, '');

      // Clear localStorage
      this.clearState();

      // ✅ FIX: Re-apply current search query WITHOUT filter
      const currentQuery = document.getElementById('search-input')?.value?.trim() || '';
      
      // Get all items and apply search (if any)
      let results = window.DataManager?.getAllItems?.() || [];
      
      if (currentQuery && window.DataManager?.search) {
        // Re-search with current query but NO filter
        results = window.DataManager.search(currentQuery);
      }
      
      // Emit search:updated with correct results
      document.dispatchEvent(new CustomEvent('search:updated', {
        detail: { 
          results: results, 
          source: 'filter-reset',
          query: currentQuery
        }
      }));

      console.log(`✅ Filter reset - ${results.length} items (query: "${currentQuery}")`);
    },



    /**
     * Reset ALL - Clear filter + search input
     */
    resetAll() {
      console.log('🔄 Resetting ALL (filter + search)...');
      
      // 1. Clear search inputs FIRST (trước khi reset filter)
      const searchInputs = [
        document.getElementById('search-input'),
        document.getElementById('mobile-search-input'),
        document.querySelector('.search-input input'),
        document.querySelector('[data-role="search-input"]')
      ].filter(el => el !== null);
      
      searchInputs.forEach(input => {
        input.value = '';
        console.log('🗑️ Cleared search input:', input.id || input.className);
      });
      
      // 2. Reset filter state (UI + localStorage)
      if (state.desktopFieldEl) state.desktopFieldEl.selectedIndex = 0;
      if (state.desktopValueEl) state.desktopValueEl.selectedIndex = 0;
      if (state.mobileFieldEl) state.mobileFieldEl.selectedIndex = 0;
      if (state.mobileValueEl) state.mobileValueEl.selectedIndex = 0;
      
      state.fieldId = '';
      state.value = '';
      
      this.buildValueOptions(state.desktopValueEl, '');
      this.buildValueOptions(state.mobileValueEl, '');
      this.clearState();
      
      // 3. Get ALL items and emit ONCE
      const allItems = window.DataManager?.getAllItems?.() || [];
      
      document.dispatchEvent(new CustomEvent('search:updated', {
        detail: { 
          results: allItems, 
          source: 'reset-all',
          query: '' // Empty query = show all
        }
      }));
      
      console.log(`✅ Reset ALL complete - ${allItems.length} total items`);
    },



    /**
     * Get current filter state
     */
    getState() {
      return {
        fieldId: state.fieldId,
        value: state.value,
      };
    },

    /**
     * Set filter state programmatically
     */
    setState(fieldId, value) {
      state.fieldId = fieldId || '';
      state.value = value || '';

      // Update desktop UI
      if (state.desktopFieldEl) state.desktopFieldEl.value = state.fieldId;
      if (state.desktopValueEl) state.desktopValueEl.value = state.value;

      // Update mobile UI
      if (state.mobileFieldEl) state.mobileFieldEl.value = state.fieldId;
      if (state.mobileValueEl) state.mobileValueEl.value = state.value;

      // Rebuild value options
      this.buildValueOptions(state.desktopValueEl, state.fieldId);
      this.buildValueOptions(state.mobileValueEl, state.fieldId);

      this.triggerFilter();
      this.persistState();
    },

    /**
     * Save filter state to localStorage
     */
    persistState() {
      try {
        const payload = {
          fieldId: state.fieldId,
          value: state.value,
        };
        localStorage.setItem('v777_filter_state', JSON.stringify(payload));
        console.log('💾 Filter state saved:', payload);
      } catch (err) {
        console.warn('⚠️ Failed to persist filter state:', err);
      }
    },

    /**
     * Restore filter state from localStorage
     */
    restoreState() {
      try {
        const raw = localStorage.getItem('v777_filter_state');
        if (!raw) return;

        const saved = JSON.parse(raw);
        console.log('📥 Restoring filter state:', saved);

        this.setState(saved.fieldId, saved.value);
      } catch (err) {
        console.warn('⚠️ Failed to restore filter state:', err);
      }
    },

    /**
     * Clear filter state from localStorage
     */
    clearState() {
      try {
        localStorage.removeItem('v777_filter_state');
        console.log('🗑️ Filter state cleared');
      } catch (err) {
        console.warn('⚠️ Failed to clear filter state:', err);
      }
    },

    /**
     * Append option to select element
     */
    appendOption(sel, val, label) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      sel.appendChild(o);
    },
  };

  // ====================================================================
  // HELPER FUNCTIONS
  // ====================================================================
  
  /**
   * Resolve select element from candidate selectors
   */
  function resolveSelect(candidates) {
    const el = resolveFirst(candidates);
    return ensureSelect(el);
  }

  /**
   * Ensure element is a select or contains a select
   */
  function ensureSelect(el) {
    if (!el) return null;
    if (el.tagName && el.tagName.toLowerCase() === 'select') return el;
    const inner = el.querySelector?.('select');
    return inner || null;
  }

  /**
   * Find first matching element from candidate selectors
   */
  function resolveFirst(candidates) {
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // ====================================================================
  // EXPORT & AUTO-INIT
  // ====================================================================
  window.FilterModule = FilterModule;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FilterModule.initializeFilters());
  } else {
    FilterModule.initializeFilters();
  }

  console.log('✅ filter-module-r6.5.js loaded');

})();
