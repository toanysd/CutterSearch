/* ========================================================================
   MOBILE PANEL CONTROLLER R7.0 - PHASE 1 OPTIMIZATIONS
   ========================================================================
   
   🎯 MỤC TIÊU | 目的:
   - Quản lý action bar contextual (1 hàng ↔ 2 hàng)
   - Render location badges compact (horizontal pills)
   - Tương thích với mobile-compact-styles-r7.0.css
   
   📋 TÍNH NĂNG MỚI | 新機能:
   ✅ A. Action Bar State Management
      - Default: 1 row (QR / Filter / Settings) - 68px
      - Selected: 2 rows (Location / Check-in / Check-out + More) - 130px
   
   ✅ B. Location Badges Renderer
      - Compact horizontal layout: [B6] - [S2] - [T3]
      - Replace circle badges (50px → 32px height)
   
   ✅ C. Filter Toggle FAB
      - Floating button position control
      - Smooth slide animation
   
   🔒 TƯƠNG THÍCH | 互換性:
   - Base: mobile-controller-r6.9.js
   - Không ảnh hưởng iPad/Desktop
   
   Created: 2025.11.09
   Version: R7.0 Phase 1
   ======================================================================== */

/* ========================================================================
   CLASS: MobilePanelController
   ======================================================================== */

class MobilePanelController {
  
  constructor() {
    // Cache DOM elements
    this.resultsPanel = document.querySelector('.quick-results-panel');
    this.detailPanel = document.querySelector('.detail-panel');
    this.actionBar = document.getElementById('mobile-action-bar');
    this.filterPanel = document.getElementById('mobile-filter-panel');
    this.filterToggle = document.getElementById('mobile-filter-toggle');
    this.filterContent = document.getElementById('mobile-filter-content');
    
    // State tracking
    this.isFilterPanelOpen = false;
    this.isMobile = window.innerWidth < 768;
    this.selectedItemId = null;
    this.selectedItemData = null;
    
    // Exit early if not mobile
    if (!this.isMobile) {
      console.log('MobilePanelController: Desktop mode - skipping init');
      return;
    }
    
    console.log('MobilePanelController R7.0: Mobile mode - initializing');
    this.init();
  }
  
  /* ======================================================================
     INITIALIZATION | 初期化
     ====================================================================== */
  
  init() {
    if (!this.resultsPanel || !this.detailPanel || !this.actionBar) {
      console.error('MobilePanelController: Required elements not found');
      return;
    }
    
    // Step 1: Initialize action bar state
    this.initActionBarState();
    
    // Step 2: Bind result card clicks
    this.bindResultCardClicks();
    
    // Step 3: Bind action button events
    this.bindActionButtons();
    
    // Step 4: Inject view full detail link
    this.injectViewFullDetailLink();
    
    // Step 5: Bind detail panel controls
    this.bindDetailPanelCloseButton();
    this.bindDetailHeaderCloseButton();
    this.bindDetailHeaderViewFull();
    
    // Step 6: Bind filter toggle
    this.bindFilterPanelToggle();
    
    console.log('✅ MobilePanelController R7.0: Fully initialized');
  }
  
  /* ======================================================================
     A. ACTION BAR STATE MANAGEMENT | アクションバー状態管理
     ====================================================================== */
  
  /**
   * Initialize action bar to default state (no item selected)
   */
  initActionBarState() {
    if (!this.actionBar) return;
    
    // Set to default state: Single row (68px)
    this.actionBar.classList.remove('item-selected');
    document.body.classList.remove('action-bar-expanded');
    
    // Render default buttons (Row 1: QR / Filter / Settings)
    this.renderDefaultActionButtons();
    
    // Hide Row 2
    const row2 = this.actionBar.querySelector('.action-row-2');
    if (row2) {
      row2.style.display = 'none';
    }
    
    console.log('Action bar initialized to default state (68px)');
  }
  
