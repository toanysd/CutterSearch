/* ========================================================================
   MOBILE PANEL CONTROLLER R1.3
   ========================================================================
   Quản lý show/hide chi tiết & action buttons trên iPhone
   - Show detail panel khi click result card
   - Bật action buttons
   - Chèn "View full detail" link
   
   Created: 2025-11-07
   Last Updated: 2025-11-07
   ======================================================================== */

class MobilePanelController {
  constructor() {
    this.resultsPanel = document.querySelector('.quick-results-panel');
    this.detailPanel = document.querySelector('.detail-panel');
    // ✅ THÊM: Cache filter panel elements
    this.filterPanel = document.getElementById('mobile-filter-panel');
    this.filterToggle = document.getElementById('mobile-filter-toggle');
    this.filterContent = document.getElementById('mobile-filter-content');
    this.isFilterPanelOpen = false;

    this.isMobile = window.innerWidth < 768;
    
    if (!this.isMobile) {
      console.log('MobilePanelController: Desktop mode - skipping init');
      return;
    }
    
    console.log('MobilePanelController: Mobile mode - initializing');
    this.init();
  }

  init() {
    if (!this.resultsPanel || !this.detailPanel) {
      console.error('MobilePanelController: Required panels not found');
      return;
    }

    // Bước 1: Bind click event cho result cards
    this.bindResultCardClicks();

    // Bước 2: Chèn "View full detail" link vào detail panel
    this.injectViewFullDetailLink();

    // Bước 3: Bind close button event
    this.bindDetailPanelCloseButton();

    // Bước 4: Bind detail header close button (NEW - R6.6.5)
    this.bindDetailHeaderCloseButton();
    
    // Bước 5: Bind detail header view full button (NEW - R6.6.5)
    this.bindDetailHeaderViewFull();

    // Bước 6: Bind filter panel toggle (NEW - R1.4)
    this.bindFilterPanelToggle();

    // Bước 7: Bind exit fullscreen button (NEW - R7.0)
    this.bindExitFullscreenButton();

    // Bước 8: Auto-enter fullscreen on load (NEW - R7.0)
    this.autoEnterFullscreen();

    console.log('✅ MobilePanelController: Fully initialized (with fullscreen support)');
    }


  // ========================================================
  // SỰ KIỆN 1: Click result card → Show detail + Enable actions
  // ========================================================
  bindResultCardClicks() {
    this.resultsPanel.addEventListener('click', (e) => {
      // Tìm result card gần nhất
      const card = e.target.closest('.result-card, [data-id], [data-item-id]');
      
      if (!card) return;

      console.log('Result card clicked:', card.getAttribute('data-id'));

      // **BƯỚC 1A: Hiện detail panel**
      this.showDetailPanel();

      // **BƯỚC 1B: Thu nhỏ results panel**
      this.shrinkResultsPanel();

      // **BƯỚC 1C: Bật action buttons (KÍCH HOẠT)**
      this.enableActionButtons();

      // **BƯỚC 1D: Lưu item ID để action buttons dùng**
      const itemId = card.getAttribute('data-id') || 
                     card.getAttribute('data-item-id') ||
                     card.textContent.split('\n')[0];
      this.setSelectedItemId(itemId);
    });
  }

  // ========================================================
  // HÀM TRỢ GIÚP: Show detail panel
  // ========================================================
  showDetailPanel() {
    this.detailPanel.classList.remove('hidden');
    this.detailPanel.classList.add('show');
    console.log('Detail panel shown');
  }

  // ========================================================
  // HÀM TRỢ GIÚP: Shrink results panel
  // ========================================================
  shrinkResultsPanel() {
    this.resultsPanel.classList.remove('hidden');
    this.resultsPanel.classList.add('shrink');
    console.log('Results panel shrunk');
  }

