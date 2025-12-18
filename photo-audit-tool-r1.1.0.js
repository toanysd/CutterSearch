/* ============================================================
   photo-audit-tool-r1.1.0.js
   写真監査ツール / Photo Audit Tool v1.1.0
   
   Complete file with all features integrated
   Created: 2025-12-18
   ============================================================ */

(function () {
  'use strict';

  const MODULE_VERSION = 'r1.1.0';

  // Supabase Configuration
  const SUPABASE_URL = 'https://bgpnhvhouplvekaaheqy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncG5odmhvdXBsdmVrYWFoZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2NjAxOTIsImV4cCI6MjA1NzIzNjE5Mn0.0PJJUjGOjkcEMl-hQhajn0IW4pLQNUHDDAeprE5DG1w';
  const STORAGE_BUCKET = 'mold-photos';

  // Default Settings
  const DEFAULT_RECIPIENTS = ['toan@ysd-pack.co.jp'];
  const DEFAULT_EMPLOYEE_ID = '1'; // トアン

  // Utilities
  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function createEl(tag, attrs = {}, html = '') {
    const el = document.createElement(tag);
    Object.keys(attrs).forEach(k => {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.setAttribute('style', attrs[k]);
      else if (k.startsWith('data-')) el.setAttribute(k, attrs[k]);
      else el[k] = attrs[k];
    });
    if (html) el.innerHTML = html;
    return el;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function formatDateJP() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Supabase Client
  const supabaseClient = (() => {
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    };

    return {
      async uploadFile(bucket, path, file) {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(
          `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
          {
            method: 'POST',
            headers: headers,
            body: formData
          }
        );
        
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Upload failed');
        }
        
        return await res.json();
      },

      async callEdgeFunction(functionName, payload) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Edge function failed');
        }
        
        return await res.json();
      },

      getPublicUrl(bucket, path) {
        return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
      }
    };
  })();

  // Main Module
  const PhotoAuditTool = {
    state: {
      initialized: false,
      currentScreen: null,
      
      selectedMold: null,
      isManualMold: false,
      manualMoldName: '',
      
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
      
      selectedEmployee: null,
      recipients: [...DEFAULT_RECIPIENTS],
      
      photoBlob: null,
      photoSource: null,
      
      stream: null,
      facingMode: 'environment',
      gridEnabled: false,
      
      molds: [],
      molddesigns: [],
      employees: [],
      
      sending: false
    },

    els: {
      settingsOverlay: null,
      settingsBody: null,
      moldSearchInput: null,
      moldSearchResults: null,
      dimLengthInput: null,
      dimWidthInput: null,
      dimDepthInput: null,
      employeeSelect: null,
      recipientsContainer: null,
      recipientInput: null,
      btnAddRecipient: null,
      btnFilePickerSettings: null,
      btnCameraSettings: null,
      
      cameraOverlay: null,
      cameraVideo: null,
      cameraCanvas: null,
      cameraPreviewImg: null,
      cameraStatus: null,
      cameraGrid: null,
      btnCapture: null,
      btnFlip: null,
      btnGridToggle: null,
      btnCameraClose: null,
      
      previewControls: null,
      btnRetake: null,
      btnSavePhoto: null,
      btnSend: null,
      
      fileInput: null
    },

    init() {
      if (this.state.initialized) return;
      
      console.log(`[PhotoAuditTool] Initializing ${MODULE_VERSION}...`);
      
      this._loadData();
      this._buildUI();
      this._bindGlobalHooks();
      
      this.state.initialized = true;
      
      const navBtn = document.getElementById('nav-photo-audit-btn');
      if (navBtn) {
        navBtn.addEventListener('click', () => this.openSettings());
      }
      
      window.PhotoAuditTool = this;
      window.dispatchEvent(new CustomEvent('photoAuditTool:ready', { 
        detail: { version: MODULE_VERSION } 
      }));
      
      console.log(`[PhotoAuditTool] Initialized ${MODULE_VERSION}`);
    },

    _loadData() {
      if (window.DataManager && window.DataManager.data) {
        this.state.molds = window.DataManager.data.molds || [];
        this.state.molddesigns = window.DataManager.data.molddesign || [];
        this.state.employees = window.DataManager.data.employees || [];
        
        console.log('[PhotoAuditTool] Loaded data:', {
          molds: this.state.molds.length,
          molddesigns: this.state.molddesigns.length,
          employees: this.state.employees.length
        });
      } else {
        console.warn('[PhotoAuditTool] DataManager not ready, will retry...');
        setTimeout(() => this._loadData(), 1000);
      }
      
      const defaultEmp = this.state.employees.find(e => e.EmployeeID == DEFAULT_EMPLOYEE_ID);
      if (defaultEmp) {
        this.state.selectedEmployee = {
          id: defaultEmp.EmployeeID,
          name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
        };
      }
    },

    _buildUI() {
      this._buildSettingsScreen();
      this._buildCameraScreen();
    },

    _buildSettingsScreen() {
      const overlay = createEl('div', { 
        class: 'photo-audit-settings-overlay pa-hidden', 
        id: 'photo-audit-settings-overlay' 
      });
      
      const container = createEl('div', { class: 'photo-audit-settings-container' });
      
      const header = createEl('div', { class: 'pa-settings-header' }, `
        <div class="pa-settings-title">
          <div class="pa-settings-title-main">
            <i class="fas fa-camera"></i>
            写真監査 / Photo Audit
          </div>
          <div class="pa-settings-title-sub">金型写真撮影・送信 / ${MODULE_VERSION}</div>
        </div>
        <div class="pa-settings-header-actions">
          <button class="pa-btn-header-close" id="pa-settings-close" title="閉じる / Đóng">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `);
      
      const body = createEl('div', { class: 'pa-settings-body' });
      
      const moldSection = createEl('div', { class: 'pa-form-section' }, `
        <div class="pa-form-section-title">
          <i class="fas fa-cube"></i>
          金型情報 / Mold Information
        </div>
      `);
      
      const moldField = createEl('div', { class: 'pa-form-field' });
      moldField.innerHTML = `
        <label class="pa-form-label">
          金型コード・名前 / Mold Code/Name
          <span class="pa-required">*</span>
        </label>
        <div class="pa-mold-search-wrap">
          <input 
            type="text" 
            class="pa-form-input" 
            id="pa-mold-search" 
            placeholder="検索: コードまたは名前 / Search code or name..."
            autocomplete="off"
          />
          <div class="pa-search-results pa-hidden" id="pa-search-results"></div>
        </div>
        <div class="pa-info-badge pa-mt-2">
          <i class="fas fa-info-circle"></i>
          見つからない場合は手動入力可能 / Manual input if not found
        </div>
      `;
      moldSection.appendChild(moldField);
      
      const dimSection = createEl('div', { class: 'pa-form-section' }, `
        <div class="pa-form-section-title">
          <i class="fas fa-ruler-combined"></i>
          寸法 / Dimensions (mm)
        </div>
      `);
      
      const dimField = createEl('div', { class: 'pa-form-field' });
      dimField.innerHTML = `
        <label class="pa-form-label">
          長さ × 幅 × 深さ / Length × Width × Depth
          <span class="pa-optional">(編集可能 / Editable)</span>
        </label>
        <div class="pa-dimensions-grid">
          <div class="pa-dimension-field">
            <div class="pa-dimension-label">長さ / L</div>
            <input 
              type="text" 
              class="pa-dimension-input" 
              id="pa-dim-length" 
              placeholder="-"
              inputmode="decimal"
            />
          </div>
          <div class="pa-dimension-field">
            <div class="pa-dimension-label">幅 / W</div>
            <input 
              type="text" 
              class="pa-dimension-input" 
              id="pa-dim-width" 
              placeholder="-"
              inputmode="decimal"
            />
          </div>
          <div class="pa-dimension-field">
            <div class="pa-dimension-label">深さ / D</div>
            <input 
              type="text" 
              class="pa-dimension-input" 
              id="pa-dim-depth" 
              placeholder="-"
              inputmode="decimal"
            />
          </div>
        </div>
        <div class="pa-info-badge pa-mt-2">
          <i class="fas fa-lightbulb"></i>
          自動: molddesign → molds / Auto-fill from DB
        </div>
      `;
      dimSection.appendChild(dimField);
      
      const empSection = createEl('div', { class: 'pa-form-section' }, `
        <div class="pa-form-section-title">
          <i class="fas fa-user"></i>
          撮影者 / Photographer
        </div>
      `);
      
      const empField = createEl('div', { class: 'pa-form-field' });
      empField.innerHTML = `
        <label class="pa-form-label">
          担当者 / Employee
          <span class="pa-required">*</span>
        </label>
        <select class="pa-form-select" id="pa-employee-select">
          <option value="">選択してください / Select...</option>
        </select>
      `;
      empSection.appendChild(empField);
      
      const emailSection = createEl('div', { class: 'pa-form-section' }, `
        <div class="pa-form-section-title">
          <i class="fas fa-envelope"></i>
          メール送信先 / Email Recipients
        </div>
      `);
      
      const emailField = createEl('div', { class: 'pa-form-field' });
      emailField.innerHTML = `
        <label class="pa-form-label">
          送信先リスト / Recipient List
          <span class="pa-optional">(複数可 / Multiple)</span>
        </label>
        <div class="pa-recipients-list" id="pa-recipients-list"></div>
        <div class="pa-recipient-add-row">
          <input 
            type="email" 
            class="pa-form-input pa-recipient-input" 
            id="pa-recipient-input" 
            placeholder="example@ysd-pack.co.jp"
          />
          <button class="pa-btn-add-recipient" id="pa-btn-add-recipient">
            <i class="fas fa-plus"></i> 追加
          </button>
        </div>
      `;
      emailSection.appendChild(emailField);
      
      body.appendChild(moldSection);
      body.appendChild(dimSection);
      body.appendChild(empSection);
      body.appendChild(emailSection);
      
      const footer = createEl('div', { class: 'pa-settings-footer' });
      footer.innerHTML = `
        <div class="pa-footer-actions">
          <button class="pa-btn-action pa-btn-file-picker" id="pa-btn-file-picker-settings">
            <i class="fas fa-folder-open"></i>
            ファイル選択 / File
          </button>
          <button class="pa-btn-action pa-btn-camera" id="pa-btn-camera-settings">
            <i class="fas fa-camera"></i>
            カメラ撮影 / Camera
          </button>
        </div>
      `;
      
      container.appendChild(header);
      container.appendChild(body);
      container.appendChild(footer);
      overlay.appendChild(container);
      document.body.appendChild(overlay);
      
      this.els.settingsOverlay = overlay;
      this.els.settingsBody = body;
      this.els.moldSearchInput = $('#pa-mold-search', overlay);
      this.els.moldSearchResults = $('#pa-search-results', overlay);
      this.els.dimLengthInput = $('#pa-dim-length', overlay);
      this.els.dimWidthInput = $('#pa-dim-width', overlay);
      this.els.dimDepthInput = $('#pa-dim-depth', overlay);
      this.els.employeeSelect = $('#pa-employee-select', overlay);
      this.els.recipientsContainer = $('#pa-recipients-list', overlay);
      this.els.recipientInput = $('#pa-recipient-input', overlay);
      this.els.btnAddRecipient = $('#pa-btn-add-recipient', overlay);
      this.els.btnFilePickerSettings = $('#pa-btn-file-picker-settings', overlay);
      this.els.btnCameraSettings = $('#pa-btn-camera-settings', overlay);
      
      $('#pa-settings-close', overlay).addEventListener('click', () => this.closeSettings());
      this.els.moldSearchInput.addEventListener('input', (e) => this._handleMoldSearch(e.target.value));
      this.els.moldSearchInput.addEventListener('focus', () => {
        if (this.els.moldSearchInput.value) {
          this.els.moldSearchResults.classList.add('pa-visible');
        }
      });
      
      [this.els.dimLengthInput, this.els.dimWidthInput, this.els.dimDepthInput].forEach(input => {
        input.addEventListener('input', () => {
          const field = input.id.replace('pa-dim-', '');
          this.state.dimensions[field] = input.value;
          this.state.dimensionsSource[field] = 'manual';
          input.classList.remove('auto-filled');
          input.classList.add('manual-edit');
        });
      });
      
      this.els.employeeSelect.addEventListener('change', (e) => {
        const empId = e.target.value;
        const emp = this.state.employees.find(e => e.EmployeeID == empId);
        if (emp) {
          this.state.selectedEmployee = {
            id: emp.EmployeeID,
            name: emp.EmployeeNameShort || emp.EmployeeName
          };
        }
      });
      
      this.els.btnAddRecipient.addEventListener('click', () => this._addRecipient());
      this.els.recipientInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this._addRecipient();
      });
      
      this.els.btnFilePickerSettings.addEventListener('click', () => this._openFilePicker());
      this.els.btnCameraSettings.addEventListener('click', () => this._validateAndOpenCamera());
      
      document.addEventListener('click', (e) => {
        if (!this.els.moldSearchInput.contains(e.target) && 
            !this.els.moldSearchResults.contains(e.target)) {
          this.els.moldSearchResults.classList.remove('pa-visible');
        }
      });
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeSettings();
      });
      
      this._populateEmployeeSelect();
      this._renderRecipients();
    },
    // Tiếp tục từ phần 1...

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
      
      this.els.btnCameraClose.addEventListener('click', () => this.closeCamera());
      this.els.btnCapture.addEventListener('click', () => this.capturePhoto());
      this.els.btnFlip.addEventListener('click', () => this.flipCamera());
      this.els.btnGridToggle.addEventListener('click', () => this.toggleGrid());
      this.els.btnRetake.addEventListener('click', () => this.retakePhoto());
      this.els.btnSavePhoto.addEventListener('click', () => this.savePhotoToDevice());
      this.els.btnSend.addEventListener('click', () => this.sendPhotoAudit());
    },

    openSettings(preFillData = null) {
      if (!this.state.initialized) this.init();
      
      console.log('[PhotoAuditTool] Opening settings...', preFillData);
      
      this._resetState();
      
      if (preFillData) {
        this._preFillMoldData(preFillData);
      }
      
      this.state.currentScreen = 'settings';
      this.els.settingsOverlay.classList.remove('pa-hidden');
      this.els.settingsBody.scrollTop = 0;
      
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
      
      const defaultEmp = this.state.employees.find(e => e.EmployeeID == DEFAULT_EMPLOYEE_ID);
      if (defaultEmp && this.els.employeeSelect) {
        this.els.employeeSelect.value = defaultEmp.EmployeeID;
        this.state.selectedEmployee = {
          id: defaultEmp.EmployeeID,
          name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
        };
      }
    },

    _preFillMoldData(data) {
      console.log('[PhotoAuditTool] Pre-filling mold data:', data);
      
      if (data.mold) {
        this.state.selectedMold = data.mold;
        this.state.isManualMold = false;
        
        if (this.els.moldSearchInput) {
          this.els.moldSearchInput.value = `${data.mold.MoldCode} - ${data.mold.MoldName || ''}`;
        }
        
        this._loadDimensionsForMold(data.mold);
      }
    },

    _handleMoldSearch(query) {
      const q = query.trim().toLowerCase();
      
      if (!q) {
        this.els.moldSearchResults.classList.remove('pa-visible');
        this.state.isManualMold = false;
        this.state.selectedMold = null;
        this._clearDimensionInputs();
        return;
      }
      
      const results = this.state.molds.filter(m => {
        const code = (m.MoldCode || '').toLowerCase();
        const name = (m.MoldName || '').toLowerCase();
        return code.includes(q) || name.includes(q);
      }).slice(0, 10);
      
      if (results.length === 0) {
        this.els.moldSearchResults.innerHTML = `
          <div class="pa-search-empty">
            検索結果なし / No results<br>
            <small>手動入力として扱います / Will use as manual input</small>
          </div>
        `;
        this.els.moldSearchResults.classList.add('pa-visible');
        
        this.state.isManualMold = true;
        this.state.manualMoldName = query;
        this.state.selectedMold = null;
        this._clearDimensionInputs();
        return;
      }
      
      this.els.moldSearchResults.innerHTML = '';
      results.forEach(mold => {
        const item = createEl('div', { class: 'pa-search-item' }, `
          <div class="pa-search-item-name">${escapeHtml(mold.MoldName || mold.MoldCode)}</div>
          <div class="pa-search-item-code">${escapeHtml(mold.MoldCode)}</div>
        `);
        
        item.addEventListener('click', () => {
          this.state.selectedMold = mold;
          this.state.isManualMold = false;
          this.els.moldSearchInput.value = `${mold.MoldCode} - ${mold.MoldName || ''}`;
          this.els.moldSearchResults.classList.remove('pa-visible');
          
          this._loadDimensionsForMold(mold);
        });
        
        this.els.moldSearchResults.appendChild(item);
      });
      
      this.els.moldSearchResults.classList.add('pa-visible');
    },

    _loadDimensionsForMold(mold) {
      console.log('[PhotoAuditTool] Loading dimensions for mold:', mold.MoldID);
      
      let length = '', width = '', depth = '';
      let lengthSrc = null, widthSrc = null, depthSrc = null;
      
      if (mold.MoldDesignID) {
        const design = this.state.molddesigns.find(d => d.MoldDesignID == mold.MoldDesignID);
        if (design) {
          if (design.MoldDesignLength) {
            length = String(design.MoldDesignLength);
            lengthSrc = 'molddesign';
          }
          if (design.MoldDesignWidth) {
            width = String(design.MoldDesignWidth);
            widthSrc = 'molddesign';
          }
          if (design.MoldDesignDepth) {
            depth = String(design.MoldDesignDepth);
            depthSrc = 'molddesign';
          }
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
      if (!depth && mold.MoldHeightModified) {
        depth = String(mold.MoldHeightModified);
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
      [this.els.dimLengthInput, this.els.dimWidthInput, this.els.dimDepthInput].forEach(input => {
        input.value = '';
        input.classList.remove('auto-filled', 'manual-edit');
      });
    },

    _populateEmployeeSelect() {
      if (!this.els.employeeSelect) return;
      
      this.els.employeeSelect.innerHTML = '<option value="">選択してください / Select...</option>';
      
      this.state.employees.forEach(emp => {
        const option = createEl('option', { value: emp.EmployeeID });
        option.textContent = emp.EmployeeNameShort || emp.EmployeeName;
        this.els.employeeSelect.appendChild(option);
      });
      
      if (this.state.selectedEmployee) {
        this.els.employeeSelect.value = this.state.selectedEmployee.id;
      }
    },

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
      loading.classList.add('active');
      
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
        const errorEl = $('#pa-camera-error', this.els.cameraOverlay);
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
    // Tiếp tục từ phần 2...

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
      }, 2500);
    },

    _bindGlobalHooks() {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.state.currentScreen === 'camera') {
            this.closeCamera();
          } else if (this.state.currentScreen === 'settings') {
            this.closeSettings();
          }
        }
      });
      
      document.addEventListener('photoAuditTool:open', (e) => {
        this.openSettings(e.detail);
      });
    }
  };

  // Auto-init
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

  window.PhotoAuditTool = PhotoAuditTool;

})();
