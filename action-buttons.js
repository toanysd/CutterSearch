/**
 * action-buttons.js V7.7.7
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

    // ✅ Lắng nghe event từ mobile controller
    document.addEventListener('mobile:item-selected', (e) => {
      if (window.currentDetailItem) {
        currentItem = window.currentDetailItem;
        currentType = window.currentDetailItem.itemType || 'mold';
        console.log('[ActionButtons] Mobile item updated:', currentItem);
      }
    });


    // ============================================
    // ROW 1: Location, Shipment, Teflon
    // ============================================

    // 位置変更 (Location Update)
    const locationBtn = document.getElementById('btn-location');
    if (locationBtn) {
      locationBtn.addEventListener('click', () => {
          if (!validateSelection()) return;
          
          // ✅ Debug: Kiểm tra dữ liệu trước khi mở popup
          console.log('[Location] Opening popup with item:', currentItem);
          console.log('[Location] RackID:', currentItem?.RackID);
          console.log('[Location] LayerNumber:', currentItem?.LayerNumber);
          
          // ✅ Đảm bảo window.currentDetailItem luôn được set
          window.currentDetailItem = currentItem;
          
          if (window.LocationManager?.openModal) {
            window.LocationManager.openModal('location', currentItem);
          } else if (window.LocationUpdate?.openModal) {
            const itemToPass = {
              ...currentItem,
              itemType: currentType,
              displayCode: currentItem.MoldID || currentItem.CutterID || currentItem.displayCode,
              MoldID: currentItem.MoldID,
              RackID: currentItem.RackID,
              RackLayerID: currentItem.RackLayerID,
              LayerNumber: currentItem.LayerNumber
            };
            
            console.log('[Location] Formatted item:', itemToPass);
            
            if (window.LocationUpdate.openModal.length >= 2) {
              window.LocationUpdate.openModal('location', itemToPass);
            } else {
              window.LocationUpdate.openModal(itemToPass);
            }
          } else {
            console.error('❌ Location module not found!');
            alert('モジュールが読み込まれていません / Module chưa được tải');
          }
        });

    }


    // 出荷登録 (Shipment)
    const shipmentBtn = document.getElementById('shipment-btn');
    if (shipmentBtn) {
      shipmentBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] Shipment clicked');
        if (window.Shipment) {
          window.Shipment.openModal(currentItem);
        } else {
          console.warn('[ActionButtons] Shipment module not loaded yet');
        }
      });
    }

    // テフロン (Teflon)
    const teflonBtn = document.getElementById('teflon-btn');
    if (teflonBtn) {
      teflonBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] Teflon clicked');
        if (window.TeflonUpdate) {
          window.TeflonUpdate.openModal(currentItem);
        } else {
          console.warn('[ActionButtons] TeflonUpdate module not loaded yet');
        }
      });
    }

    // ============================================
    // ROW 2: Comment, Print PDF, QR Code
    // ============================================

    // コメント (Comment)
    const commentBtn = document.getElementById('comment-btn');
    if (commentBtn) {
      commentBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] Comment clicked');
        if (window.Comment) {
          window.Comment.openModal(currentItem);
        } else {
          console.warn('[ActionButtons] Comment module not loaded yet');
        }
      });
    }

    // 印刷 PDF (Print PDF)
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] Print PDF clicked');
        if (window.ExportPDF) {
          window.ExportPDF.generate(currentItem);
        } else {
          alert('PDF export機能は準備中です / Tính năng xuất PDF đang phát triển');
        }
      });
    }

    // QRコード (QR Code)
    const qrBtn = document.getElementById('export-qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] QR Code clicked');
        if (window.ExportQR) {
          window.ExportQR.generate(currentItem);
        } else {
          alert('QRコード生成機能は準備中です / Tính năng tạo QR đang phát triển');
        }
      });
    }

    // ============================================
    // ROW 3: Check-in / Check-out
    // ============================================

    // 入庫 (Check-in)
    const checkinBtn = document.getElementById('checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] Check-in clicked');
        if (window.CheckInOut) {
          window.CheckInOut.openModal('check-in', currentItem);
        } else {
          console.error('[ActionButtons] CheckInOut module not found');
          alert('Check-in機能の読み込みエラー / Lỗi load module Check-in');
        }
      });
    }

    // 出庫 (Check-out)
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log('[ActionButtons] Check-out clicked');
        if (window.CheckInOut) {
          window.CheckInOut.openModal('check-out', currentItem);
        } else {
          console.error('[ActionButtons] CheckInOut module not found');
          alert('Check-out機能の読み込みエラー / Lỗi load module Check-out');
        }
      });
    }

    console.log('[ActionButtons] ✅ All buttons bound successfully');
  }

  // ============================================
  // HELPER: Validate item selection
  // ============================================
  function validateSelection() {
    if (!currentItem) {
      alert('項目を選択してください\nVui lòng chọn khuôn hoặc dao cắt trước');
      return false;
    }
    return true;
  }

  // ============================================
  // AUTO-INIT
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initActionButtons);
  } else {
    initActionButtons();
  }

})();
