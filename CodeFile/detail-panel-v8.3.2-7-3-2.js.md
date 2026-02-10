/* ============================================================================

DETAIL PANEL MODULE v8.3.2 (Desktop Mold-Centric + Extended Tab)

MoldCutter Search System

Mục tiêu:
- Desktop: lấy KHUÔN làm trung tâm, bố cục 3 cột (ảnh + vị trí | info chính | quick actions)
- Giữ 8 tab hiện tại hoạt động đúng (Info/Related/History/Teflon/Status/Photos/Comments/Analytics)
- Thêm tab "Mở rộng / Extended" CHỈ dùng CSV hiện có (molddesign/customers/jobs/racks/shiplog...)
- Song ngữ JP/VI
- Tương thích DataManager v8.1.0 + App v8.2.3

Created: 2026-02-04
============================================================================ */

(function() {
  'use strict';

  const VERSION = 'v8.3.2-7-3-2';

  class DetailPanel {
    constructor(panelId) {
      this.panelId = panelId || 'detailPanel';
      this.panel = document.getElementById(this.panelId);
      this.backdrop = document.getElementById('backdrop');

      this.currentItem = null;
      this.currentItemType = 'mold';
      this.currentTab = 'info';

      // ===== Navigation history (v8.3.2-7) =====
      this._navStack = [];
      this._navMax = 50;
      this._navGoingBack = false;

      // ===== Preview modal (v8.3.2-7) =====
      this._preview = { open: false, item: null, itemType: null, centerMold: null };

      // Mold-centric: khi mở cutter cố tìm khuôn để làm trung tâm
      this.centerMold = null;
      this.centerMoldReason = '';

      this._bound = false;
      this._resizeTimer = null;

      this.data = {
        molds: [],
        cutters: [],
        customers: [],
        molddesign: [],
        moldcutter: [],
        shiplog: [],
        locationlog: [],
        employees: [],
        racklayers: [],
        racks: [],
        companies: [],
        statuslogs: [],
        usercomments: [],
        jobs: [],
        processingitems: [],
        destinations: [],
        teflonlog: [],
        CAV: []
      };

      this.init();
    }

    // =====================================================================
    // INIT / LAYOUT
    // =====================================================================

    init() {
      if (!this.panel) {
        console.error(`[DetailPanel ${VERSION}] Panel not found:`, this.panelId);
        return;
      }

      this.ensurePanelLayout();
      this.ensurePreviewStyles();

      if (!this._bound) {
        this.bindEvents();
        this._bound = true;
      }

      this.loadDataReferences();
      this.initResizable();
      this.close(true);

      console.log(`✅ DetailPanel ${VERSION} initialized (9 tabs)`);
    }

    ensurePanelLayout() {
      this.panel.innerHTML = `
        <div class="detail-panel-header">
          <div class="detail-panel-title">
            <span class="item-type-badge" data-item-type="mold">金型</span>
            <span class="item-code-text">---</span>
          </div>
          <button class="detail-panel-back" aria-label="Back" type="button" style="display:none;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.9);border-radius:10px;margin-right:8px;cursor:pointer;">
            <i class="fas fa-arrow-left"></i>
          </button>
          <button class="detail-panel-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="detail-panel-tabs">
          <button class="detail-tab active" data-tab="info" type="button">
            <i class="fas fa-info-circle"></i>
            <span class="tab-label-ja">基本</span>
            <span class="tab-label-vi">Thông tin</span>
          </button>
          <button class="detail-tab" data-tab="related" type="button">
            <i class="fas fa-link"></i>
            <span class="tab-label-ja">関連</span>
            <span class="tab-label-vi">Liên quan</span>
          </button>
          <button class="detail-tab" data-tab="history" type="button">
            <i class="fas fa-history"></i>
            <span class="tab-label-ja">履歴</span>
            <span class="tab-label-vi">Lịch sử</span>
          </button>
          <button class="detail-tab" data-tab="teflon" type="button">
            <i class="fas fa-spray-can"></i>
            <span class="tab-label-ja">コート</span>
            <span class="tab-label-vi">Teflon</span>
          </button>
          <button class="detail-tab" data-tab="status" type="button">
            <i class="fas fa-clipboard-check"></i>
            <span class="tab-label-ja">状態</span>
            <span class="tab-label-vi">Tình trạng</span>
          </button>
          <button class="detail-tab" data-tab="photos" type="button">
            <i class="fas fa-camera"></i>
            <span class="tab-label-ja">写真</span>
            <span class="tab-label-vi">Ảnh</span>
          </button>
          <button class="detail-tab" data-tab="comments" type="button">
            <i class="fas fa-comments"></i>
            <span class="tab-label-ja">メモ</span>
            <span class="tab-label-vi">Ghi chú</span>
          </button>
          <button class="detail-tab" data-tab="analytics" type="button">
            <i class="fas fa-chart-line"></i>
            <span class="tab-label-ja">統計</span>
            <span class="tab-label-vi">Thống kê</span>
          </button>
          <button class="detail-tab" data-tab="extended" type="button">
            <i class="fas fa-layer-group"></i>
            <span class="tab-label-ja">拡張</span>
            <span class="tab-label-vi">Mở rộng</span>
          </button>
        </div>

        <div class="detail-panel-body">
          <div class="detail-tab-content active" data-tab-content="info"></div>
          <div class="detail-tab-content" data-tab-content="related"></div>
          <div class="detail-tab-content" data-tab-content="history"></div>
          <div class="detail-tab-content" data-tab-content="teflon"></div>
          <div class="detail-tab-content" data-tab-content="status"></div>
          <div class="detail-tab-content" data-tab-content="photos"></div>
          <div class="detail-tab-content" data-tab-content="comments"></div>
          <div class="detail-tab-content" data-tab-content="analytics"></div>
          <div class="detail-tab-content" data-tab-content="extended"></div>
        </div>
      `;

      if (!this.panel.classList.contains('detail-panel')) {
        this.panel.classList.add('detail-panel');
      }

      // Defensive: ép panel full screen (tránh CSS khác ghi đè)
      try {
        this.panel.style.position = 'fixed';
        this.panel.style.top = '0';
        this.panel.style.right = this.panel.classList.contains('open') ? '0' : '-100%';
        this.panel.style.width = '100%';
        this.panel.style.maxWidth = '100%';
        this.panel.style.height = '100vh';
        this.panel.style.zIndex = '9999';
      } catch (e) {}
    }

    // ===== Preview styles injection (v8.3.2-7-2) =====
    // Mục tiêu: popup preview nhìn đúng kiểu "popup phổ thông" + làm mờ cột 2+3, vẫn cho phép bấm cột trái.
    ensurePreviewStyles() {
      try {
        if (document.getElementById('dp-preview-style')) return;
        const st = document.createElement('style');
        st.id = 'dp-preview-style';
        st.textContent = `
          /* Dim/disable mid+right columns while preview open */
          .detail-panel.dp-preview-open .dp-col-mid,
          .detail-panel.dp-preview-open .dp-col-right {
            filter: blur(1.2px) brightness(0.85) saturate(0.85);
          }
          .detail-panel.dp-preview-open .dp-col-mid *,
          .detail-panel.dp-preview-open .dp-col-right * {
            pointer-events: none;
            user-select: none;
          }

          /* Small safety: keep left column interactive */
          .detail-panel.dp-preview-open .dp-col-left,
          .detail-panel.dp-preview-open .dp-col-left * {
            pointer-events: auto;
          }

          /* Preview modal base */
          .dp-preview-modal {
            box-sizing: border-box;
          }
        `;
        document.head.appendChild(st);
      } catch (e) { /* ignore */ }
    }


    bindEvents() {
      const closeBtn = this.panel.querySelector('.detail-panel-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());

      const backBtn = this.panel.querySelector('.detail-panel-back');
      if (backBtn) backBtn.addEventListener('click', () => this.goBack());

      if (this.backdrop) {
        this.backdrop.addEventListener('click', () => this.close());
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.panel.classList.contains('open')) {
          if (this.isPreviewOpen && this.isPreviewOpen()) {
            this.closePreview();
            return;
          }
          this.close();
        }
      });

      const tabs = this.panel.querySelectorAll('.detail-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const t = tab.dataset.tab;
          if (t) this.switchTab(t);
        });
      });

      // Event delegation cho quick actions, module buttons, jumps
      this.panel.addEventListener('click', (e) => {
        const actionBtn = e.target && e.target.closest ? e.target.closest('.dp-action-btn') : null;
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          const action = actionBtn.dataset.action;
          if (action) this.handleQuickAction(action);
          return;
        }

        const moduleBtn = e.target && e.target.closest ? e.target.closest('[data-module-open]') : null;
        if (moduleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const moduleKey = moduleBtn.getAttribute('data-module-open');
          this.openFutureModule(moduleKey);
          return;
        }

        const pAct = e.target && e.target.closest ? e.target.closest('[data-preview-action]') : null;
        if (pAct) {
          e.preventDefault();
          e.stopPropagation();
          const key = pAct.getAttribute('data-preview-action');
          if (key === 'close') {
            this.closePreview();
            return;
          }
          if (key === 'open-full') {
            try {
              const p = this._preview || {};
              const it = p.item;
              const tp = p.itemType;
              this.closePreview();
              if (it) this.open(it, tp, { fromPanelLink: true });
            } catch (err) {}
            return;
          }
          if (key === 'open-full-mold') {
            try {
              const p = this._preview || {};
              const m = p.centerMold;
              this.closePreview();
              if (m) this.open(m, 'mold', { fromPanelLink: true });
            } catch (err) {}
            return;
          }
        }

        const viewBtn = e.target && e.target.closest ? e.target.closest('.view-detail-btn') : null;
        if (viewBtn) {
          e.preventDefault();
          e.stopPropagation();
          try {
            const item = JSON.parse(viewBtn.dataset.item || '{}');
            const t = viewBtn.dataset.itemType || item.type || item.itemType || null;
            if (item) this.openPreview(item, t);
          } catch (err) {
            console.warn(`[DetailPanel ${VERSION}] view-detail-btn parse error`, err);
          }
          return;
        }

        const jump = e.target && e.target.closest ? e.target.closest('[data-jump]') : null;
        if (jump) {
          e.preventDefault();
          e.stopPropagation();
          const key = jump.getAttribute('data-jump');
          this.handleJump(key);
          return;
        }
      });



