/**
 * ============================================================================
 * PHOTO AUDIT TOOL - R2.3.2
 * 写真監査ツール / Công cụ kiểm tra ảnh khuôn
 * ============================================================================
 *
 * NEW FEATURES IN R2.3.2:
 * - ✅ Multi-photo with individual info: Each photo can have separate mold/dimensions
 * - ✅ Batch email: All photos in ONE email with summary list
 * - ✅ Flexible input: If photo info not entered, auto-fill from main form (detail modal)
 * - ✅ Thumbnail selection: Checkbox to set photo as mold representative
 * - ✅ Fixed: Open from mobile-detail-modal (learned from r2.2.3)
 * - ✅ Photo info form: Expandable form for each photo
 * - ✅ Backward compatible: Works with existing single-photo workflow
 *
 * Created: 2025-12-24
 * Version: 2.3.2
 * ============================================================================
 */

'use strict';

/* ============================================================================
 * CONSTANTS
 * ============================================================================ */

const PHOTO_AUDIT_CONFIG = {
  STORAGE_BUCKET: 'mold-photos',
  DEFAULT_EMPLOYEE_ID: '1', // Toan-san
  PRIMARY_RECIPIENT: 'toan.ysd@gmail.com',
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  IMAGE_TARGET_WIDTH: 1920,
  IMAGE_TARGET_HEIGHT: 1080,
  IMAGE_QUALITY_HD: 0.92,
  IMAGE_QUALITY_COMPRESSED: 0.75,
  IMAGE_QUALITY_ORIGINAL: 0.95,
  IMAGE_TARGET_SIZE_KB: 200,
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 3000,
  AUTOCOMPLETE_MAX_RESULTS: 8,
  MAX_PHOTOS_PER_SESSION: 20
};

/* ============================================================================
 * UTILITIES
 * ============================================================================ */

const PhotoAuditUtils = {
  $: (selector, ctx = document) => ctx.querySelector(selector),
  $$: (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector)),

  createEl(tag, attrs = {}, innerHTML = '') {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') {
        el.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else {
        el.setAttribute(k, v);
      }
    });
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  formatDateJP() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}年${m}月${day}日`;
  },

  nowISO: () => new Date().toISOString(),

  formatDateTime(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  },

  normalizeText(text) {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  },

  generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
};

/* ============================================================================
 * SUPABASE CLIENT
 * ============================================================================ */

const SupabasePhotoClient = {
  config: {
    url: 'https://bgpnhvhouplvekaaheqy.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncG5odmhvdXBsdmVrYWFoZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2NjAxOTIsImV4cCI6MjA1NzIzNjE5Mn0.0PJJUjGOjkcEMl-hQhajn0IW4pLQNUHDDAeprE5DG1w',
  },

  async uploadFile(bucket, fileName, blob) {
    console.log('📤 [Supabase] Uploading file:', {
      bucket,
      fileName,
      size: (blob.size / 1024).toFixed(2) + ' KB',
      type: blob.type
    });

    const formData = new FormData();
    formData.append('file', blob, fileName);
    const url = `${this.config.url}/storage/v1/object/${bucket}/${fileName}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.anonKey}`,
          'x-upsert': 'true'
        },
        body: formData
      });

      if (!res.ok) {
        let errorMsg;
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorData.error || JSON.stringify(errorData);
        } catch {
          errorMsg = await res.text();
        }
        throw new Error(`Upload failed (${res.status}): ${errorMsg}`);
      }

      const result = await res.json();
      console.log('✅ [Supabase] Upload success:', result);
      return result;
    } catch (err) {
      console.error('❌ [Supabase] Upload error:', err);
      throw err;
    }
  },

  getPublicUrl(bucket, fileName) {
    return `${this.config.url}/storage/v1/object/public/${bucket}/${fileName}`;
  },

  async callEdgeFunction(functionName, payload) {
    console.log('📡 [Supabase] Calling Edge Function:', functionName);
    console.log('📡 [Supabase] Payload:', payload);

    const url = `${this.config.url}/functions/v1/${functionName}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.anonKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMsg;
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorData.error || JSON.stringify(errorData);
        } catch {
          errorMsg = await res.text();
        }
        throw new Error(`Function failed (${res.status}): ${errorMsg}`);
      }

      const result = await res.json();
      console.log('✅ [Supabase] Function success:', result);
      return result;
    } catch (err) {
      console.error('❌ [Supabase] Function error:', err);
      throw err;
    }
  }
};

/* ============================================================================
 * MAIN: PHOTO AUDIT TOOL
 * ============================================================================ */

