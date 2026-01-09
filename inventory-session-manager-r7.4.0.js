/*
==================================================

INVENTORY SESSION MANAGER R7.4.0

Core logic cho Inventory Management (Session/Audit/Relocate)

- Quick Audit (Mode Q) cũng tạo session (sessionActive = true)
- Mặc định Quick: Selection mode ON (multiSelectEnabled = true)
- Session ID có prefix theo mode: Q-YYYYMMDD-EE-SEQ / A-... / B-...
- Tương thích song song event names:
  - New: inventorymodeChanged, inventoryrequestStartSession, ...
  - Legacy: inventory:modeChanged, inventory:requestStartSession, ...

UI hướng song ngữ Nhật - Việt (ưu tiên JP): confirm/alert/notification dùng JP + VI.

Created: 2026-01-07
Version: r7.4.0

==================================================
*/

(function () {
  'use strict';

  // ========================================
  // CONSTANTS
  // ========================================
  const API_ENDPOINTS = {
    auditBatch: 'https://ysd-moldcutter-backend.onrender.com/api/audit-batch',
    checklog: 'https://ysd-moldcutter-backend.onrender.com/api/checklog',
    locationlog: 'https://ysd-moldcutter-backend.onrender.com/api/locationlog'
  };

  const TIMEOUT_MS = 15000;
  const CHUNK_SIZE = 50;

  const STORAGE_KEYS = {
    config: 'inventory.config.v3',
    session: 'inventory.session.v3',
    history: 'inventory.history.v3',
    sessionCounter: 'inventory.session.counter.v3'
  };

  // ========================================
  // I18N HELPERS (JP first)
  // ========================================
  function t(ja, vi) {
    const jaText = String(ja || '').trim();
    const viText = String(vi || '').trim();
    if (jaText && viText) return `${jaText}\n${viText}`;
    return jaText || viText || '';
  }

  // ========================================
  // GLOBAL STATE
  // ========================================
  const State = {
    inventoryOn: false,
    sessionActive: false,
    multiSelectEnabled: false,

    currentSession: null,
    /*
      Session structure:
      {
        sessionId: string,
        sessionName: string,
        operatorId: string,
        operatorName: string,
        mode: 'A' | 'B' | 'Q',
        note: string,
        targetRackLayerId: string|null,   // Mode A (or temporary compare feature)
        compareEnabled: boolean,          // Mode A (or temporary compare feature)
        startTime: number,
        auditCount: number
      }
    */

    config: {
      rememberOperator: true,
      lastOperatorId: null,
      lastOperatorName: null
    },

    sessionHistory: []
  };

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  function getJSTDate() {
    const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jstDate.toISOString().split('T')[0];
  }

  function getJSTTimestamp() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  }

  function normalizeMode(mode) {
    const m = String(mode || '').trim().toUpperCase();
    if (m === 'A' || m === 'B' || m === 'Q') return m;
    return 'Q';
  }

  function nextDailyCounter(dateStr) {
    let counter = 1;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.sessionCounter);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.date === dateStr) {
          counter = (data.counter || 0) + 1;
        }
      }
      localStorage.setItem(
        STORAGE_KEYS.sessionCounter,
        JSON.stringify({ date: dateStr, counter })
      );
    } catch (e) {
      console.warn('[SessionManager r7.4.0] Failed to load/save counter', e);
    }
    return counter;
  }

  // Session ID format:
  //   Q-YYYYMMDD-EE-SEQ
  //   A-YYYYMMDD-EE-SEQ
  //   B-YYYYMMDD-EE-SEQ
  function generateSessionId(operatorId, mode) {
    const m = normalizeMode(mode);
    const date = getJSTDate().replace(/-/g, ''); // YYYYMMDD
    const empId = String(operatorId || '').padStart(2, '0');
    const counter = nextDailyCounter(date);
    const seq = String(counter).padStart(3, '0');
    return `${m}-${date}-${empId}-${seq}`;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  // ========================================
  // EVENT BRIDGE (New + Legacy)
  // ========================================
  const EventBridge = {
    emitBoth(newName, legacyName, detail) {
      try {
        document.dispatchEvent(new CustomEvent(newName, { detail }));
      } catch (e) {
        console.warn('[SessionManager r7.4.0] emit new event failed', newName, e);
      }
      try {
        document.dispatchEvent(new CustomEvent(legacyName, { detail }));
      } catch (e) {
        console.warn('[SessionManager r7.4.0] emit legacy event failed', legacyName, e);
      }
    },

    onBoth(newName, legacyName, handler, opts) {
      document.addEventListener(newName, handler, opts);
      document.addEventListener(legacyName, handler, opts);
    }
  };

  // ========================================
  // STORAGE MANAGEMENT
  // ========================================
  const Storage = {
    loadConfig() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.config);
        if (raw) {
          const config = safeJsonParse(raw, null);
          if (config && typeof config === 'object') {
            State.config = { ...State.config, ...config };
            console.log('[SessionManager r7.4.0] Config loaded', State.config);
          }
        }
      } catch (e) {
        console.warn('[SessionManager r7.4.0] Failed to load config', e);
      }
    },

    saveConfig() {
      try {
        localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(State.config));
      } catch (e) {
        console.warn('[SessionManager r7.4.0] Failed to save config', e);
      }
    },

    loadHistory() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.history);
        if (raw) {
          const list = safeJsonParse(raw, []);
          if (Array.isArray(list)) {
            State.sessionHistory = list;
          }
          console.log(
            '[SessionManager r7.4.0] History loaded',
            State.sessionHistory.length,
            'sessions'
          );
        }
      } catch (e) {
        console.warn('[SessionManager r7.4.0] Failed to load history', e);
      }
    },

    saveSessionToHistory(session) {
      try {
        if (!session) return;

        State.sessionHistory.unshift({
          sessionId: session.sessionId,
          sessionName: session.sessionName,
          operatorId: session.operatorId,
          operatorName: session.operatorName,
          mode: session.mode,
          note: session.note,
          startTime: session.startTime,
          endTime: Date.now(),
          auditCount: session.auditCount || 0,
          date: getJSTDate()
        });

        if (State.sessionHistory.length > 50) {
          State.sessionHistory = State.sessionHistory.slice(0, 50);
        }

        localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(State.sessionHistory));
      } catch (e) {
        console.warn('[SessionManager r7.4.0] Failed to save session to history', e);
      }
    },

    getHistory() {
      return State.sessionHistory;
    }
  };

  // ========================================
  // STATE MACHINE
  // ========================================
  const StateMachine = {
    // Backward-compatible: inventory ON without session (NOT recommended for r7.4.0 flow)
    // Kept to avoid breaking other modules.
    turnOn(operatorId, operatorName) {
      console.log('[SessionManager r7.4.0] Turning inventory ON (simple mode)');
      State.inventoryOn = true;
      State.sessionActive = false;
      State.multiSelectEnabled = false;

      if (State.config.rememberOperator) {
        State.config.lastOperatorId = operatorId || null;
        State.config.lastOperatorName = operatorName || null;
        Storage.saveConfig();
      }

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(false);
      }

      this.emitStateChange();
      this.emitSessionUpdate();
    },

    turnOff() {
      console.log('[SessionManager r7.4.0] Turning inventory OFF');
      if (State.sessionActive) {
        this.endSession();
      }

      State.inventoryOn = false;
      State.sessionActive = false;
      State.multiSelectEnabled = false;
      State.currentSession = null;

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(false);
        if (typeof window.SelectionManager.clear === 'function') window.SelectionManager.clear();
      }

      this.emitStateChange();
      this.emitSessionUpdate();
    },

    // Start session for mode A/B/Q
    startSession(config) {
      const cfg = config && typeof config === 'object' ? config : {};
      const operatorId = cfg.operatorId || '';
      const operatorName = cfg.operatorName || '';
      const mode = normalizeMode(cfg.mode);
      const note = cfg.note || '';
      const remember = !!cfg.remember;

      const targetRackLayerId =
        cfg.targetRackLayerId !== undefined && cfg.targetRackLayerId !== null && cfg.targetRackLayerId !== ''
          ? String(cfg.targetRackLayerId)
          : null;

      const compareEnabled = !!cfg.compareEnabled;

      // Validate
      if (!operatorId || !operatorName) {
        alert(t('担当者を選択してください。', 'Vui lòng chọn nhân viên.'));
        return false;
      }
      if (String(operatorName).includes('--')) {
        alert(t('担当者を正しく選択してください。', 'Vui lòng chọn nhân viên đúng.'));
        return false;
      }

      // Session ID / Name
      const providedName = (cfg.sessionName || '').trim();
      const sessionId = providedName || generateSessionId(operatorId, mode);

      State.currentSession = {
        sessionId,
        sessionName: sessionId,
        operatorId: String(operatorId),
        operatorName: String(operatorName),
        mode,
        note: String(note || ''),
        targetRackLayerId,
        compareEnabled,
        startTime: Date.now(),
        auditCount: 0
      };

      State.inventoryOn = true;
      State.sessionActive = true;

      // Default ON multi-select for all sessions (A/B/Q) => matches Quick default selection ON requirement.
      State.multiSelectEnabled = true;

      if (remember) {
        State.config.rememberOperator = true;
        State.config.lastOperatorId = String(operatorId);
        State.config.lastOperatorName = String(operatorName);
        Storage.saveConfig();
      }

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(true);
      }

      this.emitStateChange();
      this.emitSessionUpdate();

      console.log('[SessionManager r7.4.0] Session started', State.currentSession);
      return true;
    },

    // Convenience for Quick mode (Q)
    startQuickSession(operatorId, operatorName, remember = true) {
      return this.startSession({
        mode: 'Q',
        operatorId,
        operatorName,
        sessionName: '',
        note: '',
        remember: !!remember,
        targetRackLayerId: null,
        compareEnabled: false
      });
    },

    endSession() {
      console.log('[SessionManager r7.4.0] Ending session');
      if (!State.currentSession) return;

      Storage.saveSessionToHistory(State.currentSession);

      State.currentSession = null;
      State.sessionActive = false;
      State.multiSelectEnabled = false;

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(false);
        if (typeof window.SelectionManager.clear === 'function') window.SelectionManager.clear();
      }

      this.emitStateChange();
      this.emitSessionUpdate();
    },

    setMultiSelect(enabled) {
      const en = !!enabled;
      State.multiSelectEnabled = en;

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(en);
        if (!en && typeof window.SelectionManager.clear === 'function') {
          window.SelectionManager.clear();
        }
      }

      // Emit to UI
      EventBridge.emitBoth(
        'inventorymultiSelectChanged',
        'inventory:multiSelectChanged',
        { enabled: en }
      );

      this.emitStateChange();
    },

    setCompareTarget(targetRackLayerId, compareEnabled) {
      if (!State.currentSession) return;
      State.currentSession.targetRackLayerId =
        targetRackLayerId !== undefined && targetRackLayerId !== null && targetRackLayerId !== ''
          ? String(targetRackLayerId)
          : null;
      State.currentSession.compareEnabled = !!compareEnabled;
      this.emitSessionUpdate();
    },

    emitStateChange() {
      EventBridge.emitBoth(
        'inventorymodeChanged',
        'inventory:modeChanged',
        {
          inventoryOn: State.inventoryOn,
          sessionActive: State.sessionActive,
          multiSelectEnabled: State.multiSelectEnabled
        }
      );
    },

    emitSessionUpdate() {
      EventBridge.emitBoth(
        'inventorysessionUpdated',
        'inventory:sessionUpdated',
        State.currentSession
      );
    }
  };

  // ========================================
  // AUDIT PIPELINE
  // ========================================
  const AuditPipeline = {
    buildNotes(type) {
      const parts = [];
      if (State.currentSession) {
        parts.push(`Session:${State.currentSession.sessionId}`);
        parts.push(`Mode:${State.currentSession.mode}`);
        if (State.currentSession.note) parts.push(`Note:${State.currentSession.note}`);
      }
      parts.push(`Type:${type}`);
      parts.push(`Timestamp:${getJSTTimestamp()}`);
      return parts.join('|');
    },

    async auditSingle(item, itemType) {
      const it = item || {};
      const type = String(itemType || '').toLowerCase() === 'cutter' ? 'cutter' : 'mold';
      const itemId = it.MoldID || it.CutterID || it.id || '';

      if (!itemId) return false;

      const auditDate = getJSTDate();

      const payload = {
        MoldID: type === 'mold' ? itemId : '',
        CutterID: type === 'cutter' ? itemId : '',
        Status: 'AUDIT',
        Timestamp: getJSTTimestamp(),
        EmployeeID: State.currentSession?.operatorId || State.config.lastOperatorId || '',
        DestinationID: '',
        Notes: this.buildNotes('single'),
        AuditDate: auditDate
      };

      const success = await this.sendAuditBatch([payload]);
      if (success) {
        if (State.currentSession) {
          State.currentSession.auditCount += 1;
          StateMachine.emitSessionUpdate();
        }

        EventBridge.emitBoth(
          'inventoryauditCompleted',
          'inventory:auditCompleted',
          { itemId, itemType: type, date: auditDate, mode: 'single' }
        );
        return true;
      }
      return false;
    },

    async auditBatch(items) {
      const list = Array.isArray(items) ? items : [];
      if (list.length < 1) {
        return { success: false, count: 0 };
      }

      const auditDate = getJSTDate();

      const payloads = list.map(({ id, type }) => {
        const t0 = String(type || '').toLowerCase() === 'cutter' ? 'cutter' : 'mold';
        return {
          MoldID: t0 === 'mold' ? id : '',
          CutterID: t0 === 'cutter' ? id : '',
          Status: 'AUDIT',
          Timestamp: getJSTTimestamp(),
          EmployeeID: State.currentSession?.operatorId || State.config.lastOperatorId || '',
          DestinationID: '',
          Notes: this.buildNotes('batch'),
          AuditDate: auditDate
        };
      });

      // Compare/relocate: primarily for mode A, but can be reused if compareEnabled is set.
      if (State.currentSession && State.currentSession.compareEnabled) {
        const needsRelocation = await this.checkRackLayerMismatch(list);
        if (needsRelocation.length > 0) {
          const ok = await this.confirmRelocation(needsRelocation);
          if (ok) {
            await this.relocateBatch(needsRelocation, State.currentSession.targetRackLayerId);
          }
        }
      }

      const success = await this.sendAuditBatch(payloads);
      if (success) {
        if (State.currentSession) {
          State.currentSession.auditCount += list.length;
          StateMachine.emitSessionUpdate();
        }

        if (window.SelectionManager && typeof window.SelectionManager.clear === 'function') {
          window.SelectionManager.clear();
        }

        EventBridge.emitBoth(
          'inventorybatchAuditCompleted',
          'inventory:batchAuditCompleted',
          { items: list, date: auditDate, count: list.length }
        );

        return { success: true, count: list.length };
      }

      return { success: false, count: 0 };
    },

    async relocateAndAudit(item, itemType, newRackLayerId) {
      const it = item || {};
      const type = String(itemType || '').toLowerCase() === 'cutter' ? 'cutter' : 'mold';
      const itemId = it.MoldID || it.CutterID || it.id || '';
      if (!itemId) return false;

      const newId = String(newRackLayerId || '').trim();
      if (!newId) return false;

      const oldRackLayerId = it.RackLayerID || it.rackLayerInfo?.RackLayerID || '';

      const locationPayload = {
        MoldID: type === 'mold' ? itemId : '',
        CutterID: type === 'cutter' ? itemId : '',
        OldRackLayer: oldRackLayerId || '',
        NewRackLayer: newId,
        Timestamp: getJSTTimestamp(),
        Notes: this.buildNotes('relocate')
      };

      const locationSuccess = await this.sendLocationUpdate(locationPayload);
      if (!locationSuccess) return false;

      const auditDate = getJSTDate();
      const auditPayload = {
        MoldID: type === 'mold' ? itemId : '',
        CutterID: type === 'cutter' ? itemId : '',
        Status: 'AUDIT',
        Timestamp: getJSTTimestamp(),
        EmployeeID: State.currentSession?.operatorId || State.config.lastOperatorId || '',
        DestinationID: '',
        Notes: this.buildNotes('relocate+audit'),
        AuditDate: auditDate
      };

      const auditSuccess = await this.sendAuditBatch([auditPayload]);
      if (auditSuccess) {
        if (State.currentSession) {
          State.currentSession.auditCount += 1;
          StateMachine.emitSessionUpdate();
        }

        EventBridge.emitBoth(
          'inventoryrelocateCompleted',
          'inventory:relocateCompleted',
          { itemId, itemType: type, oldRackLayerId, newRackLayerId: newId, date: auditDate }
        );
        return true;
      }

      return false;
    },

    async sendAuditBatch(payloads) {
      const list = Array.isArray(payloads) ? payloads : [];
      if (list.length === 0) return false;

      const chunks = [];
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        chunks.push(list.slice(i, i + CHUNK_SIZE));
      }

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const response = await fetchWithTimeout(
            API_ENDPOINTS.auditBatch,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chunk)
            },
            TIMEOUT_MS
          );

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const result = await response.json();
          if (!result || result.success !== true) {
            throw new Error(result?.message || 'API returned error');
          }

          successCount += chunk.length;
        } catch (err) {
          failureCount += chunk.length;
          this.saveToCache(chunk, 'audit');
          console.error('[SessionManager r7.4.0] Audit chunk failed', i + 1, err);
        }

        if (i < chunks.length - 1) await delay(200);
      }

      if (failureCount === 0) {
        this.showNotification(
          t(`監査（棚卸）成功：${successCount}件`, `Kiểm kê thành công: ${successCount} mục`),
          'success'
        );
      } else if (successCount > 0) {
        this.showNotification(
          t(
            `一部成功：${successCount}件、キャッシュ保存：${failureCount}件`,
            `Lưu thành công: ${successCount} mục, lưu cache: ${failureCount} mục`
          ),
          'warning'
        );
      } else {
        this.showNotification(
          t(`エラー：キャッシュ保存：${failureCount}件`, `Lỗi! Đã lưu cache: ${failureCount} mục`),
          'error'
        );
      }

      return successCount > 0;
    },

    async sendLocationUpdate(payload) {
      try {
        const response = await fetchWithTimeout(
          API_ENDPOINTS.locationlog,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          },
          TIMEOUT_MS
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        if (!result || result.success !== true) {
          throw new Error(result?.message || 'API returned error');
        }

        return true;
      } catch (err) {
        this.saveToCache([payload], 'location');
        console.error('[SessionManager r7.4.0] Location update failed', err);
        return false;
      }
    },

    async checkRackLayerMismatch(items) {
      const targetRackLayerId = State.currentSession?.targetRackLayerId;
      if (!targetRackLayerId) return [];

      const list = Array.isArray(items) ? items : [];
      return list.filter(({ data }) => {
        const d = data || {};
        const currentRackLayerId = d.RackLayerID || d.rackLayerInfo?.RackLayerID || '';
        return String(currentRackLayerId) !== String(targetRackLayerId);
      });
    },

    async confirmRelocation(items) {
      const cnt = Array.isArray(items) ? items.length : 0;
      if (cnt <= 0) return false;
      return confirm(
        t(
          `${cnt}件の位置が一致しません。\n位置を更新しますか？`,
          `${cnt} thiết bị có vị trí khác.\nCập nhật vị trí?`
        )
      );
    },

    async relocateBatch(items, targetRackLayerId) {
      if (!targetRackLayerId) return;

      const list = Array.isArray(items) ? items : [];
      for (const it of list) {
        const id = it.id;
        const type = String(it.type || '').toLowerCase() === 'cutter' ? 'cutter' : 'mold';
        const d = it.data || {};
        const oldRack = d.RackLayerID || d.rackLayerInfo?.RackLayerID || '';

        const payload = {
          MoldID: type === 'mold' ? id : '',
          CutterID: type === 'cutter' ? id : '',
          OldRackLayer: oldRack || '',
          NewRackLayer: String(targetRackLayerId),
          Timestamp: getJSTTimestamp(),
          Notes: this.buildNotes('batch-relocate')
        };

        await this.sendLocationUpdate(payload);
        await delay(100);
      }
    },

    saveToCache(payloads, type) {
      try {
        const cacheKey = `inventory.cache.${type}.${Date.now()}`;
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ payloads, type, timestamp: Date.now() })
        );
      } catch (e) {
        console.error('[SessionManager r7.4.0] Failed to save cache', e);
      }
    },

    showNotification(message, type = 'info') {
      EventBridge.emitBoth(
        'inventorynotification',
        'inventory:notification',
        { message, type }
      );
      console.log(`[SessionManager r7.4.0] Notification [${type}]`, message);
    }
  };

  // ========================================
  // EVENT HANDLERS
  // ========================================
  const EventHandlers = {
    handleRequestClose(e) {
      const exitAll = !!(e && e.detail && e.detail.exitAll);
      if (exitAll) StateMachine.turnOff();
      else {
        if (State.sessionActive) StateMachine.endSession();
        else StateMachine.turnOff();
      }
    },

    handleRequestExitSession() {
      if (!State.sessionActive) return;
      const ok = confirm(t('セッションを終了しますか？', 'Thoát phiên kiểm kê?'));
      if (ok) StateMachine.endSession();
    },

    handleRequestStartSession(e) {
      const cfg = (e && e.detail) || {};
      StateMachine.startSession(cfg);
    },

    handleRequestStartQuickSession(e) {
      const cfg = (e && e.detail) || {};
      const operatorId = cfg.operatorId || '';
      const operatorName = cfg.operatorName || '';
      const remember = cfg.remember !== undefined ? !!cfg.remember : true;
      StateMachine.startQuickSession(operatorId, operatorName, remember);
    },

    handleMultiSelectChanged(e) {
      const enabled = !!(e && e.detail && (e.detail.enabled !== undefined ? e.detail.enabled : e.detail));
      StateMachine.setMultiSelect(enabled);
    },

    async handleRequestAuditSingle() {
      if (!window.SelectionManager || typeof window.SelectionManager.getSelectedItems !== 'function') return;
      const items = window.SelectionManager.getSelectedItems() || [];
      if (items.length !== 1) return;

      const one = items[0];
      await AuditPipeline.auditSingle(one.data || { MoldID: one.id, CutterID: one.id }, one.type);
    },

    async handleRequestAuditBatch() {
      if (!window.SelectionManager || typeof window.SelectionManager.getSelectedItems !== 'function') return;
      const items = window.SelectionManager.getSelectedItems() || [];
      if (items.length < 1) return;
      await AuditPipeline.auditBatch(items);
    },

    async handleRequestRelocateAndAudit(e) {
      const d = (e && e.detail) || {};
      const item = d.item || d.data || null;
      const itemType = d.itemType || d.type || 'mold';
      const newRackLayerId = d.newRackLayerId || d.rackLayerId || '';
      if (!item || !newRackLayerId) return;
      await AuditPipeline.relocateAndAudit(item, itemType, newRackLayerId);
    },

    handleSelectionChanged(e) {
      const items = (e && e.detail && e.detail.items) ? e.detail.items : [];
      const count = Array.isArray(items) ? items.length : 0;

      EventBridge.emitBoth(
        'inventoryselectionChanged',
        'inventory:selectionChanged',
        { count, items }
      );
    },

    handleRequestHistory() {
      const sessions = Storage.getHistory();
      EventBridge.emitBoth(
        'inventoryhistoryData',
        'inventory:historyData',
        { sessions }
      );
    },

    handleOpenHistoryView(e) {
      const sessionId = e && e.detail ? e.detail.sessionId : null;
      if (!sessionId) return;

      document.dispatchEvent(
        new CustomEvent('openHistoryView', {
          detail: { filterType: 'session', filterValue: sessionId }
        })
      );
    },

    handleRequestSetCompareTarget(e) {
      const d = (e && e.detail) || {};
      StateMachine.setCompareTarget(d.targetRackLayerId, d.compareEnabled);
    }
  };

  // ========================================
  // PUBLIC API
  // ========================================
  window.InventorySessionManager = {
    init() {
      console.log('[InventorySessionManager r7.4.0] Initializing...');

      Storage.loadConfig();
      Storage.loadHistory();

      // Reset runtime state on page load
      State.inventoryOn = false;
      State.sessionActive = false;
      State.multiSelectEnabled = false;
      State.currentSession = null;

      if (window.SelectionManager && typeof window.SelectionManager.setMode === 'function') {
        window.SelectionManager.setMode(false);
        if (typeof window.SelectionManager.clear === 'function') window.SelectionManager.clear();
      }

      this.bindEvents();

      console.log('[InventorySessionManager r7.4.0] Initialized');
    },

    bindEvents() {
      // Close
      EventBridge.onBoth(
        'inventoryrequestClose',
        'inventory:requestClose',
        EventHandlers.handleRequestClose.bind(EventHandlers)
      );

      // Exit session
      EventBridge.onBoth(
        'inventoryrequestExitSession',
        'inventory:requestExitSession',
        EventHandlers.handleRequestExitSession.bind(EventHandlers)
      );

      // Start session (A/B/Q)
      EventBridge.onBoth(
        'inventoryrequestStartSession',
        'inventory:requestStartSession',
        EventHandlers.handleRequestStartSession.bind(EventHandlers)
      );

      // Start quick session (explicit)
      EventBridge.onBoth(
        'inventoryrequestStartQuickSession',
        'inventory:requestStartQuickSession',
        EventHandlers.handleRequestStartQuickSession.bind(EventHandlers)
      );

      // Multi-select (Selection mode)
      EventBridge.onBoth(
        'inventorymultiSelectChanged',
        'inventory:multiSelectChanged',
        EventHandlers.handleMultiSelectChanged.bind(EventHandlers)
      );

      // Audit
      EventBridge.onBoth(
        'inventoryrequestAuditSingle',
        'inventory:requestAuditSingle',
        EventHandlers.handleRequestAuditSingle.bind(EventHandlers)
      );

      EventBridge.onBoth(
        'inventoryrequestAuditBatch',
        'inventory:requestAuditBatch',
        EventHandlers.handleRequestAuditBatch.bind(EventHandlers)
      );

      // Relocate + Audit
      EventBridge.onBoth(
        'inventoryrequestRelocateAndAudit',
        'inventory:requestRelocateAndAudit',
        EventHandlers.handleRequestRelocateAndAudit.bind(EventHandlers)
      );

      // Set compare target (RackLayer input on tool)
      EventBridge.onBoth(
        'inventoryrequestSetCompareTarget',
        'inventory:requestSetCompareTarget',
        EventHandlers.handleRequestSetCompareTarget.bind(EventHandlers)
      );

      // History
      EventBridge.onBoth(
        'inventoryrequestHistory',
        'inventory:requestHistory',
        EventHandlers.handleRequestHistory.bind(EventHandlers)
      );

      EventBridge.onBoth(
        'inventoryopenHistoryView',
        'inventory:openHistoryView',
        EventHandlers.handleOpenHistoryView.bind(EventHandlers)
      );

      // SelectionManager -> session manager
      document.addEventListener(
        'selectionchanged',
        EventHandlers.handleSelectionChanged.bind(EventHandlers)
      );

      console.log('[InventorySessionManager r7.4.0] Events bound');
    },

    // Legacy/simple mode (kept)
    turnOn(operatorId, operatorName) {
      StateMachine.turnOn(operatorId, operatorName);
    },

    turnOff() {
      StateMachine.turnOff();
    },

    startSession(config) {
      return StateMachine.startSession(config);
    },

    // New helper for Quick
    startQuickSession(operatorId, operatorName, remember = true) {
      return StateMachine.startQuickSession(operatorId, operatorName, remember);
    },

    endSession() {
      StateMachine.endSession();
    },

    setMultiSelect(enabled) {
      StateMachine.setMultiSelect(enabled);
    },

    setCompareTarget(targetRackLayerId, compareEnabled) {
      StateMachine.setCompareTarget(targetRackLayerId, compareEnabled);
    },

    getState() {
      return {
        inventoryOn: State.inventoryOn,
        sessionActive: State.sessionActive,
        multiSelectEnabled: State.multiSelectEnabled,
        currentSession: State.currentSession,
        config: State.config
      };
    },

    getHistory() {
      return Storage.getHistory();
    }
  };

  // ========================================
  // AUTO INIT
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.InventorySessionManager.init();
    });
  } else {
    window.InventorySessionManager.init();
  }
})();
