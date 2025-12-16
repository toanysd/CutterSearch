/**
 * ========================================================================
 * teflon-process-manager-r7.1.3.js
 * ==========================================================
 * Module nghiệp vụ mạ Teflon nâng cao - inspired by VBA workflow
 * テフロン加工依頼・完了処理モジュール（改良版）
 *
 * CHANGELOG r7.1.3 (2025-12-16 18:38):
 * ✅ Thêm trạng thái trống (empty) cho dropdown - reset trạng thái
 * ✅ Bảng lịch sử với nút Lock/Unlock scroll ngang
 * ✅ Chức năng xóa lịch sử từng dòng
 * ✅ Cải thiện UI bảng lịch sử theo phong cách history-view
 * ✅ Sticky header cho bảng lịch sử
 * ✅ Nhất quán với mobile-detail-modal và history-view
 *
 * Backend:
 * - POST {API_BASE}/api/add-log (teflonlog.csv, statuslogs.csv)
 * - POST {API_BASE}/api/update-item (molds.csv)
 * - DELETE {API_BASE}/api/delete-log (teflonlog.csv) - NEW
 * ========================================================================
 */

(function () {
  'use strict';

  const API_BASE = 'https://ysd-moldcutter-backend.onrender.com';
  const API_ADD_LOG = API_BASE + '/api/add-log';
  const API_UPDATE_ITEM = API_BASE + '/api/update-item';
  const API_DELETE_LOG = API_BASE + '/api/delete-log'; // ✅ NEW: Delete endpoint

  // Config
  const DEFAULT_SUPPLIER_ID = '7'; // ID=7: Nhà cung cấp Teflon mặc định
  const DEFAULT_EMPLOYEE_ID = '1'; // ID=1: Toàn (người gửi mặc định)

  let currentItem = null;
  let isSaving = false;

  // ============================
  // Teflon status mapping
  // ============================
  // UI label stored in molds.TeflonCoating (legacy) is Japanese label.
  const TEFLON_COATING_LABELS = {
    empty: '',                          // ✅ NEW: Empty state
    pending: 'テフロン加工承認待ち',      // Chờ phê duyệt
    approved: '承認済(発送待ち)',         // Đã duyệt (chờ gửi)
    sent: 'テフロン加工中',               // Đang mạ
    completed: 'テフロン加工済'           // Đã mạ xong
  };

  // Status stored in teflonlog.csv (TeflonStatus) is English keyword.
  const TEFLON_LOG_STATUS = {
    empty: '',                          // ✅ NEW: Empty state
    pending: 'Pending',
    approved: 'Approved',
    sent: 'Sent',
    completed: 'Completed'
  };

  function mapCoatingToStatusKey(coating) {
    const v = String(coating || '').trim();
    if (!v) return 'empty'; // ✅ Changed: return 'empty' instead of ''
    if (v === TEFLON_COATING_LABELS.pending) return 'pending';
    if (v === TEFLON_COATING_LABELS.approved) return 'approved';
    if (v === TEFLON_COATING_LABELS.sent) return 'sent';
    if (v === TEFLON_COATING_LABELS.completed) return 'completed';

    const lower = v.toLowerCase();
    if (lower === 'pending') return 'pending';
    if (lower === 'approved') return 'approved';
    if (lower === 'sent') return 'sent';
    if (lower === 'completed' || lower === 'coated') return 'completed';
    
    return 'empty'; // ✅ Changed: fallback to 'empty'
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function statusKeyToLogStatus(key) {
    return TEFLON_LOG_STATUS[key] || '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = String(logStatus || '').toLowerCase();
    if (!v) return 'empty'; // ✅ NEW
    if (v === 'pending') return 'pending';
    if (v === 'approved') return 'approved';
    if (v === 'sent') return 'sent';
    if (v === 'completed') return 'completed';
    return 'empty'; // ✅ Changed
  }

  function formatTeflonStatusDisplay(logStatusOrKey) {
    // Accept either log status (Pending/Sent/...) or key (pending/sent/...)
    const key = (function () {
      const k1 = String(logStatusOrKey || '').trim();
      if (!k1) return 'empty'; // ✅ Changed
      // if already a key
      if (TEFLON_COATING_LABELS[k1]) return k1;
      // else treat as log status
      return logStatusToStatusKey(k1);
    })();

    if (!key || key === 'empty') return '未設定 / Chưa đặt'; // ✅ NEW: Empty display
    if (key === 'pending') return 'テフロン加工承認待ち / Chờ phê duyệt';
    if (key === 'approved') return '承認済(発送待ち) / Đã duyệt (chờ gửi)';
    if (key === 'sent') return 'テフロン加工中 / Đang mạ';
    if (key === 'completed') return 'テフロン加工済 / Đã mạ xong';
    
    return String(logStatusOrKey || '');
  }

  // ============================
  // Helper: Cộng ngày làm việc (bỏ thứ 7, chủ nhật)
  // ============================
  function addBusinessDaysISO(startDateStr, businessDays) {
    if (!startDateStr) return '';
    const date = new Date(startDateStr);
    if (isNaN(date.getTime())) return '';

    let added = 0;
    while (added < businessDays) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return date.toISOString().split('T')[0];
  }

  // ============================
  // Helper: Vuốt để đóng panel (mobile)
  // ============================
  function attachSwipeToClose(headerEl, modalEl, hideCallback) {
    if (!headerEl || !modalEl || !('ontouchstart' in window)) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const resetDrag = () => {
      isDragging = false;
      modalEl.classList.remove('dragging');
      modalEl.style.transform = '';
      modalEl.style.opacity = '';
    };

    const onTouchStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      currentY = startY;
      isDragging = true;
      modalEl.classList.add('dragging');
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - startY;
      if (deltaY < 0) return;
      currentY = touchY;
      const translateY = Math.min(deltaY, 120);
      const opacity = 1 - Math.min(deltaY / 200, 0.5);
      modalEl.style.transform = 'translateY(' + translateY + 'px)';
      modalEl.style.opacity = String(opacity);
    };

    const onTouchEnd = () => {
      if (!isDragging) return;
      const deltaY = currentY - startY;
      if (deltaY > 80) {
        resetDrag();
        if (typeof hideCallback === 'function') hideCallback();
      } else {
        resetDrag();
      }
    };

    headerEl.addEventListener('touchstart', onTouchStart, { passive: true });
    headerEl.addEventListener('touchmove', onTouchMove, { passive: true });
    headerEl.addEventListener('touchend', onTouchEnd);
    headerEl.addEventListener('touchcancel', resetDrag);
  }

  // ============================
  // Helpers chung
  // ============================
  function fmtDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function getTodayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function toNumber(str) {
    const n = parseFloat(String(str || '').replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    const existing = document.getElementById('tefproc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'tefproc-toast';
    toast.className = 'tefproc-toast tefproc-toast-' + (type || 'info');
    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: '80px',
      transform: 'translateX(-50%)',
      background:
        type === 'error'
          ? '#dc2626'
          : type === 'success'
          ? '#16a34a'
          : '#4b5563',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: '999px',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: 10050,
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      maxWidth: '90%',
      textAlign: 'center',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'opacity 0.3s'
    });

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
    }, 2000);

    setTimeout(() => {
      toast.remove();
    }, 2600);
  }

  function getCompanyName(companyId, companies) {
    if (!companyId) return '';
    const list = companies || [];
    const c = list.find((x) => String(x.CompanyID).trim() === String(companyId).trim());
    if (!c) return String(companyId);
    const shortName = c.CompanyShortName || '';
    const fullName = c.CompanyName || c.Name || '';
    return shortName || fullName || String(companyId);
  }

  function getEmployeeName(empId, employees) {
    if (!empId) return '';
    const list = employees || [];
    const e = list.find((x) => String(x.EmployeeID).trim() === String(empId).trim());
    if (!e) return String(empId);
    return e.EmployeeNameShort || e.EmployeeName || e.name || String(empId);
  }

  function buildTeflonHistory(allLogs, mold) {
    if (!Array.isArray(allLogs) || !mold || !mold.MoldID) return [];
    const moldId = String(mold.MoldID).trim();
    const logs = allLogs.filter((row) => String(row.MoldID).trim() === moldId);

    logs.sort((a, b) => {
      const da = new Date(a.SentDate || a.RequestedDate || a.CreatedDate || '').getTime();
      const db = new Date(b.SentDate || b.RequestedDate || b.CreatedDate || '').getTime();
      return db - da;
    });

    return logs;
  }

  // ============================
  // ✅ NEW: Render history table with Lock button and Delete buttons
  // ============================
  function renderHistoryTable(logs, companies, employees) {
    if (!logs || logs.length === 0) {
      return '<div class="no-history">まだテフロン加工履歴がありません。<br>Chưa có lịch sử mạ Teflon.</div>';
    }

    const rows = logs
      .map((l) => {
        const statusDisp = formatTeflonStatusDisplay(l.TeflonStatus || '');
        const reqDate = fmtDate(l.RequestedDate);
        const sentDate = fmtDate(l.SentDate);
        const recvDate = fmtDate(l.ReceivedDate);
        const supplier = getCompanyName(l.SupplierID, companies);
        const reqBy = getEmployeeName(l.RequestedBy, employees);
        const sentBy = getEmployeeName(l.SentBy, employees);
        const quality = l.Quality || '';
        const notes = l.TeflonNotes || l.Reason || '';
        const logId = l.TeflonLogID || '';

        return (
          '<tr>' +
          '<td>' + escapeHtml(statusDisp) + '</td>' +
          '<td>' + escapeHtml(reqDate) + '</td>' +
          '<td>' + escapeHtml(sentDate) + '</td>' +
          '<td>' + escapeHtml(recvDate) + '</td>' +
          '<td>' + escapeHtml(supplier) + '</td>' +
          '<td>' + escapeHtml(reqBy) + '</td>' +
          '<td>' + escapeHtml(sentBy) + '</td>' +
          '<td>' + escapeHtml(quality) + '</td>' +
          '<td class="note-cell">' + escapeHtml(notes) + '</td>' +
          '<td class="col-actions">' +
          '<button type="button" class="btn-delete-history" data-log-id="' + escapeHtml(logId) + '" title="削除 / Xóa">' +
          '🗑️' +
          '</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<table class="history-table tefproc-his">' +
      '<thead><tr>' +
      '<th>ステータス<br>Status</th>' +
      '<th>依頼日<br>Ngày yêu cầu</th>' +
      '<th>出荷日<br>Ngày gửi</th>' +
      '<th>受入日<br>Ngày nhận</th>' +
      '<th>業者<br>Nhà cung cấp</th>' +
      '<th>依頼者<br>Người yêu cầu</th>' +
      '<th>出荷担当<br>Người gửi</th>' +
      '<th>品質<br>Chất lượng</th>' +
      '<th>メモ<br>Ghi chú</th>' +
      '<th class="col-actions">操作<br>Thao tác</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table>'
    );
  }

  function getNextTeflonLogId(dmData) {
    const list = (dmData && Array.isArray(dmData.teflonlog) && dmData.teflonlog) || [];
    if (!list.length) return '1';

    const maxId = list
      .map((r) => parseInt(r.TeflonLogID, 10))
      .filter((n) => !isNaN(n))
      .reduce((max, n) => (n > max ? n : max), 0);

    return String(maxId + 1);
  }

  // ============================
  // Migration Helper
  // ============================
  function checkMigrationNeeded(item, teflonlog) {
    if (!item || !item.MoldID) return null;
    const moldId = String(item.MoldID).trim();
    const coating = item.TeflonCoating || '';
    if (!coating) return null;

    const existingLogs = buildTeflonHistory(teflonlog || [], item);
    if (existingLogs.length > 0) return null;

    const statusKey = mapCoatingToStatusKey(coating);

    return {
      moldId: moldId,
      coating: coating,
      statusKey: statusKey,
      sentDate: item.TeflonSentDate || '',
      receivedDate: item.TeflonReceivedDate || '',
      expectedDate: item.TeflonExpectedDate || ''
    };
  }

  async function promptMigration(migrationData, item) {
    const msg =
      '【データ移行確認 / Xác nhận chuyển dữ liệu】\n\n' +
      'このコンテンツには旧形式のテフロン情報が検出されました。\n' +
      'Phát hiện dữ liệu mạ Teflon cũ trong bảng molds.\n\n' +
      '現在の状態: ' + migrationData.coating + '\n' +
      '送信日: ' + (migrationData.sentDate || '-') + '\n' +
      '受入日: ' + (migrationData.receivedDate || '-') + '\n\n' +
      '旧データからテフロン依頼フォームに値をコピーしますか？\n' +
      'Có muốn chuyển sang bảng lịch sử mới (teflonlog) không?';

    const confirmed = window.confirm(msg);
    if (!confirmed) return false;

    const dm = window.DataManager;
    const data = (dm && dm.data) || {};
    const today = getTodayISO();
    const newLogId = getNextTeflonLogId(data);

    const tefEntry = {
      TeflonLogID: newLogId,
      MoldID: migrationData.moldId,
      TeflonStatus: statusKeyToLogStatus(migrationData.statusKey) || 'Completed',
      RequestedBy: '',
      RequestedDate: migrationData.sentDate || today,
      SentBy: '',
      SentDate: migrationData.sentDate || '',
      ExpectedDate: migrationData.expectedDate || '',
      ReceivedDate: migrationData.receivedDate || '',
      SupplierID: DEFAULT_SUPPLIER_ID,
      CoatingType: '',
      Reason: 'データ移行 / Migration from old format',
      TeflonCost: '',
      Quality: '',
      TeflonNotes: 'Auto-migrated from molds.TeflonCoating',
      CreatedDate: today,
      UpdatedBy: '',
      UpdatedDate: today
    };

    try {
      const addRes = await fetch(API_ADD_LOG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
      });

      const addJson = await addRes.json();
      if (!addRes.ok || !addJson.success) {
        throw new Error(addJson.message || 'Migration failed');
      }

      if (data && !Array.isArray(data.teflonlog)) data.teflonlog = [];
      if (data) data.teflonlog.unshift(tefEntry);

      showToast('データ移行完了 / Migration thành công', 'success');
      return true;
    } catch (err) {
      console.error('[Migration] Error:', err);
      showToast('Migration lỗi / 移行エラー', 'error');
      return false;
    }
  }

  // ============================
  // Smart Auto-fill Logic
  // ============================
  function determineNextStatus(currentStatusKey) {
    // Workflow: empty -> pending -> approved -> sent -> completed
    if (!currentStatusKey || currentStatusKey === 'empty') return 'pending'; // ✅ Changed
    if (currentStatusKey === 'pending') return 'approved';
    if (currentStatusKey === 'approved') return 'sent';
    if (currentStatusKey === 'sent') return 'completed';
    return 'completed';
  }

  function getWorkflowHint(currentStatusKey) {
    if (!currentStatusKey || currentStatusKey === 'empty') { // ✅ Changed
      return '次のステップ: 加工依頼を作成 / Tạo yêu cầu mạ';
    }
    if (currentStatusKey === 'pending') {
      return '次のステップ: 承認登録（発送待ち） / Xác nhận đã duyệt (chờ gửi)';
    }
    if (currentStatusKey === 'approved') {
      return '次のステップ: 出荷確認 / Xác nhận gửi đi';
    }
    if (currentStatusKey === 'sent') {
      return '次のステップ: 受入確認 / Xác nhận đã nhận';
    }
    return '完了済み / Đã hoàn tất';
  }

  // ============================
  // TeflonProcessManager
  // ============================
  const TeflonProcessManager = {
    INIT() {
      console.log('TeflonProcessManager r7.1.3 loaded (History table with delete + scroll lock)');
    },

    open: function (arg) {
      // Support:
      // - open("5686")
      // - open({ moldId: "5686" })
      // - open({ item: { MoldID: "5686", ... } })
      // - open({ teflonRow: { MoldID: "5686", ... } })
      let item = null;
      let moldId = null;

      if (arg && typeof arg === 'object') {
        item = arg.item || null;
        moldId =
          arg.moldId ||
          (arg.teflonRow && arg.teflonRow.MoldID) ||
          (item && item.MoldID) ||
          null;
      } else {
        moldId = arg;
      }

      if (!item && moldId != null) {
        const dm = (window.DataManager && window.DataManager.data) ? window.DataManager.data : null;
        if (dm && Array.isArray(dm.molds)) {
          item = dm.molds.find(m => String(m.MoldID).trim() === String(moldId).trim()) || null;
        }
      }

      if (!item && moldId != null) item = { MoldID: String(moldId) };

      return this.openPanel(item);
    },

    async openPanel(item) {
      if (!item) {
        alert('Vui lòng chọn khuôn trước.\n金型を先に選択してください。');
        return;
      }

      currentItem = item;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const companies = data.companies || [];
      const employees = data.employees || [];
      const teflonlog = data.teflonlog || [];

      if (!item.MoldID) {
        alert('Module này chỉ hỗ trợ khuôn (Mold).\nこのモジュールは金型のみ対応しています。');
        return;
      }

      // Migration check
      const migrationData = checkMigrationNeeded(item, teflonlog);
      if (migrationData) {
        const migrated = await promptMigration(migrationData, item);
        if (migrated) {
          if (dm && typeof dm.recompute === 'function') {
            dm.recompute();
          }
        }
      }

      const existing = document.getElementById('tefproc-panel');
      if (existing) existing.remove();

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[TeflonProcessManager] upper-section not found');
        return;
      }

      const isMobile = window.innerWidth <= 767;
      if (isMobile) document.body.classList.add('modal-open');

      const moldId = String(item.MoldID);
      const moldName = item.MoldName || '';
      const moldCode = item.MoldCode || '';
      const rackLayer = item.RackLayerName || item.RackLayerID || '';
      const storageCompanyId =
        item.storageCompanyId || item.storage_company || item.storage_companyId || '';
      const storageCompanyName = getCompanyName(storageCompanyId, companies);

      const historyLogs = buildTeflonHistory(teflonlog, item);
      const today = getTodayISO();

      // Determine current status
      let currentStatusKey = 'empty'; // ✅ Changed default
      if (historyLogs.length > 0) {
        currentStatusKey = logStatusToStatusKey(historyLogs[0].TeflonStatus);
      }
      if (!currentStatusKey || currentStatusKey === 'empty') { // ✅ Changed
        currentStatusKey = mapCoatingToStatusKey(item.TeflonCoating);
      }

      const nextStatusKey = determineNextStatus(currentStatusKey);
      const workflowHint = getWorkflowHint(currentStatusKey);
      const currentStatusHTML = this._buildCurrentStatusDisplay(currentStatusKey, historyLogs);
      const quickActionsHTML = this._buildQuickActions(currentStatusKey, nextStatusKey);

      const html =
        '<div class="checkio-panel tefproc-panel" id="tefproc-panel">' +
        '  <div class="checkio-header">' +
        '    <div class="checkio-mode">' +
        '      <button type="button" class="mode-btn active" data-mode="send" style="cursor:default;">' +
        '        テフロン加工依頼<br>Gửi/Đăng ký' +
        '      </button>' +
        '      <button type="button" class="mode-btn" data-mode="complete">' +
        '        加工完了の確認<br>Xác nhận hoàn tất' +
        '      </button>' +
        '    </div>' +
        '    <button class="btn-close-compact" id="tefproc-close" title="閉じる / Đóng">✕</button>' +
        '  </div>' +
        '  <div class="checkio-body tefproc-body">' +
        currentStatusHTML +
        quickActionsHTML +
        '    <section class="cio-inputs tefproc-inputs" data-mode="send">' +
        '      <h4>テフロン加工依頼 / Đăng ký trạng thái mạ</h4>' +
        '      <div class="workflow-hint" style="background:#eff6ff;border-left:3px solid #3b82f6;padding:8px 12px;margin-bottom:12px;font-size:13px;color:#1e40af;">' +
        '        💡 ' + escapeHtml(workflowHint) +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">テフロン加工状態 / Trạng thái</label>' +
        '        <select id="tefproc-status" class="form-control">' +
        '          <option value="empty">-- 未設定 / Chưa đặt (Reset) --</option>' + // ✅ NEW: Empty option
        '          <option value="pending">テフロン加工承認待ち / Chờ phê duyệt</option>' +
        '          <option value="approved">承認済(発送待ち) / Đã duyệt (chờ gửi)</option>' +
        '          <option value="sent">テフロン加工中 / Đã gửi (đang mạ)</option>' +
        '        </select>' +
        '        <div id="tefproc-status-pill" class="tefproc-status-pill" style="margin-top:4px; font-size:12px;"></div>' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">業者 / Nhà cung cấp</label>' +
        '        <select id="tefproc-supplier" class="form-control">' +
        this._buildCompanyOptions(companies, DEFAULT_SUPPLIER_ID) +
        '        </select>' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">依頼日 / Ngày yêu cầu</label>' +
        '        <input type="date" id="tefproc-request-date" class="form-control" value="' + today + '">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">出荷日 / Ngày gửi</label>' +
        '        <input type="date" id="tefproc-sent-date" class="form-control" value="">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">受入予定日 / Ngày dự kiến nhận</label>' +
        '        <input type="date" id="tefproc-expected-date" class="form-control">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">依頼者 / Người yêu cầu</label>' +
        '        <select id="tefproc-request-emp" class="form-control">' +
        this._buildEmployeeOptions(employees) +
        '        </select>' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">出荷担当 / Người gửi</label>' +
        '        <select id="tefproc-sent-emp" class="form-control">' +
        this._buildEmployeeOptions(employees, DEFAULT_EMPLOYEE_ID) +
        '        </select>' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">加工種別 / Loại mạ</label>' +
        '        <input type="text" id="tefproc-coating-type" class="form-control" placeholder="Ví dụ: Full Teflon, Partial...">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">理由 / Lý do</label>' +
        '        <input type="text" id="tefproc-reason" class="form-control" placeholder="Lý do mạ lại, yêu cầu khách hàng...">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">費用 / Chi phí (JPY)</label>' +
        '        <input type="number" id="tefproc-cost" class="form-control" min="0" step="1">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">メモ / Ghi chú</label>' +
        '        <textarea id="tefproc-notes" class="form-control" rows="2" placeholder="Ghi chú thêm về lần mạ này..."></textarea>' +
        '      </div>' +
        '      <div class="btn-row">' +
        '        <button type="button" class="btn-cancel" id="tefproc-cancel-send">キャンセル / Hủy</button>' +
        '        <button type="button" class="btn-confirm" id="tefproc-save-send">確認・保存 / Lưu</button>' +
        '      </div>' +
        '    </section>' +
        '    <section class="cio-inputs tefproc-inputs" data-mode="complete" style="display:none;">' +
        '      <h4>加工完了の登録 / Xác nhận đã mạ xong</h4>' +
        '      <div class="form-group">' +
        '        <label class="form-label">受入日 / Ngày nhận khuôn</label>' +
        '        <input type="date" id="tefproc-received-date" class="form-control" value="' + today + '">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">確認者 / Người xác nhận</label>' +
        '        <select id="tefproc-received-emp" class="form-control">' +
        this._buildEmployeeOptions(employees) +
        '        </select>' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">品質 / Chất lượng</label>' +
        '        <input type="text" id="tefproc-quality" class="form-control" placeholder="OK / NG / Ghi chú chất lượng...">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">メモ / Ghi chú</label>' +
        '        <textarea id="tefproc-complete-notes" class="form-control" rows="2" placeholder="Ghi chú sau mạ (nếu có)..."></textarea>' +
        '      </div>' +
        '      <div class="btn-row">' +
        '        <button type="button" class="btn-secondary" id="tefproc-update-location">位置更新 / Cập nhật vị trí</button>' +
        '        <button type="button" class="btn-confirm" id="tefproc-confirm-complete">加工完了を登録 / Xác nhận</button>' +
        '      </div>' +
        '      <p class="note-small">' +
        '        ※ 完了登録後、statuslogs.csv に CHECKIN を記録し、molds.csv のテフロン状態を更新します。<br>' +
        '        Sau khi xác nhận, hệ thống sẽ ghi CHECKIN (IN) vào statuslogs.csv và cập nhật trạng thái Teflon trong molds.csv.' +
        '      </p>' +
        '    </section>' +
        '    <section class="cio-status tefproc-status">' +
        '      <h4>金型情報 / Thông tin khuôn</h4>' +
        '      <div class="status-badges">' +
        '        <div class="badge-row"><span class="badge-label">ID</span><div class="badge badge-mold">' + escapeHtml(moldId) + '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">コード / Mã</span><div class="badge badge-mold-code">' + escapeHtml(moldCode) + '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">名称 / Tên</span><div class="badge badge-mold-name">' + escapeHtml(moldName) + '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">現在の保管先 / Công ty</span><div class="badge badge-company">' + escapeHtml(storageCompanyName || '-') + '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">ラック位置 / Vị trí</span><div class="badge badge-rack">' + escapeHtml(rackLayer || '-') + '</div></div>' +
        '      </div>' +
        '    </section>' +
        '    <section class="cio-history tefproc-history">' +
        // ✅ NEW: History header with Lock button
        '      <div class="tefproc-history-header">' +
        '        <h4>テフロン加工履歴 / Lịch sử mạ Teflon</h4>' +
        '        <div class="tefproc-history-controls">' +
        '          <button type="button" class="tefproc-scroll-toggle" id="tefproc-scroll-toggle" title="横スクロール切替 / Bật/tắt scroll ngang">' +
        '            <span id="tefproc-scroll-icon">🔒</span> <span>Lock</span>' +
        '          </button>' +
        '        </div>' +
        '      </div>' +
        '      <div class="history-wrap" id="tefproc-history-wrap">' +
        renderHistoryTable(historyLogs, companies, employees) +
        '      </div>' +
        '    </section>' +
        '  </div>' +
        '  <div class="tefproc-bottom-bar">' +
        '    <button type="button" id="tefproc-bottom-close" class="btn-cancel">閉じる / Đóng</button>' +
        '  </div>' +
        '</div>';

      upper.insertAdjacentHTML('beforeend', html);

      this._applySmartAutoFill(currentStatusKey, nextStatusKey, historyLogs);
      this._bindEvents(item, companies, employees, teflonlog, currentStatusKey, nextStatusKey);
    },

    // ============================
    // _buildCurrentStatusDisplay
    // ============================
    _buildCurrentStatusDisplay(currentStatusKey, historyLogs) {
      if (!currentStatusKey || currentStatusKey === 'empty') {
        return (
          '<section class="tefproc-current-status" style="background:#f3f4f6;border:2px solid #d1d5db;border-radius:8px;padding:16px;margin-bottom:16px;">' +
          '  <h4 style="margin:0 0 8px 0;font-size:14px;color:#6b7280;">📋 現在の状態 / Trạng thái hiện tại</h4>' +
          '  <div class="status-badge status-empty" style="display:inline-block;padding:8px 16px;border-radius:6px;font-weight:600;background:#f3f4f6;color:#6b7280;border:1px dashed #9ca3af;">' +
          '    未処理 / Chưa xử lý' +
          '  </div>' +
          '  <p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">この金型はまだテフロン工程に入っていません。<br>Khuôn này chưa vào quy trình mạ Teflon.</p>' +
          '</section>'
        );
      }

      const lastLog = historyLogs[0] || null;

      let statusBgColor = '#f3f4f6';
      let statusTextColor = '#6b7280';
      let statusBorderColor = '#d1d5db';
      let statusIcon = '📋';
      let statusLabel = '';
      let statusDescription = '';

      if (currentStatusKey === 'pending') {
        statusBgColor = '#fffbeb';
        statusTextColor = '#92400e';
        statusBorderColor = '#fbbf24';
        statusIcon = '⏳';
        statusLabel = 'テフロン加工承認待ち / Chờ phê duyệt';
        statusDescription = '承認待ちです。次は発送待ちに変更してください。<br>Đang chờ phê duyệt. Tiếp theo chuyển sang "Chờ gửi".';
      } else if (currentStatusKey === 'approved') {
        statusBgColor = '#eff6ff';
        statusTextColor = '#1e40af';
        statusBorderColor = '#60a5fa';
        statusIcon = '✅';
        statusLabel = '承認済(発送待ち) / Đã duyệt (chờ gửi)';
        statusDescription = '承認済みです。次は出荷確認をしてください。<br>Đã được duyệt. Tiếp theo xác nhận gửi đi.';
      } else if (currentStatusKey === 'sent') {
        statusBgColor = '#dbeafe';
        statusTextColor = '#1e40af';
        statusBorderColor = '#3b82f6';
        statusIcon = '🚚';
        statusLabel = 'テフロン加工中 / Đang mạ';
        statusDescription = '加工中です。受入後、完了登録をしてください。<br>Đang trong quá trình mạ. Sau khi nhận về, xác nhận hoàn tất.';
      } else if (currentStatusKey === 'completed') {
        statusBgColor = '#d1fae5';
        statusTextColor = '#065f46';
        statusBorderColor = '#10b981';
        statusIcon = '✔️';
        statusLabel = 'テフロン加工済 / Đã mạ xong';
        statusDescription = '加工完了しました。<br>Đã hoàn tất mạ Teflon.';
      }

      return (
        '<section class="tefproc-current-status" style="background:' + statusBgColor + ';border:2px solid ' + statusBorderColor + ';border-radius:8px;padding:16px;margin-bottom:16px;">' +
        '  <h4 style="margin:0 0 8px 0;font-size:14px;color:' + statusTextColor + ';">' + statusIcon + ' 現在の状態 / Trạng thái hiện tại</h4>' +
        '  <div class="status-badge" style="display:inline-block;padding:8px 16px;border-radius:6px;font-weight:600;background:' + statusBgColor + ';color:' + statusTextColor + ';border:1px solid ' + statusBorderColor + ';">' +
        '    ' + statusLabel +
        '  </div>' +
        '  <p style="margin:8px 0 0 0;font-size:12px;color:' + statusTextColor + ';">' + statusDescription + '</p>' +
        (lastLog ? '<p style="margin:6px 0 0 0;font-size:11px;color:#6b7280;">最終更新: ' + fmtDate(lastLog.SentDate || lastLog.RequestedDate) + '</p>' : '') +
        '</section>'
      );
    },

    // ============================
    // _buildQuickActions
    // ============================
    _buildQuickActions(currentStatusKey, nextStatusKey) {
      if (!nextStatusKey || nextStatusKey === currentStatusKey) return '';

      const actions = {
        pending: {
          label: '承認待ちに登録 / Đăng ký chờ duyệt',
          icon: '⏳',
          color: '#fbbf24'
        },
        approved: {
          label: '承認済(発送待ち)に登録 / Đăng ký đã duyệt',
          icon: '✅',
          color: '#60a5fa'
        },
        sent: {
          label: '出荷確認 / Xác nhận đã gửi',
          icon: '🚚',
          color: '#3b82f6'
        },
        completed: {
          label: '完了登録 / Xác nhận hoàn tất',
          icon: '✔️',
          color: '#10b981'
        }
      };

      const action = actions[nextStatusKey];
      if (!action) return '';

      return (
        '<section class="tefproc-quick-actions" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:16px;">' +
        '  <h4 style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#374151;">⚡ クイックアクション / Thao tác nhanh</h4>' +
        '  <button type="button" class="btn-confirm" id="tefproc-quick-next" data-next-status="' + nextStatusKey + '" style="width:100%;padding:12px;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">' +
        '    <span style="font-size:18px;">' + action.icon + '</span>' +
        '    <span>' + action.label + '</span>' +
        '  </button>' +
        '</section>'
      );
    },

    // ============================
    // _buildCompanyOptions
    // ============================
    _buildCompanyOptions(companies, defaultId) {
      let html = '<option value="">-- 選択 / Chọn --</option>';
      (companies || []).forEach((c) => {
        const id = String(c.CompanyID || '').trim();
        const name = c.CompanyShortName || c.CompanyName || c.Name || id;
        const sel = (id === String(defaultId)) ? ' selected' : '';
        html += '<option value="' + escapeHtml(id) + '"' + sel + '>' + escapeHtml(name) + '</option>';
      });
      return html;
    },

    // ============================
    // _buildEmployeeOptions
    // ============================
    _buildEmployeeOptions(employees, defaultId) {
      let html = '<option value="">-- 選択 / Chọn --</option>';
      (employees || []).forEach((e) => {
        const id = String(e.EmployeeID || '').trim();
        const name = e.EmployeeNameShort || e.EmployeeName || e.name || id;
        const sel = (defaultId && id === String(defaultId)) ? ' selected' : '';
        html += '<option value="' + escapeHtml(id) + '"' + sel + '>' + escapeHtml(name) + '</option>';
      });
      return html;
    },

    // ============================
    // _applySmartAutoFill
    // ============================
    _applySmartAutoFill(currentStatusKey, nextStatusKey, historyLogs) {
      setTimeout(() => {
        const statusSelect = document.getElementById('tefproc-status');
        if (statusSelect) {
          statusSelect.value = nextStatusKey || 'empty';
          this._updateStatusPill();
        }

        const sentDateInput = document.getElementById('tefproc-sent-date');
        const expectedDateInput = document.getElementById('tefproc-expected-date');

        if (nextStatusKey === 'sent' && sentDateInput) {
          sentDateInput.value = getTodayISO();
          if (expectedDateInput && !expectedDateInput.value) {
            expectedDateInput.value = addBusinessDaysISO(getTodayISO(), 10);
          }
        }
      }, 100);
    },

    // ============================
    // ✅ NEW: _updateStatusPill - support empty state
    // ============================
    _updateStatusPill() {
      const statusSelect = document.getElementById('tefproc-status');
      const pill = document.getElementById('tefproc-status-pill');
      if (!statusSelect || !pill) return;

      const val = statusSelect.value || 'empty';
      pill.setAttribute('data-status', val);
      pill.textContent = formatTeflonStatusDisplay(val);
    },

    // ============================
    // ✅ NEW: _bindEvents - with delete and scroll lock
    // ============================
    _bindEvents(item, companies, employees, teflonlog, currentStatusKey, nextStatusKey) {
      const panel = document.getElementById('tefproc-panel');
      if (!panel) return;

      const header = panel.querySelector('.checkio-header');
      const closeBtn = document.getElementById('tefproc-close');
      const bottomCloseBtn = document.getElementById('tefproc-bottom-close');
      const cancelSendBtn = document.getElementById('tefproc-cancel-send');

      // Close handlers
      const closePanel = () => {
        panel.remove();
        document.body.classList.remove('modal-open');
      };

      if (closeBtn) closeBtn.addEventListener('click', closePanel);
      if (bottomCloseBtn) bottomCloseBtn.addEventListener('click', closePanel);
      if (cancelSendBtn) cancelSendBtn.addEventListener('click', closePanel);

      // Swipe to close (mobile)
      if (header) {
        attachSwipeToClose(header, panel, closePanel);
      }

      // Mode switching
      const modeBtns = panel.querySelectorAll('.mode-btn');
      const inputSections = panel.querySelectorAll('.tefproc-inputs');

      modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          modeBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          inputSections.forEach((sec) => {
            if (sec.getAttribute('data-mode') === mode) {
              sec.style.display = 'block';
            } else {
              sec.style.display = 'none';
            }
          });
        });
      });

      // Status select change
      const statusSelect = document.getElementById('tefproc-status');
      if (statusSelect) {
        statusSelect.addEventListener('change', () => {
          this._updateStatusPill();
        });
      }

      // Quick action button
      const quickNextBtn = document.getElementById('tefproc-quick-next');
      if (quickNextBtn) {
        quickNextBtn.addEventListener('click', () => {
          const nextStatus = quickNextBtn.getAttribute('data-next-status');
          if (statusSelect) {
            statusSelect.value = nextStatus || 'empty';
            this._updateStatusPill();
          }
          // Focus on first input
          const firstInput = panel.querySelector('.tefproc-inputs[data-mode="send"] input, .tefproc-inputs[data-mode="send"] select');
          if (firstInput) firstInput.focus();
        });
      }

      // ✅ NEW: Scroll lock toggle
      const scrollToggle = document.getElementById('tefproc-scroll-toggle');
      const historyWrap = document.getElementById('tefproc-history-wrap');
      if (scrollToggle && historyWrap) {
        scrollToggle.addEventListener('click', () => {
          const isLocked = !historyWrap.classList.contains('scroll-unlocked');
          if (isLocked) {
            historyWrap.classList.add('scroll-unlocked');
            scrollToggle.classList.add('unlocked');
            scrollToggle.innerHTML = '<span id="tefproc-scroll-icon">🔓</span> <span>Unlock</span>';
          } else {
            historyWrap.classList.remove('scroll-unlocked');
            scrollToggle.classList.remove('unlocked');
            scrollToggle.innerHTML = '<span id="tefproc-scroll-icon">🔒</span> <span>Lock</span>';
          }
        });
      }

      // ✅ NEW: Delete history handlers
      this._bindDeleteHistoryEvents();

      // Save send button
      const saveSendBtn = document.getElementById('tefproc-save-send');
      if (saveSendBtn) {
        saveSendBtn.addEventListener('click', () => {
          this._handleSaveSend(item, companies, employees);
        });
      }

      // Update location button
      const updateLocationBtn = document.getElementById('tefproc-update-location');
      if (updateLocationBtn) {
        updateLocationBtn.addEventListener('click', () => {
          this._handleUpdateLocation(item);
        });
      }

      // Confirm complete button
      const confirmCompleteBtn = document.getElementById('tefproc-confirm-complete');
      if (confirmCompleteBtn) {
        confirmCompleteBtn.addEventListener('click', () => {
          this._handleConfirmComplete(item, companies, employees);
        });
      }
    },

    // ============================
    // ✅ NEW: _bindDeleteHistoryEvents
    // ============================
    _bindDeleteHistoryEvents() {
      const historyWrap = document.getElementById('tefproc-history-wrap');
      if (!historyWrap) return;

      // Event delegation for delete buttons
      historyWrap.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.btn-delete-history');
        if (!deleteBtn) return;

        const logId = deleteBtn.getAttribute('data-log-id');
        if (!logId) return;

        const confirmed = window.confirm(
          '【削除確認 / Xác nhận xóa】\n\n' +
          'このテフロン履歴を削除しますか？\n' +
          'Bạn có chắc muốn xóa lịch sử mạ này không?\n\n' +
          'ID: ' + logId
        );

        if (!confirmed) return;

        await this._deleteHistoryLog(logId);
      });
    },

    // ============================
    // ✅ NEW: _deleteHistoryLog
    // ============================
    async _deleteHistoryLog(logId) {
      if (isSaving) {
        showToast('処理中です / Đang xử lý...', 'info');
        return;
      }

      isSaving = true;
      showToast('削除中 / Đang xóa...', 'info');

      try {
        const response = await fetch(API_DELETE_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            logId: logId
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || '削除失敗 / Xóa thất bại');
        }

        // Update local data
        const dm = window.DataManager;
        if (dm && dm.data && Array.isArray(dm.data.teflonlog)) {
          dm.data.teflonlog = dm.data.teflonlog.filter(
            (log) => String(log.TeflonLogID).trim() !== String(logId).trim()
          );
          
          if (typeof dm.recompute === 'function') {
            dm.recompute();
          }
        }

        showToast('削除成功 / Xóa thành công', 'success');

        // Refresh the panel
        if (currentItem) {
          setTimeout(() => {
            this.openPanel(currentItem);
          }, 500);
        }

      } catch (err) {
        console.error('[TeflonProcessManager] Delete error:', err);
        showToast('削除エラー / Lỗi xóa: ' + err.message, 'error');
      } finally {
        isSaving = false;
      }
    },

    // ============================
    // _handleSaveSend
    // ============================
    async _handleSaveSend(item, companies, employees) {
      if (isSaving) {
        showToast('処理中です / Đang xử lý...', 'info');
        return;
      }

      const statusSelect = document.getElementById('tefproc-status');
      const supplierSelect = document.getElementById('tefproc-supplier');
      const requestDateInput = document.getElementById('tefproc-request-date');
      const sentDateInput = document.getElementById('tefproc-sent-date');
      const expectedDateInput = document.getElementById('tefproc-expected-date');
      const requestEmpSelect = document.getElementById('tefproc-request-emp');
      const sentEmpSelect = document.getElementById('tefproc-sent-emp');
      const coatingTypeInput = document.getElementById('tefproc-coating-type');
      const reasonInput = document.getElementById('tefproc-reason');
      const costInput = document.getElementById('tefproc-cost');
      const notesTextarea = document.getElementById('tefproc-notes');

      const statusKey = statusSelect ? statusSelect.value : 'empty';
      const supplierId = supplierSelect ? supplierSelect.value : '';
      const requestDate = requestDateInput ? requestDateInput.value : '';
      const sentDate = sentDateInput ? sentDateInput.value : '';
      const expectedDate = expectedDateInput ? expectedDateInput.value : '';
      const requestEmpId = requestEmpSelect ? requestEmpSelect.value : '';
      const sentEmpId = sentEmpSelect ? sentEmpSelect.value : '';
      const coatingType = coatingTypeInput ? coatingTypeInput.value : '';
      const reason = reasonInput ? reasonInput.value : '';
      const cost = costInput ? costInput.value : '';
      const notes = notesTextarea ? notesTextarea.value : '';

      // Validation
      if (!requestDate) {
        showToast('依頼日を入力してください / Vui lòng nhập ngày yêu cầu', 'error');
        if (requestDateInput) requestDateInput.focus();
        return;
      }

      // ✅ Allow empty status (reset)
      const statusForLog = statusKeyToLogStatus(statusKey);
      const coatingForMold = statusKeyToCoatingLabel(statusKey);

      isSaving = true;
      showToast('保存中 / Đang lưu...', 'info');

      try {
        const dm = window.DataManager;
        const data = (dm && dm.data) || {};
        const newLogId = getNextTeflonLogId(data);
        const today = getTodayISO();

        const tefEntry = {
          TeflonLogID: newLogId,
          MoldID: String(item.MoldID),
          TeflonStatus: statusForLog,
          RequestedBy: requestEmpId,
          RequestedDate: requestDate,
          SentBy: sentEmpId,
          SentDate: sentDate,
          ExpectedDate: expectedDate,
          ReceivedDate: '',
          SupplierID: supplierId,
          CoatingType: coatingType,
          Reason: reason,
          TeflonCost: cost,
          Quality: '',
          TeflonNotes: notes,
          CreatedDate: today,
          UpdatedBy: '',
          UpdatedDate: today
        };

        // Save to teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });

        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || '保存失敗 / Lưu thất bại');
        }

        // Update molds.csv TeflonCoating
        const moldUpdate = {
          MoldID: String(item.MoldID),
          TeflonCoating: coatingForMold
        };

        const updateRes = await fetch(API_UPDATE_ITEM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'molds.csv', item: moldUpdate })
        });

        const updateJson = await updateRes.json();
        if (!updateRes.ok || !updateJson.success) {
          console.warn('[TeflonProcessManager] Mold update warning:', updateJson.message);
        }

        // Update local data
        if (data && !Array.isArray(data.teflonlog)) data.teflonlog = [];
        if (data) data.teflonlog.unshift(tefEntry);

        if (item) item.TeflonCoating = coatingForMold;

        if (dm && typeof dm.recompute === 'function') {
          dm.recompute();
        }

        showToast('保存成功 / Lưu thành công', 'success');

        // Refresh panel
        setTimeout(() => {
          this.openPanel(item);
        }, 600);

      } catch (err) {
        console.error('[TeflonProcessManager] Save error:', err);
        showToast('保存エラー / Lỗi lưu: ' + err.message, 'error');
      } finally {
        isSaving = false;
      }
    },

    // ============================
    // _handleUpdateLocation
    // ============================
    _handleUpdateLocation(item) {
      showToast('位置更新機能は別モジュールで実装されます / Chức năng cập nhật vị trí sẽ được triển khai riêng', 'info');
      console.log('[TeflonProcessManager] Update location for:', item);
    },

    // ============================
    // _handleConfirmComplete
    // ============================
    async _handleConfirmComplete(item, companies, employees) {
      if (isSaving) {
        showToast('処理中です / Đang xử lý...', 'info');
        return;
      }

      const receivedDateInput = document.getElementById('tefproc-received-date');
      const receivedEmpSelect = document.getElementById('tefproc-received-emp');
      const qualityInput = document.getElementById('tefproc-quality');
      const completeNotesTextarea = document.getElementById('tefproc-complete-notes');

      const receivedDate = receivedDateInput ? receivedDateInput.value : '';
      const receivedEmpId = receivedEmpSelect ? receivedEmpSelect.value : '';
      const quality = qualityInput ? qualityInput.value : '';
      const completeNotes = completeNotesTextarea ? completeNotesTextarea.value : '';

      // Validation
      if (!receivedDate) {
        showToast('受入日を入力してください / Vui lòng nhập ngày nhận', 'error');
        if (receivedDateInput) receivedDateInput.focus();
        return;
      }

      isSaving = true;
      showToast('完了登録中 / Đang xác nhận hoàn tất...', 'info');

      try {
        const dm = window.DataManager;
        const data = (dm && dm.data) || {};
        const newLogId = getNextTeflonLogId(data);
        const today = getTodayISO();

        // Create completed log entry
        const tefEntry = {
          TeflonLogID: newLogId,
          MoldID: String(item.MoldID),
          TeflonStatus: 'Completed',
          RequestedBy: '',
          RequestedDate: receivedDate,
          SentBy: '',
          SentDate: '',
          ExpectedDate: '',
          ReceivedDate: receivedDate,
          SupplierID: DEFAULT_SUPPLIER_ID,
          CoatingType: '',
          Reason: '加工完了 / Hoàn tất mạ',
          TeflonCost: '',
          Quality: quality,
          TeflonNotes: completeNotes,
          CreatedDate: today,
          UpdatedBy: receivedEmpId,
          UpdatedDate: today
        };

        // Save to teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });

        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || '完了登録失敗 / Xác nhận thất bại');
        }

        // Update molds.csv TeflonCoating to completed
        const moldUpdate = {
          MoldID: String(item.MoldID),
          TeflonCoating: TEFLON_COATING_LABELS.completed
        };

        const updateRes = await fetch(API_UPDATE_ITEM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'molds.csv', item: moldUpdate })
        });

        const updateJson = await updateRes.json();
        if (!updateRes.ok || !updateJson.success) {
          console.warn('[TeflonProcessManager] Mold update warning:', updateJson.message);
        }

        // Create CHECKIN entry in statuslogs.csv
        const statusEntry = {
          MoldID: String(item.MoldID),
          Status: 'IN',
          Timestamp: receivedDate + 'T00:00:00',
          EmployeeID: receivedEmpId,
          Notes: 'テフロン加工完了 / Teflon coating completed',
          AuditType: ''
        };

        const statusRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
        });

        const statusJson = await statusRes.json();
        if (!statusRes.ok || !statusJson.success) {
          console.warn('[TeflonProcessManager] StatusLog warning:', statusJson.message);
        }

        // Update local data
        if (data && !Array.isArray(data.teflonlog)) data.teflonlog = [];
        if (data) data.teflonlog.unshift(tefEntry);

        if (data && !Array.isArray(data.statuslogs)) data.statuslogs = [];
        if (data) data.statuslogs.unshift(statusEntry);

        if (item) item.TeflonCoating = TEFLON_COATING_LABELS.completed;

        if (dm && typeof dm.recompute === 'function') {
          dm.recompute();
        }

        showToast('完了登録成功 / Xác nhận hoàn tất thành công', 'success');

        // Refresh panel
        setTimeout(() => {
          this.openPanel(item);
        }, 600);

      } catch (err) {
        console.error('[TeflonProcessManager] Complete error:', err);
        showToast('完了登録エラー / Lỗi xác nhận: ' + err.message, 'error');
      } finally {
        isSaving = false;
      }
    },

    // ============================
    // close
    // ============================
    close: function () {
      const panel = document.getElementById('tefproc-panel');
      if (panel) {
        panel.remove();
        document.body.classList.remove('modal-open');
      }
    }
  };

  // ============================
  // Global export
  // ============================
  window.TeflonProcessManager = {
    INIT: TeflonProcessManager.INIT.bind(TeflonProcessManager),
    open: TeflonProcessManager.open.bind(TeflonProcessManager),
    openPanel: TeflonProcessManager.openPanel.bind(TeflonProcessManager),
    close: TeflonProcessManager.close.bind(TeflonProcessManager)
  };

  // Auto INIT
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.TeflonProcessManager.INIT();
    });
  } else {
    window.TeflonProcessManager.INIT();
  }

  // ============================
  // Bridge: allow other modules to open by event
  // ============================
  (function bindTeflonOpenBridge() {
    if (window.__tefProcOpenBridgeBound) return;
    window.__tefProcOpenBridgeBound = true;

    window.addEventListener('teflon:open-process-manager', function (e) {
      try {
        const detail = (e && e.detail) ? e.detail : {};
        const moldId = detail.moldId || (detail.teflonRow && detail.teflonRow.MoldID) || (detail.item && detail.item.MoldID);
        if (!moldId && !detail.item) return;

        if (window.TeflonProcessManager && typeof window.TeflonProcessManager.open === 'function') {
          window.TeflonProcessManager.open({
            moldId: moldId,
            item: detail.item || null,
            teflonRow: detail.teflonRow || null,
            source: detail.source || 'event'
          });
        }
      } catch (err) {
        console.error('[TeflonProcessManager] open bridge error', err);
      }
    });
  })();

  // Bridge: listen triggerTeflon
  document.addEventListener('triggerTeflon', function (e) {
    try {
      const detail = e && e.detail;
      const item = detail && detail.item;

      if (!item || !item.MoldID) {
        console.warn('[TeflonProcess] triggerTeflon without valid Mold item', detail);
        return;
      }

      if (!window.TeflonProcessManager || typeof window.TeflonProcessManager.openPanel !== 'function') {
        console.warn('[TeflonProcess] TeflonProcessManager.openPanel not ready');
        return;
      }

      window.TeflonProcessManager.openPanel(item);
    } catch (err) {
      console.error('[TeflonProcess] Error handling triggerTeflon event', err);
    }
  });

})();