  /**
   * Switch to item selected state (2 rows, 130px)
   */
  switchToSelectedState(itemData) {
    if (!this.actionBar) return;
    
    this.selectedItemData = itemData;
    
    // Add selected state classes
    this.actionBar.classList.add('item-selected');
    document.body.classList.add('action-bar-expanded');
    
    // Update Row 1: Main actions (Location / Check-in / Check-out)
    this.renderMainActionButtons(itemData);
    
    // Show Row 2: Secondary actions (Shipment / Teflon / Comment)
    this.renderSecondaryActionButtons(itemData);
    const row2 = this.actionBar.querySelector('.action-row-2');
    if (row2) {
      row2.style.display = 'grid';
    }
    
    console.log('Action bar switched to selected state (130px)');
  }
  
  /**
   * Switch back to default state
   */
  switchToDefaultState() {
    if (!this.actionBar) return;
    
    this.selectedItemData = null;
    this.selectedItemId = null;
    
    // Remove selected state classes
    this.actionBar.classList.remove('item-selected');
    document.body.classList.remove('action-bar-expanded');
    
    // Restore default buttons
    this.renderDefaultActionButtons();
    
    // Hide Row 2
    const row2 = this.actionBar.querySelector('.action-row-2');
    if (row2) {
      row2.style.display = 'none';
    }
    
    console.log('Action bar restored to default state (68px)');
  }
  
  /* ======================================================================
     A1. RENDER ACTION BUTTONS | ボタンレンダリング
     ====================================================================== */
  
  /**
   * Render default action buttons (Row 1: QR / Filter / Settings)
   */
  renderDefaultActionButtons() {
    const row1 = this.actionBar.querySelector('.action-row-1');
    if (!row1) return;
    
    row1.innerHTML = `
      <!-- QR Scan Button -->
      <button class="action-btn action-qr-scan" data-action="qr-scan">
        <i class="fas fa-qrcode"></i>
        <span>QR<br>スキャン</span>
      </button>
      
      <!-- Filter Toggle Button -->
      <button class="action-btn action-filter-toggle" data-action="filter">
        <i class="fas fa-filter"></i>
        <span>フィルタ<br>Lọc</span>
      </button>
      
      <!-- Settings Button -->
      <button class="action-btn action-settings" data-action="settings">
        <i class="fas fa-cog"></i>
        <span>設定<br>Cài đặt</span>
      </button>
    `;
    
    // Rebind click events
    this.bindActionButtonsInRow(row1);
  }
  
  /**
   * Render main action buttons (Row 1: Location / Check-in / Check-out)
   */
  renderMainActionButtons(itemData) {
    const row1 = this.actionBar.querySelector('.action-row-1');
    if (!row1) return;
    
    const itemId = itemData?.MoldID || this.selectedItemId || 'N/A';
    
    row1.innerHTML = `
      <!-- Location Button -->
      <button class="action-btn action-location enabled" data-action="location" data-item-id="${itemId}">
        <i class="fas fa-map-marker-alt"></i>
        <span>位置<br>Vị trí</span>
      </button>
      
      <!-- Check-in Button -->
      <button class="action-btn action-checkin enabled" data-action="checkin" data-item-id="${itemId}">
        <i class="fas fa-sign-in-alt"></i>
        <span>入庫<br>Nhập</span>
      </button>
      
      <!-- Check-out Button -->
      <button class="action-btn action-checkout enabled" data-action="checkout" data-item-id="${itemId}">
        <i class="fas fa-sign-out-alt"></i>
        <span>出庫<br>Xuất</span>
      </button>
    `;
    
    // Rebind click events
    this.bindActionButtonsInRow(row1);
  }
  
