/**
 * teflon-manager-r7.1.1.theme.js
 * Theme / 配色・UI設定 (JP優先 / Ưu tiên tiếng Nhật)
 *
 * Mục tiêu:
 * - Inject CSS cho badge, màu cảnh báo overdue, style nút.
 * - Hỗ trợ nav badge: single dot hoặc multi dots.
 * - Override TeflonManager.updateNavBadge() để hiển thị đúng theo config.
 *
 * Dùng với core:
 * - Load sau teflon-manager-r7.1.1.core.js
 */

(function () {
  'use strict';

  // =========================
  // Theme Config
  // =========================
  const THEME = {
    version: 'r7.1.1',
    // 'single' | 'multi'
    badgeMode: 'single',

    // Status colors
    colors: {
      pending: { badgeBg: '#ffcc80', badgeText: '#7a3b00', rowBg: '#fff3e0' },
      approved: { badgeBg: '#ffcdd2', badgeText: '#8a1f2a', rowBg: '#ffebee' },
      processing: { badgeBg: '#bbdefb', badgeText: '#0d47a1', rowBg: '#e3f2fd' },
      completed: { badgeBg: '#c8e6c9', badgeText: '#1b5e20', rowBg: '#f1f8e9' },
      default: { badgeBg: '#e0e0e0', badgeText: '#424242', rowBg: '#ffffff' }
    },

    // Overdue highlight (pending approval)
    overdue: {
      week1Bg: '#ffe0b2', // >= 7 days
      week2Bg: '#ffcdd2', // >= 14 days
      text: '#3e2723'
    },

    // Nav dot colors
    navDot: {
      pending: '#ef6c00',
      approved: '#d32f2f',
      processing: '#1976d2'
    },

    // Buttons
    button: {
      radius: 10,
      border: '#cfcfcf',
      grayBg: '#ffffff',
      blueBg: '#e3f2fd',
      blueBorder: '#90caf9',
      blueText: '#0d47a1',
      greenBg: '#2e7d32',
      greenBorder: '#2e7d32',
      greenText: '#ffffff'
    }
  };

  // Expose theme
  window.TeflonManagerTheme = THEME;

  // =========================
  // CSS Injection
  // =========================
  function injectThemeStyles() {
    if (document.getElementById('teflon-manager-theme-styles')) return;

    const css = `
/* ===== teflon-manager theme overrides (${THEME.version}) ===== */

/* Status badge */
.status-badge { padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800; white-space:nowrap; display:inline-block; }
.status-pending { background:${THEME.colors.pending.badgeBg} !important; color:${THEME.colors.pending.badgeText} !important; }
.status-approved { background:${THEME.colors.approved.badgeBg} !important; color:${THEME.colors.approved.badgeText} !important; }
.status-processing { background:${THEME.colors.processing.badgeBg} !important; color:${THEME.colors.processing.badgeText} !important; }
.status-completed { background:${THEME.colors.completed.badgeBg} !important; color:${THEME.colors.completed.badgeText} !important; }
.status-default { background:${THEME.colors.default.badgeBg} !important; color:${THEME.colors.default.badgeText} !important; }

/* Row background (if core adds these classes) */
.tef-row-pending { background:${THEME.colors.pending.rowBg} !important; }
.tef-row-approved { background:${THEME.colors.approved.rowBg} !important; }
.tef-row-processing { background:${THEME.colors.processing.rowBg} !important; }
.tef-row-completed { background:${THEME.colors.completed.rowBg} !important; }
.tef-row-default { background:${THEME.colors.default.rowBg} !important; }

/* Overdue highlight – support BOTH old+new class naming */
.tef-req-overdue-1 { background:${THEME.overdue.week1Bg} !important; color:${THEME.overdue.text} !important; border-radius:4px; padding:1px 4px; display:inline-block; }
.tef-req-overdue-2 { background:${THEME.overdue.week2Bg} !important; color:${THEME.overdue.text} !important; border-radius:4px; padding:1px 4px; display:inline-block; font-weight:900; }

.tef-row-overdue-7 { background:${THEME.overdue.week1Bg} !important; }
.tef-row-overdue-14 { background:${THEME.overdue.week2Bg} !important; }
.tef-row-overdue-14 .mold-name-cell { color:#c62828 !important; font-weight:900 !important; }

/* Nav teflon icon positioning */
#nav-teflon-btn { position:relative; }

/* Single dot */
.tef-nav-dot { position:absolute; top:6px; right:8px; width:10px; height:10px; border-radius:50%; box-shadow:0 0 0 2px rgba(255,255,255,0.9); }
.tef-nav-dot-hidden { display:none !important; }
.tef-nav-dot-orange { background:${THEME.navDot.pending} !important; }
.tef-nav-dot-red { background:${THEME.navDot.approved} !important; }
.tef-nav-dot-blue { background:${THEME.navDot.processing} !important; }

/* Multi dots */
.tef-nav-dots { position:absolute; top:6px; right:6px; display:flex; gap:3px; }
.tef-nav-dots .dot { width:8px; height:8px; border-radius:50%; box-shadow:0 0 0 2px rgba(255,255,255,0.9); display:inline-block; }
.tef-nav-dots .dot.orange { background:${THEME.navDot.pending} !important; }
.tef-nav-dots .dot.red { background:${THEME.navDot.approved} !important; }
.tef-nav-dots .dot.blue { background:${THEME.navDot.processing} !important; }

/* Bottom action bar buttons (JP top / VI bottom) */
.tef-actions { padding:10px 10px !important; gap:10px !important; background:#f7f7f7 !important; border-top:1px solid #ddd !important; }
.tef-btn {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:10px 14px; border-radius:${THEME.button.radius}px;
  border:1px solid ${THEME.button.border};
  cursor:pointer; min-width:98px; user-select:none;
}
.tef-btn .jp { font-size:12px; font-weight:800; line-height:1.1; }
.tef-btn .vi { font-size:10px; opacity:0.86; line-height:1.1; margin-top:2px; }
.tef-btn-gray { background:${THEME.button.grayBg} !important; color:#444 !important; border-color:${THEME.button.border} !important; }
.tef-btn-blue { background:${THEME.button.blueBg} !important; color:${THEME.button.blueText} !important; border-color:${THEME.button.blueBorder} !important; }
.tef-btn-green { background:${THEME.button.greenBg} !important; color:${THEME.button.greenText} !important; border-color:${THEME.button.greenBorder} !important; }
.tef-btn:active { transform:scale(0.99); }
`;

    const style = document.createElement('style');
    style.id = 'teflon-manager-theme-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // =========================
  // Badge DOM helpers
  // =========================
  function ensureBadgeDOM(btn) {
    if (!btn) return;

    // remove both, rebuild by mode
    const oldSingle = btn.querySelector('.tef-nav-dot');
    const oldMulti = btn.querySelector('.tef-nav-dots');

    if (THEME.badgeMode === 'single') {
      if (oldMulti) oldMulti.remove();
      if (!oldSingle) {
        const dot = document.createElement('span');
        dot.className = 'tef-nav-dot tef-nav-dot-hidden';
        btn.appendChild(dot);
      }
    } else {
      if (oldSingle) oldSingle.remove();
      if (!oldMulti) {
        const dots = document.createElement('span');
        dots.className = 'tef-nav-dots';
        dots.innerHTML =
          '<span class="dot red" data-dot="approved" style="display:none;"></span>' +
          '<span class="dot orange" data-dot="pending" style="display:none;"></span>' +
          '<span class="dot blue" data-dot="processing" style="display:none;"></span>';
        btn.appendChild(dots);
      }
    }

    btn.setAttribute('data-tef-badge-mode', THEME.badgeMode);
  }

  // =========================
  // Patch updateNavBadge()
  // =========================
  function patchUpdateNavBadgeIfPossible() {
    if (!window.TeflonManager) return;
    if (typeof window.TeflonManager.updateNavBadge !== 'function') return;
    if (window.TeflonManager.updateNavBadge.__tefThemePatched) return;

    const original = window.TeflonManager.updateNavBadge.bind(window.TeflonManager);

    window.TeflonManager.updateNavBadge = function () {
      const btn = document.getElementById('nav-teflon-btn');
      if (!btn) {
        // fallback original (safe)
        try { return original(); } catch (e) { return; }
      }

      ensureBadgeDOM(btn);

        // Use core's processed rows (latest log per mold only)
        let hasPending = false;
        let hasApproved = false;
        let hasProcessing = false;
        
        try {
          let rows = [];
          
          // Try to get from core API first (correct approach)
          if (window.TeflonManager && typeof window.TeflonManager.getProcessedRows === 'function') {
            rows = window.TeflonManager.getProcessedRows();
          } else {
            // Fallback: trigger buildRows and hope allRows is exposed somehow
            if (window.TeflonManager && typeof window.TeflonManager.buildRows === 'function') {
              window.TeflonManager.buildRows();
            }
          }
          
          // Scan processed rows (each mold appears only once with latest status)
          for (let i = 0; i < rows.length; i++) {
            const key = rows[i].TeflonStatusKey || '';
            if (key === 'approved') hasApproved = true;
            else if (key === 'pending') hasPending = true;
            else if (key === 'processing') hasProcessing = true;
            
            // Early exit optimization
            if (hasApproved && hasPending && hasProcessing) break;
          }
        } catch (e) {
          console.warn('[ThemeBadge] Cannot read processed rows:', e);
        }


      if (THEME.badgeMode === 'single') {
        const dot = btn.querySelector('.tef-nav-dot');
        if (!dot) return;

        dot.classList.remove('tef-nav-dot-hidden', 'tef-nav-dot-red', 'tef-nav-dot-orange', 'tef-nav-dot-blue');

        if (hasApproved) dot.classList.add('tef-nav-dot-red');
        else if (hasPending) dot.classList.add('tef-nav-dot-orange');
        else if (hasProcessing) dot.classList.add('tef-nav-dot-blue');
        else dot.classList.add('tef-nav-dot-hidden');
      } else {
        const dots = btn.querySelector('.tef-nav-dots');
        if (!dots) return;

        const dotApproved = dots.querySelector('[data-dot="approved"]');
        const dotPending = dots.querySelector('[data-dot="pending"]');
        const dotProcessing = dots.querySelector('[data-dot="processing"]');

        if (dotApproved) dotApproved.style.display = hasApproved ? 'inline-block' : 'none';
        if (dotPending) dotPending.style.display = hasPending ? 'inline-block' : 'none';
        if (dotProcessing) dotProcessing.style.display = hasProcessing ? 'inline-block' : 'none';
      }
    };

    window.TeflonManager.updateNavBadge.__tefThemePatched = true;
  }

  // =========================
  // Apply
  // =========================
  function applyTheme() {
    injectThemeStyles();

    const btn = document.getElementById('nav-teflon-btn');
    if (btn) ensureBadgeDOM(btn);

    patchUpdateNavBadgeIfPossible();

    // refresh badge immediately
    try {
      if (window.TeflonManager && typeof window.TeflonManager.updateNavBadge === 'function') {
        window.TeflonManager.updateNavBadge();
      }
    } catch (e) {}
  }

  window.TeflonManagerThemeApply = applyTheme;

  // Apply now + retry for late DOM/DataManager
  applyTheme();

  let tries = 0;
  const timer = setInterval(function () {
    tries++;
    applyTheme();
    if (tries >= 20) clearInterval(timer);
  }, 500);

})();
