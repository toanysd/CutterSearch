/**
 * ui-renderer-r7.0.2.js
 * 
 * ✅ KẾ THỪA TOÀN BỘ ui-renderer-r6.9.9.js
 * ✅ CẬP NHẬT MỚI TRONG R7.0.2:
 * - Click event cho MobileDetailModal (iPhone & iPad)
 * - Sync với inventory mode toggle
 * - Hỗ trợ popup detail full-screen
 * 
 * Version: r7.0.2 (Mobile Detail Modal Integration)
 * Date: 2025.11.17
 * Base: ui-renderer-r6.9.9.js (WORKING VERSION)
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

  // ======================================================================
  // PERFORMANCE MONITORING
  // ======================================================================
  const PERF_CONFIG = {
      enabled: true, // Đặt false khi production
      logThreshold: 50 // Log nếu operation > 50ms
  };

  function measurePerf(label, fn) {
      if (!PERF_CONFIG.enabled) return fn();
      const start = performance.now();
      const result = fn();
      const duration = performance.now() - start;
      if (duration > PERF_CONFIG.logThreshold) {
          console.warn(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
      }
      return result;
  }

  // ======================================================================
  // UTILITY: DEBOUNCE & THROTTLE
  // ======================================================================
  function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
          const later = () => {
              clearTimeout(timeout);
              func(...args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
      };
  }

  function throttle(func, limit) {
      let inThrottle;
      return function(...args) {
          if (!inThrottle) {
              func.apply(this, args);
              inThrottle = true;
              setTimeout(() => inThrottle = false, limit);
          }
      };
  }

  // ====================================================================== 
  // R7.0.2: DEVICE DETECTION HELPERS
  // ====================================================================== 

  function isMobileDevice() {
    return window.innerWidth < 768;
  }

  function isIPadDevice() {
    return window.innerWidth >= 768 && window.innerWidth <= 1024;
  }

  function shouldUseMobileDetail() {
    return isMobileDevice() || isIPadDevice();
  }

  // Helper: kích thước hiển thị cho DAO CẮT trên card
  // Ưu tiên: CutlineLength/CutlineWidth từ cutters → CutlineX/CutlineY từ molddesign
  function getCutterCardSize(item) {
      if (!item) return '';

      const cutLen = item.CutlineLength || item.CutlineX;
      const cutWid = item.CutlineWidth  || item.CutlineY;
      const corner = item.CutterCorner  || item.CornerR;
      const chamfer = item.CutterChamfer || item.ChamferC;

      if (!cutLen || !cutWid) return '';

      let text = `${cutLen}×${cutWid}`;
      if (corner) {
          text += ` R${corner}`;
      }
      if (chamfer) {
          text += ` C${chamfer}`;
      }
      return text;
  }



  const UIRenderer = {

    state: {
      currentDetailItem: null,
      selectedItemId: null,
      isDetailPanelOpen: false,
      allResults: [], // ✅ R6.9.5: Lưu kết quả để sắp xếp
      // ✅ R7.1.0: Cấu hình sắp xếp dùng chung (mặc định: ngày sản xuất mới nhất trước)
      sortConfig: {
          field: 'productionDate',   // DeliveryDeadline / ProductionDate
          direction: 'desc'          // 'asc' | 'desc'
      }
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
            //console.log('[UIRenderer] ✅ Loaded statuslogs.csv — total:', Object.keys(window.statusLogs).length, 'records');
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
        
        const rawItems = Array.isArray(results) ? results : [];
        // ✅ R7.1.0: Áp dụng sort mặc định (ngày sản xuất mới nhất lên đầu)
        this.state.allResults = this.applySortConfig(rawItems, this.state.sortConfig);
        this.renderResults(this.state.allResults);
        if (this.state.allResults.length) {
            this.renderDetailInfo(this.state.allResults[0]);
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
            //console.log('[UIRenderer] 🎯 updateLocationBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
          }
          
          // ✅ SỬA: LUÔN gọi updateCheckInBadge cho mọi item
          if (item.MoldID || item.CutterID) {
            this.updateCheckInBadge(item);
            //console.log('[UIRenderer] 🎯 updateCheckInBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
          }
        }
      });

      // ✅ R6.9.5: Lắng nghe inventory:sort
      document.addEventListener('inventory:sort', (e) => {
        const by = e.detail?.by || 'code';
        
        //console.log(`[UIRenderer] 🔄 Sorting results by: ${by}`);
        
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
            //console.log('[UIRenderer] ✅ Sorted by RackLayerID');
        } else {
            // Sắp xếp theo code (MoldCode / CutterNo)
            sortedResults.sort((a, b) => {
                const aCode = String(a.displayCode || a.MoldCode || a.CutterNo || '').trim();
                const bCode = String(b.displayCode || b.MoldCode || b.CutterNo || '').trim();
                return aCode.localeCompare(bCode);
            });
            //console.log('[UIRenderer] ✅ Sorted by Code');
        }
        
        // Cập nhật state và re-render
        this.state.allResults = sortedResults;
        this.renderResults(sortedResults);
          
          //console.log(`[UIRenderer] ✅ Re-rendered ${sortedResults.length} items after sort`);
      });

      // ✅ R7.1.0: Lắng nghe sort nâng cao từ Filter modal
      // detail: { field: 'productionDate' | 'code' | 'name' | 'size' | 'location' | 'company', direction: 'asc' | 'desc' }
      document.addEventListener('results:sortChanged', (e) => {
        const cfg = e.detail || {};
        const field = cfg.field || 'productionDate';
        const direction = cfg.direction === 'asc' ? 'asc' : 'desc';

        console.log('[UIRenderer] 🔄 results:sortChanged:', { field, direction });

        if (!Array.isArray(this.state.allResults) || this.state.allResults.length === 0) {
            console.warn('[UIRenderer] ⚠️ No results to sort for results:sortChanged');
            return;
        }

        this.state.sortConfig = { field, direction };
        this.state.allResults = this.applySortConfig(this.state.allResults, this.state.sortConfig);
        this.renderResults(this.state.allResults);
        
        // Giữ chi tiết đang mở: nếu có item đang chọn, cố gắng hiển thị lại
        if (this.state.selectedItemId) {
            const current = this.state.allResults.find(it => {
                const id = it.MoldID || it.CutterID || it.MoldCode || it.CutterNo;
                return String(id) === String(this.state.selectedItemId);
            });
            if (current) {
                this.renderDetailInfo(current);
            }
        }
      });


      // ✅ R6.9.5: Lắng nghe inventory:filter
        document.addEventListener('inventory:filter', (e) => {
            const { filterRack, filterLayer, filterType } = e.detail || {};
            
            //console.log('[UIRenderer] 🔍 Applying inventory filters:', { filterRack, filterLayer, filterType });
            
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
            
            //console.log(`[UIRenderer] ✅ Filtered: ${this.state.allResults.length} → ${filtered.length} items`);
        });
        
        // ✅ R6.9.7: Lắng nghe inventory:bulkMode + toggle class container
        document.addEventListener('inventory:bulkMode', (e) => {
          const enabled = e.detail?.enabled || false;
          //console.log('[UIRenderer] 📦 Bulk mode:', enabled ? 'ON' : 'OFF');
          
          // ✅ Toggle class trên container để kích hoạt CSS
          const quickList = document.querySelector('#quick-results-list');
          if (quickList) {
            if (enabled) {
              quickList.classList.add('inv-bulk-active');
              //console.log('[UIRenderer] ✅ Container class added: inv-bulk-active');
            } else {
              quickList.classList.remove('inv-bulk-active');
              //console.log('[UIRenderer] ✅ Container class removed: inv-bulk-active');
            }
          }
          
          // Re-render để hiển thị/ẩn checkboxes
          this.renderResults(this.state.allResults);
        });

        
        // ✅ R6.9.5: Lắng nghe inventory:refreshBadges
        document.addEventListener('inventory:refreshBadges', () => {
            //console.log('[UIRenderer] 🔄 Refreshing audit badges...');
            this.renderResults(this.state.allResults);
        });
        
        // ✅ R6.9.7 - Lắng nghe 'inventory:auditRecorded' để refresh badge ngay
        document.addEventListener('inventory:auditRecorded', (e) => {
          const { itemId, itemType, date } = e.detail;
          //console.log('[UIRenderer] 📡 Audit recorded event received:', { itemId, itemType, date });
          
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
              //console.log('[UIRenderer] ✅ Badge updated for card:', itemId);
            }
            
            // ✅ Cập nhật ngày kiểm kê
            const dateSpan = card.querySelector('.card-date');
            if (dateSpan && date) {
              // Parse date YYYY-MM-DD → YYYY/MM/DD
              const formatted = date.replace(/-/g, '/');
              dateSpan.textContent = formatted;
              //console.log('[UIRenderer] ✅ Date updated:', formatted);
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
          //console.log('[UIRenderer] Audit recorded, refreshing badges...', itemId);
          
          // Re-render toàn bộ cards để cập nhật badges
          this.renderResults(this.state.allResults);
        });

        // ============================================
        // R6.9.9 - Lắng nghe inventory:bulkAuditCompleted → batch update badges
        // ============================================
        document.addEventListener('inventory:bulkAuditCompleted', (e) => {
            const { items, date, count } = e.detail;
            
            //console.log(`[UIRenderer] 🔄 Bulk audit completed: ${count} items`);
            
            // ✅ Batch update badges cho tất cả items (không re-render từng item)
            items.forEach(({ itemId, itemType }) => {
                const cardSelector = `[data-type="${itemType}"][data-id="${itemId}"]`;
                const card = document.querySelector(cardSelector);
                
                if (card) {
                    // Tìm hoặc tạo audit badge
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
                        auditBadge.textContent = '●';
                        auditBadge.style.display = 'inline-block';
                    }
                    
                    // Cập nhật ngày kiểm kê
                    const dateSpan = card.querySelector('.card-date');
                    if (dateSpan && date) {
                        // Parse date: YYYY-MM-DD → YYYY/MM/DD
                        const formatted = date.replace(/-/g, '/');
                        dateSpan.textContent = formatted;
                    }
                    
                    // Thêm class "audited today"
                    card.classList.add('audited-today');
                }
            });
            
            // ✅ RE-RENDER MỘT LẦN DUY NHẤT (thay vì N lần)
            if (UIRenderer.state && UIRenderer.state.allResults) {
                UIRenderer.renderResults(UIRenderer.state.allResults);
            }
            
            //console.log(`[UIRenderer] ✅ Bulk badges updated: ${count} items`);
        });

        // =================================================================
        // R7.0.6 - CRITICAL FIX: Lắng nghe checkin-completed để refresh cards
        // =================================================================
        document.addEventListener('checkin-completed', (e) => {
            const { item, success, mode } = e.detail;
            if (!success || !item) return;
            
            //console.log(`[UIRenderer] Check-in completed (${mode}), refreshing badges for`, item.MoldID || item.CutterID);
            
            // Re-render toàn bộ cards để cập nhật status badge
            this.renderResults(this.state.allResults);
        });

        // =================================================================
        // R7.0.8 - Lắng nghe shipping-completed để refresh IN/OUT + nơi lưu
        // =================================================================
        document.addEventListener('shipping-completed', (e) => {
          const { item, success, toCompanyId } = e.detail || {};
          if (!success || !item) return;

          const id = item.MoldID || item.CutterID;
          console.log('[UIRenderer] 🚚 Shipping completed, refreshing cards for', id, '→', toCompanyId);

          // Cập nhật cache statusLogs đơn giản (in/out) nếu đang dùng
          if (window.statusLogs && id) {
            window.statusLogs[String(id)] = 'out'; // Vận chuyển ra ngoài coi như OUT
          }

          // Re-render toàn bộ cards để:
          // - badge IN/OUT lấy trạng thái mới nhất từ DataManager.data.statuslogs
          // - text "Công ty lưu trữ" & badge ngoại bộ/ nội bộ dùng storage_company mới
          this.renderResults(this.state.allResults);
        });


        // =================================================================
        // R7.0.6 - CRITICAL FIX: Lắng nghe location-completed để refresh cards
        // =================================================================
        document.addEventListener('location-completed', (e) => {
            const { item, success } = e.detail;
            if (!success || !item) return;
            
            //console.log(`[UIRenderer] Location changed, refreshing badges for`, item.MoldID || item.CutterID);
            
            // Re-render toàn bộ cards để cập nhật location badge
            this.renderResults(this.state.allResults);
        });


        // ✅ R7.0.2: Lắng nghe inventory mode changes để sync với MobileDetailModal
        document.addEventListener('inventoryModeChanged', (e) => {
          const { enabled } = e.detail;
          //console.log('[UIRenderer] 🔄 Inventory mode changed:', enabled ? 'ON' : 'OFF');
          
          // Nếu MobileDetailModal đang mở, cập nhật toggle
          if (window.MobileDetailModal && window.MobileDetailModal.modal) {
            const isModalOpen = window.MobileDetailModal.modal.classList.contains('show');
            if (isModalOpen) {
              window.MobileDetailModal.updateModeToggle(enabled);
              //console.log('[UIRenderer] ✅ Mobile modal toggle synced');
            }
          }
        });

        // ==================================================================
        // R7.0.7: Mobile selection mode toggle (header checkbox)
        // - HTML: <input type="checkbox" id="selection-mode-toggle">
        // - Dùng làm công tắc chính cho chế độ chọn/in trên cả Card & Table
        // ==================================================================
        const selectionModeToggle = document.getElementById('selection-mode-toggle');
        if (selectionModeToggle) {
          // Đảm bảo SelectionState tồn tại nhưng không ghi đè trạng thái cũ
          if (!window.SelectionState) {
            window.SelectionState = {
              active: false,
              items: []   // SelectionManager sẽ quản lý thực tế
            };
          }

          // Đồng bộ UI ban đầu từ state (nếu module khác đã set active)
          selectionModeToggle.checked = !!window.SelectionState.active;

          // Khi user bật/tắt checkbox "選択 / Chọn"
          selectionModeToggle.addEventListener('change', function () {
            const enabled = !!selectionModeToggle.checked;

            if (!window.SelectionState) {
              window.SelectionState = { active: false, items: [] };
            }
            window.SelectionState.active = enabled;

            // Khi tắt chế độ chọn → xóa toàn bộ lựa chọn để tránh nhầm lẫn
            if (!enabled && window.SelectionManager && typeof window.SelectionManager.clear === 'function') {
              window.SelectionManager.clear();
            }

            // Thông báo cho MobileTableView, card view, v.v.
            document.dispatchEvent(new CustomEvent('selection:modeChanged', {
              detail: { enabled }
            }));

            //console.log('[UIRenderer] 📦 Selection mode toggled:', enabled ? 'ON' : 'OFF');
          });

          // Nếu có module khác thay đổi mode, đồng bộ lại trạng thái checkbox
          // + bật/tắt class cho container card + re-render thẻ để hiện icon
          document.addEventListener('selection:modeChanged', function (e) {
            const enabled = !!(e.detail && e.detail.enabled);

            // Đồng bộ trạng thái toggle
            if (selectionModeToggle.checked !== enabled) {
              selectionModeToggle.checked = enabled;
            }

            // Bật/tắt class inv-bulk-active để CSS cho phép hiển thị checkbox
            const quickList = document.querySelector('#quick-results-list');
            if (quickList) {
              quickList.classList.toggle('inv-bulk-active', enabled);
            }

            // Re-render card để checkboxIcon (inv-bulk-checkbox) xuất hiện/ẩn đúng
            if (window.UIRenderer && Array.isArray(UIRenderer.state?.allResults)) {
              UIRenderer.renderQuickCards(UIRenderer.state.allResults);
            }
          });

        }

        //console.log('[UIRenderer] v7.7.7-r7.0.2 loaded (with Mobile Detail Modal support)');

    },

    renderResults(items) {
        //console.log('[UIRenderer] 📊 renderResults called with', items.length, 'items');
        
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

      //console.log('[UIRenderer] ✅ Rendering', items.length, 'quick cards...');
      //wrap.innerHTML = '';
      // ✅ Cleanup existing listeners trước khi clear
      // ✅ Cleanup: Remove delegation flag trước khi clear
      if (wrap.dataset.delegationSetup === 'true') {
        delete wrap.dataset.delegationSetup;
      }

      // ✅ Clear container
      wrap.textContent = ''; // Faster than innerHTML for simple clear

      const fragment = document.createDocumentFragment();
      const RENDER_LIMIT = 100; // Tăng từ 100 lên khi cần
      
      items.slice(0, 100).forEach((item, idx) => {
        const isMold = item.itemType === 'mold';
        const typeLabel = isMold ? '金型' : '抜型';

        let code;
        let name;
        let dim;

        // Khuôn: giữ nguyên logic cũ
        if (isMold) {
            code = esc(item.displayCode || item.MoldCode || '-');
            name = esc(item.displayName || item.MoldName || '-');
            dim  = esc(item.displayDimensions || item.cutlineSize || 'N/A');
        } else {
            // Dao cắt: ưu tiên CutterNo + CutterName + kích thước cắt
            code = esc(item.displayCode || item.CutterNo || item.CutterDesignCode || '-');
            name = esc(item.displayName || item.CutterName || '-');
            dim  = esc(
                item.displayDimensions ||
                item.cutlineSize ||
                getCutterCardSize(item) ||
                'N/A'
            );
        }

        // Vị trí: rackInfo → displayRackLocation
        const loc = esc(
            item.rackInfo?.RackLocation ||
            item.displayRackLocation ||
            '-'
        );


        const itemId = isMold
          ? String(item.MoldID || item.MoldCode || '')
          : String(item.CutterID || item.CutterNo || '');

        const el = document.createElement('div');
        el.className = 'result-card';
        el.classList.add(isMold ? 'card-mold' : 'card-cutter'); // NEW
        el.setAttribute('data-index', String(idx));
        el.setAttribute('data-type', isMold ? 'mold' : 'cutter');
        el.setAttribute('data-id', itemId);

                // ✅ Thêm data-mold-code để mobile controller đọc được
        if (isMold && item.MoldCode) {
          el.setAttribute('data-mold-code', String(item.MoldCode));
        }


        // R7.0.5: CRITICAL FIX - Use iPad-style badge logic (checkin-status-badge)
        const lastAuditDate = window.InventoryManager?.getLastAuditDate(itemId, item.itemType);
        const isAuditedToday = window.InventoryManager?.isAuditedToday(itemId, item.itemType) || false;

        // Get latest status from statuslogs (IN/OUT/AUDIT)
        const statusLogs = window.DataManager?.data?.statuslogs || [];
        const itemLogs = statusLogs.filter(log => String(log.MoldID).trim() === String(itemId).trim());

        let statusBadgeClass = 'no-history';
        let statusBadgeText = '-';

        if (itemLogs.length > 0) {
            // Sort by latest
            itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
            const latestLog = itemLogs[0];
            const status = (latestLog.Status || '').toUpperCase();
            
            if (status === 'IN' || status === 'CHECKIN' || status.includes('IN')) {
                statusBadgeClass = 'checkin-in';
                statusBadgeText = 'IN';
            } else if (status === 'OUT' || status === 'CHECKOUT' || status.includes('OUT')) {
                statusBadgeClass = 'checkin-out';
                statusBadgeText = 'OUT';
            } else if (status === 'AUDIT' || status.includes('AUDIT')) {
                statusBadgeClass = 'checkin-audit';
                statusBadgeText = '確認済';
            }
        }

        // Add class for today's audit (green highlight)
        if (isAuditedToday) {
            el.classList.add('audited-today');
        }

        
        // ✅ R7.0.7: Check bulk mode
        const isBulkMode = !!window.InventoryState?.bulkMode;
        // 選択モード (印刷・一括操作用)
        const isSelectionMode = !!window.SelectionState?.active;

        const isSelected = (
          window.SelectionManager?.isSelected
            ? SelectionManager.isSelected(itemId, item.itemType)
            : (window.InventoryState?.selectedItems?.some(
                sel => sel.id === itemId && sel.type === item.itemType
              ) || false)
        );

        // HIỂN THỊ ICON KHI bulkMode HOẶC SelectionMode
        const showCheckbox = isBulkMode || isSelectionMode;

        // NEW: render span icon với class .inv-bulk-checkbox để QuickResultsSync & SelectionManager bắt được
        let checkboxIcon = '';
        if (showCheckbox) {
            const checkedClass = isSelected ? ' checked' : '';
            checkboxIcon = `<span class="inv-bulk-checkbox${checkedClass}">✓</span>`;
        }

        // ✅ Thêm class nếu đã được chọn
        if (showCheckbox && isSelected) {
            el.classList.add('inv-bulk-selected', 'inv-selected');
        }



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



        // =================================================================
        // R7.0.6 - CRITICAL FIX: Lấy ngày từ statusLogs mới nhất
        // =================================================================
        let displayDate = null;

        // Ưu tiên 1: Lấy từ latestLog trong statuslogs (MỚI NHẤT)
        if (itemLogs.length > 0) {
            const latestLog = itemLogs[0]; // Đã sort theo timestamp giảm dần ở trên
            displayDate = latestLog.Timestamp; // Format: "2025-12-02T02:14:22.693Z"
        }

        // Ưu tiên 2: Fallback sang audit date
        if (!displayDate) {
            displayDate = lastAuditDate;
        }

        // Ưu tiên 3: Fallback sang check-in date từ item
        if (!displayDate) {
            displayDate = item.CheckInDate || item.LastCheckin;
        }

        const formattedDate = displayDate ? formatDateShort(displayDate) : '-';

        // Badge nếu audit hôm nay (R7.0.5 iPad-style status badge with sync icon)
        const auditBadge = `<span class="checkin-status-badge ${statusBadgeClass}"><span class="badge-text">${statusBadgeText}</span> <span class="sync-icon synced" title="Đã đồng bộ">✓</span></span>`;



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
        

        
        fragment.appendChild(el);
      });

      wrap.appendChild(fragment);

      // ✅ Sau khi render xong, sync highlight với SelectionManager
      if (window.SelectionManager && typeof window.SelectionManager.updateDomHighlights === 'function') {
          window.SelectionManager.updateDomHighlights();
      }


      // ✅ Delegation: click vào checkbox icon trên card → dùng SelectionManager
      if (!wrap.dataset.selectionDelegationSetup) {
        wrap.addEventListener('click', (e) => {
          // Tìm checkbox icon
          const checkboxIcon = e.target.closest('.inv-bulk-checkbox, .selection-checkbox-icon');
          if (!checkboxIcon) return;

          e.stopPropagation();

          const card = checkboxIcon.closest('.result-card');
          if (!card) return;

          const id = card.getAttribute('data-id');
          const type = (card.getAttribute('data-type') || 'mold').toLowerCase();

          if (!id || !window.SelectionManager) return;

          // Lấy itemData từ UIRenderer.state.allResults
          const index = parseInt(card.getAttribute('data-index'), 10);
          const itemData = (!isNaN(index) && UIRenderer.state.allResults[index])
            ? UIRenderer.state.allResults[index]
            : null;

          // Toggle qua SelectionManager (truyền itemData để lưu vào state)
          SelectionManager.toggleItem(id, type, itemData);

          // SelectionManager tự cập nhật DOM highlight + phát event 'selection:changed'
          //console.log('[UIRenderer] Card checkbox clicked:', { id, type, selected: SelectionManager.isSelected(id, type) });
        });

        wrap.dataset.selectionDelegationSetup = 'true';
        //console.log('[UIRenderer] ✅ Selection delegation setup');
      }



      // Sau khi render xong → đồng bộ lại highlight từ SelectionManager
      if (window.SelectionManager && SelectionManager.updateDomHighlights) {
        SelectionManager.updateDomHighlights();
      }

      // ================================================
      // 🔹 R7.0.7: EVENT DELEGATION - Card click handling
      // ================================================
      if (wrap.dataset.delegationSetup !== 'true') {
          wrap.addEventListener('click', function (e) {
            const card = e.target.closest('.result-card[data-id][data-type]');
            if (!card) return;

            const itemId = card.getAttribute('data-id');
            const itemType = (card.getAttribute('data-type') || 'mold').toLowerCase();
            const isSelectionMode = !!window.SelectionState?.active;

            // ========================================
            // MODE 1: CHẾ ĐỘ CHỌN ĐỂ IN (Selection Mode ON)
            // → Bấm bất kỳ đâu trên thẻ = toggle chọn
            // ========================================
            if (isSelectionMode) {
                e.preventDefault();
                e.stopPropagation();

                if (!window.SelectionManager || typeof window.SelectionManager.toggleItem !== 'function') {
                    console.warn('[UIRenderer] ❌ SelectionManager.toggleItem not available');
                    return;
                }

                // Toggle trong SelectionManager
                window.SelectionManager.toggleItem(itemId, itemType, null);

                // (SelectionManager.toggleItem sẽ tự:
                //  - Cập nhật SelectionState.items
                //  - Gọi updateDomHighlights() để thêm/bớt class trên card
                //  - Phát event selection:changed để toolbar cập nhật số lượng)
                return;
            }

            // ========================================
            // MODE 2: XEM CHI TIẾT (Selection Mode OFF)
            // → Bấm thẻ sẽ mở modal như logic cũ
            // ========================================
            // MOBILE (iPhone/iPad): dùng MobileDetailModal nếu có
            if (window.innerWidth <= 1024 && window.MobileDetailModal) {
                e.preventDefault();
                e.stopPropagation();

                // Lấy data item từ attribute nếu có
                let itemData = {};
                try {
                    const raw = card.getAttribute('data-item');
                    if (raw) {
                        itemData = JSON.parse(raw);
                    }
                } catch (err) {
                    console.warn('[UIRenderer] Cannot parse data-item from card:', err);
                }

                const item = Object.assign({}, itemData, {
                    itemType: itemType,
                    MoldID: itemId,
                    MoldCode: card.getAttribute('data-mold-code') || itemData.MoldCode || ''
                });

                if (typeof window.MobileDetailModal.open === 'function') {
                    window.MobileDetailModal.open(item);
                }
                return;
            }

            // DESKTOP: phát event detail:changed như trước
            if (window.UIRenderer && Array.isArray(UIRenderer.state?.allResults)) {
                const allItems = UIRenderer.state.allResults;
                const item = allItems.find(it => {
                    const id = itemType === 'mold' ? it.MoldID : it.CutterID;
                    return String(id) === String(itemId);
                });

                if (item) {
                    document.dispatchEvent(new CustomEvent('detail:changed', {
                        detail: {
                            item,
                            itemType,
                            itemId,
                            source: 'card-click'
                        }
                    }));
                }
            }
          });
          wrap.dataset.delegationSetup = 'true';
          //console.log('[UIRenderer] ✅ Event delegation set up for card container');
      }

      // ✅ R7.0.3: Bind click events for mobile detail modal (FIX: Support both mold & cutter)
      if (shouldUseMobileDetail()) {
          // ✅ Remove old delegation flag
          if (wrap.dataset.clickBound === 'true') {
              return; // Already bound
          }

          wrap.addEventListener('click', (e) => {
              // Find clicked card
              const card = e.target.closest('.result-card');
              if (!card) return;

              // 🚫 Nếu đang Selection Mode thì KHÔNG mở MobileDetailModal
              if (window.SelectionState && window.SelectionState.active) {
                  //console.log('[UIRenderer] Selection mode ON – skip MobileDetailModal click handler');
                  return;
              }

              // Ignore checkbox clicks
              if (e.target.type === 'checkbox' || e.target.closest('.inv-bulk-checkbox')) {
                  return;
              }

              const itemId = card.dataset.id;
              const itemType = (card.dataset.type || '').toLowerCase();
              const index = Number(card.dataset.index);

              //console.log('[UIRenderer] Card clicked:', { itemId, itemType, index });

              if (!window.MobileDetailModal) {
                  console.warn('[UIRenderer] MobileDetailModal not initialized');
                  return;
              }

              // ✅ FIX: Get item from UIRenderer.state.allResults
              const list = UIRenderer.state.allResults || [];
              let item = null;

              // Priority 1: Find by index
              if (!isNaN(index) && list[index]) {
                  item = list[index];
              }

              // Priority 2: Find by ID
              if (!item && itemId) {
                  item = list.find(r => {
                      const rId = String(r.MoldID || r.CutterID || '');
                      return rId === String(itemId);
                  });
              }

              if (!item) {
                  console.warn('[UIRenderer] ⚠️ Item not found:', { itemId, itemType, index });
                  return;
              }

              // ✅ FIX: Determine itemType correctly
              const finalType = itemType || (item.MoldID ? 'mold' : 'cutter');

              console.log('[UIRenderer] ✅ Opening MobileDetailModal:', {
                  itemId: item.MoldID || item.CutterID,
                  type: finalType
              });

              // Open mobile detail modal
              window.MobileDetailModal.show(item, finalType);
          });

          wrap.dataset.clickBound = 'true';
          //console.log('[UIRenderer] ✅ Mobile detail modal click event bound (EVENT DELEGATION)');
      }


      // ✅ EVENT DELEGATION - Chỉ setup 1 lần duy nhất
      //this.setupCardEventDelegation(wrap);
      //console.log('[UIRenderer] ✅ Rendered', items.length, 'cards');

      const badge = document.querySelector('#quick-count');
      if (badge) badge.textContent = String(items.length);
    },

    // =========================================
    // ✅ EVENT DELEGATION - PERFORMANCE BOOST
    // =========================================
    setupCardEventDelegation(container) {
      // ✅ Check nếu đã setup rồi thì skip
      if (container.dataset.delegationSetup === 'true') {
        return;
      }

      // ✅ Single click handler cho toàn bộ container
      container.addEventListener('click', (e) => {
        const card = e.target.closest('.result-card');
        if (!card) return;

        const idx = parseInt(card.dataset.index, 10);
        const itemId = card.dataset.id;
        const itemType = card.dataset.type;

        // ✅ Lấy item data từ state
        const item = this.state.allResults[idx];
        if (!item) {
          console.warn('[UIRenderer] Item not found at index:', idx);
          return;
        }

        // ✅ CHECK: Bulk mode hay normal mode?
        const isBulkMode = window.InventoryState?.bulkMode || false;

        if (isBulkMode) {
          // ===== BULK MODE: Toggle selection =====
          e.stopPropagation();

          const isSelected = window.InventoryState.selectedItems.some(
            selected => selected.id === itemId && selected.type === itemType
          );

          // Update visual state
          if (isSelected) {
            card.classList.remove('inv-bulk-selected', 'inv-selected');
            const checkbox = card.querySelector('.inv-checkbox-icon');
            if (checkbox) checkbox.classList.remove('checked');
          } else {
            card.classList.add('inv-bulk-selected', 'inv-selected');
            const checkbox = card.querySelector('.inv-checkbox-icon');
            if (checkbox) checkbox.classList.add('checked');
          }

          // Update state
          if (window.InventoryManager) {
            window.InventoryManager.toggleItemSelection(itemId, itemType, item);
          }

          //console.log('[UIRenderer] Bulk select:', itemId, isSelected ? 'REMOVED' : 'ADDED');

        } else {
          // ===== NORMAL MODE: Show detail =====
          
          // ✅ FIX: DISPATCH ĐÚNG EVENT mà các module khác đang lắng nghe
          document.dispatchEvent(new CustomEvent('quick:select', {
            detail: { index: idx, item: item }
          }));
          
          //console.log('[UIRenderer] Card clicked, dispatched quick:select for:', itemId);
        }
      });

      // ✅ Mark as setup
      container.dataset.delegationSetup = 'true';
      //console.log('[UIRenderer] ✅ Event delegation setup complete');
    },


    renderTable(items) {
      return measurePerf('renderTable', () => {
        const tbody = getFirst(SELECTORS.tableBodyCandidates);
        if (!tbody) {
          console.warn('[UIRenderer] ⚠ Table body not found');
          return;
        }

        tbody.innerHTML = '';

        // ✅ Giới hạn render 200 rows (đủ cho 1 màn hình + scroll)
        const RENDER_LIMIT = 200;
        const itemsToRender = items.slice(0, RENDER_LIMIT);

        // ✅ Batch render với DocumentFragment
        const fragment = document.createDocumentFragment();

        itemsToRender.forEach((item, idx) => {
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

          fragment.appendChild(tr);
        });

        tbody.appendChild(fragment);

        // ✅ Hiển thị thông báo nếu bị cắt
        if (items.length > RENDER_LIMIT) {
          console.warn(`[UIRenderer] Table limited to ${RENDER_LIMIT}/${items.length} items for performance`);
        }
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

      //console.log('[UIRenderer] 🎨 renderDetailInfo for:', item.displayCode || 'unknown');
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
          //console.log('[UIRenderer] Company badge:', comp, '-', isYSD ? 'YSD (blue)' : 'Other (orange)');
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

      //console.log('[UIRenderer] Rack-Layer display:', rackInfo?.RackID || '-', '-', rackLayerInfo?.RackLayerNumber || '-', 'RackLayerID:', rackLayerInfo?.RackLayerID);



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

      //console.log('[UIRenderer] 🎨 Updated detail panel for:', item.displayCode || item.MoldCode || item.CutterNo);
    },

    // ✅ 
    updateCheckInOutStatus(item) {
      if (!item) return;

      const statusLogs = window.DataManager?.data?.statuslogs;
        if (!statusLogs || statusLogs.length === 0) { // ✅ ĐÚNG: statusLogs

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
          //console.log('[UIRenderer] No status logs for', itemId);
          statusBadge.classList.remove('status-in', 'status-out', 'badge-pending');
          statusBadge.classList.add('no-history');
          statusBadge.innerHTML = '<div class="badge-text-main">未確認</div>';
          statusBadge.title = 'Chưa có lịch sử nhập xuất';
          //console.log('[UIRenderer] Badge set to no-history state with JP/VN text');
          return;
        }

        itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        const latestLog = itemLogs[0];
        const status = (latestLog.Status || '').toLowerCase();
        const isPending = latestLog.pending === true;

        //console.log('[UIRenderer] Latest log:', status, isPending, 'timestamp:', latestLog.Timestamp);

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

        //console.log('[UIRenderer] Badge updated:', status, isPending ? 'pending' : 'synced');
      } catch (err) {
        console.error('[UIRenderer] Error updating status:', err);
      }
    },

    // =========================================
    // ✅ HÀM MỚI 1: UPDATE LOCATION BADGE
    // =========================================
    updateLocationBadge(item) {
      //console.log('[UIRenderer] 🎯 updateLocationBadge called');

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

    /**
     * ✅ R6.9.10: UPDATE CHECK-IN/OUT/AUDIT STATUS BADGE
     * Xử lý 3 trạng thái: check-in (xanh), check-out (đỏ), AUDIT (xanh)
     * Fix: Dùng đúng class CSS (checkin-in / checkin-out / checkin-audit)
     */
    updateCheckInBadge(item) {
        if (!item) {
            console.warn('[UIRenderer] ⚠ updateCheckInBadge: item is null');
            return;
        }

        const statusLogs = window.DataManager?.data?.statuslogs;
        if (!statusLogs || statusLogs.length === 0) {
            console.warn('[UIRenderer] ⚠ statuslogs not loaded yet, retrying...');
            setTimeout(() => this.updateCheckInBadge(item), 200);
            return;
        }

        try {
            const itemId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || null;
            if (!itemId) {
                console.warn('[UIRenderer] ⚠ Item has no valid ID');
                return;
            }

            // ✅ Filter logs cho item này
            const itemLogs = statusLogs.filter((log) => {
                const logMoldId = String(log.MoldID || '').trim();
                const compareId = String(itemId).trim();
                return logMoldId === compareId;
            });

            const statusBadge = document.querySelector('#detail-checkin-status');
            if (!statusBadge) {
                console.warn('[UIRenderer] ⚠ #detail-checkin-status not found');
                return;
            }

            // ✅ CRITICAL: Remove ALL old classes first
            statusBadge.classList.remove(
                'checkin-in', 
                'checkin-out', 
                'checkin-audit', 
                'badge-pending', 
                'no-history'
            );

            // ✅ Trường hợp 1: Không có lịch sử
            if (itemLogs.length === 0) {
                //console.log('[UIRenderer] No status logs for', itemId);
                statusBadge.classList.add('no-history');
                statusBadge.textContent = '-';
                statusBadge.title = 'Chưa có lịch sử nhập xuất';
                return;
            }

            // ✅ Sắp xếp logs theo thời gian (mới nhất lên đầu)
            itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
            const latestLog = itemLogs[0];
            const status = (latestLog.Status || '').trim().toLowerCase();
            const isPending = latestLog.pending === true;

            //console.log('[UIRenderer] Latest log:', status, isPending, 'timestamp:', latestLog.Timestamp);

            let badgeHTML = '<span class="badge-text">';
            let syncIcon = '';

            // ✅ R6.9.10: Xử lý 3 trạng thái
            if (status === 'check-in' || status.includes('in')) {
                badgeHTML += 'IN';
                statusBadge.classList.add('checkin-in'); // ✅ XANH LÁ
            } else if (status === 'check-out' || status.includes('out')) {
                badgeHTML += 'OUT';
                statusBadge.classList.add('checkin-out'); // ✅ ĐỎ
            } else if (status === 'audit' || status.toUpperCase() === 'AUDIT') {
                badgeHTML += 'AUDIT';
                statusBadge.classList.add('checkin-audit'); // ✅ XANH LÁ (GIỐNG IN)
            } else {
                badgeHTML += '-';
                statusBadge.classList.add('no-history');
            }
            badgeHTML += '</span>';

            // ✅ Sync icon (pending / synced)
            if (isPending) {
                syncIcon = '<span class="sync-icon pending" title="Đang đồng bộ...">◉</span>';
                statusBadge.classList.add('badge-pending');
            } else {
                syncIcon = '<span class="sync-icon synced" title="Đã đồng bộ">✓</span>';
            }

            statusBadge.innerHTML = badgeHTML + syncIcon;

            //console.log('[UIRenderer] ✅ Badge updated:', status, isPending ? 'pending' : 'synced');
        } catch (err) {
            console.error('[UIRenderer] ❌ Error updating status:', err);
        }
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

      //console.log('[UIRenderer] 🧹 Cleared detail panel');
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

  // ======================================================================
  // R7.1.0: Sort helpers dùng chung cho card & table
  // ======================================================================

  /**
   * Áp dụng cấu hình sort cho danh sách kết quả.
   * @param {Array} items
   * @param {{field: string, direction: 'asc'|'desc'}} sortConfig
   */
  UIRenderer.applySortConfig = function (items, sortConfig) {
      const field = sortConfig?.field || 'productionDate';
      const direction = sortConfig?.direction === 'asc' ? 'asc' : 'desc';

      const list = Array.isArray(items) ? items.slice(0) : [];

      const compare = (a, b) => {
          switch (field) {
              case 'code': {
                  const aCode = String(a.displayCode || a.MoldCode || a.CutterNo || '').trim();
                  const bCode = String(b.displayCode || b.MoldCode || b.CutterNo || '').trim();
                  return aCode.localeCompare(bCode, 'ja');
              }
              case 'name': {
                  const aName = String(a.displayName || a.MoldName || a.CutterName || '').trim();
                  const bName = String(b.displayName || b.MoldName || b.CutterName || '').trim();
                  return aName.localeCompare(bName, 'ja');
              }
              case 'size': {
                  const aSize = String(a.displayDimensions || a.cutlineSize || '').trim();
                  const bSize = String(b.displayDimensions || b.cutlineSize || '').trim();
                  return aSize.localeCompare(bSize, 'ja');
              }
              case 'location': {
                  const rackA = parseInt(a.rackInfo?.RackID ?? a.rackLayerInfo?.RackID ?? 999, 10);
                  const rackB = parseInt(b.rackInfo?.RackID ?? b.rackLayerInfo?.RackID ?? 999, 10);
                  if (rackA !== rackB) return rackA - rackB;

                  const layerA = parseInt(a.rackLayerInfo?.RackLayerNumber ?? 999, 10);
                  const layerB = parseInt(b.rackLayerInfo?.RackLayerNumber ?? 999, 10);
                  return layerA - layerB;
              }
              case 'company': {
                  const aCompany = String(
                      a.storageCompanyInfo?.CompanyShortName ||
                      a.storageCompanyInfo?.CompanyName ||
                      'ZZZ'
                  );
                  const bCompany = String(
                      b.storageCompanyInfo?.CompanyShortName ||
                      b.storageCompanyInfo?.CompanyName ||
                      'ZZZ'
                  );
                  return aCompany.localeCompare(bCompany, 'ja');
              }
              case 'productionDate':
              case 'deliveryDate':
              default: {
                  // ✅ Ưu tiên DeliveryDeadline (jobs), sau đó ProductionDate, sau đó displayDate
                  const aDateRaw = a.jobInfo?.DeliveryDeadline || a.ProductionDate || a.displayDate || a.MoldDate || a.DateEntry;
                  const bDateRaw = b.jobInfo?.DeliveryDeadline || b.ProductionDate || b.displayDate || b.MoldDate || b.DateEntry;

                  const baseOld = new Date('1900-01-01').getTime();

                  const numA = aDateRaw ? new Date(aDateRaw).getTime() - baseOld : 0;
                  const numB = bDateRaw ? new Date(bDateRaw).getTime() - baseOld : 0;

                  return numA - numB;
              }
          }
      };

      list.sort(compare);

      if (direction === 'desc') {
          list.reverse();
      }

      return list;
  };


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
      //console.log('[UIRenderer] Status badge updated:', id, status);
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
    //console.log('[UIRenderer] ✅ Header updated');
  }
})();





