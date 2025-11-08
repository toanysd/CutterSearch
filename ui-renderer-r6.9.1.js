/**
 * ui-renderer-r6.9.1.js
 * 
 * ✅ BASE: ui-renderer-r6.3.1.js (FULL COMPATIBILITY)
 * ✅ NEW: Performance optimizations
 *    - Pagination rendering (50 items initial, 30 items per batch)
 *    - Lazy detail loading (debounced)
 *    - Infinite scroll support
 *    - DocumentFragment for batch rendering
 * 
 * Version: r6.9.1 (Performance Optimized)
 * Date: 2025.11.08
 * Base: ui-renderer-r6.3.1.js (WORKING VERSION)
 */

(function () {
  'use strict';

  // ==========================================
  // 🚀 PERFORMANCE SETTINGS
  // ==========================================
  const PERF = {
    INITIAL_BATCH: 50,        // Render 50 items initially
    LOAD_MORE_BATCH: 30,      // Load 30 more items per batch
    SCROLL_THRESHOLD: 200,    // px from bottom to trigger load more
    DETAIL_LOAD_DELAY: 100,   // ms delay before loading detail
    CARD_RENDER_DELAY: 0      // No delay for card rendering (instant)
  };

  // ==========================================
  // 📦 STATE MANAGEMENT
  // ==========================================
  const renderState = {
    allResults: [],           // All search results
    renderedCount: 0,         // Number of items rendered
    isLoading: false,         // Loading flag
    detailLoadTimer: null     // Timer for debounced detail load
  };

  // ==========================================
  // 🔍 SELECTORS (UNCHANGED FROM R6.3.1)
  // ==========================================
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
    detailCompanyStorage: 'detail-company-storage',
    detailCheckinStatus: 'detail-checkin-status',
  };

  // ==========================================
  // 🎨 UI RENDERER OBJECT
  // ==========================================
  const UIRenderer = {
    state: {
      currentDetailItem: null,
      selectedItemId: null,
      isDetailPanelOpen: false
    },

    // ==========================================
    // 🔧 INIT (UNCHANGED FROM R6.3.1)
    // ==========================================
    init() {
      // 🧩 Load statuslogs.csv nếu chưa có
      if (!window.statusLogs) {
        window.statusLogs = {};
        fetch('https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/statuslogs.csv')
          .then(res => res.text())
          .then(text => {
            const lines = text.trim().split('\n');
            const header = lines[0].split(',').map(h => h.trim().toLowerCase());
            const moldIdIndex = header.indexOf('moldid');
            const statusIndex = header.indexOf('status');
            if (moldIdIndex === -1 || statusIndex === -1) {
              console.error('[UIRenderer] ❌ CSV missing required columns (MoldID / Status)');
              return;
            }

            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(',');
              const moldId = parts[moldIdIndex]?.trim();
              const status = parts[statusIndex]?.trim()?.toLowerCase();
              if (moldId && status) {
                window.statusLogs[moldId] = status.includes('in') ? 'in' : 'out';
              }
            }
            console.log('[UIRenderer] ✅ Loaded statuslogs.csv — total:', Object.keys(window.statusLogs).length, 'records');
          })
          .catch(err => console.error('[UIRenderer] ❌ Load statuslogs.csv failed:', err));
      }

      // ✅ Lắng nghe search:updated
      document.addEventListener('search:updated', (e) => {
        const { results, origin } = e.detail || {};
        console.log('[UIRenderer] 🔔 search:updated received:', {
          resultsCount: results?.length || 0,
          origin: origin || 'unknown'
        });

        this.renderResults(results || []);

        if (results && results.length) {
          this.renderDetailInfoDebounced(results[0]);
        } else {
          this.clearDetail();
        }
      });

      // ✅ Lắng nghe detail:changed (GIỐNG R6.3.1)
      document.addEventListener('detail:changed', (e) => {
        const { item, itemType, itemId, source } = e.detail;
        
        if (item) {
          this.updateDetailPanel(item);
          
          if (item.MoldID || item.CutterID) {
            this.updateLocationBadge(item);
            console.log('[UIRenderer] 🎯 updateLocationBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
          }
          
          if (item.MoldID || item.CutterID) {
            this.updateCheckInBadge(item);
            console.log('[UIRenderer] 🎯 updateCheckInBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
          }
        }
      });

      // ✅ Lắng nghe status:updated
      document.addEventListener('status:updated', (e) => {
        const { moldId, status } = e.detail || {};
        console.log('[UIRenderer] 🔄 status:updated event received:', { moldId, status });

        if (
          this.state.currentDetailItem &&
          (this.state.currentDetailItem.MoldID === moldId ||
           this.state.currentDetailItem.MoldCode === moldId)
        ) {
          this.updateCheckInOutStatus(this.state.currentDetailItem);
        }
      });

      // 🚀 Setup infinite scroll
      this.setupInfiniteScroll();

      console.log('[UIRenderer] v7.7.7-r6.9.1 loaded (Performance Mode with Pagination)');
    },

    // ==========================================
    // 🚀 NEW: RENDER RESULTS WITH PAGINATION
    // ==========================================
    renderResults(items) {
      console.log('[UIRenderer] 📊 renderResults called with', items.length, 'items (Performance Mode)');
      
      // Reset pagination state
      renderState.allResults = items;
      renderState.renderedCount = 0;
      
      // Render with pagination
      this.renderQuickCardsPaginated(items);
      this.renderTable(items); // Table renders all (rarely used)
    },

    // ==========================================
    // 🚀 NEW: PAGINATED QUICK CARDS RENDERING
    // ==========================================
    renderQuickCardsPaginated(items) {
      const wrap = getFirst(SELECTORS.quickListCandidates);
      if (!wrap) {
        console.error('[UIRenderer] ❌ Quick results container NOT FOUND');
        return;
      }

      console.log('[UIRenderer] ✅ Rendering quick cards (Paginated Mode)...');
      wrap.innerHTML = '';

      // Render first batch
      this.renderCardBatch(0, PERF.INITIAL_BATCH);

      // Update badge
      const badge = document.querySelector('#quick-count');
      if (badge) badge.textContent = String(items.length);
    },

    // ==========================================
    // 🚀 NEW: RENDER BATCH OF CARDS
    // ==========================================
    renderCardBatch(startIdx, count) {
      const wrap = getFirst(SELECTORS.quickListCandidates);
      if (!wrap) return;

      const endIdx = Math.min(startIdx + count, renderState.allResults.length);
      const batch = renderState.allResults.slice(startIdx, endIdx);

      if (batch.length === 0) return;

      console.log(`[UIRenderer] 🔄 Rendering batch: ${startIdx}-${endIdx} (${batch.length} items)`);

      // Use DocumentFragment for performance
      const fragment = document.createDocumentFragment();

      batch.forEach((item, localIdx) => {
        const globalIdx = startIdx + localIdx;
        const isMold = item.itemType === 'mold';
        const typeLabel = isMold ? '金型' : '抜型';
        const code = esc(item.displayCode || item.MoldCode || item.CutterNo || '-');
        const name = esc(item.displayName || item.MoldName || '-');
        const dim = esc(item.displayDimensions || item.cutlineSize || 'N/A');
        const loc = esc(item.rackInfo?.RackLocation || '-');
        const itemId = isMold
          ? String(item.MoldID || item.MoldCode || '')
          : String(item.CutterID || item.CutterNo || '');

        const el = document.createElement('div');
        el.className = 'result-card';
        el.setAttribute('data-index', String(globalIdx));
        el.setAttribute('data-type', isMold ? 'mold' : 'cutter');
        el.setAttribute('data-id', itemId);

        if (isMold && item.MoldCode) {
          el.setAttribute('data-mold-code', String(item.MoldCode));
        }

        el.innerHTML = `
          <div class="card-header">
            <span class="type-badge ${isMold ? 'type-mold' : 'type-cutter'}">${typeLabel}</span>
          </div>
          <div class="card-body">
            <div class="card-code">${code}</div>
            <div class="card-name">${name}</div>
            <div class="card-meta">
              <span class="card-dim">${dim}</span>
              <span class="card-loc">${loc}</span>
            </div>
          </div>
        `;

        // 🚀 Click handler with lazy detail loading
        el.addEventListener('click', () => {
          this.handleCardClick(el, item);
        });

        fragment.appendChild(el);
      });

      wrap.appendChild(fragment);
      renderState.renderedCount = endIdx;

      console.log(`[UIRenderer] ✅ Batch rendered: ${renderState.renderedCount}/${renderState.allResults.length}`);
    },

    // ==========================================
    // 🚀 NEW: HANDLE CARD CLICK WITH LAZY LOADING
    // ==========================================
    handleCardClick(cardEl, item) {
      // Remove active class from all cards
      const allCards = document.querySelectorAll('.result-card');
      allCards.forEach(c => c.classList.remove('active'));

      // Add active class to clicked card
      cardEl.classList.add('active');

      // Lazy load detail with debounce
      this.renderDetailInfoDebounced(item);
    },

    // ==========================================
    // 🚀 NEW: DEBOUNCED DETAIL LOADING
    // ==========================================
    renderDetailInfoDebounced(item) {
      if (!item) return;

      // Clear previous timer
      clearTimeout(renderState.detailLoadTimer);

      // Set loading state immediately
      this.state.currentDetailItem = item;
      const isMold = item.itemType === 'mold';
      this.state.selectedItemId = isMold
        ? String(item.MoldID || item.MoldCode)
        : String(item.CutterID || item.CutterNo);

      // Show loading indicator
      this.showDetailLoadingState();

      // Debounce detail loading
      renderState.detailLoadTimer = setTimeout(() => {
        this.renderDetailInfo(item);
      }, PERF.DETAIL_LOAD_DELAY);
    },

    // ==========================================
    // 🚀 NEW: SHOW LOADING STATE
    // ==========================================
    showDetailLoadingState() {
      // Optional: Show loading spinner in detail panel
      // For now, just log
      console.log('[UIRenderer] ⏳ Loading detail...');
    },

    // ==========================================
    // ✅ RENDER DETAIL INFO (UNCHANGED FROM R6.3.1)
    // ==========================================
    renderDetailInfo(item) {
      if (!item) return;

      this.state.currentDetailItem = item;
      const isMold = item.itemType === 'mold';
      this.state.selectedItemId = isMold
        ? String(item.MoldID || item.MoldCode)
        : String(item.CutterID || item.CutterNo);

      this.updateDetailPanel(item);
      this.updateCheckInOutStatus(item);

      document.dispatchEvent(
        new CustomEvent('detail:changed', {
          detail: {
            item,
            itemType: isMold ? 'mold' : 'cutter',
            itemId: this.state.selectedItemId,
            source: 'ui-renderer'
          }
        })
      );

      console.log('[UIRenderer] 🎨 renderDetailInfo for:', item.displayCode || 'unknown');
    },

    // ==========================================
    // 🚀 NEW: INFINITE SCROLL SETUP
    // ==========================================
    setupInfiniteScroll() {
      const wrap = getFirst(SELECTORS.quickListCandidates);
      if (!wrap) return;

      let scrollTimer;
      wrap.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          this.checkLoadMore(wrap);
        }, 100);
      });

      console.log('[UIRenderer] ✅ Infinite scroll enabled');
    },

    // ==========================================
    // 🚀 NEW: CHECK IF SHOULD LOAD MORE
    // ==========================================
    checkLoadMore(container) {
      if (renderState.isLoading) return;
      if (renderState.renderedCount >= renderState.allResults.length) return;

      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

      if (distanceFromBottom < PERF.SCROLL_THRESHOLD) {
        console.log('[UIRenderer] 📥 Loading more items...');
        renderState.isLoading = true;
        
        setTimeout(() => {
          this.renderCardBatch(renderState.renderedCount, PERF.LOAD_MORE_BATCH);
          renderState.isLoading = false;
        }, 50);
      }
    },

    // ==========================================
    // ✅ RENDER TABLE (UNCHANGED - R6.3.1)
    // ==========================================
    renderTable(items) {
      const tbody = getFirst(SELECTORS.tableBodyCandidates);
      if (!tbody) {
        console.warn('[UIRenderer] ⚠ Table body not found');
        return;
      }

      tbody.innerHTML = '';
      items.forEach((item, idx) => {
        const isMold = item.itemType === 'mold';
        const tr = document.createElement('tr');
        tr.setAttribute('data-index', String(idx));

        tr.innerHTML = `
          <td>${esc(isMold ? '金型' : '抜型')}</td>
          <td>${esc(item.displayCode || '-')}</td>
          <td>${esc(item.displayName || '-')}</td>
          <td>${esc(item.displayDimensions || '-')}</td>
          <td>${esc(item.displayLocation || '-')}</td>
          <td>${esc(item.currentStatus?.text || '-')}</td>
          <td><button class="btn-view">View</button></td>
        `;

        tbody.appendChild(tr);
      });
    },
    // ==========================================
    // ✅ UPDATE DETAIL PANEL (UNCHANGED FROM R6.3.1)
    // ==========================================
    updateDetailPanel(item) {
      if (!item) return;

      const isMold = item.itemType === 'mold';

      // Company badge
      const compEl = document.querySelector('#detail-company-storage');
      if (compEl) {
        let comp = '-';
        if (isMold) {
          comp = item.storageCompanyInfo?.CompanyShortName || item.CompanyShortName || item.CompanyName || '-';
        } else {
          comp = item.CompanyShortName || item.CompanyName || '-';
        }
        compEl.textContent = comp;

        if (comp !== '-') {
          const isYSD = comp.toUpperCase().includes('YSD');
          compEl.classList.remove('company-ysd', 'company-other');
          compEl.className = 'detail-company-badge ' + (isYSD ? 'company-ysd' : 'company-other');
          console.log('[UIRenderer] Company badge:', comp, '-', isYSD ? 'YSD (blue)' : 'Other (orange)');
        } else {
          compEl.classList.remove('company-ysd', 'company-other');
          compEl.className = 'detail-company-badge company-neutral';
          console.warn('[UIRenderer] No company data for item:', item.MoldCode || item.CutterNo);
        }
      }

      // Rack-Layer info
      setText(SELECTORS.detailRackId, item.rackInfo?.RackNumber || '-');
      setText(SELECTORS.detailLayerNum, item.rackLayerInfo?.RackLayerNumber || '-');
      setText(SELECTORS.detailRackLocation, item.displayRackLocation || '-');
      setText(SELECTORS.detailLayerNotes, item.rackLayerInfo?.RackLayerNotes || '');

      // Common fields
      setText(SELECTORS.detailCodeName, item.displayCode || '-');
      setText(SELECTORS.detailName, item.displayName || '-');
      setText(SELECTORS.detailDimensions, item.displayDimensions || '-');

      // Cutter specific
      setText(SELECTORS.detailCutline, item.cutlineSize || '-');
      setText(SELECTORS.detailPlastic, item.plasticType || '-');
      setText(SELECTORS.detailDate, item.displayDate || '-');

      // Notes & Processing
      setText(SELECTORS.detailNotes, item.MoldNotes || item.CutterNotes || '-');
      const processingStatus = item.MoldReturning || item.MoldDisposing || item.CutterReturning || item.CutterDisposing || '-';
      setText(SELECTORS.detailProcessing, processingStatus);
      setText(SELECTORS.detailTray, item.designInfo?.TrayInfoForMoldDesign || '-');

      // Teflon badge
      const teflonEl = document.querySelector(SELECTORS.detailTeflon);
      if (teflonEl) {
        const tf = item.TeflonCoating || '-';
        teflonEl.textContent = tf;
        teflonEl.className = 'detail-teflon ' + (tf !== '-' ? 'has-teflon' : 'no-teflon');
      }

      this.updateCheckInOutStatus(item);

      console.log('[UIRenderer] 🎨 Updated detail panel for:', item.displayCode || item.MoldCode || item.CutterNo);
    },

    // ==========================================
    // ✅ UPDATE CHECKIN/OUT STATUS (UNCHANGED FROM R6.3.1)
    // ==========================================
    updateCheckInOutStatus(item) {
      if (!item) return;

      const statusLogs = window.DataManager?.data?.statuslogs;
      if (!statusLogs || statusLogs.length === 0) {
        console.warn('[UIRenderer] statuslogs not loaded yet, retrying...');
        setTimeout(() => this.updateCheckInOutStatus(item), 200);
        return;
      }

      try {
        const itemId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || null;
        if (!itemId) return;

        const itemLogs = statusLogs.filter((log) => {
          const logMoldId = String(log.MoldID || '').trim();
          const compareId = String(itemId).trim();
          return logMoldId === compareId;
        });

        const statusBadge = document.querySelector('#detail-checkin-status');
        if (!statusBadge) {
          console.warn('#detail-checkin-status not found');
          return;
        }

        if (itemLogs.length === 0) {
          console.log('[UIRenderer] No status logs for', itemId);
          statusBadge.classList.remove('status-in', 'status-out', 'badge-pending');
          statusBadge.classList.add('no-history');
          statusBadge.innerHTML = '<div class="badge-text-main">未確認</div>';
          statusBadge.title = 'Chưa có lịch sử nhập xuất';
          console.log('[UIRenderer] Badge set to no-history state with JP/VN text');
          return;
        }

        itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        const latestLog = itemLogs[0];
        const status = (latestLog.Status || '').toLowerCase();
        const isPending = latestLog.pending === true;

        console.log('[UIRenderer] Latest log:', status, isPending, 'timestamp:', latestLog.Timestamp);

        statusBadge.classList.remove('status-in', 'status-out', 'badge-pending', 'no-history');

        let badgeHTML = '<span class="badge-text">';
        let syncIcon = '';

        if (status.includes('in')) {
          badgeHTML += 'IN';
          statusBadge.classList.add('status-in');
        } else if (status.includes('out')) {
          badgeHTML += 'OUT';
          statusBadge.classList.add('status-out');
        } else {
          badgeHTML += '-';
        }
        badgeHTML += '</span>';

        if (isPending) {
          syncIcon = '<span class="sync-icon pending" title="Đang đồng bộ...">◉</span>';
          statusBadge.classList.add('badge-pending');
        } else {
          syncIcon = '<span class="sync-icon synced" title="Đã đồng bộ">✓</span>';
        }

        statusBadge.innerHTML = badgeHTML + syncIcon;

        console.log('[UIRenderer] Badge updated:', status, isPending ? 'pending' : 'synced');
      } catch (err) {
        console.error('[UIRenderer] Error updating status:', err);
      }
    },

    // ==========================================
    // ✅ UPDATE LOCATION BADGE (UNCHANGED FROM R6.3.1)
    // ==========================================
    updateLocationBadge(item) {
      console.log('[UIRenderer] 🎯 updateLocationBadge called');

      const rackIdEl = document.getElementById('detail-rack-id');
      const layerNumEl = document.getElementById('detail-layer-num');

      if (!rackIdEl || !layerNumEl) {
        console.warn('[UIRenderer] ⚠ Rack/Layer elements not found');
        return;
      }

      // Lấy locationlog để check trạng thái sync
      const locationLogs = window.DataManager?.data?.locationlog || [];
      
      // Tìm log mới nhất cho item này
      const latestLog = locationLogs.find(l => {
        if (item.MoldID) {
          return String(l.MoldID) === String(item.MoldID);
        } else if (item.CutterID) {
          return String(l.CutterID) === String(item.CutterID);
        }
        return false;
      });

      // Xác định trạng thái sync
      const isPending = latestLog?.pending === true;
      const hasError = latestLog?.syncError;

      let syncClass = 'sync-icon synced';
      let syncIcon = '✓';
      let syncTitle = '同期済み / Đã đồng bộ';
      
      if (hasError) {
        syncClass = 'sync-icon error';
        syncIcon = '!';
        syncTitle = 'エラー / Lỗi: ' + latestLog.syncError;
      } else if (isPending) {
        syncClass = 'sync-icon pending';
        syncIcon = '◉';
        syncTitle = '同期中 / Đang chờ đồng bộ...';
      }

      // Lấy thông tin Giá-Tầng từ item
      const rackLayerID = item.currentRackLayer || item.RackLayerID;
      const rackLayer = window.DataManager?.data?.racklayers?.find(
        r => String(r.RackLayerID) === String(rackLayerID)
      );
      const rack = window.DataManager?.data?.racks?.find(
        r => String(r.RackID) === String(rackLayer?.RackID)
      );

      const rackDisplay = rack?.RackID || rack?.RackNumber || `Giá ${rackLayer?.RackID || '?'}`;
      const layerDisplay = rackLayer?.RackLayerNumber || '?';

      // ✅ UPDATE HTML: Thêm sync icon vào các badge hiện tại
      rackIdEl.innerHTML = `${rackDisplay} `;
      layerNumEl.innerHTML = ` ${layerDisplay} <span class="${syncClass}" title="${syncTitle}" style="font-size: 10px; margin-left: 4px;">${syncIcon}</span>`;

      console.log('[UIRenderer] ✅ Location badge updated:', {
        rackLayerID,
        display: `${rackDisplay} - ${layerDisplay}`,
        syncStatus: isPending ? 'pending' : hasError ? 'error' : 'synced'
      });
    },

    // ==========================================
    // ✅ UPDATE CHECKIN BADGE (UNCHANGED FROM R6.3.1)
    // ==========================================
    updateCheckInBadge(item) {
      console.log('[UIRenderer] 🎯 updateCheckInBadge called');

      // Gọi lại hàm updateCheckInOutStatus() đã có sẵn
      this.updateCheckInOutStatus(item);
    },

    // ==========================================
    // ✅ CLEAR DETAIL (UNCHANGED FROM R6.3.1)
    // ==========================================
    clearDetail() {
      this.state.currentDetailItem = null;
      this.state.selectedItemId = null;

      Object.keys(SELECTORS).forEach((key) => {
        const sel = SELECTORS[key];
        if (typeof sel === 'string' && sel.startsWith('#detail-')) {
          const el = document.querySelector(sel);
          if (el) el.textContent = '-';
        }
      });

      console.log('[UIRenderer] 🧹 Cleared detail panel');
    }
  };

  // ==========================================
  // 🔧 HELPER FUNCTIONS (UNCHANGED FROM R6.3.1)
  // ==========================================
  function getFirst(list) {
    for (const sel of list) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function setText(sel, val) {
    const el = document.querySelector(sel);
    if (el) el.textContent = val || '-';
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==========================================
  // 🔧 UPDATE DETAIL PANEL HEADER (R6.8 FEATURE)
  // ==========================================
  function updateDetailPanelHeader(itemData) {
    // MoldID (đã có)
    const moldIdSpan = document.getElementById('detail-item-code-span');
    if (moldIdSpan && itemData.id) {
      moldIdSpan.textContent = itemData.id;
    }

    // MoldCode (MỚI)
    const moldCodeSpan = document.getElementById('detail-moldcode-span');
    if (moldCodeSpan && itemData.code) {
      moldCodeSpan.textContent = itemData.code;
    }

    // Title
    const titleSpan = document.querySelector('.detail-title');
    if (titleSpan && itemData.title) {
      titleSpan.textContent = itemData.title;
    }
  }

  // ==========================================
  // 🔧 UPDATE HEADER FROM ITEM (R6.8 FEATURE)
  // ==========================================
  function updateHeaderFromItem(item, itemType) {
    if (!item) {
      console.warn('[UIRenderer] updateHeaderFromItem: No item provided');
      return;
    }
    const isMold = itemType === 'mold';

    const idEl = document.getElementById('detail-item-code-span');
    if (idEl) {
      idEl.textContent = isMold
        ? (item.MoldID || item.MoldCode || '-')
        : (item.CutterID || item.CutterNo || '-');
    }

    const codeEl = document.getElementById('detail-moldcode-span');
    if (codeEl) {
      codeEl.textContent = isMold
        ? (item.MoldCode || '-')
        : (item.CutterNo || '-');
    }

    const ttlEl = document.querySelector('.detail-title');
    if (ttlEl) {
      ttlEl.textContent = item.displayName || item.MoldName || item.CutterName || 'N/A';
    }
    console.log('[UIRenderer] ✅ Header updated');
  }

  // ==========================================
  // 🌐 EXPORT TO GLOBAL
  // ==========================================
  window.UIRenderer = UIRenderer;

  // ==========================================
  // 🚀 AUTO-INIT
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UIRenderer.init(), { once: true });
  } else {
    UIRenderer.init();
  }

  // ==========================================
  // ✅ STATUS BADGE AUTO-UPDATE (R6.3.1 FEATURE)
  // ==========================================
  document.addEventListener('status:updated', (e) => {
    const { id, status } = e.detail || {};
    const el = document.querySelector('#detail-status-badge');
    if (el) {
      el.textContent = status?.toUpperCase?.() || '-';
      el.className = 'status-badge ' + (status === 'in' ? 'status-in' : 'status-out');
      console.log('[UIRenderer] Status badge updated:', id, status);
    }
  });
})();