const PhotoAuditTool = {
  state: {
    initialized: false,

    // Data from DataManager
    molds: [],
    employees: [],

    // Main form (shared by all photos if not overridden)
    mainForm: {
      selectedMold: null, // { id, code, name }
      isManualMold: false,
      selectedEmployee: null, // { id, name }
      isManualEmployee: false,
      dimensions: {
        length: '',
        width: '',
        depth: ''
      },
      dimensionsSource: {
        length: null,
        width: null,
        depth: null
      },
      notes: ''
    },

    // Additional fields
    ccRecipients: [],

    // Camera
    stream: null,
    facingMode: 'environment',
    gridEnabled: false,

    // ✅ NEW: Multi-photo with individual info
    photos: [], // { uid, blob, source, fileName, originalName, capturedAt, photoInfo: {...}, setAsThumbnail: false }
    currentPhotoIndex: -1,

    // UI
    currentScreen: null, // 'settings' | 'camera' | 'photoList' | 'photoDetail'
    sending: false,

    // Autocomplete
    moldAutocompleteVisible: false,
    employeeAutocompleteVisible: false,
    moldSearchResults: [],
    employeeSearchResults: []
  },

  els: {},

  /* ============================================================================
   * INITIALIZATION
   * ============================================================================ */

  init() {
    if (this.state.initialized) return;

    console.log('📷 [PhotoAuditTool v2.3.2] Initializing...');

    if (!window.DataManager || !window.DataManager.loaded) {
      console.warn('⏳ [PhotoAuditTool] DataManager not ready, waiting...');
      document.addEventListener('data-manager:ready', () => this.init(), { once: true });
      return;
    }

    this.loadData();
    this.buildUI();
    this.bindGlobalHooks();

    this.state.initialized = true;
    console.log('✅ [PhotoAuditTool v2.3.2] Initialized successfully!');

    document.dispatchEvent(new CustomEvent('photoAuditTool:ready', {
      detail: { version: '2.3.2' }
    }));
  },

  /* ============================================================================
   * LOAD DATA FROM DATAMANAGER
   * ============================================================================ */

  loadData() {
    const dm = window.DataManager.data;
    this.state.molds = dm.molds || [];
    this.state.employees = dm.employees || [];

    // Set default employee (Toan-san)
    const defaultEmp = this.state.employees.find(e =>
      String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
    );

    if (defaultEmp) {
      this.state.mainForm.selectedEmployee = {
        id: defaultEmp.EmployeeID,
        name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
      };
      this.state.mainForm.isManualEmployee = false;
    }

    console.log('📊 [PhotoAuditTool] Data loaded:', {
      molds: this.state.molds.length,
      employees: this.state.employees.length,
      defaultEmployee: this.state.mainForm.selectedEmployee?.name
    });
  },

  /* ============================================================================
   * BUILD UI
   * ============================================================================ */

  buildUI() {
    this.buildSettingsScreen();
    this.buildCameraScreen();
    this.buildPhotoListScreen();
    this.buildPhotoDetailScreen();
  },

  /* ============================================================================
   * BUILD SETTINGS SCREEN (Main Form)
   * ============================================================================ */

  buildSettingsScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    // Root container
    const root = ce('div', {
      class: 'photo-audit-root pa-hidden',
      id: 'photo-audit-root'
    });

    // Backdrop
    const backdrop = ce('div', {
      class: 'pa-backdrop',
      id: 'pa-backdrop'
    });

    // Dialog
    const dialog = ce('div', { class: 'pa-dialog' });

    // === HEADER ===
    const header = ce('div', { class: 'pa-header' });
    header.innerHTML = `
      <div class="pa-title">
        <div class="ja">写真監査ツール</div>
        <div class="vi">Công cụ kiểm tra ảnh khuôn</div>
      </div>
      <button class="pa-close" id="pa-btn-close-settings" aria-label="Close">&times;</button>
    `;

    // === BODY ===
    const body = ce('div', { class: 'pa-body' });

    // === FORM CONTAINER ===
    const form = ce('div', { class: 'pa-form' });

    // ------ ROW 1: MOLD AUTOCOMPLETE ------
    const rowMold = ce('div', { class: 'pa-form-row' });
    rowMold.innerHTML = `
      <label class="pa-label">
        <span class="ja">金型選択</span>
        <span class="vi">Chọn mã khuôn</span>
        <span class="hint">(mặc định cho tất cả ảnh)</span>
      </label>
      <div class="pa-input-with-badge">
        <div class="pa-autocomplete-wrapper">
          <input
            type="text"
            class="pa-input pa-autocomplete-input"
            id="pa-mold-input"
            placeholder="🔍 Nhập mã khuôn để tìm kiếm..."
            autocomplete="off"
          />
          <div class="pa-autocomplete-dropdown pa-hidden" id="pa-mold-dropdown"></div>
        </div>
        <span class="pa-input-badge pa-hidden" id="pa-mold-badge"></span>
      </div>
    `;

    // ------ ROW 2: EMPLOYEE AUTOCOMPLETE ------
    const rowEmployee = ce('div', { class: 'pa-form-row' });
    rowEmployee.innerHTML = `
      <label class="pa-label">
        <span class="ja">撮影者</span>
        <span class="vi">Người chụp</span>
        <span class="required">*</span>
      </label>
      <div class="pa-input-with-badge">
        <div class="pa-autocomplete-wrapper">
          <input
            type="text"
            class="pa-input pa-autocomplete-input"
            id="pa-employee-input"
            placeholder="🔍 Nhập tên người chụp..."
            autocomplete="off"
          />
          <div class="pa-autocomplete-dropdown pa-hidden" id="pa-employee-dropdown"></div>
        </div>
        <span class="pa-input-badge pa-hidden" id="pa-employee-badge"></span>
      </div>
    `;

    // ------ ROW 3: DIMENSIONS (3 columns) ------
    const rowDimensions = ce('div', { class: 'pa-form-row pa-form-row-triple' });
    rowDimensions.innerHTML = `
      <div class="pa-form-col">
        <label class="pa-label">
          <span class="ja">長さ</span>
          <span class="vi">Length (mm)</span>
        </label>
        <input type="number" class="pa-input pa-dim-input" id="pa-dim-length" placeholder="mm" step="0.1" />
      </div>
      <div class="pa-form-col">
        <label class="pa-label">
          <span class="ja">幅</span>
          <span class="vi">Width (mm)</span>
        </label>
        <input type="number" class="pa-input pa-dim-input" id="pa-dim-width" placeholder="mm" step="0.1" />
      </div>
      <div class="pa-form-col">
        <label class="pa-label">
          <span class="ja">深さ</span>
          <span class="vi">Depth (mm)</span>
        </label>
        <input type="number" class="pa-input pa-dim-input" id="pa-dim-depth" placeholder="mm" step="0.1" />
      </div>
    `;

    // ------ ROW 4: NOTES ------
    const rowNotes = ce('div', { class: 'pa-form-row' });
    rowNotes.innerHTML = `
      <label class="pa-label">
        <span class="ja">備考</span>
        <span class="vi">Ghi chú</span>
      </label>
      <textarea
        class="pa-textarea"
        id="pa-notes"
        rows="2"
        placeholder="Nhập ghi chú thêm (nếu có)..."
      ></textarea>
    `;

    // ------ ROW 5: CC RECIPIENTS ------
    const rowCC = ce('div', { class: 'pa-form-row' });
    rowCC.innerHTML = `
      <label class="pa-label">
        <span class="ja">CC送信先</span>
        <span class="vi">CC Recipients (hiển thị trong email)</span>
      </label>
      <div class="pa-recipient-list" id="pa-cc-recipient-list"></div>
      <div class="pa-recipient-input-group">
        <input
          type="email"
          class="pa-input pa-recipient-input"
          id="pa-cc-recipient-input"
          placeholder="example@ysd-pack.co.jp"
        />
        <button class="pa-btn pa-btn-icon" id="pa-btn-add-cc-recipient" title="Add CC recipient">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <small class="pa-hint">✉️ Primary: ${PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT}</small>
    `;

    // ------ ROW 6: PHOTOS LIST ------
    const rowPhotos = ce('div', { class: 'pa-form-row' });
    rowPhotos.innerHTML = `
      <label class="pa-label">
        <span class="ja">撮影済み写真</span>
        <span class="vi">Ảnh đã chụp</span>
        <span class="pa-photo-count" id="pa-photo-count">0</span>
      </label>
      <div class="pa-photos-list" id="pa-photos-list"></div>
    `;

    // Assemble form
    form.appendChild(rowMold);
    form.appendChild(rowEmployee);
    form.appendChild(rowDimensions);
    form.appendChild(rowNotes);
    form.appendChild(rowCC);
    form.appendChild(rowPhotos);

    body.appendChild(form);

    // === FOOTER ===
    const footer = ce('div', { class: 'pa-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-cancel">
        <i class="fas fa-times"></i>
        <span>Cancel</span>
      </button>
      <button class="pa-btn pa-btn-primary" id="pa-btn-open-camera">
        <i class="fas fa-camera"></i>
        <span>Camera</span>
      </button>
      <button class="pa-btn pa-btn-secondary" id="pa-btn-upload-file">
        <i class="fas fa-file-upload"></i>
        <span>Upload</span>
      </button>
      <button class="pa-btn pa-btn-success" id="pa-btn-send-photos" disabled>
        <i class="fas fa-paper-plane"></i>
        <span>Send</span>
      </button>
    `;

    // File input (hidden)
    const fileInput = ce('input', {
      type: 'file',
      class: 'pa-file-input',
      id: 'pa-file-input',
      accept: 'image/*',
      multiple: 'true'
    });

    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    dialog.appendChild(fileInput);

    root.appendChild(backdrop);
    root.appendChild(dialog);
    document.body.appendChild(root);

    // Cache elements
    this.els.root = root;
    this.els.backdrop = backdrop;
    this.els.dialog = dialog;
    this.els.moldInput = PhotoAuditUtils.$('#pa-mold-input');
    this.els.moldDropdown = PhotoAuditUtils.$('#pa-mold-dropdown');
    this.els.moldBadge = PhotoAuditUtils.$('#pa-mold-badge');
    this.els.employeeInput = PhotoAuditUtils.$('#pa-employee-input');
    this.els.employeeDropdown = PhotoAuditUtils.$('#pa-employee-dropdown');
    this.els.employeeBadge = PhotoAuditUtils.$('#pa-employee-badge');
    this.els.dimLength = PhotoAuditUtils.$('#pa-dim-length');
    this.els.dimWidth = PhotoAuditUtils.$('#pa-dim-width');
    this.els.dimDepth = PhotoAuditUtils.$('#pa-dim-depth');
    this.els.notes = PhotoAuditUtils.$('#pa-notes');
    this.els.ccRecipientList = PhotoAuditUtils.$('#pa-cc-recipient-list');
    this.els.ccRecipientInput = PhotoAuditUtils.$('#pa-cc-recipient-input');
    this.els.photosList = PhotoAuditUtils.$('#pa-photos-list');
    this.els.photoCount = PhotoAuditUtils.$('#pa-photo-count');
    this.els.fileInput = PhotoAuditUtils.$('#pa-file-input');
    this.els.btnSendPhotos = PhotoAuditUtils.$('#pa-btn-send-photos');

    // Populate default employee
    if (this.state.mainForm.selectedEmployee) {
      this.els.employeeInput.value = this.state.mainForm.selectedEmployee.name;
      this.updateEmployeeBadge();
    }

    this.renderCCRecipientList();
    this.renderPhotosList();
    this.bindSettingsEvents();
  },

  /* ============================================================================
   * UPDATE BADGES
   * ============================================================================ */

  updateMoldBadge() {
    if (!this.els.moldBadge) return;

    if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
      this.els.moldBadge.textContent = '自動 / Auto';
      this.els.moldBadge.className = 'pa-input-badge pa-badge-auto';
      this.els.moldBadge.classList.remove('pa-hidden');
    } else if (this.state.mainForm.isManualMold) {
      this.els.moldBadge.textContent = '手動 / Manual';
      this.els.moldBadge.className = 'pa-input-badge pa-badge-manual';
      this.els.moldBadge.classList.remove('pa-hidden');
    } else {
      this.els.moldBadge.classList.add('pa-hidden');
    }
  },

  updateEmployeeBadge() {
    if (!this.els.employeeBadge) return;

    if (this.state.mainForm.selectedEmployee && !this.state.mainForm.isManualEmployee) {
      this.els.employeeBadge.textContent = '自動 / Auto';
      this.els.employeeBadge.className = 'pa-input-badge pa-badge-auto';
      this.els.employeeBadge.classList.remove('pa-hidden');
    } else if (this.state.mainForm.isManualEmployee) {
      this.els.employeeBadge.textContent = '手動 / Manual';
      this.els.employeeBadge.className = 'pa-input-badge pa-badge-manual';
      this.els.employeeBadge.classList.remove('pa-hidden');
    } else {
      this.els.employeeBadge.classList.add('pa-hidden');
    }
  },

  /* ============================================================================
   * SETTINGS EVENTS
   * ============================================================================ */

  bindSettingsEvents() {
    // Close buttons
    PhotoAuditUtils.$('#pa-btn-close-settings').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeSettings();
    });

    PhotoAuditUtils.$('#pa-btn-cancel').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeSettings();
    });

    // Backdrop click to close
    this.els.backdrop.addEventListener('click', () => {
      this.closeSettings();
    });

    // MOLD AUTOCOMPLETE
    this.els.moldInput.addEventListener('input', PhotoAuditUtils.debounce(() => {
      const value = this.els.moldInput.value.trim();
      if (!value) {
        this.state.mainForm.selectedMold = null;
        this.state.mainForm.isManualMold = false;
        this.updateMoldBadge();
        this.clearDimensions();
        this.hideMoldAutocomplete();
        return;
      }

      const exactMatch = this.state.molds.find(m =>
        m.MoldCode === value || m.MoldName === value
      );

      if (!exactMatch) {
        this.state.mainForm.isManualMold = true;
        this.state.mainForm.selectedMold = null;
      }

      this.updateMoldBadge();
      this.handleMoldAutocomplete();
    }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY));

    this.els.moldInput.addEventListener('focus', () => {
      if (this.els.moldInput.value.trim()) {
        this.handleMoldAutocomplete();
      }
    });

    // EMPLOYEE AUTOCOMPLETE
    this.els.employeeInput.addEventListener('input', PhotoAuditUtils.debounce(() => {
      const value = this.els.employeeInput.value.trim();
      if (!value) {
        this.state.mainForm.selectedEmployee = null;
        this.state.mainForm.isManualEmployee = false;
        this.updateEmployeeBadge();
        this.hideEmployeeAutocomplete();
        return;
      }

      const exactMatch = this.state.employees.find(e =>
        (e.EmployeeNameShort || e.EmployeeName) === value
      );

      if (!exactMatch) {
        this.state.mainForm.isManualEmployee = true;
        this.state.mainForm.selectedEmployee = { id: null, name: value };
      }

      this.updateEmployeeBadge();
      this.handleEmployeeAutocomplete();
    }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY));

    this.els.employeeInput.addEventListener('focus', () => {
      if (this.els.employeeInput.value.trim() && !this.state.mainForm.selectedEmployee) {
        this.handleEmployeeAutocomplete();
      }
    });

    // DIMENSIONS
    this.els.dimLength.addEventListener('input', (e) => {
      this.state.mainForm.dimensions.length = e.target.value.trim();
      if (this.state.mainForm.dimensionsSource.length !== 'manual' && e.target.value) {
        this.state.mainForm.dimensionsSource.length = 'manual';
        e.target.classList.add('manual-edit');
      }
    });

    this.els.dimWidth.addEventListener('input', (e) => {
      this.state.mainForm.dimensions.width = e.target.value.trim();
      if (this.state.mainForm.dimensionsSource.width !== 'manual' && e.target.value) {
        this.state.mainForm.dimensionsSource.width = 'manual';
        e.target.classList.add('manual-edit');
      }
    });

    this.els.dimDepth.addEventListener('input', (e) => {
      this.state.mainForm.dimensions.depth = e.target.value.trim();
      if (this.state.mainForm.dimensionsSource.depth !== 'manual' && e.target.value) {
        this.state.mainForm.dimensionsSource.depth = 'manual';
        e.target.classList.add('manual-edit');
      }
    });

    // NOTES
    this.els.notes.addEventListener('input', (e) => {
      this.state.mainForm.notes = e.target.value.trim();
    });

    // CC RECIPIENTS
    PhotoAuditUtils.$('#pa-btn-add-cc-recipient').addEventListener('click', (e) => {
      e.preventDefault();
      this.addCCRecipient();
    });

    this.els.ccRecipientInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addCCRecipient();
      }
    });

    // ACTIONS
    PhotoAuditUtils.$('#pa-btn-open-camera').addEventListener('click', (e) => {
      e.preventDefault();
      this.openCamera();
    });

    PhotoAuditUtils.$('#pa-btn-upload-file').addEventListener('click', (e) => {
      e.preventDefault();
      this.els.fileInput.click();
    });

    this.els.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        this.handleMultipleFileUpload(files);
      }
    });

    // SEND PHOTOS
    this.els.btnSendPhotos.addEventListener('click', (e) => {
      e.preventDefault();
      this.sendAllPhotos();
    });

    // Click outside autocomplete
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pa-autocomplete-wrapper')) {
        this.hideAllAutocomplete();
      }
    });
  },

  /* ============================================================================
   * AUTOCOMPLETE: MOLD
   * ============================================================================ */

  handleMoldAutocomplete() {
    const query = this.els.moldInput.value.trim();
    if (!query) {
      this.hideMoldAutocomplete();
      return;
    }

    const normalized = PhotoAuditUtils.normalizeText(query);
    const results = this.state.molds
      .filter(mold => {
        const code = PhotoAuditUtils.normalizeText(mold.MoldCode || '');
        const name = PhotoAuditUtils.normalizeText(mold.MoldName || '');
        return code.includes(normalized) || name.includes(normalized);
      })
      .slice(0, PHOTO_AUDIT_CONFIG.AUTOCOMPLETE_MAX_RESULTS);

    this.state.moldSearchResults = results;
    this.renderMoldAutocomplete(results);
  },

  renderMoldAutocomplete(results) {
    const { escapeHtml: e } = PhotoAuditUtils;
    const dropdown = this.els.moldDropdown;

    if (results.length === 0) {
      dropdown.innerHTML = '<div class="pa-autocomplete-empty">結果なし / No results</div>';
      dropdown.classList.remove('pa-hidden');
      return;
    }

    dropdown.innerHTML = '';
    results.forEach(mold => {
      const item = document.createElement('div');
      item.className = 'pa-autocomplete-item';

      const code = mold.MoldCode || `(ID:${mold.MoldID})`;
      const name = mold.MoldName || '';

      let dim = '';
      if (mold.designInfo) {
        const l = mold.designInfo.MoldDesignLength || mold.designInfo.Length;
        const w = mold.designInfo.MoldDesignWidth || mold.designInfo.Width;
        const d = mold.designInfo.MoldDesignDepth || mold.designInfo.Depth || mold.designInfo.MoldDesignHeight;
        if (l || w || d) {
          dim = `${l || '?'}×${w || '?'}×${d || '?'}`;
        }
      }

      item.innerHTML = `
        <div class="pa-autocomplete-item-main">${e(code)}</div>
        <div class="pa-autocomplete-item-sub">
          ${e(name)} ${dim ? `<span class="pa-dim-tag">${e(dim)}</span>` : ''}
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectMold(mold);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.remove('pa-hidden');
  },

  selectMold(mold) {
    this.state.mainForm.selectedMold = {
      id: mold.MoldID,
      code: mold.MoldCode,
      name: mold.MoldName
    };
    this.state.mainForm.isManualMold = false;

    this.els.moldInput.value = mold.MoldCode || mold.MoldName || `ID:${mold.MoldID}`;
    this.updateMoldBadge();
    this.loadDimensionsForMold(mold);
    this.hideMoldAutocomplete();
  },

  loadDimensionsForMold(mold) {
    let length = '', width = '', depth = '';
    let lengthSrc = null, widthSrc = null, depthSrc = null;

    const design = mold.designInfo;
    if (design) {
      if (design.MoldDesignLength || design.Length) {
        length = String(design.MoldDesignLength || design.Length);
        lengthSrc = 'designInfo';
      }
      if (design.MoldDesignWidth || design.Width) {
        width = String(design.MoldDesignWidth || design.Width);
        widthSrc = 'designInfo';
      }
      if (design.MoldDesignDepth || design.Depth || design.MoldDesignHeight) {
        depth = String(design.MoldDesignDepth || design.Depth || design.MoldDesignHeight);
        depthSrc = 'designInfo';
      }
    }

    if (!length && mold.MoldLengthModified) {
      length = String(mold.MoldLengthModified);
      lengthSrc = 'molds';
    }
    if (!width && mold.MoldWidthModified) {
      width = String(mold.MoldWidthModified);
      widthSrc = 'molds';
    }
    if (!depth && (mold.MoldHeightModified || mold.MoldDepthModified)) {
      depth = String(mold.MoldHeightModified || mold.MoldDepthModified);
      depthSrc = 'molds';
    }

    if (!length && mold.MoldLength) {
      length = String(mold.MoldLength);
      lengthSrc = 'molds';
    }
    if (!width && mold.MoldWidth) {
      width = String(mold.MoldWidth);
      widthSrc = 'molds';
    }
    if (!depth && (mold.MoldHeight || mold.MoldDepth)) {
      depth = String(mold.MoldHeight || mold.MoldDepth);
      depthSrc = 'molds';
    }

    this.state.mainForm.dimensions = { length, width, depth };
    this.state.mainForm.dimensionsSource = { length: lengthSrc, width: widthSrc, depth: depthSrc };

    this.updateDimensionInputs();
  },

  updateDimensionInputs() {
    const inputs = {
      length: this.els.dimLength,
      width: this.els.dimWidth,
      depth: this.els.dimDepth
    };

    Object.keys(inputs).forEach(key => {
      const input = inputs[key];
      const value = this.state.mainForm.dimensions[key];
      const source = this.state.mainForm.dimensionsSource[key];

      input.value = value;
      input.classList.remove('auto-filled', 'manual-edit');

      if (source && source !== 'manual') {
        input.classList.add('auto-filled');
      }
    });
  },

  clearDimensions() {
    this.state.mainForm.dimensions = { length: '', width: '', depth: '' };
    this.state.mainForm.dimensionsSource = { length: null, width: null, depth: null };

    [this.els.dimLength, this.els.dimWidth, this.els.dimDepth].forEach(input => {
      input.value = '';
      input.classList.remove('auto-filled', 'manual-edit');
    });
  },

  /* ============================================================================
   * AUTOCOMPLETE: EMPLOYEE
   * ============================================================================ */

  handleEmployeeAutocomplete() {
    const query = this.els.employeeInput.value.trim();
    if (!query) {
      this.hideEmployeeAutocomplete();
      return;
    }

    const normalized = PhotoAuditUtils.normalizeText(query);
    const results = this.state.employees
      .filter(emp => {
        const name = PhotoAuditUtils.normalizeText(emp.EmployeeName || '');
        const nameShort = PhotoAuditUtils.normalizeText(emp.EmployeeNameShort || '');
        return name.includes(normalized) || nameShort.includes(normalized);
      })
      .slice(0, PHOTO_AUDIT_CONFIG.AUTOCOMPLETE_MAX_RESULTS);

    this.state.employeeSearchResults = results;
    this.renderEmployeeAutocomplete(results);
  },

  renderEmployeeAutocomplete(results) {
    const { escapeHtml: e } = PhotoAuditUtils;
    const dropdown = this.els.employeeDropdown;

    if (results.length === 0) {
      dropdown.innerHTML = '<div class="pa-autocomplete-empty">結果なし / No results</div>';
      dropdown.classList.remove('pa-hidden');
      return;
    }

    dropdown.innerHTML = '';
    results.forEach(emp => {
      const item = document.createElement('div');
      item.className = 'pa-autocomplete-item';

      const name = emp.EmployeeNameShort || emp.EmployeeName || `(ID:${emp.EmployeeID})`;
      item.innerHTML = `<div class="pa-autocomplete-item-main">${e(name)}</div>`;

      item.addEventListener('click', () => {
        this.selectEmployee(emp);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.remove('pa-hidden');
  },

  selectEmployee(emp) {
    this.state.mainForm.selectedEmployee = {
      id: emp.EmployeeID,
      name: emp.EmployeeNameShort || emp.EmployeeName
    };
    this.state.mainForm.isManualEmployee = false;

    this.els.employeeInput.value = this.state.mainForm.selectedEmployee.name;
    this.updateEmployeeBadge();
    this.hideEmployeeAutocomplete();
  },

  /* ============================================================================
   * AUTOCOMPLETE HIDE
   * ============================================================================ */

  hideMoldAutocomplete() {
    this.els.moldDropdown.classList.add('pa-hidden');
  },

  hideEmployeeAutocomplete() {
    this.els.employeeDropdown.classList.add('pa-hidden');
  },

  hideAllAutocomplete() {
    this.hideMoldAutocomplete();
    this.hideEmployeeAutocomplete();
  },

  /* ============================================================================
   * CC RECIPIENT MANAGEMENT
   * ============================================================================ */

  addCCRecipient() {
    const email = this.els.ccRecipientInput.value.trim();
    if (!email) {
      this.showToast('メールを入力してください / Enter email', 'warning');
      return;
    }

    if (!PhotoAuditUtils.isValidEmail(email)) {
      this.showToast('無効なメール / Invalid email', 'error');
      return;
    }

    if (this.state.ccRecipients.includes(email)) {
      this.showToast('既に追加済み / Already added', 'warning');
      return;
    }

    this.state.ccRecipients.push(email);
    this.els.ccRecipientInput.value = '';
    this.renderCCRecipientList();
  },

  removeCCRecipient(email) {
    this.state.ccRecipients = this.state.ccRecipients.filter(r => r !== email);
    this.renderCCRecipientList();
  },

  renderCCRecipientList() {
    const { createEl: ce, escapeHtml: e } = PhotoAuditUtils;
    const container = this.els.ccRecipientList;

    container.innerHTML = '';

    if (this.state.ccRecipients.length === 0) {
      container.innerHTML = '<div class="pa-empty-state"><i class="fas fa-inbox"></i> <span>CC: 未設定 / No CC</span></div>';
      return;
    }

    this.state.ccRecipients.forEach(email => {
      const tag = ce('div', { class: 'pa-recipient-tag' });
      tag.innerHTML = `
        <span>${e(email)}</span>
        <button class="pa-recipient-remove" data-email="${e(email)}">
          <i class="fas fa-times"></i>
        </button>
      `;

      tag.querySelector('.pa-recipient-remove').addEventListener('click', (ev) => {
        ev.preventDefault();
        this.removeCCRecipient(email);
      });

      container.appendChild(tag);
    });
  },

  /* ============================================================================
   * PHOTOS LIST MANAGEMENT
   * ============================================================================ */

  renderPhotosList() {
    const { escapeHtml: e, formatFileSize } = PhotoAuditUtils;
    const container = this.els.photosList;

    container.innerHTML = '';

    if (!this.state.photos.length) {
      container.innerHTML = '<div class="pa-empty-state"><i class="fas fa-image"></i> <span>写真なし / No photos</span></div>';
      this.els.btnSendPhotos.disabled = true;
      this.updatePhotoCount();
      return;
    }

    this.els.btnSendPhotos.disabled = false;

    this.state.photos.forEach((photo, index) => {
      const row = document.createElement('div');
      row.className = 'pa-photo-row';
      row.dataset.uid = photo.uid;

      const name = photo.originalName || photo.fileName || `Photo ${index + 1}`;
      const sizeText = formatFileSize(photo.blob.size);
      const timeText = photo.capturedAt ? PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt)) : '';

      // Check if photo has custom info
      const hasCustomInfo = photo.photoInfo && (
        photo.photoInfo.moldCode ||
        photo.photoInfo.dimensionL ||
        photo.photoInfo.dimensionW ||
        photo.photoInfo.dimensionD
      );

      row.innerHTML = `
        <div class="pa-photo-info">
          <div class="pa-photo-name">${e(name)}</div>
          <div class="pa-photo-meta">
            <span>${sizeText}</span>
            ${timeText ? `<span>${timeText}</span>` : ''}
            <span class="pa-photo-source">${photo.source === 'camera' ? '📷 Camera' : '📁 Upload'}</span>
            ${hasCustomInfo ? '<span class="pa-photo-custom-badge">📝 Custom</span>' : ''}
            ${photo.setAsThumbnail ? '<span class="pa-photo-thumbnail-badge">⭐ Thumbnail</span>' : ''}
          </div>
        </div>
        <div class="pa-photo-actions">
          <button class="pa-btn pa-btn-xs pa-btn-secondary pa-photo-view" data-uid="${photo.uid}" title="View">
            <i class="fas fa-eye"></i>
          </button>
          <button class="pa-btn pa-btn-xs pa-btn-primary pa-photo-edit" data-uid="${photo.uid}" title="Edit info">
            <i class="fas fa-edit"></i>
          </button>
          <button class="pa-btn pa-btn-xs pa-btn-danger pa-photo-delete" data-uid="${photo.uid}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

      container.appendChild(row);
    });

    // Bind actions
    PhotoAuditUtils.$$('.pa-photo-view', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.viewPhoto(uid);
      });
    });

    PhotoAuditUtils.$$('.pa-photo-edit', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.editPhotoInfo(uid);
      });
    });

    PhotoAuditUtils.$$('.pa-photo-delete', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.deletePhoto(uid);
      });
    });

    this.updatePhotoCount();
  },

  updatePhotoCount() {
    if (this.els.photoCount) {
      this.els.photoCount.textContent = `(${this.state.photos.length})`;
    }
  },

  addPhoto(blob, source, originalName) {
    if (this.state.photos.length >= PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION) {
      this.showToast(`最大${PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION}枚まで / Max ${PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION} photos`, 'warning');
      return;
    }

    const uid = PhotoAuditUtils.generateUID();
    const photo = {
      uid,
      blob,
      source,
      originalName: originalName || blob.name || '',
      fileName: '',
      capturedAt: new Date().toISOString(),
      photoInfo: null, // Will be filled when editing
      setAsThumbnail: false
    };

    this.state.photos.push(photo);
    this.renderPhotosList();
    this.showToast('写真を追加しました / Photo added', 'success');
  },

  deletePhoto(uid) {
    this.state.photos = this.state.photos.filter(p => p.uid !== uid);
    this.renderPhotosList();
    this.showToast('写真を削除しました / Photo deleted', 'success');
  },

  findPhotoByUid(uid) {
    return this.state.photos.find(p => p.uid === uid) || null;
  },

  viewPhoto(uid) {
    const photo = this.findPhotoByUid(uid);
    if (!photo) return;

    const index = this.state.photos.findIndex(p => p.uid === uid);
    this.state.currentPhotoIndex = index;
    this.openPhotoListScreen();
  },

  editPhotoInfo(uid) {
    const photo = this.findPhotoByUid(uid);
    if (!photo) return;

    const index = this.state.photos.findIndex(p => p.uid === uid);
    this.state.currentPhotoIndex = index;
    this.openPhotoDetailScreen();
  },

  /* ============================================================================
   * CAMERA SCREEN
   * ============================================================================ */

  buildCameraScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', {
      class: 'pa-camera-overlay pa-hidden',
      id: 'pa-camera-overlay'
    });

    const camera = ce('div', { class: 'pa-camera-screen' });

    const header = ce('div', { class: 'pa-camera-header' });
    header.innerHTML = `
      <button class="pa-btn-camera-close" id="pa-btn-close-camera">
        <i class="fas fa-arrow-left"></i>
      </button>
      <div class="pa-camera-title">
        <span class="ja">写真撮影</span>
        <span class="vi">Photo Capture</span>
      </div>
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-open-gallery">
        <i class="fas fa-images"></i>
      </button>
    `;

    const viewportWrapper = ce('div', { class: 'pa-camera-viewport' });

    const video = ce('video', {
      class: 'pa-camera-video',
      id: 'pa-camera-video',
      autoplay: true,
      playsinline: true,
      muted: true
    });

    const canvas = ce('canvas', {
      class: 'pa-camera-canvas pa-hidden',
      id: 'pa-camera-canvas'
    });

    const gridOverlay = ce('div', {
      class: 'pa-camera-grid pa-hidden',
      id: 'pa-camera-grid'
    });
    gridOverlay.innerHTML = `
      <div class="grid-line grid-v1"></div>
      <div class="grid-line grid-v2"></div>
      <div class="grid-line grid-h1"></div>
      <div class="grid-line grid-h2"></div>
    `;

    viewportWrapper.appendChild(video);
    viewportWrapper.appendChild(canvas);
    viewportWrapper.appendChild(gridOverlay);

    const controls = ce('div', { class: 'pa-camera-controls' });
    controls.innerHTML = `
      <button class="pa-btn-flip" id="pa-btn-flip-camera" title="Flip camera">
        <i class="fas fa-sync-alt"></i>
      </button>
      <button class="pa-btn-capture" id="pa-btn-capture" title="Capture">
        <i class="fas fa-camera"></i>
      </button>
      <button class="pa-btn-grid-toggle" id="pa-btn-grid-toggle" title="Toggle grid">
        <i class="fas fa-th"></i>
      </button>
    `;

    camera.appendChild(header);
    camera.appendChild(viewportWrapper);
    camera.appendChild(controls);

    overlay.appendChild(camera);
    document.body.appendChild(overlay);

    this.els.cameraOverlay = overlay;
    this.els.cameraModal = camera;
    this.els.video = video;
    this.els.canvas = canvas;
    this.els.gridOverlay = gridOverlay;
    this.els.cameraControls = controls;

    this.bindCameraEvents();
  },

  bindCameraEvents() {
    PhotoAuditUtils.$('#pa-btn-close-camera').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCamera();
    });

    PhotoAuditUtils.$('#pa-btn-open-gallery').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCamera();
      this.showSettings();
    });

    PhotoAuditUtils.$('#pa-btn-flip-camera').addEventListener('click', (e) => {
      e.preventDefault();
      this.flipCamera();
    });

    PhotoAuditUtils.$('#pa-btn-grid-toggle').addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleGrid();
    });

    PhotoAuditUtils.$('#pa-btn-capture').addEventListener('click', (e) => {
      e.preventDefault();
      this.capturePhoto();
    });
  },

  async openCamera() {
    console.log('📷 [PhotoAuditTool] Opening camera...');

    this.state.currentScreen = 'camera';
    this.els.cameraOverlay.classList.remove('pa-hidden');
    this.els.video.classList.remove('pa-hidden');
    this.els.canvas.classList.add('pa-hidden');
    document.body.style.overflow = 'hidden';

    try {
      await this.startCameraStream();
    } catch (err) {
      console.error('[PhotoAuditTool] Camera error:', err);
      this.showToast('カメラエラー / Camera error', 'error');
      this.closeCamera();
    }
  },

  async startCameraStream() {
    if (this.state.stream) {
      this.stopCameraStream();
    }

    const constraints = {
      video: {
        facingMode: this.state.facingMode,
        width: { ideal: PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH },
        height: { ideal: PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT }
      },
      audio: false
    };

    try {
      this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.els.video.srcObject = this.state.stream;
      await this.els.video.play();
    } catch (err) {
      throw err;
    }
  },

  stopCameraStream() {
    if (this.state.stream) {
      this.state.stream.getTracks().forEach(track => track.stop());
      this.state.stream = null;
      this.els.video.srcObject = null;
    }
  },

  async flipCamera() {
    this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
    await this.startCameraStream();
  },

  toggleGrid() {
    this.state.gridEnabled = !this.state.gridEnabled;
    if (this.state.gridEnabled) {
      this.els.gridOverlay.classList.remove('pa-hidden');
    } else {
      this.els.gridOverlay.classList.add('pa-hidden');
    }
  },

  capturePhoto() {
    if (!this.state.stream) return;

    const video = this.els.video;
    const canvas = this.els.canvas;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        this.showToast('写真撮影失敗 / Failed to capture photo', 'error');
        return;
      }

      blob.name = ''; // camera doesn't have original name

      this.addPhoto(blob, 'camera');
      this.showToast('写真撮影完了 / Photo captured', 'success');

      // Stay in camera for more photos
    }, 'image/jpeg', PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD);
  },

  closeCamera() {
    this.stopCameraStream();
    this.els.cameraOverlay.classList.add('pa-hidden');
    document.body.style.overflow = '';
    this.state.currentScreen = 'settings';
  },

  /* ============================================================================
   * FILE UPLOAD (MULTIPLE)
   * ============================================================================ */

  async handleMultipleFileUpload(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.showToast('画像ファイルを選択してください / Select image file', 'error');
        continue;
      }

      if (file.size > PHOTO_AUDIT_CONFIG.IMAGE_MAX_SIZE) {
        this.showToast('ファイルが大きすぎます (最大10MB) / File too large (max 10MB)', 'error');
        continue;
      }

      try {
        this.addPhoto(file, 'file', file.name);
      } catch (err) {
        console.error('[PhotoAuditTool] File processing error:', err);
        this.showToast('ファイル処理エラー / File processing error', 'error');
      }
    }

    this.els.fileInput.value = '';
  },

  /* ============================================================================
   * PHOTO LIST SCREEN (Preview Gallery)
   * ============================================================================ */

  buildPhotoListScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', {
      class: 'pa-preview-overlay pa-hidden',
      id: 'pa-photolist-overlay'
    });

    const modal = ce('div', { class: 'pa-preview-modal' });

    const header = ce('div', { class: 'pa-preview-header' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-photolist-back">
        <i class="fas fa-arrow-left"></i>
        <span>戻る / Back</span>
      </button>
      <div class="pa-preview-title">
        <span class="ja">写真プレビュー</span>
        <span class="vi">Xem trước ảnh</span>
      </div>
      <div></div>
    `;

    const body = ce('div', { class: 'pa-preview-body' });
    const img = ce('img', { class: 'pa-preview-image', id: 'pa-photolist-image', alt: 'Preview' });
    const info = ce('div', { class: 'pa-preview-info', id: 'pa-photolist-info' });

    body.appendChild(img);
    body.appendChild(info);

    const footer = ce('div', { class: 'pa-preview-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-photolist-close">
        <i class="fas fa-check"></i>
        <span>OK</span>
      </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.photoListOverlay = overlay;
    this.els.photoListModal = modal;
    this.els.photoListImage = img;
    this.els.photoListInfo = info;

    this.bindPhotoListEvents();
  },

  bindPhotoListEvents() {
    PhotoAuditUtils.$('#pa-btn-photolist-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoList();
    });

    PhotoAuditUtils.$('#pa-btn-photolist-close').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoList();
    });
  },

  openPhotoListScreen() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      this.showToast('写真なし / No photo', 'error');
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];
    const url = URL.createObjectURL(photo.blob);

    this.els.photoListImage.src = url;

    const sizeText = PhotoAuditUtils.formatFileSize(photo.blob.size);
    const timeText = photo.capturedAt ? PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt)) : '';
    const name = photo.originalName || photo.fileName || 'Photo';

    this.els.photoListInfo.innerHTML = `<div>${name}</div><div>${sizeText}</div>${timeText ? `<div>${timeText}</div>` : ''}<div>Source: ${photo.source === 'camera' ? 'Camera' : 'Upload'}</div>`;

    this.state.currentScreen = 'photoList';
    this.els.photoListOverlay.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  closePhotoList() {
    if (this.els.photoListOverlay) {
      this.els.photoListOverlay.classList.add('pa-hidden');
      document.body.style.overflow = '';
    }

    if (this.els.photoListImage && this.els.photoListImage.src) {
      URL.revokeObjectURL(this.els.photoListImage.src);
      this.els.photoListImage.src = '';
    }

    this.state.currentScreen = 'settings';
    this.showSettings();
  },

  /* ============================================================================
   * PHOTO DETAIL SCREEN (Edit Photo Info)
   * ============================================================================ */

  buildPhotoDetailScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', {
      class: 'pa-detail-overlay pa-hidden',
      id: 'pa-photodetail-overlay'
    });

    const modal = ce('div', { class: 'pa-detail-modal' });

    const header = ce('div', { class: 'pa-detail-header' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-detail-back">
        <i class="fas fa-arrow-left"></i>
        <span>戻る / Back</span>
      </button>
      <div class="pa-detail-title">
        <span class="ja">写真情報編集</span>
        <span class="vi">Chỉnh sửa thông tin ảnh</span>
      </div>
      <div></div>
    `;

    const body = ce('div', { class: 'pa-detail-body' });

    // Thumbnail preview
    const preview = ce('div', { class: 'pa-detail-preview' });
    const img = ce('img', { class: 'pa-detail-image', id: 'pa-detail-image', alt: 'Preview' });
    preview.appendChild(img);

    // Form
    const form = ce('div', { class: 'pa-detail-form' });

    form.innerHTML = `
      <div class="pa-form-row">
        <label class="pa-label">
          <span class="ja">金型コード</span>
          <span class="vi">Mold Code</span>
          <small class="hint">(空欄の場合、メイン情報を使用)</small>
        </label>
        <input type="text" class="pa-input" id="pa-detail-mold-code" placeholder="留空則使用主表單資訊" />
      </div>

      <div class="pa-form-row">
        <label class="pa-label">
          <span class="ja">金型名</span>
          <span class="vi">Mold Name</span>
        </label>
        <input type="text" class="pa-input" id="pa-detail-mold-name" placeholder="留空則使用主表單資訊" />
      </div>

      <div class="pa-form-row pa-form-row-triple">
        <div class="pa-form-col">
          <label class="pa-label">
            <span class="ja">長さ</span>
            <span class="vi">Length (mm)</span>
          </label>
          <input type="number" class="pa-input" id="pa-detail-dim-length" placeholder="mm" step="0.1" />
        </div>
        <div class="pa-form-col">
          <label class="pa-label">
            <span class="ja">幅</span>
            <span class="vi">Width (mm)</span>
          </label>
          <input type="number" class="pa-input" id="pa-detail-dim-width" placeholder="mm" step="0.1" />
        </div>
        <div class="pa-form-col">
          <label class="pa-label">
            <span class="ja">深さ</span>
            <span class="vi">Depth (mm)</span>
          </label>
          <input type="number" class="pa-input" id="pa-detail-dim-depth" placeholder="mm" step="0.1" />
        </div>
      </div>

      <div class="pa-form-row">
        <label class="pa-checkbox-label">
          <input type="checkbox" id="pa-detail-set-thumbnail" class="pa-checkbox" />
          <span class="ja">この写真を金型のサムネイルとして設定</span>
          <span class="vi">Đặt làm ảnh đại diện khuôn</span>
        </label>
      </div>

      <div class="pa-info-box">
        <i class="fas fa-info-circle"></i>
        <div>
          <strong>ヒント / Gợi ý:</strong>
          <div>空欄のフィールドは、メインフォームの情報が使用されます。</div>
          <div>Các trường để trống sẽ tự động lấy thông tin từ form chính.</div>
        </div>
      </div>
    `;

    body.appendChild(preview);
    body.appendChild(form);

    const footer = ce('div', { class: 'pa-detail-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-detail-cancel">
        <i class="fas fa-times"></i>
        <span>キャンセル / Cancel</span>
      </button>
      <button class="pa-btn pa-btn-primary" id="pa-btn-detail-save">
        <i class="fas fa-save"></i>
        <span>保存 / Save</span>
      </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.photoDetailOverlay = overlay;
    this.els.photoDetailModal = modal;
    this.els.photoDetailImage = img;
    this.els.detailMoldCode = PhotoAuditUtils.$('#pa-detail-mold-code');
    this.els.detailMoldName = PhotoAuditUtils.$('#pa-detail-mold-name');
    this.els.detailDimLength = PhotoAuditUtils.$('#pa-detail-dim-length');
    this.els.detailDimWidth = PhotoAuditUtils.$('#pa-detail-dim-width');
    this.els.detailDimDepth = PhotoAuditUtils.$('#pa-detail-dim-depth');
    this.els.detailSetThumbnail = PhotoAuditUtils.$('#pa-detail-set-thumbnail');

    this.bindPhotoDetailEvents();
  },

  bindPhotoDetailEvents() {
    PhotoAuditUtils.$('#pa-btn-detail-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoDetail();
    });

    PhotoAuditUtils.$('#pa-btn-detail-cancel').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoDetail();
    });

    PhotoAuditUtils.$('#pa-btn-detail-save').addEventListener('click', (e) => {
      e.preventDefault();
      this.savePhotoDetail();
    });
  },

  openPhotoDetailScreen() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      this.showToast('写真なし / No photo', 'error');
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];
    const url = URL.createObjectURL(photo.blob);

    this.els.photoDetailImage.src = url;

    // Load existing photo info
    if (photo.photoInfo) {
      this.els.detailMoldCode.value = photo.photoInfo.moldCode || '';
      this.els.detailMoldName.value = photo.photoInfo.moldName || '';
      this.els.detailDimLength.value = photo.photoInfo.dimensionL || '';
      this.els.detailDimWidth.value = photo.photoInfo.dimensionW || '';
      this.els.detailDimDepth.value = photo.photoInfo.dimensionD || '';
    } else {
      this.els.detailMoldCode.value = '';
      this.els.detailMoldName.value = '';
      this.els.detailDimLength.value = '';
      this.els.detailDimWidth.value = '';
      this.els.detailDimDepth.value = '';
    }

    this.els.detailSetThumbnail.checked = photo.setAsThumbnail || false;

    this.state.currentScreen = 'photoDetail';
    this.els.photoDetailOverlay.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  savePhotoDetail() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];

    const moldCode = this.els.detailMoldCode.value.trim();
    const moldName = this.els.detailMoldName.value.trim();
    const dimL = this.els.detailDimLength.value.trim();
    const dimW = this.els.detailDimWidth.value.trim();
    const dimD = this.els.detailDimDepth.value.trim();

    // Only save if at least one field is filled
    if (moldCode || moldName || dimL || dimW || dimD) {
      photo.photoInfo = {
        moldCode: moldCode || null,
        moldName: moldName || null,
        dimensionL: dimL || null,
        dimensionW: dimW || null,
        dimensionD: dimD || null
      };
    } else {
      photo.photoInfo = null; // Clear if all empty
    }

    photo.setAsThumbnail = this.els.detailSetThumbnail.checked;

    this.showToast('写真情報を保存しました / Photo info saved', 'success');
    this.closePhotoDetail();
    this.renderPhotosList();
  },

  closePhotoDetail() {
    if (this.els.photoDetailOverlay) {
      this.els.photoDetailOverlay.classList.add('pa-hidden');
      document.body.style.overflow = '';
    }

    if (this.els.photoDetailImage && this.els.photoDetailImage.src) {
      URL.revokeObjectURL(this.els.photoDetailImage.src);
      this.els.photoDetailImage.src = '';
    }

    this.state.currentScreen = 'settings';
    this.showSettings();
  },

  /* ============================================================================
   * SEND ALL PHOTOS (Batch Email)
   * ============================================================================ */

  async sendAllPhotos() {
    if (this.state.sending) return;

    if (this.state.photos.length === 0) {
      this.showToast('写真がありません / No photos', 'error');
      return;
    }

    // Validate main form
    const employeeName = this.state.mainForm.selectedEmployee?.name || this.els.employeeInput.value.trim();
    if (!employeeName) {
      this.showToast('撮影者を選択してください / Select employee', 'error');
      this.els.employeeInput.focus();
      return;
    }

    const btn = this.els.btnSendPhotos;
    btn.disabled = true;
    this.state.sending = true;
    btn.innerHTML = `
      <span class="pa-loading-spinner"></span>
      <span>送信中... / Sending...</span>
    `;

    try {
      // Step 1: Upload all photos
      console.log('📤 [PhotoAuditTool] Uploading photos...');

      const uploadedPhotos = [];

      for (let i = 0; i < this.state.photos.length; i++) {
        const photo = this.state.photos[i];

        // Resize image
        const processedBlob = await this.resizeImage(photo.blob, 'hd');

        // Generate filename
        const fileName = this.generateFileName(photo, i);
        photo.fileName = fileName;

        // Upload
        await SupabasePhotoClient.uploadFile(
          PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
          fileName,
          processedBlob
        );

        const photoUrl = SupabasePhotoClient.getPublicUrl(
          PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
          fileName
        );

        // Prepare photo data for email
        const photoData = {
          fileName: fileName,
          originalFileName: photo.originalName || fileName,
          url: photoUrl
        };

        // Add custom info if exists
        if (photo.photoInfo) {
          if (photo.photoInfo.moldCode) photoData.moldCode = photo.photoInfo.moldCode;
          if (photo.photoInfo.moldName) photoData.moldName = photo.photoInfo.moldName;
          if (photo.photoInfo.dimensionL) photoData.dimensionL = photo.photoInfo.dimensionL;
          if (photo.photoInfo.dimensionW) photoData.dimensionW = photo.photoInfo.dimensionW;
          if (photo.photoInfo.dimensionD) photoData.dimensionD = photo.photoInfo.dimensionD;
        }

        if (photo.setAsThumbnail) {
          photoData.setAsThumbnail = true;
        }

        uploadedPhotos.push(photoData);
      }

      console.log('✅ [PhotoAuditTool] All photos uploaded');

      // Step 2: Prepare main form data (default for all photos)
      let mainMoldCode = '';
      let mainMoldName = '';
      let mainMoldId = '';

      if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
        mainMoldCode = this.state.mainForm.selectedMold.code || '';
        mainMoldName = this.state.mainForm.selectedMold.name || '';
        mainMoldId = this.state.mainForm.selectedMold.id || '';
      } else if (this.els.moldInput.value.trim()) {
        mainMoldName = this.els.moldInput.value.trim();
        mainMoldCode = this.generateMoldCodeFromName(mainMoldName);
      }

      const employeeId = this.state.mainForm.selectedEmployee?.id || '';

      // Step 3: Send batch email
      const payload = {
        // Main mold info (used as default)
        moldCode: mainMoldCode || 'BATCH',
        moldName: mainMoldName || 'Multiple Photos',
        moldId: mainMoldId,
        dimensionL: this.state.mainForm.dimensions.length || '',
        dimensionW: this.state.mainForm.dimensions.width || '',
        dimensionD: this.state.mainForm.dimensions.depth || '',

        // Batch photos array
        photos: uploadedPhotos,

        // Employee & date
        employee: employeeName,
        employeeId: employeeId,
        date: PhotoAuditUtils.formatDateTime(),

        // Notes & recipients
        notes: this.state.mainForm.notes || '',
        recipients: [PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT],
        ccRecipients: this.state.ccRecipients
      };

      console.log('📧 [PhotoAuditTool] Sending batch email...', payload);

      const result = await SupabasePhotoClient.callEdgeFunction('send-photo-audit', payload);

      console.log('✅ [PhotoAuditTool] Email sent:', result);

      this.showToast('メール送信完了 / Email sent successfully', 'success', 2000);

      setTimeout(() => {
        this.closeSettings();
        this.resetState();
      }, 2000);

    } catch (err) {
      console.error('❌ [PhotoAuditTool] Send error:', err);
      const errorMsg = err.message || 'Unknown error';
      this.showToast(`送信エラー / Send error:\n\n${errorMsg}`, 'error', 8000);

      btn.disabled = false;
      btn.innerHTML = `
        <i class="fas fa-paper-plane"></i>
        <span>Send</span>
      `;
    } finally {
      this.state.sending = false;
    }
  },

  /* ============================================================================
   * RESIZE IMAGE
   * ============================================================================ */

  async resizeImage(blob, mode) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;

        if (mode === 'hd') {
          const maxWidth = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH;
          const maxHeight = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
        } else if (mode === 'compressed') {
          const maxWidth = 1280;
          const maxHeight = 720;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const quality = mode === 'compressed' ? PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_COMPRESSED : PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD;

        canvas.toBlob((resultBlob) => {
          if (!resultBlob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          resolve(resultBlob);
        }, 'image/jpeg', quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load error'));
      };

      img.src = url;
    });
  },

  /* ============================================================================
   * FILENAME GENERATION
   * ============================================================================ */

  generateMoldCodeFromName(name) {
    if (!name) return 'UNKNOWN';
    return name
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 12) || 'UNKNOWN';
  },

  generateFileName(photo, index) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const dateStr = `${y}${m}${d}`;
    const timeStr = `${hh}${mm}${ss}`;

    let moldCode = 'PHOTO';

    // Try photo-specific info first
    if (photo.photoInfo && photo.photoInfo.moldCode) {
      moldCode = photo.photoInfo.moldCode;
    }
    // Then try main form
    else if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
      moldCode = this.state.mainForm.selectedMold.code || 'PHOTO';
    } else if (this.els.moldInput.value.trim()) {
      const moldNameInput = this.els.moldInput.value.trim();
      moldCode = this.generateMoldCodeFromName(moldNameInput);
    }

    moldCode = moldCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 20);

    if (!moldCode) moldCode = 'PHOTO';

    // For file uploads, keep original name structure
    if (photo.source === 'file' && photo.originalName) {
      const ext = photo.originalName.substring(photo.originalName.lastIndexOf('.')) || '.jpg';
      const baseName = photo.originalName.substring(0, photo.originalName.lastIndexOf('.'))
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .substring(0, 50);
      return `${baseName}-${dateStr}-${timeStr}${ext}`;
    }

    // Camera photos: moldcode-YYYYMMDD-HHMMSS-index.jpg
    return `${moldCode}-${dateStr}-${timeStr}-${String(index + 1).padStart(2, '0')}.jpg`;
  },

  /* ============================================================================
   * SHOW TOAST
   * ============================================================================ */

  showToast(message, type = 'info', duration = PHOTO_AUDIT_CONFIG.TOAST_DURATION) {
    // Remove existing toasts
    const existing = document.querySelectorAll('.pa-toast');
    existing.forEach(t => t.remove());

    const toast = PhotoAuditUtils.createEl('div', {
      class: `pa-toast pa-toast-${type}`
    });

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span>${PhotoAuditUtils.escapeHtml(message).replace(/\n/g, '<br>')}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('pa-toast-show'), 10);

    setTimeout(() => {
      toast.classList.remove('pa-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /* ============================================================================
   * PUBLIC API - OPEN/CLOSE SETTINGS
   * ============================================================================ */

  openSettings(options = {}) {
    console.log('📷 [PhotoAuditTool] openSettings() called');

    if (!this.state.initialized) {
      console.warn('⚠️ Not initialized, initializing now...');
      this.init();
      setTimeout(() => this._openSettingsUI(options), 500);
      return;
    }

    this._openSettingsUI(options);
  },

  _openSettingsUI(options = {}) {
    // Pre-fill mold if passed from detail modal
    if (options.mold && options.type === 'mold') {
      const moldId = options.mold.MoldID;
      const mold = this.state.molds.find(m => String(m.MoldID) === String(moldId));

      if (mold) {
        this.selectMold(mold);
      }
    }

    this.state.currentScreen = 'settings';
    this.els.root.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  showSettings() {
    this.state.currentScreen = 'settings';
    this.els.root.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  closeSettings() {
    console.log('🔒 [PhotoAuditTool] Closing settings...');

    this.els.root.classList.add('pa-hidden');
    this.state.currentScreen = null;
    document.body.style.overflow = '';
  },

  /* ============================================================================
   * RESET STATE
   * ============================================================================ */

  resetState() {
    // Reset main form
    this.state.mainForm.selectedMold = null;
    this.state.mainForm.isManualMold = false;
    this.clearDimensions();

    // Reset to default employee
    const defaultEmp = this.state.employees.find(e =>
      String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
    );

    if (defaultEmp) {
      this.state.mainForm.selectedEmployee = {
        id: defaultEmp.EmployeeID,
        name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
      };
      this.state.mainForm.isManualEmployee = false;

      if (this.els.employeeInput) {
        this.els.employeeInput.value = this.state.mainForm.selectedEmployee.name;
        this.updateEmployeeBadge();
      }
    }

    // Reset inputs
    if (this.els.moldInput) {
      this.els.moldInput.value = '';
      this.updateMoldBadge();
    }
    if (this.els.notes) {
      this.els.notes.value = '';
      this.state.mainForm.notes = '';
    }

    // Reset photos
    this.state.photos = [];
    this.state.currentPhotoIndex = -1;
    this.renderPhotosList();

    // Reset recipients
    this.state.ccRecipients = [];
    this.renderCCRecipientList();
  },

  /* ============================================================================
   * ✅ BIND GLOBAL HOOKS - FIXED (Learned from R2.2.3)
   * ============================================================================ */

  bindGlobalHooks() {
    // Navbar button
    const navbarBtn = PhotoAuditUtils.$('#open-photo-audit-tool');
    if (navbarBtn) {
      navbarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openSettings();
      });
    }

    // ✅ Detail modal button - Fix for mobile-detail-modal
    document.addEventListener('click', (e) => {
      // Check if clicked element or its parent has the photo audit button class/attribute
      if (e.target.closest('#mobile-detail-photo-audit-btn')) {
        e.preventDefault();

        // Get mold data from modal
        let moldData = null;
        const detailModal = e.target.closest('.mobile-detail-modal');
        if (detailModal && window.MobileDetailModal) {
          moldData = window.MobileDetailModal.currentItem;
        }

        this.openSettings({
          mold: moldData,
          type: 'mold'
        });
      }
    });

    console.log('🔗 [PhotoAuditTool] Global hooks bound');
  }
};

/* ============================================================================
 * AUTO INIT
 * ============================================================================ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PhotoAuditTool.init());
} else {
  PhotoAuditTool.init();
}

/* ============================================================================
 * EXPOSE TO WINDOW
 * ============================================================================ */

window.PhotoAuditTool = PhotoAuditTool;
