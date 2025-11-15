/* ========================================================================
   UI RENDERER R7.0 - PERFORMANCE OPTIMIZED
   ========================================================================
   Optimized for iPhone performance
   
   Changes from R6.9.7:
   - ✅ Debounced rendering
   - ✅ Limit initial render (50 items)
   - ✅ Lazy loading on scroll
   - ✅ RequestAnimationFrame batching
   - ✅ Memory-efficient DOM operations
   - ✅ Reduced event listeners
   
   Created: 2025-11-14
   Base: ui-renderer-r6.9.7.js
   ======================================================================== */

(function() {
    'use strict';

    // ======================================== 
    // CONSTANTS
    // ======================================== 
    const SELECTORS = {
        quickListCandidates: [
            '#quick-results-list',
            '.quick-results-grid',
            '#quick-results',
            '[data-role="quick-results"]'
        ],
        tableBodyCandidates: [
            '#results-table-body',
            '#all-results-body',
            '.results-table-body',
            '[data-role="results-body"]'
        ],
        detailCompany: '#detail-company',
        detailRackId: '#detail-rack-id',
        detailLayerNum: '#detail-layer-num',
        detailRackLocation: '#detail-rack-location',
        detailLayerNotes: '#detail-layer-notes',
        detailCodeName: '#detail-code-name',
        detailName: '#detail-name',
        detailDimensions: '#detail-dimensions',
        detailCutline: '#detail-cutline',
        detailDate: '#detail-date',
        detailTeflon: '#detail-teflon',
        detailTray: '#detail-tray',
        detailPlastic: '#detail-plastic',
        detailNotes: '#detail-notes',
        detailProcessing: '#detail-processing',
        detailCompanyStorage: '#detail-company-storage',
        detailCheckinStatus: '#detail-checkin-status'
    };

    // ✅ R7.0: Performance settings
    const PERF_CONFIG = {
        INITIAL_RENDER_COUNT: 50,    // Load first 50 items
        LAZY_LOAD_THRESHOLD: 500,    // Load more when 500px from bottom
        CHUNK_SIZE: 20,               // Process 20 items per chunk
        DEBOUNCE_DELAY: 300,          // 300ms debounce for search
        USE_VIRTUAL_SCROLL: true      // Enable virtual scrolling
    };

    // ======================================== 
    // STATE
    // ======================================== 
    const UIRenderer = {
        state: {
            currentDetailItem: null,
            selectedItemId: null,
            isDetailPanelOpen: false,
            allResults: [],
            renderedCount: 0,           // ✅ R7.0: Track rendered items
            isLoadingMore: false,       // ✅ R7.0: Prevent double loading
            scrollObserver: null        // ✅ R7.0: Intersection Observer
        },

        // ======================================== 
        // INITIALIZATION
        // ======================================== 
        init() {
            console.log('[UIRenderer R7.0] 🚀 Initializing with performance optimizations...');

            // Load statuslogs (unchanged from R6.9.7)
            this.loadStatusLogs();

            // Setup event listeners
            this.setupEventListeners();

            // ✅ R7.0: Setup lazy loading
            this.setupLazyLoading();

            console.log('[UIRenderer R7.0] ✅ Initialized');
        },

        // ======================================== 
        // EVENT LISTENERS
        // ======================================== 
        setupEventListeners() {
            // ✅ search:updated - Debounced
            const debouncedSearchUpdate = window.PerformanceUtils?.debounce((e) => {
                const { results, origin } = e.detail || {};
                console.log('[UIRenderer R7.0] 🔔 search:updated:', results?.length || 0, 'items');
                
                this.renderResults(results || []);
                
                if (results && results.length) {
                    this.renderDetailInfo(results[0]);
                } else {
                    this.clearDetail();
                }
            }, PERF_CONFIG.DEBOUNCE_DELAY);

            document.addEventListener('search:updated', debouncedSearchUpdate);

            // ✅ detail:changed (unchanged)
            document.addEventListener('detail:changed', (e) => {
                const { item, source } = e.detail;
                if (item) {
                    this.updateDetailPanel(item);
                    
                    if (item.MoldID || item.CutterID) {
                        this.updateLocationBadge(item);
                        this.updateCheckInBadge(item);
                    }
                }
            });

            // ✅ inventory events (unchanged)
            this.setupInventoryListeners();

            console.log('[UIRenderer R7.0] ✅ Event listeners setup');
        },

        setupInventoryListeners() {
            // inventory:sort
            document.addEventListener('inventory:sort', (e) => {
                const by = e.detail?.by || 'code';
                this.sortResults(by);
            });

            // inventory:filter
            document.addEventListener('inventory:filter', (e) => {
                const { filterRack, filterLayer, filterType } = e.detail || {};
                this.filterResults(filterRack, filterLayer, filterType);
            });

            // inventory:bulkMode
            document.addEventListener('inventory:bulkMode', (e) => {
                const enabled = e.detail?.enabled || false;
                const quickList = this.getQuickList();
                
                if (quickList) {
                    quickList.classList.toggle('inv-bulk-active', enabled);
                }
                
                this.renderResults(this.state.allResults);
            });

            // inventory:refreshBadges
            document.addEventListener('inventory:refreshBadges', () => {
                this.renderResults(this.state.allResults);
            });

            // inventory:auditRecorded
            document.addEventListener('inventory:auditRecorded', (e) => {
                const { itemId, itemType, date } = e.detail;
                this.updateAuditBadge(itemId, itemType, date);
            });
        },

        // ======================================== 
        // LAZY LOADING SETUP
        // ======================================== 
        setupLazyLoading() {
            if (!PERF_CONFIG.USE_VIRTUAL_SCROLL) return;

            const quickList = this.getQuickList();
            if (!quickList) return;

            // Create sentinel element for lazy loading
            const sentinel = document.createElement('div');
            sentinel.id = 'lazy-load-sentinel';
            sentinel.style.height = '1px';
            sentinel.style.width = '100%';
            quickList.appendChild(sentinel);

            // Setup Intersection Observer
            if ('IntersectionObserver' in window) {
                this.state.scrollObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && !this.state.isLoadingMore) {
                            this.loadMoreItems();
                        }
                    });
                }, {
                    rootMargin: `${PERF_CONFIG.LAZY_LOAD_THRESHOLD}px`,
                    threshold: 0.01
                });

                this.state.scrollObserver.observe(sentinel);
                console.log('[UIRenderer R7.0] ✅ Lazy loading enabled');
            }
        },

        // ======================================== 
        // RENDER RESULTS (OPTIMIZED)
        // ======================================== 
        renderResults(items) {
            console.log('[UIRenderer R7.0] 📊 Rendering', items.length, 'items (optimized)');

            // Store all results
            this.state.allResults = items || [];
            this.state.renderedCount = 0;

            // Clear existing content
            const quickList = this.getQuickList();
            if (quickList) {
                window.PerformanceUtils?.clearUnusedNodes(quickList);
            }

            // ✅ R7.0: Render only initial batch
            const initialBatch = items.slice(0, PERF_CONFIG.INITIAL_RENDER_COUNT);
            
            window.PerformanceUtils?.showLoading('読み込み中... | Đang tải...');
            
            // Use requestAnimationFrame for smooth rendering
            window.PerformanceUtils?.batchDOMUpdates(() => {
                this.renderQuickCards(initialBatch);
                this.state.renderedCount = initialBatch.length;
                
                window.PerformanceUtils?.hideLoading();
                
                console.log(`[UIRenderer R7.0] ✅ Rendered ${initialBatch.length}/${items.length} items`);
                
                // Setup lazy loading for remaining items
                if (items.length > PERF_CONFIG.INITIAL_RENDER_COUNT) {
                    console.log(`[UIRenderer R7.0] 📦 ${items.length - initialBatch.length} items queued for lazy load`);
                }
            });

            // Also render table (if exists)
            this.renderTable(items);
        },

        // ======================================== 
        // LOAD MORE ITEMS (LAZY LOADING)
        // ======================================== 
        loadMoreItems() {
            if (this.state.isLoadingMore) return;
            
            const remaining = this.state.allResults.length - this.state.renderedCount;
            if (remaining <= 0) return;

            this.state.isLoadingMore = true;
            console.log('[UIRenderer R7.0] 📦 Loading more items...', remaining, 'remaining');

            const nextBatch = this.state.allResults.slice(
                this.state.renderedCount,
                this.state.renderedCount + PERF_CONFIG.CHUNK_SIZE
            );

            // Use chunked processing to avoid blocking UI
            window.PerformanceUtils?.processArrayInChunks(
                nextBatch,
                10, // Process 10 items at a time
                (chunk) => {
                    this.appendQuickCards(chunk);
                },
                () => {
                    this.state.renderedCount += nextBatch.length;
                    this.state.isLoadingMore = false;
                    console.log(`[UIRenderer R7.0] ✅ Loaded ${nextBatch.length} more items (total: ${this.state.renderedCount})`);
                }
            );
        },

        // ======================================== 
        // RENDER QUICK CARDS (OPTIMIZED)
        // ======================================== 
        renderQuickCards(items) {
            const wrap = this.getQuickList();
            if (!wrap) {
                console.error('[UIRenderer R7.0] ❌ Quick results container NOT FOUND');
                return;
            }

            // Use DocumentFragment for batch DOM insertion
            const fragment = document.createDocumentFragment();

            items.forEach((item, idx) => {
                const card = this.createCardElement(item, idx);
                fragment.appendChild(card);
            });

            wrap.innerHTML = ''; // Clear existing
            wrap.appendChild(fragment);

            console.log('[UIRenderer R7.0] ✅ Rendered', items.length, 'cards');
        },

        // ======================================== 
        // APPEND QUICK CARDS (FOR LAZY LOADING)
        // ======================================== 
        appendQuickCards(items) {
            const wrap = this.getQuickList();
            if (!wrap) return;

            const fragment = document.createDocumentFragment();

            items.forEach((item, idx) => {
                const card = this.createCardElement(item, this.state.renderedCount + idx);
                fragment.appendChild(card);
            });

            // Insert before sentinel
            const sentinel = document.getElementById('lazy-load-sentinel');
            if (sentinel) {
                wrap.insertBefore(fragment, sentinel);
            } else {
                wrap.appendChild(fragment);
            }
        },
        // ======================================== 
        // CREATE CARD ELEMENT (UNCHANGED từ R6.9.7)
        // ======================================== 
        createCardElement(item, idx) {
            const isMold = !!item.MoldID;
            const itemId = isMold ? item.MoldID : item.CutterID;
            const code = isMold ? item.MoldCode : item.CutterCode;
            const name = isMold ? item.MoldName : item.CutterName;
            const company = item.CompanyID || '';
            const rack = item.RackID || '';
            const layer = item.LayerNum || '';
            const badgeClass = isMold ? 'badge-mold' : 'badge-cutter';
            const badgeText = isMold ? '金型' : '抜型';

            // Inventory audit badge (if exists)
            let auditBadgeHTML = '';
            if (item._auditDate) {
                const isToday = item._auditDate === new Date().toISOString().split('T')[0];
                const badgeColor = isToday ? 'inv-audit-badge-today' : 'inv-audit-badge';
                auditBadgeHTML = `<span class="${badgeColor}" title="最終棚卸: ${item._auditDate}">✓ ${item._auditDate}</span>`;
            }

            // Bulk mode checkbox
            let checkboxHTML = '';
            if (window.InventoryState?.bulkMode) {
                checkboxHTML = `
                    <input type="checkbox" 
                           class="inv-bulk-checkbox" 
                           data-item-id="${itemId}"
                           data-item-type="${isMold ? 'mold' : 'cutter'}">
                `;
            }

            const card = document.createElement('div');
            card.className = 'result-card';
            card.dataset.index = idx;
            card.dataset.itemId = itemId;
            card.dataset.itemType = isMold ? 'mold' : 'cutter';

            card.innerHTML = `
                ${checkboxHTML}
                ${auditBadgeHTML}
                <div class="result-badge ${badgeClass}">${badgeText}</div>
                <div class="result-code">${code || '-'}</div>
                <div class="result-name">${name || '-'}</div>
                <div class="result-info">
                    <span>🏢 ${company}</span>
                    <span>📍 ${rack}-${layer}</span>
                </div>
            `;

            // ✅ R7.0: Event delegation - attach click later
            card.addEventListener('click', (e) => {
                // Ignore if clicking checkbox
                if (e.target.classList.contains('inv-bulk-checkbox')) {
                    return;
                }
                this.handleCardClick(item);
            });

            return card;
        },

        // ======================================== 
        // HANDLE CARD CLICK
        // ======================================== 
        handleCardClick(item) {
            const isMobile = window.innerWidth < 768;

            if (isMobile) {
                // Open mobile modal
                if (window.MobileDetailModal && typeof window.MobileDetailModal.open === 'function') {
                    window.MobileDetailModal.open(item);
                }
            } else {
                // Update detail panel (iPad/Desktop)
                this.renderDetailInfo(item);
                this.updateDetailPanel(item);
            }

            // Dispatch event
            document.dispatchEvent(new CustomEvent('detail:changed', {
                detail: { item, itemType: item.MoldID ? 'mold' : 'cutter', source: 'ui-renderer' }
            }));
        },

        // ======================================== 
        // RENDER TABLE (OPTIMIZED)
        // ======================================== 
        renderTable(items) {
            const tbody = this.getTableBody();
            if (!tbody) return;

            // Clear existing
            tbody.innerHTML = '';

            // ✅ R7.0: Limit table rendering too
            const limitedItems = items.slice(0, 200); // Max 200 in table

            // Use DocumentFragment
            const fragment = document.createDocumentFragment();

            limitedItems.forEach((item, idx) => {
                const row = this.createTableRow(item, idx);
                fragment.appendChild(row);
            });

            tbody.appendChild(fragment);

            if (items.length > 200) {
                console.log(`[UIRenderer R7.0] ⚠️ Table limited to 200/${items.length} items`);
            }
        },

        createTableRow(item, idx) {
            const isMold = !!item.MoldID;
            const row = document.createElement('tr');
            row.dataset.index = idx;

            const code = isMold ? item.MoldCode : item.CutterCode;
            const name = isMold ? item.MoldName : item.CutterName;
            const company = item.CompanyID || '-';
            const rack = item.RackID || '-';
            const layer = item.LayerNum || '-';
            const type = isMold ? '金型' : '抜型';

            row.innerHTML = `
                <td>${idx + 1}</td>
                <td><span class="table-badge ${isMold ? 'badge-mold' : 'badge-cutter'}">${type}</span></td>
                <td class="code-cell">${code}</td>
                <td>${name}</td>
                <td>${company}</td>
                <td>${rack}-${layer}</td>
            `;

            row.addEventListener('click', () => this.handleCardClick(item));

            return row;
        },

        // ======================================== 
        // DETAIL PANEL METHODS (UNCHANGED)
        // ======================================== 
        renderDetailInfo(item) {
            if (!item) {
                this.clearDetail();
                return;
            }

            const isMold = !!item.MoldID;

            // Fill detail fields
            this.setDetailField(SELECTORS.detailCodeName, isMold ? item.MoldCode : item.CutterCode);
            this.setDetailField(SELECTORS.detailName, isMold ? item.MoldName : item.CutterName);
            this.setDetailField(SELECTORS.detailCompany, item.CompanyID);
            this.setDetailField(SELECTORS.detailRackId, item.RackID);
            this.setDetailField(SELECTORS.detailLayerNum, item.LayerNum);
            this.setDetailField(SELECTORS.detailRackLocation, `${item.RackID || ''}-${item.LayerNum || ''}`);
            this.setDetailField(SELECTORS.detailLayerNotes, item.LayerNotes);

            if (isMold) {
                this.setDetailField(SELECTORS.detailDimensions, item.dimensions);
                this.setDetailField(SELECTORS.detailDate, item.date);
                this.setDetailField(SELECTORS.detailTeflon, item.teflonStatus);
                this.setDetailField(SELECTORS.detailTray, item.tray);
                this.setDetailField(SELECTORS.detailNotes, item.notes);
            } else {
                this.setDetailField(SELECTORS.detailCutline, item.cutline);
                this.setDetailField(SELECTORS.detailDate, item.date);
                this.setDetailField(SELECTORS.detailPlastic, item.plastic);
                this.setDetailField(SELECTORS.detailProcessing, item.processing);
                this.setDetailField(SELECTORS.detailCompanyStorage, item.companyStorage);
                this.setDetailField(SELECTORS.detailNotes, item.notes);
            }

            // Store current item
            this.state.currentDetailItem = item;
        },

        updateDetailPanel(item) {
            if (item.MoldID || item.CutterID) {
                this.updateLocationBadge(item);
                this.updateCheckInBadge(item);
            }
        },

        clearDetail() {
            Object.values(SELECTORS).forEach(selector => {
                const el = document.querySelector(selector);
                if (el) el.textContent = '-';
            });
            this.state.currentDetailItem = null;
        },

        setDetailField(selector, value) {
            const el = document.querySelector(selector);
            if (el) {
                el.textContent = value || '-';
            }
        },

        // ======================================== 
        // BADGES UPDATE (UNCHANGED from R6.9.7)
        // ======================================== 
        updateLocationBadge(item) {
            const badgeEl = document.querySelector('#detail-rack-location');
            if (!badgeEl) return;

            const moldId = item.MoldID || item.CutterID;
            const pendingLogs = window.DataManager?.PendingCache?.locationLogs || [];
            const hasPending = pendingLogs.some(p => String(p.MoldID) === String(moldId) && p._pending === true);

            const rackLayer = `${item.RackID || '?'}-${item.LayerNum || '?'}`;
            const syncIcon = hasPending 
                ? '<span class="sync-pending" title="同期待ち">⏳</span>' 
                : '<span class="sync-done" title="同期済み">✓</span>';

            badgeEl.innerHTML = `${rackLayer} ${syncIcon}`;
        },

        updateCheckInBadge(item) {
            const badgeEl = document.querySelector(SELECTORS.detailCheckinStatus);
            if (!badgeEl) return;

            const moldId = item.MoldID || item.CutterID;
            const statusLogs = window.DataManager?.data?.statuslogs || [];
            
            const itemLogs = statusLogs.filter(log => {
                return String(log.MoldID || log.CutterID) === String(moldId);
            });

            if (itemLogs.length === 0) {
                badgeEl.innerHTML = '<span class="status-badge status-unknown">不明 | Unknown</span>';
                return;
            }

            const latestLog = itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
            const status = latestLog.Status;
            
            const pendingLogs = window.DataManager?.PendingCache?.logs || [];
            const hasPending = pendingLogs.some(p => String(p.MoldID) === String(moldId) && p._pending === true);

            const syncIcon = hasPending 
                ? '<span class="sync-pending" title="同期待ち">⏳</span>' 
                : '<span class="sync-done" title="同期済み">✓</span>';

            let badgeHTML = '';
            if (status === 'CHECK_IN' || status === 'check-in') {
                badgeHTML = `<span class="status-badge status-in">IN 入</span> ${syncIcon}`;
            } else if (status === 'CHECK_OUT' || status === 'check-out') {
                badgeHTML = `<span class="status-badge status-out">OUT 出</span> ${syncIcon}`;
            } else if (status === 'AUDIT') {
                badgeHTML = `<span class="status-badge status-audit">棚卸</span> ${syncIcon}`;
            } else {
                badgeHTML = `<span class="status-badge status-unknown">${status}</span> ${syncIcon}`;
            }

            badgeEl.innerHTML = badgeHTML;
        },

        updateAuditBadge(itemId, itemType, auditDate) {
            const cards = document.querySelectorAll(`.result-card[data-item-id="${itemId}"]`);
            cards.forEach(card => {
                const existingBadge = card.querySelector('.inv-audit-badge, .inv-audit-badge-today');
                if (existingBadge) {
                    existingBadge.remove();
                }

                const isToday = auditDate === new Date().toISOString().split('T')[0];
                const badgeClass = isToday ? 'inv-audit-badge-today' : 'inv-audit-badge';
                const badge = document.createElement('span');
                badge.className = badgeClass;
                badge.title = `最終棚卸: ${auditDate}`;
                badge.textContent = `✓ ${auditDate}`;
                
                card.insertBefore(badge, card.firstChild);
            });
        },

        // ======================================== 
        // SORT & FILTER (OPTIMIZED)
        // ======================================== 
        sortResults(by) {
            console.log('[UIRenderer R7.0] Sorting by:', by);
            
            const sorted = [...this.state.allResults].sort((a, b) => {
                if (by === 'rack') {
                    const rackA = `${a.RackID || ''}${a.LayerNum || ''}`;
                    const rackB = `${b.RackID || ''}${b.LayerNum || ''}`;
                    return rackA.localeCompare(rackB);
                } else {
                    const codeA = a.MoldCode || a.CutterCode || '';
                    const codeB = b.MoldCode || b.CutterCode || '';
                    return codeA.localeCompare(codeB);
                }
            });

            this.state.allResults = sorted;
            this.renderResults(sorted);
        },

        filterResults(filterRack, filterLayer, filterType) {
            console.log('[UIRenderer R7.0] Filtering:', { filterRack, filterLayer, filterType });

            let filtered = [...this.state.allResults];

            if (filterRack) {
                filtered = filtered.filter(item => item.RackID === filterRack);
            }

            if (filterLayer) {
                filtered = filtered.filter(item => String(item.LayerNum) === String(filterLayer));
            }

            if (filterType !== 'all') {
                filtered = filtered.filter(item => {
                    if (filterType === 'mold') return !!item.MoldID;
                    if (filterType === 'cutter') return !!item.CutterID;
                    return true;
                });
            }

            this.renderResults(filtered);
        },

        // ======================================== 
        // LOAD STATUSLOGS (UNCHANGED)
        // ======================================== 
        loadStatusLogs() {
            if (window.DataManager && window.DataManager.data) {
                const statuslogs = window.DataManager.data.statuslogs || [];
                console.log('[UIRenderer R7.0] Loaded', statuslogs.length, 'status logs');
            }
        },

        // ======================================== 
        // HELPER METHODS
        // ======================================== 
        getQuickList() {
            for (const sel of SELECTORS.quickListCandidates) {
                const el = document.querySelector(sel);
                if (el) return el;
            }
            return null;
        },

        getTableBody() {
            for (const sel of SELECTORS.tableBodyCandidates) {
                const el = document.querySelector(sel);
                if (el) return el;
            }
            return null;
        }
    };

    // ======================================== 
    // AUTO-INIT
    // ======================================== 
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => UIRenderer.init());
    } else {
        UIRenderer.init();
    }

    // Export to global
    window.UIRenderer = UIRenderer;

    console.log('[UIRenderer R7.0] ✅ Module loaded with performance optimizations');

})();
