/* ============================================================
   photo-audit-tool-r1.0.0.js
   写真監査ツール / Photo Audit Tool
   - Camera capture + resize HD (1920×1080)
   - Mold search/select from DataManager
   - Employee selection (default: トアン)
   - Upload to Supabase Storage
   - Send email via Edge Function + Resend
   - Audit logging
   ============================================================ */

(function () {
  'use strict';

  const MODULE_VERSION = 'r1.0.0';

  // Supabase configuration (credentials pre-filled)
  const SUPABASE_URL = 'https://bgpnhvhouplvekaaheqy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncG5odmhvdXBsdmVrYWFoZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2NjAxOTIsImV4cCI6MjA1NzIzNjE5Mn0.0PJJUjGOjkcEMl-hQhajn0IW4pLQNUHDDAeprE5DG1w';
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-photo-audit`;
  const STORAGE_BUCKET = 'mold-photos';

  // Default employee (トアン from employees.csv)
  const DEFAULT_EMPLOYEE = {
    id: 'EMP001',
    name: 'トアン',
    name_vi: 'Toàn'
  };

  // ---------- Utilities ----------
  function $(sel, root = document) {
    return root.querySelector(sel);
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
    try {
      return new Date().toISOString();
    } catch {
      return String(Date.now());
    }
  }

  function formatDateJP() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  async function resizeImageToHD(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Target HD resolution
        const targetWidth = 1920;
        const targetHeight = 1080;
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // Calculate aspect ratio fit
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (imgRatio > targetRatio) {
          // Image wider than target - fit height
          drawHeight = targetHeight;
          drawWidth = drawHeight * imgRatio;
          offsetX = (targetWidth - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Image taller than target - fit width
          drawWidth = targetWidth;
          drawHeight = drawWidth / imgRatio;
          offsetX = 0;
          offsetY = (targetHeight - drawHeight) / 2;
        }
        
        // Fill black background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        
        // Draw image centered
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        
        canvas.toBlob((resizedBlob) => {
          resolve(resizedBlob);
        }, 'image/jpeg', 0.92);
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  // ---------- Supabase Client ----------
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

  // ---------- Module ----------
  const PhotoAuditTool = {
    state: {
      initialized: false,
      opened: false,
      stream: null,
      facingMode: 'environment',
      capturedBlob: null,
      selectedMold: null,
      selectedEmployee: DEFAULT_EMPLOYEE,
      customEmployeeName: '',
      useCustomEmployee: false,
      employees: [],
      molds: [],
      sending: false
    },

    els: {
      overlay: null,
      video: null,
      canvas: null,
      previewImg: null,
      cameraWrap: null,
      cameraStatus: null,
      btnCapture: null,
      btnFlip: null,
      btnClose: null,
      btnRetake: null,
      btnSend: null,
      moldSearchInput: null,
      moldSearchResults: null,
      employeeSelect: null,
      customEmployeeInput: null,
      customEmployeeToggle: null
    },

    init() {
      if (this.state.initialized) return;
      
      this._loadEmployees();
      this._loadMolds();
      this._buildUI();
      this._bindGlobalHooks();
      
      this.state.initialized = true;
      
      // Auto-hook nav button
      const navBtn = document.getElementById('nav-photo-audit-btn');
      if (navBtn) {
        navBtn.addEventListener('click', () => this.open());
      }
      
      window.PhotoAuditTool = this;
      window.dispatchEvent(new CustomEvent('photoAuditTool:ready', { 
        detail: { version: MODULE_VERSION } 
      }));
      
      console.log(`[PhotoAuditTool] Initialized ${MODULE_VERSION}`);
    },

    async open() {
      if (!this.state.initialized) this.init();
      if (this.state.opened) return;
      
      this.state.opened = true;
      this.els.overlay.classList.remove('pa-hidden');
      
      // Reset state
      this.state.capturedBlob = null;
      this.state.selectedMold = null;
      this.state.selectedEmployee = DEFAULT_EMPLOYEE;
      this.state.useCustomEmployee = false;
      this.state.customEmployeeName = '';
      
      this._resetUI();
      this._populateEmployeeSelect();
      
      // Start camera
      await this._startCamera();
      
      // Prevent background scroll
      try {
        document.body.style.overflow = 'hidden';
      } catch (_) {}
    },

    async close() {
      if (!this.state.opened) return;
      
      await this._stopCamera();
      
      this.state.opened = false;
      this.els.overlay.classList.add('pa-hidden');
      
      try {
        document.body.style.overflow = '';
      } catch (_) {}
    },

    async capturePhoto() {
      if (!this.state.stream) {
        this._toast('カメラ未起動', 'Camera chưa bật');
        return;
      }
      
      const video = this.els.video;
      const canvas = this.els.canvas;
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current frame
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          this._toast('撮影失敗', 'Chụp thất bại');
          return;
        }
        
        // Resize to HD
        const resizedBlob = await resizeImageToHD(blob);
        this.state.capturedBlob = resizedBlob;
        
        // Show preview
        const url = URL.createObjectURL(resizedBlob);
        this.els.previewImg.src = url;
        this.els.previewImg.classList.add('pa-visible');
        this.els.video.style.display = 'none';
        
        // Stop camera
        await this._stopCamera();
        
        // Update UI
        this.els.btnCapture.style.display = 'none';
        this.els.btnFlip.style.display = 'none';
        this.els.btnRetake.style.display = 'inline-flex';
        this.els.cameraStatus.textContent = '写真プレビュー / Preview';
        
        this._toast('撮影完了', 'Đã chụp');
      }, 'image/jpeg', 0.95);
    },

    async retakePhoto() {
      // Clear preview
      this.els.previewImg.classList.remove('pa-visible');
      this.els.previewImg.src = '';
      this.els.video.style.display = 'block';
      
      // Clear captured blob
      this.state.capturedBlob = null;
      
      // Update UI
      this.els.btnCapture.style.display = 'flex';
      this.els.btnFlip.style.display = 'flex';
      this.els.btnRetake.style.display = 'none';
      this.els.cameraStatus.textContent = 'カメラ起動中 / Camera active';
      
      // Restart camera
      await this._startCamera();
    },

    async flipCamera() {
      const current = this.state.facingMode;
      const next = current === 'environment' ? 'user' : 'environment';
      this.state.facingMode = next;
      
      await this._stopCamera();
      await this._startCamera();
      
      this._toast('カメラ切替', 'Đã đổi camera');
    },

    async sendPhotoAudit() {
      // Validate
      if (!this.state.capturedBlob) {
        this._toast('写真未撮影', 'Chưa chụp ảnh');
        return;
      }
      
      if (!this.state.selectedMold) {
        this._toast('金型未選択', 'Chưa chọn khuôn');
        return;
      }
      
      // Get employee name
      let employeeName, employeeId;
      if (this.state.useCustomEmployee) {
        employeeName = this.state.customEmployeeName.trim();
        if (!employeeName) {
          this._toast('担当者名入力', 'Nhập tên người chụp');
          return;
        }
        employeeId = null;
      } else {
        employeeName = this.state.selectedEmployee.name;
        employeeId = this.state.selectedEmployee.id;
      }
      
      if (this.state.sending) return;
      this.state.sending = true;
      
      this.els.btnSend.disabled = true;
      this.els.btnSend.innerHTML = '<span class="photo-audit-loading"></span> 送信中 / Đang gửi';
      
      try {
        // 1. Upload to Supabase Storage
        const fileName = `${this.state.selectedMold.MoldCode}_${Date.now()}.jpg`;
        
        await supabaseClient.uploadFile(STORAGE_BUCKET, fileName, this.state.capturedBlob);
        
        const photoUrl = supabaseClient.getPublicUrl(STORAGE_BUCKET, fileName);
        
        // 2. Call Edge Function to send email
        const payload = {
          moldName: this.state.selectedMold.MoldName || this.state.selectedMold.MoldCode,
          moldCode: this.state.selectedMold.MoldCode,
          moldId: this.state.selectedMold.MoldID,
          photoFileName: fileName,
          employee: employeeName,
          employeeId: employeeId,
          date: formatDateJP()
        };
        
        await supabaseClient.callEdgeFunction('send-photo-audit', payload);
        
        // 3. Dispatch audit event for local tracking
        const auditNote = this.state.useCustomEmployee 
          ? `自動確認（写真監査） - 担当: ${employeeName}（手動入力）`
          : '自動確認（写真監査）';
        
        document.dispatchEvent(new CustomEvent('photoAudit:completed', {
          detail: {
            moldId: this.state.selectedMold.MoldID,
            moldCode: this.state.selectedMold.MoldCode,
            employeeName: employeeName,
            employeeId: employeeId,
            photoUrl: photoUrl,
            auditNote: auditNote,
            timestamp: nowISO()
          }
        }));
        
        this._toast('送信完了 ✓', 'Đã gửi thành công');
        
        // Close after delay
        setTimeout(() => {
          this.close();
        }, 1500);
        
      } catch (error) {
        console.error('[PhotoAuditTool] Send failed:', error);
        this._toast('送信失敗', 'Gửi thất bại: ' + error.message);
        
        this.els.btnSend.disabled = false;
        this.els.btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> 送信 / Gửi';
      } finally {
        this.state.sending = false;
      }
    },

    // ---------- Camera ----------
    async _startCamera() {
      await this._stopCamera();
      
      const video = this.els.video;
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
        
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.muted = true;
        video.autoplay = true;
        
        await video.play();
        
        this.els.cameraStatus.innerHTML = '<span class="pa-dot"></span> カメラ起動中 / Camera active';
        
      } catch (error) {
        console.error('[PhotoAuditTool] Camera error:', error);
        this._toast('カメラ失敗', 'Không mở được camera');
        this.els.cameraStatus.textContent = 'カメラエラー / Camera error';
      }
    },

    async _stopCamera() {
      if (this.state.stream) {
        this.state.stream.getTracks().forEach(track => track.stop());
        this.state.stream = null;
      }
      
      if (this.els.video) {
        this.els.video.srcObject = null;
      }
    },

    // ---------- Data Loading ----------
    _loadEmployees() {
      // Try to load from DataManager or parse employees.csv
      if (window.DataManager && window.DataManager.employees) {
        this.state.employees = window.DataManager.employees;
      } else {
        // Fallback: default employees
        this.state.employees = [
          { EmployeeID: 'EMP001', EmployeeName: 'トアン' },
          { EmployeeID: 'EMP002', EmployeeName: '山田' },
          { EmployeeID: 'EMP003', EmployeeName: '佐藤' }
        ];
      }
    },

    _loadMolds() {
      if (window.DataManager && window.DataManager.molds) {
        this.state.molds = window.DataManager.molds;
      } else {
        this.state.molds = [];
        console.warn('[PhotoAuditTool] DataManager.molds not found');
      }
    },

    // ---------- UI ----------
    _buildUI() {
      const overlay = createEl('div', { 
        class: 'photo-audit-overlay pa-hidden', 
        id: 'photo-audit-overlay' 
      });
      
      const dialog = createEl('div', { class: 'photo-audit-dialog' });
      
      // Header
      const header = createEl('div', { class: 'photo-audit-header' }, `
        <div class="photo-audit-title">
          <div class="photo-audit-title-main">写真監査ツール / Photo Audit (${MODULE_VERSION})</div>
          <div class="photo-audit-title-sub">金型写真を撮影してメール送信 / Chụp ảnh khuôn và gửi email</div>
        </div>
        <div class="photo-audit-header-actions">
          <button class="photo-audit-btn photo-audit-btn-icon photo-audit-btn-danger" id="pa-btn-close" title="閉じる / Đóng">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `);
      
      // Body
      const body = createEl('div', { class: 'photo-audit-body' });
      
      // Camera area
      const cameraWrap = createEl('div', { class: 'photo-audit-camera-wrap' }, `
        <div class="photo-audit-camera-status" id="pa-camera-status">
          <span class="pa-dot"></span> カメラ起動中 / Camera active
        </div>
        <video class="photo-audit-video" id="pa-video" autoplay playsinline muted></video>
        <canvas class="photo-audit-canvas-hidden" id="pa-canvas"></canvas>
        <img class="photo-audit-preview-img" id="pa-preview-img" alt="Preview" />
        <div class="photo-audit-camera-controls">
          <button class="photo-audit-btn-flip" id="pa-btn-flip" title="カメラ切替 / Đổi camera">
            <i class="fas fa-sync-alt"></i>
          </button>
          <button class="photo-audit-btn-capture" id="pa-btn-capture" title="撮影 / Chụp">
            <i class="fas fa-camera"></i>
          </button>
          <button class="photo-audit-btn photo-audit-btn-secondary" id="pa-btn-retake" style="display:none;">
            <i class="fas fa-redo"></i> 再撮影 / Chụp lại
          </button>
        </div>
      `);
      
      // Form
      const form = createEl('div', { class: 'photo-audit-form' }, `
        <div class="photo-audit-field">
          <label class="photo-audit-label">
            <i class="fas fa-cube"></i> 金型名 / Tên khuôn <span class="pa-required">*</span>
          </label>
          <div class="photo-audit-mold-search-wrap">
            <input 
              type="text" 
              class="photo-audit-input" 
              id="pa-mold-search" 
              placeholder="検索: コードまたは名前 / Search: Code or Name..."
              autocomplete="off"
            />
            <div class="photo-audit-search-results pa-hidden" id="pa-search-results"></div>
          </div>
        </div>
        
        <div class="photo-audit-field">
          <label class="photo-audit-label">
            <i class="fas fa-user"></i> 担当者 / Người chụp <span class="pa-required">*</span>
          </label>
          <select class="photo-audit-select" id="pa-employee-select">
            <option value="">選択してください / Chọn...</option>
          </select>
          <div class="photo-audit-employee-toggle">
            <label class="photo-audit-toggle-label">
              <input type="checkbox" id="pa-custom-employee-toggle" />
              <span>手動入力 / Nhập thủ công</span>
            </label>
          </div>
          <input 
            type="text" 
            class="photo-audit-input pa-hidden" 
            id="pa-custom-employee-input" 
            placeholder="担当者名を入力 / Nhập tên..."
            disabled
          />
        </div>
      `);
      
      body.appendChild(cameraWrap);
      body.appendChild(form);
      
      // Footer
      const footer = createEl('div', { class: 'photo-audit-footer' }, `
        <button class="photo-audit-btn photo-audit-btn-success" id="pa-btn-send" disabled>
          <i class="fas fa-paper-plane"></i> 送信 / Gửi
        </button>
      `);
      
      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      // Bind elements
      this.els.overlay = overlay;
      this.els.video = $('#pa-video', overlay);
      this.els.canvas = $('#pa-canvas', overlay);
      this.els.previewImg = $('#pa-preview-img', overlay);
      this.els.cameraWrap = cameraWrap;
      this.els.cameraStatus = $('#pa-camera-status', overlay);
      this.els.btnCapture = $('#pa-btn-capture', overlay);
      this.els.btnFlip = $('#pa-btn-flip', overlay);
      this.els.btnClose = $('#pa-btn-close', overlay);
      this.els.btnRetake = $('#pa-btn-retake', overlay);
      this.els.btnSend = $('#pa-btn-send', overlay);
      this.els.moldSearchInput = $('#pa-mold-search', overlay);
      this.els.moldSearchResults = $('#pa-search-results', overlay);
      this.els.employeeSelect = $('#pa-employee-select', overlay);
      this.els.customEmployeeInput = $('#pa-custom-employee-input', overlay);
      this.els.customEmployeeToggle = $('#pa-custom-employee-toggle', overlay);
      
      // Events
      this.els.btnClose.addEventListener('click', () => this.close());
      this.els.btnCapture.addEventListener('click', () => this.capturePhoto());
      this.els.btnFlip.addEventListener('click', () => this.flipCamera());
      this.els.btnRetake.addEventListener('click', () => this.retakePhoto());
      this.els.btnSend.addEventListener('click', () => this.sendPhotoAudit());
      
      // Mold search
      this.els.moldSearchInput.addEventListener('input', (e) => {
        this._handleMoldSearch(e.target.value);
      });
      
      this.els.moldSearchInput.addEventListener('focus', () => {
        if (this.els.moldSearchInput.value) {
          this.els.moldSearchResults.classList.add('pa-visible');
        }
      });
      
      // Employee select
      this.els.employeeSelect.addEventListener('change', (e) => {
        const empId = e.target.value;
        const emp = this.state.employees.find(e => e.EmployeeID === empId);
        if (emp) {
          this.state.selectedEmployee = {
            id: emp.EmployeeID,
            name: emp.EmployeeName
          };
        }
        this._updateSendButton();
      });
      
      // Custom employee toggle
      this.els.customEmployeeToggle.addEventListener('change', (e) => {
        const checked = e.target.checked;
        this.state.useCustomEmployee = checked;
        
        this.els.employeeSelect.disabled = checked;
        this.els.customEmployeeInput.disabled = !checked;
        this.els.customEmployeeInput.classList.toggle('pa-hidden', !checked);
        
        if (checked) {
          this.els.customEmployeeInput.focus();
        }
        
        this._updateSendButton();
      });
      
      this.els.customEmployeeInput.addEventListener('input', (e) => {
        this.state.customEmployeeName = e.target.value;
        this._updateSendButton();
      });
      
      // Click outside to close search results
      document.addEventListener('click', (e) => {
        if (!this.els.moldSearchInput.contains(e.target) && 
            !this.els.moldSearchResults.contains(e.target)) {
          this.els.moldSearchResults.classList.remove('pa-visible');
        }
      });
      
      // Overlay click to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    },

    _bindGlobalHooks() {
      // ESC to close
      window.addEventListener('keydown', (e) => {
        if (this.state.opened && e.key === 'Escape') {
          this.close();
        }
      });
      
      // External commands
      document.addEventListener('photoAuditTool:open', () => this.open());
      document.addEventListener('photoAuditTool:close', () => this.close());
    },

    _resetUI() {
      this.els.video.style.display = 'block';
      this.els.previewImg.classList.remove('pa-visible');
      this.els.previewImg.src = '';
      this.els.btnCapture.style.display = 'flex';
      this.els.btnFlip.style.display = 'flex';
      this.els.btnRetake.style.display = 'none';
      this.els.moldSearchInput.value = '';
      this.els.moldSearchResults.innerHTML = '';
      this.els.moldSearchResults.classList.remove('pa-visible');
      this.els.employeeSelect.value = this.state.employees[0]?.EmployeeID || '';
      this.els.customEmployeeToggle.checked = false;
      this.els.customEmployeeInput.value = '';
      this.els.customEmployeeInput.disabled = true;
      this.els.customEmployeeInput.classList.add('pa-hidden');
      this.els.employeeSelect.disabled = false;
      this.els.btnSend.disabled = true;
      this.els.btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> 送信 / Gửi';
    },

    _populateEmployeeSelect() {
      this.els.employeeSelect.innerHTML = '<option value="">選択してください / Chọn...</option>';
      
      this.state.employees.forEach(emp => {
        const option = createEl('option', { value: emp.EmployeeID });
        option.textContent = emp.EmployeeName;
        this.els.employeeSelect.appendChild(option);
      });
      
      // Select default (トアン)
      const defaultEmp = this.state.employees.find(e => e.EmployeeName === 'トアン');
      if (defaultEmp) {
        this.els.employeeSelect.value = defaultEmp.EmployeeID;
        this.state.selectedEmployee = {
          id: defaultEmp.EmployeeID,
          name: defaultEmp.EmployeeName
        };
      }
    },

    _handleMoldSearch(query) {
      const q = query.trim().toLowerCase();
      
      if (!q) {
        this.els.moldSearchResults.classList.remove('pa-visible');
        return;
      }
      
      const results = this.state.molds.filter(m => {
        const code = (m.MoldCode || '').toLowerCase();
        const name = (m.MoldName || '').toLowerCase();
        return code.includes(q) || name.includes(q);
      }).slice(0, 10);
      
      if (results.length === 0) {
        this.els.moldSearchResults.innerHTML = '<div class="photo-audit-search-empty">検索結果なし / Không tìm thấy</div>';
        this.els.moldSearchResults.classList.add('pa-visible');
        return;
      }
      
      this.els.moldSearchResults.innerHTML = '';
      results.forEach(mold => {
        const item = createEl('div', { class: 'photo-audit-search-item' }, `
          <div class="photo-audit-search-item-name">${mold.MoldName || mold.MoldCode}</div>
          <div class="photo-audit-search-item-code">${mold.MoldCode}</div>
        `);
        
        item.addEventListener('click', () => {
          this.state.selectedMold = mold;
          this.els.moldSearchInput.value = `${mold.MoldCode} - ${mold.MoldName || ''}`;
          this.els.moldSearchResults.classList.remove('pa-visible');
          this._updateSendButton();
        });
        
        this.els.moldSearchResults.appendChild(item);
      });
      
      this.els.moldSearchResults.classList.add('pa-visible');
    },

    _updateSendButton() {
      const hasPhoto = !!this.state.capturedBlob;
      const hasMold = !!this.state.selectedMold;
      const hasEmployee = this.state.useCustomEmployee 
        ? !!this.state.customEmployeeName.trim()
        : !!this.state.selectedEmployee;
      
      const canSend = hasPhoto && hasMold && hasEmployee;
      this.els.btnSend.disabled = !canSend;
    },

    _toast(jp, vi) {
      let toast = document.getElementById('photo-audit-toast');
      if (!toast) {
        toast = createEl('div', { 
          id: 'photo-audit-toast', 
          class: 'photo-audit-toast' 
        });
        document.body.appendChild(toast);
      }
      
      toast.textContent = `${jp} / ${vi}`;
      toast.classList.add('pa-visible');
      
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.remove('pa-visible');
      }, 2500);
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
