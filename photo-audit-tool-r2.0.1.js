/* ============================================================
   PHOTO AUDIT TOOL - R2.0.1
   
   写真監査ツール / Công cụ kiểm tra ảnh khuôn
   
   CHANGES FROM R2.0.0:
   - Searchable Dropdown: Show all options, filter realtime
   - Manual Input: Accept immediately, no "not found" required
   - Validation: Accept manual input (yellow tag)
   - Employee Search: Support Japanese Katakana names
   - Default Recipient: Added toan@ysd-pack.co.jp
   
   Architecture:
   - Integration: DataManager (direct access)
   - Settings Screen: Searchable dropdown + manual input
   - Camera Screen: HD preview (1920x1080)
   - Send Email: Full metadata + photo
   - Triggers: Navbar + Mobile Detail Modal
   
   Created: 2025-12-18
   Last Updated: 2025-12-18
   ============================================================ */

'use strict';

/* ========================================
   CONSTANTS
   ======================================== */

const PHOTO_AUDIT_CONFIG = {
  STORAGE_BUCKET: 'mold-photos',
  DEFAULT_EMPLOYEE_ID: 1, // Toan-san
  DEFAULT_RECIPIENTS: [
    'toan@ysd-pack.co.jp',
    'production@molddesign.co.jp',
    'quality@molddesign.co.jp'
  ],
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  IMAGE_TARGET_WIDTH: 1920,
  IMAGE_TARGET_HEIGHT: 1080,
  IMAGE_QUALITY: 0.92,
  DEBOUNCE_DELAY: 150,
  TOAST_DURATION: 3000
};

/* ========================================
   UTILITIES
   ======================================== */

