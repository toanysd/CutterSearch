/**
 * ui-renderer.js (V7.7.7 - FULL SYNC FIX)
 * ✅ Render quick cards + table khi search:updated
 * ✅ Render detail info (cột 3) khi detail:changed
 * ✅ Giữ nguyên tất cả chức năng đã hoạt động
 * ✅ Log rõ ràng từng bước để debug
 */
(function () {
  'use strict';

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

  const UIRenderer = {
    state: {
      currentDetailItem: null,
      selectedItemId: null,
      isDetailPanelOpen: false
    },

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

              // Đọc từng dòng trong CSV
              for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                const moldId = parts[moldIdIndex]?.trim();
                const status = parts[statusIndex]?.trim()?.toLowerCase();
                if (moldId && status) {
                  // Lưu trạng thái mới nhất (dòng cuối ghi đè dòng cũ)
                  window.statusLogs[moldId] = status.includes('in') ? 'in' : 'out';
                }
              }

              console.log(
                '[UIRenderer] ✅ Loaded statuslogs.csv — total:',
                Object.keys(window.statusLogs).length,
                'records'
              );
            })
            .catch(err =>
              console.error('[UIRenderer] ❌ Load statuslogs.csv failed:', err)
            );
      }

      // ✅ Lắng nghe search:updated (từ SearchModule hoặc FilterModule)
      document.addEventListener('search:updated', (e) => {
        const { results, origin } = e.detail || {};
        console.log('[UIRenderer] 🔔 search:updated received:', {
          resultsCount: results?.length || 0,
          origin: origin || 'unknown'
        });
        
        this.renderResults(results || []);
        
        // Render detail cho item đầu tiên nếu có
        if (results && results.length) {
          this.renderDetailInfo(results[0]);
        } else {
          this.clearDetail();
        }
      });

      // ✅ THÊM: Lắng nghe detail:changed để sync cột 3
      document.addEventListener('detail:changed', (e) => {
        const { item, itemType, itemId, source } = e.detail || {};
      
        console.log('[UIRenderer] 📡 detail:changed received:', {
          itemType,
          itemId,
          source,
          hasItem: !!item
        });

        if (item) {
            this.updateDetailPanel(item);
            
          
        }
      });

      // 🧩 THÊM: Lắng nghe event 'status:updated' từ check-in-checkout
      document.addEventListener('status:updated', (e) => {
        const { moldId, status } = e.detail || {};
        console.log('[UIRenderer] 🔄 status:updated event received:', { moldId, status });

        // Nếu item hiện tại khớp với moldId, cập nhật ngay
        if (this.state.currentDetailItem && 
            (this.state.currentDetailItem.MoldID === moldId || 
             this.state.currentDetailItem.MoldCode === moldId)) {
          this.updateCheckInOutStatus(this.state.currentDetailItem);
        }
      });

      console.log('[UIRenderer] v7.7.7 FULL-SYNC loaded');
    },

    renderResults(items) {
      console.log('[UIRenderer] 📊 renderResults called with', items.length, 'items');
      this.renderQuickCards(items);
      this.renderTable(items);
    },

    renderQuickCards(items) {
      const wrap = getFirst(SELECTORS.quickListCandidates);
      
      if (!wrap) {
        console.error('[UIRenderer] ❌ Quick results container NOT FOUND');
        return;
      }

      console.log('[UIRenderer] ✅ Rendering', items.length, 'quick cards...');

      wrap.innerHTML = '';
      const fragment = document.createDocumentFragment();

      items.slice(0, 100).forEach((item, idx) => {
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
        el.setAttribute('data-index', String(idx));
        el.setAttribute('data-type', isMold ? 'mold' : 'cutter');
        el.setAttribute('data-id', itemId);
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
        fragment.appendChild(el);
      });

      wrap.appendChild(fragment);
      console.log('[UIRenderer] ✅ Rendered', items.length, 'cards');

      // Update badge
      const badge = document.querySelector('#quick-count');
      if (badge) {
        badge.textContent = String(items.length);
      }
    },

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
          <td><button class="btn-view">詳細</button></td>
        `;
        tbody.appendChild(tr);
      });
    },

    renderDetailInfo(item) {
      if (!item) return;

      this.state.currentDetailItem = item;
      const isMold = item.itemType === 'mold';
      this.state.selectedItemId = isMold 
        ? String(item.MoldID || item.MoldCode || '')
        : String(item.CutterID || item.CutterNo || '');

      this.updateDetailPanel(item);

      // 🧩 Cập nhật trạng thái IN/OUT từ statuslogs.csv
      


      // Dispatch detail:changed để các module khác biết
      document.dispatchEvent(new CustomEvent('detail:changed', {
        detail: { 
          item, 
          itemType: isMold ? 'mold' : 'cutter',
          itemId: this.state.selectedItemId,
          source: 'ui-renderer'
        }
      }));

      console.log('[UIRenderer] 📡 Dispatched detail:changed for:', this.state.selectedItemId);
    },

    // ✅ THÊM: Hàm riêng để update detail panel (cột 3)
    // ==========================================
    // ✅ R6.2 FINAL - FIX COMPANY BADGE + NO HISTORY TEXT
    // ==========================================

    updateDetailPanel(item) {
        if (!item) return;
        
        const isMold = item.itemType === 'mold';
        
        // ✅ FIX: Company badge với logic màu sắc
        const compEl = document.querySelector('#detail-company-storage');
        if (compEl) {
            // ✅ FIX: Đọc từ đúng field
            let comp = '-';
            
            if (isMold) {
                // For mold: Check storageCompanyInfo first, fallback to CompanyShortName
                comp = item.storageCompanyInfo?.CompanyShortName 
                    || item.CompanyShortName 
                    || item.CompanyName 
                    || '-';
            } else {
                // For cutter
                comp = item.CompanyShortName || item.CompanyName || '-';
            }
            
            compEl.textContent = comp;
            
            // ✅ Logic màu: YSD = xanh dương, khác = cam (CHỈ nếu KHÔNG phải "-")
            if (comp !== '-') {
                const isYSD = comp.toUpperCase().includes('YSD');
                compEl.classList.remove('company-ysd', 'company-other');
                compEl.className = `detail-company-badge ${isYSD ? 'company-ysd' : 'company-other'}`;
                
                console.log('[UIRenderer] ✅ Company badge:', comp, '→', isYSD ? 'YSD (blue)' : 'Other (orange)');
            } else {
                // Nếu không có data, dùng style neutral
                compEl.classList.remove('company-ysd', 'company-other');
                compEl.className = 'detail-company-badge company-neutral';
                console.warn('[UIRenderer] ⚠️ No company data for item:', item.MoldCode || item.CutterNo);
            }
        }

      // 🧩 Hiển thị trạng thái Check-in / Check-out ngay cạnh công ty lưu trữ
      const stateEl = document.querySelector(SELECTORS.detailCheckState);
      if (stateEl) {
        const state = item.check_state?.toUpperCase() || 'OUT';
        stateEl.textContent = state === 'IN' ? 'Đang Check-in' : 'Đang Check-out';
        stateEl.className = 'badge ' + (state === 'IN' ? 'badge-in' : 'badge-out');
      }

      // Mold specific fields
      setText(SELECTORS.detailRackId, item.rackInfo?.RackNumber || '-');
      setText(SELECTORS.detailLayerNum, item.rackLayerInfo?.RackLayerNumber || '-');
      setText(SELECTORS.detailRackLocation, item.displayRackLocation || '-');
      setText(SELECTORS.detailLayerNotes, item.rackLayerInfo?.RackLayerNotes || '');
    
      // Common fields
      setText(SELECTORS.detailCodeName, item.displayCode || '-');
      setText(SELECTORS.detailName, item.displayName || '-');
      setText(SELECTORS.detailDimensions, item.displayDimensions || '-');

      // Cutter specific fields
      setText(SELECTORS.detailCutline, item.cutlineSize || '-');
      setText(SELECTORS.detailPlastic, item.plasticType || '-');
      setText(SELECTORS.detailDate, item.displayDate || '-');
     
      // Notes & Processing
      setText(SELECTORS.detailNotes, item.MoldNotes || item.CutterNotes || '-');
      // ✅ MỚI - ĐÚNG
      const processingStatus = item.MoldReturning || item.MoldDisposing ||

                              item.CutterReturning || item.CutterDisposing || '-';
      setText(SELECTORS.detailProcessing, processingStatus);
      setText(SELECTORS.detailTray, item.designInfo?.TrayInfoForMoldDesign || '-');
     
      // Teflon badge with class
      const teflonEl = document.querySelector(SELECTORS.detailTeflon);
      if (teflonEl) {
        const tf = item.TeflonCoating || '-';
        teflonEl.textContent = tf;
        teflonEl.className = 'detail-teflon ' + (tf === 'テフロン加工済' ? 'has-teflon' : 'no-teflon');
      }

      // ========================================
      // 🧩 CẬP NHẬT TRẠNG THÁI IN/OUT NGAY LẬP TỨC
      // ========================================
      this.updateCheckInOutStatus(item);
      console.log('[UIRenderer] 🎨 Updated detail panel for:', item.displayCode || item.MoldCode || item.CutterNo);
    },

    // ========================================
    // 🧩 UPDATE CHECK-IN/OUT STATUS - MỚI
    // ========================================

    /**
     * UPDATE CHECK-INOUT STATUS - R6.2 SYNC-AWARE
     */
    // ✅ FIX: updateCheckInOutStatus với text rõ ràng khi no-history
    updateCheckInOutStatus(item) {
        if (!item) return;
        
        const statusLogs = window.DataManager?.data?.statuslogs || [];
        if (!statusLogs || statusLogs.length === 0) {
            console.warn('[UIRenderer] ⚠️ statuslogs not loaded yet, retrying...');
            setTimeout(() => this.updateCheckInOutStatus(item), 200);
            return;
        }
        
        try {
            const itemId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || null;
            if (!itemId) return;
            
            const itemLogs = statusLogs.filter(log => {
                const logMoldId = String(log.MoldID || '').trim();
                const compareId = String(itemId).trim();
                return logMoldId === compareId;
            });
            
            const statusBadge = document.querySelector('#detail-checkin-status');
            if (!statusBadge) {
                console.warn('⚠️ #detail-checkin-status not found');
                return;
            }
            
            // ✅ FIX: Default state với FULL TEXT tiếng Nhật-Việt
            if (itemLogs.length === 0) {
                console.log('[UIRenderer] No status logs for', itemId);
                
                statusBadge.classList.remove('status-in', 'status-out', 'badge-pending');
                statusBadge.classList.add('no-history');
                
                // ✅ Set HTML với full text
                statusBadge.innerHTML = `
                    <div class="badge-text-main">履歴なし</div>
                    
                `;
                
                statusBadge.title = '履歴なし / Chưa có lịch sử nhập xuất';
                
                console.log('[UIRenderer] ✅ Badge set to no-history state with JP/VN text');
                return;
            }
            
            // Sort theo thời gian mới nhất
            itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
            
            const latestLog = itemLogs[0];
            const status = (latestLog.Status || '').toLowerCase();
            const isPending = latestLog._pending === true;
            
            console.log('[UIRenderer] Latest log:', {
                status,
                isPending,
                timestamp: latestLog.Timestamp
            });
            
            // Reset classes trước
            statusBadge.classList.remove('status-in', 'status-out', 'badge-pending', 'no-history');
            
            // ✅ Build HTML với sync icon
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
                syncIcon = '<span class="sync-icon pending" title="Đang đồng bộ... / 同期中...">🔄</span>';
                statusBadge.classList.add('badge-pending');
            } else {
                syncIcon = '<span class="sync-icon synced" title="Đã đồng bộ / 同期済み">✓</span>';
            }
            
            statusBadge.innerHTML = badgeHTML + syncIcon;
            
            console.log('[UIRenderer] ✅ Badge updated:', status, isPending ? '(pending)' : '(synced)');
        } catch (err) {
            console.error('[UIRenderer] Error updating status', err);
        }
    },

    clearDetail() {
      this.state.currentDetailItem = null;
      this.state.selectedItemId = null;

      Object.keys(SELECTORS).forEach(key => {
        const sel = SELECTORS[key];
        if (typeof sel === 'string' && sel.startsWith('#detail-')) {
          const el = document.querySelector(sel);
          if (el) el.textContent = '-';
        }
      });
      
      console.log('[UIRenderer] 🧹 Cleared detail panel');
    }
  };

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
    return String(str).replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    })[c] || c);
  }

  window.UIRenderer = UIRenderer;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UIRenderer.init(), { once: true });
  } else {
    UIRenderer.init();
  }

  // 🧩 Tự cập nhật lại badge khi có sự kiện status:updated
  document.addEventListener('status:updated', (e) => {
      const { id, status } = e.detail;
      const el = document.querySelector('#detail-status-badge');
      if (el) {
          el.textContent = status?.toUpperCase?.() || '';
          el.className = 'status-badge ' + (status === 'in' ? 'status-in' : 'status-out');
      }
      console.log('[UIRenderer] 🔄 Status badge updated →', id, status);
  });

})();
