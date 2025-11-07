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

    console.log('MobilePanelController: Fully initialized');
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

      // đồng bộ nhãn loại vào header
      const typeBadgeEl = this.detailPanel?.querySelector('.panel-header .item-type-badge');
      const cardType = card.getAttribute('data-type');
      if (typeBadgeEl && cardType) typeBadgeEl.textContent = cardType;

            // ✅ Update tiêu đề "詳細情報" nếu rỗng
      const titleEl = this.detailPanel?.querySelector('.detail-title');
      if (titleEl && !titleEl.textContent.trim()) {
        titleEl.textContent = '詳細情報';
      }

      // ✅ Update MoldCode badge (NEW)
      const moldCodeBadge = this.detailPanel?.querySelector('.detail-moldcode-badge');
      if (moldCodeBadge) {
        const moldCode = card.getAttribute('data-mold-code') || '';
        if (moldCode && moldCode !== itemId) {
          moldCodeBadge.textContent = moldCode;
          moldCodeBadge.style.display = 'inline-block';
          moldCodeBadge.style.visibility = 'visible';
        } else {
          // Ẩn badge nếu không có hoặc trùng MoldID
          moldCodeBadge.style.display = 'none';
        }
      }


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
    
    console.log('Setting item ID:', itemId);
    
    // Tìm theo nhiều selector để đảm bảo tương thích
    const selectors = [
      '#detail-item-code',
      '.detail-item-code',
      '.panel-header .item-code',
      '.detail-header-left .detail-item-code'
    ];
    
    let updated = false;
    for (const selector of selectors) {
      const element = this.detailPanel?.querySelector(selector);
      if (element) {
        element.textContent = itemId;
        element.style.visibility = 'visible';
        element.style.display = 'inline-block';
        console.log('✅ Updated via selector:', selector);
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      console.error('❌ Cannot find any item-code element!');
    }
    
    window.selectedItemId = itemId;
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
    // chỉ trả panel về trạng thái mặc định, KHÔNG dùng 'hidden' toàn cục
    this.detailPanel.classList.remove('show', 'expanded');
    // mở lại results panel nếu đang thu nhỏ/ẩn do expand
    this.resultsPanel.classList.remove('shrink', 'hidden', 'hidden-by-expand');
    console.log('Detail panel hidden (mobile scope), results expanded');
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

  
}

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

// mobile-controller-r1.4.js
function initMobileActionBar() {
  const q = (sel) => document.querySelector(sel);
  const getCurrent = () => window.UIRenderer?.state?.currentDetailItem ?? window.currentDetailItem;

  const onRequireItem = () => {
    const item = getCurrent();
    if (!item?.MoldID && !item?.CutterID) { alert('Vui lòng chọn mục trước'); return null; }
    return item;
  };

  const btnLoc  = q('.action-location');
  const btnIn   = q('.action-checkin');
  const btnOut  = q('.action-checkout');

  if (btnLoc)  btnLoc.addEventListener('click', () => {
    const item = onRequireItem(); if (!item) return;
    if (window.LocationManager?.openModal) window.LocationManager.openModal('location', item);
    else if (window.LocationUpdate?.openModal) window.LocationUpdate.openModal(item);
  });

  if (btnIn)   btnIn.addEventListener('click', () => {
    const item = onRequireItem(); if (!item) return;
    if (window.CheckInOut?.openModal) window.CheckInOut.openModal('check-in', item);
  });

  if (btnOut)  btnOut.addEventListener('click', () => {
    const item = onRequireItem(); if (!item) return;
    if (window.CheckInOut?.openModal) window.CheckInOut.openModal('check-out', item);
  });

  // Đồng bộ biến toàn cục khi item thay đổi
  document.addEventListener('detailchanged', (e) => { window.currentDetailItem = e.detail?.item; });
}

// Gọi khi DOM ready hoặc sau khi MobilePanelController khởi tạo
document.addEventListener('DOMContentLoaded', () => { initMobileActionBar(); });