const PhotoAuditUtils = {
  // DOM Helpers
  $: (selector, ctx = document) => ctx.querySelector(selector),
  $$: (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector)),
  
  // Create Element
  createElement: (tag, attrs = {}, innerHTML = '') => {
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
  
  // Escape HTML
  escapeHtml: (str) => {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
  
  // Format Date (Japanese style: YYYYMMDD)
  formatDateJP: () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  },
  
  // Format DateTime (ISO)
  nowISO: () => new Date().toISOString(),
  
  // Format DateTime (Display: YYYY/MM/DD HH:MM)
  formatDateTime: (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
  },
  
  // Debounce
  debounce: (func, wait) => {
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
  
  // Email Validation
  isValidEmail: (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
};

/* ========================================
   SUPABASE CLIENT
   ======================================== */

const SupabasePhotoClient = {
  config: {
    url: 'https://fghxlprksqlvpmnldxps.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaHhscHJrc3FsdnBtbmxkeHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzMTMzMDIsImV4cCI6MjA0OTg4OTMwMn0.q7IXM5v7lR8KqtSitraNfZwkn5ZLdBZDLHwqp2jpUhs'
  },

  // Upload file to Supabase Storage
  async uploadFile(bucket, fileName, blob) {
    const formData = new FormData();
    formData.append('file', blob, fileName);
    
    const url = `${this.config.url}/storage/v1/object/${bucket}/${fileName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.anonKey}`,
        'x-upsert': 'true'
      },
      body: formData
    });
    
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upload failed: ${err}`);
    }
    
    return await res.json();
  },

  // Get public URL
  getPublicUrl(bucket, fileName) {
    return `${this.config.url}/storage/v1/object/public/${bucket}/${fileName}`;
  },

  // Call Edge Function
  async callEdgeFunction(functionName, payload) {
    const url = `${this.config.url}/functions/v1/${functionName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.anonKey}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Function call failed: ${err}`);
    }
    
    return await res.json();
  }
};

/* ========================================
   MAIN PHOTO AUDIT TOOL
   ======================================== */

const PhotoAuditTool = {
  // State
  state: {
    initialized: false,
    
    // Data from DataManager
    molds: [],
    employees: [],
    
    // Dropdown state
    moldDropdownOpen: false,
    employeeDropdownOpen: false,
    
    // Selection
    selectedMold: null,
    isManualMold: false,
    manualMoldInput: '',
    
    selectedEmployee: null,
    isManualEmployee: false,
    manualEmployeeInput: '',
    
    // Dimensions (auto-filled from mold data)
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
    
    // Recipients
    recipients: [],
    
    // Camera
    stream: null,
    facingMode: 'environment',
    gridEnabled: false,
    
    // Photo
    photoBlob: null,
    photoSource: null, // 'camera' | 'file'
    
    // UI
    currentScreen: null, // 'settings' | 'camera'
    sending: false
  },

  // Elements cache
  els: {},

  /* ========================================
     INITIALIZATION
     ======================================== */

  init() {
    if (this.state.initialized) return;

    console.log('📷 [PhotoAuditTool v2.0.1] Initializing...');

    // Wait for DataManager
    if (!window.DataManager || !window.DataManager.loaded) {
      console.warn('⏳ [PhotoAuditTool] DataManager not ready, waiting...');
      document.addEventListener('data-manager:ready', () => this.init(), { once: true });
      return;
    }

    this.loadData();
    this.buildUI();
    this.bindGlobalHooks();

    this.state.initialized = true;
    console.log('✅ [PhotoAuditTool v2.0.1] Initialized successfully!');

    // Dispatch ready event
    document.dispatchEvent(new CustomEvent('photoAuditTool:ready', {
      detail: { version: '2.0.1' }
    }));
  },

  /* ========================================
     LOAD DATA FROM DATAMANAGER
     ======================================== */

  loadData() {
    const dm = window.DataManager.data;

    // Load molds (enriched with designInfo)
    this.state.molds = dm.molds || [];

    // Load employees
    this.state.employees = dm.employees || [];

    // Set default recipients
    this.state.recipients = [...PHOTO_AUDIT_CONFIG.DEFAULT_RECIPIENTS];

    // Set default employee (Toan-san)
    const defaultEmp = this.state.employees.find(
      (e) => String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
    );
    
    if (defaultEmp) {
      this.state.selectedEmployee = {
        id: defaultEmp.EmployeeID,
        name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName,
        isManual: false
      };
    }

    console.log('📊 [PhotoAuditTool] Data loaded', {
      molds: this.state.molds.length,
      employees: this.state.employees.length,
      defaultEmployee: this.state.selectedEmployee?.name,
      defaultRecipients: this.state.recipients.length
    });
  },

  /* ========================================
     BUILD UI
     ======================================== */

  buildUI() {
    this.buildSettingsScreen();
    this.buildCameraScreen();
  },

  /* ========================================
     BUILD SETTINGS SCREEN
     ======================================== */

  buildSettingsScreen() {
    const { createElement: ce } = PhotoAuditUtils;

    // Overlay
    const overlay = ce('div', {
      class: 'photo-audit-overlay pa-hidden',
      id: 'photo-audit-settings-overlay'
    });

    // Settings Container
    const settings = ce('div', { class: 'photo-audit-settings' });

    // Header
    const header = ce('div', { class: 'pa-settings-header' });
    header.innerHTML = `
      <div class="pa-settings-title">
        <i class="fas fa-camera"></i>
        <div>
          <div>
            <span class="label-ja">写真監査</span>
            <span class="label-vi">Photo Audit</span>
          </div>
          <div class="pa-settings-title-sub">Mold Photo Inspection & Email</div>
        </div>
      </div>
      <button class="pa-btn-header-close" id="pa-settings-close" title="Close">
        <i class="fas fa-times"></i>
      </button>
    `;

    // Body
    const body = ce('div', { class: 'pa-settings-body' });
    body.innerHTML = `
      <!-- Section 1: Mold Selection -->
      <div class="pa-section">
        <label class="pa-label">
          <i class="fas fa-cube"></i>
          <span class="label-ja">型</span>
          <span class="label-vi">Khuôn / Mold</span>
          <span class="required">*</span>
        </label>
        <div class="pa-search-wrapper">
          <input 
            type="text" 
            class="pa-input pa-search-input" 
            id="pa-mold-search" 
            placeholder="型コードまたは名前 / Mã hoặc tên khuôn..." 
            autocomplete="off">
          <button class="pa-dropdown-toggle" id="pa-mold-toggle" title="Show all">
            <i class="fas fa-chevron-down"></i>
          </button>
          <i class="fas fa-search pa-search-icon"></i>
        </div>
        <div class="pa-search-results" id="pa-mold-results"></div>
        <div class="pa-selected-mold" id="pa-mold-selected"></div>
      </div>

      <!-- Section 2: Dimensions -->
      <div class="pa-section">
        <label class="pa-label">
          <i class="fas fa-ruler-combined"></i>
          <span class="label-ja">寸法 L×W×H</span>
          <span class="label-vi">Kích thước</span>
        </label>
        <div class="pa-dimensions-grid">
          <div class="pa-dim-input-wrapper">
            <label class="pa-dim-label">L (mm)</label>
            <input 
              type="number" 
              class="pa-input pa-dim-input" 
              id="pa-dim-length" 
              placeholder="長さ / Dài" 
              step="0.1">
          </div>
          <div class="pa-dim-input-wrapper">
            <label class="pa-dim-label">W (mm)</label>
            <input 
              type="number" 
              class="pa-input pa-dim-input" 
              id="pa-dim-width" 
              placeholder="幅 / Rộng" 
              step="0.1">
          </div>
          <div class="pa-dim-input-wrapper">
            <label class="pa-dim-label">H (mm)</label>
            <input 
              type="number" 
              class="pa-input pa-dim-input" 
              id="pa-dim-depth" 
              placeholder="高さ / Cao" 
              step="0.1">
          </div>
        </div>
        <p class="pa-hint">
          <i class="fas fa-info-circle"></i>
          自動入力値は編集可能 / Auto-filled values are editable
        </p>
      </div>

      <!-- Section 3: Employee -->
      <div class="pa-section">
        <label class="pa-label">
          <i class="fas fa-user"></i>
          <span class="label-ja">従業員</span>
          <span class="label-vi">Nhân viên / Employee</span>
          <span class="required">*</span>
        </label>
        <div class="pa-search-wrapper">
          <input 
            type="text" 
            class="pa-input pa-search-input" 
            id="pa-employee-search" 
            placeholder="従業員名 / Tên nhân viên..." 
            autocomplete="off">
          <button class="pa-dropdown-toggle" id="pa-employee-toggle" title="Show all">
            <i class="fas fa-chevron-down"></i>
          </button>
          <i class="fas fa-user-circle pa-search-icon"></i>
        </div>
        <div class="pa-search-results" id="pa-employee-results"></div>
        <div class="pa-selected-employee" id="pa-employee-selected"></div>
        <p class="pa-hint">
          <i class="fas fa-info-circle"></i>
          手動入力も可能 / Manual input allowed
        </p>
      </div>

      <!-- Section 4: Email Recipients -->
      <div class="pa-section">
        <label class="pa-label">
          <i class="fas fa-envelope"></i>
          <span class="label-ja">受取人</span>
          <span class="label-vi">Email nhận / Recipients</span>
          <span class="required">*</span>
        </label>
        <div class="pa-recipient-input-group">
          <input 
            type="email" 
            class="pa-input pa-recipient-input" 
            id="pa-recipient-input" 
            placeholder="example@company.com">
          <button class="pa-btn pa-btn-add-recipient" id="pa-add-recipient">
            <i class="fas fa-plus"></i>
            <span class="btn-label-ja">追加</span>
          </button>
        </div>
        <div class="pa-recipients-container" id="pa-recipients"></div>
      </div>
    `;

    // Footer
    const footer = ce('div', { class: 'pa-settings-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-file">
        <i class="fas fa-file-image"></i>
        <span class="btn-label-ja">ファイル</span>
        <span class="btn-label-vi">File</span>
      </button>
      <button class="pa-btn pa-btn-primary" id="pa-btn-camera">
        <i class="fas fa-camera"></i>
        <span class="btn-label-ja">撮影</span>
        <span class="btn-label-vi">Chụp</span>
      </button>
    `;

    // Assemble
    settings.appendChild(header);
    settings.appendChild(body);
    settings.appendChild(footer);
    overlay.appendChild(settings);
    document.body.appendChild(overlay);

    // Cache elements
    this.els.settingsOverlay = overlay;
    this.els.settingsBody = body;
    this.els.btnSettingsClose = PhotoAuditUtils.$('#pa-settings-close', overlay);
    this.els.btnCamera = PhotoAuditUtils.$('#pa-btn-camera', overlay);
    this.els.btnFile = PhotoAuditUtils.$('#pa-btn-file', overlay);

    // Mold search
    this.els.moldSearchInput = PhotoAuditUtils.$('#pa-mold-search', overlay);
    this.els.moldSearchResults = PhotoAuditUtils.$('#pa-mold-results', overlay);
    this.els.moldSelectedDisplay = PhotoAuditUtils.$('#pa-mold-selected', overlay);
    this.els.moldToggle = PhotoAuditUtils.$('#pa-mold-toggle', overlay);

    // Dimensions
    this.els.dimLengthInput = PhotoAuditUtils.$('#pa-dim-length', overlay);
    this.els.dimWidthInput = PhotoAuditUtils.$('#pa-dim-width', overlay);
    this.els.dimDepthInput = PhotoAuditUtils.$('#pa-dim-depth', overlay);

    // Employee search
    this.els.employeeSearchInput = PhotoAuditUtils.$('#pa-employee-search', overlay);
    this.els.employeeSearchResults = PhotoAuditUtils.$('#pa-employee-results', overlay);
    this.els.employeeSelectedDisplay = PhotoAuditUtils.$('#pa-employee-selected', overlay);
    this.els.employeeToggle = PhotoAuditUtils.$('#pa-employee-toggle', overlay);

    // Recipients
    this.els.recipientInput = PhotoAuditUtils.$('#pa-recipient-input', overlay);
    this.els.btnAddRecipient = PhotoAuditUtils.$('#pa-add-recipient', overlay);
    this.els.recipientsContainer = PhotoAuditUtils.$('#pa-recipients', overlay);

    // Bind events
    this.bindSettingsEvents();

    // Set default employee display
    if (this.state.selectedEmployee) {
      this.updateEmployeeDisplay();
      if (this.els.employeeSearchInput) {
        this.els.employeeSearchInput.value = this.state.selectedEmployee.name;
      }
    }

    // Render default recipients
    this.renderRecipients();
  },

  /* ========================================
     BIND SETTINGS EVENTS
     ======================================== */

  bindSettingsEvents() {
    const { debounce } = PhotoAuditUtils;

    // Close button
    this.els.btnSettingsClose.addEventListener('click', () => this.closeSettings());

    // Camera button
    this.els.btnCamera.addEventListener('click', () => this.validateAndOpenCamera());

    // File button
    this.els.btnFile.addEventListener('click', () => this.openFilePicker());

    // Mold search input - IMPROVED
    this.els.moldSearchInput.addEventListener('input', debounce((e) => {
      const value = e.target.value.trim();
      this.state.manualMoldInput = value;
      
      if (value) {
        this.state.isManualMold = true;
        this.els.moldSearchInput.classList.add('manual-input');
        this.els.moldSearchInput.classList.remove('auto-selected');
        this.updateMoldDisplay();
      }
      
      this.filterMoldDropdown(value);
      
      // Auto-show dropdown when typing
      if (!this.state.moldDropdownOpen) {
        this.showMoldDropdown();
      }
    }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY));

    // Mold search focus - show ALL options
    this.els.moldSearchInput.addEventListener('focus', () => {
      this.showMoldDropdown();
    });

    // Mold search click - also show dropdown
    this.els.moldSearchInput.addEventListener('click', () => {
      if (!this.state.moldDropdownOpen) {
        this.showMoldDropdown();
      }
    });


    // Mold dropdown toggle
    this.els.moldToggle.addEventListener('click', () => {
      this.toggleMoldDropdown();
    });

    // Employee search input - IMPROVED
    this.els.employeeSearchInput.addEventListener('input', debounce((e) => {
      const value = e.target.value.trim();
      this.state.manualEmployeeInput = value;
      
      if (value) {
        this.state.isManualEmployee = true;
        this.els.employeeSearchInput.classList.add('manual-input');
        this.els.employeeSearchInput.classList.remove('auto-selected');
        this.updateEmployeeSelection(value);
      }
      
      this.filterEmployeeDropdown(value);
      
      // Auto-show dropdown when typing
      if (!this.state.employeeDropdownOpen) {
        this.showEmployeeDropdown();
      }
    }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY));

    // Employee search focus - show ALL options
    this.els.employeeSearchInput.addEventListener('focus', () => {
      this.showEmployeeDropdown();
    });

    // Employee search click - also show dropdown
    this.els.employeeSearchInput.addEventListener('click', () => {
      if (!this.state.employeeDropdownOpen) {
        this.showEmployeeDropdown();
      }
    });


    // Employee dropdown toggle
    this.els.employeeToggle.addEventListener('click', () => {
      this.toggleEmployeeDropdown();
    });

    // Dimension inputs - mark as manual edit
    const dimInputs = [
      { input: this.els.dimLengthInput, key: 'length' },
      { input: this.els.dimWidthInput, key: 'width' },
      { input: this.els.dimDepthInput, key: 'depth' }
    ];

    dimInputs.forEach(({ input, key }) => {
      input.addEventListener('input', (e) => {
        this.state.dimensions[key] = e.target.value;
        if (this.state.dimensionsSource[key]) {
          this.state.dimensionsSource[key] = 'manual';
        }
        input.classList.remove('auto-filled');
        input.classList.add('manual-edit');
      });
    });

    // Recipients
    this.els.btnAddRecipient.addEventListener('click', () => this.addRecipient());
    this.els.recipientInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addRecipient();
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.els.moldSearchInput.contains(e.target) && 
          !this.els.moldSearchResults.contains(e.target) &&
          !this.els.moldToggle.contains(e.target)) {
        this.closeMoldDropdown();
      }
      if (!this.els.employeeSearchInput.contains(e.target) && 
          !this.els.employeeSearchResults.contains(e.target) &&
          !this.els.employeeToggle.contains(e.target)) {
        this.closeEmployeeDropdown();
      }
    });
  },

  /* ========================================
     MOLD DROPDOWN LOGIC (SEARCHABLE)
     ======================================== */

  showMoldDropdown() {
    this.state.moldDropdownOpen = true;
    this.els.moldToggle.classList.add('active');
    this.filterMoldDropdown(this.els.moldSearchInput.value.trim());
  },

  closeMoldDropdown() {
    this.state.moldDropdownOpen = false;
    this.els.moldToggle.classList.remove('active');
    this.els.moldSearchResults.classList.remove('pa-visible');
  },

  toggleMoldDropdown() {
    if (this.state.moldDropdownOpen) {
      this.closeMoldDropdown();
    } else {
      this.showMoldDropdown();
      this.els.moldSearchInput.focus();
    }
  },

  filterMoldDropdown(query) {
    const { escapeHtml: e, createElement: ce } = PhotoAuditUtils;
    const q = query.toLowerCase();

    console.log('🔍 [PhotoAuditTool] Filtering molds:', q, 'Total:', this.state.molds.length);

    let results = this.state.molds;
    
    // Filter if query exists
    if (q) {
      results = this.state.molds.filter((m) => {
        const code = (m.MoldCode || '').toLowerCase();
        const name = (m.MoldName || '').toLowerCase();
        const designCode = (m.designInfo?.MoldDesignCode || '').toLowerCase();
        const displayName = (m.displayName || '').toLowerCase();
        
        return code.includes(q) || 
               name.includes(q) || 
               designCode.includes(q) ||
               displayName.includes(q);
      });
    }

    // Limit to 50 results
    results = results.slice(0, 50);

    console.log('✅ [PhotoAuditTool] Filtered molds:', results.length);

    if (results.length === 0) {
      this.els.moldSearchResults.innerHTML = `
        <div class="pa-search-empty">
          <i class="fas fa-info-circle"></i>
          <div class="empty-ja">見つかりません</div>
          <div class="empty-vi">Không tìm thấy</div>
          <div class="empty-hint">入力値を使用 / Using manual input: "${e(query)}"</div>
        </div>
      `;
      this.els.moldSearchResults.classList.add('pa-visible');
      return;
    }

    // Render results
    this.els.moldSearchResults.innerHTML = '';
    results.forEach((mold) => {
      const item = ce('div', { class: 'pa-search-item' });
      const code = e(mold.MoldCode || mold.displayCode || '');
      const name = e(mold.MoldName || mold.displayName || '');
      const dimensions = mold.displayDimensions || '';
      const location = mold.displayRackLocation || '';

      item.innerHTML = `
        <div class="pa-search-item-main">
          <div class="pa-search-item-code">${code}</div>
          <div class="pa-search-item-name">${name}</div>
        </div>
        <div class="pa-search-item-meta">
          ${dimensions ? `<span class="meta-dim"><i class="fas fa-ruler-combined"></i>${e(dimensions)}</span>` : ''}
          ${location ? `<span class="meta-loc"><i class="fas fa-map-marker-alt"></i>${e(location)}</span>` : ''}
        </div>
      `;

      item.addEventListener('click', () => this.selectMold(mold));
      this.els.moldSearchResults.appendChild(item);
    });

    this.els.moldSearchResults.classList.add('pa-visible');
  },

  selectMold(mold) {
    this.state.selectedMold = mold;
    this.state.isManualMold = false;
    this.state.manualMoldInput = '';
    
    this.els.moldSearchInput.value = `${mold.MoldCode || ''} - ${mold.MoldName || ''}`;
    this.els.moldSearchInput.classList.remove('manual-input');
    this.els.moldSearchInput.classList.add('auto-selected');
    
    this.closeMoldDropdown();
    this.loadDimensionsForMold(mold);
    this.updateMoldDisplay();
    
    console.log('✅ [PhotoAuditTool] Mold selected:', {
      code: mold.MoldCode,
      id: mold.MoldID
    });
  },

  updateMoldDisplay() {
    const { escapeHtml: e } = PhotoAuditUtils;
    if (!this.els.moldSelectedDisplay) return;

    if (this.state.selectedMold) {
      const m = this.state.selectedMold;
      this.els.moldSelectedDisplay.innerHTML = `
        <div class="pa-selected-tag">
          <i class="fas fa-check-circle"></i>
          <span>${e(m.MoldCode || '')} - ${e(m.MoldName || '')}</span>
        </div>
      `;
    } else if (this.state.isManualMold && this.state.manualMoldInput) {
      this.els.moldSelectedDisplay.innerHTML = `
        <div class="pa-selected-tag manual">
          <i class="fas fa-pencil-alt"></i>
          <span>手動入力 / Manual: ${e(this.state.manualMoldInput)}</span>
        </div>
      `;
    } else {
      this.els.moldSelectedDisplay.innerHTML = '';
    }
  },

  /* ========================================
     EMPLOYEE DROPDOWN LOGIC (SEARCHABLE)
     ======================================== */

  showEmployeeDropdown() {
    this.state.employeeDropdownOpen = true;
    this.els.employeeToggle.classList.add('active');
    this.filterEmployeeDropdown(this.els.employeeSearchInput.value.trim());
  },

  closeEmployeeDropdown() {
    this.state.employeeDropdownOpen = false;
    this.els.employeeToggle.classList.remove('active');
    this.els.employeeSearchResults.classList.remove('pa-visible');
  },

  toggleEmployeeDropdown() {
    if (this.state.employeeDropdownOpen) {
      this.closeEmployeeDropdown();
    } else {
      this.showEmployeeDropdown();
      this.els.employeeSearchInput.focus();
    }
  },

  filterEmployeeDropdown(query) {
    const { escapeHtml: e, createElement: ce } = PhotoAuditUtils;
    const q = query.toLowerCase();

    console.log('🔍 [PhotoAuditTool] Filtering employees:', q, 'Total:', this.state.employees.length);

    let results = this.state.employees;
    
    // Filter if query exists
    if (q) {
      results = this.state.employees.filter((emp) => {
        const name = (emp.EmployeeName || '').toLowerCase();
        const nameShort = (emp.EmployeeNameShort || '').toLowerCase();
        const division = (emp.Division || '').toLowerCase();
        
        return name.includes(q) || nameShort.includes(q) || division.includes(q);
      });
    }

    console.log('✅ [PhotoAuditTool] Filtered employees:', results.length);

    if (results.length === 0) {
      this.els.employeeSearchResults.innerHTML = `
        <div class="pa-search-empty">
          <i class="fas fa-info-circle"></i>
          <div class="empty-ja">見つかりません</div>
          <div class="empty-vi">Không tìm thấy</div>
          <div class="empty-hint">入力値を使用 / Using manual input: "${e(query)}"</div>
        </div>
      `;
      this.els.employeeSearchResults.classList.add('pa-visible');
      return;
    }

    // Render results
    this.els.employeeSearchResults.innerHTML = '';
    results.forEach((emp) => {
      const item = ce('div', { class: 'pa-search-item' });
      const name = e(emp.EmployeeNameShort || emp.EmployeeName || '');
      const division = emp.Division ? e(emp.Division) : '';

      item.innerHTML = `
        <div class="pa-search-item-main">
          <div class="pa-search-item-code">
            <i class="fas fa-user"></i> ${name}
          </div>
          ${division ? `<div class="pa-search-item-meta">${division}</div>` : ''}
        </div>
      `;

      item.addEventListener('click', () => this.selectEmployee(emp));
      this.els.employeeSearchResults.appendChild(item);
    });

    this.els.employeeSearchResults.classList.add('pa-visible');
  },

  selectEmployee(emp) {
    this.state.selectedEmployee = {
      id: emp.EmployeeID,
      name: emp.EmployeeNameShort || emp.EmployeeName,
      isManual: false
    };
    this.state.isManualEmployee = false;
    this.state.manualEmployeeInput = '';
    
    this.els.employeeSearchInput.value = this.state.selectedEmployee.name;
    this.els.employeeSearchInput.classList.remove('manual-input');
    this.els.employeeSearchInput.classList.add('auto-selected');
    
    this.closeEmployeeDropdown();
    this.updateEmployeeDisplay();
    
    console.log('✅ [PhotoAuditTool] Employee selected:', this.state.selectedEmployee);
  },

  updateEmployeeSelection(name) {
    // Manual input - create employee object
    this.state.selectedEmployee = {
      id: null,
      name: name.trim(),
      isManual: true
    };
    this.updateEmployeeDisplay();
    console.log('✅ [PhotoAuditTool] Manual employee set:', this.state.selectedEmployee);
  },

  updateEmployeeDisplay() {
    const { escapeHtml: e } = PhotoAuditUtils;
    if (!this.els.employeeSelectedDisplay) return;

    if (this.state.selectedEmployee) {
      const emp = this.state.selectedEmployee;
      const iconClass = emp.isManual ? 'fa-pencil-alt' : 'fa-check-circle';
      const tagClass = emp.isManual ? 'manual' : '';
      const prefix = emp.isManual ? '手動入力 / Manual: ' : '';

      this.els.employeeSelectedDisplay.innerHTML = `
        <div class="pa-selected-tag ${tagClass}">
          <i class="fas ${iconClass}"></i>
          <span>${prefix}${e(emp.name)}</span>
        </div>
      `;
    } else {
      this.els.employeeSelectedDisplay.innerHTML = '';
    }
  },

  /* ========================================
     DIMENSIONS AUTO-FILL
     ======================================== */

  loadDimensionsForMold(mold) {
    console.log('🔍 [PhotoAuditTool] Loading dimensions for mold:', {
      id: mold.MoldID,
      code: mold.MoldCode
    });

    let length = '', width = '', depth = '';
    let lengthSrc = null, widthSrc = null, depthSrc = null;

    // Priority 1: designInfo from enriched data
    const design = mold.designInfo;
    if (design) {
      if (design.MoldDesignLength) {
        length = String(design.MoldDesignLength);
        lengthSrc = 'molddesign';
      }
      if (design.MoldDesignWidth) {
        width = String(design.MoldDesignWidth);
        widthSrc = 'molddesign';
      }
      if (design.MoldDesignDepth || design.MoldDesignHeight) {
        depth = String(design.MoldDesignDepth || design.MoldDesignHeight);
        depthSrc = 'molddesign';
      }
    }

    // Priority 2: mold Modified fields
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

    // Priority 3: mold original fields
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

    this.state.dimensions = { length, width, depth };
    this.state.dimensionsSource = { 
      length: lengthSrc, 
      width: widthSrc, 
      depth: depthSrc 
    };
    this.updateDimensionInputs();

    console.log('📐 [PhotoAuditTool] Dimensions loaded:', {
      dimensions: this.state.dimensions,
      sources: this.state.dimensionsSource
    });
  },

  updateDimensionInputs() {
    const inputs = {
      length: this.els.dimLengthInput,
      width: this.els.dimWidthInput,
      depth: this.els.dimDepthInput
    };

    Object.keys(inputs).forEach((key) => {
      const input = inputs[key];
      const value = this.state.dimensions[key];
      const source = this.state.dimensionsSource[key];

      input.value = value;
      input.classList.remove('auto-filled', 'manual-edit');
      if (source === 'molddesign' || source === 'molds') {
        input.classList.add('auto-filled');
      }
    });
  },

  clearDimensionInputs() {
    this.state.dimensions = { length: '', width: '', depth: '' };
    this.state.dimensionsSource = { length: null, width: null, depth: null };
    
    [this.els.dimLengthInput, this.els.dimWidthInput, this.els.dimDepthInput].forEach(
      (input) => {
        input.value = '';
        input.classList.remove('auto-filled', 'manual-edit');
      }
    );
  },

  /* ========================================
     RECIPIENTS MANAGEMENT
     ======================================== */

  addRecipient() {
    const email = this.els.recipientInput.value.trim();
    if (!email) return;

    if (!PhotoAuditUtils.isValidEmail(email)) {
      this.toast('無効なメールアドレス / Invalid email address', 'error');
      return;
    }

    if (this.state.recipients.includes(email)) {
      this.toast('既に追加済み / Already added', 'error');
      return;
    }

    this.state.recipients.push(email);
    this.els.recipientInput.value = '';
    this.renderRecipients();
    this.toast('追加しました / Recipient added', 'success');
  },

  removeRecipient(email) {
    this.state.recipients = this.state.recipients.filter((e) => e !== email);
    this.renderRecipients();
    this.toast('削除しました / Recipient removed', 'info');
  },

  renderRecipients() {
    const { escapeHtml: e, createElement: ce } = PhotoAuditUtils;
    if (!this.els.recipientsContainer) return;

    this.els.recipientsContainer.innerHTML = '';
    this.state.recipients.forEach((email) => {
      const tag = ce('div', { class: 'pa-recipient-tag' });
      tag.innerHTML = `
        <span>${e(email)}</span>
        <button class="pa-recipient-remove" data-email="${e(email)}">
          <i class="fas fa-times"></i>
        </button>
      `;

      tag.querySelector('.pa-recipient-remove').addEventListener('click', () => {
        this.removeRecipient(email);
      });

      this.els.recipientsContainer.appendChild(tag);
    });
  },

  /* ========================================
     VALIDATION & OPEN CAMERA/FILE
     ======================================== */

  validateSettings() {
    console.log('✅ [PhotoAuditTool] Validating settings...', {
      selectedMold: this.state.selectedMold?.MoldCode,
      isManualMold: this.state.isManualMold,
      manualMoldInput: this.state.manualMoldInput,
      selectedEmployee: this.state.selectedEmployee,
      recipients: this.state.recipients.length
    });

    // Check mold - accept manual input
    if (!this.state.selectedMold && !this.state.manualMoldInput) {
      this.toast('型を選択または入力してください / Please select or enter mold', 'error');
      return false;
    }

    // Check employee - accept manual input
    if (!this.state.selectedEmployee || !this.state.selectedEmployee.name) {
      this.toast('従業員を選択または入力してください / Please select or enter employee', 'error');
      return false;
    }

    // Check recipients
    if (this.state.recipients.length === 0) {
      this.toast('受取人を追加してください / Please add recipients', 'error');
      return false;
    }

    console.log('✅ [PhotoAuditTool] Validation passed!');
    return true;
  },

  validateAndOpenCamera() {
    if (!this.validateSettings()) return;
    this.closeSettings();
    this.openCamera();
  },

  openFilePicker() {
    if (!this.validateSettings()) return;

    if (!this.els.fileInput) {
      const input = PhotoAuditUtils.createElement('input', {
        type: 'file',
        accept: 'image/*',
        class: 'pa-file-input'
      });
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileSelect(file);
      });
      document.body.appendChild(input);
      this.els.fileInput = input;
    }

    this.els.fileInput.click();
  },

  async handleFileSelect(file) {
    console.log('📸 [PhotoAuditTool] File selected:', {
      name: file.name,
      size: file.size
    });

    try {
      if (!file.type.startsWith('image')) {
        this.toast('画像ファイルを選択してください / Please select image file', 'error');
        return;
      }

      if (file.size > PHOTO_AUDIT_CONFIG.IMAGE_MAX_SIZE) {
        this.toast('ファイルが大きすぎます / File too large (max 10MB)', 'error');
        return;
      }

      this.state.photoBlob = file;
      this.state.photoSource = 'file';
      
      // FIX: Use setTimeout to prevent auto-close
      setTimeout(() => {
        this.closeSettings();
        setTimeout(() => {
          this.openCamera(true); // Preview mode
        }, 100);
      }, 100);
      
    } catch (error) {
      console.error('❌ [PhotoAuditTool] File select error:', error);
      this.toast('ファイル読み込みエラー / File read error', 'error');
    }
  },


  /* ========================================
     OPEN/CLOSE SETTINGS
     ======================================== */

  openSettings(preFillData = null) {
    if (!this.state.initialized) {
      this.init();
    }

    console.log('🔧 [PhotoAuditTool] Opening settings...', { preFillData });

    this.resetState();

    // Pre-fill mold data if provided (from MobileDetailModal)
    if (preFillData?.mold) {
      this.preFillMoldData(preFillData.mold);
    }

    this.state.currentScreen = 'settings';
    this.els.settingsOverlay.classList.remove('pa-hidden');

    // Reset scroll
    if (this.els.settingsBody) {
      this.els.settingsBody.scrollTop = 0;
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // ADD THIS: Auto-focus on mold search after a short delay
    setTimeout(() => {
      if (this.els.moldSearchInput) {
        this.els.moldSearchInput.focus();
      }
    }, 300);
  },

  closeSettings() {
    this.els.settingsOverlay.classList.add('pa-hidden');
    this.state.currentScreen = null;
    document.body.style.overflow = '';
  },

  resetState() {
    this.state.selectedMold = null;
    this.state.isManualMold = false;
    this.state.manualMoldInput = '';
    this.state.dimensions = { length: '', width: '', depth: '' };
    this.state.dimensionsSource = { length: null, width: null, depth: null };
    this.state.photoBlob = null;
    this.state.photoSource = null;

    if (this.els.moldSearchInput) {
      this.els.moldSearchInput.value = '';
      this.els.moldSearchInput.classList.remove('manual-input', 'auto-selected');
    }
    this.clearDimensionInputs();
    this.updateMoldDisplay();

    // Reset to default employee
    const defaultEmp = this.state.employees.find(
      (e) => String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
    );
    
    console.log('🔍 [PhotoAuditTool] Finding default employee:', {
      defaultId: PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID,
      found: defaultEmp,
      totalEmployees: this.state.employees.length
    });

    if (defaultEmp) {
      this.state.selectedEmployee = {
        id: defaultEmp.EmployeeID,
        name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName,
        isManual: false
      };
      this.state.isManualEmployee = false;
      this.state.manualEmployeeInput = '';
      
      if (this.els.employeeSearchInput) {
        this.els.employeeSearchInput.value = this.state.selectedEmployee.name;
        this.els.employeeSearchInput.classList.remove('manual-input');
        this.els.employeeSearchInput.classList.add('auto-selected');
      }
      this.updateEmployeeDisplay();
      console.log('✅ [PhotoAuditTool] Default employee set:', this.state.selectedEmployee);
    } else {
      console.warn('⚠️ [PhotoAuditTool] Default employee not found');
      this.state.selectedEmployee = null;
      this.state.isManualEmployee = false;
      this.state.manualEmployeeInput = '';
      
      if (this.els.employeeSearchInput) {
        this.els.employeeSearchInput.value = '';
        this.els.employeeSearchInput.classList.remove('manual-input', 'auto-selected');
      }
      this.updateEmployeeDisplay();
    }

    // Reset recipients to default
    this.state.recipients = [...PHOTO_AUDIT_CONFIG.DEFAULT_RECIPIENTS];
    this.renderRecipients();
    
    console.log('✅ [PhotoAuditTool] State reset complete');
  },

  preFillMoldData(mold) {
    console.log('🎯 [PhotoAuditTool] Pre-filling mold data:', {
      code: mold.MoldCode,
      id: mold.MoldID
    });

    this.state.selectedMold = mold;
    this.state.isManualMold = false;
    this.state.manualMoldInput = '';

    if (this.els.moldSearchInput) {
      this.els.moldSearchInput.value = `${mold.MoldCode || ''} - ${mold.MoldName || ''}`;
      this.els.moldSearchInput.classList.remove('manual-input');
      this.els.moldSearchInput.classList.add('auto-selected');
    }

    this.loadDimensionsForMold(mold);
    this.updateMoldDisplay();
  },

  /* ========================================
     BUILD CAMERA SCREEN
     ======================================== */

  buildCameraScreen() {
    const { createElement: ce } = PhotoAuditUtils;

    // Overlay
    const overlay = ce('div', {
      class: 'photo-audit-camera-overlay pa-hidden',
      id: 'photo-audit-camera-overlay'
    });

    // Camera Container
    const camera = ce('div', { class: 'photo-audit-camera' });

    // Header
    const header = ce('div', { class: 'pa-camera-header' });
    header.innerHTML = `
      <div class="pa-camera-status" id="pa-camera-status">
        <i class="fas fa-circle"></i>
        <span>Camera active</span>
      </div>
      <button class="pa-btn-camera-close" id="pa-camera-close" title="Close">
        <i class="fas fa-times"></i>
      </button>
    `;

    // View
    const view = ce('div', { class: 'pa-camera-view' });
    view.innerHTML = `
      <video class="pa-camera-video" id="pa-camera-video" autoplay playsinline muted></video>
      <canvas class="pa-camera-canvas" id="pa-camera-canvas"></canvas>
      <img class="pa-camera-preview-img" id="pa-camera-preview" alt="Preview">
      <div class="pa-camera-grid" id="pa-camera-grid">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <line class="pa-grid-line" x1="33.33" y1="0" x2="33.33" y2="100"></line>
          <line class="pa-grid-line" x1="66.67" y1="0" x2="66.67" y2="100"></line>
          <line class="pa-grid-line" x1="0" y1="33.33" x2="100" y2="33.33"></line>
          <line class="pa-grid-line" x1="0" y1="66.67" x2="100" y2="66.67"></line>
        </svg>
      </div>
      <div class="pa-camera-loading" id="pa-camera-loading">
        <div class="pa-camera-loading-spinner"></div>
        <div class="pa-camera-loading-text">カメラ起動中... / Loading camera...</div>
      </div>
      <div class="pa-camera-error" id="pa-camera-error">
        <i class="fas fa-exclamation-triangle"></i>
        <div class="pa-camera-error-title">Camera Error</div>
        <div class="pa-camera-error-message">カメラにアクセスできません / Cannot access camera</div>
      </div>
    `;

    // Controls
    const controls = ce('div', { class: 'pa-camera-controls' });
    controls.innerHTML = `
      <button class="pa-btn-grid-toggle" id="pa-btn-grid" title="Grid">
        <i class="fas fa-border-all"></i>
      </button>
      <button class="pa-btn-capture" id="pa-btn-capture" title="Capture">
        <i class="fas fa-camera"></i>
      </button>
      <button class="pa-btn-flip" id="pa-btn-flip" title="Flip">
        <i class="fas fa-sync-alt"></i>
      </button>
    `;

    // Preview Controls
    const previewControls = ce('div', { class: 'pa-preview-controls' });
    previewControls.innerHTML = `
      <div class="pa-preview-info">
        <div class="pa-preview-info-item">
          <i class="fas fa-cube"></i>
          <span id="pa-preview-mold">-</span>
        </div>
        <div class="pa-preview-info-item">
          <i class="fas fa-user"></i>
          <span id="pa-preview-employee">-</span>
        </div>
      </div>
      <div class="pa-preview-actions">
        <button class="pa-btn-preview pa-btn-retake" id="pa-btn-retake">
          <i class="fas fa-redo"></i> 
          <span class="btn-label-ja">再撮影</span>
          <span class="btn-label-vi">Chụp lại</span>
        </button>
        <button class="pa-btn-preview pa-btn-save-photo" id="pa-btn-save">
          <i class="fas fa-download"></i> 
          <span class="btn-label-ja">保存</span>
          <span class="btn-label-vi">Lưu</span>
        </button>
        <button class="pa-btn-preview pa-btn-send" id="pa-btn-send">
          <i class="fas fa-paper-plane"></i> 
          <span class="btn-label-ja">送信</span>
          <span class="btn-label-vi">Gửi</span>
        </button>
      </div>
    `;

    // Assemble
    camera.appendChild(header);
    camera.appendChild(view);
    camera.appendChild(controls);
    camera.appendChild(previewControls);
    overlay.appendChild(camera);
    document.body.appendChild(overlay);

    // Cache elements
    this.els.cameraOverlay = overlay;
    this.els.cameraVideo = PhotoAuditUtils.$('#pa-camera-video', overlay);
    this.els.cameraCanvas = PhotoAuditUtils.$('#pa-camera-canvas', overlay);
    this.els.cameraPreview = PhotoAuditUtils.$('#pa-camera-preview', overlay);
    this.els.cameraStatus = PhotoAuditUtils.$('#pa-camera-status', overlay);
    this.els.cameraGrid = PhotoAuditUtils.$('#pa-camera-grid', overlay);
    this.els.cameraLoading = PhotoAuditUtils.$('#pa-camera-loading', overlay);
    this.els.cameraError = PhotoAuditUtils.$('#pa-camera-error', overlay);
    this.els.btnCameraClose = PhotoAuditUtils.$('#pa-camera-close', overlay);
    this.els.btnCapture = PhotoAuditUtils.$('#pa-btn-capture', overlay);
    this.els.btnFlip = PhotoAuditUtils.$('#pa-btn-flip', overlay);
    this.els.btnGrid = PhotoAuditUtils.$('#pa-btn-grid', overlay);
    this.els.previewControls = previewControls;
    this.els.btnRetake = PhotoAuditUtils.$('#pa-btn-retake', overlay);
    this.els.btnSave = PhotoAuditUtils.$('#pa-btn-save', overlay);
    this.els.btnSend = PhotoAuditUtils.$('#pa-btn-send', overlay);
    this.els.previewMold = PhotoAuditUtils.$('#pa-preview-mold', overlay);
    this.els.previewEmployee = PhotoAuditUtils.$('#pa-preview-employee', overlay);

    // Bind events
    this.bindCameraEvents();
  },

  /* ========================================
     BIND CAMERA EVENTS
     ======================================== */

  bindCameraEvents() {
    this.els.btnCameraClose.addEventListener('click', () => this.closeCamera());
    this.els.btnCapture.addEventListener('click', () => this.capturePhoto());
    this.els.btnFlip.addEventListener('click', () => this.flipCamera());
    this.els.btnGrid.addEventListener('click', () => this.toggleGrid());
    this.els.btnRetake.addEventListener('click', () => this.retakePhoto());
    this.els.btnSave.addEventListener('click', () => this.savePhotoToDevice());
    this.els.btnSend.addEventListener('click', () => this.sendPhotoAudit());
  },

  /* ========================================
     CAMERA LOGIC
     ======================================== */

  async openCamera(previewMode = false) {
    if (!this.state.initialized) {
      this.init();
    }

    console.log('📷 [PhotoAuditTool] Opening camera...', { previewMode });

    this.state.currentScreen = 'camera';
    this.els.cameraOverlay.classList.remove('pa-hidden');

    if (previewMode) {
      await this.showPreview();
    } else {
      await this.startCamera();
      this.els.btnCapture.style.display = 'flex';
      this.els.btnFlip.style.display = 'flex';
      this.els.btnGrid.style.display = 'flex';
      this.els.previewControls.classList.remove('pa-visible');
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  },

  async closeCamera() {
    await this.stopCamera();
    this.els.cameraOverlay.classList.add('pa-hidden');
    this.state.currentScreen = null;
    document.body.style.overflow = '';
    
    // Clear preview
    this.els.cameraPreview.src = '';
    this.els.cameraPreview.classList.remove('pa-visible');
    this.els.cameraVideo.style.display = 'block';
    
    console.log('📷 [PhotoAuditTool] Camera closed');
  },

  async startCamera() {
    await this.stopCamera();

    this.els.cameraLoading.classList.add('active');
    this.els.cameraError.classList.remove('active');

    const constraints = {
      audio: false,
      video: {
        facingMode: this.state.facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.state.stream = stream;
      this.els.cameraVideo.srcObject = stream;
      this.els.cameraVideo.setAttribute('playsinline', '');
      this.els.cameraVideo.setAttribute('webkit-playsinline', '');
      this.els.cameraVideo.muted = true;
      this.els.cameraVideo.autoplay = true;
      
      await this.els.cameraVideo.play();
      
      this.els.cameraLoading.classList.remove('active');
      this.els.cameraStatus.innerHTML = '<i class="fas fa-circle"></i><span>Camera active</span>';
      this.els.cameraStatus.classList.remove('error');
      
      console.log('✅ [PhotoAuditTool] Camera started successfully');
    } catch (error) {
      console.error('❌ [PhotoAuditTool] Camera error:', error);
      this.els.cameraLoading.classList.remove('active');
      this.els.cameraError.classList.add('active');
      this.els.cameraStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Camera error</span>';
      this.els.cameraStatus.classList.add('error');
      this.toast('カメラアクセス失敗 / Camera access failed', 'error');
    }
  },

  async stopCamera() {
    if (this.state.stream) {
      this.state.stream.getTracks().forEach((track) => track.stop());
      this.state.stream = null;
    }
    if (this.els.cameraVideo) {
      this.els.cameraVideo.srcObject = null;
    }
  },

  async flipCamera() {
    const current = this.state.facingMode;
    const next = current === 'environment' ? 'user' : 'environment';
    this.state.facingMode = next;
    await this.startCamera();
    this.toast('カメラ反転 / Camera flipped', 'info');
  },

  toggleGrid() {
    this.state.gridEnabled = !this.state.gridEnabled;
    if (this.state.gridEnabled) {
      this.els.cameraGrid.classList.add('active');
      this.els.btnGrid.classList.add('active');
    } else {
      this.els.cameraGrid.classList.remove('active');
      this.els.btnGrid.classList.remove('active');
    }
  },

  async capturePhoto() {
    if (!this.state.stream) {
      this.toast('カメラ未起動 / Camera not active', 'error');
      return;
    }

    const video = this.els.cameraVideo;
    const canvas = this.els.cameraCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        this.toast('撮影失敗 / Capture failed', 'error');
        return;
      }

      // Resize to HD (1920x1080)
      const resizedBlob = await this.resizeImageToHD(blob);
      this.state.photoBlob = resizedBlob;
      this.state.photoSource = 'camera';

      await this.showPreview();
      this.toast('撮影完了 / Photo captured', 'success');
    }, 'image/jpeg', PHOTO_AUDIT_CONFIG.IMAGE_QUALITY);
  },

  async resizeImageToHD(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const targetWidth = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH;
        const targetHeight = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Calculate scaling to cover (crop to fit)
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgRatio > targetRatio) {
          // Image is wider
          drawHeight = targetHeight;
          drawWidth = drawHeight * imgRatio;
          offsetX = (targetWidth - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Image is taller
          drawWidth = targetWidth;
          drawHeight = drawWidth / imgRatio;
          offsetX = 0;
          offsetY = (targetHeight - drawHeight) / 2;
        }

        // Fill black background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Draw image (cropped to fit)
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        canvas.toBlob(
          (resizedBlob) => resolve(resizedBlob),
          'image/jpeg',
          PHOTO_AUDIT_CONFIG.IMAGE_QUALITY
        );
      };
      img.src = URL.createObjectURL(blob);
    });
  },

  async showPreview() {
    await this.stopCamera();

    const url = URL.createObjectURL(this.state.photoBlob);
    this.els.cameraPreview.src = url;
    this.els.cameraPreview.classList.add('pa-visible');
    this.els.cameraVideo.style.display = 'none';

    // Hide capture controls
    this.els.btnCapture.style.display = 'none';
    this.els.btnFlip.style.display = 'none';
    this.els.btnGrid.style.display = 'none';

    // Show preview controls
    this.els.previewControls.classList.add('pa-visible');

    // Update status
    this.els.cameraStatus.innerHTML = '<i class="fas fa-check-circle"></i><span>写真プレビュー / Photo preview</span>';

    // Update preview info
    const moldCode = this.state.selectedMold?.MoldCode || this.state.manualMoldInput || 'Manual';
    const moldName = this.state.selectedMold?.MoldName || '';
    const displayMold = moldName ? `${moldCode} - ${moldName}` : moldCode;
    const employeeName = this.state.selectedEmployee?.name || 'Manual';

    if (this.els.previewMold) {
      this.els.previewMold.textContent = displayMold;
    }
    if (this.els.previewEmployee) {
      this.els.previewEmployee.textContent = employeeName;
    }

  },

  async retakePhoto() {
    this.els.cameraPreview.src = '';
    this.els.cameraPreview.classList.remove('pa-visible');
    this.els.cameraVideo.style.display = 'block';
    this.state.photoBlob = null;

    // Show capture controls
    this.els.btnCapture.style.display = 'flex';
    this.els.btnFlip.style.display = 'flex';
    this.els.btnGrid.style.display = 'flex';

    // Hide preview controls
    this.els.previewControls.classList.remove('pa-visible');

    await this.startCamera();
  },

  async savePhotoToDevice() {
    if (!this.state.photoBlob) {
      this.toast('写真がありません / No photo', 'error');
      return;
    }

    try {
      const url = URL.createObjectURL(this.state.photoBlob);
      const a = document.createElement('a');
      a.href = url;

      const moldCode = this.state.selectedMold?.MoldCode || this.state.manualMoldInput || 'photo';
      const date = PhotoAuditUtils.formatDateJP();
      a.download = `${moldCode}_${date}.jpg`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.toast('保存しました / Saved to device', 'success');
    } catch (error) {
      console.error('❌ [PhotoAuditTool] Save photo error:', error);
      this.toast('保存失敗 / Save failed', 'error');
    }
  },

  /* ========================================
     SEND PHOTO AUDIT
     ======================================== */

  async sendPhotoAudit() {
    if (!this.state.photoBlob) {
      this.toast('写真がありません / No photo', 'error');
      return;
    }

    if (this.state.sending) return;

    this.state.sending = true;
    this.els.btnSend.disabled = true;
    this.els.btnSend.innerHTML = '<span class="pa-loading-spinner"></span> 送信中... / Sending...';

    try {
      // 1. Prepare filename
      const moldCode = this.state.selectedMold?.MoldCode || this.state.manualMoldInput || 'manual';
      const timestamp = Date.now();
      const fileName = `${moldCode}_${timestamp}.jpg`;

      console.log('📤 [PhotoAuditTool] Uploading photo:', fileName);

      // 2. Upload to Supabase Storage
      await SupabasePhotoClient.uploadFile(
        PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
        fileName,
        this.state.photoBlob
      );

      const photoUrl = SupabasePhotoClient.getPublicUrl(
        PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
        fileName
      );

      console.log('✅ [PhotoAuditTool] Photo uploaded:', photoUrl);

      // 3. Prepare email payload
      const payload = this.buildEmailPayload(fileName, photoUrl);

      console.log('📧 [PhotoAuditTool] Sending email with payload:', payload);

      // 4. Send email via Edge Function
      const result = await SupabasePhotoClient.callEdgeFunction('send-photo-audit', payload);

      console.log('✅ [PhotoAuditTool] Email sent successfully:', result);

      // 5. Dispatch event for other modules (optional)
      if (this.state.selectedMold) {
        document.dispatchEvent(new CustomEvent('photoAudit:completed', {
          detail: {
            moldId: this.state.selectedMold.MoldID,
            moldCode: moldCode,
            employeeName: this.state.selectedEmployee.name,
            employeeId: this.state.selectedEmployee.id,
            photoUrl: photoUrl,
            timestamp: PhotoAuditUtils.nowISO()
          }
        }));
      }

      this.toast('メール送信完了 / Email sent successfully', 'success');

      // 6. Close camera after delay
      setTimeout(() => {
        this.closeCamera();
      }, 1500);

    } catch (error) {
      console.error('❌ [PhotoAuditTool] Send failed:', error);
      this.toast(`送信失敗 / Send failed: ${error.message}`, 'error');
      this.els.btnSend.disabled = false;
      this.els.btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> <span class="btn-label-ja">送信</span> <span class="btn-label-vi">Gửi</span>';
    } finally {
      this.state.sending = false;
    }
  },

  buildEmailPayload(fileName, photoUrl) {
    const mold = this.state.selectedMold;
    const employee = this.state.selectedEmployee;
    const dims = this.state.dimensions;

    // Build email subject (Japanese + Vietnamese)
    const moldCode = mold?.MoldCode || this.state.manualMoldInput || 'Manual';
    const date = PhotoAuditUtils.formatDateJP();
    const subject = `【型写真監査】${moldCode} - ${date} / Photo Audit: ${moldCode}`;

    // Build email body (HTML format with full metadata)
    const body = this.buildEmailBody(moldCode, mold, employee, dims, photoUrl, fileName);

    return {
      // Mold info
      moldName: mold?.MoldName || this.state.manualMoldInput || 'Manual Input',
      moldCode: moldCode,
      moldId: mold?.MoldID || null,

      // Dimensions
      dimensions: {
        length: dims.length || null,
        width: dims.width || null,
        depth: dims.depth || null
      },

      // Photo info
      photoFileName: fileName,
      photoUrl: photoUrl,

      // Employee info
      employee: employee.name,
      employeeId: employee.id || null,

      // Date
      date: PhotoAuditUtils.formatDateJP(),
      datetime: PhotoAuditUtils.formatDateTime(),
      timestamp: PhotoAuditUtils.nowISO(),

      // Recipients
      recipients: this.state.recipients,
      fromEmail: 'noreply@molddesign.co.jp',

      // Email content
      subject: subject,
      body: body
    };
  },

  buildEmailBody(moldCode, mold, employee, dims, photoUrl, fileName) {
    const datetime = PhotoAuditUtils.formatDateTime();
    const { escapeHtml: e } = PhotoAuditUtils;

    // Extract additional mold info
    const moldName = mold?.MoldName || 'N/A';
    const moldId = mold?.MoldID || 'N/A';
    const rackLocation = mold?.displayRackLocation || 'N/A';
    const customer = mold?.displayCustomer || 'N/A';
    const designCode = mold?.designInfo?.MoldDesignCode || 'N/A';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f9fafb; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; background: white; }
    .header { background: linear-gradient(135deg, #6a5acd 0%, #5847b8 100%); color: white; padding: 30px 20px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
    .section { background: #f9fafb; padding: 20px; margin-bottom: 15px; border-radius: 8px; border-left: 4px solid #6a5acd; }
    .section-title { font-weight: 600; color: #6a5acd; margin-bottom: 12px; font-size: 18px; display: flex; align-items: center; gap: 8px; }
    .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-weight: 600; min-width: 200px; color: #6b7280; }
    .info-value { flex: 1; color: #111827; }
    .photo-container { text-align: center; margin: 30px 0; }
    .photo-container img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .btn { display: inline-block; padding: 14px 28px; background: #6a5acd; color: white; text-decoration: none; border-radius: 6px; margin: 15px 0; font-weight: 600; }
    .btn:hover { background: #5847b8; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .tag { display: inline-block; padding: 4px 12px; background: #fef3c7; color: #d97706; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>📷 型写真監査 / Mold Photo Audit</h1>
      <p>${e(datetime)} - 写真検査レポート / Photo Inspection Report</p>
    </div>

    <!-- Mold Information -->
    <div class="section">
      <div class="section-title">🔧 型情報 / Mold Information</div>
      <div class="info-row">
        <div class="info-label">Mold Code / 型コード:</div>
        <div class="info-value"><strong>${e(moldCode)}</strong></div>
      </div>
      <div class="info-row">
        <div class="info-label">Mold Name / 型名:</div>
        <div class="info-value">${e(moldName)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Mold ID:</div>
        <div class="info-value">${e(String(moldId))}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Design Code / 設計コード:</div>
        <div class="info-value">${e(designCode)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Customer / 顧客:</div>
        <div class="info-value">${e(customer)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Location / 保管位置:</div>
        <div class="info-value">${e(rackLocation)}</div>
      </div>
    </div>

    <!-- Dimensions -->
    <div class="section">
      <div class="section-title">📏 寸法 / Dimensions</div>
      <div class="info-row">
        <div class="info-label">Length (L) / 長さ:</div>
        <div class="info-value">${dims.length ? e(dims.length) + ' mm' : 'N/A'}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Width (W) / 幅:</div>
        <div class="info-value">${dims.width ? e(dims.width) + ' mm' : 'N/A'}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Height (H) / 高さ:</div>
        <div class="info-value">${dims.depth ? e(dims.depth) + ' mm' : 'N/A'}</div>
      </div>
    </div>

    <!-- Audit Information -->
    <div class="section">
      <div class="section-title">👤 監査情報 / Audit Information</div>
      <div class="info-row">
        <div class="info-label">Inspector / 検査者:</div>
        <div class="info-value">
          <strong>${e(employee.name)}</strong>
          ${employee.isManual ? '<span class="tag">手動入力 / Manual</span>' : ''}
        </div>
      </div>
      <div class="info-row">
        <div class="info-label">Date/Time / 日時:</div>
        <div class="info-value">${e(datetime)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Photo Source / 写真元:</div>
        <div class="info-value">${this.state.photoSource === 'camera' ? 'Camera / カメラ撮影' : 'File Upload / ファイル'}</div>
      </div>
    </div>

    <!-- Photo -->
    <div class="photo-container">
      <img src="${photoUrl}" alt="Mold Photo">
      <p style="margin-top: 15px;">
        <a href="${photoUrl}" class="btn" target="_blank">🔍 フルサイズで表示 / View Full Size</a>
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>このメールは自動送信されています / This email is automatically generated</p>
      <p><strong>YSD Mold Management System v2.0.1</strong></p>
      <p>&copy; ${new Date().getFullYear()} Mold Design Co., Ltd.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  },

  /* ========================================
     TOAST NOTIFICATIONS
     ======================================== */

  toast(message, type = 'info') {
    let toast = document.getElementById('photo-audit-toast');
    if (!toast) {
      toast = PhotoAuditUtils.createElement('div', {
        id: 'photo-audit-toast',
        class: 'pa-toast'
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `pa-toast ${type}`;
    toast.classList.add('pa-visible');

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('pa-visible');
    }, PHOTO_AUDIT_CONFIG.TOAST_DURATION);
  },

  /* ========================================
     GLOBAL HOOKS
     ======================================== */

  bindGlobalHooks() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state.currentScreen === 'camera') {
          this.closeCamera();
        } else if (this.state.currentScreen === 'settings') {
          this.closeSettings();
        }
      }
    });

    // Listen for custom event to open PhotoAuditTool
    document.addEventListener('photoAuditTool:open', (e) => {
      this.openSettings(e.detail);
    });

    // Listen for navbar button click
    const navPhotoBtn = document.getElementById('nav-photo-audit-btn');
    if (navPhotoBtn) {
      navPhotoBtn.addEventListener('click', () => {
        console.log('📷 [PhotoAuditTool] Navbar button clicked');
        this.openSettings();
      });
    }

    console.log('✅ [PhotoAuditTool] Global hooks bound');
  }
};

/* ========================================
   AUTO-INITIALIZATION
   ======================================== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      PhotoAuditTool.init();
    } catch (e) {
      console.error('❌ [PhotoAuditTool] Init error:', e);
    }
  }, { once: true });
} else {
  try {
    PhotoAuditTool.init();
  } catch (e) {
    console.error('❌ [PhotoAuditTool] Init error:', e);
  }
}

// Expose globally
window.PhotoAuditTool = PhotoAuditTool;

console.log('📦 [PhotoAuditTool v2.0.1] Module loaded');
