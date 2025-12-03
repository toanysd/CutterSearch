/* ========================================================================
   MOBILE DETAIL MODAL CONTROLLER R7.0.2
   ========================================================================
   Full-screen detail modal for iPhone/iPad with comprehensive information
   
   Features:
   - Full-screen popup with all mold/cutter details
   - Toggle mode: Check-in ↔ Kiểm kê (Inventory)
   - 8 action buttons (4x2 grid) in normal mode
   - 2 action buttons in inventory mode
   - Integrated with InventoryManager state
   - Reorganized content sections (Location, Basic, Technical, Status, Equipment)
   - Compatible with iPhone & iPad
   
   Created: 2025-11-10
   Last Updated: 2025-11-17
   ======================================================================== */


class MobileDetailModal {
    constructor() {
        this.modal = null;
        this.modalContent = null;
        this.modalBody = null;
        this.currentItem = null;
        this.currentItemType = null;
        
        // R7.0.2: Reference to enriched data from DataManager
        this.data = {
            molds: [],
            cutters: [],
            customers: [],
            molddesign: [],
            moldcutter: [],
            shiplog: [],
            locationlog: [],
            employees: [],
            racklayers: [],
            racks: [], // ✅ THÊM
            companies: [], // ✅ THÊM
            statuslogs: [], // ✅ THÊM
            usercomments: [],
            jobs: [],
            processingitems: []
        };
        
        this.shouldShowModal = window.innerWidth < 1025;
        this.isMobile = window.innerWidth < 768;
        this.isTablet = window.innerWidth >= 768 && window.innerWidth < 1025;
        // R7.0.5: Sync initial inventory mode from InventoryState
        this.inventoryMode = !!(window.InventoryState?.active);
        console.log('[MobileModal] Initial inventory mode:', this.inventoryMode);
    }

    // ==== External module adapters (reuse iPad modules) ====
    getExternalAPIs() {
    const checkinAPI =
        window.CheckInOut?.openCheckInModal
        ? window.CheckInOut
        : window.CheckInOutV6?.openCheckInModal
        ? window.CheckInOutV6
        : window.CheckInOutModule?.openCheckInModal
        ? window.CheckInOutModule
        : null;

    const locationAPI =
        window.LocationManager?.openLocationModal
        ? window.LocationManager
        : window.LocationUpdate?.openLocationModal
        ? window.LocationUpdate
        : null;

    return { checkinAPI, locationAPI };
    }




    /**
     * ========================================
     * INITIALIZATION
     * ========================================
     */
    init() {
        if (!this.shouldShowModal) {
            console.log('Desktop mode - MobileDetailModal disabled');
            return;
        }


        console.log('🚀 Initializing MobileDetailModal...');
        
        // Step 1: Create modal structure
        this.createModalStructure();
        
        // Step 2: Bind events
        this.bindEvents();
        
        // Step 3: Load data references
        this.loadDataReferences();
        
        console.log('✅ MobileDetailModal initialized successfully');
    }

