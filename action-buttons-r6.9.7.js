/**
 * action-buttons.js V6.9
 * ===================================================
 * Bind events cho các nút action trong cột 4
 * Tương thích với HTML structure hiện tại
 * ===================================================
 */

(function() {
  'use strict';

  let currentItem = null;
  let currentType = null;

  function initActionButtons() {
    console.log('[ActionButtons] Initializing...');

    // Lắng nghe detail:changed để track item đang được chọn
    document.addEventListener('detail:changed', (e) => {
      if (e.detail && e.detail.item) {
        currentItem = e.detail.item;
        currentType = e.detail.itemType;
        console.log('[ActionButtons] Current item:', currentItem.displayCode);
      }
    });

    // ============================================
    // DETECT DEVICE TYPE
    // ============================================
    const isMobile = window.innerWidth < 768;
    
    // ============================================
    // BIND BUTTONS FOR iPAD (default area)
    // ============================================
    bindAllActionButtons('');

   
    // ============================================
    // BIND BUTTONS FOR iPHONE (mobile area)
    // ============================================
    if (isMobile) {
      // Check if mobile action buttons exist
      const mobileActionArea = document.querySelector('.mobile-action-buttons');
      if (mobileActionArea) {
        console.log('[ActionButtons] Mobile mode detected - binding mobile buttons');
        bindAllActionButtons('.mobile-action-buttons');
      }
    }
    
    

    // Initial update
    updateInventoryButtonLabels();
    // Listen for mode changes
    document.addEventListener('inventory:modeChanged', () => {
        updateInventoryButtonLabels();
    });
    console.log('[ActionButtons] ✅ All buttons bound successfully');
  }

  // ✅ MOVED OUT: Update button labels based on mode
  function updateInventoryButtonLabels() {
      const isActive = !!window.InventoryState?.active;
      
      ['#btn-location', '#mobile-btn-location'].forEach(sel => {
          const btn = document.querySelector(sel);
          if (!btn) return;
          
          const jp = btn.querySelector('.btn-label-ja');
          const vi = btn.querySelector('.btn-label-vi');
          
          if (isActive) {
              // Mode ON → "位置" (Location)
              if (jp) jp.textContent = '位置';
              if (vi) vi.textContent = 'Vị trí';
          } else {
              // Mode OFF → "棚卸設定" (Settings)
              if (jp) jp.textContent = '棚卸設定';
              if (vi) vi.textContent = 'Thiết lập';
          }
      });
  }

  // ============================================
  // HELPER: Validate item selection
  // ============================================
  function validateSelection() {
    // ✅ FIX: Kiểm tra xem có đang ở bulk mode không
    const isBulkMode = window.InventoryState?.bulkMode || false;

      if (isBulkMode) {
      // ✅ Bulk mode: Không cần validate (xử lý hàng loạt)
      return true;
      }

      // ✅ Normal mode: Cần chọn item
      if (!currentItem) {
      alert('項目を選択してください\nVui lòng chọn khuôn hoặc dao cắt trước');
      return false;
      }

    return true;
  }

    // ============================================
    // HELPER: Bind button handler (reusable)
    // ============================================
    function bindButton(buttonId, moduleName, moduleMethod, ...args) {
    // Try both iPad and mobile IDs
    const ipadBtn = document.getElementById(buttonId);
    const mobileBtn = document.getElementById('mobile-' + buttonId);
    
    const buttons = [ipadBtn, mobileBtn].filter(btn => btn !== null);
    
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log(`[ActionButtons] ${buttonId} clicked (${btn.id})`);
        
        if (window[moduleName]) {
          if (args.length > 0) {
            window[moduleName][moduleMethod](...args, currentItem);
          } else {
            window[moduleName][moduleMethod](currentItem);
          }
        } else {
          console.warn(`[ActionButtons] ${moduleName} module not loaded yet`);
        }
      });
    });
    
    return buttons.length > 0;
  }


  // ============================================
  // HELPER: Bind all action buttons (iPad & iPhone)
  // ============================================
  function bindAllActionButtons(containerSelector = '') {
    const prefix = containerSelector ? `${containerSelector} ` : '';
    console.log(`[ActionButtons] Binding buttons in: "${prefix || 'iPad area'}"`);
    
    // Row 1: Location, Shipment, Teflon
    // Row 1 - R6.9.5: Dynamic - Inventory or Location
    const locationBtn = document.querySelector(prefix + '#btn-location');
    const mobileLocationBtn = document.querySelector('#mobile-btn-location');

    [locationBtn, mobileLocationBtn].filter(btn => btn).forEach(btn => {
      btn.addEventListener('click', () => {
        if (!validateSelection()) return;
        
        const isActive = window.InventoryState?.active || false;
        
        if (isActive) {
          // Chế độ kiểm kê ON → Cập nhật vị trí
          console.log('[ActionButtons] Location update (inventory mode)');
          if (window.LocationUpdate) {
            window.LocationUpdate.openModal(currentItem);
          }
        } else {
          // Chế độ kiểm kê OFF → Mở Settings
          console.log('[ActionButtons] Open inventory settings');
          if (window.InventoryManager) {
            window.InventoryManager.openSettings();
          }
        }

      });
    });

    bindButton(prefix + 'shipment-btn', 'Shipment', 'openModal');
    bindButton(prefix + 'teflon-btn', 'TeflonUpdate', 'openModal');
    
    // Row 2: Comment, Print, QR
    bindButton(prefix + 'comment-btn', 'Comment', 'openModal');
    
    const printBtn = document.querySelector(prefix + '#print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        if (window.ExportPDF) {
          window.ExportPDF.generate(currentItem);
        } else {
          alert('PDF export機能は準備中です / Tính năng xuất PDF đang phát triển');
        }
      });
    }
    
    const qrBtn = document.querySelector(prefix + '#export-qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        if (window.ExportQR) {
          window.ExportQR.generate(currentItem);
        } else {
          alert('QRコード生成機能は準備中です / Tính năng tạo QR đang phát triển');
        }
      });
    }
    
    // Row 3: Check-in/out
    bindButton(prefix + 'checkin-btn', 'CheckInOut', 'openModal', 'check-in');
    bindButton(prefix + 'checkout-btn', 'CheckInOut', 'openModal', 'check-out');
  }


  // ============================================
  // AUTO-INIT
  // ============================================
  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
          initActionButtons();
          updateInventoryButtonLabels(); // ✅ GỌI SAU KHI INIT
      });
  } else {
      initActionButtons();
      updateInventoryButtonLabels(); // ✅ GỌI SAU KHI INIT
  }

  // Listen for mode changes
  document.addEventListener('inventory:modeChanged', () => {
      updateInventoryButtonLabels();
  });

  })();
