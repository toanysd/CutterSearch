/**
 * ui-renderer-r6.9.5.js
 * 
 * ✅ KẾ THỪA TOÀN BỘ ui-renderer-r6.3.js
 * ✅ CHỈ THÊM 2 HÀM MỚI:
 *    - updateLocationBadge() - Update badge Giá-Tầng với sync icon
 *    - updateCheckInBadge() - Update badge CheckIn với sync icon
 * 
 * Version: r6.3.1 (Incremental Update)
 * Date: 2025.10.30
 * Base: ui-renderer-r6.3.js (WORKING VERSION)
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
    detailCompanyStorage: '#detail-company-storage',
    detailCheckinStatus: '#detail-checkin-status',
  };

  const UIRenderer = {
    state: {
      currentDetailItem: null,
      selectedItemId: null,
      isDetailPanelOpen: false,
      allResults: [] // ✅ R6.9.5: Lưu kết quả để sắp xếp
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
          this.renderDetailInfo(results[0]);
        } else {
          this.clearDetail();
        }
      });

      // ✅ Lắng nghe detail:changed (GIỐNG R6.3 - KHÔNG THAY ĐỔI)
      document.addEventListener('detail:changed', (e) => {
        const { item, itemType, itemId, source } = e.detail;
        
        if (item) {
          this.updateDetailPanel(item);
          
          // ✅ SỬA: LUÔN gọi updateLocationBadge cho mọi item (không check source)
          if (item.MoldID || item.CutterID) {
            this.updateLocationBadge(item);
            console.log('[UIRenderer] 🎯 updateLocationBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
          }
          
          // ✅ SỬA: LUÔN gọi updateCheckInBadge cho mọi item
          if (item.MoldID || item.CutterID) {
            this.updateCheckInBadge(item);
            console.log('[UIRenderer] 🎯 updateCheckInBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
          }
        }
      });

      // ✅ R6.9.5: Lắng nghe inventory:sort
      document.addEventListener('inventory:sort', (e) => {
        const by = e.detail?.by || 'code';
        
        console.log(`[UIRenderer] 🔄 Sorting results by: ${by}`);
        
        // Lấy danh sách kết quả hiện tại từ state
        const currentResults = this.state.allResults || [];
        
        if (currentResults.length === 0) {
            console.warn('[UIRenderer] ⚠️ No results to sort');
            return;
        }
        
        // Tạo bản sao để không ảnh hưởng dữ liệu gốc
        const sortedResults = currentResults.slice(0);
        
        if (by === 'rack') {
            // Sắp xếp theo RackLayerID / displayLocation
            sortedResults.sort((a, b) => {
                const aRack = String(a.displayLocation || a.RackLayerID || '').trim();
                const bRack = String(b.displayLocation || b.RackLayerID || '').trim();
                return aRack.localeCompare(bRack, undefined, { numeric: true });
            });
            console.log('[UIRenderer] ✅ Sorted by RackLayerID');
        } else {
            // Sắp xếp theo code (MoldCode / CutterNo)
            sortedResults.sort((a, b) => {
                const aCode = String(a.displayCode || a.MoldCode || a.CutterNo || '').trim();
                const bCode = String(b.displayCode || b.MoldCode || b.CutterNo || '').trim();
                return aCode.localeCompare(bCode);
            });
            console.log('[UIRenderer] ✅ Sorted by Code');
        }
        
        // Cập nhật state và re-render
        this.state.allResults = sortedResults;
        this.renderResults(sortedResults);
          
          console.log(`[UIRenderer] ✅ Re-rendered ${sortedResults.length} items after sort`);
      });

      // ✅ R6.9.5: Lắng nghe inventory:filter
        document.addEventListener('inventory:filter', (e) => {
            const { filterRack, filterLayer, filterType } = e.detail || {};
            
            console.log('[UIRenderer] 🔍 Applying inventory filters:', { filterRack, filterLayer, filterType });
            
            let filtered = this.state.allResults.slice(0);
            
            // Filter by Rack
            if (filterRack) {
                filtered = filtered.filter(item => {
                    const rackId = item.displayRackId || item.RackID || item.rackInfo?.RackID || '';
                    return String(rackId) === String(filterRack);
                });
            }
            
            // Filter by Layer
            if (filterLayer) {
                filtered = filtered.filter(item => {
                    const layerNum = item.displayLayerNum || item.LayerNum || item.rackInfo?.LayerNum || '';
                    return String(layerNum) === String(filterLayer);
                });
            }
            
            // Filter by Type
            if (filterType && filterType !== 'all') {
                filtered = filtered.filter(item => item.itemType === filterType);
            }
            
            this.renderResults(filtered);
            
            console.log(`[UIRenderer] ✅ Filtered: ${this.state.allResults.length} → ${filtered.length} items`);
        });
        
        // ✅ R6.9.7: Lắng nghe inventory:bulkMode + toggle class container
        document.addEventListener('inventory:bulkMode', (e) => {
          const enabled = e.detail?.enabled || false;
          console.log('[UIRenderer] 📦 Bulk mode:', enabled ? 'ON' : 'OFF');
          
          // ✅ Toggle class trên container để kích hoạt CSS
          const quickList = document.querySelector('#quick-results-list');
          if (quickList) {
            if (enabled) {
              quickList.classList.add('inv-bulk-active');
              console.log('[UIRenderer] ✅ Container class added: inv-bulk-active');
            } else {
              quickList.classList.remove('inv-bulk-active');
              console.log('[UIRenderer] ✅ Container class removed: inv-bulk-active');
            }
          }
          
          // Re-render để hiển thị/ẩn checkboxes
          this.renderResults(this.state.allResults);
        });

        
        // ✅ R6.9.5: Lắng nghe inventory:refreshBadges
        document.addEventListener('inventory:refreshBadges', () => {
            console.log('[UIRenderer] 🔄 Refreshing audit badges...');
            this.renderResults(this.state.allResults);
        });
        
        // ✅ R6.9.7 - Lắng nghe 'inventory:auditRecorded' để refresh badge ngay
        document.addEventListener('inventory:auditRecorded', (e) => {
          const { itemId, itemType, date } = e.detail;
          console.log('[UIRenderer] 📡 Audit recorded event received:', { itemId, itemType, date });
          
          // ✅ Cập nhật badge trực tiếp trên card hiện tại (không re-render toàn bộ)
          const cardSelector = `[data-type="${itemType}"][data-id="${itemId}"]`;
          const card = document.querySelector(cardSelector);
          
          if (card) {
            // ✅ Tìm hoặc tạo audit badge
            let auditBadge = card.querySelector('.inv-audit-badge-inline');
            
            if (!auditBadge) {
              // Tạo mới badge nếu chưa có
              const line2 = card.querySelector('.card-line-2');
              if (line2) {
                auditBadge = document.createElement('span');
                auditBadge.className = 'inv-audit-badge-inline';
                line2.appendChild(auditBadge);
              }
            }
            
            if (auditBadge) {
              auditBadge.textContent = '確認済';
              auditBadge.style.display = 'inline-block';
              console.log('[UIRenderer] ✅ Badge updated for card:', itemId);
            }
            
            // ✅ Cập nhật ngày kiểm kê
            const dateSpan = card.querySelector('.card-date');
            if (dateSpan && date) {
              // Parse date YYYY-MM-DD → YYYY/MM/DD
              const formatted = date.replace(/-/g, '/');
              dateSpan.textContent = formatted;
              console.log('[UIRenderer] ✅ Date updated:', formatted);
            }
            
            // ✅ Thêm animation highlight
            card.style.transition = 'all 0.3s ease';
            card.style.background = 'linear-gradient(135deg, #C8E6C9 0%, #A5D6A7 20%, #FFFFFF 100%)';
            setTimeout(() => {
              card.style.background = '';
            }, 1000);
            
          } else {
            console.warn('[UIRenderer] ⚠ Card not found for update:', cardSelector);
            // Fallback: Re-render toàn bộ
            this.renderResults(this.state.allResults);
          }
        });


        // ✅ R6.9.7 - Lắng nghe 'inventory:auditRecorded' để refresh badges
        document.addEventListener('inventory:auditRecorded', (e) => {
          const { itemId, itemType, date } = e.detail;
          console.log('[UIRenderer] Audit recorded, refreshing badges...', itemId);
          
          // Re-render toàn bộ cards để cập nhật badges
          this.renderResults(this.state.allResults);
        });


        console.log('[UIRenderer] v7.7.7-r6.9.5 loaded (with Inventory support)');
    },

    renderResults(items) {
        console.log('[UIRenderer] 📊 renderResults called with', items.length, 'items');
        
        // ✅ R6.9.5: Lưu vào state để inventory:sort có thể truy cập
        this.state.allResults = items || [];
        
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

                // ✅ Thêm data-mold-code để mobile controller đọc được
        if (isMold && item.MoldCode) {
          el.setAttribute('data-mold-code', String(item.MoldCode));
        }


        // ✅ R6.9.5: Check if audited today
        const isAuditedToday = window.InventoryManager?.isAuditedToday(itemId, item.itemType) || false;
        const lastAuditDate = window.InventoryManager?.getLastAuditDate(itemId, item.itemType);
        const auditBadgeClass = isAuditedToday ? 'inv-audit-badge inv-audit-badge-today' : 'inv-audit-badge';
        
        // ✅ R6.9.5: Add class if audited today
        if (isAuditedToday) {
            el.classList.add('audited-today');
        }
        
        // ✅ R6.9.5: Check bulk mode
        const isBulkMode = !!window.InventoryState?.bulkMode;
        const isSelected = window.InventoryState?.selectedItems?.some(
            sel => sel.id === itemId && sel.type === item.itemType
        ) || false;

        // ✅ FIX: Lấy RackID từ rackInfo, LayerNumber từ rackLayerInfo
        const rackId = item.rackInfo?.RackID || item.rackLayerInfo?.RackID || '-';
        const layerNum = item.rackLayerInfo?.RackLayerNumber || '-';  // ✅ ĐÚNG CỘT
        const rackDisplay = `${rackId}-${layerNum}`;

      
        // ✅ Render badges như cột 3
        const locationBadgesHTML = `
          <div class="card-location-badges">
            <div class="location-circle">${rackId}</div>
            <span class="badge-separator">-</span>
            <div class="location-rectangle">${layerNum}</div>
          </div>
        `;



        // ✅ Lấy ngày check-in hoặc audit gần nhất
        const checkInDate = item.CheckInDate || item.LastCheckin || '';
        const auditDate = lastAuditDate || '';
        const displayDate = auditDate || checkInDate;
        const formattedDate = displayDate ? formatDateShort(displayDate) : '-';

        // ✅ Badge "確認済み" (棚卸済み) nếu audit hôm nay
        const auditBadge = isAuditedToday ? '<span class="inv-audit-badge-inline">確認済</span>' : '';

        // ✅ Checkbox icon + visual state
        const checkboxIcon = isBulkMode
          ? `<span class="inv-checkbox-icon${isSelected ? ' checked' : ''}">✓</span>`
          : '';
        
        // ✅ Thêm class nếu đã được chọn
        if (isBulkMode && isSelected) {
          el.classList.add('inv-bulk-selected', 'inv-selected');
        }


        // ✅ Render 3 dòng theo format yêu cầu
        el.innerHTML = `
            <div class="card-line-1">
                <span class="card-id">${item.MoldID || item.CutterID || '-'}</span>
                <span class="card-code">${code}</span>
                ${checkboxIcon}
            </div>
            <div class="card-line-2">
                <span class="card-dim">${dim}</span>
                ${auditBadge}
            </div>
            <div class="card-line-3">
                <span class="card-location">📍位置: ${rackDisplay}</span>
                <span class="card-date">${formattedDate}</span>
            </div>
        `;
        

        // ✅ Click card → Toggle selection (bulk mode) hoặc hiển thị detail
          el.addEventListener('click', (e) => {
          // ✅ CHECK: Nếu đang ở bulk mode
          const isBulkMode = window.InventoryState?.bulkMode || false;
          
          if (isBulkMode) {
              // ✅ BULK MODE: Chặn mở detail popup, chỉ toggle selection
              e.stopPropagation();
              
              const itemId = item.MoldID || item.CutterID;
              const itemType = item.itemType;
              
              // Check if already selected
              const isSelected = window.InventoryState.selectedItems.some(
                  selected => selected.id === itemId && selected.type === itemType
              );
              
              // ✅ Cập nhật visual
              if (isSelected) {
                  // ❌ BỎ CHỌN
                  el.classList.remove('inv-bulk-selected', 'inv-selected');
                  const checkbox = el.querySelector('.inv-checkbox-icon');
                  if (checkbox) checkbox.classList.remove('checked');
              } else {
                  // ✅ CHỌN
                  el.classList.add('inv-bulk-selected', 'inv-selected');
                  const checkbox = el.querySelector('.inv-checkbox-icon');
                  if (checkbox) checkbox.classList.add('checked');
              }

              
              // ✅ Toggle selection trong state
              if (window.InventoryManager) {
                  window.InventoryManager.toggleItemSelection(itemId, itemType, item);
              }
              
              console.log('[UIRenderer] Bulk select:', item.MoldCode || item.CutterNo, isSelected ? 'REMOVED' : 'ADDED');
              
          } else {
              // ✅ NORMAL MODE: Mở detail popup
              document.dispatchEvent(new CustomEvent('quick:select', { 
                  detail: { index: idx, item: item }  // ✅ SỬA: i → idx
              }));
          }
        });

        fragment.appendChild(el);
      });


      wrap.appendChild(fragment);
      console.log('[UIRenderer] ✅ Rendered', items.length, 'cards');

      const badge = document.querySelector('#quick-count');
      if (badge) badge.textContent = String(items.length);
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
          <td><button class="btn-view">View</button></td>
        `;

        tbody.appendChild(tr);
      });
    },

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

    // ✅ GIỐNG R6.3 - KHÔNG THAY ĐỔI
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

      // ✅ FIX: Hiển thị đúng RackID và RackLayerNumber
      const rackLayerInfo = item.rackLayerInfo;
      const rackInfo = item.rackInfo;

      // Badge Giá - Lấy từ rackInfo trước, fallback rackLayerInfo
      const rackId = rackInfo?.RackID || rackLayerInfo?.RackID || '-';
      const rackEl = document.getElementById('detail-rack-id');
      if (rackEl) {
        rackEl.textContent = rackId;
      }

      // Badge Tầng - Lấy từ rackLayerInfo
      const layerNum = rackLayerInfo?.RackLayerNumber || '-';
      const layerEl = document.getElementById('detail-layer-num');
      if (layerEl) {
        layerEl.textContent = layerNum;
      }

      // Rack Location
      setText(SELECTORS.detailRackLocation, item.displayRackLocation || rackInfo?.RackLocation || '-');

      console.log('[UIRenderer] Rack-Layer display:', rackInfo?.RackID || '-', '-', rackLayerInfo?.RackLayerNumber || '-', 'RackLayerID:', rackLayerInfo?.RackLayerID);



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

    // ✅ GIỐNG R6.3 - KHÔNG THAY ĐỔI
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

    // =========================================
    // ✅ HÀM MỚI 1: UPDATE LOCATION BADGE
    // =========================================
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

    // =========================================
    // ✅ HÀM MỚI 2: UPDATE CHECKIN BADGE
    // =========================================
    updateCheckInBadge(item) {
      console.log('[UIRenderer] 🎯 updateCheckInBadge called');

      // Gọi lại hàm updateCheckInOutStatus() đã có sẵn
      // (vì logic đã có sẵn và hoạt động tốt)
      this.updateCheckInOutStatus(item);
    },

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

  // Helper functions
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

  // Hàm cập nhật Header Detail Panel
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

  // Gọi khi load detail:
  // updateDetailPanelHeader({ 
  //   id: 'TIH-014',
  //   code: 'TOK-004',
  //   title: 'Mold Title'
  // });


  // Export to global
  window.UIRenderer = UIRenderer;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UIRenderer.init(), { once: true });
  } else {
    UIRenderer.init();
  }

  // ✅ GIỐNG R6.3 - Tự cập nhật lại badge khi có sự kiện 'status:updated'
  document.addEventListener('status:updated', (e) => {
    const { id, status } = e.detail || {};
    const el = document.querySelector('#detail-status-badge');
    if (el) {
      el.textContent = status?.toUpperCase?.() || '-';
      el.className = 'status-badge ' + (status === 'in' ? 'status-in' : 'status-out');
      console.log('[UIRenderer] Status badge updated:', id, status);
    }
  });

  /**
   * Format date to YYYY/MM/DD (short)
   */
  function formatDateShort(isoDate) {
      if (!isoDate) return '-';
      const d = new Date(isoDate);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
  }


})();

/**
 * R6.8 - Update detail panel header (MoldID + MoldCode)
 * @param {Object} item
 * @param {string} itemType  'mold' | 'cutter'
 */
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



const itemType = isMold ? 'mold' : 'cutter'; // đặt sau khi đã có biến isMold
updateHeaderFromItem(item, itemType); // truyền đủ 2 tham số