    /**
     * Create HTML structure for modal
     */
    createModalStructure() {
        // Remove existing modal if any
        const existing = document.getElementById('mobile-detail-modal');
        if (existing) {
            existing.remove();
        }
        
        // ✅ FIX: Create modal HTML with CORRECT header structure
        const modalHTML = `
            <div id="mobile-detail-modal" class="mobile-detail-modal hidden">
                <div class="mobile-modal-header">
                    <div class="modal-title">
                        <div class="title-left">
                            <span class="title-label-ja">詳細情報</span>
                            <span class="title-label-vi">Chi tiết</span>
                        </div>
                        <div class="title-center">
                            <span class="item-type-label"></span>
                            <span class="item-id-code"></span>
                        </div>
                    </div>
                    <button class="modal-close-btn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="mobile-modal-body">
                    <!-- Content will be dynamically inserted -->
                    <div class="modal-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Đang tải...</p>
                    </div>
                </div>
                <div class="mobile-modal-actions">
                    <!-- Action buttons will be dynamically inserted -->
                </div>
                <!-- Nút close nổi (bottom-left) -->
                    <button class="mobile-modal-fab-close" aria-label="Close detail">
                        <span class="fab-label-ja">閉じる</span>
                        <span class="fab-label-vi">Đóng</span>
                    </button>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Cache elements
        this.modal = document.getElementById('mobile-detail-modal');
        this.modalContent = this.modal.querySelector('.mobile-modal-body');
        this.modalActions = this.modal.querySelector('.mobile-modal-actions');
        
        console.log('✅ Modal structure created');
    }


    // Bind events
    bindEvents() {
        // Close button
        const closeBtn = this.modal.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

                // Floating close button (bottom-left)
        const fabCloseBtn = this.modal.querySelector('.mobile-modal-fab-close');
        if (fabCloseBtn) {
            fabCloseBtn.addEventListener('click', () => this.hide());
        }


        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Listen for custom events to show modal
        document.addEventListener('showMobileDetail', (e) => {
            const { item, type } = e.detail;
            this.show(item, type);
        });

        // === NEW: Listen for module completion events ===
        
        // Check-in/Check-out completed successfully -> ĐÓNG MODAL
        document.addEventListener('checkin-completed', (e) => {
            console.log('[MobileModal] ✅ Check-in/check-out completed, closing detail modal');
            this.hide(); // Đóng modal chi tiết
        });

        // Location update completed successfully -> ĐÓNG MODAL
        document.addEventListener('location-updated', (e) => {
            console.log('[MobileModal] ✅ Location updated, closing detail modal');
            this.hide(); // Đóng modal chi tiết
        });

        // Module cancelled (user clicked Cancel or X) -> GIỮ MODAL
        document.addEventListener('module-cancelled', (e) => {
            console.log('[MobileModal] ⚠️ Module cancelled, keeping detail modal open');
            // Không làm gì, giữ nguyên modal chi tiết để user tiếp tục thao tác
        });

        // R7.0.7: CRITICAL - Listen for inventory mode changes from InventoryManager
        document.addEventListener('inventoryModeChanged', (e) => {
            const { active } = e.detail;
            console.log('[MobileModal] Received inventoryModeChanged event:', active);
            
            // Update internal state
            this.inventoryMode = !!active;
            
            // If modal is currently open, update UI immediately
            if (this.modal && this.modal.classList.contains('show')) {
                console.log('[MobileModal] Modal is open, updating toggle UI...');
                
                // Re-render mode toggle buttons
                const toggleBtns = this.modalContent.querySelectorAll('.toggle-btn');
                toggleBtns.forEach(btn => {
                    if (btn.dataset.mode === 'inventory') {
                        if (this.inventoryMode) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    } else if (btn.dataset.mode === 'checkin') {
                        if (!this.inventoryMode) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    }
                });
                
                // Re-render action buttons to show correct set (8 buttons or 2 buttons)
                this.renderActionButtons();
                
                console.log('[MobileModal] UI synced with inventory mode:', this.inventoryMode);
            }
        });

                // ============================
        // Swipe down to close modal (header drag)
        // ============================
        const header = this.modal.querySelector('.mobile-modal-header');
        if (header && 'ontouchstart' in window) {
            let startY = 0;
            let currentY = 0;
            let isDragging = false;

            const resetDrag = () => {
                isDragging = false;
                this.modal.classList.remove('dragging');
                this.modal.style.transform = '';
                this.modal.style.opacity = '';
            };

            const onTouchStart = (e) => {
                if (!e.touches || e.touches.length !== 1) return;
                startY = e.touches[0].clientY;
                currentY = startY;
                isDragging = true;
                this.modal.classList.add('dragging');
            };

            const onTouchMove = (e) => {
                if (!isDragging) return;
                const touchY = e.touches[0].clientY;
                const deltaY = touchY - startY;

                // Chỉ xử lý khi kéo xuống (deltaY > 0)
                if (deltaY <= 0) return;

                currentY = touchY;

                // Giới hạn khoảng kéo + tạo hiệu ứng mờ dần
                const translateY = Math.min(deltaY, 120);
                const opacity = 1 - Math.min(deltaY / 200, 0.5);

                this.modal.style.transform = `translateY(${translateY}px)`;
                this.modal.style.opacity = opacity;
            };

            const onTouchEnd = () => {
                if (!isDragging) return;
                const deltaY = currentY - startY;

                // Nếu kéo đủ xa → đóng modal, ngược lại trả về vị trí cũ
                if (deltaY > 80) {
                    resetDrag();
                    this.hide();
                } else {
                    resetDrag();
                }
            };

            header.addEventListener('touchstart', onTouchStart, { passive: true });
            header.addEventListener('touchmove', onTouchMove, { passive: true });
            header.addEventListener('touchend', onTouchEnd);
            header.addEventListener('touchcancel', resetDrag);
        }



        console.log('✅ Modal events bound (with checkin-completed listener)');
    }

    /**
     * Load data references from DataManager
     */
    loadDataReferences() {
        // ✅ FIX: Đúng cấu trúc DataManager thực tế
        if (typeof DataManager !== 'undefined' && DataManager.data) {
            this.data.molds = DataManager.data.molds || [];
            this.data.cutters = DataManager.data.cutters || [];
            this.data.molddesign = DataManager.data.molddesign || [];
            this.data.jobs = DataManager.data.jobs || [];
            this.data.employees = DataManager.data.employees || [];
            this.data.racklayers = DataManager.data.racklayers || [];
            this.data.racks = DataManager.data.racks || []; // ✅ THÊM
            this.data.destinations = DataManager.data.destinations || [];
            this.data.customers = DataManager.data.customers || [];
            this.data.companies = DataManager.data.companies || []; // ✅ THÊM
            this.data.moldcutter = DataManager.data.moldcutter || [];
            this.data.statuslogs = DataManager.data.statuslogs || []; // ✅ THÊM
            
            console.log('✅ Data references loaded:', {
                molds: this.data.molds.length,
                cutters: this.data.cutters.length,
                molddesign: this.data.molddesign.length,
                jobs: this.data.jobs.length,
                statuslogs: this.data.statuslogs.length,
                companies: this.data.companies.length
            });
        } else {
            console.warn('⚠️ DataManager not ready yet');
            setTimeout(() => {
                this.loadDataReferences();
            }, 1000);
        }
    }



    /**
     * Show/hide modal
     */
    // Show/hide modal
    show(item, type = 'mold') {
        // R7.0.3: FIX - Allow re-opening modal for related equipment
        if (!this.shouldShowModal || !item) {
            console.warn('[Modal] Cannot show modal', {
                shouldShow: this.shouldShowModal,
                hasItem: !!item
            });
            return;
        }

        if (!this.isMobile && !item) return;

        console.log('[Modal] Opening detail modal', item, type);

        // === FIX: Store item FIRST before any rendering ===
        this.currentItem = item;
        this.currentItemType = type;

        console.log('[Modal] Item stored:', {
            MoldID: item.MoldID,
            CutterID: item.CutterID,
            MoldCode: item.MoldCode,
            itemType: type
        });

        // R7.0.7: CRITICAL - Sync inventory mode from global state when opening modal
        this.inventoryMode = !!window.InventoryState?.active;
        console.log('[MobileModal] Synced inventory mode on open:', this.inventoryMode);


        // FIX: Update header title with CORRECT format
        const typeLabel = this.modal.querySelector('.item-type-label');
        const idCode = this.modal.querySelector('.item-id-code');

        if (typeLabel && idCode) {
            if (type === 'mold') {
                typeLabel.textContent = '金型';
                idCode.textContent = `${item.MoldID} - ${item.MoldCode} ${item.MoldName || ''}`;
            } else {
                typeLabel.textContent = '刃型';
                idCode.textContent = `ID: ${item.CutterID} - No. ${item.CutterNo} - ${item.CutterName || item.CutterCode || ''}`;
            }
        }

        // Reload data if needed
        if (this.data.molds.length === 0) {
            this.loadDataReferences();
        }

        // Render content
        this.renderContent();

        // Render action buttons (will use this.currentItem internally)
        this.renderActionButtons();

        // Show modal
        this.modal.classList.remove('hidden');
        this.modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        // R7.0.3: Reset scroll position to top
        if (this.modalContent) {
            this.modalContent.scrollTop = 0;
        }

        // Backup: Also reset modal body if exists
        const modalBody = this.modal?.querySelector('.mobile-modal-body');
        if (modalBody) {
            modalBody.scrollTop = 0;
        }

        console.log('✅ Modal shown with scroll reset');
    }



    /**
     * R7.0.2: Update check-in/out status badge (logic from ui-renderer)
     */
    updateCheckInOutStatus(item) {
        if (!item) return;
        
        const statusLogs = window.DataManager?.data?.statuslogs;
        if (!statusLogs || statusLogs.length === 0) {
            console.warn('[Modal] statuslogs not loaded');
            return;
        }
        
        const itemId = item.MoldID || item.CutterID;
        if (!itemId) return;
        
        const itemLogs = statusLogs.filter(log => 
            String(log.MoldID || '').trim() === String(itemId).trim()
        );
        
        // Tìm badge trong modal
        const statusBadge = this.modalBody.querySelector('.status-badge');
        if (!statusBadge) return;
        
        statusBadge.classList.remove('badge-checkin', 'badge-checkout', 'badge-audit', 'no-history');
        
        if (itemLogs.length === 0) {
            statusBadge.classList.add('no-history');
            statusBadge.innerHTML = '<i class="fas fa-question-circle"></i><span>未確認</span>';
            return;
        }
        
        // Lấy log mới nhất
        itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        const latestLog = itemLogs[0];
        const status = (latestLog.Status || '').toLowerCase();
        
        if (status.includes('in')) {
            statusBadge.classList.add('badge-checkin');
            statusBadge.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>チェックイン</span>';
        } else if (status.includes('out')) {
            statusBadge.classList.add('badge-checkout');
            statusBadge.innerHTML = '<i class="fas fa-sign-out-alt"></i><span>チェックアウト</span>';
        } else if (status.includes('audit')) {
            statusBadge.classList.add('badge-audit');
            statusBadge.innerHTML = '<i class="fas fa-clipboard-check"></i><span>棚卸</span>';
        }
    }


    /**
     * R7.0.2: Get display name for header (MoldName or CutterNo + CutterName)
     */
    getCurrentItemDisplayName() {
        if (!this.currentItem) return '';
        
        if (this.currentItemType === 'mold') {
            // Mold: use MoldName, fallback to MoldCode
            return this.currentItem.MoldName || this.currentItem.MoldCode || this.currentItem.MoldID;
        } else {
            // Cutter: combine CutterNo + CutterName
            const cutterNo = this.currentItem.CutterNo || '';
            const cutterName = this.currentItem.CutterName || this.currentItem.Name || '';
            
            if (cutterNo && cutterName) {
                return `${cutterNo}  ${cutterName}`;
            }
            return cutterNo || cutterName || this.currentItem.CutterID;
        }
    }


    hide() {
        if (!this.modal) return;

        this.modal.classList.remove('show');
        this.modal.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scroll

        // Clear content after animation
        setTimeout(() => {
            if (this.modalContent) {
                this.modalContent.innerHTML = '';
            }
            if (this.modalActions) {
                this.modalActions.innerHTML = '';
            }
            this.currentItem = null;
            this.currentItemType = null;
        }, 300);

        console.log('✅ Modal hidden');
    }

    /**
     * ========================================
     * RENDER CONTENT
     * ========================================
     */
    renderContent() {
        if (!this.currentItem) return;
        
        const item = this.currentItem;
        const type = this.currentItemType;
        
        let html = '';
        
        // R7.0.2: Toggle Mode Switch (nếu có InventoryState)
        const hasInventoryFeature = !!window.InventoryState;
        if (hasInventoryFeature) {
            html += this.renderModeToggle();
        }
        
        // Section 1: POS-Style Location Display
        html += this.renderLocationSection(item, type);


        // Section 2: Basic Information
        html += this.renderBasicInfo(item, type);

        // Section 3: Technical Information
        html += this.renderTechnicalInfo(item, type);

        // Section 3.5: Product Information (R7.0.2 - Separate for both mold and cutter)
        html += this.renderProductInfo(item, type);

        // Section 4: Related Equipment
        html += this.renderRelatedEquipment(item, type);
        // Section 5: Status & Notes
        html += this.renderStatusNotes(item, type);

        // Section 6: Additional Data (Jobs, Design, etc.)
        html += this.renderAdditionalData(item, type);

        this.modalContent.innerHTML = html;       

        // Bind related equipment links
        this.bindRelatedEquipmentLinks();

        // R7.0.2: Bind toggle mode buttons
       this.bindToggleButtons();

    }

    

    /**
     * R7.0.2: Render mode toggle switch (Check-in ↔ Kiểm kê)
     */
    renderModeToggle() {
        const isInventory = this.inventoryMode;
        
        return `
            <div class="mode-toggle-container">
                <div class="mode-toggle-label">
                    <span class="toggle-label-ja">モード選択</span>
                    <span class="toggle-label-vi">Chế độ</span>
                </div>
                <div class="mode-toggle-switch">
                    <button class="toggle-btn ${!isInventory ? 'active' : ''}" data-mode="checkin">
                        <i class="fas fa-clipboard-check"></i>
                        <span class="btn-label-ja">チェックイン </span>
                        <span class="btn-label-vi">Nhập/Xuất</span>
                    </button>
                    <button class="toggle-btn ${isInventory ? 'active' : ''}" data-mode="inventory">
                        <i class="fas fa-warehouse"></i>
                        <span class="btn-label-ja">在庫確認</span>
                        <span class="btn-label-vi">Kiểm kê</span>
                    </button>
                </div>
            </div>
        `;
    }


        /**
     * R7.0.3: SIMPLE TEXT-BASED LAYOUT - MINIMAL HEIGHT
     * - Traditional compact text layout
     * - Only badges: Rack-Layer + Check-in Status (same row)
     * - Below: simple text lines for location and notes
     * - Hide notes if empty
     */
    renderLocationSection(item, type) {
        // Get data
        const companyInfo = this.getStorageCompanyInfo(item);
        const statusInfo = this.getStorageStatus(item);
        
        // Get rack/layer info
        const rackLayerInfo = item.rackLayerInfo || {};
        const rackInfo = item.rackInfo || {};
        
        const rackId = rackInfo.RackID || rackLayerInfo.RackID || '-';
        const layerNum = rackLayerInfo.RackLayerNumber || '-';
        const rackLocation = rackInfo.RackLocation || item.displayRackLocation || '-';
        const rackNotes = rackInfo.RackNotes || '';
        const layerNotes = rackLayerInfo.RackLayerNotes || '';
        
        console.log('📍 renderLocationSection:', {
            itemID: item.MoldID || item.CutterID,
            rackId, layerNum, rackLocation,
            storageCompany: item.storage_company,
            isExternal: companyInfo.isExternal
        });
        
        return `
            <div class="modal-section location-section">
                <div class="section-header">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>保管情報 / Thông tin lưu trữ</span>
                </div>
                
                <div class="location-content">
                    <!-- Row 1: Current Storage Company (inline) -->
                    <div class="info-line company-line">
                        <i class="fas fa-info-circle"></i>
                        <span class="label">現在の保管会社 / Công ty lưu trữ:</span>
                        <span class="value company-value ${companyInfo.needsHighlight ? 'external' : 'ysd'}">
                            <i class="fas fa-warehouse"></i>
                            ${companyInfo.nameShort}
                        </span>
                    </div>
                    
                    <!-- Row 2: YSD Header -->
                    <div class="info-line ysd-header">
                        <i class="fas fa-warehouse"></i>
                        <span>YSDでの保管位置 / Vị trí lưu trữ mặc định tại YSD${companyInfo.isExternal ? ' (Tham khảo)' : ''}</span>
                    </div>
                    
                    <!-- Row 3: Badges Row (Rack-Layer + Check-in Status) -->
                    <div class="badges-row">
                        <div class="badge-group">
                            <span class="badge-label">棚 - 段 / Giá - Tầng</span>
                            <div class="badge-inline">
                                <div class="badge-circle">${rackId}</div>
                                <span class="badge-sep">-</span>
                                <div class="badge-rectangle">${layerNum}</div>
                            </div>
                        </div>
                        
                        <div class="status-group">
                            <span class="badge-label">確認状態 / Trạng thái xác nhận</span>
                            <div class="status-badge-compact ${statusInfo.class}">
                                <i class="${statusInfo.icon}"></i>
                                <span>${statusInfo.textShort}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Row 4: Location -->
                    <div class="info-line">
                        <span class="label">場所 / Vị trí:</span>
                        <span class="value location-value">${rackLocation}</span>
                    </div>
                    
                    <!-- Row 5: Rack Notes (hide if empty) -->
                    ${rackNotes && rackNotes !== '-' ? `
                        <div class="info-line">
                            <span class="label">棚注 / Ghi chú giá:</span>
                            <span class="value">${rackNotes}</span>
                        </div>
                    ` : ''}
                    
                    <!-- Row 6: Layer Notes (hide if empty) -->
                    ${layerNotes && layerNotes !== '-' ? `
                        <div class="info-line">
                            <span class="label">層注 / Ghi chú tầng:</span>
                            <span class="value">${layerNotes}</span>
                        </div>
                    ` : ''}
                    
                    <!-- External Warning (only if external) -->
                    ${companyInfo.isExternal ? `
                        <div class="info-line warning-line">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>この金型は外部に保管されています / Khuôn đang lưu trữ bên ngoài</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }





    /**
     * Helper: Get storage status from statuslogs (CORRECT LOGIC)
     */
    getStorageStatus(item) {
        if (!item) return {
            class: 'no-history',
            icon: 'fas fa-question-circle',
            text: '未確認 / Chưa rõ',
            textShort: '未確認'
        };
        
        // ✅ LOGIC ĐÚNG: Lấy từ statuslogs
        const statusLogs = window.DataManager?.data?.statuslogs || [];
        const itemId = item.MoldID || item.CutterID;
        
        if (!itemId || statusLogs.length === 0) {
            return {
                class: 'badge-checkin', // Default
                icon: 'fas fa-sign-in-alt',
                text: 'チェックイン / Check-in',
                textShort: 'チェックイン'
            };
        }
        
        // Tìm logs của item
        const itemLogs = statusLogs.filter(log => 
            String(log.MoldID || '').trim() === String(itemId).trim()
        );
        
        if (itemLogs.length === 0) {
            return {
                class: 'no-history',
                icon: 'fas fa-question-circle',
                text: '未確認 / Chưa rõ',
                textShort: '未確認'
            };
        }
        
        // Lấy log mới nhất
        itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        const latestLog = itemLogs[0];
        const status = (latestLog.Status || '').toLowerCase();
        
        const statusMap = {
            'checkin': {
                class: 'badge-checkin',
                icon: 'fas fa-sign-in-alt',
                text: 'チェックイン / Check-in',
                textShort: 'チェックイン'
            },
            'checkout': {
                class: 'badge-checkout',
                icon: 'fas fa-sign-out-alt',
                text: 'チェックアウト / Check-out',
                textShort: 'チェックアウト'
            },
            'audit': {
                class: 'badge-audit',
                icon: 'fas fa-clipboard-check',
                text: '棚卸 / Kiểm kê',
                textShort: '棚卸'
            }
        };
        
        // Detect status
        if (status.includes('in')) {
            return statusMap['checkin'];
        } else if (status.includes('out')) {
            return statusMap['checkout'];
        } else if (status.includes('audit')) {
            return statusMap['audit'];
        }
        
        // Default
        return statusMap['checkin'];
    }



        /**
     * Section 2: Basic Information - Grid 2 cột
     */
    renderBasicInfo(item, type) {
        const isMold = type === 'mold';
        
        // ✅ R7.0.2: Lấy dữ liệu từ các bảng liên quan
        const design = isMold ? this.getMoldDesignInfo(item) : null;
        const job = this.getJobInfo(item);
        const customer = this.getCustomerInfo(item);
        const company = this.getCompanyInfo(item);
        
        // Thông tin cơ bản
        const moldID = isMold ? (item.MoldID || '-') : (item.CutterID || '-');
        const name = isMold ? (item.MoldName || item.Name || '-') : (item.CutterName || item.Name || '-');
        const code = isMold ? (item.MoldCode || '-') : (item.CutterNo || '-');
        
        const dimensions = this.getMoldDimensions(item, design);

        // ✅ R7.0.2: Lấy kích thước dao cắt từ molddesign
        const cutterDimensions = this.getCutterDimensions(item, design);

        
        // ✅ Trọng lượng từ design
        const weight = design?.MoldDesignWeight || design?.DesignWeight || item.Weight || '-';
        
        // ✅ Thông tin khác từ design và job
        const trayInfo = design?.TrayInfoForMoldDesign || job?.TrayInfo || item.TrayInfo || '-';
        const material = design?.DesignForPlasticType || job?.Material || item.Material || item.PlasticType || '-';
        
        // ✅ Thông tin công ty
        const companyDisplay = this.getCustomerDisplay(item);

        // Debug log
        console.log('📊 renderBasicInfo:', {
            itemID: moldID,
            hasDesign: !!design,
            hasJob: !!job,
            dimensions: dimensions,
            weight: weight,
            trayInfo: trayInfo,
            companyDisplay: companyDisplay
        });


        const productionDate = item.ProductionDate || '-';
        const notes = item.Notes || '';
        
        return `
            <div class="modal-section">
                <div class="section-header">
                    <i class="fas fa-info-circle"></i>
                    <span>基本情報 / Thông tin cơ bản</span>
                </div>
                
                <div class="info-grid-2col">
                    <div class="info-item">
                        <div class="info-label">${isMold ? '金型ID / MoldID' : '抜型ID / CutterID'}</div>
                        <div class="info-value">${moldID}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">${isMold ? '金型コード / Mã khuôn' : '抜型No / Mã dao'}</div>
                        <div class="info-value">${code}</div>
                    </div>
                    <div class="info-item full-width">
                        <div class="info-label">名称 / Tên</div>
                        <div class="info-value">${name}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">寸法 / Kích thước</div>
                        <div class="info-value">${dimensions}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">金型重量 / Khối lượng khuôn</div>
                        <div class="info-value">${weight !== '-' ? weight + (design?.MoldDesignWeight ? ' kg' : '') : '-'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">トレイ情報（指示書より） / Khay</div>
                        <div class="info-value">${trayInfo}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">カットサイズ / Kích thước cắt</div>
                        <div class="info-value">${cutterDimensions}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">設計時の材質 / Loại nhựa</div>
                        <div class="info-value">${material}</div>
                    </div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">製造日 / Ngày SX</div>
                        <div class="info-value">${productionDate}</div>
                    </div>
                    ${notes ? `
                    <div class="info-item full-width">
                        <div class="info-label">備考 / Ghi chú</div>
                        <div class="info-value">${notes}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }


        /**
         * Section 3: Design/Technical Information - Grid 2 cột
         */
        renderTechnicalInfo(item, type) {
        // R7.0.2: Chỉ hiển thị thông tin thiết kế cho KHUÔN
        if (type !== 'mold') {
            return ''; // Dao cắt không có thông tin thiết kế
        }
        
        // ✅ FIX: Dùng helper function thay vì find trực tiếp
        const designData = this.getMoldDesignInfo(item) || {};
        
        // Debug log
        console.log('🔧 renderTechnicalInfo:', {
            MoldID: item.MoldID,
            MoldDesignID: item.MoldDesignID,
            designData: designData,
            hasDesignCode: !!designData.DesignCode,
            hasPockets: !!designData.Pockets
        });


        
        return `
            <div class="modal-section">
                <div class="section-header">
                    <i class="fas fa-drafting-compass"></i>
                    <span>設計情報 / Thông tin thiết kế</span>
                </div>
                
                <div class="info-grid-2col">
                    <div class="info-item">
                        <div class="info-label">設計コード / Mã thiết kế</div>
                        <div class="info-value">${designData.DesignCode || designData.MoldDesignCode || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">順/逆型 / Thuận/Nghịch</div>
                        <div class="info-value">${designData.ForwardReverse || designData.Orientation || 'N/A'}</div>
                    </div>

                    <div class="info-item">
                        <div class="info-label">設置方向 / Hướng lắp</div>
                        <div class="info-value">${designData.InstallDirection || designData.MoldSetupType || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">ポケット数 / Số pockets</div>
                        <div class="info-value">${designData.PocketCount || designData.PocketNumbers || 'N/A'}</div>
                    </div>
                    
                    
                    
                    <div class="info-item">
                        <div class="info-label">設計重量 / KL thiết kế</div>
                        <div class="info-value">${designData.MoldDesignWeight ? designData.MoldDesignWeight + ' kg' : (designData.DesignWeight || 'N/A')}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">面数 / Số mảnh khuôn</div>
                        <div class="info-value">${designData.PieceCount || designData.MoldPieces || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Pitch / Khoảng cách</div>
                        <div class="info-value">${designData.Pitch || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">C面取 / Góc vát</div>
                        <div class="info-value">${designData.ChamferC || designData.ChamferSize || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Rコーナー / Góc bo</div>
                        <div class="info-value">${designData.CornerR || designData.CornerRadius || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">深さ / Chiều sâu</div>
                        <div class="info-value">${designData.MoldDesignDepth || designData.CavityDepth || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Under depth</div>
                        <div class="info-value">${designData.UnderDepth || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">抜き勾配 / Góc nghiêng</div>
                        <div class="info-value">${designData.DraftAngle || designData.TaperAngle || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">彫刻 / Chữ khắc</div>
                        <div class="info-value">${designData.TextContent || designData.EngravingText || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">公差 X,Y / Dung sai</div>
                        <div class="info-value">${designData.ToleranceX || (designData.ToleranceX && designData.ToleranceY ? `${designData.ToleranceX}, ${designData.ToleranceY}` : 'N/A')}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">お客先図面番号 / Số bản vẽ</div>
                        <div class="info-value">${designData.CustomerDrawingNo || designData.DrawingNo || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">お客先設備コード / Mã thiết bị</div>
                        <div class="info-value">${designData.CustomerEquipmentNo || designData.MachineCode || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">プラグ有無 / Có nắp</div>
                        <div class="info-value">${designData.Plug || designData.HasPlug || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">試作 / Chạy thử</div>
                        <div class="info-value">${designData.Prototype || designData.PrototypeStatus || 'N/A'}</div>
                    </div>
                    
                    <div class="info-item full-width">
                        <div class="info-label">設計備考 / Ghi chú thiết kế</div>
                        <div class="info-value note-text">${designData.DesignNotes || designData.VersionNote || '-'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Product Information for cutters or additional mold info
     * ✅ R7.0.3 FIX: Handle null design for cutters
     */
    renderProductInfo(item, type) {
        const isMold = type === 'mold';

        // ✅ FIX: Dùng helper functions
        const jobData = this.getJobInfo(item);
        const design = isMold ? this.getMoldDesignInfo(item) : null;

        // Format cutline size (V4.31 logic)
        let cutlineSize = 'N/A';
        if (isMold) {
            if (design?.CutlineX && design?.CutlineY) {
                cutlineSize = `${design.CutlineX}×${design.CutlineY}`;
            } else if (item.CutlineLength && item.CutlineWidth) {
                cutlineSize = `${item.CutlineLength}×${item.CutlineWidth}`;
            }
            
            // Add corner and chamfer
            if (item.CutterCorner) {
                cutlineSize += `-R${item.CutterCorner}`;
            }
            if (item.CutterChamfer) {
                cutlineSize += `-C${item.CutterChamfer}`;
            }
        } else {
            // Cutter: use CutterNo or CutterSize
            cutlineSize = item.CutterNo || item.CutterSize || 'N/A';
        }

        console.log('📦 renderProductInfo:', {
            type,
            hasJob: !!jobData,
            hasDesign: !!design,
            cutlineSize: cutlineSize,
            trayWeight: jobData?.TrayWeight || design?.TrayWeight
        });

        return `
            <div class="modal-section">
                <div class="section-header">
                    <i class="fas fa-box-open"></i>
                    <span>製品情報 / Thông tin sản phẩm</span>
                </div>
                <div class="info-grid-2col">
                    <!-- Cutline Size -->
                    <div class="info-item">
                        <div class="info-label">切断寸法 / Kích thước cắt</div>
                        <div class="info-value">${cutlineSize}</div>
                    </div>

                    <!-- Production Date -->
                    <div class="info-item">
                        <div class="info-label">製造日 / Ngày SX</div>
                        <div class="info-value">${jobData?.DeliveryDeadline || 'N/A'}</div>
                    </div>

                    <!-- ✅ FIX: Optional chaining for design fields -->
                    <!-- Tray Name -->
                    <div class="info-item">
                        <div class="info-label">トレイ情報(お客先より) / Thông tin khay</div>
                        <div class="info-value">${design?.CustomerTrayName || 'N/A'}</div>
                    </div>

                    <!-- Tray Info -->
                    <div class="info-item">
                        <div class="info-label">トレイ情報（指示書より） / Thông tin khay</div>
                        <div class="info-value">${design?.TrayInfoForMoldDesign || 'N/A'}</div>
                    </div>

                    <!-- Tray Weight -->
                    <div class="info-item">
                        <div class="info-label">トレイ重量 / KL khay</div>
                        <div class="info-value">${jobData?.TrayWeight || design?.TrayWeight ? (jobData?.TrayWeight || design?.TrayWeight) + ' g' : 'N/A'}</div>
                    </div>

                    <!-- Material -->
                    <div class="info-item">
                        <div class="info-label">材質 / Chất liệu</div>
                        <div class="info-value">${jobData?.Material || design?.DesignForPlasticType || 'N/A'}</div>
                    </div>

                    <!-- First Shipment Date -->
                    <div class="info-item">
                        <div class="info-label">初回納品日 / Ngày xuất đầu</div>
                        <div class="info-value">${jobData?.FirstShipmentDate || jobData?.DeliveryDeadline || 'N/A'}</div>
                    </div>

                    <!-- Separate Cut -->
                    <div class="info-item">
                        <div class="info-label">単独抜き / Dao cắt riêng</div>
                        <div class="info-value">${jobData?.SeparateCut || jobData?.SeparateCutter || 'N/A'}</div>
                    </div>

                    <!-- Quote -->
                    <div class="info-item">
                        <div class="info-label">見積番号 / Báo giá</div>
                        <div class="info-value">${jobData?.PriceQuote || jobData?.QuoteNumber || 'N/A'}</div>
                    </div>

                    <!-- Unit Price -->
                    <div class="info-item">
                        <div class="info-label">単価 / Đơn giá</div>
                        <div class="info-value">${jobData?.UnitPrice ? (typeof jobData.UnitPrice === 'number' ? jobData.UnitPrice.toLocaleString('ja-JP') : jobData.UnitPrice) : 'N/A'}</div>
                    </div>

                    <!-- Box Type -->
                    <div class="info-item">
                        <div class="info-label">箱タイプ / Loại thùng</div>
                        <div class="info-value">${jobData?.BoxType || jobData?.LoaiThungDong || 'N/A'}</div>
                    </div>

                    <!-- Bagging -->
                    <div class="info-item">
                        <div class="info-label">袋詰め / Bọc túi</div>
                        <div class="info-value">${jobData?.Bagging || jobData?.BaoNilon || 'N/A'}</div>
                    </div>

                    <!-- Delivery Deadline -->
                    <div class="info-item">
                        <div class="info-label">納期 / Hạn giao</div>
                        <div class="info-value">${jobData?.DeliveryDeadline || jobData?.DueDate || 'N/A'}</div>
                    </div>

                    <!-- Order Number -->
                    <div class="info-item">
                        <div class="info-label">注文番号 / Số đơn hàng</div>
                        <div class="info-value">${jobData?.OrderNumber || jobData?.JobNumber || 'N/A'}</div>
                    </div>

                    <!-- Product Notes -->
                    <div class="info-item full-width">
                        <div class="info-label">製品備考 / Ghi chú sản phẩm</div>
                        <div class="info-value note-text">${jobData?.ProductNotes || jobData?.JobNote || '-'}</div>
                    </div>
                </div>
            </div>
        `;
    }




    /**
     * Section 4: Related Equipment
     */
    // R7.0.2: Section 4 - Related Equipment
    renderRelatedEquipment(item, type) {
        let relatedItems;

        if (type === 'mold') {
            // Mold → tìm cutter liên quan
            relatedItems = this.getRelatedCutters(item.MoldID);
        } else {
            // Cutter → tìm mold liên quan
            relatedItems = this.getRelatedMolds(item.CutterID);
        }

        if (!relatedItems || relatedItems.length === 0) {
            return `
                <div class="modal-section related-equipment-section">
                    <div class="section-header">
                        <i class="fas fa-link"></i>
                        <span class="title-ja">関連機器</span>
                        <span class="title-vi">Thiết bị liên quan</span>
                    </div>
                    <div class="no-related">関連機器なし / Không có thiết bị liên quan</div>
                </div>
            `;
        }

        let html = `
            <div class="modal-section related-equipment-section">
                <div class="section-header">
                    <i class="fas fa-link"></i>
                    <span class="title-ja">関連機器（${relatedItems.length}）</span>
                    <span class="title-vi">Thiết bị liên quan (${relatedItems.length})</span>
                </div>
                <div class="related-equipment-list">
        `;

        relatedItems.forEach(relItem => {
            const relType = (type === 'mold') ? 'cutter' : 'mold';
            const relCode = (relType === 'mold')
                ? (relItem.MoldCode || relItem.MoldID)
                : (relItem.CutterNo || relItem.CutterID);
            const relName = relItem.displayName || relItem.MoldName || relItem.CutterName || '-';
            const relLocation = relItem.displayLocation || relItem.rackInfo?.RackLocation || '-';
            const relId = relItem.MoldID || relItem.CutterID;

            html += `
                <div class="related-item"
                    data-item-id="${relId}"
                    data-item-type="${relType}">
                    <div class="related-item-icon">
                        <i class="fas ${relType === 'mold' ? 'fa-cube' : 'fa-cut'}"></i>
                    </div>
                    <div class="related-item-info">
                        <div class="related-item-code">${relCode}</div>
                        <div class="related-item-name">${relName}</div>
                        <div class="related-item-location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${relLocation}
                        </div>
                    </div>
                    <div class="related-item-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }


    /**
     * Section 5: Status & Notes
     */
    renderStatusNotes(item, type) {
        const status = type === 'mold' ? (item.moldStatus || '-') : (item.cutterStatus || '-');
        const notes = type === 'mold' ? (item.MoldNotes || '') : (item.CutterNote || '');
        const teflon = type === 'mold' ? (item.TeflonCoating || '-') : null;
        const returning = type === 'mold' ? (item.MoldReturning || '-') : null;
        const disposing = type === 'mold' ? (item.MoldDisposing || '-') : null;
        const teflonDate = item.TeflonDate || item.TeflonSentDate || '-';
        const teflonReturnDate = item.TeflonReturnDate || '-';
        const returnDate = item.ReturnDate || '-';
        const disposalDate = item.DisposalDate || '-';

        let html = `
            <div class="modal-section status-notes-section">
                <div class="section-header">
                    <i class="fas fa-clipboard-list"></i>
                    <span class="title-ja">状態・備考</span>
                    <span class="title-vi">Trạng thái & Ghi chú</span>
                </div>
                
                <div class="status-grid">
                    <div class="status-item">
                        <div class="status-label">ステータス / Trạng thái</div>
                        <div class="status-value status-badge">${status}</div>
                    </div>
        `;

        if (type === 'mold') {
            html += `
                    <div class="status-item">
                        <div class="status-label">テフロン加工 / Teflon</div>
                        <div class="status-value">${teflon}</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">返却 / Trả lại</div>
                        <div class="status-value">${returning}</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">廃棄 / Thanh lý</div>
                        <div class="status-value">${disposing}</div>
                    </div>
            `;
        }

        html += `
                </div>
                
                <div class="notes-area">
                    <div class="notes-label">
                        <i class="fas fa-sticky-note"></i>
                        備考 / Ghi chú
                    </div>
                    <div class="notes-content">${notes || '備考なし / Không có ghi chú'}</div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Section 6: Additional Data (Jobs, Employees, etc.)
     */
    renderAdditionalData(item, type) {
        // Get job info
        const jobInfo = item.jobInfo || null;
        const employeeInfo = item.employeeInfo || null;

        if (!jobInfo && !employeeInfo) {
            return '';
        }

        let html = `
            <div class="modal-section additional-data-section">
                <div class="section-header">
                    <i class="fas fa-database"></i>
                    <span class="title-ja">追加情報</span>
                    <span class="title-vi">Thông tin bổ sung</span>
                </div>
                <div class="info-grid">
        `;

        if (jobInfo) {
            html += `
                <div class="info-row">
                    <div class="info-label">ジョブ / Công việc</div>
                    <div class="info-value">${jobInfo.JobName || '-'}</div>
                </div>
            `;
        }

        if (employeeInfo) {
            html += `
                <div class="info-row">
                    <div class="info-label">担当者 / Người phụ trách</div>
                    <div class="info-value">${employeeInfo.EmployeeName || '-'}</div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    // R7.0.4 RENDER ACTION BUTTONS - Fixed for iPhone
    renderActionButtons() {
        // === FIX: Use this.currentItem and this.currentItemType ===
        if (!this.currentItem) {
            console.warn('[MobileModal] renderActionButtons: No current item');
            return;
        }

        // R7.0.2: Check toggle state first or InventoryState
        const isInventoryMode = this.inventoryMode || !!window.InventoryState?.active;

        console.log('[MobileModal] renderActionButtons:', {
            isInventoryMode,
            currentItem: this.currentItem?.MoldCode || this.currentItem?.CutterNo,
            itemType: this.currentItemType,
            hasModalActions: !!this.modalActions
        });

        if (isInventoryMode) {
            // INVENTORY MODE: 2 buttons
            this.modalActions.innerHTML = `
                <div class="action-buttons-grid inventory-mode">
                    <button id="mobile-action-inventory-audit" class="action-btn btn-inv-audit" data-action="inventory-audit">
                        <i class="fas fa-clipboard-check"></i>
                        <span class="btn-label-ja">監査</span>
                        <span class="btn-label-vi">Kiểm kê</span>
                    </button>
                    <button id="mobile-action-inventory-relocate" class="action-btn btn-inv-relocate" data-action="inventory-relocate">
                        <i class="fas fa-map-marked-alt"></i>
                        <span class="btn-label-ja">移動監査</span>
                        <span class="btn-label-vi">Đổi vị trí + Kiểm kê</span>
                    </button>
                </div>
            `;
        } else {
            // NORMAL MODE: 8 buttons in 4x2 grid - === FIX: ADD ID TO EACH BUTTON ===
            this.modalActions.innerHTML = `
                <div class="action-buttons-grid normal-mode">
                    <!-- Row 1 -->
                    <button id="mobile-action-checkin" class="action-btn btn-checkin" data-action="checkin">
                        <i class="fas fa-sign-in-alt"></i>
                        <span class="btn-label-ja">入庫</span>
                        <span class="btn-label-vi">Check-in</span>
                    </button>
                    <button id="mobile-action-checkout" class="action-btn btn-checkout" data-action="checkout">
                        <i class="fas fa-sign-out-alt"></i>
                        <span class="btn-label-ja">出庫</span>
                        <span class="btn-label-vi">Check-out</span>
                    </button>
                    <button id="mobile-action-location" class="action-btn btn-location" data-action="location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="btn-label-ja">位置</span>
                        <span class="btn-label-vi">Vị trí / Giá</span>
                    </button>
                    <button id="mobile-action-transport" class="action-btn btn-transport" data-action="transport">
                        <i class="fas fa-truck"></i>
                        <span class="btn-label-ja">配送</span>
                        <span class="btn-label-vi">Vận chuyển</span>
                    </button>
                    <!-- Row 2 -->
                    <button id="mobile-action-teflon" class="action-btn btn-teflon" data-action="teflon">
                        <i class="fas fa-shield-alt"></i>
                        <span class="btn-label-ja">テフロン</span>
                        <span class="btn-label-vi">Teflon</span>
                    </button>
                    <button id="mobile-action-print" class="action-btn btn-print" data-action="print">
                        <i class="fas fa-print"></i>
                        <span class="btn-label-ja">印刷</span>
                        <span class="btn-label-vi">In nhãn</span>
                    </button>
                    <button id="mobile-action-qrcode" class="action-btn btn-qrcode" data-action="qrcode">
                        <i class="fas fa-qrcode"></i>
                        <span class="btn-label-ja">QR</span>
                        <span class="btn-label-vi">QR Code</span>
                    </button>
                    <button id="mobile-action-comments" class="action-btn btn-comments" data-action="comments">
                        <i class="fas fa-comment-alt"></i>
                        <span class="btn-label-ja">コメント</span>
                        <span class="btn-label-vi">Ghi chú</span>
                    </button>
                </div>
            `;
        }

        // === FIX: Pass this.currentItem and this.currentItemType ===
        this.bindActionButtons(this.currentItem, this.currentItemType);

        console.log('[MobileModal] ✅ Action buttons rendered and bound');
    }








    // R7.0.4: Bind action button events - Fixed for iPhone
    // - Remove existing listeners before binding
    // - Add proper error handling
    // - Log each button binding
    // - SUPPORT BOTH NORMAL AND INVENTORY MODES
    bindActionButtons(item, itemType) {
        console.log('[MobileModal] Binding action buttons for:', itemType, item);

        // VALIDATE ITEM
        if (!item) {
            console.error('[MobileModal] Cannot bind buttons - no item');
            return;
        }

        // R7.0.4: Check current mode to determine which buttons to bind
        const isInventoryMode = this.inventoryMode || !!window.InventoryState?.active;

        let buttons;
        
        if (isInventoryMode) {
            // INVENTORY MODE: 2 buttons
            buttons = [
                { id: 'mobile-action-inventory-audit', action: 'inventory-audit' },
                { id: 'mobile-action-inventory-relocate', action: 'inventory-relocate' }
            ];
        } else {
            // NORMAL MODE: 8 buttons
            buttons = [
                { id: 'mobile-action-checkin', action: 'checkin' },
                { id: 'mobile-action-checkout', action: 'checkout' },
                { id: 'mobile-action-location', action: 'location' },
                { id: 'mobile-action-transport', action: 'transport' },
                { id: 'mobile-action-teflon', action: 'teflon' },
                { id: 'mobile-action-print', action: 'print' },
                { id: 'mobile-action-qrcode', action: 'qrcode' },
                { id: 'mobile-action-comments', action: 'comments' }
            ];
        }

        console.log(`[MobileModal] Binding ${buttons.length} action buttons (${isInventoryMode ? 'INVENTORY' : 'NORMAL'} mode)...`);

        buttons.forEach(({ id, action }) => {
            const btn = document.getElementById(id);
            if (btn) {
                // Remove old listeners
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                // Add new listener with correct parameters
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // FIX: Pass item object, not string
                    console.log('[MobileModal] Button clicked:', action, 'item:', item);
                    this.handleActionClick(action, item, itemType);
                });

                console.log('[MobileModal] ✅ Button bound:', action);
            } else {
                console.warn(' [MobileModal] ⚠️ Button not found:', id);
            }
        });

        console.log('[MobileModal] ✅ All action buttons bound successfully');
    }




        /**
     * R7.0.2: Bind toggle mode buttons
     */
    bindToggleButtons() {
        const toggleBtns = this.modalContent.querySelectorAll('.toggle-btn');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = btn.dataset.mode;
                this.toggleMode(mode);
            });
        });
    }
    
    // R7.0.5: Toggle between checkin and inventory mode
    // SYNC with InventoryManager state
    toggleMode(mode) {
        const wasInventory = this.inventoryMode;
        this.inventoryMode = (mode === 'inventory');
        
        console.log('🔄 Mode switched to:', mode, '(was:', wasInventory ? 'inventory' : 'checkin', ')');
        
        // R7.0.5: CRITICAL - Sync với InventoryManager
        if (this.inventoryMode !== wasInventory) {
            // Update InventoryManager state
            if (window.InventoryState) {
                window.InventoryState.active = this.inventoryMode;
            }
            
            // Update badge ON/OFF
            if (window.InventoryManager) {
                window.InventoryManager.updateBadge(this.inventoryMode);
            }
            
            // Dispatch event để sync với UI khác
            document.dispatchEvent(new CustomEvent('inventoryModeChanged', {
                detail: { active: this.inventoryMode }
            }));
            
            console.log('[MobileModal] ✅ InventoryState synced:', this.inventoryMode);
        }
        
        // Re-render action buttons
        this.renderActionButtons();
        
        // Update toggle button states
        const toggleBtns = this.modalContent.querySelectorAll('.toggle-btn');
        toggleBtns.forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }



    /**
     * R7.0.4: Handle action button click (Fixed for iPhone)
     * - ✅ Close mobile modal BEFORE opening module modal
     * - ✅ Add proper error handling
     * - ✅ Support both Check-in and Check-out actions
     */
    // HANDLE ACTION BUTTON CLICKS
    handleActionClick(action, item, itemType) {
        console.log('[MobileModal] Button clicked:', action);
        console.log('MobileModal handleActionClick', action);
        
        // === VALIDATE ITEM ===
        if (!item) {
            console.error('[MobileModal] ❌ No item provided to handleActionClick');
            alert('Lỗi: Không có dữ liệu vật phẩm');
            return;
        }
        
        if (typeof item === 'string') {
            console.error('[MobileModal] ❌ Item is string, expected object:', item);
            alert('Lỗi: Dữ liệu vật phẩm không hợp lệ');
            return;
        }
        
        console.log('[MobileModal] Item data:', {
            MoldID: item.MoldID,
            CutterID: item.CutterID,
            MoldCode: item.MoldCode,
            itemType: itemType
        });
        
        switch(action) {
            case 'checkin':
            case 'checkout':
                // === FIX: Pass action (mode) as third parameter ===
                this.triggerCheckInOut(item, itemType, action);
                break;

                
            case 'location':
                this.triggerLocationUpdate(item, itemType);
                break;
                
            case 'transport':
                this.triggerTransportUpdate(item, itemType);
                break;
                
            case 'teflon':
                this.triggerTeflonUpdate(item, itemType);
                break;
                
            case 'print':
                this.triggerPrintLabel(item, itemType);
                break;
                
            case 'qrcode':
                this.triggerQRCode(item, itemType);
                break;
                
            case 'comments':
                this.triggerComments(item, itemType);
                break;

            // R7.0.4: NEW - Inventory mode actions
            case 'inventory-audit':
                this.handleInventoryAudit();
                break;

            case 'inventory-relocate':
                this.handleInventoryRelocate();
                break;
                
            default:
                console.warn('[MobileModal] Unknown action:', action);
        }
    }



    /**
     * R7.0.4: Trigger location update (Fixed for iPhone)
     * - ✅ Try multiple API names: LocationManager → LocationUpdate
     * - ✅ Add modal-open class to body for mobile CSS
     * - ✅ Proper error handling
     */
    triggerLocationUpdate(item, type) {
        console.log('[MobileModal] triggerLocationUpdate:', item, type);
        
        // ✅ Try LocationManager first (priority), then LocationUpdate
        const locationAPI = window.LocationManager || window.LocationUpdate;
        
        if (!locationAPI) {
            console.error('[MobileModal] Location module not found');
            alert('Location Manager module chưa được load');
            return;
        }

        // ✅ Try different method names
        const openMethod = locationAPI.openModal || 
                          locationAPI.openLocationModal || 
                          locationAPI.showLocationPanel;
        
        if (!openMethod) {
            console.error('[MobileModal] Location module has no open method');
            alert('Location Manager không hỗ trợ openModal');
            return;
        }

        console.log('[MobileModal] ✅ Opening Location Manager...');

        // ✅ Call the module's open method
        try {
            openMethod.call(locationAPI, item, type);
            console.log('[MobileModal] ✅ Location Manager opened');
        } catch (error) {
            console.error('[MobileModal] Error opening Location Manager:', error);
            alert('Lỗi khi mở Location Manager: ' + error.message);
        }
    }




    /**
     * R7.0.4: Trigger Check-in/Check-out module (Fixed for iPhone)
     * - ✅ Unified method for both check-in and check-out
     * - ✅ Add modal-open class to body for mobile CSS
     * - ✅ Try multiple API names
     * @param {Object} item - Mold or Cutter item
     * @param {String} type - 'mold' or 'cutter'
     * @param {String} mode - 'check-in' or 'check-out'
     */
    // TRIGGER CHECK-IN/CHECK-OUT
    triggerCheckInOut(item, itemType, mode = 'check-in') {
        console.log('[MobileModal] triggerCheckInOut:', item, itemType, 'mode:', mode);
        // CRITICAL FIX: Convert action to correct mode format
        // action from button: 'checkin' / 'checkout'
        // module expects: 'check-in' / 'check-out'
        const realMode = (mode === 'checkin') ? 'check-in' : 
                        (mode === 'checkout') ? 'check-out' : 
                        mode;
        // === CRITICAL FIX: VALIDATE ITEM DATA ===
        if (!item || typeof item === 'string') {
            console.error('[MobileModal] ❌ Invalid item parameter:', item);
            alert('Lỗi: Dữ liệu vật phẩm không hợp lệ');
            return;
        }
        
        // Validate ID exists
        if (!item.MoldID && !item.CutterID) {
            console.error('[MobileModal] ❌ Missing ID in item:', item);
            alert('Lỗi: Không tìm thấy MoldID hoặc CutterID');
            return;
        }
        
        console.log('[MobileModal] ✅ Item validated:', {
            MoldID: item.MoldID,
            CutterID: item.CutterID,
            MoldCode: item.MoldCode,
            itemType: itemType,
            requestedMode: mode
        });
        
        console.log('[MobileModal] ✅ Opening Check-in/Check-out module with mode:', mode);
        
        // === FIX: Kiểm tra signature của CheckInOut.openModal ===
        if (typeof window.CheckInOut !== 'undefined' && typeof window.CheckInOut.openModal === 'function') {
        console.log('[MobileModal] Calling CheckInOut.openModal with:', 
            'mode:', realMode, 
            'item:', { MoldID: item.MoldID, CutterID: item.CutterID, MoldCode: item.MoldCode }
        );
        
        window.CheckInOut.openModal(realMode, item);
            
            console.log('[MobileModal] ✅ Check-in/Check-out module opened with mode:', mode);
        } else {
            console.error('[MobileModal] ❌ CheckInOut.openModal not found');
            alert('Lỗi: Module Check-in/Check-out không khả dụng');
        }
    }



    /**
     * Trigger status update
     */
    triggerStatusUpdate(item, type) {
        // Dispatch event for status update module
        const event = new CustomEvent('updateStatus', {
            detail: {
                item: item,
                type: type,
                source: 'mobileDetailModal'
            }
        });
        document.dispatchEvent(event);

        console.log('⚙️ Status update triggered');
    }

    /**
     * Trigger comments update
     */
    triggerCommentsUpdate(item, type) {
        // Dispatch event for comments module
        const event = new CustomEvent('updateComments', {
            detail: {
                item: item,
                type: type,
                source: 'mobileDetailModal'
            }
        });
        document.dispatchEvent(event);

        console.log('💬 Comments update triggered');
    }

    

    
    /**
     * R7.0.2: Trigger Transport (Vận chuyển)
     */
    triggerTransport(item, type) {
        const event = new CustomEvent('triggerTransport', {
            detail: { item, type, source: 'mobileDetailModal' }
        });
        document.dispatchEvent(event);
        console.log('✅ Transport triggered');
    }
    
    /**
     * R7.0.2: Trigger Teflon
     */
    triggerTeflon(item, type) {
        const event = new CustomEvent('triggerTeflon', {
            detail: { item, type, source: 'mobileDetailModal' }
        });
        document.dispatchEvent(event);
        console.log('✅ Teflon triggered');
    }
    
    /**
     * R7.0.2: Trigger Print (In ấn)
     */
    triggerPrint(item, type) {
        const event = new CustomEvent('triggerPrint', {
            detail: { item, type, source: 'mobileDetailModal' }
        });
        document.dispatchEvent(event);
        console.log('✅ Print triggered');
    }
    
    /**
     * R7.0.2: Trigger QR Code
     */
    triggerQRCode(item, type) {
        const event = new CustomEvent('triggerQRCode', {
            detail: { item, type, source: 'mobileDetailModal' }
        });
        document.dispatchEvent(event);
        console.log('✅ QR Code triggered');
    }


      /**
     * ========================================
     * R6.9.7 - INVENTORY AUDIT HANDLERS
     * ========================================
     */
    
    // Kiểm kê đơn thuần (không đổi vị trí)
    handleInventoryAudit() {
        if (!this.currentItem) {
        console.warn('[MobileDetailModal] No current item for inventory');
        return;
        }

        const itemId = this.currentItem.MoldID || this.currentItem.CutterID;
        const itemType = this.currentItemType;
        const operator = window.InventoryState?.operator || null;
        const applyAutoClose = !!window.InventoryState?.autoClose;

        // ✅ FIX: Dùng format YYYY-MM-DD thay vì YYYYMMDD
        const today = new Date().toISOString().split('T')[0]; // "2025-11-13"

        console.log('[MobileDetailModal] Inventory audit:', { itemId, itemType, today, operator });

        // ✅ 1. Ghi lịch sử kiểm kê VÀO InventoryManager
        if (window.InventoryManager) {
        window.InventoryManager.recordAudit(itemId, itemType, today);
        console.log('[MobileDetailModal] ✅ Audit recorded:', itemId, today);
        } else {
        console.error('[MobileDetailModal] ❌ InventoryManager not available');
        }

        // ✅ 2. Ghi check-in với reason="inventory"
        document.dispatchEvent(new CustomEvent('triggerCheckin', {
        detail: {
            item: this.currentItem,
            type: this.currentItemType,
            mode: 'inventory',
            operator,
            source: 'mobileDetailModal'
        }
        }));

        // ✅ 3. Hiển thị toast thông báo
        this.showSuccessToast('kiểm kê hoàn tất / 確認完了');

        // ✅ 4. Đóng modal nếu auto-close bật
        if (applyAutoClose) {
        setTimeout(() => this.hide(), 500);
        }

        console.log('✅ Inventory audit logged successfully');
    }

    /**
     * R7.0.8 - ✅ OPTIMIZED: Đóng modal NGAY - Ghi dữ liệu background
     * - Đóng modal ngay sau khi user xác nhận (không chờ API)
     * - API calls chạy background (không await)
     * - Notes statuslogs: "棚卸 | Kiểm kê + 位置変更"
     */
    async handleInventoryRelocate() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚀 [RELOCATE+AUDIT] R7.0.8 - Fast close version...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // ========================================
        // STEP 1: VALIDATE
        // ========================================
        if (!this.currentItem) {
            console.error('❌ [RELOCATE+AUDIT] No current item');
            alert('⚠️ Không có dữ liệu vật phẩm');
            return;
        }
        
        const itemId = this.currentItem.MoldID || this.currentItem.CutterID;
        const itemType = this.currentItemType || 'mold';
        const oldRackLayerID = this.currentItem.RackLayerID || this.currentItem.currentRackLayer;
        
        console.log('✅ [RELOCATE+AUDIT] Current item:', {
            MoldID: this.currentItem.MoldID,
            MoldCode: this.currentItem.MoldCode,
            OldRackLayerID: oldRackLayerID,
            itemType: itemType
        });
        
        // ========================================
        // STEP 2: PROMPT NHẬP RACKLAYERID
        // ========================================
        const newRackLayerID = prompt(
            '🆔 棚段ID (例: 15, 112) を入力\n' +
            'Nhập RackLayerID mới (vd: 15, 112)\n\n' +
            `📍 Vị trí hiện tại: ${oldRackLayerID || 'N/A'}`,
            oldRackLayerID || ''
        );
        
        if (!newRackLayerID || newRackLayerID.trim() === '') {
            console.log('⚠️ [RELOCATE+AUDIT] User cancelled');
            return;
        }
        
        const trimmedRackLayerID = newRackLayerID.trim();
        
        // Validate RackLayerID tồn tại
        const racklayers = window.DataManager?.data?.racklayers || [];
        const rackLayerExists = racklayers.some(rl => 
            String(rl.RackLayerID).trim() === trimmedRackLayerID
        );
        
        if (!rackLayerExists) {
            console.error('❌ [RELOCATE+AUDIT] RackLayerID not found:', trimmedRackLayerID);
            alert(`⚠️ RackLayerID "${trimmedRackLayerID}" không tồn tại`);
            return;
        }
        
        console.log('✅ [RELOCATE+AUDIT] New RackLayerID validated:', trimmedRackLayerID);
        
        // ========================================
        // STEP 3: LẤY THÔNG TIN TỰ ĐỘNG
        // ========================================
        const operator = window.InventoryState?.operator || '1';
        const today = new Date().toISOString().split('T')[0];
        const timestamp = new Date().toISOString();
        
        // ✅ NOTES MỚI theo yêu cầu
        const locationNotes = 'Thay đổi vị trí khi kiểm kê / 棚卸時の位置変更';
        const auditNotes = '棚卸 | Kiểm kê + 位置変更'; // ✅ ĐỊNH DẠNG MỚI
        
        console.log('📝 [RELOCATE+AUDIT] Auto data:', {
            operator: operator,
            date: today,
            timestamp: timestamp,
            locationNotes: locationNotes,
            auditNotes: auditNotes
        });
        
        // ========================================
        // ⚡ STEP 4: ĐÓNG MODAL NGAY LẬP TỨC
        // ========================================
        console.log('🚪 [RELOCATE+AUDIT] Closing modal immediately...');
        
        // Hiển thị toast "Đang xử lý..."
        this.showSuccessToast('⏳ 処理中... / Đang xử lý...');
        
        // Đóng modal ngay (không chờ API)
        setTimeout(() => {
            this.hide();
            console.log('✅ [RELOCATE+AUDIT] Modal closed (API running in background)');
        }, 300); // 300ms để toast hiện trước
        
        // ========================================
        // 🔄 STEP 5: GHI DỮ LIỆU BACKGROUND (KHÔNG AWAIT)
        // ========================================
        console.log('🔄 [RELOCATE+AUDIT] Starting background API calls...');
        
        // Prepare data
        const locationData = {
            MoldID: itemId,
            CutterID: itemType === 'cutter' ? itemId : '',
            OldRackLayer: oldRackLayerID || '',
            NewRackLayer: trimmedRackLayerID,
            notes: locationNotes, // ✅ GHI CHÚ CHO LOCATIONLOG
            Employee: operator,
            DateEntry: timestamp
        };
        
        const auditData = {
            MoldID: itemId,
            CutterID: itemType === 'cutter' ? itemId : '',
            ItemType: itemType,
            Status: 'AUDIT',
            EmployeeID: operator,
            DestinationID: 'AREA-MOLDROOM',
            Notes: auditNotes, // ✅ GHI CHÚ CHO STATUSLOGS (ĐỊNH DẠNG MỚI)
            Timestamp: timestamp,
            AuditDate: today,
            AuditType: 'AUDIT-WITH-RELOCATION'
        };
        
        // ========================================
        // 🚀 BACKGROUND PROMISE - KHÔNG AWAIT
        // ========================================
        (async () => {
            try {
                console.log('📍 [RELOCATE+AUDIT BG] Saving locationlog...');
                
                // Call 1: locationlog
                const locationRes = await fetch('https://ysd-moldcutter-backend.onrender.com/api/locationlog', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(locationData)
                });
                
                const locationResult = await locationRes.json();
                
                if (locationResult.success) {
                    console.log('✅ [RELOCATE+AUDIT BG] Location log saved:', locationResult);
                    
                    // Update local data
                    if (window.DataManager?.data?.locationlog) {
                        window.DataManager.data.locationlog.unshift({
                            ...locationData,
                            LocationLogID: locationResult.logId || 'LOC' + Date.now()
                        });
                    }
                    
                    // Update molds array
                    if (window.DataManager?.data?.molds) {
                        const mold = window.DataManager.data.molds.find(m => 
                            String(m.MoldID).trim() === String(itemId).trim()
                        );
                        if (mold) {
                            mold.RackLayerID = trimmedRackLayerID;
                            mold.currentRackLayer = trimmedRackLayerID;
                            console.log('✅ [RELOCATE+AUDIT BG] Updated mold RackLayerID in-memory');
                        }
                    }
                } else {
                    throw new Error(locationResult.message || 'Location log failed');
                }
                
                // Call 2: statuslogs (audit)
                console.log('📝 [RELOCATE+AUDIT BG] Saving audit log...');
                
                const auditRes = await fetch('https://ysd-moldcutter-backend.onrender.com/api/checklog', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(auditData)
                });
                
                const auditResult = await auditRes.json();
                
                if (auditResult.success) {
                    console.log('✅ [RELOCATE+AUDIT BG] Audit log saved:', auditResult);
                    
                    // Update local data
                    if (window.DataManager?.data?.statuslogs) {
                        window.DataManager.data.statuslogs.unshift({
                            ...auditData,
                            LogID: auditResult.logId || 'AUDIT' + Date.now()
                        });
                    }
                } else {
                    throw new Error(auditResult.message || 'Audit log failed');
                }
                
                // ========================================
                // ✅ SUCCESS - HIỂN thị TOAST THÀNH CÔNG
                // ========================================
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('✅ [RELOCATE+AUDIT BG] COMPLETED!');
                console.log('📊 Summary:', {
                    item: `${itemId} (${this.currentItem?.MoldCode || 'N/A'})`,
                    oldLocation: oldRackLayerID,
                    newLocation: trimmedRackLayerID,
                    operator: operator,
                    timestamp: timestamp
                });
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                // Hiển thị toast thành công (modal đã đóng rồi)
                this.showSuccessToast('✅ 位置変更＋棚卸完了 / Đổi vị trí + Kiểm kê hoàn tất!');
                
                // Trigger event để UI refresh nếu cần
                document.dispatchEvent(new CustomEvent('inventory-relocated', {
                    detail: {
                        itemId: itemId,
                        itemType: itemType,
                        oldRackLayer: oldRackLayerID,
                        newRackLayer: trimmedRackLayerID,
                        timestamp: timestamp
                    }
                }));
                
            } catch (err) {
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.error('❌ [RELOCATE+AUDIT BG] Failed!');
                console.error('Error:', err);
                console.error('Error stack:', err.stack);
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                // Hiển thị toast lỗi (modal đã đóng rồi)
                this.showSuccessToast('❌ Lỗi: ' + err.message);
            }
        })(); // ⚡ IIFE - Chạy ngay không chờ
        
        // ========================================
        // ⚡ RETURN NGAY - KHÔNG AWAIT
        // ========================================
        console.log('⚡ [RELOCATE+AUDIT] Function returned (API still running in background)');
    }





    // ✅ Helper: Toast notification
    showSuccessToast(message) {
        const toast = document.createElement('div');
        toast.className = 'success-toast';
        toast.textContent = message;
        toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #34C759 0%, #28A745 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(52, 199, 89, 0.4);
        z-index: 100000;
        animation: toastSlideUp 0.3s ease-out;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
        }, 2000);
    }


    // Helper: Hiển thị toast thông báo
    showSuccessToast(message) {
        const toast = document.createElement('div');
        toast.className = 'success-toast';
        toast.textContent = message;
        toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #34C759 0%, #28A745 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(52, 199, 89, 0.4);
        z-index: 100000;
        animation: toastSlideUp 0.3s ease-out;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * ========================================
     * HELPER FUNCTIONS - DATA RETRIEVAL
     * ========================================
     */

    /**
     * R7.0.2: Get mold design info with V4.31 logic
     * @param {Object} moldItem - Mold item
     * @returns {Object} Design data with enriched info
     */
    getMoldDesignInfo(moldItem) {
        if (!moldItem) return null;
        
        // Priority 1: Check if already enriched
        if (moldItem.designInfo) {
            return moldItem.designInfo;
        }
        
        // Priority 2: Find by MoldDesignID
        if (moldItem.MoldDesignID) {
            const design = this.data.molddesign.find(d => 
                d.MoldDesignID === moldItem.MoldDesignID
            );
            if (design) return design;
        }
        
        // Priority 3: Find by MoldCode match
        if (moldItem.MoldCode) {
            const design = this.data.molddesign.find(d => 
                d.MoldCode === moldItem.MoldCode || 
                d.DesignCode === moldItem.MoldCode
            );
            if (design) return design;
        }
        
        // Priority 4: Return empty object with debug
        console.warn('⚠️ No design info found for mold:', {
            MoldID: moldItem.MoldID,
            MoldCode: moldItem.MoldCode,
            MoldDesignID: moldItem.MoldDesignID
        });
        
        return null;
    }

    /**
     * R7.0.2: Get customer info (V4.31 logic)
     */
    getCustomerInfo(item) {
        if (!item || !item.CustomerID) return null;
        
        // Check if already enriched
        if (item.customerInfo) {
            return item.customerInfo;
        }
        
        const customer = this.data.customers.find(c => 
            c.CustomerID === item.CustomerID
        );
        
        return customer || null;
    }

    /**
     * R7.0.2: Get company info (V4.31 logic)
     */
    getCompanyInfo(item) {
        const customer = this.getCustomerInfo(item);
        if (!customer || !customer.CompanyID) return null;
        
        const company = this.data.companies.find(c => 
            c.CompanyID === customer.CompanyID
        );
        
        return company || null;
    }

    /**
     * R7.0.2: Get job info (V4.31 logic)
     */
    getJobInfo(item) {
        if (!item || !item.MoldDesignID) return null;
        
        // Check if already enriched
        if (item.jobInfo) {
            return item.jobInfo;
        }
        
        const job = this.data.jobs.find(j => 
            j.MoldDesignID === item.MoldDesignID
        );
        
        return job || null;
    }

    /**
     * R7.0.2: Get rack layer info with full details (V4.31 logic)
     * @param {Object} item - Mold/Cutter item
     * @returns {Object} Full rack and layer information
     */
    getRackLayerInfo(item) {
        if (!item || !item.RackLayerID) {
            return {
                layer: null,
                rack: null,
                badge: '未確認',
                location: '未確認'
            };
        }
        
        // Find rack layer
        const rackLayer = this.data.racklayers.find(rl => 
            rl.RackLayerID === item.RackLayerID
        );
        
        if (!rackLayer) {
            console.warn('⚠️ RackLayer not found:', item.RackLayerID);
            return {
                layer: null,
                rack: null,
                badge: '未確認',
                location: '未確認'
            };
        }
        
        // Find rack info
        const rack = this.data.racks.find(r => 
            r.RackID === rackLayer.RackID
        );
        
        if (!rack) {
            console.warn('⚠️ Rack not found:', rackLayer.RackID);
        }
        
        // Build badge (RackSymbol-LayerNumber)
        const rackSymbol = rack?.RackSymbol || rack?.RackNumber || '?';
        const layerNumber = rackLayer.RackLayerNumber || '?';
        const badge = `${rackSymbol}-${layerNumber}`;
        
        return {
            layer: rackLayer,
            rack: rack || null,
            badge: badge,
            location: rack?.RackLocation || '未確認',
            rackNotes: rack?.RackNotes || null,
            layerNotes: rackLayer.RackLayerNotes || null
        };
    }

    /**
     * R7.0.2: Get storage company info
     */
    getStorageCompanyInfo(item) {
        if (!item) return { name: '-', isYSD: false, needsHighlight: false };
        
        // ✅ FIX: Lấy company data từ DataManager
        const companies = window.DataManager?.data?.companies || [];
        const storageCompany = item.storage_company || 2; // Default YSD = 2
        
        // Tìm company trong companies.csv
        const companyData = companies.find(c => c.CompanyID === storageCompany);
        
        let companyName = '-';
        if (companyData) {
            companyName = companyData.CompanyName || companyData.CompanyShortName || '-';
        } else {
            // Fallback: Map theo ID
            const defaultMap = {
                1: '顧客',
                2: 'YSD本社',
                3: '外部倉庫'
            };
            companyName = defaultMap[storageCompany] || '-';
        }
        
        const isYSD = companyName.toUpperCase().includes('ヨシダパッケージ');
        
        return {
            name: companyName,
            nameShort: companyName,
            isYSD: isYSD,
            isExternal: !isYSD,
            needsHighlight: !isYSD,
            color: isYSD ? '#42A5F5' : '#FFB74D'
        };
    }


    /**
     * R7.0.2: Format dimensions (V4.31 logic)
     */
    getMoldDimensions(item, designData) {
        // Priority 1: Design data
        if (designData) {
            if (designData.MoldDesignLength && designData.MoldDesignWidth && designData.MoldDesignHeight) {
                return `${designData.MoldDesignLength}×${designData.MoldDesignWidth}×${designData.MoldDesignHeight}`;
            }
            if (designData.MoldDesignDim) {
                return designData.MoldDesignDim;
            }
        }
        
        // Priority 2: Mold data
        if (item.MoldLength && item.MoldWidth && item.MoldHeight) {
            return `${item.MoldLength}×${item.MoldWidth}×${item.MoldHeight}`;
        }
        
        // Priority 3: Size field
        if (item.Size) {
            return item.Size;
        }
        
        return '0×0';
    }

    /**
     * R7.0.2: Format cutter dimensions from molddesign (V4.31 logic)
     * @param {Object} item - Mold item
     * @param {Object} designData - Design data from molddesign table
     * @returns {String} Formatted cutter dimensions (CutlineX×CutlineY-CornerR-ChamferC)
     */
    getCutterDimensions(item, designData) {
        // Priority 1: Design data (from molddesign table)
        if (designData) {
            const cutlineX = designData.CutlineX || designData.CutterLength || null;
            const cutlineY = designData.CutlineY || designData.CutterWidth || null;
            const cornerR = designData.CornerR || designData.RCorner || null;
            const chamferC = designData.ChamferC || designData.Chamfer || null;
            
            // Build dimension string
            if (cutlineX && cutlineY) {
                let dimString = `${cutlineX}×${cutlineY}`;
                
                // Add corner R if exists
                if (cornerR) {
                    dimString += ` - ${cornerR}`;
                }
                
                // Add chamfer C if exists
                if (chamferC) {
                    dimString += ` - ${chamferC}`;
                }
                
                return dimString;
            }
            
            // Fallback: Check if there's a combined dimension field
            if (designData.CutterDimensions || designData.CutlineDim) {
                return designData.CutterDimensions || designData.CutlineDim;
            }
        }
        
        // Priority 2: Direct fields from item (for cutters)
        if (item.CutlineLength && item.CutlineWidth) {
            let dimString = `${item.CutlineLength}×${item.CutlineWidth}`;
            
            if (item.CutterCorner) {
                dimString += `-R${item.CutterCorner}`;
            }
            
            if (item.CutterChamfer) {
                dimString += `-C${item.CutterChamfer}`;
            }
            
            return dimString;
        }
        
        // Priority 3: Size field
        if (item.CutterSize || item.Size) {
            return item.CutterSize || item.Size;
        }
        
        return '-';
    }


    /**
     * R7.0.2: Get customer display name (V4.31 logic)
     */
    getCustomerDisplay(item) {
        const customer = this.getCustomerInfo(item);
        const company = this.getCompanyInfo(item);
        
        if (!customer) return '-';
        
        let displayName = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
        
        if (company && company.CompanyShortName) {
            displayName = `${company.CompanyShortName} (${displayName})`;
        }
        
        return displayName;
    }


    /**
     * Get related cutters for a mold
     * Logic: MoldID → MoldDesignID (từ molds.csv) → CutterID (từ moldcutter.csv)
     */
    getRelatedCutters(moldID) {
        if (!moldID) return [];
        
        console.log(`🔍 getRelatedCutters: Finding cutters for MoldID=${moldID}`);
        
        // ✅ BƯỚC 1: Tìm MoldDesignID từ molds.csv
        const mold = this.data.molds.find(m => m.MoldID === moldID);
        if (!mold || !mold.MoldDesignID) {
            console.log(`⚠️ Mold not found or no MoldDesignID for MoldID=${moldID}`);
            return [];
        }
        
        const moldDesignID = mold.MoldDesignID;
        console.log(`   Bước 1: MoldID=${moldID} → MoldDesignID=${moldDesignID}`);
        
        // ✅ BƯỚC 2: Tìm CutterID từ moldcutter.csv
        const moldcutterLinks = this.data.moldcutter.filter(mc => 
            mc.MoldDesignID === moldDesignID
        );
        
        const cutterIDs = [...new Set(moldcutterLinks.map(mc => mc.CutterID))].filter(Boolean);
        console.log(`   Bước 2: MoldDesignID=${moldDesignID} → CutterIDs=`, cutterIDs);
        
        // ✅ BƯỚC 3: Lấy thông tin cutters
        const relatedCutters = this.data.cutters.filter(c => 
            cutterIDs.includes(c.CutterID)
        );
        
        console.log(`🔗 Found ${relatedCutters.length} related cutters for mold ${moldID}`);
        
        // Debug: Hiển thị kết quả
        if (relatedCutters.length > 0) {
            relatedCutters.forEach(c => {
                console.log(`   ✅ Cutter: ${c.CutterNo} (ID=${c.CutterID})`);
            });
        }
        
        return relatedCutters;
    }


    /**
     * Get related molds for a cutter
     * Logic: CutterID → MoldDesignID (từ moldcutter.csv) → MoldID (từ molds.csv)
     */
    getRelatedMolds(cutterID) {
        if (!cutterID) return [];
        
        console.log(`🔍 getRelatedMolds: Finding molds for CutterID=${cutterID}`);
        
        // ✅ BƯỚC 1: Tìm MoldDesignID từ bảng moldcutter.csv
        const moldcutterLinks = this.data.moldcutter.filter(mc => 
            mc.CutterID === cutterID
        );
        
        if (moldcutterLinks.length === 0) {
            console.log(`⚠️ No moldcutter links found for CutterID=${cutterID}`);
            return [];
        }
        
        const designIDs = [...new Set(moldcutterLinks.map(mc => mc.MoldDesignID))].filter(Boolean);
        console.log(`   Bước 1: CutterID=${cutterID} → MoldDesignIDs=`, designIDs);
        
        // ✅ BƯỚC 2: Tìm MoldID từ molds.csv có MoldDesignID tương ứng
        const relatedMolds = this.data.molds.filter(m => 
            designIDs.includes(m.MoldDesignID)
        );
        
        console.log(`🔗 Found ${relatedMolds.length} related molds for cutter ${cutterID}`);
        
        // Debug: Hiển thị kết quả
        if (relatedMolds.length > 0) {
            relatedMolds.forEach(m => {
                console.log(`   ✅ Mold: ${m.MoldCode} (ID=${m.MoldID}, DesignID=${m.MoldDesignID})`);
            });
        }
        
        return relatedMolds;
    }



    /**
     * ✅ R7.0.3: Bind related equipment click events - Re-render entire modal
     */
    bindRelatedEquipmentLinks() {
        if (!this.modalContent) {
            console.warn('[Modal] modalContent not found');
            return;
        }

        const relatedItems = this.modalContent.querySelectorAll('.related-item');
        
        if (!relatedItems || relatedItems.length === 0) {
            console.log('[Modal] No related equipment items to bind');
            return;
        }

        relatedItems.forEach(itemEl => {
            itemEl.addEventListener('click', () => {
                const itemId = itemEl.dataset.itemId;
                const itemType = (itemEl.dataset.itemType || '').toLowerCase();

                console.log('[Modal] Related item clicked:', { itemId, itemType });

                let relatedItem = null;

                // ✅ FIX: Find item in correct array
                if (itemType === 'mold') {
                    relatedItem = this.data.molds.find(m =>
                        String(m.MoldID) === String(itemId)
                    );
                } else if (itemType === 'cutter') {
                    relatedItem = this.data.cutters.find(c =>
                        String(c.CutterID) === String(itemId)
                    );
                }

                if (!relatedItem) {
                    console.warn('[Modal] ⚠️ Related item not found:', { itemType, itemId });
                    
                    // ✅ DEBUG: Log available data
                    console.log('[Modal] Available molds:', this.data.molds.length);
                    console.log('[Modal] Available cutters:', this.data.cutters.length);
                    
                    return;
                }

                console.log('[Modal] ✅ Found related item:', relatedItem);

                // ✅ FIX: Reload data references before showing
                this.loadDataReferences();

                // ✅ FIX: Call show() to fully re-render modal
                this.show(relatedItem, itemType);

                console.log('[Modal] ✅ Modal re-opened for related item:', itemType, itemId);
            });
        });

        console.log(`[Modal] ✅ Bound ${relatedItems.length} related equipment links`);
    }





}

// ========================================
// AUTO-INITIALIZATION
// ========================================
let mobileDetailModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth < 768) {
        mobileDetailModalInstance = new MobileDetailModal();
        mobileDetailModalInstance.init();
        
        // Expose to global scope
        window.MobileDetailModal = mobileDetailModalInstance;
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobileDetailModal;
}
