/**
 * V7.7.7 App Controller (root folder) — FIX selectors for V7.7.5 UI
 * - Debounce 300ms
 * - Bind .category-tab[data-category] with .active class
 * - Works without Phase 2 scripts
 */
(function () {
  'use strict';

  const SEL = {
    // search input: try multiple candidates in current HTML
    searchInputCandidates: ['#search-input', '.search-input input', '.search-input'],
    clearButton: '#btn-clear-all, .search-clear-btn',
    resetFilterBtn: '#btn-filter-reset',

    // category tabs per CSS
    tabSelector: '.category-tab[data-category]',
  };

  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  const AppController = {
    async init() {
      console.log('🚀 V7.7.7 Initializing...');

      await window.DataManager.loadAllData();

      // Restore state
      this.restoreSearchState();

      // Initial category + search
      const cat = this.getActiveCategory() || 'all';
      window.SearchModule.setCategory(cat);
      window.SearchModule.setQuery(getSearchInput()?.value || '');
      window.SearchModule.performSearch();

      // Events
      this.setupEventListeners();

      console.log('✅ App ready.');
    },

    setupEventListeners() {
      const input = getSearchInput();
      if (input) {
        input.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            window.SearchModule.setQuery(getSearchInput()?.value || '');
            window.SearchModule.performSearch();
            this.persistSearchState();
          }, DEBOUNCE_MS);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            window.SearchModule.setQuery(getSearchInput()?.value || '');
            window.SearchModule.performSearch();
          }
        });
      }

      // Clear
      qsAll(SEL.clearButton).forEach(btn => btn.addEventListener('click', () => {
        const el = getSearchInput();
        if (el) el.value = '';
        window.SearchModule.setQuery('');
        window.SearchModule.performSearch();
        this.persistSearchState();
      }));

      // Category tabs
      qsAll(SEL.tabSelector).forEach(tab => {
        tab.addEventListener('click', () => {
          // toggle .active according to CSS
          qsAll(SEL.tabSelector).forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const cat = tab.getAttribute('data-category') || 'all';
          window.SearchModule.setCategory(cat);
          window.SearchModule.performSearch();
          this.persistSearchState();
        });
      });
    },

    getActiveCategory() {
      const active = document.querySelector(`${SEL.tabSelector}.active`);
      return active?.getAttribute('data-category') || 'all';
    },

    restoreSearchState() {
      try {
        const raw = localStorage.getItem('v777_state');
        if (!raw) return;
        const s = JSON.parse(raw);
        const input = getSearchInput();
        if (input && s.query != null) input.value = s.query;
        if (s.category) {
          const want = document.querySelector(`${SEL.tabSelector}[data-category="${s.category}"]`);
          if (want) {
            qsAll(SEL.tabSelector).forEach(t => t.classList.remove('active'));
            want.classList.add('active');
          }
        }
      } catch {}
    },

    persistSearchState() {
      try {
        const payload = {
          query: getSearchInput()?.value || '',
          category: this.getActiveCategory(),
        };
        localStorage.setItem('v777_state', JSON.stringify(payload));
      } catch {}
    },
  };

  // Utilities
  function qs(sel) { return document.querySelector(sel); }
  function qsAll(sel) { return Array.from(document.querySelectorAll(sel)); }
  function getSearchInput() {
    for (const s of SEL.searchInputCandidates) {
      const el = qs(s);
      if (el) return el;
    }
    return null;
  }

  window.AppController = AppController;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppController.init());
  } else {
    AppController.init();
  }
})();
