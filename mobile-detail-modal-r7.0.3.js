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
        this.inventoryMode = false; // ✅ THÊM: Track inventory mode state
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
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Cache elements
        this.modal = document.getElementById('mobile-detail-modal');
        this.modalContent = this.modal.querySelector('.mobile-modal-body');
        this.modalActions = this.modal.querySelector('.mobile-modal-actions');
        
        console.log('✅ Modal structure created');
    }


    /**
     * Bind events
     */
    bindEvents() {
        // Close button
        const closeBtn = this.modal.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
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

        console.log('✅ Modal events bound');
        
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
    show(item, type = 'mold') {
        // ✅ R7.0.3 FIX: Allow re-opening modal for related equipment
        if (!this.shouldShowModal || !item) {
            console.warn('[Modal] Cannot show modal:', { shouldShow: this.shouldShowModal, hasItem: !!item });
            return;
        }

        if (!this.isMobile || !item) return;
        
        console.log('[Modal] Opening detail modal', item, type);
        this.currentItem = item;
        this.currentItemType = type;
        
        // ✅ FIX: Update header title with CORRECT format
        const typeLabel = this.modal.querySelector('.item-type-label');
        const idCode = this.modal.querySelector('.item-id-code');
        
        if (typeLabel && idCode) {
            if (type === 'mold') {
                typeLabel.textContent = '金型:';
                idCode.textContent = `${item.MoldID || '-'} ${item.MoldCode || item.MoldName || '-'}`;
            } else {
                typeLabel.textContent = '抜型:';
                idCode.textContent = `${'ID.'} ${item.CutterID || '-'} ${'No.'} ${item.CutterNo || '-'} ${item.CutterName || item.CutterCode || '-'}`;
            }
        }
        
        // Reload data if needed
        if (this.data.molds.length === 0) {
            this.loadDataReferences();
        }
        
        // Render content
        this.renderContent();
        
        // Render action buttons
        this.renderActionButtons();
        
        // Show modal
        this.modal.classList.remove('hidden');
        this.modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // ✅ R7.0.3: Reset scroll position to top
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
                        <span>YSD / Vị trí lưu trữ mặc định tại YSD${companyInfo.isExternal ? ' (Tham khảo)' : ''}</span>
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
                            <span class="badge-label">状態 / Trạng thái</span>
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

    /**
     * R7.0.2: RENDER ACTION BUTTONS
     * - Normal mode: 8 buttons (4x2 grid)
     * - Inventory mode: 2 buttons
     */
    renderActionButtons() {
        if (!this.currentItem) return;
        
        // R7.0.2: Kiểm tra chế độ từ toggle (ưu tiên) hoặc InventoryState
        const isInventoryMode = this.inventoryMode || !!window.InventoryState?.active;
        
        if (isInventoryMode) {
            // ===== INVENTORY MODE: 2 nút =====
            this.modalActions.innerHTML = `
                <div class="action-buttons-grid inventory-mode">
                    <button class="action-btn btn-inv-audit" data-action="inventory-audit">
                        <i class="fas fa-clipboard-check"></i>
                        <span class="btn-label-ja">在庫確認</span>
                        <span class="btn-label-vi">Kiểm kê</span>
                    </button>
                    <button class="action-btn btn-inv-relocate" data-action="inventory-relocate">
                        <i class="fas fa-map-marked-alt"></i>
                        <span class="btn-label-ja">位置変更・棚卸</span>
                        <span class="btn-label-vi">Đổi vị trí và Kiểm kê</span>
                    </button>
                </div>
            `;
        } else {
            // ===== NORMAL MODE: 8 nút (4x2) =====
            this.modalActions.innerHTML = `
                <div class="action-buttons-grid normal-mode">
                    <!-- Row 1 -->
                    <button class="action-btn btn-checkin" data-action="checkin">
                        <i class="fas fa-sign-in-alt"></i>
                        <span class="btn-label-ja">チェックイン</span>
                        <span class="btn-label-vi">Check-in</span>
                    </button>
                    <button class="action-btn btn-checkout" data-action="checkout">
                        <i class="fas fa-sign-out-alt"></i>
                        <span class="btn-label-ja">チェックアウト</span>
                        <span class="btn-label-vi">Check-out</span>
                    </button>
                    <button class="action-btn btn-location" data-action="location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="btn-label-ja">位置更新</span>
                        <span class="btn-label-vi">Vị trí giá</span>
                    </button>
                    <button class="action-btn btn-transport" data-action="transport">
                        <i class="fas fa-truck"></i>
                        <span class="btn-label-ja">輸送</span>
                        <span class="btn-label-vi">Vận chuyển</span>
                    </button>
                    
                    <!-- Row 2 -->
                    <button class="action-btn btn-teflon" data-action="teflon">
                        <i class="fas fa-shield-alt"></i>
                        <span class="btn-label-ja">テフロン</span>
                        <span class="btn-label-vi">Teflon</span>
                    </button>
                    <button class="action-btn btn-print" data-action="print">
                        <i class="fas fa-print"></i>
                        <span class="btn-label-ja">印刷</span>
                        <span class="btn-label-vi">In ấn</span>
                    </button>
                    <button class="action-btn btn-qrcode" data-action="qrcode">
                        <i class="fas fa-qrcode"></i>
                        <span class="btn-label-ja">QRコード</span>
                        <span class="btn-label-vi">QR Code</span>
                    </button>
                    <button class="action-btn btn-comments" data-action="comments">
                        <i class="fas fa-comment-alt"></i>
                        <span class="btn-label-ja">コメント</span>
                        <span class="btn-label-vi">Ghi chú</span>
                    </button>
                </div>
            `;
        }
        
        // Bind events
        this.bindActionButtons();
    }





    /**
     * Bind action button events
     */
    bindActionButtons() {
        const actionBtns = this.modalActions.querySelectorAll('.action-btn');
        
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                this.handleActionClick(action);
                
            });
        });

        
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
    
    /**
     * R7.0.2: Toggle between checkin and inventory mode
     */
    toggleMode(mode) {
        this.inventoryMode = (mode === 'inventory');
        console.log(`🔄 Mode switched to: ${mode}`);
        
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
     * Handle action button click
     */
    handleActionClick(action) {
        console.log(`🎬 Action clicked: ${action}`);

        const item = this.currentItem;
        const type = this.currentItemType;

        switch (action) {
            case 'location':
                // Trigger location update module
                this.triggerLocationUpdate(item, type);
                break;
            
            case 'checkin':
                // Trigger check-in/out module
                this.triggerCheckin(item, type);
                break;
            
            case 'status':
                // Trigger status update module
                this.triggerStatusUpdate(item, type);
                break;
            
            case 'comments':
                // Trigger comments module
                this.triggerCommentsUpdate(item, type);
                break;
            
            case 'checkout':
                // R7.0.2: Check-out
                this.triggerCheckout(item, type);
                break;
                
            case 'transport':
                // R7.0.2: Vận chuyển
                this.triggerTransport(item, type);
                break;
                
            case 'teflon':
                // R7.0.2: Teflon
                this.triggerTeflon(item, type);
                break;
                
            case 'print':
                // R7.0.2: In ấn
                this.triggerPrint(item, type);
                break;
                
            case 'qrcode':
                // R7.0.2: QR Code
                this.triggerQRCode(item, type);
                break;

            case 'inventory-audit':
                // ✅ R6.9.5: Kiểm kê đơn thuần
                this.handleInventoryAudit();
                break;
        
            case 'inventory-relocate':
                // ✅ R6.9.5: Đổi vị trí + Kiểm kê
                this.handleInventoryRelocate();
                break;

            }
        }

    /**
     * Trigger location update (compatible with existing module)
     */
    triggerLocationUpdate(item, type) {
        // Dispatch event for location update module
        const event = new CustomEvent('updateLocation', {
            detail: {
                item: item,
                type: type,
                source: 'mobileDetailModal'
            }
        });
        document.dispatchEvent(event);

        console.log('📍 Location update triggered');
    }

    /**
     * Trigger check-in/out (compatible with existing module)
     */
    triggerCheckin(item, type) {
        // Dispatch event for checkin module
        const event = new CustomEvent('triggerCheckin', {
            detail: {
                item: item,
                type: type,
                source: 'mobileDetailModal'
            }
        });
        document.dispatchEvent(event);

        console.log('📋 Check-in triggered');
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
     * R7.0.2: Trigger Check-out
     */
    triggerCheckout(item, type) {
        const event = new CustomEvent('triggerCheckout', {
            detail: { item, type, source: 'mobileDetailModal' }
        });
        document.dispatchEvent(event);
        console.log('✅ Check-out triggered');
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
     * Đổi vị trí + Kiểm kê
     */
    handleInventoryRelocate() {
        const operator = window.InventoryState?.operator || null;
        const applyAutoClose = !!window.InventoryState?.autoClose;
        
        // Hỏi nhanh RackLayerID (3 ký tự, ví dụ 112)
        const rackLayer = prompt(
            '棚段ID (例: 112) を入力\nNhập RackLayerID (vd: 112)'
        );
        
        if (!rackLayer) {
            console.log('❌ Inventory relocate cancelled');
            return;
        }
        
        console.log('📍 Inventory Relocate:', { rackLayer, operator });
        
        // 1) Cập nhật vị trí
        document.dispatchEvent(new CustomEvent('updateLocation', {
            detail: { 
                item: this.currentItem, 
                type: this.currentItemType, 
                rackLayerId: rackLayer, 
                reason: 'inventory', 
                operator, 
                source: 'mobileDetailModal' 
            }
        }));
        
        // 2) Ghi check-in (kiểm kê)
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('triggerCheckin', {
                detail: { 
                    item: this.currentItem, 
                    type: this.currentItemType, 
                    mode: 'inventory', 
                    operator, 
                    source: 'mobileDetailModal' 
                }
            }));
        }, 500); // Delay 500ms để location update xong trước
        
        // Đóng modal nếu auto-close bật
        if (applyAutoClose) {
            setTimeout(() => this.hide(), 1000);
        }
        
        console.log('✅ Inventory relocate + audit logged');
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
