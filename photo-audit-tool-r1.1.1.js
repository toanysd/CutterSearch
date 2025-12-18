/* ================================================
   📸 PHOTO AUDIT TOOL - R1.1.1
   写真監査ツール / Photo Audit Tool
   
   FIXED ISSUES:
   - Safari address bar covering buttons (viewport CSS)
   - Mold search not working (use DataManager)
   - Employee dropdown not working (use DataManager)
   - Dimensions not auto-filling (load from designInfo)
   - Real-time dropdown for mold/employee search
   - Manual employee input support
   
   Created: 2025-12-18
   Last Updated: 2025-12-18
   ================================================ */

(function () {
  'use strict';

  // ==========================================
  // CONSTANTS
  // ==========================================
  
  const STORAGE_BUCKET = 'mold-photos';
  const DEFAULT_EMPLOYEE_ID = '4'; // 入江 Irie-san
  
  // ==========================================
  // UTILITIES
  // ==========================================
  
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  
  const createEl = (tag, attrs = {}, innerHTML = '') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v);
    });
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  };
  
  const escapeHtml = str => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  const formatDateJP = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };
  
  const nowISO = () => new Date().toISOString();
  
  // Debounce for search input
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // ==========================================
  // SUPABASE CLIENT (Minimal)
  // ==========================================
  
  const supabaseClient = {
    config: {
      url: 'https://fghxlprksqlvpmnldxps.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaHhscHJrc3FsdnBtbmxkeHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzMTMzMDIsImV4cCI6MjA0OTg4OTMwMn0.q7IXM5v7lR8KqtSitraNfZwkn5ZLdBZDLHwqp2jpUhs'
    },
    
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
    
    getPublicUrl(bucket, fileName) {
      return `${this.config.url}/storage/v1/object/public/${bucket}/${fileName}`;
    },
    
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

  // ==========================================
  // MAIN PHOTO AUDIT TOOL
  // ==========================================
  
  const PhotoAuditTool = {
    state: {
      initialized: false,
      molds: [],
      molddesigns: [],
      employees: [],
      
      // Search results
      moldSearchResults: [],
      employeeSearchResults: [],
      
      // Selection
      selectedMold: null,
      isManualMold: false,
      manualMoldName: '',
      
      selectedEmployee: null,
      isManualEmployee: false,
      manualEmployeeName: '',
      
      // Dimensions
      dimensions: { length: '', width: '', depth: '' },
      dimensionsSource: { length: null, width: null, depth: null },
      
      // Recipients
      recipients: [],
      
      // Camera
      stream: null,
      facingMode: 'environment',
      gridEnabled: false,
      
      // Photo
      photoBlob: null,
      photoSource: null,
      
      // UI
      currentScreen: null,
      sending: false
    },
    
    els: {},

    // ==========================================
    // INIT
    // ==========================================
    
    init() {
      if (this.state.initialized) return;
      
      console.log('[PhotoAuditTool] Initializing v1.1.1...');
      
      // Wait for DataManager
      if (!window.DataManager || !window.DataManager.loaded) {
        console.warn('[PhotoAuditTool] DataManager not ready, waiting...');
        document.addEventListener('data-manager:ready', () => {
          this.init();
        }, { once: true });
        return;
      }
      
      this._loadData();
      this._buildUI();
      this._bindGlobalHooks();
      
      this.state.initialized = true;
      
      console.log('[PhotoAuditTool] Initialized successfully!', {
        molds: this.state.molds.length,
        employees: this.state.employees.length,
        molddesigns: this.state.molddesigns.length
      });
      
      document.dispatchEvent(new CustomEvent('photoAuditTool:ready', {
        detail: { version: '1.1.1' }
      }));
    },

    // ==========================================
    // LOAD DATA FROM DATAMANAGER
    // ==========================================
    
    _loadData() {
      const dm = window.DataManager.data;
      
      // Load molds (enriched data with designInfo)
      this.state.molds = dm.molds || [];
      
      // Load molddesigns
      this.state.molddesigns = dm.molddesign || [];
      
      // Load employees
      this.state.employees = dm.employees || [];
      
      // Set default employee
      const defaultEmp = this.state.employees.find(e => e.EmployeeID == DEFAULT_EMPLOYEE_ID);
      if (defaultEmp) {
        this.state.selectedEmployee = {
          id: defaultEmp.EmployeeID,
          name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName,
          isManual: false
        };
      }
      
      console.log('[PhotoAuditTool] Data loaded:', {
        molds: this.state.molds.length,
        molddesigns: this.state.molddesigns.length,
        employees: this.state.employees.length,
        defaultEmployee: this.state.selectedEmployee
      });
    },

    // ==========================================
    // BUILD UI
    // ==========================================
    
    _buildUI() {
      this._buildSettingsScreen();
      this._buildCameraScreen();
    },

    _buildSettingsScreen() {
      const overlay = createEl('div', { 
        class: 'photo-audit-overlay pa-hidden', 
        id: 'photo-audit-overlay' 
      });
      
      const modal = createEl('div', { class: 'photo-audit-modal' });
      
      // Header
      const header = createEl('div', { class: 'pa-header' });
      header.innerHTML = `
        <h2 class="pa-title">
          <i class="fas fa-camera"></i>
          <span class="title-ja">写真監査</span>
          <span class="title-vi">Photo Audit</span>
        </h2>
        <button class="pa-btn-close" id="pa-btn-close" title="閉じる / Close">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      // Body with safe area insets for iOS
      const body = createEl('div', { class: 'pa-body' });
      body.innerHTML = `
        <!-- Section 1: Mold Selection -->
        <div class="pa-section">
          <label class="pa-label">
            <i class="fas fa-cube"></i>
            <span class="label-ja">金型</span>
            <span class="label-vi">Khuôn / Mold</span>
            <span class="required">*</span>
          </label>
          <div class="pa-search-wrapper">
            <input 
              type="text" 
              class="pa-input pa-search-input" 
              id="pa-mold-search-input"
              placeholder="金型コードまたは名前 / Mã hoặc tên khuôn..."
              autocomplete="off"
            />
            <i class="fas fa-search pa-search-icon"></i>
            <div class="pa-search-results" id="pa-mold-search-results"></div>
          </div>
          <div class="pa-selected-mold" id="pa-selected-mold"></div>
        </div>

        <!-- Section 2: Dimensions -->
        <div class="pa-section">
          <label class="pa-label">
            <i class="fas fa-ruler-combined"></i>
            <span class="label-ja">寸法 (L×W×H)</span>
            <span class="label-vi">Kích thước</span>
          </label>
          <div class="pa-dimensions-grid">
            <div class="pa-dim-input-wrapper">
              <label class="pa-dim-label">L (mm)</label>
              <input type="number" class="pa-input pa-dim-input" id="pa-dim-length" placeholder="長さ / Dài" step="0.1">
            </div>
            <div class="pa-dim-input-wrapper">
              <label class="pa-dim-label">W (mm)</label>
              <input type="number" class="pa-input pa-dim-input" id="pa-dim-width" placeholder="幅 / Rộng" step="0.1">
            </div>
            <div class="pa-dim-input-wrapper">
              <label class="pa-dim-label">H (mm)</label>
              <input type="number" class="pa-input pa-dim-input" id="pa-dim-depth" placeholder="高さ / Cao" step="0.1">
            </div>
          </div>
          <p class="pa-hint">
            <i class="fas fa-info-circle"></i>
            自動入力された値は編集可能 / Auto-filled values are editable
          </p>
        </div>

        <!-- Section 3: Employee -->
        <div class="pa-section">
          <label class="pa-label">
            <i class="fas fa-user"></i>
            <span class="label-ja">担当者</span>
            <span class="label-vi">Nhân viên / Employee</span>
            <span class="required">*</span>
          </label>
          <div class="pa-search-wrapper">
            <input 
              type="text" 
              class="pa-input pa-search-input" 
              id="pa-employee-search-input"
              placeholder="担当者名 / Tên nhân viên..."
              autocomplete="off"
            />
            <i class="fas fa-user-circle pa-search-icon"></i>
            <div class="pa-search-results" id="pa-employee-search-results"></div>
          </div>
          <div class="pa-selected-employee" id="pa-selected-employee"></div>
          <p class="pa-hint">
            <i class="fas fa-info-circle"></i>
            リストにない場合は手動入力可 / Manual input allowed
          </p>
        </div>

        <!-- Section 4: Email Recipients -->
        <div class="pa-section">
          <label class="pa-label">
            <i class="fas fa-envelope"></i>
            <span class="label-ja">送信先メール</span>
            <span class="label-vi">Email nhận / Recipients</span>
            <span class="required">*</span>
          </label>
          <div class="pa-recipient-input-group">
            <input 
              type="email" 
              class="pa-input pa-recipient-input" 
              id="pa-recipient-input"
              placeholder="example@company.com"
            />
            <button class="pa-btn pa-btn-add-recipient" id="pa-btn-add-recipient">
              <i class="fas fa-plus"></i>
              <span class="btn-label-ja">追加</span>
              <span class="btn-label-vi">Thêm</span>
            </button>
          </div>
          <div class="pa-recipients-container" id="pa-recipients-container"></div>
        </div>
      `;
      
      // Footer
      const footer = createEl('div', { class: 'pa-footer' });
      footer.innerHTML = `
        <button class="pa-btn pa-btn-secondary" id="pa-btn-file">
          <i class="fas fa-file-image"></i>
          <span class="btn-label-ja">ファイル選択</span>
          <span class="btn-label-vi">Chọn file</span>
        </button>
        <button class="pa-btn pa-btn-primary" id="pa-btn-camera">
          <i class="fas fa-camera"></i>
          <span class="btn-label-ja">カメラ撮影</span>
          <span class="btn-label-vi">Chụp ảnh</span>
        </button>
      `;
      
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // Cache elements
      this.els.settingsOverlay = overlay;
      this.els.settingsBody = body;
      this.els.btnClose = $('#pa-btn-close', overlay);
      this.els.btnCamera = $('#pa-btn-camera', overlay);
      this.els.btnFile = $('#pa-btn-file', overlay);
      
      // Mold search
      this.els.moldSearchInput = $('#pa-mold-search-input', overlay);
      this.els.moldSearchResults = $('#pa-mold-search-results', overlay);
      this.els.selectedMoldDisplay = $('#pa-selected-mold', overlay);
      
      // Dimensions
      this.els.dimLengthInput = $('#pa-dim-length', overlay);
      this.els.dimWidthInput = $('#pa-dim-width', overlay);
      this.els.dimDepthInput = $('#pa-dim-depth', overlay);
      
      // Employee search
      this.els.employeeSearchInput = $('#pa-employee-search-input', overlay);
      this.els.employeeSearchResults = $('#pa-employee-search-results', overlay);
      this.els.selectedEmployeeDisplay = $('#pa-selected-employee', overlay);
      
      // Recipients
      this.els.recipientInput = $('#pa-recipient-input', overlay);
      this.els.btnAddRecipient = $('#pa-btn-add-recipient', overlay);
      this.els.recipientsContainer = $('#pa-recipients-container', overlay);
      
      // Bind events
      this.els.btnClose.addEventListener('click', () => this.closeSettings());
      this.els.btnCamera.addEventListener('click', () => this._validateAndOpenCamera());
      this.els.btnFile.addEventListener('click', () => this._openFilePicker());
      
      // Mold search with debounce
      this.els.moldSearchInput.addEventListener('input', debounce((e) => {
        this._handleMoldSearch(e.target.value);
      }, 300));
      
      // Employee search with debounce
      this.els.employeeSearchInput.addEventListener('input', debounce((e) => {
        this._handleEmployeeSearch(e.target.value);
      }, 300));
      
      // Dimension inputs - mark as manual edit
      [this.els.dimLengthInput, this.els.dimWidthInput, this.els.dimDepthInput].forEach((input, idx) => {
        const key = ['length', 'width', 'depth'][idx];
        input.addEventListener('input', (e) => {
          this.state.dimensions[key] = e.target.value;
          if (this.state.dimensionsSource[key]) {
            this.state.dimensionsSource[key] = 'manual';
            input.classList.remove('auto-filled');
            input.classList.add('manual-edit');
          }
        });
      });
      
      // Recipients
      this.els.btnAddRecipient.addEventListener('click', () => this._addRecipient());
      this.els.recipientInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._addRecipient();
        }
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!this.els.moldSearchInput.contains(e.target) && 
            !this.els.moldSearchResults.contains(e.target)) {
          this.els.moldSearchResults.classList.remove('pa-visible');
        }
        if (!this.els.employeeSearchInput.contains(e.target) && 
            !this.els.employeeSearchResults.contains(e.target)) {
          this.els.employeeSearchResults.classList.remove('pa-visible');
        }
      });
      
      // Set default employee display
      if (this.state.selectedEmployee) {
        this._updateEmployeeDisplay();
      }
    },
    // Tiếp tục từ phần 1...

    // ==========================================
    // MOLD SEARCH LOGIC
    // ==========================================
    
    _handleMoldSearch(query) {
      const q = query.trim().toLowerCase();
      
      if (!q) {
        this.els.moldSearchResults.classList.remove('pa-visible');
        this.state.isManualMold = false;
        this.state.selectedMold = null;
        this.state.manualMoldName = '';
        this._clearDimensionInputs();
        this._updateMoldDisplay();
        return;
      }
      
      // Search in molds array (enriched data from DataManager)
      const results = this.state.molds.filter(m => {
        const code = (m.MoldCode || '').toLowerCase();
        const name = (m.MoldName || '').toLowerCase();
        const designCode = (m.designInfo?.MoldDesignCode || '').toLowerCase();
        
        return code.includes(q) || name.includes(q) || designCode.includes(q);
      }).slice(0, 10);
      
      if (results.length === 0) {
        // No results - allow manual input
        this.els.moldSearchResults.innerHTML = `
          <div class="pa-search-empty">
            <i class="fas fa-info-circle"></i>
            <span class="empty-ja">検索結果なし</span>
            <span class="empty-vi">Không tìm thấy</span>
            <div class="empty-hint">手動入力として使用 / Use as manual input</div>
          </div>
        `;
        this.els.moldSearchResults.classList.add('pa-visible');
        
        this.state.isManualMold = true;
        this.state.manualMoldName = query;
        this.state.selectedMold = null;
        this._clearDimensionInputs();
        this._updateMoldDisplay();
        return;
      }
      
      // Display search results
      this.els.moldSearchResults.innerHTML = '';
      results.forEach(mold => {
        const item = createEl('div', { class: 'pa-search-item' });
        
        const code = escapeHtml(mold.MoldCode || '');
        const name = escapeHtml(mold.MoldName || '');
        const dimensions = mold.displayDimensions || '';
        const location = mold.displayRackLocation || '';
        
        item.innerHTML = `
          <div class="pa-search-item-main">
            <div class="pa-search-item-code">${code}</div>
            <div class="pa-search-item-name">${name}</div>
          </div>
          <div class="pa-search-item-meta">
            ${dimensions ? `<span class="meta-dim"><i class="fas fa-ruler-combined"></i>${dimensions}</span>` : ''}
            ${location ? `<span class="meta-loc"><i class="fas fa-map-marker-alt"></i>${location}</span>` : ''}
          </div>
        `;
        
        item.addEventListener('click', () => {
          this._selectMold(mold);
        });
        
        this.els.moldSearchResults.appendChild(item);
      });
      
      this.els.moldSearchResults.classList.add('pa-visible');
    },
    
    _selectMold(mold) {
      this.state.selectedMold = mold;
      this.state.isManualMold = false;
      this.state.manualMoldName = '';
      
      this.els.moldSearchInput.value = `${mold.MoldCode} - ${mold.MoldName || ''}`;
      this.els.moldSearchResults.classList.remove('pa-visible');
      
      this._loadDimensionsForMold(mold);
      this._updateMoldDisplay();
      
      console.log('[PhotoAuditTool] Mold selected:', mold.MoldCode, mold.MoldID);
    },
    
    _updateMoldDisplay() {
      if (!this.els.selectedMoldDisplay) return;
      
      if (this.state.selectedMold) {
        const m = this.state.selectedMold;
        this.els.selectedMoldDisplay.innerHTML = `
          <div class="pa-selected-tag">
            <i class="fas fa-check-circle"></i>
            <span>${escapeHtml(m.MoldCode)} - ${escapeHtml(m.MoldName || '')}</span>
          </div>
        `;
      } else if (this.state.isManualMold && this.state.manualMoldName) {
        this.els.selectedMoldDisplay.innerHTML = `
          <div class="pa-selected-tag manual">
            <i class="fas fa-pencil-alt"></i>
            <span>手動: ${escapeHtml(this.state.manualMoldName)}</span>
          </div>
        `;
      } else {
        this.els.selectedMoldDisplay.innerHTML = '';
      }
    },

    // ==========================================
    // DIMENSIONS AUTO-FILL
    // ==========================================
    
    _loadDimensionsForMold(mold) {
      console.log('[PhotoAuditTool] Loading dimensions for mold:', mold.MoldID, mold.MoldCode);
      
      let length = '', width = '', depth = '';
      let lengthSrc = null, widthSrc = null, depthSrc = null;
      
      // Priority 1: designInfo (from enriched data)
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
      
      // Priority 2: mold direct fields (Modified values)
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
      
      this._updateDimensionInputs();
      
      console.log('[PhotoAuditTool] Dimensions loaded:', this.state.dimensions, 'Sources:', this.state.dimensionsSource);
    },
    
    _updateDimensionInputs() {
      const inputs = {
        length: this.els.dimLengthInput,
        width: this.els.dimWidthInput,
        depth: this.els.dimDepthInput
      };
      
      Object.keys(inputs).forEach(key => {
        const input = inputs[key];
        const value = this.state.dimensions[key];
        const source = this.state.dimensionsSource[key];
        
        input.value = value || '';
        input.classList.remove('auto-filled', 'manual-edit');
        
        if (source === 'molddesign' || source === 'molds') {
          input.classList.add('auto-filled');
        }
      });
    },
    
    _clearDimensionInputs() {
      this.state.dimensions = { length: '', width: '', depth: '' };
      this.state.dimensionsSource = { length: null, width: null, depth: null };
      
      [this.els.dimLengthInput, this.els.dimWidthInput, this.els.dimDepthInput].forEach(input => {
        input.value = '';
        input.classList.remove('auto-filled', 'manual-edit');
      });
    },

    // ==========================================
    // EMPLOYEE SEARCH LOGIC
    // ==========================================
    
    _handleEmployeeSearch(query) {
      const q = query.trim().toLowerCase();
      
      if (!q) {
        this.els.employeeSearchResults.classList.remove('pa-visible');
        // Don't clear selection, keep current employee
        return;
      }
      
      // Search in employees array
      const results = this.state.employees.filter(emp => {
        const name = (emp.EmployeeName || '').toLowerCase();
        const nameShort = (emp.EmployeeNameShort || '').toLowerCase();
        const division = (emp.Division || '').toLowerCase();
        
        return name.includes(q) || nameShort.includes(q) || division.includes(q);
      }).slice(0, 10);
      
      if (results.length === 0) {
        // No results - allow manual input
        this.els.employeeSearchResults.innerHTML = `
          <div class="pa-search-empty">
            <i class="fas fa-info-circle"></i>
            <span class="empty-ja">検索結果なし</span>
            <span class="empty-vi">Không tìm thấy</span>
            <div class="empty-hint">
              <button class="pa-btn-use-manual" id="pa-btn-use-manual-employee">
                <i class="fas fa-pencil-alt"></i>
                「${escapeHtml(query)}」を使用 / Use this name
              </button>
            </div>
          </div>
        `;
        this.els.employeeSearchResults.classList.add('pa-visible');
        
        // Bind manual input button
        const btnManual = $('#pa-btn-use-manual-employee', this.els.employeeSearchResults);
        if (btnManual) {
          btnManual.addEventListener('click', () => {
            this._selectManualEmployee(query);
          });
        }
        return;
      }
      
      // Display search results
      this.els.employeeSearchResults.innerHTML = '';
      results.forEach(emp => {
        const item = createEl('div', { class: 'pa-search-item' });
        
        const name = escapeHtml(emp.EmployeeNameShort || emp.EmployeeName);
        const division = emp.Division ? escapeHtml(emp.Division) : '';
        
        item.innerHTML = `
          <div class="pa-search-item-main">
            <div class="pa-search-item-name">
              <i class="fas fa-user"></i>
              ${name}
            </div>
            ${division ? `<div class="pa-search-item-meta">${division}</div>` : ''}
          </div>
        `;
        
        item.addEventListener('click', () => {
          this._selectEmployee(emp);
        });
        
        this.els.employeeSearchResults.appendChild(item);
      });
      
      this.els.employeeSearchResults.classList.add('pa-visible');
    },
    
    _selectEmployee(emp) {
      this.state.selectedEmployee = {
        id: emp.EmployeeID,
        name: emp.EmployeeNameShort || emp.EmployeeName,
        isManual: false
      };
      
      this.els.employeeSearchInput.value = this.state.selectedEmployee.name;
      this.els.employeeSearchResults.classList.remove('pa-visible');
      
      this._updateEmployeeDisplay();
      
      console.log('[PhotoAuditTool] Employee selected:', this.state.selectedEmployee);
    },
    
    _selectManualEmployee(name) {
      this.state.selectedEmployee = {
        id: null,
        name: name.trim(),
        isManual: true
      };
      
      this.els.employeeSearchInput.value = name;
      this.els.employeeSearchResults.classList.remove('pa-visible');
      
      this._updateEmployeeDisplay();
      
      console.log('[PhotoAuditTool] Manual employee selected:', this.state.selectedEmployee);
    },
    
    _updateEmployeeDisplay() {
      if (!this.els.selectedEmployeeDisplay) return;
      
      if (this.state.selectedEmployee) {
        const emp = this.state.selectedEmployee;
        const iconClass = emp.isManual ? 'fa-pencil-alt' : 'fa-check-circle';
        const tagClass = emp.isManual ? 'manual' : '';
        
        this.els.selectedEmployeeDisplay.innerHTML = `
          <div class="pa-selected-tag ${tagClass}">
            <i class="fas ${iconClass}"></i>
            <span>${escapeHtml(emp.name)}${emp.isManual ? ' (手動)' : ''}</span>
          </div>
        `;
      } else {
        this.els.selectedEmployeeDisplay.innerHTML = '';
      }
    },

    // ==========================================
    // RECIPIENTS
    // ==========================================
    
    _addRecipient() {
      const email = this.els.recipientInput.value.trim();
      
      if (!email) return;
      
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this._toast('無効なメール / Invalid email', 'error');
        return;
      }
      
      if (this.state.recipients.includes(email)) {
        this._toast('既に追加済み / Already added', 'error');
        return;
      }
      
      this.state.recipients.push(email);
      this.els.recipientInput.value = '';
      this._renderRecipients();
    },
    
    _removeRecipient(email) {
      this.state.recipients = this.state.recipients.filter(e => e !== email);
      this._renderRecipients();
    },
    
    _renderRecipients() {
      if (!this.els.recipientsContainer) return;
      
      this.els.recipientsContainer.innerHTML = '';
      
      this.state.recipients.forEach(email => {
        const tag = createEl('div', { class: 'pa-recipient-tag' });
        tag.innerHTML = `
          <span>${escapeHtml(email)}</span>
          <button class="pa-recipient-remove" data-email="${escapeHtml(email)}">
            <i class="fas fa-times"></i>
          </button>
        `;
        
        tag.querySelector('.pa-recipient-remove').addEventListener('click', () => {
          this._removeRecipient(email);
        });
        
        this.els.recipientsContainer.appendChild(tag);
      });
    },

    // ==========================================
    // VALIDATION & OPEN CAMERA/FILE
    // ==========================================
    
    _validateSettings() {
      if (!this.state.selectedMold && !this.state.isManualMold) {
        this._toast('金型を選択してください / Select mold', 'error');
        return false;
      }
      
      if (!this.state.selectedEmployee) {
        this._toast('担当者を選択してください / Select employee', 'error');
        return false;
      }
      
      if (this.state.recipients.length === 0) {
        this._toast('送信先を追加してください / Add recipients', 'error');
        return false;
      }
      
      return true;
    },
    
    _validateAndOpenCamera() {
      if (!this._validateSettings()) return;
      
      this.closeSettings();
      this.openCamera();
    },
    
    _openFilePicker() {
      if (!this._validateSettings()) return;
      
      if (!this.els.fileInput) {
        const input = createEl('input', {
          type: 'file',
          accept: 'image/*',
          class: 'pa-file-input'
        });
        
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            this._handleFileSelect(file);
          }
        });
        
        document.body.appendChild(input);
        this.els.fileInput = input;
      }
      
      this.els.fileInput.click();
    },
    
    async _handleFileSelect(file) {
      console.log('[PhotoAuditTool] File selected:', file.name, file.size);
      
      try {
        if (!file.type.startsWith('image/')) {
          this._toast('画像ファイルを選択してください / Select image file', 'error');
          return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
          this._toast('ファイルサイズが大きすぎます / File too large', 'error');
          return;
        }
        
        this.state.photoBlob = file;
        this.state.photoSource = 'file';
        
        this.closeSettings();
        this.openCamera(true);
        
      } catch (error) {
        console.error('[PhotoAuditTool] File select error:', error);
        this._toast('ファイル読み込みエラー / File read error', 'error');
      }
    },

    // ==========================================
    // OPEN/CLOSE SETTINGS
    // ==========================================
    
    openSettings(preFillData = null) {
      if (!this.state.initialized) this.init();
      
      console.log('[PhotoAuditTool] Opening settings...', preFillData);
      
      this._resetState();
      
      if (preFillData && preFillData.mold) {
        this._preFillMoldData(preFillData.mold);
      }
      
      this.state.currentScreen = 'settings';
      this.els.settingsOverlay.classList.remove('pa-hidden');
      
      if (this.els.settingsBody) {
        this.els.settingsBody.scrollTop = 0;
      }
      
      document.body.style.overflow = 'hidden';
    },
    
    closeSettings() {
      this.els.settingsOverlay.classList.add('pa-hidden');
      this.state.currentScreen = null;
      document.body.style.overflow = '';
    },
    
    _resetState() {
      this.state.selectedMold = null;
      this.state.isManualMold = false;
      this.state.manualMoldName = '';
      this.state.dimensions = { length: '', width: '', depth: '' };
      this.state.dimensionsSource = { length: null, width: null, depth: null };
      this.state.photoBlob = null;
      this.state.photoSource = null;
      
      if (this.els.moldSearchInput) {
        this.els.moldSearchInput.value = '';
      }
      
      this._clearDimensionInputs();
      this._updateMoldDisplay();
      
      // Reset to default employee
      const defaultEmp = this.state.employees.find(e => e.EmployeeID == DEFAULT_EMPLOYEE_ID);
      if (defaultEmp) {
        this.state.selectedEmployee = {
          id: defaultEmp.EmployeeID,
          name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName,
          isManual: false
        };
        if (this.els.employeeSearchInput) {
          this.els.employeeSearchInput.value = this.state.selectedEmployee.name;
        }
        this._updateEmployeeDisplay();
      }
    },
    
    _preFillMoldData(mold) {
      console.log('[PhotoAuditTool] Pre-filling mold data:', mold.MoldCode, mold.MoldID);
      
      this.state.selectedMold = mold;
      this.state.isManualMold = false;
      
      if (this.els.moldSearchInput) {
        this.els.moldSearchInput.value = `${mold.MoldCode} - ${mold.MoldName || ''}`;
      }
      
      this._loadDimensionsForMold(mold);
      this._updateMoldDisplay();
    },

    // ==========================================
    // BUILD CAMERA SCREEN
    // ==========================================
    
    _buildCameraScreen() {
      const overlay = createEl('div', { 
        class: 'photo-audit-camera-overlay pa-hidden', 
        id: 'photo-audit-camera-overlay' 
      });
      
      const header = createEl('div', { class: 'pa-camera-header' });
      header.innerHTML = `
        <div class="pa-camera-status" id="pa-camera-status">
          <i class="fas fa-circle"></i>
          <span>カメラ起動中 / Camera active</span>
        </div>
        <button class="pa-btn-camera-close" id="pa-btn-camera-close" title="閉じる / Close">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      const view = createEl('div', { class: 'pa-camera-view' });
      view.innerHTML = `
        <video class="pa-camera-video" id="pa-camera-video" autoplay playsinline muted></video>
        <canvas class="pa-camera-canvas" id="pa-camera-canvas"></canvas>
        <img class="pa-camera-preview-img" id="pa-camera-preview-img" alt="Preview" />
        
        <div class="pa-camera-grid" id="pa-camera-grid">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <line class="pa-grid-line" x1="33.33" y1="0" x2="33.33" y2="100" />
            <line class="pa-grid-line" x1="66.67" y1="0" x2="66.67" y2="100" />
            <line class="pa-grid-line" x1="0" y1="33.33" x2="100" y2="33.33" />
            <line class="pa-grid-line" x1="0" y1="66.67" x2="100" y2="66.67" />
          </svg>
        </div>
        
        <div class="pa-camera-loading" id="pa-camera-loading">
          <div class="pa-camera-loading-spinner"></div>
          <div class="pa-camera-loading-text">カメラ起動中...<br>Loading camera...</div>
        </div>
        
        <div class="pa-camera-error" id="pa-camera-error">
          <i class="fas fa-exclamation-triangle"></i>
          <div class="pa-camera-error-title">カメラエラー / Camera Error</div>
          <div class="pa-camera-error-message">
            カメラにアクセスできません<br>Cannot access camera
          </div>
        </div>
      `;
      
      const controls = createEl('div', { class: 'pa-camera-controls' });
      controls.innerHTML = `
        <button class="pa-btn-grid-toggle" id="pa-btn-grid-toggle" title="グリッド / Grid">
          <i class="fas fa-border-all"></i>
        </button>
        <button class="pa-btn-capture" id="pa-btn-capture" title="撮影 / Capture">
          <i class="fas fa-camera"></i>
        </button>
        <button class="pa-btn-flip" id="pa-btn-flip" title="カメラ切替 / Flip">
          <i class="fas fa-sync-alt"></i>
        </button>
      `;
      
      const previewControls = createEl('div', { class: 'pa-preview-controls' });
      previewControls.innerHTML = `
        <div class="pa-preview-info">
          <div class="pa-preview-info-item">
            <i class="fas fa-cube"></i>
            <span id="pa-preview-mold-code">-</span>
          </div>
          <div class="pa-preview-info-item">
            <i class="fas fa-user"></i>
            <span id="pa-preview-employee">-</span>
          </div>
        </div>
        <div class="pa-preview-actions">
          <button class="pa-btn-preview pa-btn-retake" id="pa-btn-retake">
            <i class="fas fa-redo"></i>
            再撮影 / Retake
          </button>
          <button class="pa-btn-preview pa-btn-save-photo" id="pa-btn-save-photo">
            <i class="fas fa-download"></i>
            保存 / Save
          </button>
          <button class="pa-btn-preview pa-btn-send" id="pa-btn-send">
            <i class="fas fa-paper-plane"></i>
            送信 / Send
          </button>
        </div>
      `;
      
      overlay.appendChild(header);
      overlay.appendChild(view);
      overlay.appendChild(controls);
      overlay.appendChild(previewControls);
      document.body.appendChild(overlay);
      
      // Cache elements
      this.els.cameraOverlay = overlay;
      this.els.cameraVideo = $('#pa-camera-video', overlay);
      this.els.cameraCanvas = $('#pa-camera-canvas', overlay);
      this.els.cameraPreviewImg = $('#pa-camera-preview-img', overlay);
      this.els.cameraStatus = $('#pa-camera-status', overlay);
      this.els.cameraGrid = $('#pa-camera-grid', overlay);
      this.els.btnCapture = $('#pa-btn-capture', overlay);
      this.els.btnFlip = $('#pa-btn-flip', overlay);
      this.els.btnGridToggle = $('#pa-btn-grid-toggle', overlay);
      this.els.btnCameraClose = $('#pa-btn-camera-close', overlay);
      this.els.previewControls = previewControls;
      this.els.btnRetake = $('#pa-btn-retake', overlay);
      this.els.btnSavePhoto = $('#pa-btn-save-photo', overlay);
      this.els.btnSend = $('#pa-btn-send', overlay);
      
      // Bind events
      this.els.btnCameraClose.addEventListener('click', () => this.closeCamera());
      this.els.btnCapture.addEventListener('click', () => this.capturePhoto());
      this.els.btnFlip.addEventListener('click', () => this.flipCamera());
      this.els.btnGridToggle.addEventListener('click', () => this.toggleGrid());
      this.els.btnRetake.addEventListener('click', () => this.retakePhoto());
      this.els.btnSavePhoto.addEventListener('click', () => this.savePhotoToDevice());
      this.els.btnSend.addEventListener('click', () => this.sendPhotoAudit());
    },
    // Tiếp tục từ phần 2...

    // ==========================================
    // CAMERA LOGIC
    // ==========================================
    
    async openCamera(previewMode = false) {
      if (!this.state.initialized) this.init();
      
      console.log('[PhotoAuditTool] Opening camera, preview mode:', previewMode);
      
      this.state.currentScreen = 'camera';
      this.els.cameraOverlay.classList.remove('pa-hidden');
      
      if (previewMode) {
        await this._showPreview();
      } else {
        await this._startCamera();
        
        this.els.btnCapture.style.display = 'flex';
        this.els.btnFlip.style.display = 'flex';
        this.els.btnGridToggle.style.display = 'flex';
        this.els.previewControls.classList.remove('pa-visible');
      }
      
      document.body.style.overflow = 'hidden';
    },

    async closeCamera() {
      await this._stopCamera();
      
      this.els.cameraOverlay.classList.add('pa-hidden');
      this.state.currentScreen = null;
      
      document.body.style.overflow = '';
      
      this.els.cameraPreviewImg.src = '';
      this.els.cameraPreviewImg.classList.remove('pa-visible');
      this.els.cameraVideo.style.display = 'block';
    },

    async _startCamera() {
      await this._stopCamera();
      
      const loading = $('#pa-camera-loading', this.els.cameraOverlay);
      const errorEl = $('#pa-camera-error', this.els.cameraOverlay);
      
      loading.classList.add('active');
      errorEl.classList.remove('active');
      
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
        
        loading.classList.remove('active');
        
        this.els.cameraStatus.innerHTML = `
          <i class="fas fa-circle"></i>
          <span>カメラ起動中 / Camera active</span>
        `;
        
        console.log('[PhotoAuditTool] Camera started successfully');
        
      } catch (error) {
        console.error('[PhotoAuditTool] Camera error:', error);
        
        loading.classList.remove('active');
        errorEl.classList.add('active');
        
        this.els.cameraStatus.innerHTML = `
          <i class="fas fa-exclamation-triangle"></i>
          <span>カメラエラー / Camera error</span>
        `;
        
        this._toast('カメラアクセス失敗 / Camera access failed', 'error');
      }
    },

    async _stopCamera() {
      if (this.state.stream) {
        this.state.stream.getTracks().forEach(track => track.stop());
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
      
      await this._startCamera();
      
      this._toast('カメラ切替 / Camera flipped', 'info');
    },

    toggleGrid() {
      this.state.gridEnabled = !this.state.gridEnabled;
      
      if (this.state.gridEnabled) {
        this.els.cameraGrid.classList.add('active');
        this.els.btnGridToggle.classList.add('active');
      } else {
        this.els.cameraGrid.classList.remove('active');
        this.els.btnGridToggle.classList.remove('active');
      }
    },

    async capturePhoto() {
      if (!this.state.stream) {
        this._toast('カメラ未起動 / Camera not active', 'error');
        return;
      }
      
      const video = this.els.cameraVideo;
      const canvas = this.els.cameraCanvas;
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          this._toast('撮影失敗 / Capture failed', 'error');
          return;
        }
        
        const resizedBlob = await this._resizeImageToHD(blob);
        this.state.photoBlob = resizedBlob;
        this.state.photoSource = 'camera';
        
        await this._showPreview();
        
        this._toast('撮影完了 / Photo captured', 'success');
        
      }, 'image/jpeg', 0.92);
    },

    async _resizeImageToHD(blob) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          const targetWidth = 1920;
          const targetHeight = 1080;
          
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          
          const imgRatio = img.width / img.height;
          const targetRatio = targetWidth / targetHeight;
          
          let drawWidth, drawHeight, offsetX, offsetY;
          
          if (imgRatio > targetRatio) {
            drawHeight = targetHeight;
            drawWidth = drawHeight * imgRatio;
            offsetX = (targetWidth - drawWidth) / 2;
            offsetY = 0;
          } else {
            drawWidth = targetWidth;
            drawHeight = drawWidth / imgRatio;
            offsetX = 0;
            offsetY = (targetHeight - drawHeight) / 2;
          }
          
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          
          canvas.toBlob((resizedBlob) => {
            resolve(resizedBlob);
          }, 'image/jpeg', 0.92);
        };
        img.src = URL.createObjectURL(blob);
      });
    },

    async _showPreview() {
      await this._stopCamera();
      
      const url = URL.createObjectURL(this.state.photoBlob);
      this.els.cameraPreviewImg.src = url;
      this.els.cameraPreviewImg.classList.add('pa-visible');
      this.els.cameraVideo.style.display = 'none';
      
      this.els.btnCapture.style.display = 'none';
      this.els.btnFlip.style.display = 'none';
      this.els.btnGridToggle.style.display = 'none';
      
      this.els.previewControls.classList.add('pa-visible');
      
      this.els.cameraStatus.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>写真プレビュー / Photo preview</span>
      `;
      this.els.cameraStatus.classList.add('preview-mode');
      
      const moldCode = this.state.selectedMold?.MoldCode || this.state.manualMoldName || '-';
      const employeeName = this.state.selectedEmployee?.name || '-';
      
      $('#pa-preview-mold-code', this.els.cameraOverlay).textContent = moldCode;
      $('#pa-preview-employee', this.els.cameraOverlay).textContent = employeeName;
    },

    async retakePhoto() {
      this.els.cameraPreviewImg.src = '';
      this.els.cameraPreviewImg.classList.remove('pa-visible');
      this.els.cameraVideo.style.display = 'block';
      
      this.state.photoBlob = null;
      
      this.els.previewControls.classList.remove('pa-visible');
      
      this.els.btnCapture.style.display = 'flex';
      this.els.btnFlip.style.display = 'flex';
      this.els.btnGridToggle.style.display = 'flex';
      
      this.els.cameraStatus.classList.remove('preview-mode');
      
      await this._startCamera();
    },

    async savePhotoToDevice() {
      if (!this.state.photoBlob) {
        this._toast('写真がありません / No photo', 'error');
        return;
      }
      
      try {
        const url = URL.createObjectURL(this.state.photoBlob);
        const a = document.createElement('a');
        a.href = url;
        
        const moldCode = this.state.selectedMold?.MoldCode || this.state.manualMoldName || 'photo';
        const date = formatDateJP().replace(/\//g, '-');
        a.download = `${moldCode}_${date}.jpg`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        this._toast('保存完了 / Saved to device', 'success');
        
      } catch (error) {
        console.error('[PhotoAuditTool] Save photo error:', error);
        this._toast('保存失敗 / Save failed', 'error');
      }
    },

    // ==========================================
    // SEND PHOTO AUDIT
    // ==========================================
    
    async sendPhotoAudit() {
      if (!this.state.photoBlob) {
        this._toast('写真がありません / No photo', 'error');
        return;
      }
      
      if (this.state.sending) return;
      
      this.state.sending = true;
      
      this.els.btnSend.disabled = true;
      this.els.btnSend.innerHTML = `
        <span class="pa-loading-spinner"></span>
        送信中 / Sending...
      `;
      
      try {
        const moldCode = this.state.selectedMold?.MoldCode || this.state.manualMoldName || 'manual';
        const fileName = `${moldCode}_${Date.now()}.jpg`;
        
        console.log('[PhotoAuditTool] Uploading photo:', fileName);
        
        await supabaseClient.uploadFile(STORAGE_BUCKET, fileName, this.state.photoBlob);
        
        const photoUrl = supabaseClient.getPublicUrl(STORAGE_BUCKET, fileName);
        
        console.log('[PhotoAuditTool] Photo uploaded:', photoUrl);
        
        const payload = {
          moldName: this.state.selectedMold?.MoldName || this.state.manualMoldName,
          moldCode: moldCode,
          moldId: this.state.selectedMold?.MoldID || null,
          dimensions: {
            length: this.state.dimensions.length || null,
            width: this.state.dimensions.width || null,
            depth: this.state.dimensions.depth || null
          },
          photoFileName: fileName,
          photoUrl: photoUrl,
          employee: this.state.selectedEmployee.name,
          employeeId: this.state.selectedEmployee.id || null,
          date: formatDateJP(),
          recipients: this.state.recipients,
          fromEmail: '金型管理 <onboarding@resend.dev>'
        };
        
        console.log('[PhotoAuditTool] Sending email with payload:', payload);
        
        const result = await supabaseClient.callEdgeFunction('send-photo-audit', payload);
        
        console.log('[PhotoAuditTool] Email sent successfully:', result);
        
        if (this.state.selectedMold) {
          const auditNote = `自動確認（写真監査） - 担当: ${this.state.selectedEmployee.name}`;
          
          document.dispatchEvent(new CustomEvent('photoAudit:completed', {
            detail: {
              moldId: this.state.selectedMold.MoldID,
              moldCode: moldCode,
              employeeName: this.state.selectedEmployee.name,
              employeeId: this.state.selectedEmployee.id,
              photoUrl: photoUrl,
              dimensions: this.state.dimensions,
              auditNote: auditNote,
              timestamp: nowISO()
            }
          }));
        }
        
        this._toast('送信完了 ✓ / Sent successfully', 'success');
        
        setTimeout(() => {
          this.closeCamera();
        }, 1500);
        
      } catch (error) {
        console.error('[PhotoAuditTool] Send failed:', error);
        this._toast(`送信失敗 / Send failed: ${error.message}`, 'error');
        
        this.els.btnSend.disabled = false;
        this.els.btnSend.innerHTML = `
          <i class="fas fa-paper-plane"></i>
          送信 / Send
        `;
      } finally {
        this.state.sending = false;
      }
    },

    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================
    
    _toast(message, type = 'info') {
      let toast = document.getElementById('photo-audit-toast');
      if (!toast) {
        toast = createEl('div', { 
          id: 'photo-audit-toast', 
          class: 'pa-toast' 
        });
        document.body.appendChild(toast);
      }
      
      toast.textContent = message;
      toast.className = `pa-toast ${type}`;
      toast.classList.add('pa-visible');
      
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.remove('pa-visible');
      }, 3000);
    },

    // ==========================================
    // GLOBAL HOOKS
    // ==========================================
    
    _bindGlobalHooks() {
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
    }
  };

  // ==========================================
  // AUTO-INIT
  // ==========================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        PhotoAuditTool.init();
      } catch (e) {
        console.error('[PhotoAuditTool] Init error:', e);
      }
    }, { once: true });
  } else {
    try {
      PhotoAuditTool.init();
    } catch (e) {
      console.error('[PhotoAuditTool] Init error:', e);
    }
  }

  // Expose globally
  window.PhotoAuditTool = PhotoAuditTool;

})();