  // ========================================================
  // HÀM TRỢ GIÚP: Bật tất cả action buttons
  // ========================================================
  enableActionButtons() {
    const actionButtons = document.querySelectorAll('#mobile-action-bar .action-btn');
    actionButtons.forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove('disabled');
      btn.classList.add('enabled');
    });
    console.log('Action buttons enabled:', actionButtons.length);
  }

  // ========================================================
  // HÀM TRỢ GIÚP: Lưu item ID vào DOM
  // ========================================================
  setSelectedItemId(itemId) {
    if (!itemId || itemId.trim() === '') {
      console.warn('Item ID is empty');
      return;
    }

    itemId = itemId.trim();
    document.body.dataset.selectedItemId = itemId;
    document.body.dataset.lastSelectedItemId = itemId;

    // ✅ FIX: Update both iPad panel (separate elements) and iPhone modal (single element)
    
    // 1. Update iPad panel (2 separate badges)
    const ipadItemCode = document.getElementById('modal-item-code');
    if (ipadItemCode) {
      ipadItemCode.textContent = itemId; // MoldID
      ipadItemCode.style.visibility = 'visible';
    }
    
    // 2. Update iPhone modal (combine MoldID + MoldCode in single h2)
    const iphoneModalCode = document.getElementById('detail-item-code');
    if (iphoneModalCode) {
      // Get MoldCode from result card data attribute
      const card = document.querySelector(`.result-card[data-id="${itemId}"]`);
      const moldCode = card?.getAttribute('data-mold-code') || '';
      
      // Display format: "MoldID - MoldCode" hoặc chỉ "MoldID" nếu không có MoldCode
      if (moldCode && moldCode !== itemId) {
        iphoneModalCode.textContent = `${itemId} - ${moldCode}`;
      } else {
        iphoneModalCode.textContent = itemId;
      }
      
      console.log(`✅ Updated modal title: ${iphoneModalCode.textContent}`);
    }

    console.log('Selected item ID:', itemId);
  }


  // ========================================================
  // SỰ KIỆN 2: Chèn "View full detail" link
  // ========================================================
  injectViewFullDetailLink() {
    if (!this.detailPanel) return;

    // Tìm nơi chèn link
    const detailLower = this.detailPanel.querySelector('.detail-lower') ||
                        this.detailPanel.querySelector('.panel-body');
    
    if (!detailLower) {
      console.warn('Detail lower section not found');
      return;
    }

    // Kiểm tra đã chèn chưa
    if (detailLower.querySelector('.view-full-detail-link')) {
      console.log('View full detail link already exists');
      return;
    }

    // TẠO LINK ELEMENT
    const link = document.createElement('a');
    link.className = 'view-full-detail-link';
    link.href = '#';
    
    // TEXT: Song ngữ Nhật-Việt
    link.innerHTML = `
      <span>詳細情報を見る | Xem trang đầy đủ</span>
      <i class="fas fa-arrow-right"></i>
    `;

    // STYLING CSS (Inline để đảm bảo hiệu lực)
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

    // CLICK EVENT: Mở modal detail
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById('mobile-detail-modal');
      if (modal) {
        modal.classList.add('open');
        modal.classList.add('active');
        console.log('Full detail modal opened');
      } else {
        console.warn('Mobile detail modal not found');
      }
    });

    // HOVER EFFECT
    link.addEventListener('mouseenter', () => {
      link.style.background = '#E3F2FD';
    });
    link.addEventListener('mouseleave', () => {
      link.style.background = '#F5F5F5';
    });

    // CHÈN VÀO DETAIL LOWER
    detailLower.appendChild(link);
    console.log('View full detail link injected');
  }

  // ========================================================
  // SỰ KIỆN 3: Close detail panel
  // ========================================================
  bindDetailPanelCloseButton() {
    const header = this.detailPanel.querySelector('.panel-header');
    if (!header) return;

    header.addEventListener('click', (e) => {
      // Nếu click vào area bên phải (close button)
      const clickX = e.clientX - header.getBoundingClientRect().left;
      const headerWidth = header.offsetWidth;
      
      // Nếu click trong 50px bên phải = close button area
      if (clickX > headerWidth - 50) {
        e.stopPropagation();
        this.hideDetailPanel();
      }
    });
  }

  // ========================================================
  // HÀM TRỢ GIÚP: Hide detail panel
  // ========================================================
  hideDetailPanel() {
    // ✅ FIX: Chỉ ẩn trên mobile bằng cách remove 'show', KHÔNG thêm 'hidden'
    this.detailPanel.classList.remove('show');
    this.detailPanel.classList.remove('expanded');
    // ❌ KHÔNG thêm 'hidden' - để CSS media query xử lý
    
    this.resultsPanel.classList.remove('shrink');
    this.resultsPanel.classList.remove('hidden');
    this.resultsPanel.classList.remove('hidden-by-expand');
    console.log('✅ Detail panel closed (mobile only)');
  }


  // ========================================================
  // SỰ KIỆN 4: Close button in detail header
  // ========================================================
  bindDetailHeaderCloseButton() {
    const closeBtn = document.querySelector('.detail-close-btn');
    if (!closeBtn) return;

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideDetailPanel();
    });
  }

  // ========================================================
  // SỰ KIỆN 5: Toggle expand detail panel (NO MODAL)
  // ========================================================
  bindDetailHeaderViewFull() {
    const viewFullLink = document.querySelector('.detail-view-full-link');
    if (!viewFullLink) {
      console.warn('Detail view full link not found');
      return;
    }

    viewFullLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle expand state
      const isExpanded = this.detailPanel.classList.contains('expanded');
      
      if (isExpanded) {
        // Collapse back to normal
        this.collapseDetailPanel();
      } else {
        // Expand to full height
        this.expandDetailPanel();
      }
    });
  }

  // ========================================================
  // HÀM MỚI: Expand detail panel to full height
  // ========================================================
  expandDetailPanel() {
    // Add expanded class to detail panel
    this.detailPanel.classList.add('expanded');
    
    // Hide results panel
    this.resultsPanel.classList.add('hidden-by-expand');
    
    // Update button text and icon
    const link = this.detailPanel.querySelector('.detail-view-full-link span');
    if (link) {
      link.textContent = '縮小'; // "Thu nhỏ" in Japanese
    }
    
    // Change icon from arrow-up to arrow-down
    const icon = this.detailPanel.querySelector('.detail-view-full-link i');
    if (icon) {
      icon.classList.remove('fa-arrow-up');
      icon.classList.add('fa-arrow-down');
    }
    
    console.log('Detail panel expanded to full height');
  }

  // ========================================================
  // HÀM MỚI: Collapse detail panel back to normal
  // ========================================================
  collapseDetailPanel() {
    // Remove expanded class
    this.detailPanel.classList.remove('expanded');
    // Show results panel again
    this.resultsPanel.classList.remove('hidden-by-expand');
    
    // Restore button text and icon
    const link = this.detailPanel.querySelector('.detail-view-full-link span');
    if (link) {
      link.textContent = '詳細'; // "Detail" in Japanese
    }
    
    // Change icon back to arrow-up
    const icon = this.detailPanel.querySelector('.detail-view-full-link i');
    if (icon) {
      icon.classList.remove('fa-arrow-down');
      icon.classList.add('fa-arrow-up');
    }
    
    console.log('Detail panel collapsed to normal size');
  }


  /**
   * ========================================
   * SỰ KIỆN 6: Toggle Filter Panel
   * ========================================
   */
  bindFilterPanelToggle() {
    if (!this.filterToggle) {
      console.warn('MobilePanelController: Filter toggle button not found');
      return;
    }

    this.filterToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFilterPanel();
    });

    console.log('✅ Filter panel toggle bound');
  }

  /**
   * HÀM TRỢ GIÚP: Toggle filter panel
   */
  toggleFilterPanel() {
    if (!this.filterPanel) return;

    this.isFilterPanelOpen = !this.isFilterPanelOpen;

    if (this.isFilterPanelOpen) {
      // Mở filter panel
      this.filterPanel.classList.remove('collapsed');
      if (this.filterContent) {
        this.filterContent.style.display = 'block';
      }
      console.log('✅ Filter panel OPENED');
    } else {
      // Đóng filter panel
      this.filterPanel.classList.add('collapsed');
      if (this.filterContent) {
        this.filterContent.style.display = 'none';
      }
      console.log('✅ Filter panel CLOSED');
   console.log('✅ Filter panel CLOSED');
}
  }

