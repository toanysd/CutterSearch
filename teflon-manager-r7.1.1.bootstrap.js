/**
 * teflon-manager-r7.1.1.bootstrap.js
 * Bootstrap / 起動補助 (JP優先 / Ưu tiên tiếng Nhật)
 *
 * 目的 / Mục tiêu:
 * - Apply theme/i18n/badge đúng thời điểm.
 * - Click "tên khuôn" (data-action="open-process") => mở modal chuẩn của teflon-process-manager-r7.1.1.js.
 * - Tương thích API: teflon-process-manager hiện có openPanel(item), nên bootstrap tạo alias open(...) => openPanel(...).
 *
 * 推奨ロード順 / Load order:
 * 1) teflon-manager-r7.1.1.core.js
 * 2) teflon-process-manager-r7.1.1.js
 * 3) teflon-manager-r7.1.1.theme.js
 * 4) teflon-manager-r7.1.1.i18n.js
 * 5) teflon-manager-r7.1.1.badge.js
 * 6) teflon-manager-r7.1.1.bootstrap.js (this)
 */

(function () {
  'use strict';

  const BOOT = {
    version: 'r7.1.1',
    maxRetrySeconds: 12,
    tickMs: 400,

    openProcessRetryMs: 250,
    openProcessMaxRetry: 30
  };

  // =========================
  // Helpers
  // =========================
  function safeCall(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function isDataManagerReady() {
    return !!(window.DataManager && window.DataManager.data);
  }

  function getDM() {
    return (window.DataManager && window.DataManager.data) ? window.DataManager.data : null;
  }

  // =========================
  // Apply modules (best-effort)
  // =========================
  function applyThemeIfAny() {
    if (typeof window.TeflonManagerThemeApply === 'function') {
      safeCall(() => window.TeflonManagerThemeApply());
      return true;
    }
    return false;
  }

  function applyI18NIfAny() {
    if (window.TeflonI18N && typeof window.TeflonI18N.patchManager === 'function') {
      safeCall(() => window.TeflonI18N.patchManager());
      safeCall(() => window.TeflonI18N.patchPanel());
      safeCall(() => window.TeflonI18N.patchModal());
      return true;
    }
    return false;
  }

  function buildRowsIfPossible() {
    if (!window.TeflonManager) return false;
    if (typeof window.TeflonManager.buildRows !== 'function') return false;
    if (!isDataManagerReady()) return false;
    safeCall(() => window.TeflonManager.buildRows());
    return true;
  }

  function refreshBadgeIfAny() {
    if (window.TeflonBadgeManager && typeof window.TeflonBadgeManager.refresh === 'function') {
      safeCall(() => window.TeflonBadgeManager.refresh());
      return true;
    }
    if (window.TeflonManager && typeof window.TeflonManager.updateNavBadge === 'function') {
      safeCall(() => window.TeflonManager.updateNavBadge());
      return true;
    }
    return false;
  }

  function fullRefresh() {
    applyThemeIfAny();
    applyI18NIfAny();
    buildRowsIfPossible();
    refreshBadgeIfAny();
  }

  // ======================================================
  // Compatibility shim / 互換レイヤー
  // - ProcessManager exports openPanel(item), not open() [see teflon-process-manager-r7.1.1.js]
  // - Create alias: open(arg) -> openPanel(item)
  // ======================================================
  function getMoldItemById(moldId) {
    const id = String(moldId || '').trim();
    const dm = getDM();
    if (!id || !dm || !Array.isArray(dm.molds)) return null;
    return dm.molds.find(m => String(m.MoldID).trim() === id) || null;
  }

  function ensureTeflonProcessOpenAlias() {
    const m = window.TeflonProcessManager;
    if (!m) return false;

    // already ok
    if (typeof m.open === 'function') return true;

    // create open() alias from openPanel()
    if (typeof m.openPanel === 'function') {
      m.open = function (arg) {
        let moldId = null;
        let item = null;

        if (arg && typeof arg === 'object') {
          moldId = arg.moldId || (arg.teflonRow && arg.teflonRow.MoldID) || null;
          item = arg.item || null;
        } else {
          moldId = arg;
        }

        if (!item && moldId != null) item = getMoldItemById(moldId);
        if (!item && moldId != null) item = { MoldID: String(moldId) };

        return m.openPanel(item);
      };
      return true;
    }

    return false;
  }

  // =========================
  // Open teflon-process-manager
  // =========================
  function openProcessManagerByMoldId(moldId, teflonRow) {
    const id = String(moldId || '').trim();
    if (!id) return;

    let tries = 0;

    const tryOpen = () => {
      tries++;

      // Make sure alias exists if module loaded
      ensureTeflonProcessOpenAlias();

      if (window.TeflonProcessManager && typeof window.TeflonProcessManager.open === 'function') {
        // Preferred: object form
        const ok1 = safeCall(() => window.TeflonProcessManager.open({
          moldId: id,
          source: 'teflon-manager',
          teflonRow: teflonRow || null
        }));

        // Fallback: string form
        if (ok1 === null) safeCall(() => window.TeflonProcessManager.open(id));
        return;
      }

      if (tries < BOOT.openProcessMaxRetry) {
        setTimeout(tryOpen, BOOT.openProcessRetryMs);
      } else {
        console.warn('[TeflonBootstrap] TeflonProcessManager not ready (no open/openPanel). Check load order: teflon-process-manager-r7.1.1.js');
      }
    };

    tryOpen();
  }

  // =========================
  // Hook click/event
  // =========================
  function hookOpenProcessEvents() {
    if (window.__tefBootstrapProcessHooked) return;

    // 1) Event from core (Option 2)
    window.addEventListener('teflon:open-process-manager', function (e) {
      const detail = e && e.detail ? e.detail : {};
      const moldId = detail.moldId || (detail.teflonRow && detail.teflonRow.MoldID);
      openProcessManagerByMoldId(moldId, detail.teflonRow);
    });

      // 1b) Listen for data changes from process-manager (rebuild rows + badge)
    window.addEventListener('teflon:data-changed', function (e) {
      console.log('[TeflonBootstrap] teflon:data-changed detected, refreshing...');
      // Small delay to ensure DataManager.recompute() finished
      setTimeout(function() {
        buildRowsIfPossible();
        refreshBadgeIfAny();
        
        // If panel is open, refresh display
        if (document.getElementById('teflon-panel')) {
          if (window.TeflonManager && typeof window.TeflonManager.renderTable === 'function') {
            safeCall(() => window.TeflonManager.renderTable());
          }
        }
      }, 100);
    });

    // 2) Click "mold name" inside teflon panel
    document.addEventListener('click', function (e) {
      const panel = document.getElementById('teflon-panel');
      if (!panel) return;

      const actionEl = (e.target && e.target.closest) ? e.target.closest('[data-action="open-process"]') : null;
      if (!actionEl) return;

      const tr = actionEl.closest('tr[data-mold-id]');
      const moldId = tr ? tr.getAttribute('data-mold-id') : null;
      if (!moldId) return;

      // Prevent row click (detail modal) and open process modal instead
      e.preventDefault();
      e.stopPropagation();

      openProcessManagerByMoldId(moldId, null);
    }, true);

    window.__tefBootstrapProcessHooked = true;
  }

  // =========================
  // Nav click pre-refresh
  // =========================
  function hookNavClickForRefresh() {
    const btn = document.getElementById('nav-teflon-btn');
    if (!btn || btn.__tefBootstrapHooked) return;

    btn.addEventListener('click', function () {
      fullRefresh();
    }, true);

    btn.__tefBootstrapHooked = true;
  }

  // =========================
  // Polling until ready
  // =========================
  function startPollingUntilReady() {
    let elapsed = 0;
    const limit = BOOT.maxRetrySeconds * 1000;

    const timer = setInterval(function () {
      elapsed += BOOT.tickMs;

      hookNavClickForRefresh();
      hookOpenProcessEvents();

      // Keep alias up-to-date if process-manager loads later
      ensureTeflonProcessOpenAlias();

      // Idempotent refresh
      fullRefresh();

      const dmOk = isDataManagerReady();
      const hasSomeModule =
        !!window.TeflonManager ||
        !!window.TeflonBadgeManager ||
        !!window.TeflonI18N ||
        (typeof window.TeflonManagerThemeApply === 'function');

      if (dmOk && hasSomeModule) {
        setTimeout(fullRefresh, 300);
        setTimeout(fullRefresh, 1200);
        clearInterval(timer);
        return;
      }

      if (elapsed >= limit) clearInterval(timer);
    }, BOOT.tickMs);
  }

  // Expose debug
  window.TeflonBootstrap = {
    version: BOOT.version,
    refresh: fullRefresh,
    isDataManagerReady: isDataManagerReady,
    ensureTeflonProcessOpenAlias: ensureTeflonProcessOpenAlias
  };

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      hookNavClickForRefresh();
      hookOpenProcessEvents();
      startPollingUntilReady();
    });
  } else {
    hookNavClickForRefresh();
    hookOpenProcessEvents();
    startPollingUntilReady();
  }
})();
