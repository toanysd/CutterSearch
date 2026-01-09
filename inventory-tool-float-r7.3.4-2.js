/**
 * inventory-tool-float-r7.3.4-2.js
 * Inventory Tool Float r7.3.4 (FIXED event sync + audit handlers)
 *
 * Key fixes (2026-01-07):
 * - Listen to BOTH legacy and colon-namespaced events for compatibility
 * - Use InventoryManager.auditSelected() for bulk audit (respects session)
 * - Single audit: call InventoryManager.recordAudit() or dispatch inventory:auditSingle
 * - Sync compareEnabled/targetRackLayerId from session state
 * - Bilingual toast notifications (JP priority, then VN)
 * - Draggable, compact, mobile-optimized
 *
 * Features:
 * - Selection count display
 * - Last audit status (green if today)
 * - RackLayerID input for comparison (with toggle)
 * - Toggle Detail Modal ON/OFF (default ON)
 * - Multi-select toggle (only visible when Detail Modal OFF)
 * - Action buttons: Audit, Relocate+Audit, Close
 *
 * Dependencies:
 * - inventory-manager-r7.3.3.js (must load first)
 * - SelectionManager (external or built-in)
 * - DataManager (for statuslogs)
 *
 * Created: 2026-01-07
 */

(function () {
  'use strict';

  const VERSION = 'r7.3.4';

  // ============================================================================
  // Utilities
  // ============================================================================
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeString(v) {
    if (v == null) return '';
    return String(v);
  }

  function isFn(fn) {
    return typeof fn === 'function';
  }

  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
      // ignore
    }
  }

  function todayIsoDate() {
    return new Date().toISOString().split('T')[0];
  }

  function toHalfWidthRackStr(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[－‐‑–—ー]/g, '-') // các loại dấu gạch
      .replace(/[　]/g, ' ');      // fullwidth space
  }

  // Chuẩn hoá về dạng "13", "700"... (chỉ số)
  // - "1-3" => "13"
  // - "70-0" => "700"
  // - "013" => "13"
  function normalizeRackLayerIdInput(raw) {
    const s0 = toHalfWidthRackStr(raw).trim();
    if (!s0) return '';

    const s = s0.replace(/\s+/g, '');
    const m = s.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) return String(a) + String(b);
      const digits = s.replace(/[^0-9]/g, '');
      return digits ? String(parseInt(digits, 10)) : '';
    }

    if (/^\d+$/.test(s)) return String(parseInt(s, 10));

    const digits = s.replace(/[^0-9]/g, '');
    return digits ? String(parseInt(digits, 10)) : '';
  }

  // ============================================================================
  // State Management
  // ============================================================================
  const ToolState = {
    visible: false,
    position: {
      x: typeof window !== 'undefined' ? window.innerWidth - 320 : 100,
      y: 80,
    },
    isDragging: false,
    detailModalEnabled: true, // Default ON
    multiSelectEnabled: false, // Default OFF (only visible when detail OFF)
    compareEnabled: false,
    targetRackLayerId: '',
    selectedCount: 0,
    auditStatus: null, // { date, isToday }
  };

  // Persist tool preferences
  const STORAGE_KEY = 'inventory-tool-prefs-r7.3.4';

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const prefs = JSON.parse(raw);
      if (prefs.position) {
        ToolState.position.x = prefs.position.x || ToolState.position.x;
        ToolState.position.y = prefs.position.y || ToolState.position.y;
      }
      if (typeof prefs.detailModalEnabled === 'boolean') ToolState.detailModalEnabled = prefs.detailModalEnabled;
      if (typeof prefs.compareEnabled === 'boolean') ToolState.compareEnabled = prefs.compareEnabled;
      if (prefs.targetRackLayerId) ToolState.targetRackLayerId = prefs.targetRackLayerId;
    } catch (e) {
      // ignore
    }
  }

  function savePreferences() {
    try {
      const prefs = {
        position: ToolState.position,
        detailModalEnabled: ToolState.detailModalEnabled,
        compareEnabled: ToolState.compareEnabled,
        targetRackLayerId: ToolState.targetRackLayerId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      // ignore
    }
  }

  // ============================================================================
  // Audit Status Helper
  // ============================================================================
  function getSelectedItemsAuditStatus() {
    if (!window.SelectionManager || !isFn(window.SelectionManager.getSelectedItems)) return null;

    const selected = window.SelectionManager.getSelectedItems();
    if (!selected || selected.length === 0) return null;

    // For simplicity, check first selected item
    const first = selected[0];
    if (!first || !first.id || !first.type) return null;

    const lastDate = window.InventoryManager?.getLastAuditDate?.(first.id, first.type);
    if (!lastDate) return { date: null, isToday: false };

    const dateStr = new Date(lastDate).toISOString().split('T')[0];
    const isToday = dateStr === todayIsoDate();
    return { date: dateStr, isToday };
  }

  // ============================================================================
  // Inventory Tool Float
  // ============================================================================
  const InventoryToolFloat = {
    container: null,

    init() {
      console.log('[InventoryToolFloat] Initializing', VERSION);

      loadPreferences();
      this.createToolbar();
      this.bindEvents();

      // Listen to inventory mode changes (BOTH legacy and new events)
      document.addEventListener('inventorymodeChanged', (e) => this.handleModeChanged(e));
      document.addEventListener('inventory:modeChanged', (e) => this.handleModeChanged(e));

      // Listen to selection changes (BOTH events)
      document.addEventListener('selectionchanged', () => {
        this.updateSelectionCount();
        this.updateAuditStatus();
      });
      document.addEventListener('selection:changed', () => {
        this.updateSelectionCount();
        this.updateAuditStatus();
      });

      // Listen to session changes (BOTH events)
      document.addEventListener('inventorysessionChanged', (e) => this.syncFromSession(e));
      document.addEventListener('inventory:sessionChanged', (e) => this.syncFromSession(e));

      // Listen to audit recorded (BOTH events)
      document.addEventListener('inventoryauditRecorded', () => this.updateAuditStatus());
      document.addEventListener('inventory:auditRecorded', () => this.updateAuditStatus());

      // Notifications from InventoryManager (single audit / errors)
      document.addEventListener('inventorynotification', (e) => {
        try {
          const d = e?.detail || {};
          const text = safeString(d.text || d.message || '').trim();
          const type = safeString(d.type || 'info').toLowerCase();

          if (!text) return;

          // chống duplicate do compat dispatch có thể phát 2 lần cùng event name
          const now = Date.now();
          const key = `${type}|${text}`;
          ToolState._lastNotifyKey = ToolState._lastNotifyKey || '';
          ToolState._lastNotifyAt = ToolState._lastNotifyAt || 0;
          if (ToolState._lastNotifyKey === key && (now - ToolState._lastNotifyAt) < 200) return;
          ToolState._lastNotifyKey = key;
          ToolState._lastNotifyAt = now;

          const toastType =
            type === 'success' ? 'success' :
            type === 'error' ? 'error' :
            type === 'warning' ? 'warning' : 'info';

          InventoryToolFloat.showToast(text, toastType, 3000);
        } catch (_) {}
      });

      // ✅ Bulk progress (x/y) - cập nhật toast khi đang chạy nền
      document.addEventListener('inventorybulkAuditProgress', (e) => {
        const d = e.detail || {};
        const total = d.total || 0;
        const done = d.done || 0;
        const success = d.success || 0;
        const failed = d.failed || 0;

        InventoryToolFloat.showToast(
          `処理中 ${done}/${total} | 成功 ${success} | 失敗 ${failed} / Đang xử lý ${done}/${total} | OK ${success} | Fail ${failed}`,
          'info',
          0
        );
      });

      // ✅ Bulk completed - đóng toast và báo kết quả
      document.addEventListener('inventorybulkAuditCompleted', (e) => {
        const d = e.detail || {};
        const ok = d.count || 0;
        const fail = d.failedCount || 0;

        InventoryToolFloat.hideToast();
        InventoryToolFloat.showToast(
          `完了 | 成功 ${ok} | 失敗 ${fail} / Xong | OK ${ok} | Fail ${fail}`,
          fail > 0 ? 'warning' : 'success',
          3000
        );

        // Re-render UI (giống logic bạn đang làm trong handleAudit)
        setTimeout(() => {
          if (window.UIRenderer && typeof window.UIRenderer.renderResults === 'function') {
            const allResults = window.UIRenderer.state?.allResults;
            if (allResults) window.UIRenderer.renderResults(allResults);
          }
        }, 500);

        // Update status
        InventoryToolFloat.updateSelectionCount();
        InventoryToolFloat.updateAuditStatus();
      });

      // Initial sync
      const state = window.InventoryManager?.getState?.();
      if (state?.inventoryOn) {
        this.show();
        this.syncFromSession();
      }

      console.log('[InventoryToolFloat] Initialized ✅');
    },

    handleModeChanged(e) {
      // Handle BOTH legacy boolean and new object payloads
      let inventoryOn = false;

      if (typeof e.detail === 'boolean') {
        inventoryOn = e.detail;
      } else if (e.detail && typeof e.detail.inventoryOn === 'boolean') {
        inventoryOn = e.detail.inventoryOn;
      }

      if (inventoryOn) {
        this.show();
        this.syncFromSession();
      } else {
        this.hide();
      }
    },

    createToolbar() {
      if (document.getElementById('inventory-tool-float')) {
        console.warn('[InventoryToolFloat] Toolbar already exists');
        return;
      }

      const html = this.renderHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      this.container = document.getElementById('inventory-tool-float');

      // Set initial position
      if (this.container) {
        this.container.style.left = `${ToolState.position.x}px`;
        this.container.style.top = `${ToolState.position.y}px`;
      }

      console.log('[InventoryToolFloat] Toolbar created ✅');
    },

    renderHTML() {
      return `
<!-- Inventory Tool Float -->
<div id="inventory-tool-float" class="inv-tool-float hidden">
  <!-- Drag Handle -->
  <div class="inv-tool-header" id="inv-tool-drag-handle">
    <div class="inv-tool-title" style="font-size: 13px; font-weight: 600;">
      <i class="fas fa-clipboard-check" style="font-size: 12px;"></i>
      <span class="label-ja">棚卸</span>
      <span class="label-vi">Kiểm kê</span>
    </div>
    <button class="inv-tool-close-btn" id="inv-tool-close-btn" title="閉じる / Đóng" style="width: 24px; height: 24px; font-size: 12px;">
      <i class="fas fa-times"></i>
    </button>
  </div>

  <!-- Tool Body -->
  <div class="inv-tool-body">
    <!-- Selection Count (ALWAYS VISIBLE) -->
    <div class="inv-tool-section">
      <label class="inv-tool-label" style="font-size: 12px;">
        <i class="fas fa-list-check"></i>
        <span class="label-ja">選択数</span>
        <span class="label-vi">Đã chọn</span>
      </label>
      <div class="inv-tool-value" id="inv-tool-selection-count" style="font-weight: 700; font-size: 16px;">0</div>
    </div>

    <!-- Toggle Advanced Options Button -->
    <div class="inv-tool-section" style="text-align: center; padding: 4px 0;">
      <button class="inv-tool-toggle-advanced" id="inv-tool-toggle-advanced" style="font-size: 11px; padding: 4px 8px; background: transparent; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
        <i class="fas fa-chevron-down"></i>
        <span class="label-ja">詳細表示</span>
        <span class="label-vi">Hiện chi tiết</span>
      </button>
    </div>

    <!-- Advanced sections (COLLAPSIBLE) -->
    <div id="inv-tool-advanced-sections" style="display: none;">
      <!-- Audit Status -->
      <div class="inv-tool-section">
        <label class="inv-tool-label">
          <i class="fas fa-calendar-check"></i>
          <span class="label-ja">前回棚卸</span>
          <span class="label-vi">Trạng thái</span>
        </label>
        <div class="inv-tool-value" id="inv-tool-audit-status">
          <span class="label-ja">未選択</span>
          <span class="label-vi">Chưa chọn</span>
        </div>
      </div>

      <!-- RackLayerID Input with toggle -->
      <div class="inv-tool-section">
        <label class="inv-tool-label">
          <input type="checkbox" id="inv-tool-compare-toggle" class="inv-tool-checkbox" ${ToolState.compareEnabled ? 'checked' : ''}>
          <i class="fas fa-warehouse"></i>
          <span class="label-ja">棚位置比較</span>
          <span class="label-vi">So sánh vị trí</span>
        </label>
        <input type="text" id="inv-tool-racklayer-input" class="inv-tool-input"
          placeholder="13 または 1-3 / 13 hoặc 1-3" value="${escHtml(ToolState.targetRackLayerId)}" ${!ToolState.compareEnabled ? 'disabled' : ''} />
        <small class="inv-tool-help-text" style="font-size: 10px; color: #666; display: block; margin-top: 2px;">
          <span class="label-ja">入力例: 13 または 1-3 → 自動で13に変換</span>
          <span class="label-vi">VD: 13 hoặc 1-3 → tự đổi thành 13</span>
        </small>

      </div>

      <!-- Toggle Detail Modal -->
      <div class="inv-tool-section inv-tool-toggle-section">
        <label class="inv-tool-toggle-label">
          <input type="checkbox" id="inv-tool-detail-modal-toggle" class="inv-tool-checkbox" ${ToolState.detailModalEnabled ? 'checked' : ''}>
          <i class="fas fa-window-maximize"></i>
          <span class="label-ja">詳細モーダルを開く</span>
          <span class="label-vi">Mở Detail Modal</span>
        </label>
      </div>

      <!-- Toggle Multi-Select (only when Detail Modal OFF) -->
      <div class="inv-tool-section inv-tool-toggle-section ${ToolState.detailModalEnabled ? 'hidden' : ''}" id="inv-tool-multiselect-section">
        <label class="inv-tool-toggle-label">
          <input type="checkbox" id="inv-tool-multiselect-toggle" class="inv-tool-checkbox" ${ToolState.multiSelectEnabled ? 'checked' : ''}>
          <i class="fas fa-check-double"></i>
          <span class="label-ja">複数選択</span>
          <span class="label-vi">Cho phép chọn nhiều</span>
        </label>
      </div>
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="inv-tool-footer">
    <button class="inv-tool-btn inv-tool-btn-primary" id="inv-tool-audit-btn" disabled>
      <i class="fas fa-check-circle"></i>
      <span class="label-ja">棚卸</span>
      <span class="label-vi">Kiểm kê</span>
    </button>
    <button class="inv-tool-btn inv-tool-btn-warning" id="inv-tool-relocate-btn" disabled>
      <i class="fas fa-arrows-alt"></i>
      <span class="label-ja">位置変更＋棚卸</span>
      <span class="label-vi">Đổi vị trí</span>
    </button>
  </div>
</div>
      `;
    },

    bindEvents() {
      // Close button
      const closeBtn = document.getElementById('inv-tool-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.hide();
          // Turn off inventory mode
          if (window.InventoryManager?.turnOff) window.InventoryManager.turnOff();
        });
      }

      // Drag & Drop
      this.setupDragAndDrop();

      // Compare toggle
      const compareToggle = document.getElementById('inv-tool-compare-toggle');
      if (compareToggle) {
        compareToggle.addEventListener('change', (e) => {
          ToolState.compareEnabled = e.target.checked;
          const input = document.getElementById('inv-tool-racklayer-input');
          if (input) input.disabled = !ToolState.compareEnabled;

          // Update session if exists
          if (window.InventoryManager?.updateSessionTarget) {
            window.InventoryManager.updateSessionTarget(ToolState.targetRackLayerId, ToolState.compareEnabled);
          }

          savePreferences();
        });
      }

      // RackLayerID input
      const rackLayerInput = document.getElementById('inv-tool-racklayer-input');
      if (rackLayerInput) {
        rackLayerInput.addEventListener('change', (e) => {
          const raw = (e.target.value || '').trim();
          const normalized = normalizeRackLayerIdInput(raw);

          if (!normalized) {
            ToolState.targetRackLayerId = '';
            e.target.value = '';
            if (window.InventoryManager?.updateSessionTarget) {
              window.InventoryManager.updateSessionTarget('', ToolState.compareEnabled);
            }
            savePreferences();
            return;
          }

          // lưu dạng chuẩn hoá để so sánh đúng với dữ liệu RackLayerID (13/700...)
          ToolState.targetRackLayerId = normalized;

          // nếu người dùng nhập 1-3 thì tự chuyển hiển thị thành 13 để tránh hiểu nhầm
          if (raw !== normalized) {
            e.target.value = normalized;
            InventoryToolFloat.showToast(`入力変換: ${raw} → ${normalized} / Đã chuyển: ${raw} → ${normalized}`, 'info', 2500);
          } else {
            e.target.value = normalized; // loại bỏ leading zero như 013 -> 13
          }

          if (window.InventoryManager?.updateSessionTarget) {
            window.InventoryManager.updateSessionTarget(ToolState.targetRackLayerId, ToolState.compareEnabled);
          }
          savePreferences();
        });

      }

      // Detail Modal toggle
      const detailToggle = document.getElementById('inv-tool-detail-modal-toggle');
      if (detailToggle) {
        detailToggle.addEventListener('change', (e) => {
          ToolState.detailModalEnabled = e.target.checked;

          // Show/hide multi-select section
          const multiSelectSection = document.getElementById('inv-tool-multiselect-section');
          if (multiSelectSection) {
            if (ToolState.detailModalEnabled) {
              multiSelectSection.classList.add('hidden');
              ToolState.multiSelectEnabled = false;
              const multiToggle = document.getElementById('inv-tool-multiselect-toggle');
              if (multiToggle) multiToggle.checked = false;
            } else {
              multiSelectSection.classList.remove('hidden');
            }
          }

          // Dispatch event for other modules
          dispatch('inventorydetailModalToggle', { enabled: ToolState.detailModalEnabled });
          dispatch('inventory:detailModalToggle', { enabled: ToolState.detailModalEnabled });

          savePreferences();
        });
      }

      // Multi-select toggle
      const multiToggle = document.getElementById('inv-tool-multiselect-toggle');
      if (multiToggle) {
        multiToggle.addEventListener('change', (e) => {
          ToolState.multiSelectEnabled = e.target.checked;

          // Dispatch event for card click handlers
          dispatch('inventorymultiSelectToggle', { enabled: ToolState.multiSelectEnabled });
          dispatch('inventory:multiSelectToggle', { enabled: ToolState.multiSelectEnabled });
        });
      }

      // Audit button
      const auditBtn = document.getElementById('inv-tool-audit-btn');
      if (auditBtn) auditBtn.addEventListener('click', () => this.handleAudit());

      // Relocate + Audit button
      const relocateBtn = document.getElementById('inv-tool-relocate-btn');
      if (relocateBtn) relocateBtn.addEventListener('click', () => this.handleRelocateAndAudit());

      // Toggle advanced sections
      const toggleBtn = document.getElementById('inv-tool-toggle-advanced');
      const advancedSections = document.getElementById('inv-tool-advanced-sections');
      if (toggleBtn && advancedSections) {
        toggleBtn.addEventListener('click', () => {
          const isHidden = advancedSections.style.display === 'none';
          advancedSections.style.display = isHidden ? 'block' : 'none';
          const icon = toggleBtn.querySelector('i');
          if (icon) icon.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
        });
      }

      console.log('[InventoryToolFloat] Events bound ✅');
    },

    setupDragAndDrop() {
      const dragHandle = document.getElementById('inv-tool-drag-handle');
      const container = this.container;
      if (!dragHandle || !container) return;

      let startX, startY, initialX, initialY;

      const onStart = (clientX, clientY) => {
        if (ToolState.isDragging) return;
        startX = clientX;
        startY = clientY;
        initialX = ToolState.position.x;
        initialY = ToolState.position.y;
        container.style.transition = 'none';
        dragHandle.style.cursor = 'grabbing';
      };

      const onMove = (clientX, clientY) => {
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        if (!ToolState.isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
          ToolState.isDragging = true;
        }

        if (!ToolState.isDragging) return;

        let newX = initialX + deltaX;
        let newY = initialY + deltaY;

        // Boundaries
        const maxX = window.innerWidth - container.offsetWidth - 10;
        const maxY = window.innerHeight - container.offsetHeight - 10;
        newX = Math.max(10, Math.min(newX, maxX));
        newY = Math.max(10, Math.min(newY, maxY));

        container.style.left = `${newX}px`;
        container.style.top = `${newY}px`;
        ToolState.position.x = newX;
        ToolState.position.y = newY;
      };

      const onEnd = () => {
        container.style.transition = '';
        dragHandle.style.cursor = 'grab';
        if (ToolState.isDragging) {
          savePreferences();
          setTimeout(() => {
            ToolState.isDragging = false;
          }, 100);
        }
      };

      // Touch events
      dragHandle.addEventListener(
        'touchstart',
        (e) => {
          const touch = e.touches[0];
          onStart(touch.clientX, touch.clientY);
        },
        { passive: true }
      );

      dragHandle.addEventListener(
        'touchmove',
        (e) => {
          if (!e.touches[0]) return;
          e.preventDefault();
          const touch = e.touches[0];
          onMove(touch.clientX, touch.clientY);
        },
        { passive: false }
      );

      dragHandle.addEventListener('touchend', onEnd);

      // Mouse events
      dragHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onStart(e.clientX, e.clientY);

        const onMouseMove = (e) => onMove(e.clientX, e.clientY);
        const onMouseUp = () => {
          onEnd();
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      dragHandle.style.cursor = 'grab';
    },

    syncFromSession(e) {
      const session = e?.detail?.session || window.InventoryManager?.getState?.()?.session;
      if (session) {
        // Sync compare enabled
        if (typeof session.compareEnabled === 'boolean') {
          ToolState.compareEnabled = session.compareEnabled;
          const compareToggle = document.getElementById('inv-tool-compare-toggle');
          if (compareToggle) compareToggle.checked = ToolState.compareEnabled;
        }

        // Sync target RackLayerID
        if (session.targetRackLayerId) {
          ToolState.targetRackLayerId = session.targetRackLayerId;
          const input = document.getElementById('inv-tool-racklayer-input');
          if (input) {
            input.value = ToolState.targetRackLayerId;
            input.disabled = !ToolState.compareEnabled;
          }
        }
      }
    },

    updateSelectionCount() {
      if (!window.SelectionManager || !isFn(window.SelectionManager.getSelectedItems)) {
        ToolState.selectedCount = 0;
      } else {
        const selected = window.SelectionManager.getSelectedItems();
        ToolState.selectedCount = Array.isArray(selected) ? selected.length : 0;
      }

      const countEl = document.getElementById('inv-tool-selection-count');
      if (countEl) countEl.textContent = String(ToolState.selectedCount);

      // Enable/disable action buttons
      const auditBtn = document.getElementById('inv-tool-audit-btn');
      const relocateBtn = document.getElementById('inv-tool-relocate-btn');
      if (auditBtn) auditBtn.disabled = ToolState.selectedCount === 0;
      if (relocateBtn) relocateBtn.disabled = ToolState.selectedCount === 0;
    },

    updateAuditStatus() {
      const status = getSelectedItemsAuditStatus();
      ToolState.auditStatus = status;

      const statusEl = document.getElementById('inv-tool-audit-status');
      if (!statusEl) return;

      if (!status || !status.date) {
        statusEl.innerHTML = `
          <span class="label-ja">未棚卸</span>
          <span class="label-vi">Chưa kiểm kê</span>
        `;
        statusEl.className = 'inv-tool-value';
      } else if (status.isToday) {
        statusEl.innerHTML = `
          <span class="inv-tool-status-today">
            <i class="fas fa-check-circle"></i>
            ${escHtml(status.date)}
          </span>
        `;
        statusEl.className = 'inv-tool-value inv-tool-status-success';
      } else {
        statusEl.innerHTML = `<span>${escHtml(status.date)}</span>`;
        statusEl.className = 'inv-tool-value';
      }
    },

    show() {
      if (this.container) {
        this.container.classList.remove('hidden');
        ToolState.visible = true;
        this.updateSelectionCount();
        this.updateAuditStatus();
        console.log('[InventoryToolFloat] Shown ✅');
      }
    },

    hide() {
      if (this.container) {
        this.container.classList.add('hidden');
        ToolState.visible = false;
        console.log('[InventoryToolFloat] Hidden');
      }
    },

    // ========================================================================
    // Action Handlers
    // ========================================================================
    async handleAudit() {
      console.log('[InventoryToolFloat] Handle audit');

      if (!window.InventoryManager) {
        this.showToast('システムエラー / Lỗi hệ thống.', 'error');
        return;
      }

      if (!window.SelectionManager || !isFn(window.SelectionManager.getSelectedItems)) {
        this.showToast('SelectionManagerが見つかりません / Không tìm thấy SelectionManager.', 'error');
        return;
      }

      const selected = window.SelectionManager.getSelectedItems();
      const count = Array.isArray(selected) ? selected.length : 0;

      if (count === 0) {
        this.showToast('未選択です / Chưa chọn mục nào.', 'warning');
        return;
      }

      // Detail Modal ON + single item -> dùng audit single (InventoryManager sẽ xử lý)
      if (ToolState.detailModalEnabled && count === 1) {
        const item = selected[0];

        // ✅ Compare RackLayerID trước khi audit (nếu bật)
        if (ToolState.compareEnabled) {
          const targetRL = (ToolState.targetRackLayerId || '').trim();
          if (!targetRL) {
            this.showToast('RackLayerID未入力 / Chưa nhập RackLayerID.', 'warning', 3000);
            return;
          }

          const oldRL = this.getItemRackLayerIdFromSelected(item);
          if (oldRL && oldRL.toUpperCase() !== targetRL.toUpperCase()) {
            const action = await this.showRackLayerMismatchDialog({
              targetRackLayerId: targetRL,
              mismatches: [{
                itemId: item.id,
                itemType: item.type,
                oldRackLayerId: oldRL,
                newRackLayerId: targetRL,
              }],
              unknownCount: 0
            });

            if (action === 'cancel') return;

            if (action === 'relocate') {
              this.showToast('位置変更中... / Đang đổi vị trí...', 'info', 0);
              try {
                await window.InventoryManager.relocateAndAudit(item.id, item.type, targetRL, {
                  oldRackLayerId: oldRL,
                  locationNotes: `棚卸前 位置変更: ${oldRL} → ${targetRL} / Đổi vị trí trước kiểm kê`,
                  alsoAudit: true,
                });
                // relocateAndAudit xong sẽ tự audit luôn
                return;
              } catch (e) {
                this.hideToast();
                this.showToast('位置変更失敗 / Đổi vị trí thất bại.', 'error', 3000);
                return;
              }
            }
            // action === 'skip' => tiếp tục audit bình thường (dispatch)
          }
        }

        dispatch('inventoryauditSingle', {
          itemId: item.id,
          itemType: item.type,
          item: item.item,
        });
        dispatch('inventory:auditSingle', {
          itemId: item.id,
          itemType: item.type,
          item: item.item,
        });
        return;
      }

      // Bulk audit
      const confirmMsg =
        count === 1
          ? '1件を棚卸しますか？ / Xác nhận kiểm kê 1 mục?'
          : `${count}件を一括棚卸しますか？ / Xác nhận kiểm kê ${count} mục?`;

      if (!confirm(confirmMsg)) return;

      // Hiện toast đang xử lý (để progress event cập nhật)
      this.showToast(`処理中... ${count}件 / Đang xử lý... ${count} mục`, 'info', 0);

      // ✅ Compare RackLayerID trước khi audit (nếu bật)
      if (ToolState.compareEnabled) {
        const targetRL = (ToolState.targetRackLayerId || '').trim();
        if (!targetRL) {
          this.hideToast();
          this.showToast('RackLayerID未入力 / Chưa nhập RackLayerID.', 'warning', 3000);
          return;
        }

        const { mismatches, unknownCount } = this.collectRackLayerMismatches(selected, targetRL);

        if (mismatches.length > 0) {
          const action = await this.showRackLayerMismatchDialog({
            targetRackLayerId: targetRL,
            mismatches,
            unknownCount
          });

          if (action === 'cancel') {
            this.hideToast();
            return;
          }

          // Nếu chọn "Đổi vị trí và kiểm kê" => đổi vị trí trước, rồi mới audit
          if (action === 'relocate') {
            // Đổi vị trí theo batch (toast riêng cho phần relocate)
            for (let i = 0; i < mismatches.length; i++) {
              const m = mismatches[i];
              this.showToast(
                `位置変更中 ${i + 1}/${mismatches.length}... / Đang đổi vị trí ${i + 1}/${mismatches.length}...`,
                'info',
                0
              );

              try {
                await window.InventoryManager.relocateAndAudit(m.itemId, m.itemType, targetRL, {
                  oldRackLayerId: m.oldRackLayerId,
                  locationNotes: `棚卸前 位置変更: ${m.oldRackLayerId} → ${targetRL} / Đổi vị trí trước kiểm kê`,
                  alsoAudit: false, // ✅ chỉ đổi vị trí, KHÔNG audit ở bước này
                });
              } catch (e) {
                // Nếu đổi vị trí thất bại 1 item: vẫn cho chạy tiếp audit theo lựa chọn "skip"
                // (tránh kẹt toàn bộ)
              }
            }

            // Sau khi đổi xong, chuyển toast sang "đang kiểm kê"
            this.showToast(`棚卸処理中... ${count}件 / Đang kiểm kê... ${count} mục`, 'info', 0);
          }

          // action === 'skip' => bỏ qua đổi vị trí, audit như bình thường
        }
      }

      try {
        // Nếu có chạy nền: gọi xong return ngay (không đụng result, không hideToast tại đây)
        if (typeof window.InventoryManager.startAuditSelectedInBackground === 'function') {
          window.InventoryManager.startAuditSelectedInBackground({
            delayMs: 300,
            clearSelectionAfter: true,
            useBatch: true,
            chunkSize: 20,
            retry: 3,
          });
          return;
        }

        // Fallback: không có chạy nền -> chạy trực tiếp và lấy result
        if (typeof window.InventoryManager.auditSelected === 'function') {
          const result = await window.InventoryManager.auditSelected({
            delayMs: 300,
            clearSelectionAfter: true,
            useBatch: true,
            chunkSize: 20,
            retry: 3,
          });

          this.hideToast();

          const successCount = result?.successCount || 0;
          const failCount = result?.failCount || 0;

          if (failCount === 0) {
            this.showToast(`完了: ${successCount}件 / Hoàn tất: ${successCount} mục`, 'success', 3000);
          } else {
            this.showToast(
              `注意: 成功 ${successCount}, 失敗 ${failCount} / Lưu ý: OK ${successCount}, Fail ${failCount}`,
              'warning',
              5000
            );
          }

          // Re-render UI
          setTimeout(() => {
            if (window.UIRenderer && typeof window.UIRenderer.renderResults === 'function') {
              const allResults = window.UIRenderer.state?.allResults;
              if (allResults) window.UIRenderer.renderResults(allResults);
            }
          }, 500);

          this.updateSelectionCount();
          this.updateAuditStatus();
          return;
        }

        // Fallback cuối: gọi từng item (trường hợp cực hiếm)
        let successCount = 0;
        let failCount = 0;

        for (const sel of selected) {
          try {
            if (typeof window.InventoryManager.recordAudit === 'function') {
              // recordAudit(itemId, itemType, dateOrIso) -> truyền null để dùng ngày hôm nay
              await window.InventoryManager.recordAudit(sel.id, sel.type, null);
              successCount++;
            } else {
              failCount++;
            }
          } catch (_) {
            failCount++;
          }
        }

        this.hideToast();

        if (failCount === 0) {
          this.showToast(`完了: ${successCount}件 / Hoàn tất: ${successCount} mục`, 'success', 3000);
        } else {
          this.showToast(
            `注意: 成功 ${successCount}, 失敗 ${failCount} / Lưu ý: OK ${successCount}, Fail ${failCount}`,
            'warning',
            5000
          );
        }

        setTimeout(() => {
          if (window.UIRenderer && typeof window.UIRenderer.renderResults === 'function') {
            const allResults = window.UIRenderer.state?.allResults;
            if (allResults) window.UIRenderer.renderResults(allResults);
          }
        }, 500);

        this.updateSelectionCount();
        this.updateAuditStatus();
      } catch (err) {
        console.error('[InventoryToolFloat] Audit error:', err);
        this.hideToast();
        this.showToast('棚卸失敗 / Kiểm kê thất bại.', 'error');
      }
    },

    async handleRelocateAndAudit() {
      console.log('[InventoryToolFloat] Handle relocate and audit');

      if (!window.InventoryManager) {
        this.showToast('システムエラー / Lỗi hệ thống.', 'error');
        return;
      }

      if (!window.SelectionManager || !isFn(window.SelectionManager.getSelectedItems)) {
        this.showToast('SelectionManagerが見つかりません / Không tìm thấy SelectionManager.', 'error');
        return;
      }

      const selected = window.SelectionManager.getSelectedItems();
      const count = Array.isArray(selected) ? selected.length : 0;

      if (count === 0) {
        this.showToast('未選択です / Chưa chọn mục nào.', 'warning');
        return;
      }

      // Only support single item relocate
      if (count > 1) {
        this.showToast(
          '位置変更は1件ずつのみ対応 / Đổi vị trí chỉ thực hiện từng mục.',
          'warning'
        );
        return;
      }

      const item = selected[0];
      const itemData = item.item;

      // Get current RackLayerID
      const currentRackLayerId = itemData?.RackLayerID || itemData?.currentRackLayer || '';

      // Prompt for new RackLayerID
      const newRackLayerId = prompt(
        `新しい棚位置を入力\n現在：${currentRackLayerId || '（未設定）'}\n推奨：${ToolState.targetRackLayerId || '（未設定）'}\n\nNhập vị trí mới\nHiện tại: ${currentRackLayerId || '(không có)'}`,
        ToolState.targetRackLayerId || currentRackLayerId
      );

      if (!newRackLayerId || !newRackLayerId.trim()) return; // User cancelled

      const newRL = newRackLayerId.trim();

      // Confirm
      const confirmMsg = currentRackLayerId
        ? `${currentRackLayerId} → ${newRL}\n位置変更＋棚卸を実行しますか？\n\nĐổi vị trí và kiểm kê?\n${currentRackLayerId} → ${newRL}`
        : `新しい位置：${newRL}\n位置設定＋棚卸を実行しますか？\n\nĐặt vị trí mới và kiểm kê?\n${newRL}`;

      if (!confirm(confirmMsg)) return;

      this.showToast('位置変更中… / Đang đổi vị trí…', 'info', 0);

      try {
        const result = await window.InventoryManager.relocateAndAudit(item.id, item.type, newRL, {
          oldRackLayerId: currentRackLayerId,
          locationNotes: `棚卸時に位置変更 / Thay đổi vị trí khi kiểm kê: ${currentRackLayerId || '(なし)'} → ${newRL}`,
          alsoAudit: true,
        });

        this.hideToast();

        if (result?.success) {
          this.showToast(
            '位置変更＋棚卸が完了しました / Hoàn tất đổi vị trí + kiểm kê.',
            'success',
            3000
          );

          // Clear selection
          if (isFn(window.SelectionManager.clear)) window.SelectionManager.clear();

          // Re-render UI
          setTimeout(() => {
            if (window.UIRenderer && isFn(window.UIRenderer.renderResults)) {
              const allResults = window.UIRenderer.state?.allResults;
              window.UIRenderer.renderResults(allResults);
            }
          }, 500);

          // Update status
          this.updateSelectionCount();
          this.updateAuditStatus();
        } else {
          this.showToast('位置変更失敗 / Đổi vị trí thất bại.', 'warning', 5000);
        }
      } catch (err) {
        console.error('[InventoryToolFloat] Relocate error:', err);
        this.hideToast();
        this.showToast('位置変更失敗 / Đổi vị trí thất bại.', 'error');
      }
    },

    // ========================================================================
    // Toast Notifications
    // ========================================================================
    showToast(message, type = 'info', duration = 3000) {
      const existingToast = document.getElementById('inv-tool-toast');
      if (existingToast) existingToast.remove();

      const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ',
      };

      const icon = icons[type] || icons.info;

      const toast = document.createElement('div');
      toast.id = 'inv-tool-toast';
      toast.className = `inv-tool-toast inv-tool-toast-${type}`;
      toast.innerHTML = `
        <span class="inv-tool-toast-icon">${icon}</span>
        <span class="inv-tool-toast-message">${escHtml(message)}</span>
      `;

      document.body.appendChild(toast);

      // Fade in
      setTimeout(() => {
        toast.classList.add('show');
      }, 10);

      // Auto hide
      if (duration > 0) {
        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            if (toast.parentNode) toast.remove();
          }, 300);
        }, duration);
      }
    },

    hideToast() {
      const toast = document.getElementById('inv-tool-toast');
      if (toast) {
        toast.classList.remove('show');
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 300);
      }
    },

    showRackLayerMismatchDialog({ targetRackLayerId, mismatches, unknownCount = 0 }) {
      return new Promise((resolve) => {
        // cleanup cũ nếu có
        const existing = document.getElementById('inv-tool-rl-mismatch-dialog');
        if (existing) existing.remove();

        const maxShow = 5;
        const listHtml = (mismatches || [])
          .slice(0, maxShow)
          .map((m) => {
            const id = escHtml(m.itemId);
            const oldRL = escHtml(m.oldRackLayerId || '???');
            const newRL = escHtml(m.newRackLayerId);
            return `<li style="margin:2px 0;">${id} : ${oldRL} → ${newRL}</li>`;
          })
          .join('');

        const moreCount = Math.max(0, (mismatches?.length || 0) - maxShow);
        const moreText = moreCount > 0 ? `<div style="margin-top:6px;color:#666;">…他 ${moreCount}件 / …còn ${moreCount} mục</div>` : '';
        const unknownText = unknownCount > 0 ? `<div style="margin-top:6px;color:#b36b00;">現在位置不明 ${unknownCount}件 / Không rõ vị trí ${unknownCount} mục</div>` : '';

        const html = `
          <div id="inv-tool-rl-mismatch-dialog" style="
            position:fixed; inset:0; background:rgba(0,0,0,.35);
            display:flex; align-items:center; justify-content:center; z-index:999999;">
            <div style="
              width:min(520px, calc(100vw - 24px));
              background:#fff; border-radius:10px; padding:14px 14px 12px;
              box-shadow:0 8px 24px rgba(0,0,0,.25);">
              <div style="font-weight:700; font-size:14px; margin-bottom:8px;">
                RackLayerID不一致 / Không khớp RackLayerID
              </div>

              <div style="font-size:12px; color:#333; line-height:1.4;">
                入力: <b>${escHtml(targetRackLayerId)}</b> / Nhập: <b>${escHtml(targetRackLayerId)}</b><br/>
                現在の位置と一致しない項目があります。続行しますか？<br/>
                Có mục không khớp vị trí hiện tại. Tiếp tục?
              </div>

              <div style="margin-top:10px; font-size:12px;">
                <ul style="margin:6px 0 0 18px; padding:0;">
                  ${listHtml}
                </ul>
                ${moreText}
                ${unknownText}
              </div>

              <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
                <button id="inv-rl-cancel" style="padding:8px 10px; border:1px solid #ccc; border-radius:8px; background:#fff; cursor:pointer;">
                  キャンセル / Hủy
                </button>
                <button id="inv-rl-skip" style="padding:8px 10px; border:1px solid #2a7; border-radius:8px; background:#eafff6; cursor:pointer;">
                  スキップして棚卸 / Bỏ qua và kiểm kê
                </button>
                <button id="inv-rl-relocate" style="padding:8px 10px; border:1px solid #e6a100; border-radius:8px; background:#fff5dd; cursor:pointer;">
                  位置変更＋棚卸 / Đổi vị trí và kiểm kê
                </button>
              </div>
            </div>
          </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);

        const root = document.getElementById('inv-tool-rl-mismatch-dialog');
        const btnCancel = document.getElementById('inv-rl-cancel');
        const btnSkip = document.getElementById('inv-rl-skip');
        const btnRelocate = document.getElementById('inv-rl-relocate');

        const cleanup = (action) => {
          try { if (root) root.remove(); } catch (_) {}
          resolve(action);
        };

        if (btnCancel) btnCancel.addEventListener('click', () => cleanup('cancel'));
        if (btnSkip) btnSkip.addEventListener('click', () => cleanup('skip'));
        if (btnRelocate) btnRelocate.addEventListener('click', () => cleanup('relocate'));

        // click nền => cancel
        if (root) root.addEventListener('click', (e) => {
          if (e.target === root) cleanup('cancel');
        });
      });
    },

    getItemRackLayerIdFromSelected(sel) {
      const itemData = sel?.item || null;
      const rl = itemData?.RackLayerID ?? itemData?.currentRackLayer ?? itemData?.rackLayerId ?? null;
      return normalizeRackLayerIdInput(rl);
    },

    collectRackLayerMismatches(selectedItems, targetRackLayerId) {
      const target = normalizeRackLayerIdInput(targetRackLayerId || '');
      const mismatches = [];
      let unknownCount = 0;

      (Array.isArray(selectedItems) ? selectedItems : []).forEach((sel) => {
        const itemId = safeString(sel?.id).trim();
        const itemType = safeString(sel?.type).trim();
        if (!itemId || !itemType) return;

        const oldRL = this.getItemRackLayerIdFromSelected(sel);
        if (!oldRL) {
          unknownCount++;
          return;
        }

        const a = oldRL.toUpperCase();
        const b = target.toUpperCase();
        if (a !== b) {
          mismatches.push({
            itemId,
            itemType,
            oldRackLayerId: oldRL,
            newRackLayerId: target,
          });
        }
      });

      return { mismatches, unknownCount };
    },

    // ========================================================================
    // Check RackLayerID Mismatch (for card click integration)
    // ========================================================================
    checkAndPromptRackLayerMismatch(itemId, itemType, itemRackLayerId) {
      if (!ToolState.compareEnabled || !ToolState.targetRackLayerId) return null;

      const result = window.InventoryManager?.checkRackLayerMismatch?.(itemRackLayerId);
      if (result?.mismatch && result?.suggest) {
        const confirmMsg = `棚位置が一致しません\n現在：${result.itemRackLayerId}\n目標：${result.targetRackLayerId}\n位置を変更しますか？\n\nVị trí không khớp.\nHiện tại: ${result.itemRackLayerId}\nMục tiêu: ${result.targetRackLayerId}\nĐổi vị trí?`;

        if (confirm(confirmMsg)) {
          return {
            shouldRelocate: true,
            itemId,
            itemType,
            oldRackLayerId: result.itemRackLayerId,
            newRackLayerId: result.targetRackLayerId,
          };
        }
      }

      return null;
    },

    // ========================================================================
    // Get current detailModalEnabled state
    // ========================================================================
    getDetailModalEnabled() {
      return ToolState.detailModalEnabled;
    },

    // ✅ r7.3.4: Thêm getter cho multiSelectEnabled
    getMultiSelectEnabled() {
     return ToolState.multiSelectEnabled;
    },
  };

  // ============================================================================
  // Export to global
  // ============================================================================
  window.InventoryToolFloat = InventoryToolFloat;

  // ============================================================================
  // Auto init
  // ============================================================================
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        InventoryToolFloat.init();
      },
      { once: true }
    );
  } else {
    InventoryToolFloat.init();
  }

  // ============================================================================
  // Integration with UIRenderer (card clicks)
  // ============================================================================
  document.addEventListener('DOMContentLoaded', () => {
    // Listen to card clicks for detail modal integration
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.result-card[data-id][data-type]');
      if (!card) return;

      // Only handle if inventory mode is ON and tool is visible
      if (!ToolState.visible || !window.InventoryManager?.getState?.()?.inventoryOn) return;

      const itemId = card.getAttribute('data-id');
      const itemType = card.getAttribute('data-type');
      if (!itemId || !itemType) return;

      // If Detail Modal is ON, let the default handler open detail modal
      if (ToolState.detailModalEnabled) {
        // Check RackLayer mismatch if compare is enabled
        const itemData = card.itemData;
        const itemRackLayerId = itemData?.RackLayerID || itemData?.currentRackLayer;
        const mismatch = window.InventoryToolFloat.checkAndPromptRackLayerMismatch(itemId, itemType, itemRackLayerId);

        if (mismatch?.shouldRelocate) {
          e.preventDefault();
          e.stopPropagation();

          // Perform relocate
          window.InventoryManager?.relocateAndAudit?.(
            mismatch.itemId,
            mismatch.itemType,
            mismatch.newRackLayerId,
            {
              oldRackLayerId: mismatch.oldRackLayerId,
              locationNotes: '棚卸時に位置変更 / Thay đổi vị trí khi kiểm kê',
              alsoAudit: true,
            }
          ).then(() => {
            // Re-render
            if (window.UIRenderer && isFn(window.UIRenderer.renderResults)) {
              const allResults = window.UIRenderer.state?.allResults;
              window.UIRenderer.renderResults(allResults);
            }
          });

          return;
        }

        // Let default detail modal handler work
        return;
      }

      // If Detail Modal is OFF, handle selection toggle
      e.preventDefault();
      e.stopPropagation();

      if (!window.SelectionManager || !isFn(window.SelectionManager.toggleItem)) return;

      const itemData = card.itemData || null;

      // If multi-select is OFF, clear other selections first
      if (!ToolState.multiSelectEnabled) {
        const currentlySelected = window.SelectionManager.isSelected?.(itemId, itemType);
        if (!currentlySelected && isFn(window.SelectionManager.clear)) {
          window.SelectionManager.clear();
        }
      }

      // Toggle selection
      window.SelectionManager.toggleItem(itemId, itemType, itemData);
    });
  });
})();