/**
 * ========================================
 * FULLSCREEN API SUPPORT (iOS PWA)
 * ========================================
 */
bindExitFullscreenButton() {
  const exitBtn = document.getElementById('exit-fullscreen-btn');
  if (!exitBtn) {
    console.warn('Exit fullscreen button not found');
    return;
  }

  exitBtn.addEventListener('click', () => {
    this.exitFullscreen();
  });

  console.log('✅ Exit fullscreen button bound');
}

/**
 * Auto-enter fullscreen on page load (mobile only)
 */
autoEnterFullscreen() {
  if (!this.isMobile) return;
  
  // Request fullscreen on first user interaction
  document.addEventListener('click', () => {
    this.enterFullscreen();
  }, { once: true });

  console.log('✅ Auto-fullscreen enabled (on first click)');
}

/**
 * Enter fullscreen mode
 */
enterFullscreen() {
  const elem = document.documentElement;
  
  if (elem.requestFullscreen) {
    elem.requestFullscreen().catch(err => {
      console.warn('Fullscreen request failed:', err);
    });
  } else if (elem.webkitRequestFullscreen) { /* Safari */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE11 */
    elem.msRequestFullscreen();
  }

  console.log('✅ Fullscreen mode entered');
}

/**
 * Exit fullscreen mode
 */
exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) { /* Safari */
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) { /* IE11 */
    document.msExitFullscreen();
        }
      console.log('✅ Filter panel CLOSED');
    }

  /**
   * ========================================
   * FULLSCREEN API SUPPORT (iOS PWA)
   * ========================================
   */
  bindExitFullscreenButton() {
    const exitBtn = document.getElementById('exit-fullscreen-btn');
    if (!exitBtn) {
      console.warn('Exit fullscreen button not found');
      return;
    }

    exitBtn.addEventListener('click', () => {
      this.exitFullscreen();
    });

    console.log('✅ Exit fullscreen button bound');
  }

  /**
   * Auto-enter fullscreen on page load (mobile only)
   */
  autoEnterFullscreen() {
    if (!this.isMobile) return;
    
    // Request fullscreen on first user interaction
    document.addEventListener('click', () => {
      this.enterFullscreen();
    }, { once: true });

    console.log('✅ Auto-fullscreen enabled (on first click)');
  }

  /**
   * Enter fullscreen mode
   */
  enterFullscreen() {
    const elem = document.documentElement;
    
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
    } else if (elem.webkitRequestFullscreen) { /* Safari */
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { /* IE11 */
      elem.msRequestFullscreen();
    }

    console.log('✅ Fullscreen mode entered');
  }

  /**
   * Exit fullscreen mode
   */
  exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
      document.msExitFullscreen();
    }

    console.log('✅ Fullscreen mode exited');
  }
} // ← Đóng class MobilePanelController

// ========================================================
// KHỞI ĐỘNG CONTROLLER
// ========================================================
if (window.innerWidth < 768) {
  window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Initializing MobilePanelController');
    window.mobilePanelController = new MobilePanelController();
  });
} else {
  console.log('Desktop mode - MobilePanelController not loaded');
}

// Export cho nếu cần dùng từ modules khác
if (typeof window !== 'undefined') {
  window.MobilePanelController = MobilePanelController;
}