// Preview actions (modal is appended to document.body, so use document-level delegation)
document.addEventListener('click', (e) => {
  try {
    const btn = e.target && e.target.closest ? e.target.closest('[data-preview-action]') : null;
    if (!btn) return;

    const inPreview = (btn.closest && (btn.closest('.dp-preview-modal') || btn.closest('.dp-preview-modal-backdrop')));
    if (!inPreview) return;

    e.preventDefault();
    e.stopPropagation();

    const key = btn.getAttribute('data-preview-action');

    if (key === 'close') {
      this.closePreview();
      return;
    }

    if (key === 'open-full') {
      const p = this._preview || {};
      const it = p.item;
      const tp = p.itemType;
      this.closePreview();
      if (it) this.open(it, tp, { fromPanelLink: true });
      return;
    }

    if (key === 'open-full-mold') {
      const p = this._preview || {};
      const m = p.centerMold;
      this.closePreview();
      if (m) this.open(m, 'mold', { fromPanelLink: true });
      return;
    }
  } catch (err) {
    // ignore
  }
}, true);

      window.addEventListener('resize', () => {
        if (!this.panel.classList.contains('open')) return;
        if (this.currentTab !== 'info') return;
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this.refreshCurrentTab(), 140);
      });

      document.addEventListener('data-manager-updated', () => {
        this.loadDataReferences();
        if (this.panel.classList.contains('open') && this.currentItem) this.refreshCurrentTab();
      });
      document.addEventListener('data-manager:ready', () => {
        this.loadDataReferences();
        if (this.panel.classList.contains('open') && this.currentItem) this.refreshCurrentTab();
      });

      // Compat events
      document.addEventListener('showDetailPanel', (e) => {
        try {
          const d = e && e.detail ? e.detail : {};
          const item = d.item || d.data || null;
          const itemType = d.type || d.itemType || (item ? item.type : null);
          if (item) this.open(item, itemType);
        } catch (err) {
          console.warn(`[DetailPanel ${VERSION}] showDetailPanel error`, err);
        }
      });

      document.addEventListener('openDetailPanel', (e) => {
        try {
          const d = e && e.detail ? e.detail : {};
          const item = d.item || d.data || null;
          const itemType = d.type || d.itemType || (item ? item.type : null);
          if (item) this.open(item, itemType);
        } catch (err) {
          console.warn(`[DetailPanel ${VERSION}] openDetailPanel error`, err);
        }
      });
    }

    loadDataReferences() {
      try {
        if (typeof window.DataManager !== 'undefined' && window.DataManager.data) {
          const d = window.DataManager.data;
          this.data.molds = d.molds || [];
          this.data.cutters = d.cutters || [];
          this.data.customers = d.customers || [];
          this.data.molddesign = d.molddesign || [];
          this.data.moldcutter = d.moldcutter || [];
          this.data.racklayers = d.racklayers || [];
          this.data.racks = d.racks || [];
          this.data.companies = d.companies || [];
          this.data.shiplog = d.shiplog || [];
          this.data.locationlog = d.locationlog || [];
          this.data.usercomments = d.usercomments || [];
          this.data.employees = d.employees || [];
          this.data.jobs = d.jobs || [];
          this.data.processingitems = d.processingitems || [];
          this.data.destinations = d.destinations || [];
          this.data.statuslogs = d.statuslogs || [];
          this.data.teflonlog = d.teflonlog || [];
          this.data.CAV = d.CAV || [];
          return;
        }
      } catch (e) { /* ignore */ }

      try {
        if (window.ALL_DATA) {
          const d = window.ALL_DATA;
          Object.keys(this.data).forEach(k => {
            if (Array.isArray(d[k])) this.data[k] = d[k];
          });
        }
      } catch (e) { /* ignore */ }
    }

    // =====================================================================
    // OPEN / CLOSE
    // =====================================================================

    normalizeItemType(item, itemType) {
      const raw = (itemType || item?.type || item?.ItemType || item?.itemType || '').toString().toLowerCase();
      if (raw.includes('cutter') || raw.includes('cut') || raw.includes('抜') || raw.includes('dao')) return 'cutter';
      if (raw.includes('mold') || raw.includes('khuon') || raw.includes('金') || raw.includes('khuôn')) return 'mold';
      if (item && (item.CutterID || item.CutterNo || item.CutterName || item.CutterDesignCode)) return 'cutter';
      return 'mold';
    }

    open(item, itemType, opts = {}) {
      if (!item) return;

      const o = (opts && typeof opts === 'object') ? opts : {};

      // Mở từ bên ngoài panel thì reset Back để không back nhầm.
      if (!o.fromPanelLink && !o.fromBack) {
        this.clearNavStack();
      }

      // Nếu MỞ FULL từ panel thì lưu trạng thái hiện tại để Back.
      if (o.fromPanelLink && !o.skipHistory && this.currentItem) {
        this.pushNavStateIfNeeded();
      }
      
      this.currentItemType = this.normalizeItemType(item, itemType);
      
      // Resolve item đầy đủ từ data nếu item từ data-item là bản rút gọn
      item = this.resolveFullItem(item, this.currentItemType);
      
      this.currentItem = item;
      this.centerMold = null;
      this.centerMoldReason = '';
      
      if (this.currentItemType === 'mold') {
        this.centerMold = item;
        this.centerMoldReason = 'direct';
      } else {
        this.centerMold = this.findCenterMoldFromCutter(item);
      }
      
      this.ensureRelatedListsForOpen();
      this.updateHeader();
      const firstTab = (o.restoreTab ? String(o.restoreTab) : 'info');
      this.switchTab(firstTab);
      
      this.panel.classList.add('open');
      try { this.panel.style.right = '0'; } catch (e) {}
      if (this.backdrop) this.backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';
    }


    close(silent = false) {
      this.panel.classList.remove('open');
      try { this.panel.style.right = '-100%'; } catch (e) {}
      this.clearNavStack();
      this.closePreview();
      if (this.backdrop) this.backdrop.classList.remove('show');
      document.body.style.overflow = '';

      if (!silent) {
        setTimeout(() => {
          this.currentItem = null;
          this.currentItemType = 'mold';
          this.centerMold = null;
          this.centerMoldReason = '';
        }, 220);
      }
    }

    updateHeader() {
      const badge = this.panel.querySelector('.item-type-badge');
      const codeText = this.panel.querySelector('.item-code-text');
      if (!codeText) return;

      // Nhãn JP cố định theo loại
      const typeLabel = (this.currentItemType === 'cutter') ? '抜型' : '金型';

      let code = '---';
      if (this.currentItemType === 'cutter') {
        code = this.currentItem?.CutterNo || this.currentItem?.CutterID || '---';
      } else {
        code = this.currentItem?.MoldCode || this.currentItem?.MoldID || '---';
      }

      // Gộp vào 1 dòng: "金型 JAE371"
      codeText.textContent = `${typeLabel} ${code}`;

      // Badge cũ: không cần nữa
      if (badge) {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    

      this.updateBackButtonState();
    }

    // =====================================================================
    // NAV HISTORY (v8.3.2-7)
    // =====================================================================

    clearNavStack() {
      this._navStack = [];
      this.updateBackButtonState();
    }

    updateBackButtonState() {
      try {
        const btn = this.panel ? this.panel.querySelector('.detail-panel-back') : null;
        if (!btn) return;
        const has = Array.isArray(this._navStack) && this._navStack.length > 0;
        btn.style.display = has ? 'inline-flex' : 'none';
        btn.disabled = !has;
      } catch (e) { /* ignore */ }
    }

    serializeNavRef(item, type) {
      const t = String(type || '').toLowerCase();
      if (t === 'cutter') {
        return {
          CutterID: this.normId(item?.CutterID || item?.ID) || '',
          CutterNo: this.normId(item?.CutterNo || item?.CutterCode) || ''
        };
      }
      return {
        MoldID: this.normId(item?.MoldID) || '',
        MoldCode: this.normId(item?.MoldCode) || ''
      };
    }

    buildNavState() {
      if (!this.currentItem) return null;
      return {
        itemType: this.currentItemType,
        tab: this.currentTab || 'info',
        ref: this.serializeNavRef(this.currentItem, this.currentItemType)
      };
    }

    pushNavStateIfNeeded() {
      try {
        const s = this.buildNavState();
        if (!s) return;

        const last = (this._navStack && this._navStack.length) ? this._navStack[this._navStack.length - 1] : null;
        const same = last && last.itemType === s.itemType && last.tab === s.tab && JSON.stringify(last.ref) === JSON.stringify(s.ref);
        if (same) return;

        this._navStack.push(s);
        if (this._navStack.length > (this._navMax || 50)) {
          this._navStack.splice(0, this._navStack.length - (this._navMax || 50));
        }
        this.updateBackButtonState();
      } catch (e) { /* ignore */ }
    }

    goBack() {
      try {
        if (this._navGoingBack) return;
        if (!this._navStack || !this._navStack.length) return;

        const prev = this._navStack.pop();
        this.updateBackButtonState();
        if (!prev) return;

        this._navGoingBack = true;
        this.open(prev.ref, prev.itemType, { fromBack: true, restoreTab: prev.tab, skipHistory: true });
      } catch (e) {
        // ignore
      } finally {
        this._navGoingBack = false;
      }
    }

    // =====================================================================
    // PREVIEW MODAL (v8.3.2-7)
    // - Popup nổi, làm mờ layer bên dưới (chỉ cột 2+3), cột trái vẫn bấm được.
    // =====================================================================

    isPreviewOpen() {
      return !!(this._preview && this._preview.open);
    }

    computeCenterMoldForPreviewCutter(cutter) {
      try {
        const molds = this.getSharedMoldsForCutter(cutter) || [];
        if (!molds.length) return null;
        const direct = molds.find(m => String(m.__dpLinkKind || m.dpLinkKind || '').toLowerCase() === 'direct');
        return direct || molds[0];
      } catch (e) {
        return null;
      }
    }

    openPreview(item, itemType) {
      try {
        if (!item) return;

        const t = this.normalizeItemType(item, itemType);
        const full = this.resolveFullItem(item, t);

        let centerMold = null;
        if (t === 'cutter') {
          centerMold = this.computeCenterMoldForPreviewCutter(full);
        }

        this._preview = { open: true, item: full, itemType: t, centerMold };
        try { if (this.panel) this.panel.classList.add('dp-preview-open'); } catch (e) {}
        this.renderPreviewOverlay();
      } catch (e) {
        // ignore
      }
    }

    closePreview() {
      try {
        if (this._preview) {
          this._preview.open = false;
          this._preview.item = null;
          this._preview.itemType = null;
          this._preview.centerMold = null;
        }

        const b = document.querySelector('.dp-preview-modal-backdrop');
        if (b && b.parentNode) b.parentNode.removeChild(b);

        const m = document.querySelector('.dp-preview-modal');
        if (m && m.parentNode) m.parentNode.removeChild(m);

        try { if (this.panel) this.panel.classList.remove('dp-preview-open'); } catch (e) {}
      } catch (e) {
        // ignore
      }
    }

    bindPreviewSwipeToClose(el) {
      try {
        let startX = 0;
        let startY = 0;

        el.addEventListener('touchstart', (e) => {
          try {
            const t = e.touches && e.touches[0];
            if (!t) return;
            startX = t.clientX;
            startY = t.clientY;
          } catch (err) {}
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
          try {
            const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
            if (!t) return;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            if (dy > 70 && dy > Math.abs(dx) * 1.3) {
              this.closePreview();
            }
          } catch (err) {}
        }, { passive: true });
      } catch (e) {
        // ignore
      }
    }

    buildPreviewCenterHtml(item, itemType, centerMoldForCutter) {
      try {
        if (!item) return '<p class="no-data">No preview item</p>';

        const t = String(itemType || '').toLowerCase();
        let html = '';

        // Full giống cột giữa
        html += this.renderDesktopHero(item, t);
        html += this.renderBasicInfoSection(item, t);
        html += this.renderProductInfoSection(item, t);
        html += this.renderTechnicalInfoSection(item, t);
        html += this.renderStatusNotesSection(item, t);
        html += this.renderAdditionalDataSection(item, t);

        if (t === 'cutter' && centerMoldForCutter) {
          html += `
            <div class="modal-section">
              <div class="section-header">
                <i class="fas fa-cube"></i>
                <span>Khuôn trung tâm</span>
              </div>
              <div class="info-message">
                Dao cắt có thể dùng chung; khuôn trung tâm chỉ tham khảo: <b>${this.safeText(centerMoldForCutter.MoldCode || centerMoldForCutter.MoldID)}</b>
                <button class="btn-action" style="margin-left:8px" type="button" data-preview-action="open-full-mold">Mở khuôn</button>
              </div>
            </div>
          `;
        }

        return html;
      } catch (e) {
        return '<p class="no-data">Preview render error</p>';
      }
    }

    renderPreviewOverlay() {
      try {
        if (!this.panel || !this.panel.classList.contains('open')) return;
        if (this.currentTab !== 'info') return;

        if (!this.isPreviewOpen()) {
          this.closePreview();
          return;
        }

        const grid = this.panel.querySelector('.dp-desktop-grid');
        const leftCol = grid ? grid.querySelector('.dp-col-left') : null;
        const tabs = this.panel.querySelector('.detail-panel-tabs');

        const topRect = (tabs ? tabs.getBoundingClientRect() : this.panel.getBoundingClientRect());
        const top = Math.round(topRect.bottom + 8);
        const bottom = 10;

        let left = 10;
        if (leftCol) {
          const lr = leftCol.getBoundingClientRect();
          left = Math.round(lr.right + 10);
        }
        const right = 10;

        let backdrop = document.querySelector('.dp-preview-modal-backdrop');
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.className = 'dp-preview-modal-backdrop';
          backdrop.style.position = 'fixed';
          backdrop.style.zIndex = '10080';
          backdrop.style.background = 'rgba(15, 23, 42, 0.55)';
          backdrop.style.borderRadius = '16px';
          backdrop.style.pointerEvents = 'auto';
          backdrop.style.backdropFilter = 'blur(2px) saturate(0.85)';
          backdrop.addEventListener('click', () => this.closePreview());
          document.body.appendChild(backdrop);
        }
        backdrop.style.top = top + 'px';
        backdrop.style.left = left + 'px';
        backdrop.style.right = right + 'px';
        backdrop.style.bottom = bottom + 'px';

        let modal = document.querySelector('.dp-preview-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.className = 'dp-preview-modal';
          modal.setAttribute('role', 'dialog');
          modal.setAttribute('aria-modal', 'false');
          modal.tabIndex = -1;
          modal.style.position = 'fixed';
          modal.style.zIndex = '10090';
          modal.style.background = 'rgba(255,255,255,0.99)';
          modal.style.border = '1px solid rgba(0,0,0,0.10)';
          modal.style.borderRadius = '16px';
          modal.style.boxShadow = '0 18px 50px rgba(0,0,0,0.18)';
          modal.style.overflow = 'hidden';
          modal.style.display = 'flex';
          modal.style.flexDirection = 'column';
          modal.addEventListener('click', (e) => e.stopPropagation());
          document.body.appendChild(modal);
        }

        // Centered popup inside area (col2+3), not full overlay
        const availW = Math.max(320, window.innerWidth - (left + 10) - (right + 10));
        const modalW = Math.min(980, Math.max(360, availW - 40));
        const modalLeft = Math.round((left + 10) + (availW - modalW) / 2);

        modal.style.top = (top + 18) + 'px';
        modal.style.left = modalLeft + 'px';
        modal.style.right = 'auto';
        modal.style.bottom = (bottom + 18) + 'px';
        modal.style.width = modalW + 'px';
        modal.style.maxHeight = 'calc(100vh - ' + (top + 18 + bottom + 18) + 'px)';

        const p = this._preview || {};
        const t = p.itemType;
        const item = p.item;
        const title = (t === 'cutter')
          ? (item?.CutterNo || item?.CutterCode || item?.CutterID || '---')
          : (item?.MoldCode || item?.MoldID || '---');

        const typeLabelJa = (t === 'cutter') ? '抜型' : '金型';

        const headerHtml = `
          <div style="
            padding:10px 12px;
            border-bottom:1px solid rgba(0,0,0,0.08);
            background:rgba(255,255,255,0.98);
            display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="display:flex;flex-direction:column;min-width:0;">
              <div style="font-weight:900;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                PREVIEW: ${this.escapeHtml(typeLabelJa)} ${this.escapeHtml(title)}
              </div>
              <div style="font-size:12px;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                Popup xem nhanh. Thiết bị chính không bị thay đổi.
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;">
              <button type="button" data-preview-action="open-full" class="btn-action" style="padding:6px 10px;">Mở full</button>
              <button type="button" data-preview-action="close" class="btn-action" style="padding:6px 10px;">Close</button>
            </div>
          </div>
        `;

        const bodyHtml = this.buildPreviewCenterHtml(item, t, p.centerMold);

        modal.innerHTML = headerHtml + `
          <div class="dp-preview-body" style="
            padding:12px;
            overflow:auto;
            -webkit-overflow-scrolling:touch;
            flex:1 1 auto;">
            ${bodyHtml}
          </div>
        `;

        const bodyEl = modal.querySelector('.dp-preview-body');
        if (bodyEl && !bodyEl.dataset.dpPreviewSwipeBound) {
          bodyEl.dataset.dpPreviewSwipeBound = '1';
          this.bindPreviewSwipeToClose(bodyEl);
        }
      } catch (e) {
        // ignore
      }
    }





    // =====================================================================
    // TABS
    // =====================================================================
    switchTab(tabName) {
      const tabs = this.panel.querySelectorAll('.detail-tab');
      tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));

      const contents = this.panel.querySelectorAll('.detail-tab-content');
      contents.forEach(c => c.classList.toggle('active', c.dataset.tabContent === tabName));

      this.currentTab = tabName;

      // Preview chỉ dùng ở tab Info
      if (tabName !== 'info') {
        this.closePreview();
      }

      this.renderTabContent(tabName);
    }

    refreshCurrentTab() {
      if (this.currentTab) this.renderTabContent(this.currentTab);
    }

    renderTabContent(tabName) {
      const container = this.panel.querySelector(`[data-tab-content="${tabName}"]`);
      if (!container) return;

      let html = '';
      switch (tabName) {
        case 'info': html = this.renderInfoTab(); break;
        case 'related': html = this.renderRelatedTab(); break;
        case 'history': html = this.renderHistoryTab(); break;
        case 'teflon': html = this.renderTeflonTab(); break;
        case 'status': html = this.renderStatusTab(); break;
        case 'photos': html = this.renderPhotosTab(); break;
        case 'comments': html = this.renderCommentsTab(); break;
        case 'analytics': html = this.renderAnalyticsTab(); break;
        case 'extended': html = this.renderExtendedTab(); break;
        default: html = `<p class="no-data">Tab not implemented</p>`;
      }

      container.innerHTML = html;
      this.bindTabEvents(tabName, container);

      if (tabName === 'info') {
        this.renderPreviewOverlay();
      }
      // Sau khi render xong nội dung tab, mới gắn resizable (tab Info mới có grid 3 cột)
      if (tabName === 'info') {
        this.initResizable();
      }
    }

    bindTabEvents(tabName, container) {
      // Nếu cần bind event cụ thể cho từng tab
    }

    // =====================================================================
    // UI HELPERS
    // =====================================================================

    isDesktopWide() {
      try { return window.innerWidth >= 1025; } catch (e) { return false; }
    }

    escapeHtml(v) {
      if (v == null) return '';
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    formatDate(iso) {
      if (!iso) return '';
      const t = Date.parse(iso);
      if (isNaN(t)) return this.escapeHtml(iso);
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    }

    formatLW(a, b) {
      const x = (a != null && String(a).trim()) ? String(a).trim() : '';
      const y = (b != null && String(b).trim()) ? String(b).trim() : '';
      if (!x && !y) return '';
      if (!y) return x;
      return `${x} x ${y}`;
    }

    formatLWH(l, w, h) {
      const a = (l != null && String(l).trim()) ? String(l).trim() : '';
      const b = (w != null && String(w).trim()) ? String(w).trim() : '';
      const c = (h != null && String(h).trim()) ? String(h).trim() : '';
      if (!a && !b && !c) return '';
      if (a && b && c) return `${a} x ${b} x ${c}`;
      if (a && b) return `${a} x ${b}`;
      return [a, b, c].filter(Boolean).join(' x ');
    }

    pick(obj, keys) {
      try {
        if (!obj) return null;
        for (const k of keys) {
          if (!k) continue;
          if (!(k in obj)) continue;
          const v = obj[k];
          if (v === null || v === undefined) continue;
          const s = String(v).trim();
          if (s !== '') return v;
        }
      } catch (e) {}
      return null;
    }

    safeText(v, fallback = '-') {
      const s = (v == null) ? '' : String(v).trim();
      return s ? this.escapeHtml(s) : fallback;
    }

    // ===== Rack/Layer badge (v8.3.2-7) =====
    toCircledNumber(n) {
      const x = Number(n);
      if (!Number.isFinite(x)) return '';
      const i = Math.floor(x);
      if (i >= 1 && i <= 20) return String.fromCharCode(0x245F + i);
      return String(i);
    }

    extractRackLayerFromText(s) {
      const t = (s == null) ? '' : String(s);
      if (!t.trim()) return null;
      const m = t.match(/(\d{1,3})\s*[-–—\/\\]\s*(\d{1,2})/);
      if (!m) return null;
      const rack = String(m[1]).replace(/^0+/, '') || m[1];
      const layer = String(m[2]).replace(/^0+/, '') || m[2];
      return { rack, layer };
    }

    getRackLayerText(item) {
      try {
        if (!item) return '';
        const candidates = [
          item.displayRackLocation,
          item.displayLocation,
          item.location,
          item.RackLocation,
          item.RackLayer,
          item.RackLayerID,
          item.RackLayerId,
          item.RackNo,
          item.Rack
        ];
        for (const c of candidates) {
          const x = this.extractRackLayerFromText(c);
          if (x) return this.toCircledNumber(x.rack) + '-' + String(x.layer);
        }
      } catch (e) {}
      return '';
    }


renderRackLayerBadgeText(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return `<span class="dp-badge-racklayer">${this.escapeHtml(t)}</span>`;
}


renderRackLayerBadge(item) {
  const t = this.getRackLayerText(item);
  return t ? this.renderRackLayerBadgeText(t) : '';
}

    renderInfoGrid(fields, extraClass = '') {
      if (!fields || !fields.length) return '';
      const cls = String(extraClass || '').trim();
      let html = `<div class=\"info-grid-2col${cls ? ' ' + cls : ''}\">`;
      for (const f of fields) {
        if (!f) continue;
        const itemCls = f.full ? 'info-item full-width' : 'info-item';
        const label = (f.label == null) ? '' : String(f.label);

        let valueHtml = '';
        if (f.rawValue != null) {
          valueHtml = String(f.rawValue);
        } else {
          const v = (f.value == null) ? '' : String(f.value).trim();
          valueHtml = v ? this.escapeHtml(v) : (f.fallback != null ? this.escapeHtml(String(f.fallback)) : '-');
        }

        html += `<div class=\"${itemCls}\"><div class=\"info-label\">${this.escapeHtml(label)}</div><div class=\"info-value\">${valueHtml}</div></div>`;
      }
      html += '</div>';
      return html;
    }

    // Bilingual label: JP preferred when space is tight (JP comes first).
    biLabel(jp, vi) {
      const a = (jp == null) ? '' : String(jp).trim();
      const b = (vi == null) ? '' : String(vi).trim();
      if (!a && !b) return '-';
      if (!b) return a;
      if (!a) return b;
      return `${a} / ${b}`;
    }

    // Badge cho liên kết (Direct/Shared) khi xem DAO CẮT → danh sách KHUÔN liên quan
    // - direct: khuôn có liên kết trực tiếp với MoldDesignID gốc của dao cắt (cutters.csv)
    // - shared: khuôn dùng chung qua moldcutter.csv

renderLinkKindBadge(kind) {
  const k = String(kind || '').toLowerCase().trim();
  if (!k) return '';

  const isDirect = (k === 'direct');
  const text = isDirect ? 'D' : 'S';
  const title = isDirect ? 'Direct / Khuôn liên kết trực tiếp' : 'Shared / Khuôn dùng chung';
  const cls = isDirect ? 'dp-link-badge dp-link-badge--direct' : 'dp-link-badge dp-link-badge--shared';
  return `<span class="${cls}" title="${this.escapeHtml(title)}">${this.escapeHtml(text)}</span>`;
}

    getDirectDesignIdsForCutter(cutter) {
      try {
        const v =
          cutter?.MoldDesignID ??
          cutter?.MoldDesignId ??
          cutter?.molddesignid ??
          cutter?.DesignID ??
          cutter?.DesignId ??
          '';
        const list = this.parseIdList(v).map(x => this.normId(x)).filter(Boolean);
        return Array.from(new Set(list));
      } catch (e) {
        return [];
      }
    }


    formatCutterCutSize(cutter) {
      const cutL = String(cutter?.CutlineLength || '').trim();
      const cutW = String(cutter?.CutlineWidth || '').trim();
      const r = String(cutter?.CutterCorner || '').trim();
      const c = String(cutter?.CutterChamfer || '').trim();
      
      let base = '-';
      if (cutL && cutW) {
        base = `${cutL}×${cutW}`;
      } else if (cutL || cutW) {
        base = [cutL, cutW].filter(Boolean).join('×');
      }
      
      let tail = '';
      if (r) tail += `-${r}R`;
      if (c) tail += `-${c}C`;
      
      return base !== '-' ? base + tail : (tail ? tail.replace(/^-/, '') : '-');
    }


    getMoldSharedListTextForCutter(cutter) {
      const molds = this.getSharedMoldsForCutter ? this.getSharedMoldsForCutter(cutter) : [];
      if (!molds || !molds.length) return '-';
      const parts = molds
        .map(m => (m?.MoldCode || m?.MoldID || ''))
        .map(s => String(s).trim())
        .filter(Boolean);
      return parts.length ? parts.join(', ') : '-';
    }
    getSharedMoldsForCutter(cutter) {
      try {
        if (!cutter) return [];

        const molds = Array.isArray(this.data?.molds) ? this.data.molds : [];
        const designs = Array.isArray(this.data?.molddesign) ? this.data.molddesign : [];
        const links = Array.isArray(this.data?.moldcutter) ? this.data.moldcutter : [];

        const directDesignIds = new Set(this.getDirectDesignIdsForCutter(cutter).map(x => this.normId(x)).filter(Boolean));

        // 1) designIds từ cutter + moldcutter
        const designIds = new Set();
        for (const d of directDesignIds) designIds.add(d);

        const cutterId = this.normId(cutter.CutterID || cutter.ID);
        const cutterNo = this.normId(cutter.CutterNo || cutter.CutterCode);

        for (const r of links) {
          const rid = this.normId(r.CutterID || r.CutterId || r.CUTTERID);
          const rno = this.normId(r.CutterNo || r.CutterCode);
          const match = (cutterId && rid === cutterId) || (cutterNo && rno === cutterNo);
          if (!match) continue;

          for (const v of this.parseIdList(r.MoldDesignID || r.MoldDesignId || r.DESIGNID || r.DesignID)) {
            const did = this.normId(v);
            if (did) designIds.add(did);
          }
        }

        const didList = Array.from(designIds).filter(Boolean);
        if (!didList.length) return [];

        // 2) collect molds by designId (molds.csv + molddesign.csv)
        const agg = new Map(); // moldKey -> { mold, designIds:Set }

        const pushMold = (m, did) => {
          if (!m) return;
          const key = this.normId(m.MoldID) || this.normId(m.MoldCode) || '';
          if (!key) return;
          let obj = agg.get(key);
          if (!obj) {
            obj = { mold: m, designIds: new Set() };
            agg.set(key, obj);
          }
          if (did) obj.designIds.add(this.normId(did));
        };

        // A) scan molds.csv by their design ids
        for (const m of molds) {
          const mDesignIds = []
            .concat(this.parseIdList(m.MoldDesignID))
            .concat(this.parseIdList(m.MoldDesignId))
            .concat(this.parseIdList(m.molddesignid))
            .concat(this.parseIdList(m.DesignID))
            .map(x => this.normId(x))
            .filter(Boolean);

          for (const did of mDesignIds) {
            if (designIds.has(did)) pushMold(m, did);
          }
        }

        // B) molddesign.csv: design -> mold list
        for (const d of designs) {
          const did = this.normId(d.MoldDesignID || d.DesignID || d.molddesignid);
          if (!did || !designIds.has(did)) continue;

          const moldIds = []
            .concat(this.parseIdList(d.MoldID))
            .concat(this.parseIdList(d.MoldIDs))
            .concat(this.parseIdList(d.MoldIdList))
            .concat(this.parseIdList(d.MoldList))
            .map(x => this.normId(x))
            .filter(Boolean);

          for (const mid of moldIds) {
            const found = molds.find(m => this.normId(m.MoldID) === mid || this.normId(m.MoldCode) === mid);
            if (found) pushMold(found, did);
          }
        }

        // 3) output with direct/shared badge
        const out = [];
        for (const obj of agg.values()) {
          const designList = Array.from(obj.designIds).filter(Boolean);
          const kind = designList.some(x => directDesignIds.has(this.normId(x))) ? 'direct' : 'shared';
          const clone = { ...obj.mold };
          clone.__dpLinkKind = kind;
          clone.__dpLinkDesignIds = designList;
          clone.dpLinkKind = kind;
          clone.dpLinkDesignIds = designList;
          out.push(clone);
        }

        out.sort((a, b) => {
          const ka = String(a.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          const kb = String(b.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          if (ka !== kb) return ka - kb;
          const sa = String(a.MoldCode || a.MoldID || '').trim();
          const sb = String(b.MoldCode || b.MoldID || '').trim();
          return sa.localeCompare(sb);
        });

        return out;
      } catch (e) {
        return [];
      }
    }



    parseIdList(v){
        if(v == null) return [];
        const s = String(v).trim();
        if(!s) return [];
        // tách theo: dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng, dấu | /
        return s
            .split(/[\s,;|/]+/g)
            .map(x => String(x || '').trim())
            .filter(Boolean);
        }

        normId(v){
        const s = (v == null) ? '' : String(v).trim();
        return s;
        }
    resolveFullItem(partialItem, type) {
      try {
        if (partialItem == null) return partialItem;

        // Nếu input là string (hay number) thì coi như mã, convert thành object nhỏ để tìm trong data.
        if (typeof partialItem !== 'object') {
          const s = String(partialItem || '').trim();
          if (!s) return partialItem;
          const t0 = String(type || '').toLowerCase();
          if (t0 === 'cutter') {
            partialItem = { CutterNo: s, CutterCode: s, CutterID: s, ID: s };
          } else {
            partialItem = { MoldCode: s, MoldID: s, ID: s };
          }
        }

        const t = String(type || '').toLowerCase();

        if (t === 'mold') {
          const id = this.normId(partialItem.MoldID || partialItem.ID || partialItem.id);
          const code = this.normId(partialItem.MoldCode || partialItem.code || partialItem.Code);
          const molds = Array.isArray(this.data?.molds) ? this.data.molds : [];
          const found = molds.find(m =>
            (id && this.normId(m?.MoldID || m?.ID) === id) ||
            (code && this.normId(m?.MoldCode) === code) ||
            (code && this.normId(m?.MoldID) === code)
          );
          return found || partialItem;
        }

        // Cutter
        const id = this.normId(partialItem.CutterID || partialItem.ID || partialItem.id);
        const no = this.normId(partialItem.CutterNo || partialItem.CutterCode || partialItem.code || partialItem.Code);
        const cutters = Array.isArray(this.data?.cutters) ? this.data.cutters : [];
        const found = cutters.find(c =>
          (id && this.normId(c?.CutterID || c?.ID) === id) ||
          (no && this.normId(c?.CutterNo || c?.CutterCode) === no) ||
          (no && this.normId(c?.CutterID || c?.ID) === no)
        );
        return found || partialItem;
      } catch (e) {
        return partialItem;
      }
    }

        getDesignIdsForMold(mold){
        const out = [];
        if(!mold) return out;

        // 1) từ mold row
        out.push(...this.parseIdList(mold.MoldDesignID));
        out.push(...this.parseIdList(mold.MoldDesignId));
        out.push(...this.parseIdList(mold.molddesignid));
        out.push(...this.parseIdList(mold.DesignID));

        // 2) từ molddesign (nếu file có cột MoldID / MoldIDs)
        try{
            const moldId = this.normId(mold.MoldID || mold.MoldCode);
            const designs = Array.isArray(this.data?.molddesign) ? this.data.molddesign : [];
            for(const d of designs){
            const did = this.normId(d.MoldDesignID || d.DesignID || d.molddesignid);
            if(!did) continue;

            const dMoldId = this.normId(d.MoldID || d.MoldId || d.MOLDID);
            const dMoldIds = []
                .concat(this.parseIdList(d.MoldIDs))
                .concat(this.parseIdList(d.MoldIdList))
                .concat(this.parseIdList(d.MoldList));

            if(moldId && (dMoldId === moldId || dMoldIds.includes(moldId))){
                out.push(did);
            }
            }
        }catch(e){ /* ignore */ }

        return Array.from(new Set(out.map(x => this.normId(x)).filter(Boolean)));
        }
    getRelatedCuttersForMold(mold) {
      try {
        if (!mold) return [];

        const cutters = Array.isArray(this.data?.cutters) ? this.data.cutters : [];
        const links = Array.isArray(this.data?.moldcutter) ? this.data.moldcutter : [];

        // direct ids từ chính mold row
        const directSet = new Set();
        const directIds = []
          .concat(this.parseIdList(mold.MoldDesignID || mold.MoldDesignId || mold.molddesignid || mold.DesignID))
          .map(x => this.normId(x))
          .filter(Boolean);
        for (const d of directIds) directSet.add(d);

        // all design ids (mold row + molddesign reverse)
        const designIds = new Set(this.getDesignIdsForMold(mold).map(x => this.normId(x)).filter(Boolean));
        if (!designIds.size) return [];

        const agg = new Map(); // cutterKey -> { cutter, designIds:Set }

        const push = (c, did) => {
          if (!c) return;
          const key = this.normId(c.CutterID || c.ID) || this.normId(c.CutterNo || c.CutterCode) || '';
          if (!key) return;
          let obj = agg.get(key);
          if (!obj) {
            obj = { cutter: c, designIds: new Set() };
            agg.set(key, obj);
          }
          if (did) obj.designIds.add(this.normId(did));
        };

        // A) cutters.csv
        for (const c of cutters) {
          const cDesignIds = []
            .concat(this.parseIdList(c.MoldDesignID))
            .concat(this.parseIdList(c.MoldDesignId))
            .concat(this.parseIdList(c.molddesignid))
            .concat(this.parseIdList(c.DesignID))
            .map(x => this.normId(x))
            .filter(Boolean);

          for (const did of cDesignIds) {
            if (designIds.has(did)) push(c, did);
          }
        }

        // B) moldcutter.csv
        for (const r of links) {
          const did = this.normId(r.MoldDesignID || r.MoldDesignId || r.DESIGNID || r.DesignID);
          if (!did || !designIds.has(did)) continue;
          const cid = this.normId(r.CutterID || r.CutterId || r.CUTTERID);
          if (!cid) continue;
          const found = cutters.find(c => this.normId(c.CutterID || c.ID) === cid);
          if (found) push(found, did);
        }

        const out = [];
        for (const obj of agg.values()) {
          const designList = Array.from(obj.designIds).filter(Boolean);
          const kind = designList.some(x => directSet.has(this.normId(x))) ? 'direct' : 'shared';
          const clone = { ...obj.cutter };
          clone.__dpLinkKind = kind;
          clone.__dpLinkDesignIds = designList;
          clone.dpLinkKind = kind;
          clone.dpLinkDesignIds = designList;
          out.push(clone);
        }

        out.sort((a, b) => {
          const ka = String(a.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          const kb = String(b.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          if (ka !== kb) return ka - kb;
          const sa = String(a.CutterNo || a.CutterCode || a.CutterID || a.ID || '').trim();
          const sb = String(b.CutterNo || b.CutterCode || b.CutterID || b.ID || '').trim();
          return sa.localeCompare(sb);
        });

        return out;
      } catch (e) {
        return [];
      }
    }



        ensureRelatedListsForOpen(){
        try{
            if(!this.currentItem) return;

            if(this.currentItemType === 'mold'){
            const mold = this.currentItem;
            mold.relatedCutters = this.getRelatedCuttersForMold(mold);
            }else{
            const cutter = this.currentItem;

            // dao cắt: luôn lấy danh sách khuôn liên quan theo moldcutter.csv
            cutter.relatedMolds = this.getSharedMoldsForCutter(cutter) || [];

            // đồng bộ centerMold: ưu tiên mold direct
            if (cutter.relatedMolds && cutter.relatedMolds.length) {
              const direct = cutter.relatedMolds.find(m => String(m.__dpLinkKind || '').toLowerCase() === 'direct');
              this.centerMold = direct || cutter.relatedMolds[0];
              this.centerMoldReason = direct ? 'ensureRelated:direct' : 'ensureRelated';
            } else if (this.centerMold) {
              // nếu vẫn rỗng, fallback theo centerMold (để luôn có ít nhất 1 khuôn tham chiếu)
              cutter.relatedMolds = [this.centerMold];
            }
            }
        }catch(e){
            /* ignore */
        }
        }


    notify(message, kind = 'info') {
      const msg = String(message || '').trim();
      if (!msg) return;

      try {
        if (window.NotificationModule) {
          if (typeof window.NotificationModule.showToast === 'function') {
            window.NotificationModule.showToast(msg, kind);
            return;
          }
          if (typeof window.NotificationModule.show === 'function') {
            window.NotificationModule.show(msg, kind);
            return;
          }
        }
      } catch (e) { /* ignore */ }

      try {
        if (window.App && typeof window.App.showToast === 'function') {
          window.App.showToast(msg, kind);
          return;
        }
      } catch (e) { /* ignore */ }

      console.log(`[DetailPanel ${VERSION}] ${kind}:`, msg);
    }

    // =====================================================================
    // QUICK ACTIONS + JUMPS
    // =====================================================================

    handleQuickAction(action) {
      if (!this.currentItem) return;

      if (action === 'photo') this.switchTab('photos');

      try {
        document.dispatchEvent(new CustomEvent('quick-action', {
          detail: {
            action,
            item: this.currentItem,
            itemType: this.currentItemType
          }
        }));
      } catch (err) {
        console.warn(`[DetailPanel ${VERSION}] quick-action dispatch failed`, err);
      }
    }

    getResizeStorageKey() {
      // Key cố định cho giao diện desktop 3 cột
      return `dp-resize:v1:${this.panelId}:desktop`;
    }

    loadResizeState() {
    try {
        const raw = localStorage.getItem(this.getResizeStorageKey());
        if (!raw) return null;

        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;

        const left = Number(obj.left);
        const center = Number(obj.center);
        const right = Number(obj.right);

        // Hỗ trợ dữ liệu cũ: chỉ có left/right
        if (Number.isFinite(left) && Number.isFinite(right) && !Number.isFinite(center)) {
        return { left, right };
        }

        if (!Number.isFinite(left) || !Number.isFinite(center) || !Number.isFinite(right)) return null;
        return { left, center, right };
    } catch (e) {
        return null;
    }
    }


    applyResizeState(grid, state) {
    if (!grid || !state) return;

    const colLeft = grid.querySelector('.dp-col-left');
    const colCenter = grid.querySelector('.dp-col-center');
    const colRight = grid.querySelector('.dp-col-right');
    if (!colLeft || !colCenter || !colRight) return;

    const minSideW = 250;
    const maxSideW = 600;
    const minCenterW = 520;

    let left = Math.round(Number(state.left));
    let right = Math.round(Number(state.right));
    let center = Math.round(Number(state.center));

    // Nếu là dữ liệu cũ (không có center) thì tính center theo tổng hiện tại
    if (!Number.isFinite(center)) {
        const total = colLeft.offsetWidth + colCenter.offsetWidth + colRight.offsetWidth;
        center = total - left - right;
    }

    left = Math.max(minSideW, Math.min(maxSideW, left));
    right = Math.max(minSideW, Math.min(maxSideW, right));
    center = Math.max(minCenterW, center);

    colLeft.style.width = left + 'px';
    colLeft.style.minWidth = left + 'px';
    colLeft.style.maxWidth = left + 'px';

    colCenter.style.width = center + 'px';
    colCenter.style.minWidth = center + 'px';

    colRight.style.width = right + 'px';
    colRight.style.minWidth = right + 'px';
    colRight.style.maxWidth = right + 'px';

    grid.style.gridTemplateColumns = `${left}px ${center}px ${right}px`;
    }


    saveResizeStateFromGrid(grid) {
    try {
        if (!grid) return;

        const colLeft = grid.querySelector('.dp-col-left');
        const colCenter = grid.querySelector('.dp-col-center');
        const colRight = grid.querySelector('.dp-col-right');
        if (!colLeft || !colCenter || !colRight) return;

        const left = Math.round(colLeft.getBoundingClientRect().width);
        const center = Math.round(colCenter.getBoundingClientRect().width);
        const right = Math.round(colRight.getBoundingClientRect().width);

        localStorage.setItem(
        this.getResizeStorageKey(),
        JSON.stringify({ left, center, right, t: Date.now() })
        );
    } catch (e) {
        // ignore
    }
    }


    initResizable() {
      // Wait for DOM ready
      setTimeout(() => {
        const grid = this.panel.querySelector('.dp-desktop-grid');
        if (!grid) return;

        const colLeft = grid.querySelector('.dp-col-left');
        const colRight = grid.querySelector('.dp-col-right');
        const leftHandle = colLeft?.querySelector('.resize-handle');
        const rightHandle = colRight?.querySelector('.resize-handle');
        // Khôi phục layout đã lưu (nếu có)
        const saved = this.loadResizeState();
        if (saved) {
          this.applyResizeState(grid, saved);
        }

        if (leftHandle && !leftHandle.dataset.dpResizeBound) {
          leftHandle.dataset.dpResizeBound = '1';
          if (leftHandle) this.makeResizable(colLeft, leftHandle, 'left', grid);
        }

        if (rightHandle && !rightHandle.dataset.dpResizeBound) {
          rightHandle.dataset.dpResizeBound = '1';
          if (rightHandle) this.makeResizable(colRight, rightHandle, 'right', grid);
        }

      }, 100);
    }

    makeResizable(column, handle, side, grid) {
      let isResizing = false;
      let startX = 0;

      // width ban đầu của 3 cột
      let startLeftW = 0;
      let startCenterW = 0;
      let startRightW = 0;
      let totalColumnsW = 0;

      const minSideW = 250;
      const maxSideW = 600;

      // cột giữa cũng cần min để không bị bóp quá nhỏ
      const minCenterW = 520;

      const getCols = () => {
        if (!grid) return {};
        const left = grid.querySelector('.dp-col-left');
        const center = grid.querySelector('.dp-col-center');
        const right = grid.querySelector('.dp-col-right');
        return { left, center, right };
      };

      const applyWidths = (leftW, centerW, rightW) => {
        const { left, center, right } = getCols();
        if (!left || !center || !right) return;

        left.style.width = leftW + 'px';
        left.style.minWidth = leftW + 'px';
        left.style.maxWidth = leftW + 'px';

        center.style.width = centerW + 'px';
        center.style.minWidth = centerW + 'px';

        right.style.width = rightW + 'px';
        right.style.minWidth = rightW + 'px';
        right.style.maxWidth = rightW + 'px';

        // Quan trọng: khóa luôn grid-template-columns theo px
        // để khi kéo, cột bên cạnh sẽ thay đổi “tương ứng”, không làm grid nở ra
        grid.style.gridTemplateColumns = `${leftW}px ${centerW}px ${rightW}px`;
      };

      handle.addEventListener('mousedown', (e) => {
        const { left, center, right } = getCols();
        if (!left || !center || !right) return;

        isResizing = true;
        startX = e.clientX;

        startLeftW = left.offsetWidth;
        startCenterW = center.offsetWidth;
        startRightW = right.offsetWidth;

        totalColumnsW = startLeftW + startCenterW + startRightW;

        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const diff = e.clientX - startX;

        let newLeftW = startLeftW;
        let newCenterW = startCenterW;
        let newRightW = startRightW;

        if (side === 'left') {
          // kéo vạch giữa CỘT TRÁI và CỘT GIỮA
          newLeftW = startLeftW + diff;
          newLeftW = Math.max(minSideW, Math.min(maxSideW, newLeftW));

          newCenterW = totalColumnsW - newLeftW - startRightW;

          // khóa min cho cột giữa, nếu chạm min thì trả bớt về cột trái
          if (newCenterW < minCenterW) {
            newCenterW = minCenterW;
            newLeftW = totalColumnsW - newCenterW - startRightW;
            newLeftW = Math.max(minSideW, Math.min(maxSideW, newLeftW));
            newCenterW = totalColumnsW - newLeftW - startRightW;
          }

          newRightW = startRightW;
        } else {
          // side === 'right' : kéo vạch giữa CỘT GIỮA và CỘT PHẢI
          newRightW = startRightW - diff;
          newRightW = Math.max(minSideW, Math.min(maxSideW, newRightW));

          newCenterW = totalColumnsW - startLeftW - newRightW;

          if (newCenterW < minCenterW) {
            newCenterW = minCenterW;
            newRightW = totalColumnsW - startLeftW - newCenterW;
            newRightW = Math.max(minSideW, Math.min(maxSideW, newRightW));
            newCenterW = totalColumnsW - startLeftW - newRightW;
          }

          newLeftW = startLeftW;
        }

        applyWidths(newLeftW, newCenterW, newRightW);
      });

      document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.saveResizeStateFromGrid(grid);
      });
    }


    openFutureModule(moduleKey) {
      const mold = this.centerMold || (this.currentItemType === 'mold' ? this.currentItem : null);
      const moldId = mold ? (mold.MoldID || mold.MoldCode || '') : '';

      this.notify(`Module "${moduleKey}" sẽ phát triển sau (đã tạo event tích hợp).`, 'info');

      try {
        document.dispatchEvent(new CustomEvent('module:open', {
          detail: {
            module: moduleKey,
            moldId,
            mold,
            from: `DetailPanel-${VERSION}`
          }
        }));
      } catch (err) {
        console.warn(`[DetailPanel ${VERSION}] module:open dispatch failed`, err);
      }
    }

    handleJump(key) {
      if (!key) return;

      if (key === 'history') { this.switchTab('history'); return; }
      if (key === 'teflon') { this.switchTab('teflon'); return; }
      if (key === 'extended') { this.switchTab('extended'); return; }
      if (key === 'transfer') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-transfer'); return; }
      if (key === 'storage') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-storage'); return; }
      if (key === 'design') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-design'); return; }
      if (key === 'customers') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-customers'); return; }
      if (key === 'product') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-product'); return; }
    }

    scrollToAnchor(id) {
      if (!id) return;
      setTimeout(() => {
        const el = this.panel.querySelector(`#${id}`);
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }

    // =====================================================================
    // CENTER MOLD (for cutter)
    // =====================================================================

    findCenterMoldFromCutter(cutter) {
      try {
        if (!cutter) return null;

        // 1) Nếu đã có relatedMolds (enriched) thì dùng luôn
        if (Array.isArray(cutter.relatedMolds) && cutter.relatedMolds.length) {
          this.centerMoldReason = 'relatedMolds';
          return cutter.relatedMolds[0];
        }

        // 2) Tính danh sách khuôn liên quan theo moldcutter.csv
        const shared = this.getSharedMoldsForCutter(cutter);
        if (shared && shared.length) {
          // ưu tiên khuôn direct
          const direct = shared.find(m => String(m.__dpLinkKind || '').toLowerCase() === 'direct');
          this.centerMoldReason = direct ? 'sharedMolds:direct' : 'sharedMolds';
          return direct || shared[0];
        }

        this.centerMoldReason = 'none';
        return null;
      } catch (e) {
        this.centerMoldReason = 'error';
        return null;
      }
    }


    // =====================================================================
    // TAB 1: INFO
    // =====================================================================

    renderInfoTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;
      
      if (this.isDesktopWide()) {
        if (this.currentItemType === 'mold' && this.centerMold) {
          return this.renderInfoTabDesktopMoldCentric();
        }
        if (this.currentItemType === 'cutter') {
          return this.renderInfoTabDesktopCutterCentric();
        }
      }


      let html = '';
      html += this.renderLocationSection(this.currentItem, this.currentItemType);
      html += this.renderBasicInfoSection(this.currentItem, this.currentItemType);
      html += this.renderTechnicalInfoSection(this.currentItem, this.currentItemType);
      html += this.renderProductInfoSection(this.currentItem, this.currentItemType);
      html += this.renderStatusNotesSection(this.currentItem, this.currentItemType);
      html += this.renderAdditionalDataSection(this.currentItem, this.currentItemType);

      if (this.currentItemType === 'cutter' && this.centerMold) {
        html += `
          <div class="modal-section">
            <div class="section-header">
              <i class="fas fa-cube"></i>
              <span>Khuôn trung tâm / 中心金型</span>
            </div>
            <div class="info-message">
              Dao cắt này có thể đi với khuôn: <b>${this.safeText(this.centerMold.MoldCode || this.centerMold.MoldID)}</b>
              <button class="btn-action" style="margin-left:8px" type="button" data-jump="extended">Xem tổng quan</button>
            </div>
          </div>
        `;
      }

      return html;
    }

    renderInfoTabDesktopMoldCentric() {
      const mold = this.centerMold || (this.currentItemType === 'mold' ? this.currentItem : null);
      if (!mold) return `<p class="no-data">No mold selected</p>`;

      const left = this.renderDesktopLeftColumnMold(mold);
      const center = this.renderDesktopCenterColumnMold(mold);
      const right = this.renderDesktopRightColumnMold(mold);

      return `
        <div class="dp-desktop-grid">
          <aside class="dp-col-left">
            ${left}
            <div class="resize-handle resize-handle-vertical"></div>
          </aside>
          <main class="dp-col-center">${center}</main>
          <aside class="dp-col-right">
            <div class="resize-handle resize-handle-vertical"></div>
            ${right}
          </aside>
        </div>
      `;
    }

    renderInfoTabDesktopCutterCentric() {
      const cutter = this.currentItem;
      const left = this.renderDesktopLeftColumnCutter(cutter);
      const center = this.renderDesktopCenterColumnCutter(cutter);
      const right = this.renderDesktopRightColumnCutter(cutter);

      return `
        <div class="dp-desktop-grid">
          <aside class="dp-col-left">
            ${left}
            <div class="resize-handle resize-handle-vertical"></div>
          </aside>
          <main class="dp-col-center">${center}</main>
          <aside class="dp-col-right">
            <div class="resize-handle resize-handle-vertical"></div>
            ${right}
          </aside>
        </div>
      `;
    }

    renderDesktopLeftColumnCutter(cutter) {
      let html = '';
      html += this.renderDesktopPhotoPreview(cutter);            // sẽ sửa ở mục 4 để auto đổi title theo mold/cutter
      html += this.renderLocationSection(cutter, 'cutter');
      html += this.renderDesktopMiniRelated(cutter, 'cutter');   // quan trọng: cutter => phải ra “Khuôn liên quan”
      html += this.renderDesktopMiniSnapshotsCutter(cutter);
      return html;
    }

    renderDesktopMiniSnapshotsCutter(cutter) {
      // Snapshot hiện tại đang thiên về mold logs; để tránh hiển thị sai, tạm show thông báo.
      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-bolt"></i>
            <span>概要 / Snapshot</span>
          </div>
          <div class="info-message">
            抜型の Snapshot は現在簡易表示です（ログCSVの項目定義により拡張予定）。<br/>
            Snapshot cho dao cắt hiện đang hiển thị đơn giản (sẽ mở rộng sau).
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-jump="history">
              <i class="fas fa-history"></i><span>履歴<br><span class="sub">History</span></span>
            </button>
            <button class="dp-action-btn" type="button" data-jump="extended">
              <i class="fas fa-layer-group"></i><span>拡張<br><span class="sub">Extended</span></span>
            </button>
          </div>
        </div>
      `;
    }

    renderDesktopCenterColumnCutter(cutter) {
      let html = '';
      html += this.renderDesktopHero(cutter, 'cutter');
      html += this.renderBasicInfoSection(cutter, 'cutter');      // => dùng renderCutterBasicInfoFull
      html += this.renderProductInfoSection(cutter, 'cutter');    // => dùng renderCutterProductReferenceSection
      html += this.renderTechnicalInfoSection(cutter, 'cutter');  // => cutter kỹ thuật + cutters fields
      html += this.renderStatusNotesSection(cutter, 'cutter');

      if (this.centerMold) {
        html += `
          <div class="modal-section">
            <div class="section-header">
              <i class="fas fa-cube"></i>
              <span>中心金型 / Khuôn trung tâm</span>
            </div>
            <div class="info-message">
              抜型は共有されるため、中心金型は「参照」です。<br/>
              Dao cắt có thể dùng chung, khuôn trung tâm chỉ để tham khảo: 
              <b>${this.safeText(this.centerMold.MoldCode || this.centerMold.MoldID)}</b>
              <button class="btn-action" style="margin-left:8px" type="button" data-jump="extended">拡張 / Extended</button>
            </div>
          </div>
        `;
      }

      return html;
    }

    renderDesktopRightColumnCutter(cutter) {
      let html = '';
      html += this.renderDesktopQuickActions(cutter, 'cutter');

      // Quick queries của mold đang dùng MoldID; cutter thì tạm hiển thị khối neutral để không sai dữ liệu
      html += `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-search"></i>
            <span>クイック照会 / Truy vấn nhanh</span>
          </div>
          <div class="info-grid-2col ">
            <div class="info-item">
              <div class="info-label">状態 / Status</div>
              <div class="info-value">---</div>
            </div>
            <div class="info-item">
              <div class="info-label">保管 / Location</div>
              <div class="info-value">---</div>
            </div>
            <div class="info-item">
              <div class="info-label">移動 / Transfer</div>
              <div class="info-value">---</div>
            </div>
          </div>
          <div class="info-message" style="margin-top:10px">
            抜型ログの結び方（statuslogs のキー）を確定後に自動表示します。<br/>
            Sau khi chốt khóa liên kết log cho dao cắt, phần này sẽ tự hiện đúng.
          </div>
        </div>
      `;

      // Khối “Tích hợp sau” bạn đang có ở mold: dùng lại cho cutter (text không phụ thuộc mold)
      html += `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-plug"></i>
            <span>今後 / Tích hợp sau</span>
          </div>
          <div class="info-message">
            Những mục như Bảo trì, Tài liệu, Chứng nhận lưu giữ, Điều kiện định hình... sẽ nối module sau.
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-module-open="maintenance"><i class="fas fa-tools"></i><span>Maintenance<br><span class="sub">Bảo trì</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="documents"><i class="fas fa-file-alt"></i><span>Docs<br><span class="sub">Tài liệu</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="custody"><i class="fas fa-file-signature"></i><span>Custody<br><span class="sub">Lưu giữ</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="shaping"><i class="fas fa-sliders-h"></i><span>Shaping<br><span class="sub">Điều kiện</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="materials"><i class="fas fa-industry"></i><span>Materials<br><span class="sub">Nhựa</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="consumables"><i class="fas fa-boxes"></i><span>Consum.<br><span class="sub">Tiêu hao</span></span></button>
          </div>
        </div>
      `;

      return html;
    }


    renderDesktopLeftColumnMold(mold) {
      let html = '';
      html += this.renderDesktopPhotoPreview(mold);
      html += this.renderLocationSection(mold, 'mold');
      html += this.renderDesktopMiniRelated(mold, 'mold');
      html += this.renderDesktopMiniSnapshots(mold);
      return html;
    }

    renderDesktopCenterColumnMold(mold) {
      let html = '';
      const heroItem = (this.currentItemType === 'cutter') ? this.currentItem : mold;
      const heroType = (this.currentItemType === 'cutter') ? 'cutter' : 'mold';
      html += this.renderDesktopHero(heroItem, heroType);

      html += this.renderBasicInfoSection(mold, 'mold');
      html += this.renderProductInfoSection(mold, 'mold');
      html += this.renderTechnicalInfoSection(mold, 'mold');
      html += this.renderStatusNotesSection(mold, 'mold');

      html += `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-layer-group"></i>
            <span>Đi sâu theo dữ liệu / データ深掘り</span>
          </div>
          <div class="dp-actions-grid">
            <button class="dp-action-btn" type="button" data-jump="design"><i class="fas fa-drafting-compass"></i><span>Design<br><span class="sub">Thiết kế</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="customers"><i class="fas fa-building"></i><span>Customers<br><span class="sub">Khách hàng</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="product"><i class="fas fa-box"></i><span>Product<br><span class="sub">Job</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="storage"><i class="fas fa-warehouse"></i><span>Storage<br><span class="sub">Vị trí</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="transfer"><i class="fas fa-truck"></i><span>Transfer<br><span class="sub">Vận chuyển</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="extended"><i class="fas fa-arrow-right"></i><span>Open<br><span class="sub">Mở rộng</span></span></button>
          </div>
          <div class="info-message" style="margin-top:10px">
            Gợi ý: Tab <b>Mở rộng</b> chỉ dùng các bảng CSV hiện có nên mở ra là xem được ngay.
          </div>
        </div>
      `;

      return html;
    }

    renderDesktopRightColumnMold(mold) {
      let html = '';
      html += this.renderDesktopQuickActions(mold, 'mold');
      html += this.renderDesktopQuickQueries(mold);

      html += `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-plug"></i>
            <span>Tích hợp sau / 今後</span>
          </div>
          <div class="info-message">
            Những mục như Bảo trì, Tài liệu, Chứng nhận lưu giữ, Điều kiện định hình... sẽ nối module sau.
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-module-open="maintenance"><i class="fas fa-tools"></i><span>Maintenance<br><span class="sub">Bảo trì</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="documents"><i class="fas fa-file-alt"></i><span>Docs<br><span class="sub">Tài liệu</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="custody"><i class="fas fa-file-signature"></i><span>Custody<br><span class="sub">Lưu giữ</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="shaping"><i class="fas fa-sliders-h"></i><span>Shaping<br><span class="sub">Điều kiện</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="materials"><i class="fas fa-industry"></i><span>Materials<br><span class="sub">Nhựa</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="consumables"><i class="fas fa-boxes"></i><span>Consum.<br><span class="sub">Tiêu hao</span></span></button>
          </div>
        </div>
      `;

      return html;
    }

    renderDesktopHero(item, type) {
      const e = (v) => this.escapeHtml(v);

      const isMold = String(type || '').toLowerCase() === 'mold';

      // Cột 1: nhận dạng
      const line1 = isMold
        ? (item?.MoldCode || item?.MoldID || '-')
        : (item?.CutterNo || item?.CutterCode || item?.CutterDesignCode || item?.CutterID || '-');

      const id = isMold
        ? (item?.MoldID || '-')
        : (item?.CutterID || item?.ID || '-');

      const name = isMold
        ? (item?.MoldName || item?.Name || '')
        : (item?.CutterName || item?.CutterDesignName || item?.Name || '');

      // Cột 2: tóm tắt lưu trữ + trạng thái
      const loc = item?.displayRackLocation || item?.displayLocation || item?.location || item?.rackNo || item?.RackLayerID || '-';
      const rackLayer = this.getRackLayerText(item);
      const companyInfo = this.getStorageCompanyInfo ? this.getStorageCompanyInfo(item) : null;
      const statusInfo = this.getStorageStatus ? this.getStorageStatus(item) : null;

      // Trả/Hủy khuôn (chỉ cho mold)
      const returning = isMold ? (item?.MoldReturning || item?.Returning || '') : '';
      const disposing = isMold ? (item?.MoldDisposing || item?.Disposing || '') : '';

      const heroClass = isMold ? 'dp-hero dp-hero--mold' : 'dp-hero dp-hero--cutter';

      return `
        <div class="${heroClass}">
          <div class="dp-hero-grid">
            <div class="dp-hero-col dp-hero-col-1">
              <div class="dp-hero-line1">${e(line1)}</div>
              <div class="dp-hero-line2">
                <span class="dp-hero-id">${e(id)}</span>
                ${name ? `<span class="dp-hero-dot">•</span><span class="dp-hero-name2">${e(name)}</span>` : ``}
              </div>
            </div>

            <div class="dp-hero-col dp-hero-col-2">
              <div class="dp-hero-kv">
                <span class="dp-hero-k">場所 / Vị trí</span>
                <span class="dp-hero-v">${e(loc)}</span>
              </div>

              <div class="dp-hero-kv">
                <span class="dp-hero-k">保管会社 / Công ty lưu trữ</span>
                <span class="dp-hero-v ${companyInfo?.needsHighlight ? 'dp-hero-v--warn' : ''}">
                  ${e(companyInfo?.nameShort || '-')}
                </span>
              </div>

              <div class="dp-hero-kv">
                <span class="dp-hero-k">状態 / Trạng thái</span>
                <span class="dp-hero-v">${e(statusInfo?.textShort || statusInfo?.text || '---')}</span>
                <span class="dp-hero-v dp-hero-date">${e(statusInfo?.lastConfirmDateText || '-')}</span>
              </div>

              ${returning ? `
                <div class="dp-hero-kv dp-hero-kv--warn">
                  <span class="dp-hero-k">返却 / Trả khuôn</span>
                  <span class="dp-hero-v">${e(returning)}</span>
                </div>
              ` : ``}

              ${disposing ? `
                <div class="dp-hero-kv dp-hero-kv--danger">
                  <span class="dp-hero-k">廃棄 / Hủy khuôn</span>
                  <span class="dp-hero-v">${e(disposing)}</span>
                </div>
              ` : ``}
            </div>
          </div>
        </div>
      `;
    }


    renderDesktopQuickActions(item, type) {
      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-bolt"></i>
            <span>Quick actions / Thao tác nhanh</span>
          </div>
          <div class="dp-actions-grid">
            <button class="dp-action-btn" data-action="checkin" type="button"><i class="fas fa-arrow-circle-down"></i><span>入庫<br><span class="sub">Nhập</span></span></button>
            <button class="dp-action-btn" data-action="checkout" type="button"><i class="fas fa-arrow-circle-up"></i><span>出庫<br><span class="sub">Xuất</span></span></button>
            <button class="dp-action-btn" data-action="move" type="button"><i class="fas fa-map-signs"></i><span>位置<br><span class="sub">Di chuyển</span></span></button>
            <button class="dp-action-btn" data-action="inventory" type="button"><i class="fas fa-clipboard-check"></i><span>棚卸<br><span class="sub">Kiểm kê</span></span></button>
            <button class="dp-action-btn" data-action="print" type="button"><i class="fas fa-print"></i><span>印刷<br><span class="sub">In</span></span></button>
            <button class="dp-action-btn" data-action="qr" type="button"><i class="fas fa-qrcode"></i><span>QR<br><span class="sub">Mã</span></span></button>
            <button class="dp-action-btn" data-action="photo" type="button"><i class="fas fa-camera"></i><span>写真<br><span class="sub">Ảnh</span></span></button>
          </div>
          <div class="info-message" style="margin-top:10px">
            Các nút trên sẽ bắn sự kiện <b>quick-action</b> để App xử lý.
          </div>
        </div>
      `;
    }

    renderDesktopQuickQueries(mold) {
      const lastStatus = this.getLatestStatusLog('MOLD', mold.MoldID);
      const lastLocation = this.getLatestLocationLog('MOLD', mold.MoldID);
      const lastShip = this.getLatestShipLog('MOLD', mold.MoldID);

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-search"></i>
            <span>Truy vấn nhanh / クイック</span>
          </div>

          <div class="info-grid-2col">
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value">${this.safeText(lastStatus?.Status || lastStatus?.Action || '')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Status time</div>
              <div class="info-value">${this.safeText(this.formatDate(lastStatus?.Timestamp || ''))}</div>
            </div>

            <div class="info-item">
              <div class="info-label">Location</div>
              <div class="info-value">${this.safeText(lastLocation?.NewLocation || lastLocation?.RackLayerID || '')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Location time</div>
              <div class="info-value">${this.safeText(this.formatDate(lastLocation?.Timestamp || lastLocation?.Date || ''))}</div>
            </div>

            <div class="info-item">
              <div class="info-label">Transfer</div>
              <div class="info-value">${this.safeText(this.getDestinationName(lastShip?.DestinationID) || lastShip?.Destination || '')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Transfer time</div>
              <div class="info-value">${this.safeText(this.formatDate(lastShip?.Timestamp || lastShip?.ShipDate || ''))}</div>
            </div>
          </div>

          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-jump="history"><i class="fas fa-history"></i><span>履歴<br><span class="sub">Lịch sử</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="teflon"><i class="fas fa-spray-can"></i><span>Teflon<br><span class="sub">Coating</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="storage"><i class="fas fa-warehouse"></i><span>Storage<br><span class="sub">Kho</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="transfer"><i class="fas fa-truck"></i><span>Transfer<br><span class="sub">Vận chuyển</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="extended"><i class="fas fa-layer-group"></i><span>Extended<br><span class="sub">Mở rộng</span></span></button>
            <button class="dp-action-btn" type="button" data-action="print"><i class="fas fa-print"></i><span>印刷<br><span class="sub">In</span></span></button>
          </div>
        </div>
      `;
    }

    // =====================================================================
    // PHOTO PREVIEW (Desktop left)
    // =====================================================================

    findFirstPhotoUrl(item) {
      if (!item) return '';

      const candidates = [
        'PhotoUrl','PhotoURL','ImageUrl','ImageURL','photoUrl','imageUrl',
        'Photo','Image','ImagePath','PhotoPath','photo','image',
        'MoldPhoto','MoldImage','CutterPhoto','CutterImage',
        'Photo1','Photo2','Photo3','Image1','Image2','Image3'
      ];

      for (const k of candidates) {
        const v = item[k];
        const url = this.extractUrlFromValue(v);
        if (url) return url;
      }

      try {
        for (const k in item) {
          const v = item[k];
          const url = this.extractUrlFromValue(v);
          if (url) return url;
        }
      } catch (e) { /* ignore */ }

      return '';
    }

    extractUrlFromValue(v) {
      if (!v) return '';

      if (Array.isArray(v)) {
        for (const it of v) {
          const u = this.extractUrlFromValue(it);
          if (u) return u;
        }
        return '';
      }

      if (typeof v === 'object') {
        const maybe = v.url || v.URL || v.href || v.path || v.src;
        if (maybe) return this.extractUrlFromValue(maybe);
        return '';
      }

      const s = String(v).trim();
      if (!s) return '';

      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
          const parsed = JSON.parse(s);
          return this.extractUrlFromValue(parsed);
        } catch (e) { /* ignore */ }
      }

      if (/^https?:\/\//i.test(s)) return s;

      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(s)) return s;

      const m = s.match(/https?:\/\/[^\s"']+/i);
      if (m && m[0]) return m[0];

      return '';
    }

    renderDesktopPhotoPreview(item) {
      const isCutter = !!(item && (item.CutterID || item.CutterNo || item.CutterName || item.CutterDesignCode));
      const title = isCutter ? '抜型写真 / Ảnh dao cắt' : '金型写真 / Ảnh khuôn';

      const url = this.findFirstPhotoUrl(item);
      const code = isCutter
        ? this.safeText(item.CutterNo || item.CutterID)
        : this.safeText(item.MoldCode || item.MoldID);

      if (!url) {
        return `
          <div class="modal-section">
            <div class="section-header">
              <i class="fas fa-image"></i>
              <span>${title}</span>
            </div>
            <div class="info-message">
              写真はまだ登録されていません。<br/>
              Chưa có ảnh trong dữ liệu hiện tại.
            </div>
          </div>
        `;
      }

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-image"></i>
            <span>${title}</span>
          </div>
          <div style="border-radius:12px; overflow:hidden; border:1px solid rgba(15,23,42,0.10); background:#fff;">
            <img src="${this.escapeHtml(url)}" alt="${this.escapeHtml(code)}" style="width:100%; height:auto; display:block;" onerror="this.style.display='none'"/>
          </div>
          <div class="info-message" style="margin-top:8px">
            写真が表示されない場合、社内URLのアクセス権限をご確認ください。<br/>
            Nếu ảnh không hiển thị, có thể do URL nội bộ không public.
          </div>
        </div>
      `;
    }


// ===== Related list (2-line row) helpers (v8.3.2-7-3) =====
getPriceText(item) {
  try {
    const keys = [
      'Price','UnitPrice','Cost','Value','Amount','JPY','Jpy','Yen',
      'MoldPrice','CutterPrice','MoldValue','CutterValue',
      'UnitCost','MaterialCost','PurchasePrice',
      '価格','単価','金額'
    ];
    for (const k of keys) {
      if (!item || !(k in item)) continue;
      const v = item[k];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return '';
  } catch (e) {
    return '';
  }
}

buildRelatedLine2Text(row, rowItemType) {
  try {
    const t = String(rowItemType || '').toLowerCase();

    if (t === 'cutter') {
      const id = this.safeText(row?.CutterID, row?.ID);
      const name = this.safeText(row?.CutterDesignName, row?.CutterName) || this.safeText(row?.Name, '');
      const parts = [];
      if (id && id !== '-') parts.push(id);
      if (name && name !== '-') parts.push(name);
      return parts.length ? parts.join(' · ') : '-';
    }

    // mold
    const id = this.safeText(row?.MoldID, '');
    const name = this.safeText(row?.MoldDesignName, row?.MoldName) || this.safeText(row?.Name, '');
    const parts = [];
    if (id && id !== '-') parts.push(id);
    if (name && name !== '-') parts.push(name);
    return parts.length ? parts.join(' · ') : '-';
  } catch (e) {
    return '-';
  }
}

renderRelatedRow(row, rowItemType) {
  const t = String(rowItemType || '').toLowerCase();
  const isMold = (t === 'mold');

  const typeChip = isMold ? 'M' : 'C';
  const typeCls = isMold ? 'dp-type-chip dp-type-chip--mold' : 'dp-type-chip dp-type-chip--cutter';

  const codeText = isMold
    ? (row?.MoldCode ?? row?.MoldID ?? '---')
    : (row?.CutterNo ?? row?.CutterCode ?? row?.CutterID ?? row?.ID ?? '---');

  const kind = String(row?.dpLinkKind || row?.__dpLinkKind || '').toLowerCase().trim();
  const kindBadge = kind ? this.renderLinkKindBadge(kind) : '';

  const price = this.getPriceText(row);
  const rackBadge = this.renderRackLayerBadge(row);

  const line2 = this.buildRelatedLine2Text(row, rowItemType);

  const dataItem = isMold
    ? { MoldID: row?.MoldID, MoldCode: row?.MoldCode }
    : { CutterID: row?.CutterID ?? row?.ID, CutterNo: row?.CutterNo ?? row?.CutterCode };
  const dataJson = this.escapeHtml(JSON.stringify(dataItem));

  return `
    <button type="button" class="dp-related-item view-detail-btn" data-item-type="${this.escapeHtml(t)}" data-item="${dataJson}">
      <div class="dp-related-left">
        <span class="${typeCls}">${this.escapeHtml(typeChip)}</span>
      </div>
      <div class="dp-related-main">
        <div class="dp-related-line1">
          <span class="dp-related-code">${this.escapeHtml(String(codeText || '---'))}</span>
          ${kindBadge}
        </div>
        <div class="dp-related-line2">${this.escapeHtml(String(line2 || '-'))}</div>
      </div>
      <div class="dp-related-right">
        <div class="dp-related-meta">
          ${price ? `<span class="dp-related-price">${this.escapeHtml(String(price))}</span>` : ''}
          ${rackBadge ? `<span class="dp-related-rack">${rackBadge}</span>` : ''}
        </div>
      </div>
    </button>
  `.trim();
}


renderDesktopMiniRelated(item, type) {
  try {
    const t = String(type || '').toLowerCase();
    let list = [];
    let title = '';
    let rowItemType = '';

    if (t === 'mold') {
      title = 'Dao cắt liên quan';
      rowItemType = 'cutter';
      list = this.getRelatedCuttersForMold(item) || [];
    } else {
      title = 'Khuôn liên quan';
      rowItemType = 'mold';
      list = this.getSharedMoldsForCutter(item) || [];
    }

    const total = Array.isArray(list) ? list.length : 0;

    let html = '';
    html += `
      <div class="modal-section dp-related-section">
        <div class="section-header">
          <i class="fas fa-link"></i>
          <span>${this.escapeHtml(title)} (${total})</span>
        </div>
    `;

    if (!total) {
      html += `<div class="no-data">Không có thiết bị liên quan</div></div>`;
      return html;
    }

    html += `<div class="dp-related-list">`;
    for (const r of list) {
      html += this.renderRelatedRow(r, rowItemType);
    }
    html += `</div></div>`;

    return html;
  } catch (e) {
    return '';
  }
}

    renderDesktopMiniSnapshots(mold) {
      const lastTeflon = this.getTeflonHistory(mold.MoldID)[0] || null;
      const lastStatus = this.getLatestStatusLog('MOLD', mold.MoldID);

      const teflonStatus = lastTeflon ? (lastTeflon.TeflonStatus || lastTeflon.Status || '') : '';
      const teflonDate = lastTeflon ? (lastTeflon.ReceivedDate || lastTeflon.SentDate || lastTeflon.RequestedDate || '') : '';

      return `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-bolt"></i><span>Snapshot / 概要</span></div>
          <div class="info-grid-2col">
            <div class="info-item">
              <div class="info-label">Latest status</div>
              <div class="info-value">${this.safeText(lastStatus?.Status || '')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Status time</div>
              <div class="info-value">${this.safeText(this.formatDate(lastStatus?.Timestamp || ''))}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Teflon</div>
              <div class="info-value">${this.safeText(teflonStatus || '')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Teflon time</div>
              <div class="info-value">${this.safeText(this.formatDate(teflonDate || ''))}</div>
            </div>
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-jump="history"><i class="fas fa-history"></i><span>履歴<br><span class="sub">History</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="teflon"><i class="fas fa-spray-can"></i><span>Teflon<br><span class="sub">Coating</span></span></button>
            <button class="dp-action-btn" type="button" data-jump="extended"><i class="fas fa-layer-group"></i><span>Extended<br><span class="sub">Mở rộng</span></span></button>
          </div>
        </div>
      `;
    }


    // =====================================================================
    // INFO SECTIONS (Mobile/Tablet & reuse in desktop)
    // =====================================================================


renderLocationSection(item, type) {
  const e = (v) => this.escapeHtml(v);

  const companyInfo = this.getStorageCompanyInfo(item) || { nameShort: '-', isExternal: false, needsHighlight: false };
  const statusInfo = this.getStorageStatus(item) || { class: 'status-unknown', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };

  const rackLayerInfo = item?.rackLayerInfo;
  const rackInfo = item?.rackInfo;

  const rackId = rackInfo?.RackID ?? rackLayerInfo?.RackID ?? '-';
  const layerNum = rackLayerInfo?.RackLayerNumber ?? '-';

  const rackLocation = rackInfo?.RackLocation ?? item?.displayRackLocation ?? item?.displayLocation ?? item?.RackLayerID ?? item?.location ?? '-';
  const rackNotes = (rackInfo?.RackNotes ?? '').toString().trim();
  const layerNotes = (rackLayerInfo?.RackLayerNotes ?? rackLayerInfo?.RackLayerNote ?? '').toString().trim();

  const isExternal = !!companyInfo.isExternal;
  const companyBadgeCls = isExternal ? 'dp-company-badge dp-company-badge--external' : 'dp-company-badge dp-company-badge--ysd';
  const confirmGroupCls = statusInfo.isExpired ? 'confirm-date-group expired' : 'confirm-date-group';

  const rackLayerText = this.toCircledNumber(rackId)
    ? `${this.toCircledNumber(rackId)}-${String(layerNum ?? '').trim() || '-'}`
    : `${String(rackId ?? '').trim() || '-'}-${String(layerNum ?? '').trim() || '-'}`;

  return `
    <div class="modal-section location-section">
      <div class="section-header">
        <i class="fas fa-map-marker-alt"></i>
        <span>保管情報 / Thông tin lưu trữ</span>
      </div>

      <div class="location-content">
        <div class="dp-storage-top">
          <div class="dp-storage-col">
            <div class="dp-storage-label">会社 / Công ty</div>
            <div class="${companyBadgeCls}">${e(companyInfo.nameShort || '-')}</div>
          </div>

          <div class="dp-storage-col">
            <div class="dp-storage-label">棚-段 / Giá - Tầng</div>
            <div class="dp-badge-racklayer">${e(rackLayerText)}</div>
          </div>

          <div class="dp-storage-col">
            <div class="dp-storage-label">状態 / Trạng thái</div>
            <div class="status-badge-compact ${e(statusInfo.class || '')}">
              <i class="${e(statusInfo.icon || '')}"></i>
              <span>${e(statusInfo.textShort || '---')}</span>
            </div>
          </div>

          <div class="dp-storage-col ${confirmGroupCls}">
            <div class="dp-storage-label">確認日 / Xác nhận</div>
            <div class="date-badge-compact">
              <i class="fas fa-calendar-check"></i>
              <span class="date-text">${e(statusInfo.lastConfirmDateText || '---')}</span>
            </div>
          </div>
        </div>

        <div class="dp-storage-raw">
          <div class="info-line">
            <i class="fas fa-map-pin" style="opacity:.7"></i>
            <span class="label">場所 / Vị trí</span>
            <span class="value">${e(rackLocation)}</span>
          </div>
          ${rackNotes ? `
            <div class="info-line">
              <i class="fas fa-sticky-note" style="opacity:.7"></i>
              <span class="label">棚メモ / Ghi chú giá</span>
              <span class="value">${e(rackNotes)}</span>
            </div>
          ` : ''}
          ${layerNotes ? `
            <div class="info-line">
              <i class="fas fa-sticky-note" style="opacity:.7"></i>
              <span class="label">段メモ / Ghi chú tầng</span>
              <span class="value">${e(layerNotes)}</span>
            </div>
          ` : ''}
        </div>

        ${isExternal ? `
          <div class="dp-storage-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span>社外保管中 / Khuôn đang được lưu trữ bên ngoài.</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

    getStorageCompanyInfo(item) {
      const companyId = item.storage_company || item.storageCompany || item.CompanyID || '';
      const companyMap = this.data.companies || [];
      const company = companyMap.find(c => String(c.CompanyID || '').trim() === String(companyId).trim());

      const name = company ? (company.CompanyShortName || company.CompanyName || '') : '';
      const nameShort = name || 'YSD';

      const isExternal = nameShort && nameShort.toUpperCase() !== 'YSD';
      const needsHighlight = isExternal;

      return { nameShort, isExternal, needsHighlight };
    }


getStorageStatus(item) {
  try {
    const logs = Array.isArray(this.data?.statuslogs) ? this.data.statuslogs : [];
    const moldId = this.normId(item?.MoldID ?? item?.moldId ?? item?.MoldCode);
    if (!moldId) return { class: 'status-unknown', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };

    const filtered = logs.filter((log) => {
      const id = this.normId(log?.MoldID ?? log?.MOLDID ?? log?.MoldCode);
      return id && id === moldId;
    });

    filtered.sort((a, b) => {
      const ta = Date.parse(a?.Timestamp || a?.Date || '') || 0;
      const tb = Date.parse(b?.Timestamp || b?.Date || '') || 0;
      return tb - ta;
    });

    const latest = filtered[0];
    if (!latest) return { class: 'status-no-history', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };

    const raw = String(latest?.Status ?? latest?.Action ?? '').toUpperCase();
    let cls = 'status-unknown';
    let icon = 'fas fa-question-circle';

    if (raw.includes('IN') || raw.includes('入') || raw.includes('NHAP')) {
      cls = 'status-in';
      icon = 'fas fa-arrow-circle-down';
    } else if (raw.includes('OUT') || raw.includes('出') || raw.includes('XUAT')) {
      cls = 'status-out';
      icon = 'fas fa-arrow-circle-up';
    } else if (raw.includes('AUDIT') || raw.includes('棚卸') || raw.includes('KIM')) {
      cls = 'status-audit';
      icon = 'fas fa-clipboard-check';
    } else if (raw.includes('RETURN') || raw.includes('返')) {
      cls = 'status-returned';
      icon = 'fas fa-undo';
    } else if (raw.includes('DISPOSE') || raw.includes('廃棄')) {
      cls = 'status-disposed';
      icon = 'fas fa-trash';
    }

    const ts = Date.parse(latest?.Timestamp || latest?.Date || '') || 0;
    const now = Date.now();
    const days = ts ? Math.floor((now - ts) / (1000 * 60 * 60 * 24)) : 99999;
    const isExpired = days >= 90;

    let dateText = '---';
    if (ts) {
      const d = new Date(ts);
      dateText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    return { class: cls, icon, textShort: raw || '---', lastConfirmDateText: dateText, isExpired };
  } catch (e) {
    return { class: 'status-unknown', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };
  }
}

    renderBasicInfoSection(item, type) {
      if (type === 'mold') return this.renderMoldBasicInfoFull(item);
      return this.renderCutterBasicInfoFull(item);
    }

    renderMoldBasicInfoFull(item) {
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      
      const moldID = this.safeText(mold?.MoldID);
      const code = this.safeText(mold?.MoldCode);
      const name = this.safeText(mold?.MoldName);
      
      // Kích thước: từ mold hoặc design
      const lRaw = mold?.MoldLengthModified ?? this.pick(design, ['MoldDesignLength']);
      const wRaw = mold?.MoldWidthModified ?? this.pick(design, ['MoldDesignWidth']);
      const hRaw = mold?.MoldHeightModified ?? this.pick(design, ['MoldDesignHeight']);
      const lwh = this.safeText(this.formatLWH(lRaw, wRaw, hRaw));
      
      // Khối lượng
      const weightRaw = mold?.MoldWeightModified ?? this.pick(design, ['MoldDesignWeight']);
      const weightTxt = (weightRaw !== null && String(weightRaw).trim())
        ? (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`)
        : '-';
      
      // Kiểu khuôn (MoldOrientation = hướng lắp)
      const moldType = this.safeText(this.pick(design, ['MoldSetupType']));
      const installDir = this.safeText(this.pick(design, ['MoldOrientation']));
      
      // Số mảnh
      const pieceCount = this.safeText(this.pick(design, ['PieceCount']));
      
      // Pitch
      const pitch = this.safeText(this.pick(design, ['Pitch']) ?? mold?.Pitch);
      
      // Chiều sâu
      const depth = this.safeText(this.pick(design, ['MoldDesignDepth']));
      
      // UnderDepth
      const underDepth = this.safeText(this.pick(design, ['UnderDepth']));
      
      // Ngày SX: lấy DeliveryDeadline từ job sớm nhất
      let madeDate = '-';
      if (job) {
        const dd = job?.DeliveryDeadline;
        madeDate = dd ? this.safeText(dd) : '-';
      }
      
      const fields = [
        { label: '金型ID / MoldID', rawValue: moldID },
        { label: '金型コード / Mã khuôn', rawValue: code },
        { label: '名称 / Tên', rawValue: name, full: true },
        { label: '寸法 / Kích thước khuôn (LxWxH)', rawValue: lwh },
        { label: '金型重量 / Khối lượng khuôn', rawValue: this.escapeHtml(weightTxt) },
        { label: '型タイプ / Kiểu khuôn', rawValue: moldType },
        { label: '取付方向 / Hướng lắp', rawValue: installDir },
        { label: '枚数 / Số mảnh khuôn', rawValue: pieceCount },
        { label: 'ピッチ / Pitch', rawValue: pitch },
        { label: '深さ / Chiều sâu khuôn', rawValue: depth },
        { label: 'UnderDepth', rawValue: underDepth },
        { label: '製造日 / Ngày SX', rawValue: madeDate }
      ];
      
      return `<div class="modal-section">
        <div class="section-header">
          <i class="fas fa-info-circle"></i>
          <span>金型主要情報 / Thông tin chính</span>
        </div>
        ${this.renderInfoGrid(fields, 'dp-info-rows')}
      </div>`;
    }

    renderCutterBasicInfoFull(item) {
      const cutterID = this.safeText(item?.CutterID);
      const cutterNo = this.safeText(item?.CutterNo);
      const cutterName = this.safeText(item?.CutterName);
      const moldDesignID = this.safeText(item?.MoldDesignID);
      
      const design = this.getMoldDesignInfoSafe(item, 'cutter');
      const moldDesignCode = this.safeText(
        item?.CutterDesignCode ?? item?.IDMaKhuonThietKe ?? design?.MoldDesignCode
      );
      
      const cutterType = this.safeText(item?.CutterType);
      const plasticCutType = this.safeText(item?.PlasticCutType);
      const bladeCount = this.safeText(item?.BladeCount);
      const pitch = this.safeText(item?.Pitch);
      const ppCushion = this.safeText(item?.PPcushionUse);
      const cutterEntry = this.safeText(item?.CutterManufactureDate ?? item?.CutterEntry);
      const satoCode = this.safeText(item?.SatoCode);
      const satoCodeDate = this.safeText(item?.SatoCodeDate);
      
      const cutSize = this.formatCutterCutSize(item);
      const sharedMoldsText = this.getMoldSharedListTextForCutter(item);
      
      const fields = [
        { label: '抜型ID / CutterID', rawValue: cutterID },
        { label: '抜型コード / Mã số Dao cắt', rawValue: cutterNo },
        { label: '名称 / Tên Dao cắt', rawValue: cutterName, full: true },
        { label: '金型設計ID / MoldDesignID', rawValue: moldDesignID },
        { label: '金型設計コード / MoldDesignCode', rawValue: moldDesignCode },
        { label: '抜型タイプ / Loại dao cắt', rawValue: cutterType },
        { label: 'カットライン / Kích thước dao cắt', rawValue: cutSize },
        { label: '樹脂カットタイプ / Loại nhựa', rawValue: plasticCutType },
        { label: 'ブレード数 / Số mảnh dao', rawValue: bladeCount },
        { label: 'ピッチ / Pitch', rawValue: pitch },
        { label: 'PP クッション / Tấm PP đệm', rawValue: ppCushion },
        { label: '製造日 / Ngày nhập dữ liệu', rawValue: cutterEntry },
        { label: 'サトーコード / Mã Sato', rawValue: satoCode },
        { label: 'サトー日付 / Ngày SX Sato', rawValue: satoCodeDate },
        { label: '共有金型 / MoldShared', rawValue: sharedMoldsText, full: true }
      ];
      
      return `<div class="modal-section">
        <div class="section-header">
          <i class="fas fa-info-circle"></i>
          <span>抜型基本情報 / Thông tin cơ bản Dao cắt</span>
        </div>
        ${this.renderInfoGrid(fields, 'dp-info-rows')}
      </div>`;
    }


    renderTechnicalInfoSection(item, type) {
      if (type === 'mold') return this.renderMoldTechnicalInfoFull(item);

      // cutter: hiển thị 2 phần (tóm tắt kỹ thuật + các cột còn lại trong cutters)
      return (
        this.renderCutterTechnicalInfoFull(item) +
        this.renderCutterOtherFieldsSection(item)
      );
    }


    renderMoldTechnicalInfoFull(item){
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');

      const dimensions = this.safeText(
        mold?.displayDimensions || mold?.displaySize || mold?.Dimensions || mold?.Size ||
        this.formatLWH(design?.MoldDesignLength, design?.MoldDesignWidth, design?.MoldDesignHeight),
        '-'
      );

      const plasticType = this.safeText(
        design?.PlasticType || design?.Material || design?.Resin || design?.Plastic || mold?.PlasticType,
        '-'
      );

      const pieceCount = this.safeText(
        design?.PieceCount || design?.PieceNumbers || mold?.PieceCount,
        '-'
      );

      const weightRaw = mold?.MoldWeight ?? design?.MoldDesignWeight ?? design?.DesignWeight ?? mold?.Weight;
      const weightTxt = (weightRaw == null || String(weightRaw).trim() === '')
        ? '-'
        : (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`);

      const techFields = [
        { label: this.biLabel('寸法', 'Kích thước LxWxH'), rawValue: dimensions },
        { label: this.biLabel('樹脂', 'Loại nhựa'), rawValue: plasticType, full: true },
        { label: this.biLabel('枚数', 'Số mảnh khuôn'), rawValue: pieceCount },
        { label: this.biLabel('重量', 'Khối lượng'), rawValue: this.escapeHtml(weightTxt) },
      ];

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-ruler-combined"></i>
            <span>${this.biLabel('技術仕様', 'Thông số kỹ thuật')}</span>
          </div>
          ${this.renderInfoGrid(techFields)}
        </div>
      `;
    }

    renderMoldProductJobSection(mold, design, job) {
      const d = design || this.getMoldDesignInfoSafe(mold, 'mold');
      const j = job || this.getJobInfoSafe(mold, 'mold');

      // 1) Tray info: ưu tiên theo chỉ thị (jobs)
      const trayInfoFromInstruction = this.safeText(
        j?.TrayInfo || j?.TrayInstruction || j?.InstructionTray || j?.TrayInfoFromInstruction || j?.NPCode || j?.NP || j?.NPNo,
        '-'
      );

      // 2) Tray name theo khách hàng
      const trayNameFromCustomer = this.safeText(
        j?.TrayName || j?.ProductName || j?.CustomerTrayName || j?.CustomerProductName || d?.TrayName || d?.ProductName,
        '-'
      );

      // 3) Loại nhựa thiết kế
      const plastic = this.safeText(
        d?.PlasticType || d?.Material || d?.Resin || d?.Plastic || j?.Material || j?.PlasticType,
        '-'
      );

      // 4) Kích thước sản phẩm: CutlineX x CutlineY x (Depth) - R - C
      const cutX = (d?.CutlineX ?? d?.CutlineLength ?? d?.CutX ?? '').toString().trim();
      const cutY = (d?.CutlineY ?? d?.CutlineWidth ?? d?.CutY ?? '').toString().trim();

      // fallback từ cutter liên quan nếu thiếu
      let fbCutter = null;
      try {
        const related = (mold && mold.relatedCutters) ? mold.relatedCutters : this.getRelatedCuttersForMold(mold);
        if (Array.isArray(related) && related.length) fbCutter = related[0];
      } catch (e) { /* ignore */ }

      const fCutX = fbCutter ? String(fbCutter.CutlineLength ?? fbCutter.CutLength ?? fbCutter.CutlineL ?? fbCutter.CutX ?? '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter.CutlineWidth ?? fbCutter.CutWidth ?? fbCutter.CutlineW ?? fbCutter.CutY ?? '').trim() : '';

      const depth = this.safeText(
        d?.MoldDesignDepth || d?.Depth || d?.CavityDepth || mold?.MoldDepth,
        '-'
      );

      const r = (d?.CornerR ?? d?.R ?? d?.CutR ?? d?.ProductR ?? '').toString().trim() ||
                (fbCutter ? String(fbCutter.CutterCorner ?? fbCutter.CornerR ?? '').trim() : '');
      const c = (d?.ChamferC ?? d?.C ?? d?.CutC ?? d?.ProductC ?? '').toString().trim() ||
                (fbCutter ? String(fbCutter.CutterChamfer ?? fbCutter.ChamferC ?? '').trim() : '');

      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : ((fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-');
      const tailRC = `${r ? ` - ${r}R` : ''}${c ? ` ${c}C` : ''}`.trim();
      const trayDim = (baseXY === '-') ? '-' : `${baseXY}×${(depth === '-' ? '-' : depth)}${tailRC ? ' ' + tailRC : ''}`;

      const trayWeight = this.safeText(d?.TrayWeight || d?.ProductWeight || j?.TrayWeight || j?.ProductWeight, '-');
      const pockets = this.safeText(d?.Pockets || d?.PocketCount || d?.CavityCount || j?.Pockets, '-');
      const draftAngle = this.safeText(d?.DraftAngle || d?.ReleaseAngle || d?.TaperAngle || j?.DraftAngle, '-');
      const engraving = this.safeText(d?.Engraving || d?.Marking || d?.MoldEngraving || j?.Engraving, '-');

      const prodFields = [
        { label: this.biLabel('トレイ情報（指示書より）', 'Thông tin Khay từ chỉ thị'), rawValue: trayInfoFromInstruction, full: true },
        { label: this.biLabel('トレイ情報(お客先より)', 'Tên khay theo KH'), rawValue: trayNameFromCustomer, full: true },
        { label: this.biLabel('設計時の材質', 'Loại nhựa'), rawValue: plastic, full: true },
        { label: this.biLabel('トレイ寸法', 'Kích thước sản phẩm'), rawValue: this.escapeHtml(trayDim), full: true },
        { label: this.biLabel('トレイ重量', 'Khối lượng khay'), rawValue: trayWeight },
        { label: this.biLabel('ポケット数', 'Số pockets'), rawValue: pockets },
        { label: this.biLabel('抜き勾配', 'Góc nghiêng thoát'), rawValue: draftAngle },
        { label: this.biLabel('刻印', 'Chữ khắc trên khay'), rawValue: engraving, full: true },
      ];

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-box"></i>
            <span>${this.biLabel('製品情報', 'Thông tin sản phẩm')}</span>
          </div>
          <div class="info-message" style="margin-bottom:8px">※ 設計/指示書の情報です。欠けている場合は関連抜型から補完します / Thông tin theo thiết kế & chỉ thị, thiếu sẽ bổ sung từ dao cắt liên quan.</div>
          ${this.renderInfoGrid(prodFields, 'dp-info-rows')}
        </div>
      `;
    }

    renderCutterTechnicalInfoFull(item) {
      const e = (v) => this.escapeHtml(v);

      const overall = item?.OverallDimensions || item?.CutterDim || '-';
      const lwh = this.formatLWH(item?.CutterLength, item?.CutterWidth, item?.CutterHeight) || '-';
      const cutline = this.formatLW(item?.CutlineLength, item?.CutlineWidth) || '-';
      const thickness = item?.CutterThickness || '-';

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-ruler-combined"></i>
            <span>Thông số kỹ thuật Dao cắt / 抜型技術</span>
          </div>
          <div class="info-grid-2col">
            <div class="info-item">
              <div class="info-label">Kích thước tổng thể</div>
              <div class="info-value">${e(overall)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">LWH</div>
              <div class="info-value">${e(lwh)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Cutline LW</div>
              <div class="info-value">${e(cutline)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Độ dày</div>
              <div class="info-value">${e(thickness)}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderCutterOtherFieldsSection(cutter) {
      const e = (v) => this.escapeHtml(v);

      const excluded = new Set([
        // nhóm Basic (đã show)
        'CutterID','ID','CutterNo','CutterCode','CutterDesignCode','CutterName','CutterDesignName','Name',
        'MoldDesignID','molddesignid','DesignID','MoldDesignCode','IDMaKhuonThietKe',
        'CutterType','CutlineLength','CutlineWidth','CutLength','CutWidth','CutterCorner','CornerR','CutterChamfer','ChamferC',
        'PlasticCutType','PlasticType','BladeCount','Blades','Pitch','BladePitch','PPcushionUse','PPCushionUse','PP_Cushion',
        'CutterEntry','EntryDate','CreatedAt','SatoCode','SatoCodeDate',

        // nhóm Product reference (đã dùng)
        'TrayInfoForMoldDesign','CustomerTrayName','TrayName','Material','TrayWeight',
        'PocketCount','Pockets','PocketNumbers','DraftAngle','TaperAngle','TextContent','EngravingText',
        'CutlineX','CutlineY','MoldDesignDepth','CavityDepth','Depth',

        // object enrich / không muốn liệt kê
        'relatedMolds','relatedCutters','rackInfo','rackLayerInfo','customerInfo','companyInfo'
      ]);

      const keys = Object.keys(cutter || {}).sort((a,b)=>a.localeCompare(b));

      let rows = '';
      for (const k of keys) {
        if (excluded.has(k)) continue;
        const v = cutter[k];
        if (v === null || v === undefined) continue;

        const t = typeof v;
        if (t === 'object') continue; // bỏ array/object để đỡ rối

        const s = String(v).trim();
        if (!s) continue;

        rows += `
          <div class="info-item">
            <div class="info-label">${e(k)}</div>
            <div class="info-value">${e(s)}</div>
          </div>
        `;
      }

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-ruler-combined"></i>
            <span>抜型 技術・その他 / Kỹ thuật & thông tin khác (cutters)</span>
          </div>
          <div class="info-message">
            下記は cutters.csv の残り項目です（項目名は列名のまま表示）。<br/>
            Các mục dưới đây là các cột còn lại của cutters (hiển thị theo tên cột).
          </div>
          <div class="info-grid-2col" style="margin-top:8px;">
            ${rows || `<div class="no-data">---</div>`}
          </div>
        </div>
      `;
    }

    renderProductInfoSection(item, type) {
      if (type === 'cutter') return this.renderCutterProductReferenceSection(item);
      
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      
      // 1. Tray info (TrayInfoForMoldDesign)
      const trayInfoFromInstruction = this.safeText(
        this.pick(design, ['TrayInfoForMoldDesign'])
      );
      
      // 2. Tên khay theo KH
      const trayNameFromCustomer = this.safeText(
        this.pick(design, ['CustomerTrayName', 'TrayDesignName'])
      );
      
      // 3. Loại nhựa thiết kế (DesignForPlasticType)
      const plastic = this.safeText(
        this.pick(design, ['DesignForPlasticType'])
      );
      
      // 4. Kích thước sản phẩm: CutlineX x CutlineY x Depth - R - C
      const cutX = String(this.pick(design, ['CutlineX']) || '').trim();
      const cutY = String(this.pick(design, ['CutlineY']) || '').trim();
      const depth = this.safeText(this.pick(design, ['MoldDesignDepth']));
      
      // Fallback sang cutter nếu design trống
      let fbCutter = null;
      try {
        const related = mold.relatedCutters || this.getRelatedCuttersForMold(mold);
        if (Array.isArray(related) && related.length) fbCutter = related[0];
      } catch (e) {}
      
      const fCutX = fbCutter ? String(fbCutter?.CutlineLength || '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter?.CutlineWidth || '').trim() : '';
      
      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : (fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-';
      
      const r = String(this.pick(design, ['CornerR']) || (fbCutter ? fbCutter?.CutterCorner : '') || '').trim();
      const c = String(this.pick(design, ['ChamferC']) || (fbCutter ? fbCutter?.CutterChamfer : '') || '').trim();
      
      const tailRC = [r ? `-${r}R` : '', c ? `-${c}C` : ''].filter(Boolean).join('');
      const trayDim = `${baseXY}${depth !== '-' ? `×${depth}` : ''}${tailRC}`;
      
      // 5. Khối lượng khay
      const trayWeight = this.safeText(
        this.pick(design, ['TrayWeight']) ?? this.pick(job, ['TrayWeight'])
      );
      
      // 6. Số pockets (PocketNumbers)
      const pockets = this.safeText(
        this.pick(design, ['PocketNumbers'])
      );
      
      // 7. Góc nghiêng
      const draftAngle = this.safeText(
        this.pick(design, ['DraftAngle'])
      );
      
      // 8. Chữ khắc (không có trong CSV - để trống)
      const engraving = '-';
      
      const fields = [
        { label: 'トレイ情報（指示書より） / Thông tin khay từ chỉ thị', rawValue: trayInfoFromInstruction, full: true },
        { label: 'トレイ名称（お客様より） / Tên khay theo KH', rawValue: trayNameFromCustomer, full: true },
        { label: '設計時の材質 / Loại nhựa', rawValue: plastic, full: true },
        { label: 'トレイ寸法 / Kích thước sản phẩm', rawValue: trayDim, full: true },
        { label: 'トレイ重量 / Khối lượng khay', rawValue: trayWeight },
        { label: 'ポケット数 / Số pockets', rawValue: pockets },
        { label: '抜き勾配 / Góc nghiêng thoát sản phẩm', rawValue: draftAngle },
        { label: '刻印 / Chữ khắc trên khay', rawValue: engraving, full: true }
      ];
      
      return `<div class="modal-section">
        <div class="section-header">
          <i class="fas fa-box"></i>
          <span>製品情報 / Thông tin sản phẩm</span>
        </div>
        ${this.renderInfoGrid(fields, 'dp-info-rows')}
      </div>`;
    }


    renderProductInfoFull(item, type) {
      const e = (v) => this.escapeHtml(v);
      const design = this.getMoldDesignInfoSafe(item, type);
      const job = this.getJobInfoSafe(item, type);

      const productionDate = (type === 'mold') ? (item?.ProductionDate || job?.DeliveryDeadline || item?.displayDate || '-') : (item?.CutterManufactureDate || '-');
      const trayName = design?.CustomerTrayName || '-';
      const trayInfo = design?.TrayInfoForMoldDesign || '-';
      const material = job?.Material || design?.DesignForPlasticType || '-';

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-box"></i>
            <span>Thông tin sản phẩm / 製品情報</span>
          </div>
          <div class="info-grid-2col">
            <div class="info-item">
              <div class="info-label">Ngày SX</div>
              <div class="info-value">${e(productionDate)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Tray name</div>
              <div class="info-value">${e(trayName)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Tray info</div>
              <div class="info-value">${e(trayInfo)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Chất liệu</div>
              <div class="info-value">${e(material)}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderCutterProductReferenceSection(cutter) {
      const e = (v) => this.escapeHtml(v);

      const design = this.getMoldDesignInfoSafe ? this.getMoldDesignInfoSafe(cutter, 'cutter') : null;
      const job = this.getJobInfoSafe ? this.getJobInfoSafe(cutter, 'cutter') : null;

      const moldDesignID = cutter?.MoldDesignID ?? cutter?.molddesignid ?? design?.MoldDesignID ?? '-';
      const moldDesignCode =
        cutter?.MoldDesignCode ??
        cutter?.IDMaKhuonThietKe ??
        design?.MoldDesignCode ??
        design?.DesignCode ??
        '-';

      // Tray info / name
      const trayInfo = design?.TrayInfoForMoldDesign ?? job?.TrayInfo ?? '-';
      const trayName = design?.CustomerTrayName ?? design?.TrayName ?? '-';

      // Material
      const material = job?.Material ?? design?.DesignForPlasticType ?? cutter?.PlasticCutType ?? '-';

      // Tray size: CutlineX/Y + depth + R/C (fallback từ cutters nếu design trống)
      const cutX =
        design?.CutlineX ?? design?.CutLength ?? cutter?.CutlineLength ?? cutter?.CutLength ?? '';
      const cutY =
        design?.CutlineY ?? design?.CutWidth ?? cutter?.CutlineWidth ?? cutter?.CutWidth ?? '';
      const depth =
        design?.MoldDesignDepth ?? design?.CavityDepth ?? design?.Depth ?? '';
      const r = design?.CornerR ?? cutter?.CutterCorner ?? cutter?.CornerR ?? '';
      const c = design?.ChamferC ?? cutter?.CutterChamfer ?? cutter?.ChamferC ?? '';

      let trayDim = '-';
      if (String(cutX).trim() && String(cutY).trim()) {
        trayDim = `${String(cutX).trim()}×${String(cutY).trim()}`;
        if (String(depth).trim()) trayDim += `×${String(depth).trim()}`;
        if (String(r).trim()) trayDim += ` - R${String(r).trim()}`;
        if (String(c).trim()) trayDim += ` - C${String(c).trim()}`;
      }

      const trayWeight = job?.TrayWeight ?? design?.TrayWeight ?? '-';
      const pockets = design?.PocketCount ?? design?.Pockets ?? design?.PocketNumbers ?? '-';
      const draft = design?.DraftAngle ?? design?.TaperAngle ?? '-';
      const engraving = design?.TextContent ?? design?.EngravingText ?? '-';

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-box"></i>
            <span>製品情報（参照）/ Thông tin sản phẩm (tham khảo)</span>
          </div>

          <div class="info-message">
            この製品情報は「設計」に基づく参照です（共有抜型の場合、表示中の金型と一致しない可能性があります）。<br/>
            Thông tin này tham khảo theo “thiết kế”, dao cắt dùng chung có thể không khớp 100% với khuôn đang mở từ liên kết.
          </div>

          <div class="info-grid-2col" style="margin-top:8px;">
            <div class="info-item">
              <div class="info-label">設計ID / MoldDesignID</div>
              <div class="info-value">${e(moldDesignID)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">設計コード / MoldDesignCode</div>
              <div class="info-value">${e(moldDesignCode)}</div>
            </div>

            <div class="info-item full-width">
              <div class="info-label">トレイ情報（指示書より）/ Thông tin khay từ chỉ thị</div>
              <div class="info-value">${e(trayInfo)}</div>
            </div>

            <div class="info-item full-width">
              <div class="info-label">トレイ情報（お客先より）/ Tên khay theo khách hàng</div>
              <div class="info-value">${e(trayName)}</div>
            </div>

            <div class="info-item full-width">
              <div class="info-label">設計時の材質 / Loại nhựa (thiết kế)</div>
              <div class="info-value">${e(material)}</div>
            </div>

            <div class="info-item full-width">
              <div class="info-label">トレイ寸法 / Kích thước sản phẩm</div>
              <div class="info-value">${e(trayDim)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">トレイ重量 / Khối lượng khay</div>
              <div class="info-value">${e(trayWeight)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">ポケット数 / Số pockets</div>
              <div class="info-value">${e(pockets)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">抜き勾配 / Góc nghiêng thoát</div>
              <div class="info-value">${e(draft)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">刻印 / Chữ khắc</div>
              <div class="info-value">${e(engraving)}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderStatusNotesSection(item, type) {
      const isMold = type === 'mold';
      const returning = isMold ? (item?.MoldReturning || item?.Returning) : '';
      const disposing = isMold ? (item?.MoldDisposing || item?.Disposing) : '';
      const moldNotes = isMold ? String(item?.MoldNotes || '').trim() : '';
      
      // Lấy ghi chú mới nhất từ usercomments.csv
      let latestComment = '';
      try {
        const comments = Array.isArray(this.data?.usercomments) ? this.data.usercomments : [];
        const itemId = isMold ? this.normId(item?.MoldID) : this.normId(item?.CutterID || item?.ID);
        const filtered = comments.filter(c => {
          const cid = this.normId(isMold ? c?.MoldID : (c?.CutterID || c?.ID));
          return cid === itemId;
        });
        filtered.sort((a, b) => {
          const ta = Date.parse(a.Timestamp || a.Date || a.CreatedAt || '') || 0;
          const tb = Date.parse(b.Timestamp || b.Date || b.CreatedAt || '') || 0;
          return tb - ta;
        });
        if (filtered[0]) {
          latestComment = String(filtered[0].Comment || filtered[0].Note || filtered[0].Notes || '').trim();
        }
      } catch (e) {}
      
      let html = `<div class="modal-section">
        <div class="section-header">
          <i class="fas fa-clipboard-list"></i>
          <span>状態・メモ / Trạng thái vật lý & Ghi chú</span>
        </div>`;
      
      if (returning) {
        html += `<div class="info-message" style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px;margin-bottom:10px;">
          <i class="fas fa-undo" style="color:#f59e0b;margin-right:8px;"></i>
          <strong>返却金型 / Đã trả khuôn:</strong> ${this.escapeHtml(returning)}
        </div>`;
      }
      
      if (disposing) {
        html += `<div class="info-message" style="background:#fee2e2;border-left:4px solid #dc2626;padding:10px;margin-bottom:10px;">
          <i class="fas fa-exclamation-triangle" style="color:#dc2626;margin-right:8px;"></i>
          <strong>廃棄金型 / Đã hủy khuôn:</strong> ${this.escapeHtml(disposing)}
        </div>`;
      }
      
      if (moldNotes) {
        html += `<div class="info-item">
          <div class="info-label">金型メモ / Ghi chú khuôn</div>
          <div class="info-value">${this.escapeHtml(moldNotes)}</div>
        </div>`;
      }
      
      if (latestComment) {
        html += `<div class="info-item">
          <div class="info-label">最新コメント / Ghi chú mới nhất</div>
          <div class="info-value">${this.escapeHtml(latestComment)}</div>
        </div>`;
      }
      
      if (!returning && !disposing && !moldNotes && !latestComment) {
        html += `<div class="no-data">データなし / Không có dữ liệu</div>`;
      }
      
      html += `</div>`;
      return html;
    }


    renderAdditionalDataSection(item, type) {
      if(type === 'mold'){
        const mold = item;
        const design = this.getMoldDesignInfoSafe(mold, 'mold');
        const job = this.getJobInfoSafe(mold, 'mold');

        const drawingNo = this.safeText(
          design?.CustomerDrawingNo || design?.DrawingNo || design?.DrawingNumber || mold?.DrawingNumber,
          '-'
        );

        const deviceCode = this.safeText(
          design?.DeviceCode || design?.MachineCode || mold?.DeviceCode || mold?.MachineCode,
          '-'
        );

        const plug = this.safeText(
          design?.HasPlug || design?.Plug || mold?.Plug,
          '-'
        );

        const dedicatedCutter = this.safeText(
          design?.HasDedicatedCutter || design?.DedicatedCutter || mold?.DedicatedCutter,
          '-'
        );

        const quote = this.safeText(
          design?.Quote || design?.Quotation || mold?.Quote || mold?.Quotation,
          '-'
        );

        const unitPrice = this.safeText(
          design?.UnitPrice || design?.Price || mold?.UnitPrice || mold?.Price,
          '-'
        );

        const boxType = this.safeText(
          design?.BoxType || mold?.BoxType,
          '-'
        );

        const bag = this.safeText(
          design?.Bag || design?.Bagging || mold?.Bag,
          '-'
        );

        const firstDeadline = this.safeText(
          job?.FirstDeliveryDeadline || job?.NewDeadline || job?.DeliveryDeadlineNew || job?.DeliveryDeadline,
          '-'
        );

        const isYes = (v) => {
          const s = (v == null) ? '' : String(v).trim().toLowerCase();
          if(!s || s === '-' ) return false;
          return s === '1' || s === 'yes' || s === 'true' || s.includes('有') || s.includes('あり') || s.includes('○') || s.includes('はい');
        };

        const warnPlug = isYes(plug);
        const warnDedicated = isYes(dedicatedCutter);

        const warnHtml = (warnPlug || warnDedicated) ? `
            <div class="warning-message">
              注意 / chú ý:
              ${warnPlug ? 'プラグあり (có nắp).' : ''}
              ${warnDedicated ? ' 専用抜型あり (có dao cắt riêng).' : ''}
            </div>
        ` : '';

        const addFields = [
          { label: this.biLabel('図面番号', 'Số bản vẽ'), rawValue: drawingNo },
          { label: this.biLabel('設備コード', 'Mã thiết bị'), rawValue: deviceCode },
          { label: this.biLabel('プラグ', 'Plug'), rawValue: plug },
          { label: this.biLabel('専用抜型', 'Dao cắt riêng'), rawValue: dedicatedCutter },
          { label: this.biLabel('見積', 'Báo giá'), rawValue: quote },
          { label: this.biLabel('単価', 'Đơn giá'), rawValue: unitPrice },
          { label: this.biLabel('箱種', 'Loại thùng'), rawValue: boxType },
          { label: this.biLabel('袋', 'Bọc túi'), rawValue: bag },
          { label: this.biLabel('新規納期', 'Hạn giao hàng lần đầu'), rawValue: firstDeadline, full: true },
        ];

        return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-link"></i>
            <span>${this.biLabel('関連情報', 'Thông tin liên quan')}</span>
          </div>

          ${warnHtml}
          ${this.renderInfoGrid(addFields, 'dp-info-rows')}
        </div>
        `;
    }

      const e = (v) => this.escapeHtml(v);
      const design = this.getMoldDesignInfoSafe(item, type);
      const job = this.getJobInfoSafe(item, type);
      const customer = this.getCustomerInfoSafe(item, type, job);
      const company = this.getCompanyInfoSafe(item);

      const designId = item?.MoldDesignID || item?.molddesignid || design?.MoldDesignID || '-';
      const designCode = design?.MoldDesignCode || design?.DesignCode || item?.MoldDesignCode || item?.IDMaKhuonThietKe || '-';
      const jobName = job?.JobName || job?.Name || '-';
      const deadline = job?.DeliveryDeadline || job?.DueDate || '-';
      const orderNo = job?.OrderNumber || job?.JobNumber || '-';
      const customerName = customer?.CustomerShortName || customer?.CustomerName || '-';
      const companyName = company?.CompanyShortName || company?.CompanyName || '-';

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-database"></i>
            <span>Dữ liệu bổ sung / 追加データ</span>
          </div>
          <div class="info-grid-2col">
            <div class="info-item">
              <div class="info-label">MoldDesignID</div>
              <div class="info-value">${e(designId)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Mã thiết kế</div>
              <div class="info-value">${e(designCode)}</div>
            </div>
            <div class="info-item full-width">
              <div class="info-label">Khách hàng</div>
              <div class="info-value">${e(customerName)}</div>
            </div>
            <div class="info-item full-width">
              <div class="info-label">Công ty (companies)</div>
              <div class="info-value">${e(companyName)}</div>
            </div>
            <div class="info-item full-width">
              <div class="info-label">Job / Sản phẩm</div>
              <div class="info-value">${e(jobName)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Hạn giao</div>
              <div class="info-value">${e(deadline)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Số đơn hàng</div>
              <div class="info-value">${e(orderNo)}</div>
            </div>
          </div>
        </div>
      `;
    }

    getCustomerDisplay(item) {
      const customer = item.customerInfo || this.getCustomerInfoSafe(item, 'mold', null);
      const company = item.companyInfo || this.getCompanyFromCustomer(customer);

      const custName = customer?.CustomerShortName || customer?.CustomerName || '';
      const compName = company?.CompanyShortName || company?.CompanyName || '';

      if (custName && compName) return `${custName} (${compName})`;
      if (custName) return custName;
      if (compName) return compName;
      return '-';
    }

    // =====================================================================
    // TAB 2: RELATED
    // =====================================================================


renderRelatedTab() {
  try {
    if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

    const t = String(this.currentItemType || '').toLowerCase();
    let list = [];
    let title = '';
    let rowItemType = '';

    if (t === 'mold') {
      title = 'Dao cắt liên quan / 関連カッター';
      rowItemType = 'cutter';
      list = this.getRelatedCuttersForMold(this.currentItem) || [];
    } else {
      title = 'Khuôn liên quan / 関連金型';
      rowItemType = 'mold';
      list = this.getSharedMoldsForCutter(this.currentItem) || [];
    }

    const total = Array.isArray(list) ? list.length : 0;

    let html = '';
    html += `
      <div class="modal-section dp-related-tab">
        <div class="section-header">
          <i class="fas fa-link"></i>
          <span>${this.escapeHtml(title)} (${total})</span>
        </div>
    `;

    if (!total) {
      html += `<div class="no-data">Không có thiết bị liên quan</div></div>`;
      return html;
    }

    html += `<div class="dp-related-list dp-related-list--full">`;
    for (const r of list) {
      html += this.renderRelatedRow(r, rowItemType);
    }
    html += `</div></div>`;

    return html;
  } catch (e) {
    return `<p class="no-data">Related render error</p>`;
  }
}

    renderRelatedCutters(cutters) {
      if (!cutters || cutters.length === 0) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-link"></i><span>Dao cắt liên quan / 関連抜型</span></div>
            <p class="no-data">Không có dữ liệu</p>
          </div>
        `;
      }

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-link"></i><span>Dao cắt liên quan (${cutters.length}) / 関連抜型</span></div>
          <div class="related-list">
      `;

      cutters.forEach(c => {
        const code = this.safeText(c.CutterNo || c.CutterID);
        const name = this.safeText(c.CutterName || c.CutterDesignCode || '');
        const loc = this.safeText(c.displayRackLocation || c.displayLocation || c.RackLayerID || '');
        html += `
          <div class="related-item">
            <div class="related-info">
              <div class="related-type-badge">抜</div>
              <div class="related-details">
                <div class="related-code">${code}</div>
                <div class="related-name">${name}</div>
                <div class="related-meta">${loc}</div>
              </div>
            </div>
            <button class="view-detail-btn" type="button" data-item='${this.escapeHtml(JSON.stringify(c))}' data-item-type="cutter">
              <i class="fas fa-external-link-alt"></i>
              <span>Mở</span>
            </button>
          </div>
        `;
      });

      html += `</div></div>`;
      return html;
    }

    renderRelatedMolds(molds) {
      if (!molds || molds.length === 0) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-link"></i><span>Khuôn liên quan / 関連金型</span></div>
            <p class="no-data">Không có dữ liệu</p>
          </div>
        `;
      }

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-link"></i><span>Khuôn liên quan (${molds.length}) / 関連金型</span></div>
          <div class="related-list">
      `;

      molds.forEach(m => {
        const code = this.safeText(m.MoldCode || m.MoldID);
        const name = this.safeText(m.MoldName || m.Name || '');
        const loc = this.safeText(m.displayRackLocation || m.displayLocation || m.RackLayerID || '');

        const linkBadge = this.renderLinkKindBadge(m.__dpLinkKind);

        html += `
          <div class="related-item">
            <div class="related-info">
              <div style="display:flex;align-items:center;">
                <div class="related-type-badge">金</div>
                ${linkBadge}
              </div>
              <div class="related-details">
                <div class="related-code">${code}</div>
                <div class="related-name">${name}</div>
                <div class="related-meta">${loc}</div>
              </div>
            </div>
            <button class="view-detail-btn" type="button" data-item='${this.escapeHtml(JSON.stringify(m))}' data-item-type="mold">
              <i class="fas fa-external-link-alt"></i>
              <span>Mở</span>
            </button>
          </div>
        `;
      });

      html += `</div></div>`;
      return html;
    }


    // =====================================================================
    // TAB 3: HISTORY
    // =====================================================================

    renderHistoryTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const itemId = (this.currentItemType === 'mold') ? (this.currentItem.MoldID || '') : (this.currentItem.CutterID || '');
      const kind = (this.currentItemType === 'mold') ? 'MOLD' : 'CUTTER';

      const statusHistory = this.getStatusHistory(itemId, kind);
      const locationHistory = this.getLocationHistory(itemId, kind);
      const shipHistory = this.getShipHistory(itemId, kind);
      const teflonHistory = (this.currentItemType === 'mold') ? this.getTeflonHistory(itemId) : [];

      const timeline = this.mergeHistoryTimeline(statusHistory, locationHistory, shipHistory, teflonHistory);

      if (timeline.length === 0) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-history"></i><span>Lịch sử / 履歴</span></div>
            <p class="no-data">Không có dữ liệu</p>
          </div>
        `;
      }

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-history"></i><span>Lịch sử (${timeline.length}) / 履歴</span></div>
          <div class="history-timeline">
      `;

      timeline.forEach(entry => {
        const icon = this.getHistoryIcon(entry.type);
        const label = this.getHistoryTypeLabel(entry.type);
        html += `
          <div class="timeline-item" data-type="${this.escapeHtml(entry.type)}">
            <div class="timeline-icon"><i class="fas ${icon}"></i></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-type">${this.escapeHtml(label)}</span>
                <span class="timeline-date">${this.escapeHtml(this.formatDate(entry.timestamp || ''))}</span>
              </div>
              <div class="timeline-body">${this.formatHistoryDetail(entry)}</div>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
      return html;
    }

    getHistoryIcon(type) {
      switch (type) {
        case 'STATUS': return 'fa-clipboard-check';
        case 'LOCATION': return 'fa-map-marker-alt';
        case 'SHIP': return 'fa-truck';
        case 'TEFLON': return 'fa-spray-can';
        default: return 'fa-circle';
      }
    }

    getHistoryTypeLabel(type) {
      switch (type) {
        case 'STATUS': return 'Status / 状態';
        case 'LOCATION': return 'Location / 位置';
        case 'SHIP': return 'Transfer / 搬送';
        case 'TEFLON': return 'Teflon / コート';
        default: return type;
      }
    }


formatHistoryDetail(entry) {
  const e = (v) => this.escapeHtml(v);

  const extras = [];
  try {
    let rack = '';
    const cand = [
      entry?.RackLayerID, entry?.ToRackLayerID, entry?.FromRackLayerID,
      entry?.NewLocation, entry?.OldLocation,
      entry?.To, entry?.From, entry?.Location,
      entry?.NewRackLayerID, entry?.OldRackLayerID
    ];
    for (const c of cand) {
      if (!c) continue;
      const x = this.getRackLayerText({ displayRackLocation: c, RackLayerID: c, location: c });
      if (x) { rack = x; break; }
    }
    if (rack) extras.push(`棚-段 / Giá - Tầng: <b>${e(rack)}</b>`);

    let companyName = '';
    const cId = entry?.CompanyID ?? entry?.StorageCompanyID ?? entry?.StorageCompany ?? entry?.Company;
    if (cId) {
      const list = Array.isArray(this.data?.companies) ? this.data.companies : [];
      const found = list.find(c => String(c?.CompanyID ?? '').trim() === String(cId).trim());
      companyName = found?.CompanyShortName || found?.CompanyName || String(cId).trim();
    }
    if (companyName) extras.push(`会社 / Công ty: <b>${e(companyName)}</b>`);
  } catch (err) {}

  const extraHtml = extras.length ? `<div class="dp-history-extra">${extras.join(' · ')}</div>` : '';

  if (entry.type === 'STATUS') {
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const dest = entry.destinationInfo ? (entry.destinationInfo.DestinationName || entry.destinationInfo.Name || '') : '';
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>${e(entry.Status || entry.Action || '')}</b> ${dest ? `→ ${e(dest)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  if (entry.type === 'LOCATION') {
    const from = entry.OldLocation || entry.From || entry.FromRackLayerID || '';
    const to = entry.NewLocation || entry.To || entry.ToRackLayerID || '';
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>MOVE</b> ${from ? e(from) : ''} ${to ? `→ ${e(to)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  if (entry.type === 'SHIP') {
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const dest = entry.destinationInfo ? (entry.destinationInfo.DestinationName || entry.destinationInfo.Name || '') : (entry.Destination || entry.DestinationID || '');
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>SHIP</b> ${dest ? `→ ${e(dest)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  if (entry.type === 'TEFLON') {
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const status = entry.TeflonStatus || entry.Status || '';
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>TEFLON</b> ${status ? `- ${e(status)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  const msg = entry.Title || entry.Action || entry.Status || entry.type || '';
  return `
    <div><b>${e(msg)}</b></div>
    ${extraHtml}
  `;
}

    mergeHistoryTimeline(statusHistory, locationHistory, shipHistory, teflonHistory) {
      const all = [];

      (statusHistory || []).forEach(x => all.push({ ...x, type: 'STATUS' }));
      (locationHistory || []).forEach(x => all.push({ ...x, type: 'LOCATION' }));
      (shipHistory || []).forEach(x => all.push({ ...x, type: 'SHIP' }));
      (teflonHistory || []).forEach(x => all.push({ ...x, type: 'TEFLON' }));

      all.sort((a, b) => {
        const ta = Date.parse(a.timestamp || a.Timestamp || a.Date || a.ShipDate || '') || 0;
        const tb = Date.parse(b.timestamp || b.Timestamp || b.Date || b.ShipDate || '') || 0;
        return tb - ta;
      });

      return all.map(x => {
        const ts = x.timestamp || x.Timestamp || x.Date || x.ShipDate || x.ReceivedDate || x.SentDate || x.RequestedDate || '';
        return { ...x, timestamp: ts };
      });
    }


    // =====================================================================
    // TAB 4: TEFLON
    // =====================================================================

    renderTeflonTab() {
      if (!this.currentItem || this.currentItemType !== 'mold') {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-spray-can"></i><span>Teflon / コート</span></div>
            <p class="no-data">Dao cắt không có Teflon / 抜型は対象外</p>
          </div>
        `;
      }

      const moldId = this.currentItem.MoldID;
      const logs = this.getTeflonHistory(moldId);

      if (logs.length === 0) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-spray-can"></i><span>Teflon / コート</span></div>
            <p class="no-data">Không có dữ liệu</p>
          </div>
        `;
      }

      const latest = logs[0];

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-spray-can"></i><span>Xử lý Teflon / コート</span></div>

          <div class="teflon-current" style="margin-bottom:10px">
            <div class="teflon-status-badge ${this.getTeflonStatusClass(latest.TeflonStatus || latest.Status)}">
              ${(this.escapeHtml(latest.TeflonStatus || latest.Status || 'UNKNOWN'))}
            </div>
            <div class="teflon-current-info">
              <div class="teflon-info-row"><span class="label">Requested</span><span class="value">${this.safeText(latest.RequestedDate)}</span></div>
              <div class="teflon-info-row"><span class="label">Sent</span><span class="value">${this.safeText(latest.SentDate)}</span></div>
              <div class="teflon-info-row"><span class="label">Received</span><span class="value">${this.safeText(latest.ReceivedDate)}</span></div>
              <div class="teflon-info-row"><span class="label">Supplier</span><span class="value">${this.safeText(latest.SupplierID || latest.Supplier)}</span></div>
            </div>
          </div>

          <h4 class="subsection-title">Lịch sử (${logs.length}) / 履歴</h4>
          <div class="teflon-log-list">
      `;

      logs.forEach(log => {
        html += `
          <div class="teflon-log-item">
            <div class="teflon-log-header">
              <span class="teflon-log-id">#${this.safeText(log.TeflonLogID || '')}</span>
              <span class="teflon-log-status ${this.getTeflonStatusClass(log.TeflonStatus || log.Status)}">${this.safeText(log.TeflonStatus || log.Status || '')}</span>
            </div>
            <div class="teflon-log-body">
              <div class="log-detail-row"><span class="log-label">Req</span><span class="log-value">${this.safeText(log.RequestedDate)}</span></div>
              <div class="log-detail-row"><span class="log-label">Sent</span><span class="log-value">${this.safeText(log.SentDate)}</span></div>
              <div class="log-detail-row"><span class="log-label">Recv</span><span class="log-value">${this.safeText(log.ReceivedDate)}</span></div>
              <div class="log-detail-row"><span class="log-label">Supplier</span><span class="log-value">${this.safeText(log.SupplierID || log.Supplier)}</span></div>
              ${log.Notes ? `<div class="log-detail-row"><span class="log-label">Note</span><span class="log-value">${this.safeText(log.Notes)}</span></div>` : ''}
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
      return html;
    }

    getTeflonStatusClass(status) {
      const s = (status || '').toString().toLowerCase();
      if (s.includes('sent') || s.includes('送') || s.includes('gửi')) return 'status-out';
      if (s.includes('received') || s.includes('受') || s.includes('nhận')) return 'status-in';
      if (s.includes('request') || s.includes('依頼') || s.includes('yêu')) return 'status-pending';
      return 'status-unknown';
    }

    // =====================================================================
    // TAB 5: STATUS (mold only)
    // =====================================================================

    renderStatusTab() {
      if (!this.currentItem || this.currentItemType !== 'mold') {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-clipboard-check"></i><span>Tình trạng / 状態</span></div>
            <p class="no-data">Dao cắt không có tab tình trạng khuôn</p>
          </div>
        `;
      }

      const item = this.currentItem;

      const returning = item.MoldReturning || item.Returning || '';
      const returnedDate = item.MoldReturnedDate || item.ReturnedDate || '';
      const disposing = item.MoldDisposing || item.Disposing || '';
      const disposedDate = item.MoldDisposedDate || item.DisposedDate || '';

      const hasReturning = !!String(returning || '').trim();
      const hasDisposing = !!String(disposing || '').trim();

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-clipboard-check"></i><span>Tình trạng khuôn / 金型状態</span></div>

          <div class="status-section">
            <h4 class="subsection-title"><i class="fas fa-undo"></i> Trả khuôn / 返却</h4>
            <div class="status-content ${hasReturning ? 'status-active' : ''}">
      `;

      if (hasReturning) {
        html += `
          <div class="status-badge-large badge-returning"><i class="fas fa-undo"></i> ${this.safeText(returning)}</div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Ghi chú</div><div class="info-value">${this.safeText(returning)}</div></div>
            <div class="info-item"><div class="info-label">Ngày</div><div class="info-value">${this.safeText(returnedDate)}</div></div>
          </div>
        `;
      } else {
        html += `<p class="no-status">Không có / なし</p>`;
      }

      html += `</div></div>`;

      html += `
        <div class="status-section">
          <h4 class="subsection-title"><i class="fas fa-trash-alt"></i> Hủy khuôn / 廃棄</h4>
          <div class="status-content ${hasDisposing ? 'status-active' : ''}">
      `;

      if (hasDisposing) {
        html += `
          <div class="status-badge-large badge-disposing"><i class="fas fa-trash-alt"></i> ${this.safeText(disposing)}</div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Ghi chú</div><div class="info-value">${this.safeText(disposing)}</div></div>
            <div class="info-item"><div class="info-label">Ngày</div><div class="info-value">${this.safeText(disposedDate)}</div></div>
          </div>
        `;
      } else {
        html += `<p class="no-status">Không có / なし</p>`;
      }

      html += `</div></div></div>`;

      return html;
    }

    // =====================================================================
    // TAB 6: PHOTOS
    // =====================================================================

    renderPhotosTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const itemId = this.currentItemType === 'mold' ? (this.currentItem.MoldID || '') : (this.currentItem.CutterID || '');
      const itemType = this.currentItemType;

      return `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-camera"></i><span>Ảnh / 写真</span></div>
          <div class="photos-toolbar">
            <button class="btn-upload-photo" type="button" data-module-open="photos-upload"><i class="fas fa-cloud-upload-alt"></i> Upload (future)</button>
            <button class="btn-open-photo-audit" type="button" data-action="photo"><i class="fas fa-camera"></i> Photo Audit Tool</button>
          </div>
          <div class="photos-gallery">
            <div class="gallery-placeholder">
              <i class="fas fa-images"></i>
              <p>Chưa có gallery trong CSV hiện tại. (Item: ${this.escapeHtml(itemType)} ${this.escapeHtml(itemId)})</p>
              <p>Đã tạo nút tích hợp để phát triển module ảnh sau.</p>
            </div>
          </div>
        </div>
      `;
    }

    // =====================================================================
    // TAB 7: COMMENTS
    // =====================================================================

    renderCommentsTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const itemId = this.currentItemType === 'mold' ? (this.currentItem.MoldID || '') : (this.currentItem.CutterID || '');
      const itemType = this.currentItemType;

      const comments = this.getComments(itemId, itemType);

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-comments"></i><span>Ghi chú (${comments.length}) / メモ</span></div>
      `;

      if (comments.length === 0) {
        html += `<p class="no-data">Không có ghi chú</p>`;
        html += `</div>`;
        return html;
      }

      html += `<div class="comment-list">`;
      comments.forEach(c => {
        const employee = this.getEmployeeName(c.EmployeeID || c.CreatedByEmployeeID || c.CreatedBy);
        const when = this.formatDate(c.CreatedAt || c.Timestamp || c.Date || '');
        const pr = (c.Priority || '').toString().toLowerCase();
        const cls = pr.includes('high') || pr.includes('urgent') || pr.includes('1') ? 'priority-high' : (pr.includes('medium') || pr.includes('2') ? 'priority-medium' : 'priority-low');
        const text = c.Comment || c.Content || c.Notes || c.Note || '';

        html += `
          <div class="comment-item ${cls}">
            <div class="comment-meta">
              <span class="comment-emp">${this.safeText(employee || '')}</span>
              <span class="comment-time">${this.safeText(when || '')}</span>
            </div>
            <div class="comment-text">${this.safeText(text || '')}</div>
          </div>
        `;
      });
      html += `</div></div>`;

      return html;
    }

    // =====================================================================
    // TAB 8: ANALYTICS
    // =====================================================================

    renderAnalyticsTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const itemId = this.currentItemType === 'mold' ? (this.currentItem.MoldID || '') : (this.currentItem.CutterID || '');
      const kind = this.currentItemType;

      const stats = this.calculateItemStats(itemId, kind);

      return `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-chart-line"></i><span>Thống kê / 統計</span></div>

          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Status logs</div><div class="info-value">${this.escapeHtml(String(stats.statusCount))}</div></div>
            <div class="info-item"><div class="info-label">Location logs</div><div class="info-value">${this.escapeHtml(String(stats.locationCount))}</div></div>
            <div class="info-item"><div class="info-label">Transfer logs</div><div class="info-value">${this.escapeHtml(String(stats.shipCount))}</div></div>
            <div class="info-item"><div class="info-label">Comments</div><div class="info-value">${this.escapeHtml(String(stats.commentCount))}</div></div>
            <div class="info-item"><div class="info-label">Teflon logs</div><div class="info-value">${this.escapeHtml(String(stats.teflonCount))}</div></div>
            <div class="info-item"><div class="info-label">Last activity</div><div class="info-value">${this.safeText(this.formatDate(stats.lastActivity || ''))}</div></div>
          </div>

          <div class="info-message" style="margin-top:10px">
            Lưu ý: thống kê này dựa trên các bảng log CSV hiện có (statuslogs/locationlog/shiplog/teflonlog/usercomments).
          </div>
        </div>
      `;
    }

    calculateItemStats(itemId, itemType) {
      const kind = (itemType === 'mold') ? 'MOLD' : 'CUTTER';
      const status = this.getStatusHistory(itemId, kind);
      const loc = this.getLocationHistory(itemId, kind);
      const ship = this.getShipHistory(itemId, kind);
      const teflon = (itemType === 'mold') ? this.getTeflonHistory(itemId) : [];
      const comments = this.getComments(itemId, itemType);

      const times = [];
      [...status, ...loc, ...ship, ...teflon, ...comments].forEach(x => {
        const t = Date.parse(x.timestamp || x.Timestamp || x.CreatedAt || x.Date || x.ShipDate || x.ReceivedDate || x.SentDate || x.RequestedDate || '') || 0;
        if (t) times.push(t);
      });

      const lastActivity = times.length ? new Date(Math.max(...times)).toISOString() : '';

      return {
        statusCount: status.length,
        locationCount: loc.length,
        shipCount: ship.length,
        teflonCount: teflon.length,
        commentCount: comments.length,
        lastActivity
      };
    }

    // =====================================================================
    // TAB 9: EXTENDED (only CSV data)
    // =====================================================================

    renderExtendedTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const mold = this.centerMold || (this.currentItemType === 'mold' ? this.currentItem : null);
      if (!mold) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-layer-group"></i><span>Mở rộng / 拡張</span></div>
            <p class="no-data">Không xác định được khuôn trung tâm để hiển thị.</p>
          </div>
        `;
      }

      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      const proc = job ? this.getProcessingItemSafe(job) : null;
      const customer = this.getCustomerInfoSafe(mold, 'mold', job);
      const company = this.getCompanyInfoSafe(mold) || (customer ? this.getCompanyFromCustomer(customer) : null);
      const cav = this.getCavRowFromDesign(design);

      const storageNow = this.getStorageSummary(mold);
      const transferList = this.getShipHistory(mold.MoldID, 'MOLD');

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-layer-group"></i><span>Mở rộng / 拡張 (chỉ dùng CSV hiện có)</span></div>
          <div class="info-message">
            Tab này tránh trùng nội dung: chỉ hiển thị các phần chuyên sâu dựa trên CSV hiện có (molddesign, customers/companies, jobs/processingitems, racks/racklayers/locationlog, shiplog/destinations).
          </div>
        </div>
      `;

      html += this.renderExtendedDesignSection(mold, design, cav);
      html += this.renderExtendedCustomersSection(mold, customer, company);
      html += this.renderExtendedProductJobSection(mold, job, proc);
      html += this.renderExtendedStorageSection(mold, storageNow);
      html += this.renderExtendedTransferSection(mold, transferList);
      html += this.renderExtendedFutureSection(mold);

      return html;
    }

    renderExtendedDesignSection(mold, design, cavRow) {
      const d = design || {};
      const cav = cavRow || {};

      const moldDesignCode = d.MoldDesignCode || d.DesignCode || mold.MoldDesignCode || '';
      const drawingNo = d.CustomerDrawingNo || d.DrawingNo || d.DrawingNumber || mold.DrawingNumber || '';
      const plasticType = d.DesignForPlasticType || d.Material || '';

      const lwh = this.formatLWH(d.MoldDesignLength, d.MoldDesignWidth, d.MoldDesignHeight);
      const cutline = this.formatLW(d.CutlineX, d.CutlineY) || this.formatLW(mold.CutlineLength, mold.CutlineWidth);

      const pockets = d.PocketCount || d.PocketNumbers || d.PieceCount || '';
      const pitch = d.Pitch || '';
      const weight = d.MoldDesignWeight || d.DesignWeight || '';

      const cavKey = (d.Serial || d.CAV || '').toString().trim();
      const cavSize = (cav.CAVlength && cav.CAVwidth) ? `${cav.CAVlength} x ${cav.CAVwidth}` : '';

      const notes = d.DesignNotes || d.VersionNote || '';

      return `
        <div class="modal-section" id="dp-ext-design">
          <div class="section-header"><i class="fas fa-drafting-compass"></i><span>Thiết kế / 設計</span></div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">MoldDesign</div><div class="info-value">${this.safeText(moldDesignCode)}</div></div>
            <div class="info-item"><div class="info-label">Drawing</div><div class="info-value">${this.safeText(drawingNo)}</div></div>
            <div class="info-item"><div class="info-label">LxWxH</div><div class="info-value">${this.safeText(lwh)}</div></div>
            <div class="info-item"><div class="info-label">Cutline</div><div class="info-value">${this.safeText(cutline)}</div></div>
            <div class="info-item"><div class="info-label">Plastic</div><div class="info-value">${this.safeText(plasticType)}</div></div>
            <div class="info-item"><div class="info-label">Pockets</div><div class="info-value">${this.safeText(pockets)}</div></div>
            <div class="info-item"><div class="info-label">Pitch</div><div class="info-value">${this.safeText(pitch)}</div></div>
            <div class="info-item"><div class="info-label">Design weight</div><div class="info-value">${this.safeText(weight ? String(weight).includes('kg') ? weight : `${weight} kg` : '')}</div></div>
            <div class="info-item"><div class="info-label">CAV key</div><div class="info-value">${this.safeText(cavKey)}</div></div>
            <div class="info-item"><div class="info-label">CAV size</div><div class="info-value">${this.safeText(cavSize)}</div></div>
            <div class="info-item full-width"><div class="info-label">Notes</div><div class="info-value note-text">${this.safeText(notes, '')}</div></div>
          </div>
          <div class="info-message" style="margin-top:10px">
            Nếu thiếu field, có thể do CSV chưa có cột tương ứng. Tab này sẽ tự mở rộng khi CSV bổ sung.
          </div>
        </div>
      `;
    }

    renderExtendedCustomersSection(mold, customer, company) {
      const c = customer || {};
      const co = company || {};

      const customerName = c.CustomerShortName || c.CustomerName || '';
      const companyName = co.CompanyShortName || co.CompanyName || '';

      return `
        <div class="modal-section" id="dp-ext-customers">
          <div class="section-header"><i class="fas fa-building"></i><span>Khách hàng / 顧客</span></div>
          <div class="info-grid-2col">
            <div class="info-item full-width"><div class="info-label">Customer</div><div class="info-value">${this.safeText(customerName)}</div></div>
            <div class="info-item full-width"><div class="info-label">Company</div><div class="info-value">${this.safeText(companyName)}</div></div>
            <div class="info-item"><div class="info-label">CustomerID</div><div class="info-value">${this.safeText(c.CustomerID)}</div></div>
            <div class="info-item"><div class="info-label">CompanyID</div><div class="info-value">${this.safeText(c.CompanyID || co.CompanyID)}</div></div>
          </div>
          <div class="info-message" style="margin-top:10px">
            (Phát triển sau) Danh sách khách đã từng đặt hàng bằng khuôn này sẽ cần các bảng order/production trong dự án tổng thể.
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-module-open="customers"><i class="fas fa-external-link-alt"></i><span>Open<br><span class="sub">Module KH</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="custody"><i class="fas fa-file-signature"></i><span>Custody<br><span class="sub">Lưu giữ</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="orders"><i class="fas fa-shopping-cart"></i><span>Orders<br><span class="sub">Đơn hàng</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedProductJobSection(mold, job, processingItem) {
      const j = job || {};
      const p = processingItem || {};

      const jobName = j.JobName || j.Name || '';
      const orderNo = j.OrderNumber || j.JobNumber || '';
      const deadline = j.DeliveryDeadline || j.DueDate || '';
      const material = j.Material || j.PlasticType || '';
      const trayInfo = j.TrayInfo || j.TrayName || '';

      const procName = p.ProcessingItemName || p.Name || '';

      return `
        <div class="modal-section" id="dp-ext-product">
          <div class="section-header"><i class="fas fa-box"></i><span>Sản phẩm / Job / 製品</span></div>
          <div class="info-grid-2col">
            <div class="info-item full-width"><div class="info-label">Job</div><div class="info-value">${this.safeText(jobName)}</div></div>
            <div class="info-item"><div class="info-label">Order</div><div class="info-value">${this.safeText(orderNo)}</div></div>
            <div class="info-item"><div class="info-label">Deadline</div><div class="info-value">${this.safeText(deadline)}</div></div>
            <div class="info-item"><div class="info-label">Material</div><div class="info-value">${this.safeText(material)}</div></div>
            <div class="info-item"><div class="info-label">Tray info</div><div class="info-value">${this.safeText(trayInfo)}</div></div>
            <div class="info-item"><div class="info-label">Processing</div><div class="info-value">${this.safeText(procName)}</div></div>
          </div>
          <div class="info-message" style="margin-top:10px">
            (Phát triển sau) Lịch sử sản xuất chi tiết sẽ cần bảng production_logs trong dự án tổng thể.
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-module-open="production-history"><i class="fas fa-industry"></i><span>Prod<br><span class="sub">History</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="plastic-usage"><i class="fas fa-water"></i><span>Plastic<br><span class="sub">Usage</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="consumables"><i class="fas fa-boxes"></i><span>Consum.<br><span class="sub">Tiêu hao</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedStorageSection(mold, storageSummary) {
      const s = storageSummary || {};
      const locationHistory = this.getLocationHistory(mold.MoldID, 'MOLD').slice(0, 20);

      let historyHtml = '';
      if (!locationHistory.length) {
        historyHtml = `<p class="no-data">Không có lịch sử vị trí</p>`;
      } else {
        historyHtml = `<div class="history-timeline">`;
        locationHistory.forEach(x => {
          historyHtml += `
            <div class="timeline-item" data-type="LOCATION">
              <div class="timeline-icon"><i class="fas fa-map-marker-alt"></i></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-type">Location</span>
                  <span class="timeline-date">${this.escapeHtml(this.formatDate(x.timestamp || x.Timestamp || x.Date || ''))}</span>
                </div>
                <div class="timeline-body">${this.escapeHtml((x.OldLocation || x.From || '-') + ' → ' + (x.NewLocation || x.To || x.RackLayerID || '-'))}</div>
              </div>
            </div>
          `;
        });
        historyHtml += `</div>`;
      }

      return `
        <div class="modal-section" id="dp-ext-storage">
          <div class="section-header"><i class="fas fa-warehouse"></i><span>Kho & vị trí / 保管</span></div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Rack</div><div class="info-value">${this.safeText(s.rackId)}</div></div>
            <div class="info-item"><div class="info-label">Layer</div><div class="info-value">${this.safeText(s.layerNum)}</div></div>
            <div class="info-item full-width"><div class="info-label">Rack location</div><div class="info-value">${this.safeText(s.rackLocation)}</div></div>
            <div class="info-item full-width"><div class="info-label">Storage company</div><div class="info-value">${this.safeText(s.storageCompany)}</div></div>
          </div>

          <h4 class="subsection-title" style="margin-top:12px">Lịch sử vị trí (mới nhất 20)</h4>
          ${historyHtml}

          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-action="move"><i class="fas fa-map-signs"></i><span>Move<br><span class="sub">Di chuyển</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="storage"><i class="fas fa-external-link-alt"></i><span>Open<br><span class="sub">Module kho</span></span></button>
            <button class="dp-action-btn" type="button" data-action="inventory"><i class="fas fa-clipboard-check"></i><span>棚卸<br><span class="sub">Kiểm kê</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedTransferSection(mold, shipHistory) {
      const list = (shipHistory || []).slice(0, 30);

      let rows = '';
      if (!list.length) {
        rows = `<p class="no-data">Không có dữ liệu vận chuyển</p>`;
      } else {
        rows = `<div class="history-timeline">`;
        list.forEach(x => {
          const dest = this.getDestinationName(x.DestinationID) || x.Destination || '';
          const when = this.formatDate(x.timestamp || x.Timestamp || x.ShipDate || x.Date || '');
          const note = x.Note || x.Notes || '';
          rows += `
            <div class="timeline-item" data-type="SHIP">
              <div class="timeline-icon"><i class="fas fa-truck"></i></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-type">Transfer</span>
                  <span class="timeline-date">${this.escapeHtml(when)}</span>
                </div>
                <div class="timeline-body"><b>${this.escapeHtml(dest || '-')}</b>${note ? ` - ${this.escapeHtml(note)}` : ''}</div>
              </div>
            </div>
          `;
        });
        rows += `</div>`;
      }

      return `
        <div class="modal-section" id="dp-ext-transfer">
          <div class="section-header"><i class="fas fa-truck"></i><span>Vận chuyển / 搬送</span></div>
          <div class="info-message">
            Dữ liệu lấy từ shiplog.csv + destinations.csv.
          </div>
          <h4 class="subsection-title" style="margin-top:10px">Lịch sử vận chuyển (mới nhất 30)</h4>
          ${rows}

          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-module-open="transfer"><i class="fas fa-external-link-alt"></i><span>Open<br><span class="sub">Module</span></span></button>
            <button class="dp-action-btn" type="button" data-action="print"><i class="fas fa-print"></i><span>印刷<br><span class="sub">In</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="shipping-new"><i class="fas fa-plus"></i><span>New<br><span class="sub">Record</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedFutureSection(mold) {
      return `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-hourglass-half"></i><span>Phát triển sau / 今後</span></div>
          <div class="info-message">
            Các phần sau chưa có bảng CSV trong hệ hiện tại nên hiện để "khung tích hợp":
            Production logs, Plastic usage, Consumables usage, Maintenance/Modification, Documents, Custody certificate, Shaping conditions...
          </div>
          <div class="dp-actions-grid" style="margin-top:10px">
            <button class="dp-action-btn" type="button" data-module-open="production-logs"><i class="fas fa-industry"></i><span>Prod logs<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="maintenance"><i class="fas fa-tools"></i><span>Maintenance<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="documents"><i class="fas fa-file-alt"></i><span>Documents<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="custody"><i class="fas fa-file-signature"></i><span>Custody<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="shaping"><i class="fas fa-sliders-h"></i><span>Shaping<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="materials"><i class="fas fa-industry"></i><span>Materials<br><span class="sub">(future)</span></span></button>
          </div>
        </div>
      `;
    }

    // =====================================================================
    // DATA HELPERS
    // =====================================================================

    getMoldDesignInfoSafe(item, type) {
      try {
        if (!item) return null;
        if (item?.designInfo) return item.designInfo;
        if (!Array.isArray(this.data?.molddesign)) return null;

        const idCandidates = [];
        const rawIdFields = [
          item?.MoldDesignID, item?.MoldDesignId, item?.molddesignid, item?.DesignID
        ];
        for (const v of rawIdFields) idCandidates.push(...this.parseIdList(v));

        const idList = Array.from(new Set(idCandidates.map(x => this.normId(x)).filter(Boolean)));
        const data = this.data.molddesign;

        for (const id of idList) {
          const found = data.find(d => {
            const a = this.normId(d?.MoldDesignID);
            const b = this.normId(d?.DesignID);
            const c = this.normId(d?.molddesignid);
            return (a && a === id) || (b && b === id) || (c && c === id);
          });
          if (found) return found;
        }

        const codeCandidates = [
          item?.MoldDesignCode, item?.IDMaKhuonThietKe, item?.DesignCode
        ].map(x => this.normId(x)).filter(Boolean);

        for (const code of codeCandidates) {
          const found = data.find(d => {
            const a = this.normId(d?.MoldDesignCode);
            const b = this.normId(d?.DesignCode);
            return (a && a === code) || (b && b === code);
          });
          if (found) return found;
        }

        return null;
      } catch (e) {
        return null;
      }
    }


    getJobInfoSafe(item, type) {
      try {
        if (!item) return null;
        if (item?.jobInfo) return item.jobInfo;
        if (!Array.isArray(this.data?.jobs)) return null;

        const jobs = this.data.jobs;

        const jobId = this.normId(item?.JobID ?? item?.jobId ?? item?.JobId);
        if (jobId) {
          const byId = jobs.find(j => this.normId(j?.JobID) === jobId);
          if (byId) return byId;
        }

        const moldId = this.normId(item?.MoldID ?? item?.MoldId ?? item?.moldId);
        const moldCode = this.normId(item?.MoldCode);
        const designIdsRaw = []
          .concat(this.parseIdList(item?.MoldDesignID))
          .concat(this.parseIdList(item?.MoldDesignId))
          .concat(this.parseIdList(item?.molddesignid))
          .concat(this.parseIdList(item?.DesignID));

        const designIds = new Set(designIdsRaw.map(x => this.normId(x)).filter(Boolean));

        const candidates = jobs.filter(j => {
          const jm = this.normId(j?.MoldID ?? j?.MoldId);
          const jc = this.normId(j?.MoldCode ?? j?.MoldNo ?? j?.Mold);
          const jd = this.normId(j?.MoldDesignID ?? j?.DesignID ?? j?.MoldDesignId);

          if (moldId && jm && jm === moldId) return true;
          if (moldCode && jc && jc === moldCode) return true;
          if (designIds.size && jd && designIds.has(jd)) return true;
          return false;
        });

        if (!candidates.length) return null;

        const pickTs = (j) => Date.parse(j?.DeliveryDeadline ?? j?.DueDate ?? '') || Infinity;
        candidates.sort((a, b) => pickTs(a) - pickTs(b));
        return candidates[0] || null;
      } catch (e) {
        return null;
      }
    }



    getProcessingItemSafe(job) {
      if (!job || !this.data?.processingitems) return null;
      const procId = job.ProcessingItemID || job.processingItemId;
      if (!procId) return null;
      return this.data.processingitems.find(p => String(p.ProcessingItemID || '').trim() === String(procId).trim()) || null;
    }

    getCustomerInfoSafe(item, type, job) {
      if (item?.customerInfo) return item.customerInfo;
      if (!this.data?.customers) return null;
      const customerId = item?.CustomerID || job?.CustomerID || item?.customerId;
      if (!customerId) return null;
      return this.data.customers.find(c => String(c.CustomerID || '').trim() === String(customerId).trim()) || null;
    }

    getCompanyInfoSafe(item) {
      if (!this.data?.companies) return null;
      const companyId = item?.storage_company || item?.storageCompany || item?.CompanyID || item?.companyId;
      if (!companyId) return null;
      return this.data.companies.find(c => String(c.CompanyID || '').trim() === String(companyId).trim()) || null;
    }

    getCompanyFromCustomer(customer) {
      if (!customer || !this.data?.companies) return null;
      const companyId = customer.CompanyID;
      if (!companyId) return null;
      return this.data.companies.find(c => String(c.CompanyID || '').trim() === String(companyId).trim()) || null;
    }

    getCavRowFromDesign(design) {
      if (!design || !this.data?.CAV) return null;
      const key = (design.Serial || design.CAV || '').toString().trim();
      if (!key) return null;
      return this.data.CAV.find(r => (r.Serial || r.CAV || '').toString().trim() === key) || null;
    }

    getStorageSummary(mold) {
      const rackLayerInfo = mold.rackLayerInfo || {};
      const rackInfo = mold.rackInfo || {};
      const companyInfo = this.getStorageCompanyInfo(mold);

      return {
        rackId: rackInfo.RackID || rackLayerInfo.RackID || '-',
        layerNum: rackLayerInfo.RackLayerNumber || '-',
        rackLocation: rackInfo.RackLocation || mold.displayRackLocation || '-',
        storageCompany: companyInfo.nameShort || '-'
      };
    }

    getStatusHistory(itemId, kind) {
      const logs = this.data.statuslogs || [];
      const filtered = logs.filter(log => {
        if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(itemId || '').trim();
        if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.Timestamp || '') || 0;
        const tb = Date.parse(b.Timestamp || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.Timestamp }));
    }

    getLatestStatusLog(kind, itemId) {
      const logs = this.getStatusHistory(itemId, kind);
      return logs[0] || null;
    }

    getLocationHistory(itemId, kind) {
      const logs = this.data.locationlog || [];
      const filtered = logs.filter(log => {
        if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(itemId || '').trim();
        if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.Timestamp || a.Date || '') || 0;
        const tb = Date.parse(b.Timestamp || b.Date || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.Timestamp || x.Date }));
    }

    getLatestLocationLog(kind, itemId) {
      const logs = this.getLocationHistory(itemId, kind);
      return logs[0] || null;
    }

    getShipHistory(itemId, kind) {
      const logs = this.data.shiplog || [];
      const filtered = logs.filter(log => {
        if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(itemId || '').trim();
        if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.Timestamp || a.ShipDate || a.Date || '') || 0;
        const tb = Date.parse(b.Timestamp || b.ShipDate || b.Date || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.Timestamp || x.ShipDate || x.Date }));
    }

    getLatestShipLog(kind, itemId) {
      const logs = this.getShipHistory(itemId, kind);
      return logs[0] || null;
    }

    getTeflonHistory(moldId) {
      const logs = this.data.teflonlog || [];
      const filtered = logs.filter(log => String(log.MoldID || '').trim() === String(moldId || '').trim());
      filtered.sort((a, b) => {
        const ta = Date.parse(a.ReceivedDate || a.SentDate || a.RequestedDate || a.UpdatedDate || a.CreatedDate || '') || 0;
        const tb = Date.parse(b.ReceivedDate || b.SentDate || b.RequestedDate || b.UpdatedDate || b.CreatedDate || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.ReceivedDate || x.SentDate || x.RequestedDate }));
    }

    getComments(itemId, itemType) {
      const comments = this.data.usercomments || [];
      const filtered = comments.filter(c => {
        if (itemType === 'mold') return String(c.MoldID || '').trim() === String(itemId || '').trim();
        if (itemType === 'cutter') return String(c.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.CreatedAt || a.Timestamp || a.Date || '') || 0;
        const tb = Date.parse(b.CreatedAt || b.Timestamp || b.Date || '') || 0;
        return tb - ta;
      });
      return filtered;
    }

    getEmployeeName(employeeId) {
      if (!employeeId) return '';
      const emp = (this.data.employees || []).find(e => String(e.EmployeeID || '').trim() === String(employeeId).trim());
      return emp ? (emp.EmployeeName || emp.Name || '') : '';
    }

    getDestinationName(destinationId) {
      if (!destinationId) return '';
      const dest = (this.data.destinations || []).find(d => String(d.DestinationID || '').trim() === String(destinationId).trim());
      return dest ? (dest.DestinationName || dest.Name || '') : '';
    }
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const instance = new DetailPanel('detailPanel');
      window.DetailPanel = instance;   // ✅ Viết hoa (class name)
      window.detailPanel = instance;   // ✅ Viết thường (instance name)
    });
  } else {
    const instance = new DetailPanel('detailPanel');
    window.DetailPanel = instance;
    window.detailPanel = instance;
  }

})();
