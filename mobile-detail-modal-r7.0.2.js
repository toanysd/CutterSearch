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
        this.currentItemType = null; // 'mold' or 'cutter'
        // R7.0.2: Hỗ trợ cả iPhone và iPad
        this.isMobile = window.innerWidth < 768;
        this.isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
        this.shouldShowModal = this.isMobile || this.isTablet;

        // R7.0.2: Inventory mode toggle
        this.inventoryMode = false; // false = checkin mode, true = inventory mode

        // Data references (from DataManager)
        this.data = {
            molds: [],
            cutters: [],
            molddesign: [],
            jobs: [],
            employees: [],
            racklayers: [],
            destinations: [],
            customers: []
        };
        
        console.log('🏗️ MobileDetailModal initialized');
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
        if (existing) existing.remove();

        // Create modal HTML
        const modalHTML = `
            <div id="mobile-detail-modal" class="mobile-detail-modal hidden">
                <div class="mobile-modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-ja">詳細情報</span>
                        <span class="modal-title-vi">Chi tiết</span>
                    </h2>
                    <button class="modal-close-btn" aria-label="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="mobile-modal-body">
                    <!-- Content will be dynamically inserted -->
                    <div class="modal-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>読み込み中... / Đang tải...</p>
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
            this.data.destinations = DataManager.data.destinations || [];
            this.data.customers = DataManager.data.customers || [];
            this.data.moldcutter = DataManager.data.moldcutter || []; // ✅ THÊM
            
            console.log('✅ Data references loaded:', {
                molds: this.data.molds.length,
                cutters: this.data.cutters.length,
                molddesign: this.data.molddesign.length,
                jobs: this.data.jobs.length
            });
        } else {
            console.warn('⚠️ DataManager not ready yet');
            // Retry sau 1 giây
            setTimeout(() => {
                this.loadDataReferences();
            }, 1000);
        }
    }


    /**
     * ========================================
     * SHOW/HIDE MODAL
     * ========================================
     */
    show(item, type = 'mold') {
        if (!this.isMobile || !item) return;

        console.log('🔍 Opening detail modal:', { item, type });

        this.currentItem = item;
        this.currentItemType = type;
        // Update header title
        const titleJa = this.modal.querySelector('.modal-title-ja');
        const titleVi = this.modal.querySelector('.modal-title-vi');
        
        const itemName = type === 'mold' 
            ? (item.MoldCode || item.displayCode || 'N/A')
            : (item.CutterNo || item.displayCode || 'N/A');
        
        if (titleJa) {
            titleJa.textContent = `${type === 'mold' ? '金型' : '抜型'}: ${itemName}`;
        }
        
        if (titleVi) {
            titleVi.textContent = type === 'mold' ? 'Chi tiết khuôn' : 'Chi tiết dao cắt';
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
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        console.log('✅ Modal shown');
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
                    <span class="toggle-label-ja">モード選択 / </span>
                    <span class="toggle-label-vi">Chế độ</span>
                </div>
                <div class="mode-toggle-switch">
                    <button class="toggle-btn ${!isInventory ? 'active' : ''}" data-mode="checkin">
                        <i class="fas fa-clipboard-check"></i>
                        <span class="btn-label-ja">チェックイン / </span>
                        <span class="btn-label-vi">Nhập/Xuất</span>
                    </button>
                    <button class="toggle-btn ${isInventory ? 'active' : ''}" data-mode="inventory">
                        <i class="fas fa-warehouse"></i>
                        <span class="btn-label-ja">在庫確認 / </span>
                        <span class="btn-label-vi">Kiểm kê</span>
                    </button>
                </div>
            </div>
        `;
    }


        /**
     * Section 1: Location Section - Optimized R7.0.2
     */
    renderLocationSection(item, type) {
        const location = item.displayLocation || item.RackLayerID || '未設定';
        const company = item.storageCompanyInfo?.CompanyName || item.storageCompany || '-';
        const rackLocation = item.RackLocation || '-';
        const rackNotes = item.RackNotes || '';
        const layerNotes = item.LayerNotes || '';
        
        // Trạng thái badges
        const checkinStatus = item.CheckInStatus || item.checkinStatus || '';
        const checkoutStatus = item.CheckOutStatus || item.checkoutStatus || '';
        const auditStatus = item.AuditStatus || item.auditStatus || '';
        
        // Tạo badges HTML (1 hàng ngang)
        let statusBadges = '';
        
        if (location !== '未設定') {
            statusBadges += `<span class="location-badge">${location}</span>`;
        }
        
        if (checkinStatus) {
            statusBadges += `<span class="status-badge badge-checkin"><i class="fas fa-sign-in-alt"></i> Check-in</span>`;
        }
        
        if (checkoutStatus) {
            statusBadges += `<span class="status-badge badge-checkout"><i class="fas fa-sign-out-alt"></i> Check-out</span>`;
        }
        
        if (auditStatus) {
            statusBadges += `<span class="status-badge badge-audit"><i class="fas fa-clipboard-check"></i> 在庫確認</span>`;
        }
        
        if (!statusBadges) {
            statusBadges = `<span class="status-badge badge-inactive">未設定</span>`;
        }
        
        return `
            <div class="modal-section location-section">
                <div class="section-header">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>現在の保管位置 / Vị trí lưu trữ</span>
                </div>
                
                <!-- Badges Row (1 hàng ngang) -->
                <div class="badges-row">
                    ${statusBadges}
                </div>
                
                <!-- Info Grid 2 columns -->
                <div class="info-grid-2col">
                    <div class="info-item">
                        <div class="info-label">会社 / Công ty</div>
                        <div class="info-value">${company}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">棚内位置 / Vị trí giá</div>
                        <div class="info-value">${rackLocation}</div>
                    </div>
                    ${rackNotes ? `
                    <div class="info-item full-width">
                        <div class="info-label">棚メモ / Ghi chú giá</div>
                        <div class="info-value note-text">${rackNotes}</div>
                    </div>
                    ` : ''}
                    ${layerNotes ? `
                    <div class="info-item full-width">
                        <div class="info-label">段メモ / Ghi chú tầng</div>
                        <div class="info-value note-text">${layerNotes}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }



        /**
     * Section 2: Basic Information - Grid 2 cột
     */
    renderBasicInfo(item, type) {
        const isMold = type === 'mold';
        
        // Lấy dữ liệu
        const moldID = isMold ? (item.MoldID || '-') : (item.CutterID || '-');
        const name = isMold ? (item.MoldName || item.Name || '-') : (item.CutterName || item.Name || '-');
        const code = isMold ? (item.MoldCode || '-') : (item.CutterNo || '-');
        
        // Kích thước kết hợp
        const dimensions = item.Dimensions || `${item.Length || 0}×${item.Width || 0}`;
        
        // Thông tin khác
        const weight = item.MoldDesignWeight || item.Weight || '-';
        const trayInfo = item.TrayInfo || '-';
        const material = item.Material || item.PlasticType || '-';
        const cutSize = item.CutSize || '-';
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
                        <div class="info-label">重量 / Khối lượng</div>
                        <div class="info-value">${weight}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">トレイ / Khay</div>
                        <div class="info-value">${trayInfo}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">材質 / Loại nhựa</div>
                        <div class="info-value">${material}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">カットサイズ / Kích thước cắt</div>
                        <div class="info-value">${cutSize}</div>
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
        
        // Tìm design data từ molddesign table
        const designData = this.data.molddesign.find(d => 
            d.MoldID === item.MoldID || d.MoldCode === item.MoldCode
        ) || {};

        
        return `
            <div class="modal-section">
                <div class="section-header">
                    <i class="fas fa-drafting-compass"></i>
                    <span>設計情報 / Thông tin thiết kế</span>
                </div>
                
                <div class="info-grid-2col">
                    <div class="info-item">
                        <div class="info-label">設計コード / Mã thiết kế</div>
                        <div class="info-value">${designData.DesignCode || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">順/逆型 / Thuận/Nghịch</div>
                        <div class="info-value">${designData.MoldType || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">ポケット数 / Số pockets</div>
                        <div class="info-value">${designData.Pockets || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">設置方向 / Hướng lắp</div>
                        <div class="info-value">${designData.InstallDirection || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">設計重量 / KL thiết kế</div>
                        <div class="info-value">${designData.DesignWeight || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">金型片数 / Số mảnh khuôn</div>
                        <div class="info-value">${designData.MoldPieces || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Pitch / Khoảng cách</div>
                        <div class="info-value">${designData.Pitch || '0'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">C面取 / Góc vát</div>
                        <div class="info-value">${designData.Chamfer || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Rコーナー / Góc bo</div>
                        <div class="info-value">${designData.RCorner || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">深さ / Chiều sâu</div>
                        <div class="info-value">${designData.Depth || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Under depth</div>
                        <div class="info-value">${designData.UnderDepth || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">抜き勾配 / Góc nghiêng</div>
                        <div class="info-value">${designData.DraftAngle || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">彫刻 / Chữ khắc</div>
                        <div class="info-value">${designData.Engraving || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">公差 X,Y / Dung sai</div>
                        <div class="info-value">${designData.ToleranceX || 'N/A'}, ${designData.ToleranceY || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">図面番号 / Số bản vẽ</div>
                        <div class="info-value">${designData.DrawingNo || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">設備コード / Mã thiết bị</div>
                        <div class="info-value">${designData.EquipmentCode || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">プラグ有無 / Có nắp</div>
                        <div class="info-value">${designData.HasPlug || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">試作 / Chạy thử</div>
                        <div class="info-value">${designData.Prototype || '-'}</div>
                    </div>
                    ${designData.DesignNotes ? `
                    <div class="info-item full-width">
                        <div class="info-label">設計備考 / Ghi chú thiết kế</div>
                        <div class="info-value">${designData.DesignNotes}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

        /**
     * Product Information (for cutters or additional mold info)
     */
    renderProductInfo(item, type) {
        // Tìm job data
        const jobData = this.data.jobs.find(j => 
            j.MoldID === item.MoldID || j.CutterID === item.CutterID
        ) || {};
        
        return `
            <div class="modal-section">
                <div class="section-header">
                    <i class="fas fa-box-open"></i>
                    <span>製品情報 / Thông tin sản phẩm</span>
                </div>
                
                <div class="info-grid-2col">
                    <div class="info-item">
                        <div class="info-label">トレイ情報 / Thông tin khay</div>
                        <div class="info-value">${jobData.TrayInfo || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">材質 / Chất liệu</div>
                        <div class="info-value">${jobData.Material || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">製品寸法 / Kích thước SP</div>
                        <div class="info-value">${jobData.ProductSize || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">トレイ重量 / KL khay</div>
                        <div class="info-value">${jobData.TrayWeight || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">初回出荷日 / Ngày xuất đầu</div>
                        <div class="info-value">${jobData.FirstShipmentDate || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">別抜き / Dao cắt riêng</div>
                        <div class="info-value">${jobData.SeparateCut || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">見積 / Báo giá</div>
                        <div class="info-value">${jobData.Quotation || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">単価 / Đơn giá</div>
                        <div class="info-value">${jobData.UnitPrice || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">箱の種類 / Loại thùng</div>
                        <div class="info-value">${jobData.BoxType || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">袋詰め / Bọc túi</div>
                        <div class="info-value">${jobData.Bagging || 'N/A'}</div>
                    </div>
                </div>
            </div>
        `;
    }



    /**
     * Section 4: Related Equipment
     */
    renderRelatedEquipment(item, type) {
        let relatedItems = [];

        if (type === 'mold') {
            // Find related cutters from moldcutter table
            relatedItems = this.getRelatedCutters(item.MoldID);
        } else {
            // Find related molds from moldcutter table
            relatedItems = this.getRelatedMolds(item.CutterID);
        }

        if (relatedItems.length === 0) {
            return `
                <div class="modal-section related-equipment-section">
                    <div class="section-title">
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
                <div class="section-title">
                    <i class="fas fa-link"></i>
                    <span class="title-ja">関連機器 (${relatedItems.length})</span>
                    <span class="title-vi">Thiết bị liên quan (${relatedItems.length})</span>
                </div>
                <div class="related-equipment-list">
        `;

        relatedItems.forEach(relItem => {
            const relType = type === 'mold' ? 'cutter' : 'mold';
            const relCode = relType === 'mold' ? relItem.MoldCode : relItem.CutterNo;
            const relName = relItem.displayName || '-';
            const relLocation = relItem.displayLocation || '-';

            html += `
                <div class="related-item" data-item-id="${relItem.MoldID || relItem.CutterID}" data-item-type="${relType}">
                    <div class="related-item-icon">
                        <i class="fas ${relType === 'mold' ? 'fa-cube' : 'fa-cut'}"></i>
                    </div>
                    <div class="related-item-info">
                        <div class="related-item-code">${relCode}</div>
                        <div class="related-item-name">${relName}</div>
                        <div class="related-item-location">
                            <i class="fas fa-map-marker-alt"></i> ${relLocation}
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
                <div class="section-title">
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
                <div class="section-title">
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
                        <span class="btn-label-ja">在庫確認 / </span>
                        <span class="btn-label-vi">Kiểm kê</span>
                    </button>
                    <button class="action-btn btn-inv-relocate" data-action="inventory-relocate">
                        <i class="fas fa-map-marked-alt"></i>
                        <span class="btn-label-ja">位置変更 / </span>
                        <span class="btn-label-vi">Đổi vị trí Kiểm kê</span>
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
                        <span class="btn-label-ja">チェックイン / </span>
                        <span class="btn-label-vi">Check-in</span>
                    </button>
                    <button class="action-btn btn-checkout" data-action="checkout">
                        <i class="fas fa-sign-out-alt"></i>
                        <span class="btn-label-ja">チェックアウト / </span>
                        <span class="btn-label-vi">Check-out</span>
                    </button>
                    <button class="action-btn btn-location" data-action="location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="btn-label-ja">位置更新 / </span>
                        <span class="btn-label-vi">Vị trí giá</span>
                    </button>
                    <button class="action-btn btn-transport" data-action="transport">
                        <i class="fas fa-truck"></i>
                        <span class="btn-label-ja">輸送 / </span>
                        <span class="btn-label-vi">Vận chuyển</span>
                    </button>
                    
                    <!-- Row 2 -->
                    <button class="action-btn btn-teflon" data-action="teflon">
                        <i class="fas fa-shield-alt"></i>
                        <span class="btn-label-ja">テフロン / </span>
                        <span class="btn-label-vi">Teflon</span>
                    </button>
                    <button class="action-btn btn-print" data-action="print">
                        <i class="fas fa-print"></i>
                        <span class="btn-label-ja">印刷 / </span>
                        <span class="btn-label-vi">In ấn</span>
                    </button>
                    <button class="action-btn btn-qrcode" data-action="qrcode">
                        <i class="fas fa-qrcode"></i>
                        <span class="btn-label-ja">QRコード / </span>
                        <span class="btn-label-vi">QR Code</span>
                    </button>
                    <button class="action-btn btn-comments" data-action="comments">
                        <i class="fas fa-comment-alt"></i>
                        <span class="btn-label-ja">コメント / </span>
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
     * Get mold design info from molddesign table
     */
    getMoldDesignInfo(moldID) {
        if (!moldID || !this.data.molddesign) return null;
        
        return this.data.molddesign.find(design => design.MoldID === moldID);
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
     * ========================================
     * BIND RELATED EQUIPMENT LINKS
     * ========================================
     */
    bindRelatedEquipmentLinks() {
        const relatedItems = this.modalContent.querySelectorAll('.related-item');
        
        relatedItems.forEach(item => {
            item.addEventListener('click', () => {
                const itemId = item.dataset.itemId;
                const itemType = item.dataset.itemType;
                
                // Find the related item in data
                const relatedItem = itemType === 'mold' 
                    ? this.data.molds.find(m => m.MoldID === itemId)
                    : this.data.cutters.find(c => c.CutterID === itemId);
                
                if (relatedItem) {
                    // Open detail for related item (replace current modal content)
                    this.show(relatedItem, itemType);
                }
            });
        });

        console.log(`✅ Bound ${relatedItems.length} related equipment links`);
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
