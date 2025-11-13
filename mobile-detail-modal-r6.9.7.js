/* ========================================================================
   MOBILE DETAIL MODAL CONTROLLER R6.9.3
   ========================================================================
   Full-screen detail modal for iPhone with comprehensive information
   
   Features:
   - Full-screen popup with all mold/cutter details
   - Integrated action buttons (Location, Check-in, Status, Comments)
   - Related equipment links (open equipment detail in same modal)
   - POS-style location display
   - CSV data integration (molds, cutters, molddesign, jobs, employees, racklayers)
   - Compatible with iPhone, no impact on iPad
   
   Created: 2025-11-10
   Last Updated: 2025-11-10
   ======================================================================== */

class MobileDetailModal {
    constructor() {
        this.modal = null;
        this.modalContent = null;
        this.modalBody = null;
        this.currentItem = null;
        this.currentItemType = null; // 'mold' or 'cutter'
        this.isMobile = window.innerWidth < 768;
        
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
        if (!this.isMobile) {
            console.log('Not mobile - MobileDetailModal disabled');
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

        // Section 1: POS-Style Location Display
        html += this.renderLocationSection(item, type);

        // Section 2: Basic Information
        html += this.renderBasicInfo(item, type);

        // Section 3: Technical Information
        html += this.renderTechnicalInfo(item, type);

        // Section 4: Related Equipment
        html += this.renderRelatedEquipment(item, type);

        // Section 5: Status & Notes
        html += this.renderStatusNotes(item, type);

        // Section 6: Additional Data (Jobs, Design, etc.)
        html += this.renderAdditionalData(item, type);

        this.modalContent.innerHTML = html;

        // Bind related equipment links
        this.bindRelatedEquipmentLinks();
    }

    /**
     * Section 1: POS-Style Location Display
     */
    renderLocationSection(item, type) {
        const location = item.displayLocation || item.RackLayerID || '未設定';
        const code = type === 'mold' ? (item.MoldCode || item.displayCode) : (item.CutterNo || item.displayCode);
        const customer = item.displayCustomer || item.customerInfo?.CustomerName || '-';
        const company = item.storageCompanyInfo?.CompanyName || item.storageCompany || '-';

        return `
            <div class="modal-section pos-location-section">
                <div class="pos-header">
                    <div class="pos-header-ja">現在の保管位置</div>
                    <div class="pos-header-vi">Vị trí lưu trữ hiện tại</div>
                </div>
                
                <div class="pos-location-card">
                    <div class="pos-location-main">
                        <div class="location-label">
                            <span class="label-ja">棚位置</span>
                            <span class="label-vi">Vị trí</span>
                        </div>
                        <div class="location-value">${location}</div>
                        
                        <div class="location-meta">
                            <div class="meta-item">
                                <span class="meta-label">コード / Mã:</span>
                                <span class="meta-value">${code}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">会社 / Công ty:</span>
                                <span class="meta-value">${company}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">顧客 / Khách hàng:</span>
                                <span class="meta-value">${customer}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="pos-location-icon">
                        <i class="fas fa-warehouse"></i>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Section 2: Basic Information
     */
    renderBasicInfo(item, type) {
        const fields = type === 'mold' ? [
            { label: '金型コード / Mã khuôn', value: item.MoldCode || '-' },
            { label: '金型ID', value: item.MoldID || '-' },
            { label: '名称 / Tên', value: item.displayName || '-' },
            { label: 'サイズ / Kích thước', value: item.displayDimensions || '-' },
            { label: '顧客 / Khách hàng', value: item.displayCustomer || '-' },
            { label: 'トレイ情報 / Thông tin khay', value: item.TrayInfo || '-' }
        ] : [
            { label: '抜型No / Mã dao cắt', value: item.CutterNo || '-' },
            { label: '抜型ID', value: item.CutterID || '-' },
            { label: '名称 / Tên', value: item.displayName || '-' },
            { label: 'カットライン寸法 / Kích thước cắt', value: item.cutlineSize || '-' },
            { label: 'ブレード数 / Số lưỡi', value: item.BladeCount || item.bladeCount || '-' },
            { label: 'カッタータイプ / Loại dao', value: item.CutterType || item.cutterType || '-' }
        ];

        let html = `
            <div class="modal-section basic-info-section">
                <div class="section-title">
                    <i class="fas fa-info-circle"></i>
                    <span class="title-ja">基本情報</span>
                    <span class="title-vi">Thông tin cơ bản</span>
                </div>
                <div class="info-grid">
        `;

        fields.forEach(field => {
            html += `
                <div class="info-row">
                    <div class="info-label">${field.label}</div>
                    <div class="info-value">${field.value}</div>
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
     * Section 3: Technical Information
     */
    renderTechnicalInfo(item, type) {
        let fields = [];

        if (type === 'mold') {
            // Get design info from molddesign table
            const designInfo = item.designInfo || this.getMoldDesignInfo(item.MoldID);
            
            fields = [
                { label: '図面番号 / Số bản vẽ', value: designInfo?.DrawingNumber || item.drawingNumber || '-' },
                { label: '設備コード / Mã thiết bị', value: designInfo?.EquipmentCode || item.equipmentCode || '-' },
                { label: 'プラスチック材料 / Loại nhựa', value: designInfo?.DesignForPlasticType || item.plasticType || '-' },
                { label: '金型セットアップ / Loại setup', value: designInfo?.MoldSetupType || '-' },
                { label: '枚数 / Số miếng', value: designInfo?.PieceCount || '-' },
                { label: 'カットライン / Cutline', value: designInfo?.CutlineX && designInfo?.CutlineY ? `${designInfo.CutlineX} x ${designInfo.CutlineY}` : '-' },
                { label: 'テキスト / Nội dung', value: designInfo?.TextContent || '-' },
                { label: '製造日 / Ngày sản xuất', value: designInfo?.ManufacturingDate || '-' }
            ];
        } else {
            fields = [
                { label: 'プラスチックカットタイプ / Loại cắt', value: item.PlasticCutType || item.plasticCutType || '-' },
                { label: 'カッタータイプ / Loại dao', value: item.CutterType || item.cutterType || '-' },
                { label: 'カットライン長さ / Chiều dài', value: item.CutlineLength || '-' },
                { label: 'カットライン幅 / Chiều rộng', value: item.CutlineWidth || '-' },
                { label: 'ブレード数 / Số lưỡi', value: item.BladeCount || item.bladeCount || '-' }
            ];
        }

        let html = `
            <div class="modal-section technical-info-section">
                <div class="section-title">
                    <i class="fas fa-cogs"></i>
                    <span class="title-ja">技術情報</span>
                    <span class="title-vi">Thông tin kỹ thuật</span>
                </div>
                <div class="info-grid">
        `;

        fields.forEach(field => {
            html += `
                <div class="info-row">
                    <div class="info-label">${field.label}</div>
                    <div class="info-value">${field.value}</div>
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
     * ========================================
     * RENDER ACTION BUTTONS
     * ========================================
     */

    renderActionButtons() {
        if (!this.currentItem) return;

        const invOn = !!window.InventoryState?.active;

        if (invOn) {
            // ✅ R6.9.5: Chế độ kiểm kê - chỉ hiển thị 2 nút
            this.modalActions.innerHTML = `
                <div class="action-buttons-grid inventory-mode">
                    <button class="action-btn btn-inv-audit" data-action="inventory-audit">
                        <i class="fas fa-clipboard-check"></i>
                        <span class="btn-label-ja">棚卸</span>
                        <span class="btn-label-vi">Kiểm kê</span>
                    </button>
                    
                    <button class="action-btn btn-inv-relocate" data-action="inventory-relocate">
                        <i class="fas fa-map-marked-alt"></i>
                        <span class="btn-label-ja">位置変更＋棚卸</span>
                        <span class="btn-label-vi">Đổi vị trí + Kiểm kê</span>
                    </button>
                </div>
            `;
        } else {
            // Chế độ thường - hiển thị 4 nút cũ
            this.modalActions.innerHTML = `
                <div class="action-buttons-grid">
                    <button class="action-btn btn-location" data-action="location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="btn-label-ja">位置更新</span>
                        <span class="btn-label-vi">Vị trí</span>
                    </button>
                    
                    <button class="action-btn btn-checkin" data-action="checkin">
                        <i class="fas fa-clipboard-check"></i>
                        <span class="btn-label-ja">入出庫</span>
                        <span class="btn-label-vi">Nhập/Xuất</span>
                    </button>
                    
                    <button class="action-btn btn-status" data-action="status">
                        <i class="fas fa-cog"></i>
                        <span class="btn-label-ja">状態</span>
                        <span class="btn-label-vi">Trạng thái</span>
                    </button>
                    
                    <button class="action-btn btn-comments" data-action="comments">
                        <i class="fas fa-comment-alt"></i>
                        <span class="btn-label-ja">備考</span>
                        <span class="btn-label-vi">Ghi chú</span>
                    </button>
                </div>
            `;
        }
        
        // ✅ THÊM listener cho nút kiểm kê
        setTimeout(() => {
        const inventoryBtn = this.modalActions.querySelector('.btn-confirm-inventory');
        if (inventoryBtn) {
            inventoryBtn.addEventListener('click', () => this.handleInventoryAudit());
            console.log('✅ Inventory button bound');
        }
        }, 100);
        
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
