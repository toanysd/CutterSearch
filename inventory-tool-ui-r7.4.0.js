/*
==================================================

INVENTORY TOOL UI R7.4.0

UI Component cho công cụ kiểm kê (JP優先 / VI)

- Hỗ trợ Quick session (Mode Q): “Kiểm kê ngay / クイック棚卸”
- Mặc định Selection mode ON trong session (multi-select)
- Có toggle: 複数選択 / Chọn nhiều
- Có toggle: 詳細自動 / Auto detail (khi OFF: click card chủ yếu dùng để chọn)
- Settings modal: A/B + thêm Quick Q (chọn operator rồi start ngay)
- Đồng bộ SelectionManager + header toggle + body class
- Tương thích event names:
  - New: inventorymodeChanged, inventoryrequestStartSession, ...
  - Legacy: inventory:modeChanged, inventory:requestStartSession, ...

Created: 2026-01-07
Version: r7.4.0

Dependencies: inventory-manager-styles-r7.4.0.css

==================================================
*/

(function () {
  'use strict';

  // ========================================
  // GLOBAL STATE
  // ========================================
  const UI = {
    miniTool: null,
    expandedTool: null,
    sessionModal: null,
    historyPopup: null,

    currentState: {
      inventoryOn: false,
      sessionActive: false,
      sessionData: null,
      selectedCount: 0,

      // session manager r7.4.0 default ON in session, but keep local state too
      multiSelectEnabled: true,

      // NEW: Auto detail behavior (UI-side)
      autoDetailEnabled: false
    }
  };

  // ========================================
  // MULTILINGUAL LABELS (JP優先)
  // ========================================
  const LABELS = {
    inventory: { ja: '棚卸', vi: 'Kiểm kê' },
    quick: { ja: 'クイック棚卸', vi: 'Kiểm kê ngay' },

    on: { ja: 'ON', vi: 'BẬT' },
    off: { ja: 'OFF', vi: 'TẮT' },

    operator: { ja: '担当者', vi: 'Nhân viên' },
    session: { ja: 'セッション', vi: 'Phiên' },
    counter: { ja: '選択', vi: 'đã chọn' },

    audit: { ja: '棚卸', vi: 'Kiểm kê' },
    auditBatch: { ja: '一括棚卸', vi: 'Kiểm kê hàng loạt' },

    exit: { ja: '終了', vi: 'Thoát' },
    exitSession: { ja: 'セッション終了', vi: 'Thoát phiên' },

    settings: { ja: '設定', vi: 'Thiết lập' },
    history: { ja: '履歴', vi: 'Lịch sử' },

    mode: { ja: 'モード', vi: 'Chế độ' },
    modeA: { ja: 'モードA', vi: 'Mode A: Theo giá' },
    modeB: { ja: 'モードB', vi: 'Mode B: Theo danh sách' },
    modeQ: { ja: 'クイック(Q)', vi: 'Quick (Q)' },

    note: { ja: 'メモ', vi: 'Ghi chú...' },

    multiSelect: { ja: '複数選択', vi: 'Chọn nhiều' },
    autoDetail: { ja: '詳細自動', vi: 'Auto detail' },

    compareRack: { ja: '位置比較', vi: 'So sánh vị trí' },
    targetRack: { ja: '対象棚', vi: 'Giá mục tiêu' },

    save: { ja: '保存', vi: 'Lưu' },
    cancel: { ja: 'キャンセル', vi: 'Hủy' },
    start: { ja: 'スタート', vi: 'Bắt đầu' },
    close: { ja: '閉じる', vi: 'Đóng' },

    items: { ja: '件', vi: 'mục' },
    noHistory: { ja: '履歴なし', vi: 'Chưa có lịch sử' }
  };

  // ========================================
  // HELPERS
  // ========================================
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderLabel(key) {
    const label = LABELS[key];
    if (!label) return key;
    return `<span class="label-ja">${escapeHtml(label.ja)}</span><span class="label-vi">${escapeHtml(label.vi)}</span>`;
  }

  function safeGet(obj, path, fallback) {
    try {
      const parts = String(path).split('.');
      let cur = obj;
      for (const p of parts) {
        if (!cur) return fallback;
        cur = cur[p];
      }
      return cur == null ? fallback : cur;
    } catch {
      return fallback;
    }
  }

  function readLocalBool(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return raw === '1' || raw === 'true';
    } catch {
      return fallback;
    }
  }

  function writeLocalBool(key, value) {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      // ignore
    }
  }

  // Event bridge: new + legacy
  const EventBridge = {
    emitBoth(newName, legacyName, detail) {
      try {
        document.dispatchEvent(new CustomEvent(newName, { detail }));
      } catch (e) {
        console.warn('[InventoryToolUI r7.4.0] emit new event failed', newName, e);
      }
      try {
        document.dispatchEvent(new CustomEvent(legacyName, { detail }));
      } catch (e) {
        console.warn('[InventoryToolUI r7.4.0] emit legacy event failed', legacyName, e);
      }
    },

    onBoth(newName, legacyName, handler, opts) {
      document.addEventListener(newName, handler, opts);
      document.addEventListener(legacyName, handler, opts);
    }
  };

  // ========================================
  // PUBLIC API
  // ========================================
  window.InventoryToolUI = {
    init() {
      console.log('[InventoryToolUI r7.4.0] Initializing...');

      // Load UI preferences
      UI.currentState.autoDetailEnabled = readLocalBool('inventory.ui.autoDetail.v1', false);

      this.bindGlobalEvents();
      console.log('[InventoryToolUI r7.4.0] Initialized');
    },

    // -------------------------------
    // GLOBAL EVENTS
    // -------------------------------
    bindGlobalEvents() {
      // inventory mode changed (new + legacy)
      EventBridge.onBoth('inventorymodeChanged', 'inventory:modeChanged', (e) => {
        const detail = (e && e.detail) || {};
        const inventoryOn = !!detail.inventoryOn;
        const sessionActive = !!detail.sessionActive;

        UI.currentState.inventoryOn = inventoryOn;
        UI.currentState.sessionActive = sessionActive;

        if (inventoryOn && !sessionActive) {
          this.showMiniTool();
          this.hideExpandedTool();
        } else if (inventoryOn && sessionActive) {
          this.hideMiniTool();
          this.showExpandedTool();
        } else {
          this.hideMiniTool();
          this.hideExpandedTool();
        }

        this.applySelectionModeSync();
        this.syncAutoDetailToggle(UI.currentState.autoDetailEnabled);
      });

      // selection count changed
      EventBridge.onBoth('inventoryselectionChanged', 'inventory:selectionChanged', (e) => {
        const d = (e && e.detail) || {};
        const count = typeof d.count === 'number' ? d.count : 0;
        UI.currentState.selectedCount = count || 0;

        this.updateCounter(UI.currentState.selectedCount);
        this.updateMobileHeaderSelectedCount(UI.currentState.selectedCount);
      });

      // session updated
      EventBridge.onBoth('inventorysessionUpdated', 'inventory:sessionUpdated', (e) => {
        UI.currentState.sessionData = (e && e.detail) || null;

        // In r7.4.0, session should default multi-select ON;
        // keep local state in sync if current session exists.
        if (UI.currentState.sessionData) {
          UI.currentState.multiSelectEnabled = true;
        }

        this.updateSessionInfo();
      });

      // SelectionManager -> UI
      document.addEventListener('selectionmodeChanged', (e) => {
        const enabled = (e && e.detail && typeof e.detail === 'object')
          ? !!e.detail.enabled
          : !!(e && e.detail);

        UI.currentState.multiSelectEnabled = enabled;
        this.syncMultiSelectToggle(enabled);
        this.syncHeaderSelectionToggle(enabled);
        this.syncBodySelectionClass(enabled);

        this.updateMobileHeaderSelectedCount(UI.currentState.selectedCount || 0);
      });

      // Optional: allow external modules to set auto detail
      document.addEventListener('inventoryautodetailChanged', (e) => {
        const enabled = (e && e.detail && typeof e.detail === 'object')
          ? !!e.detail.enabled
          : !!(e && e.detail);
        UI.currentState.autoDetailEnabled = enabled;
        writeLocalBool('inventory.ui.autoDetail.v1', enabled);
        this.syncAutoDetailToggle(enabled);
      });
    },

    // -------------------------------
    // MINI TOOL
    // -------------------------------
    showMiniTool() {
      if (UI.miniTool) {
        UI.miniTool.style.display = 'flex';
        return;
      }
      const html = this.renderMiniToolHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      UI.miniTool = document.getElementById('inv-tool-mini');
      this.bindMiniToolEvents();
    },

    hideMiniTool() {
      if (UI.miniTool) {
        UI.miniTool.remove();
        UI.miniTool = null;
      }
    },

    renderMiniToolHTML() {
      const state = window.InventorySessionManager?.getState?.() || {};
      const operatorName =
        safeGet(state, 'config.lastOperatorName', '') ||
        UI.currentState.sessionData?.operatorName ||
        '---';

      return `
        <div id="inv-tool-mini" class="inv-tool-mini">
          <div class="inv-tool-mini-header">
            <div class="inv-tool-mini-title">
              <i class="fas fa-warehouse"></i>
              ${renderLabel('inventory')}
            </div>
            <button class="inv-tool-mini-close" id="inv-mini-close" title="${escapeHtml(LABELS.exit.ja)} / ${escapeHtml(LABELS.exit.vi)}">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="inv-tool-mini-body">
            <div class="inv-tool-mini-row">
              <span class="inv-tool-mini-label">${renderLabel('operator')}:</span>
              <span class="inv-tool-mini-value" id="inv-mini-operator">${escapeHtml(operatorName)}</span>
            </div>

            <div class="inv-tool-mini-actions">
              <button class="inv-tool-btn inv-tool-btn-primary" id="inv-mini-quick-start">
                <i class="fas fa-bolt"></i>
                ${renderLabel('quick')}
              </button>

              <button class="inv-tool-btn inv-tool-btn-secondary" id="inv-mini-settings">
                <i class="fas fa-cog"></i>
                ${renderLabel('settings')}
              </button>
            </div>

            <div class="inv-tool-mini-badge">${renderLabel('on')}</div>
          </div>
        </div>
      `;
    },

    bindMiniToolEvents() {
      const closeBtn = document.getElementById('inv-mini-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          EventBridge.emitBoth('inventoryrequestClose', 'inventory:requestClose', { source: 'mini-tool' });
        });
      }

      const settingsBtn = document.getElementById('inv-mini-settings');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
          this.showSessionSetupModal();
        });
      }

      const quickBtn = document.getElementById('inv-mini-quick-start');
      if (quickBtn) {
        quickBtn.addEventListener('click', () => {
          // Quick start requires operator; if missing -> open modal (Q tab)
          const state = window.InventorySessionManager?.getState?.() || {};
          const operatorId = safeGet(state, 'config.lastOperatorId', '') || '';
          const operatorName = safeGet(state, 'config.lastOperatorName', '') || '';

          if (operatorId && operatorName && !String(operatorName).includes('--')) {
            // Start quick session directly (Mode Q)
            EventBridge.emitBoth(
              'inventoryrequestStartQuickSession',
              'inventory:requestStartQuickSession',
              { mode: 'Q', operatorId, operatorName, remember: true, source: 'mini-tool-quick' }
            );
          } else {
            // No operator remembered => show modal and focus Q tab
            this.showSessionSetupModal('mode-q');
          }
        });
      }
    },

    // -------------------------------
    // EXPANDED TOOL
    // -------------------------------
    showExpandedTool() {
      if (UI.expandedTool) {
        UI.expandedTool.style.display = 'flex';
        return;
      }
      const html = this.renderExpandedToolHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      UI.expandedTool = document.getElementById('inv-tool-expanded');
      this.bindExpandedToolEvents();

      // sync toggles
      this.syncMultiSelectToggle(UI.currentState.multiSelectEnabled);
      this.syncAutoDetailToggle(UI.currentState.autoDetailEnabled);
      this.applySelectionModeSync();
    },

    hideExpandedTool() {
      if (UI.expandedTool) {
        UI.expandedTool.remove();
        UI.expandedTool = null;
      }
    },

    renderExpandedToolHTML() {
      const session = UI.currentState.sessionData || {};
      const sessionId = session.sessionId || '---';
      const operatorName = session.operatorName || '---';
      const mode = session.mode || 'Q';
      const selectedCount = UI.currentState.selectedCount || 0;
      const multiSelectEnabled = !!UI.currentState.multiSelectEnabled;
      const autoDetailEnabled = !!UI.currentState.autoDetailEnabled;

      return `
        <div id="inv-tool-expanded" class="inv-tool-expanded">
          <!-- Header -->
          <div class="inv-tool-expanded-header">
            <div class="inv-tool-expanded-title">
              <div class="inv-tool-session-id">
                <i class="fas fa-clipboard-list"></i>
                <span id="inv-expanded-session-id">${escapeHtml(sessionId)}</span>
              </div>
              <div class="inv-tool-session-meta">
                <span><i class="fas fa-user"></i> <span id="inv-expanded-operator">${escapeHtml(operatorName)}</span></span>
                <span><i class="fas fa-cog"></i> ${renderLabel('mode')}: <strong id="inv-expanded-mode">${escapeHtml(mode)}</strong></span>
              </div>
            </div>

            <div class="inv-tool-expanded-actions">
              <button class="inv-tool-btn-icon" id="inv-expanded-history" title="${escapeHtml(LABELS.history.ja)} / ${escapeHtml(LABELS.history.vi)}">
                <i class="fas fa-clock"></i>
              </button>

              <button class="inv-tool-btn-icon" id="inv-expanded-settings" title="${escapeHtml(LABELS.settings.ja)} / ${escapeHtml(LABELS.settings.vi)}">
                <i class="fas fa-cog"></i>
              </button>

              <button class="inv-tool-btn-icon inv-tool-btn-close" id="inv-expanded-exit-session" title="${escapeHtml(LABELS.exitSession.ja)} / ${escapeHtml(LABELS.exitSession.vi)}">
                <i class="fas fa-door-open"></i>
              </button>

              <button class="inv-tool-btn-icon inv-tool-btn-close" id="inv-expanded-close" title="${escapeHtml(LABELS.exit.ja)} / ${escapeHtml(LABELS.exit.vi)}">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="inv-tool-expanded-body">
            <!-- Info -->
            <div class="inv-tool-info">
              <div class="inv-tool-info-row">
                <i class="fas fa-warehouse inv-tool-info-icon"></i>
                <span class="inv-tool-info-label">${renderLabel('session')}:</span>
                <span class="inv-tool-info-value" id="inv-info-session">${escapeHtml(sessionId)}</span>
              </div>

              <div class="inv-tool-info-row">
                <i class="fas fa-user inv-tool-info-icon"></i>
                <span class="inv-tool-info-label">${renderLabel('operator')}:</span>
                <span class="inv-tool-info-value" id="inv-info-operator">${escapeHtml(operatorName)}</span>
              </div>

              <div class="inv-tool-info-row">
                <i class="fas fa-list-check inv-tool-info-icon"></i>
                <span class="inv-tool-info-label">${renderLabel('mode')}:</span>
                <span class="inv-tool-info-value" id="inv-info-mode">${escapeHtml(mode)}</span>
              </div>
            </div>

            <!-- Counter -->
            <div class="inv-tool-counter">
              <div class="inv-tool-counter-label">${renderLabel('counter')}</div>
              <div class="inv-tool-counter-value" id="inv-tool-counter-value">${selectedCount}</div>
            </div>

            <!-- Buttons -->
            <div class="inv-tool-buttons">
              <button class="inv-tool-btn inv-tool-btn-primary" id="inv-btn-audit-single" ${selectedCount !== 1 ? 'disabled' : ''}>
                <i class="fas fa-check"></i>
                ${renderLabel('audit')}
              </button>

              <button class="inv-tool-btn inv-tool-btn-primary" id="inv-btn-audit-batch" ${selectedCount < 1 ? 'disabled' : ''}>
                <i class="fas fa-clipboard-check"></i>
                ${renderLabel('auditBatch')}
              </button>

              <button class="inv-tool-btn inv-tool-btn-secondary" id="inv-btn-exit-session">
                <i class="fas fa-door-open"></i>
                ${renderLabel('exitSession')}
              </button>
            </div>
          </div>

          <!-- Toggles -->
          <div class="inv-tool-toggles">
            <div class="inv-tool-toggle">
              <div class="inv-tool-toggle-label">
                <i class="fas fa-check-square"></i>
                ${renderLabel('multiSelect')}
              </div>
              <label class="inv-tool-toggle-switch">
                <input type="checkbox" id="inv-toggle-multi-select" ${multiSelectEnabled ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>

            <div class="inv-tool-toggle">
              <div class="inv-tool-toggle-label">
                <i class="fas fa-eye"></i>
                ${renderLabel('autoDetail')}
              </div>
              <label class="inv-tool-toggle-switch">
                <input type="checkbox" id="inv-toggle-auto-detail" ${autoDetailEnabled ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
          </div>

        </div>
      `;
    },

    bindExpandedToolEvents() {
      // Close all
      const closeBtn = document.getElementById('inv-expanded-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          EventBridge.emitBoth('inventoryrequestClose', 'inventory:requestClose', { source: 'expanded-tool', exitAll: true });
        });
      }

      // Exit session
      const exitSessionBtn = document.getElementById('inv-expanded-exit-session');
      const exitSessionBtn2 = document.getElementById('inv-btn-exit-session');
      [exitSessionBtn, exitSessionBtn2].forEach((btn) => {
        if (!btn) return;
        btn.addEventListener('click', () => {
          EventBridge.emitBoth('inventoryrequestExitSession', 'inventory:requestExitSession', { source: 'expanded-tool' });
        });
      });

      // Settings
      const settingsBtn = document.getElementById('inv-expanded-settings');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => this.showSessionSetupModal());
      }

      // History
      const historyBtn = document.getElementById('inv-expanded-history');
      if (historyBtn) {
        historyBtn.addEventListener('click', () => {
          EventBridge.emitBoth('inventoryrequestHistory', 'inventory:requestHistory', { source: 'expanded-tool' });
        });
      }

      // Audit single
      const auditSingleBtn = document.getElementById('inv-btn-audit-single');
      if (auditSingleBtn) {
        auditSingleBtn.addEventListener('click', () => {
          if (UI.currentState.selectedCount !== 1) return;
          EventBridge.emitBoth('inventoryrequestAuditSingle', 'inventory:requestAuditSingle', { source: 'expanded-tool' });
          this.closeDetailModal();
        });
      }

      // Audit batch
      const auditBatchBtn = document.getElementById('inv-btn-audit-batch');
      if (auditBatchBtn) {
        auditBatchBtn.addEventListener('click', () => {
          if (UI.currentState.selectedCount < 1) return;
          EventBridge.emitBoth('inventoryrequestAuditBatch', 'inventory:requestAuditBatch', { source: 'expanded-tool' });
          this.closeDetailModal();
        });
      }

      // Toggle multi-select
      const toggleMulti = document.getElementById('inv-toggle-multi-select');
      if (toggleMulti) {
        toggleMulti.addEventListener('change', (e) => {
          const enabled = !!e.target.checked;
          UI.currentState.multiSelectEnabled = enabled;

          EventBridge.emitBoth(
            'inventorymultiSelectChanged',
            'inventory:multiSelectChanged',
            { enabled, source: 'expanded-tool' }
          );

          // direct sync to SelectionManager (best-effort)
          if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
            window.SelectionManager.setMode(enabled);
            if (!enabled && typeof window.SelectionManager.clear === 'function') window.SelectionManager.clear();
          }

          this.syncHeaderSelectionToggle(enabled);
          this.syncBodySelectionClass(enabled);
          this.updateMobileHeaderSelectedCount(UI.currentState.selectedCount || 0);
        });
      }

      // Toggle auto detail
      const toggleAutoDetail = document.getElementById('inv-toggle-auto-detail');
      if (toggleAutoDetail) {
        toggleAutoDetail.addEventListener('change', (e) => {
          const enabled = !!e.target.checked;
          UI.currentState.autoDetailEnabled = enabled;
          writeLocalBool('inventory.ui.autoDetail.v1', enabled);
          this.syncAutoDetailToggle(enabled);

          // Notify (optional)
          document.dispatchEvent(new CustomEvent('inventoryautodetailChanged', { detail: { enabled } }));
        });
      }
    },

    // -------------------------------
    // UI SYNC / BEHAVIORS
    // -------------------------------
    closeDetailModal() {
      const mobileModal = document.getElementById('mobile-detail-modal');
      if (mobileModal) mobileModal.style.display = 'none';

      const detailPanel = document.querySelector('.detail-panel');
      if (detailPanel && detailPanel.classList.contains('active')) {
        detailPanel.classList.remove('active');
      }
    },

    syncMultiSelectToggle(enabled) {
      const toggle = document.getElementById('inv-toggle-multi-select');
      if (toggle) toggle.checked = !!enabled;
    },

    syncAutoDetailToggle(enabled) {
      const toggle = document.getElementById('inv-toggle-auto-detail');
      if (toggle) toggle.checked = !!enabled;

      // global class for other modules to read (optional)
      document.body.classList.toggle('inventory-auto-detail', !!enabled);
    },

    syncHeaderSelectionToggle(enabled) {
      const headerToggle = document.getElementById('selection-mode-toggle');
      if (headerToggle) headerToggle.checked = !!enabled;
    },

    syncBodySelectionClass(enabled) {
      document.body.classList.toggle('selection-active', !!enabled);
    },

    updateMobileHeaderSelectedCount(count) {
      const countEl = document.getElementById('selected-count-inline');
      if (countEl) countEl.textContent = String(count || 0);

      const clearBtn = document.getElementById('mobile-clear-selection-inline');
      if (clearBtn) clearBtn.disabled = !(count > 0);

      const printBtn = document.getElementById('mobile-print-btn-inline');
      if (printBtn) printBtn.disabled = !(count > 0);
    },

    applySelectionModeSync() {
      // enable selection mode only when sessionActive && multiSelectEnabled
      const shouldEnable = !!(UI.currentState.sessionActive && UI.currentState.multiSelectEnabled);

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(shouldEnable);
        if (!shouldEnable && typeof window.SelectionManager.clear === 'function') {
          window.SelectionManager.clear();
        }
      }

      this.syncHeaderSelectionToggle(shouldEnable);
      this.syncBodySelectionClass(shouldEnable);
      this.updateMobileHeaderSelectedCount(UI.currentState.selectedCount || 0);
    },

    updateCounter(count) {
      const counterValue = document.getElementById('inv-tool-counter-value');
      if (counterValue) counterValue.textContent = String(count || 0);

      const auditSingleBtn = document.getElementById('inv-btn-audit-single');
      const auditBatchBtn = document.getElementById('inv-btn-audit-batch');

      if (auditSingleBtn) auditSingleBtn.disabled = (count !== 1);
      if (auditBatchBtn) auditBatchBtn.disabled = (count < 1);
    },

    updateSessionInfo() {
      const session = UI.currentState.sessionData || null;

      // mini tool operator
      const miniOperator = document.getElementById('inv-mini-operator');
      if (miniOperator) miniOperator.textContent = session?.operatorName || '---';

      // expanded tool
      const expandedSessionId = document.getElementById('inv-expanded-session-id');
      const expandedOperator = document.getElementById('inv-expanded-operator');
      const expandedMode = document.getElementById('inv-expanded-mode');

      if (expandedSessionId) expandedSessionId.textContent = session?.sessionId || '---';
      if (expandedOperator) expandedOperator.textContent = session?.operatorName || '---';
      if (expandedMode) expandedMode.textContent = session?.mode || 'Q';

      // info panel
      const infoSession = document.getElementById('inv-info-session');
      const infoOperator = document.getElementById('inv-info-operator');
      const infoMode = document.getElementById('inv-info-mode');

      if (infoSession) infoSession.textContent = session?.sessionId || '---';
      if (infoOperator) infoOperator.textContent = session?.operatorName || '---';
      if (infoMode) infoMode.textContent = session?.mode || 'Q';
    },

    // -------------------------------
    // SESSION SETUP MODAL (A/B/Q)
    // -------------------------------
    showSessionSetupModal(preferTab) {
      if (UI.sessionModal) {
        UI.sessionModal.style.display = 'flex';
        if (preferTab) this.activateSessionTab(preferTab);
        return;
      }

      const html = this.renderSessionSetupModalHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      UI.sessionModal = document.getElementById('inv-session-modal-overlay');

      this.bindSessionModalEvents();
      this.populateSessionModalData();

      if (preferTab) this.activateSessionTab(preferTab);
    },

    hideSessionSetupModal() {
      if (UI.sessionModal) {
        UI.sessionModal.remove();
        UI.sessionModal = null;
      }
    },

    renderSessionSetupModalHTML() {
      return `
        <div id="inv-session-modal-overlay" class="inv-overlay">
          <div class="inv-modal inv-modal-large">
            <div class="inv-modal-header">
              <h3>
                <i class="fas fa-cog"></i>
                ${renderLabel('settings')} - ${renderLabel('session')}
              </h3>
              <button class="inv-close-btn" id="inv-session-modal-close">
                <i class="fas fa-times"></i>
              </button>
            </div>

            <div class="inv-modal-body">
              <div class="inv-session-tabs">
                <button class="inv-session-tab active" data-tab="mode-q">
                  <i class="fas fa-bolt"></i>
                  ${renderLabel('modeQ')}
                </button>
                <button class="inv-session-tab" data-tab="mode-a">
                  <i class="fas fa-warehouse"></i>
                  ${renderLabel('modeA')}
                </button>
                <button class="inv-session-tab" data-tab="mode-b">
                  <i class="fas fa-list"></i>
                  ${renderLabel('modeB')}
                </button>
              </div>

              <!-- Mode Q -->
              <div class="inv-session-content active" data-content="mode-q">
                <div class="inv-mode-description">
                  <h4><span class="inv-mode-badge"><i class="fas fa-bolt"></i> Mode Q</span></h4>
                  <p>
                    <span class="label-ja">すぐ棚卸（複数選択ON）</span>
                    <span class="label-vi">Kiểm kê ngay (mặc định bật chọn nhiều).</span>
                  </p>
                  <ul class="inv-mode-features">
                    <li><span class="label-ja">複数選択がデフォルト</span><span class="label-vi">Mặc định chọn nhiều</span></li>
                    <li><span class="label-ja">カードクリックは選択優先</span><span class="label-vi">Click ưu tiên chọn</span></li>
                  </ul>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-user"></i>
                    ${renderLabel('operator')}
                    <span class="required">*</span>
                  </label>
                  <select class="inv-select" id="inv-session-operator-q" required>
                    <option value="">-- ${escapeHtml(LABELS.operator.ja)} / ${escapeHtml(LABELS.operator.vi)} --</option>
                  </select>
                </div>

                <div class="inv-form-group">
                  <label class="inv-checkbox-label">
                    <input type="checkbox" id="inv-session-remember-q" checked>
                    <span>
                      <i class="fas fa-save"></i>
                      <span class="label-ja">担当者を記憶</span>
                      <span class="label-vi">Nhớ nhân viên cho lần sau</span>
                    </span>
                  </label>
                </div>

                <div class="inv-form-group">
                  <button class="inv-btn inv-btn-primary" id="inv-session-start-q">
                    <i class="fas fa-bolt"></i>
                    ${renderLabel('quick')}
                  </button>
                </div>
              </div>

              <!-- Mode A -->
              <div class="inv-session-content" data-content="mode-a">
                <div class="inv-mode-description">
                  <h4><span class="inv-mode-badge"><i class="fas fa-warehouse"></i> Mode A</span></h4>
                  <p>
                    <span class="label-ja">棚ごとに棚卸</span>
                    <span class="label-vi">Kiểm kê theo giá (có thể so sánh vị trí).</span>
                  </p>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-user"></i>
                    ${renderLabel('operator')}
                    <span class="required">*</span>
                  </label>
                  <select class="inv-select" id="inv-session-operator-a" required>
                    <option value="">-- ${escapeHtml(LABELS.operator.ja)} / ${escapeHtml(LABELS.operator.vi)} --</option>
                  </select>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-tag"></i>
                    <span class="label-ja">セッション名</span>
                    <span class="label-vi">Tên phiên</span>
                  </label>
                  <input type="text" class="inv-input" id="inv-session-name-a" placeholder="(任意 / tùy chọn)">
                  <small class="inv-help-text">
                    <span class="label-ja">未入力の場合は自動生成</span>
                    <span class="label-vi">Để trống sẽ tự tạo</span>
                  </small>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-warehouse"></i>
                    ${renderLabel('targetRack')}
                  </label>
                  <select class="inv-select" id="inv-session-target-rack-a">
                    <option value="">-- ${escapeHtml(LABELS.targetRack.ja)} / ${escapeHtml(LABELS.targetRack.vi)} --</option>
                  </select>
                </div>

                <div class="inv-form-group">
                  <label class="inv-checkbox-label">
                    <input type="checkbox" id="inv-session-compare-rack-a">
                    <span>
                      <i class="fas fa-check-double"></i>
                      ${renderLabel('compareRack')}
                    </span>
                  </label>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-sticky-note"></i>
                    ${renderLabel('note')}
                  </label>
                  <textarea class="inv-textarea" id="inv-session-note-a" placeholder="${escapeHtml(LABELS.note.ja)} / ${escapeHtml(LABELS.note.vi)}"></textarea>
                </div>

                <div class="inv-form-group">
                  <label class="inv-checkbox-label">
                    <input type="checkbox" id="inv-session-remember-a" checked>
                    <span>
                      <i class="fas fa-save"></i>
                      <span class="label-ja">担当者を記憶</span>
                      <span class="label-vi">Nhớ nhân viên cho lần sau</span>
                    </span>
                  </label>
                </div>
              </div>

              <!-- Mode B -->
              <div class="inv-session-content" data-content="mode-b">
                <div class="inv-mode-description">
                  <h4><span class="inv-mode-badge"><i class="fas fa-list"></i> Mode B</span></h4>
                  <p>
                    <span class="label-ja">リストごとに棚卸</span>
                    <span class="label-vi">Kiểm kê theo danh sách.</span>
                  </p>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-user"></i>
                    ${renderLabel('operator')}
                    <span class="required">*</span>
                  </label>
                  <select class="inv-select" id="inv-session-operator-b" required>
                    <option value="">-- ${escapeHtml(LABELS.operator.ja)} / ${escapeHtml(LABELS.operator.vi)} --</option>
                  </select>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-tag"></i>
                    <span class="label-ja">セッション名</span>
                    <span class="label-vi">Tên phiên</span>
                  </label>
                  <input type="text" class="inv-input" id="inv-session-name-b" placeholder="(任意 / tùy chọn)">
                  <small class="inv-help-text">
                    <span class="label-ja">未入力の場合は自動生成</span>
                    <span class="label-vi">Để trống sẽ tự tạo</span>
                  </small>
                </div>

                <div class="inv-form-group">
                  <label>
                    <i class="fas fa-sticky-note"></i>
                    ${renderLabel('note')}
                  </label>
                  <textarea class="inv-textarea" id="inv-session-note-b" placeholder="${escapeHtml(LABELS.note.ja)} / ${escapeHtml(LABELS.note.vi)}"></textarea>
                </div>

                <div class="inv-form-group">
                  <label class="inv-checkbox-label">
                    <input type="checkbox" id="inv-session-remember-b" checked>
                    <span>
                      <i class="fas fa-save"></i>
                      <span class="label-ja">担当者を記憶</span>
                      <span class="label-vi">Nhớ nhân viên cho lần sau</span>
                    </span>
                  </label>
                </div>
              </div>

            </div>

            <div class="inv-modal-footer">
              <button class="inv-btn inv-btn-secondary" id="inv-session-cancel">
                <i class="fas fa-times"></i>
                ${renderLabel('cancel')}
              </button>

              <button class="inv-btn inv-btn-primary" id="inv-session-start">
                <i class="fas fa-play"></i>
                ${renderLabel('start')}
              </button>
            </div>

          </div>
        </div>
      `;
    },

    activateSessionTab(tabName) {
      const tabs = document.querySelectorAll('.inv-session-tab');
      const contents = document.querySelectorAll('.inv-session-content');

      tabs.forEach((t) => {
        const isTarget = t.getAttribute('data-tab') === tabName;
        t.classList.toggle('active', isTarget);
      });

      contents.forEach((c) => {
        const isTarget = c.getAttribute('data-content') === tabName;
        c.classList.toggle('active', isTarget);
      });
    },

    bindSessionModalEvents() {
      const closeBtn = document.getElementById('inv-session-modal-close');
      const cancelBtn = document.getElementById('inv-session-cancel');
      [closeBtn, cancelBtn].forEach((btn) => {
        if (!btn) return;
        btn.addEventListener('click', () => this.hideSessionSetupModal());
      });

      const overlay = document.getElementById('inv-session-modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'inv-session-modal-overlay') this.hideSessionSetupModal();
        });
      }

      const tabs = document.querySelectorAll('.inv-session-tab');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const targetTab = tab.getAttribute('data-tab');
          this.activateSessionTab(targetTab);
        });
      });

      // Start (A/B) from footer
      const startBtn = document.getElementById('inv-session-start');
      if (startBtn) {
        startBtn.addEventListener('click', () => this.handleSessionStartAB());
      }

      // Quick start (Q)
      const quickStartBtn = document.getElementById('inv-session-start-q');
      if (quickStartBtn) {
        quickStartBtn.addEventListener('click', () => this.handleSessionStartQ());
      }
    },

    populateSessionModalData() {
      const employees = window.DataManager?.data?.employees || [];
      const state = window.InventorySessionManager?.getState?.() || {};
      const lastOperatorId = safeGet(state, 'config.lastOperatorId', '');

      // Operator selects: Q/A/B
      ['q', 'a', 'b'].forEach((m) => {
        const select = document.getElementById(`inv-session-operator-${m}`);
        if (!select) return;

        while (select.options.length > 1) select.remove(1);

        employees.forEach((emp) => {
          const option = document.createElement('option');
          option.value = emp.EmployeeID;
          option.textContent = `${emp.EmployeeName} (${emp.EmployeeID})`;
          select.appendChild(option);
        });

        if (lastOperatorId) select.value = lastOperatorId;
      });

      // Rack list (Mode A)
      const rackSelect = document.getElementById('inv-session-target-rack-a');
      if (rackSelect) {
        while (rackSelect.options.length > 1) rackSelect.remove(1);
        const rackLayers = window.DataManager?.data?.racklayers || [];
        const unique = [...new Set(rackLayers.map((r) => r.RackLayerID))].filter(Boolean);
        unique.forEach((rackLayerId) => {
          const opt = document.createElement('option');
          opt.value = rackLayerId;
          opt.textContent = rackLayerId;
          rackSelect.appendChild(opt);
        });
      }
    },

    handleSessionStartQ() {
      const operatorSelect = document.getElementById('inv-session-operator-q');
      const operatorId = operatorSelect?.value || '';
      const operatorName = operatorSelect?.selectedOptions?.[0]?.text || '';
      const remember = !!document.getElementById('inv-session-remember-q')?.checked;

      if (!operatorId || !operatorName || String(operatorName).includes('--')) {
        alert(`${LABELS.operator.ja} / ${LABELS.operator.vi}`);
        return;
      }

      EventBridge.emitBoth(
        'inventoryrequestStartQuickSession',
        'inventory:requestStartQuickSession',
        { mode: 'Q', operatorId, operatorName, remember, source: 'session-modal-q' }
      );

      this.hideSessionSetupModal();
    },

    handleSessionStartAB() {
      const activeTab = document.querySelector('.inv-session-tab.active');
      const tab = activeTab?.getAttribute('data-tab') || 'mode-a';
      const mode = (tab === 'mode-b') ? 'B' : 'A';

      const operatorSelect = document.getElementById(`inv-session-operator-${mode.toLowerCase()}`);
      const operatorId = operatorSelect?.value || '';
      const operatorName = operatorSelect?.selectedOptions?.[0]?.text || '';
      const sessionName = (document.getElementById(`inv-session-name-${mode.toLowerCase()}`)?.value || '').trim();
      const note = (document.getElementById(`inv-session-note-${mode.toLowerCase()}`)?.value || '').trim();
      const remember = !!document.getElementById(`inv-session-remember-${mode.toLowerCase()}`)?.checked;

      if (!operatorId || !operatorName || String(operatorName).includes('--')) {
        alert(`${LABELS.operator.ja} / ${LABELS.operator.vi}`);
        return;
      }

      let targetRackLayerId = null;
      let compareEnabled = false;
      if (mode === 'A') {
        targetRackLayerId = document.getElementById('inv-session-target-rack-a')?.value || null;
        compareEnabled = !!document.getElementById('inv-session-compare-rack-a')?.checked;
      }

      EventBridge.emitBoth(
        'inventoryrequestStartSession',
        'inventory:requestStartSession',
        {
          mode,
          operatorId,
          operatorName,
          sessionName: sessionName || null,
          note,
          remember,
          targetRackLayerId,
          compareEnabled,
          source: 'session-modal-ab'
        }
      );

      this.hideSessionSetupModal();
    }
  };

  // ========================================
  // AUTO INIT
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.InventoryToolUI.init();
    });
  } else {
    window.InventoryToolUI.init();
  }
})();