  /**
   * Render secondary action buttons (Row 2: Shipment / Teflon / Comment)
   */
  renderSecondaryActionButtons(itemData) {
    const row2 = this.actionBar.querySelector('.action-row-2');
    if (!row2) return;
    
    const itemId = itemData?.MoldID || this.selectedItemId || 'N/A';
    
    row2.innerHTML = `
      <!-- Shipment Button -->
      <button class="action-btn action-shipment enabled" data-action="shipment" data-item-id="${itemId}">
        <i class="fas fa-truck"></i>
        <span>出荷<br>Xuất hàng</span>
      </button>
      
      <!-- Teflon Button -->
      <button class="action-btn action-teflon enabled" data-action="teflon" data-item-id="${itemId}">
        <i class="fas fa-flask"></i>
        <span>テフロン<br>Teflon</span>
      </button>
      
      <!-- Comment Button -->
      <button class="action-btn action-comment enabled" data-action="comment" data-item-id="${itemId}">
        <i class="fas fa-comment-alt"></i>
        <span>コメント<br>Comment</span>
      </button>
    `;
    
    // Rebind click events
    this.bindActionButtonsInRow(row2);
  }
  
  /**
   * Bind click events for buttons in a row
   */
  bindActionButtonsInRow(row) {
    const buttons = row.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        const itemId = btn.getAttribute('data-item-id');
        this.handleActionButtonClick(action, itemId);
      });
    });
  }
  
  /**
   * Bind all action buttons (legacy support)
   */
  bindActionButtons() {
    if (!this.actionBar) return;
    
    this.actionBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.action-btn');
      if (!btn || btn.classList.contains('disabled')) return;
      
      const action = btn.getAttribute('data-action');
      const itemId = btn.getAttribute('data-item-id') || this.selectedItemId;
      
      e.preventDefault();
      this.handleActionButtonClick(action, itemId);
    });
  }
  
  /**
   * Handle action button click
   */
  handleActionButtonClick(action, itemId) {
    console.log(`Action clicked: ${action}, Item: ${itemId}`);
    
    switch (action) {
      case 'qr-scan':
        this.handleQRScan();
        break;
      case 'filter':
        this.toggleFilterPanel();
        break;
      case 'settings':
        this.handleSettings();
        break;
      case 'location':
        this.handleLocation(itemId);
        break;
      case 'checkin':
        this.handleCheckIn(itemId);
        break;
      case 'checkout':
        this.handleCheckOut(itemId);
        break;
      case 'shipment':
        this.handleShipment(itemId);
        break;
      case 'teflon':
        this.handleTeflon(itemId);
        break;
      case 'comment':
        this.handleComment(itemId);
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }
  
  /* ======================================================================
     A2. ACTION HANDLERS | アクションハンドラー
     ====================================================================== */
  
  handleQRScan() {
    console.log('QR Scan triggered');
    // TODO: Implement QR scanning logic
    alert('QR Scanner will be implemented');
  }
  
  handleSettings() {
    console.log('Settings triggered');
    // TODO: Implement settings logic
    alert('Settings panel will be implemented');
  }
  
  handleLocation(itemId) {
    console.log(`Location action for item: ${itemId}`);
    // Trigger existing location modal
    const locationModal = document.getElementById('location-modal');
    if (locationModal) {
      locationModal.classList.add('show');
    } else {
      alert(`View location for ${itemId}`);
    }
  }
  
  handleCheckIn(itemId) {
    console.log(`Check-in action for item: ${itemId}`);
    // Trigger existing check-in modal
    const checkinModal = document.getElementById('checkin-modal');
    if (checkinModal) {
      checkinModal.classList.add('show');
    } else {
      alert(`Check-in ${itemId}`);
    }
  }
  
  handleCheckOut(itemId) {
    console.log(`Check-out action for item: ${itemId}`);
    // Trigger existing check-out modal
    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal) {
      checkoutModal.classList.add('show');
    } else {
      alert(`Check-out ${itemId}`);
    }
  }
  
  handleShipment(itemId) {
    console.log(`Shipment action for item: ${itemId}`);
    const shipmentModal = document.getElementById('shipment-modal');
    if (shipmentModal) {
      shipmentModal.classList.add('show');
    } else {
      alert(`Shipment for ${itemId}`);
    }
  }
  
  handleTeflon(itemId) {
    console.log(`Teflon action for item: ${itemId}`);
    const teflonModal = document.getElementById('teflon-modal');
    if (teflonModal) {
      teflonModal.classList.add('show');
    } else {
      alert(`Teflon coating for ${itemId}`);
    }
  }
  
  handleComment(itemId) {
    console.log(`Comment action for item: ${itemId}`);
    const commentModal = document.getElementById('comment-modal');
    if (commentModal) {
      commentModal.classList.add('show');
    } else {
      alert(`Add comment for ${itemId}`);
    }
  }
  
  /* ======================================================================
     B. RESULT CARD CLICKS | カードクリック処理
     ====================================================================== */
  
  bindResultCardClicks() {
    if (!this.resultsPanel) return;
    
    this.resultsPanel.addEventListener('click', (e) => {
      // Find closest result card
      const card = e.target.closest('.result-card, [data-id], [data-item-id]');
      if (!card) return;
      
      // Get item data
      const itemId = card.getAttribute('data-id') || 
                     card.getAttribute('data-item-id') ||
                     card.querySelector('.item-code')?.textContent.trim();
      
      const itemType = card.getAttribute('data-type') || 'mold';
      
      console.log(`Result card clicked: ${itemId} (${itemType})`);
      
      // Create item data object
      const itemData = {
        MoldID: itemId,
        Type: itemType,
        // Add more data from card if available
        MoldCode: card.getAttribute('data-mold-code') || '',
        Dimensions: card.querySelector('.dimension')?.textContent || '',
      };
      
      // Store selected item
      this.selectedItemId = itemId;
      this.selectedItemData = itemData;
      
      // Update UI
      this.showDetailPanel();
      this.shrinkResultsPanel();
      this.switchToSelectedState(itemData);
      
      // Render location badges if detail panel visible
      setTimeout(() => {
        this.renderLocationBadgesCompact(itemData);
      }, 100);
    });
  }
  
  /* ======================================================================
     C. LOCATION BADGES COMPACT RENDERER | ロケーションバッジレンダー
     ====================================================================== */
  
  /**
   * Render location badges in compact horizontal format
   * Format: [B6] - [S2] - [T3]
   */
  renderLocationBadgesCompact(itemData) {
    // Find detail panel upper section
    const detailUpper = this.detailPanel.querySelector('.detail-upper');
    if (!detailUpper) {
      console.warn('Detail upper section not found');
      return;
    }
    
    // Check if compact location already exists
    let locationCompact = detailUpper.querySelector('.location-compact');
    
    // Create if doesn't exist
    if (!locationCompact) {
      locationCompact = document.createElement('div');
      locationCompact.className = 'location-compact';
      
      // Insert after company badge or at beginning
      const companyBadge = detailUpper.querySelector('.company-badge');
      if (companyBadge) {
        companyBadge.after(locationCompact);
      } else {
        detailUpper.prepend(locationCompact);
      }
    }
    
    // Extract location data
    const rackNumber = itemData?.RackNumber || 
                       this.selectedItemData?.RackNumber || 
                       document.querySelector('[data-field="RackNumber"]')?.textContent || 
                       '?';
    
    const rackSection = itemData?.RackSection || 
                        this.selectedItemData?.RackSection || 
                        document.querySelector('[data-field="RackSection"]')?.textContent || 
                        '?';
    
    const rackLayer = itemData?.RackLayer || 
                      this.selectedItemData?.RackLayer || 
                      document.querySelector('[data-field="RackLayer"]')?.textContent || 
                      '?';
    
    // Determine badge classes
    const rackClass = (rackNumber && rackNumber !== '?' && rackNumber !== 'N/A') ? 'rack' : 'empty';
    const sectionClass = (rackSection && rackSection !== '?' && rackSection !== 'N/A') ? 'section' : 'empty';
    const layerClass = (rackLayer && rackLayer !== '?' && rackLayer !== 'N/A') ? 'layer' : 'empty';
    
    // Render HTML
    locationCompact.innerHTML = `
      <i class="fas fa-map-marker-alt location-icon"></i>
      <span class="location-badge ${rackClass}">${rackNumber}</span>
      <span class="location-separator">-</span>
      <span class="location-badge ${sectionClass}">${rackSection}</span>
      <span class="location-separator">-</span>
      <span class="location-badge ${layerClass}">${rackLayer}</span>
    `;
    
    console.log(`Location badges rendered: [${rackNumber}] - [${rackSection}] - [${rackLayer}]`);
  }
  
  /* ======================================================================
     D. DETAIL PANEL CONTROLS | 詳細パネル制御
     ====================================================================== */
  
  showDetailPanel() {
    if (!this.detailPanel) return;
    this.detailPanel.classList.remove('hidden');
    this.detailPanel.classList.add('show');
    console.log('Detail panel shown');
  }
  
  hideDetailPanel() {
    if (!this.detailPanel) return;
    this.detailPanel.classList.remove('show', 'expanded');
    this.resultsPanel.classList.remove('shrink', 'hidden', 'hidden-by-expand');
    
    // Switch action bar back to default state
    this.switchToDefaultState();
    
    console.log('Detail panel closed');
  }
  
  shrinkResultsPanel() {
    if (!this.resultsPanel) return;
    this.resultsPanel.classList.remove('hidden');
    this.resultsPanel.classList.add('shrink');
    console.log('Results panel shrunk');
  }
  
  bindDetailPanelCloseButton() {
    const header = this.detailPanel?.querySelector('.panel-header');
    if (!header) return;
    
    header.addEventListener('click', (e) => {
      const clickX = e.clientX - header.getBoundingClientRect().left;
      const headerWidth = header.offsetWidth;
      
      // Click in right 50px = close button area
      if (clickX > headerWidth - 50) {
        e.stopPropagation();
        this.hideDetailPanel();
      }
    });
  }
  
  bindDetailHeaderCloseButton() {
    const closeBtn = document.querySelector('.detail-close-btn');
    if (!closeBtn) return;
    
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideDetailPanel();
    });
  }
  
  bindDetailHeaderViewFull() {
    const viewFullLink = document.querySelector('.detail-view-full-link');
    if (!viewFullLink) return;
    
    viewFullLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const isExpanded = this.detailPanel.classList.contains('expanded');
      if (isExpanded) {
        this.collapseDetailPanel();
      } else {
        this.expandDetailPanel();
      }
    });
  }
  
  expandDetailPanel() {
    this.detailPanel.classList.add('expanded');
    this.resultsPanel.classList.add('hidden-by-expand');
    
    const link = this.detailPanel.querySelector('.detail-view-full-link span');
    if (link) link.textContent = '縮小';
    
    const icon = this.detailPanel.querySelector('.detail-view-full-link i');
    if (icon) {
      icon.classList.remove('fa-arrow-up');
      icon.classList.add('fa-arrow-down');
    }
    
    console.log('Detail panel expanded');
  }
  
  collapseDetailPanel() {
    this.detailPanel.classList.remove('expanded');
    this.resultsPanel.classList.remove('hidden-by-expand');
    
    const link = this.detailPanel.querySelector('.detail-view-full-link span');
    if (link) link.textContent = '詳細';
    
    const icon = this.detailPanel.querySelector('.detail-view-full-link i');
    if (icon) {
      icon.classList.remove('fa-arrow-down');
      icon.classList.add('fa-arrow-up');
    }
    
    console.log('Detail panel collapsed');
  }
  
  injectViewFullDetailLink() {
    if (!this.detailPanel) return;
    
    const detailLower = this.detailPanel.querySelector('.detail-lower') ||
                        this.detailPanel.querySelector('.panel-body');
    if (!detailLower) return;
    
    // Check if already exists
    if (detailLower.querySelector('.view-full-detail-link')) return;
    
    const link = document.createElement('a');
    link.className = 'view-full-detail-link';
    link.href = '#';
    link.innerHTML = `
      <i class="fas fa-arrow-up"></i>
      詳細情報を見る | Xem trang đầy đủ
    `;
    
    link.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      padding: 12px 16px;
      margin-top: 12px;
      background: #F5F5F5;
      color: #1976D2;
      font-weight: 600;
      font-size: 13px;
      border-top: 1px solid #E5E7EB;
      cursor: pointer;
      transition: all 0.2s ease-out;
      border-radius: 6px;
      text-decoration: none;
    `;
    
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById('mobile-detail-modal');
      if (modal) {
        modal.classList.add('open', 'active');
      }
    });
    
    link.addEventListener('mouseenter', () => {
      link.style.background = '#E3F2FD';
    });
    
    link.addEventListener('mouseleave', () => {
      link.style.background = '#F5F5F5';
    });
    
    detailLower.appendChild(link);
    console.log('View full detail link injected');
  }
  
  /* ======================================================================
     E. FILTER PANEL TOGGLE | フィルタパネル切替
     ====================================================================== */
  
  bindFilterPanelToggle() {
    if (!this.filterToggle) {
      console.warn('Filter toggle button not found');
      return;
    }
    
    this.filterToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFilterPanel();
    });
    
    console.log('Filter panel toggle bound');
  }
  
  toggleFilterPanel() {
    if (!this.filterPanel) return;
    
    this.isFilterPanelOpen = !this.isFilterPanelOpen;
    
    if (this.isFilterPanelOpen) {
      // Open filter panel
      this.filterPanel.classList.add('show');
      this.filterToggle?.classList.add('active');
      if (this.filterContent) {
        this.filterContent.style.display = 'block';
      }
      console.log('Filter panel opened');
    } else {
      // Close filter panel
      this.filterPanel.classList.remove('show');
      this.filterToggle?.classList.remove('active');
      if (this.filterContent) {
        this.filterContent.style.display = 'none';
      }
      console.log('Filter panel closed');
    }
  }
  
} /* End class MobilePanelController */

/* ========================================================================
   INITIALIZATION | 初期化
   ======================================================================== */

if (window.innerWidth < 768) {
  window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Initializing MobilePanelController R7.0');
    window.mobilePanelController = new MobilePanelController();
  });
} else {
  console.log('Desktop mode - MobilePanelController R7.0 not loaded');
}

// Export for module usage
if (typeof window !== 'undefined') {
  window.MobilePanelController = MobilePanelController;
}

/* ========================================================================
   END OF MOBILE PANEL CONTROLLER R7.0 - PHASE 1
   ======================================================================== */

/**
 * ========================================================================
 * SUMMARY | 概要
 * ========================================================================
 * 
 * TÍNH NĂNG MỚI | 新機能:
 * ├─ Action Bar Contextual:
 * │  ├─ Default state: 1 row (68px) - QR / Filter / Settings
 * │  ├─ Selected state: 2 rows (130px) - Main + Secondary actions
 * │  └─ Dynamic button rendering based on item selection
 * 
 * ├─ Location Badges Compact:
 * │  ├─ Horizontal pills layout: [B6] - [S2] - [T3]
 * │  ├─ Color-coded: Blue (Rack) / Orange (Section) / Green (Layer)
 * │  └─ Height: 32px (từ 74px circle layout)
 * 
 * └─ Filter Toggle FAB:
 *    ├─ Floating button (top-right corner)
 *    ├─ Smooth slide animation
 *    └─ Active state indicator
 * 
 * TƯƠNG THÍCH | 互換性:
 * ├─ Base: R6.9 (100% backward compatible)
 * ├─ CSS: mobile-compact-styles-r7.0.css
 * └─ Mobile only: ≤767px viewport
 * 
 * TIẾT KIỆM KHÔNG GIAN | スペース節約:
 * ├─ Action bar: 130px → 68px (default) = -62px
 * ├─ Location badges: 74px → 32px = -42px
 * └─ Tổng: +104px nội dung khi chưa chọn item
 * 
 * ========================================================================
 */
