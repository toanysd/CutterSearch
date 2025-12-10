/**
 * teflon-process-manager-r7.0.9.js
 * ==========================================================
 * Module nghiệp vụ mạ Teflon cho từng khuôn
 * テフロン加工依頼・完了処理モジュール（個別金型向け）
 *
 * Khác với teflon-manager-r7.0.9.js (bảng tổng hợp):
 *  - Module này dùng để:
 *    + GỬI KHUÔN ĐI MẠ: ghi log vào teflonlog.csv, tạo CHECKOUT (OUT) trong statuslogs.csv.
 *    + XÁC NHẬN ĐÃ MẠ XONG: ghi log Completed, cập nhật molds.csv (TeflonCoating, ngày nhận),
 *      tạo CHECKIN (IN) trong statuslogs.csv.
 *    + Tuỳ chọn mở LocationManager để cập nhật vị trí (RackLayerID) sau khi mạ xong.
 *
 * Backend:
 *  - POST {API_BASE}/api/add-log    (teflonlog.csv, statuslogs.csv)
 *  - POST {API_BASE}/api/update-item (molds.csv)
 *
 * DataManager:
 *  - Đọc/ghi: data.molds, data.teflonlog, data.statuslogs, data.companies, data.employees
 *  - Gọi DataManager.recompute() sau khi cập nhật để đồng bộ badge, detail, v.v.
 *
 * UI:
 *  - Mở từ nút Teflon trong detail modal hoặc panel desktop:
 *      window.TeflonProcessManager.openPanel(currentItem)
 *  - Panel .checkio-panel, 3 khu vực: Nhập liệu / Trạng thái / Lịch sử
 *  - Có 2 mode:
 *      [Gửi đi mạ]  / テフロン加工依頼
 *      [Xác nhận đã mạ] / テフロン加工完了
 *  - Vuốt từ header để đóng (mobile), nút đóng ở header + thanh dưới cùng.
 * ==========================================================
 */
(function () {
  'use strict';

  const API_BASE = 'https://ysd-moldcutter-backend.onrender.com';
  const API_ADD_LOG = API_BASE + '/api/add-log';
  const API_UPDATE_ITEM = API_BASE + '/api/update-item';

  // CompanyID mặc định cho nhà cung cấp Teflon (ID=7 trong companies.csv)
  const DEFAULT_SUPPLIER_ID = '7';

  let currentItem = null;
  let isSaving = false;

  // ============================
  // Teflon status mapping (UI ⇔ CSV)
  // ============================
  // Key nội bộ: 'pending' / 'sent' / 'completed'

  // Dùng cho đồng bộ với molds.csv (TeflonCoating)
  const TEFLON_COATING_LABELS = {
    pending: 'テフロン加工承認待ち',     // Đang chờ phê duyệt
    sent: 'テフロン加工中',             // Đã gửi / đang mạ
    completed: 'テフロン加工済'         // Đã mạ xong
  };

  // Dùng cho cột TeflonStatus trong teflonlog.csv
  const TEFLON_LOG_STATUS = {
    pending: 'Pending',
    sent: 'Sent',
    completed: 'Completed'
  };

  function mapCoatingToStatusKey(coating) {
    const v = String(coating || '').trim();
    if (!v) return '';
    if (v === TEFLON_COATING_LABELS.pending) return 'pending';
    if (v === TEFLON_COATING_LABELS.sent) return 'sent';
    if (v === TEFLON_COATING_LABELS.completed) return 'completed';

    // fallback cho dữ liệu cũ
    const lower = v.toLowerCase();
    if (lower === 'sent') return 'sent';
    if (lower === 'completed' || lower === 'coated') return 'completed';
    return '';
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function statusKeyToLogStatus(key) {
    return TEFLON_LOG_STATUS[key] || '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = String(logStatus || '').toLowerCase();
    if (v === 'pending') return 'pending';
    if (v === 'sent') return 'sent';
    if (v === 'completed') return 'completed';
    return '';
  }

  // Helper: cộng 5 ngày làm việc kể từ ngày gửi
  function addBusinessDaysISO(startDateStr, businessDays) {
    if (!startDateStr) return '';
    const date = new Date(startDateStr);
    if (isNaN(date.getTime())) return '';

    let added = 0;
    while (added < businessDays) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        added++;
      }
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
      if (deltaY < 0) return; // chỉ xử lý kéo xuống

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
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
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
    // type: 'success' | 'error' | 'info'
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
        type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#4b5563',
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

  function renderHistoryTable(logs, companies, employees) {
    if (!logs || logs.length === 0) {
      return '<div class="no-history">まだテフロン加工履歴がありません。<br>Chưa có lịch sử mạ Teflon.</div>';
    }

    const rows = logs
      .map((l) => {
        const status = l.TeflonStatus || '';
        const reqDate = fmtDate(l.RequestedDate);
        const sentDate = fmtDate(l.SentDate);
        const recvDate = fmtDate(l.ReceivedDate);
        const supplier = getCompanyName(l.SupplierID, companies);
        const reqBy = getEmployeeName(l.RequestedBy, employees);
        const sentBy = getEmployeeName(l.SentBy, employees);
        const quality = l.Quality || '';
        const notes = l.TeflonNotes || l.Reason || '';

        return (
          '<tr>' +
          '<td>' +
          escapeHtml(status) +
          '</td>' +
          '<td>' +
          escapeHtml(reqDate) +
          '</td>' +
          '<td>' +
          escapeHtml(sentDate) +
          '</td>' +
          '<td>' +
          escapeHtml(recvDate) +
          '</td>' +
          '<td>' +
          escapeHtml(supplier) +
          '</td>' +
          '<td>' +
          escapeHtml(reqBy) +
          '</td>' +
          '<td>' +
          escapeHtml(sentBy) +
          '</td>' +
          '<td>' +
          escapeHtml(quality) +
          '</td>' +
          '<td class="note-cell">' +
          escapeHtml(notes) +
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
      '</tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table>'
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
  // TeflonProcessManager
  // ============================
  const TeflonProcessManager = {
    INIT() {
      console.log('TeflonProcessManager r7.0.9 loaded');
    },

    openPanel(item) {
      if (!item) {
        alert(
          'Vui lòng chọn khuôn trước.\n金型を先に選択してください。'
        );
        return;
      }

      currentItem = item;

      // Xoá panel cũ nếu còn
      const existing = document.getElementById('tefproc-panel');
      if (existing) existing.remove();

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[TeflonProcessManager] upper-section not found');
        return;
      }

      const isMobile = window.innerWidth <= 767;
      if (isMobile) {
        document.body.classList.add('modal-open');
      }

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const companies = data.companies || [];
      const employees = data.employees || [];
      const teflonlog = data.teflonlog || [];

      const isMold = !!item.MoldID;
      if (!isMold) {
        alert(
          'Module này chỉ hỗ trợ khuôn (Mold).\nこのモジュールは金型のみ対応しています。'
        );
        return;
      }

      const moldId = String(item.MoldID);
      const moldName = item.MoldName || '';
      const moldCode = item.MoldCode || '';
      const rackLayer = item.RackLayerName || item.RackLayerID || '';
      const storageCompanyId =
        item.storageCompanyId || item.storage_company || item.storage_companyId || '';
      const storageCompanyName = getCompanyName(storageCompanyId, companies);

      const historyLogs = buildTeflonHistory(teflonlog, item);
      const today = getTodayISO();

      // NEW: xác định trạng thái hiện tại
      let initialStatusKey = mapCoatingToStatusKey(item.TeflonCoating);
      if (!initialStatusKey && historyLogs.length > 0) {
        initialStatusKey = logStatusToStatusKey(historyLogs[0].TeflonStatus);
      }
      if (!initialStatusKey) {
        initialStatusKey = 'pending';
      }

      const html =
        '<div class="checkio-panel tefproc-panel" id="tefproc-panel">' +
        '  <div class="checkio-header">' +
        '    <div class="checkio-mode">' +
        '      <button type="button" class="mode-btn active" data-mode="send" style="cursor:default;">' +
        '        テフロン加工依頼<br>Gửi đi mạ' +
        '      </button>' +
        '      <button type="button" class="mode-btn" data-mode="complete">' +
        '        加工完了の確認<br>Xác nhận đã mạ' +
        '      </button>' +
        '    </div>' +
        '    <button class="btn-close-compact" id="tefproc-close" title="閉じる / Đóng">✕</button>' +
        '  </div>' +
        '  <div class="checkio-body tefproc-body">' +
        '    <section class="cio-inputs tefproc-inputs" data-mode="send">' +
        '      <h4>テフロン加工依頼 / Gửi khuôn đi mạ</h4>' +
        '      <div class="form-group">' +
        '        <label class="form-label">テフロン加工状態 / Trạng thái mạ</label>' +
        '        <select id="tefproc-status" class="form-control">' +
        '          <option value="pending">テフロン加工承認待ち / Chờ phê duyệt</option>' +
        '          <option value="sent" selected>テフロン加工中 / Đã gửi (đang mạ)</option>' +
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
        '        <input type="date" id="tefproc-request-date" class="form-control" value="' +
        today +
        '">' +
        '      </div>' +
        '      <div class="form-group">' +
        '        <label class="form-label">出荷日 / Ngày gửi</label>' +
        '        <input type="date" id="tefproc-sent-date" class="form-control" value="' +
        today +
        '">' +
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
        this._buildEmployeeOptions(employees) +
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
        '        <button type="button" class="btn-confirm" id="tefproc-save-send">確認・保存 / Xác nhận &amp; Lưu</button>' +
        '      </div>' +
        '    </section>' +
        '    <section class="cio-inputs tefproc-inputs" data-mode="complete" style="display:none;">' +
        '      <h4>加工完了の登録 / Xác nhận đã mạ xong</h4>' +
        '      <div class="form-group">' +
        '        <label class="form-label">受入日 / Ngày nhận khuôn</label>' +
        '        <input type="date" id="tefproc-received-date" class="form-control" value="' +
        today +
        '">' +
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
        '        <button type="button" class="btn-confirm" id="tefproc-confirm-complete">加工完了を登録 / Xác nhận đã mạ</button>' +
        '      </div>' +
        '      <p class="note-small">' +
        '        ※ Sau khi xác nhận đã mạ, hệ thống sẽ tự động ghi CHECKIN (IN) vào statuslogs.csv và cập nhật trạng thái Teflon trong molds.csv.' +
        '      </p>' +
        '    </section>' +
        '    <section class="cio-status tefproc-status">' +
        '      <h4>金型情報 / Thông tin khuôn</h4>' +
        '      <div class="status-badges">' +
        '        <div class="badge-row"><span class="badge-label">ID</span><div class="badge badge-mold">' +
        escapeHtml(moldId) +
        '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">コード / Mã</span><div class="badge badge-mold-code">' +
        escapeHtml(moldCode) +
        '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">名称 / Tên</span><div class="badge badge-mold-name">' +
        escapeHtml(moldName) +
        '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">現在の保管先 / Công ty lưu trữ</span><div class="badge badge-company">' +
        escapeHtml(storageCompanyName || '-') +
        '</div></div>' +
        '        <div class="badge-row"><span class="badge-label">ラック位置 / Vị trí kệ</span><div class="badge badge-rack">' +
        escapeHtml(rackLayer || '-') +
        '</div></div>' +
        '      </div>' +
        '    </section>' +
        '    <section class="cio-history tefproc-history">' +
        '      <h4>テフロン加工履歴 / Lịch sử mạ Teflon</h4>' +
        '      <div class="history-wrap" id="tefproc-history-wrap">' +
        renderHistoryTable(historyLogs, companies, employees) +
        '      </div>' +
        '    </section>' +
        '  </div>' +
        '  <div class="tefproc-bottom-bar">' +
        '    <button type="button" id="tefproc-bottom-close" class="btn-cancel">' +
        '      閉じる / Đóng' +
        '    </button>' +
        '  </div>' +
        '</div>';

      upper.insertAdjacentHTML('beforeend', html);

      // Set default status + pill text
      const statusSelect = document.getElementById('tefproc-status');
      const statusPill = document.getElementById('tefproc-status-pill');
      if (statusSelect) {
        statusSelect.value = initialStatusKey;
        const label = statusKeyToCoatingLabel(initialStatusKey);
        if (statusPill && label) {
          statusPill.textContent = label;
          statusPill.setAttribute('data-status', initialStatusKey);
        }
      }

      this._bindEvents(item, companies, employees, teflonlog);
    },

    close() {
      const panel = document.getElementById('tefproc-panel');
      if (panel) panel.remove();

      if (document.body.classList.contains('modal-open')) {
        const anyPanel =
          document.getElementById('ship-panel') ||
          document.getElementById('cio-panel') ||
          document.getElementById('loc-panel');
        if (!anyPanel) {
          document.body.classList.remove('modal-open');
        }
      }
    },

    _buildCompanyOptions(companies, defaultId) {
      const list = companies || [];
      let opts = '<option value="">-- Chọn / 選択 --</option>';
      list.forEach((c) => {
        const id = String(c.CompanyID || '').trim();
        if (!id) return;
        const shortName = c.CompanyShortName || '';
        const fullName = c.CompanyName || c.Name || '';
        const text = (shortName ? shortName + ' / ' : '') + fullName + ' (ID:' + id + ')';
        const selected = defaultId && id === String(defaultId).trim() ? ' selected' : '';
        opts += '<option value="' + escapeHtml(id) + '"' + selected + '>' + escapeHtml(text) + '</option>';
      });
      return opts;
    },

    _buildEmployeeOptions(employees) {
      const list = employees || [];
      let opts = '<option value="">-- Chọn / 選択 --</option>';
      list.forEach((e) => {
        const id = String(e.EmployeeID || '').trim();
        if (!id) return;
        const name = e.EmployeeNameShort || e.EmployeeName || e.name || id;
        opts += '<option value="' + escapeHtml(id) + '">' + escapeHtml(name) + '</option>';
      });
      return opts;
    },

    _bindEvents(item, companies, employees, teflonlog) {
      const panel = document.getElementById('tefproc-panel');
      if (!panel) return;

      const header = panel.querySelector('.checkio-header');
      attachSwipeToClose(header, panel, this.close.bind(this));

      const closeBtn = document.getElementById('tefproc-close');
      const bottomClose = document.getElementById('tefproc-bottom-close');
      const cancelSend = document.getElementById('tefproc-cancel-send');

      // Trạng thái mạ + auto ExpectedDate
      const statusSelect = document.getElementById('tefproc-status');
      const statusPill = document.getElementById('tefproc-status-pill');
      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');

      if (statusSelect && statusPill) {
        const updateStatusPill = () => {
          const key = statusSelect.value;
          const label = statusKeyToCoatingLabel(key) || '';
          statusPill.textContent = label;
          statusPill.setAttribute('data-status', key);
        };
        statusSelect.addEventListener('change', updateStatusPill);
        updateStatusPill();
      }

      // Auto-fill Ngày dự kiến nhận = +5 ngày làm việc từ ngày gửi
      if (sentDateEl && expDateEl) {
        sentDateEl.addEventListener('change', () => {
          if (!sentDateEl.value) return;
          if (expDateEl.value) return;
          const auto = addBusinessDaysISO(sentDateEl.value, 5);
          if (auto) {
            expDateEl.value = auto;
          }
        });
      }

      if (closeBtn) closeBtn.addEventListener('click', this.close.bind(this));
      if (bottomClose) bottomClose.addEventListener('click', this.close.bind(this));
      if (cancelSend) cancelSend.addEventListener('click', this.close.bind(this));

      // Chuyển mode
      const modeButtons = panel.querySelectorAll('.mode-btn');
      modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          modeButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          const sections = panel.querySelectorAll('.tefproc-inputs');
          sections.forEach((sec) => {
            if (sec.getAttribute('data-mode') === mode) {
              sec.style.display = '';
            } else {
              sec.style.display = 'none';
            }
          });
        });
      });

      // Gửi đi mạ
      const saveSendBtn = document.getElementById('tefproc-save-send');
      if (saveSendBtn) {
        saveSendBtn.addEventListener(
          'click',
          this._handleSendSubmit.bind(this, item, companies, employees)
        );
      }

      // Xác nhận đã mạ
      const confirmBtn = document.getElementById('tefproc-confirm-complete');
      if (confirmBtn) {
        confirmBtn.addEventListener(
          'click',
          this._handleCompleteSubmit.bind(this, item, companies, employees)
        );
      }

      // Cập nhật vị trí (mở LocationManager nếu có)
      const updateLocBtn = document.getElementById('tefproc-update-location');
      if (updateLocBtn) {
        updateLocBtn.addEventListener('click', () => {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            window.LocationManager.openModal(item);
          } else {
            alert(
              'Location module chưa sẵn sàng.\n位置管理モジュールが利用できません。'
            );
          }
        });
      }
    },
    async _handleSendSubmit(item, companies, employees) {
      if (isSaving) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const moldId = String(item.MoldID).trim();

      const supplierEl = document.getElementById('tefproc-supplier');
      const reqDateEl = document.getElementById('tefproc-request-date');
      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');
      const reqEmpEl = document.getElementById('tefproc-request-emp');
      const sentEmpEl = document.getElementById('tefproc-sent-emp');
      const typeEl = document.getElementById('tefproc-coating-type');
      const reasonEl = document.getElementById('tefproc-reason');
      const costEl = document.getElementById('tefproc-cost');
      const notesEl = document.getElementById('tefproc-notes');
      const statusEl = document.getElementById('tefproc-status');

      const statusKey = statusEl ? statusEl.value : 'sent';
      const teflonStatus = statusKeyToLogStatus(statusKey) || 'Sent';

      const supplierId = supplierEl ? supplierEl.value.trim() : '';
      const reqDate = reqDateEl ? reqDateEl.value : '';
      const sentDate = sentDateEl ? sentDateEl.value : '';
      const expDate = expDateEl ? expDateEl.value : '';
      const reqEmpId = reqEmpEl ? reqEmpEl.value.trim() : '';
      const sentEmpId = sentEmpEl ? sentEmpEl.value.trim() : '';
      const coatingType = typeEl ? typeEl.value.trim() : '';
      const reason = reasonEl ? reasonEl.value.trim() : '';
      const costNum = toNumber(costEl ? costEl.value : '');
      const notes = notesEl ? notesEl.value.trim() : '';

      if (!supplierId) {
        alert('Vui lòng chọn nhà cung cấp.\n業者を選択してください。');
        if (supplierEl) supplierEl.focus();
        return;
      }

      // Với pending: cho phép chưa có ngày gửi
      if (statusKey !== 'pending' && !sentDate) {
        alert('Vui lòng chọn ngày gửi.\n出荷日を入力してください。');
        if (sentDateEl) sentDateEl.focus();
        return;
      }

      const newLogId = getNextTeflonLogId(data);
      const nowIso = new Date().toISOString();
      const today = getTodayISO();

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: teflonStatus,
        RequestedBy: reqEmpId || '',
        RequestedDate: reqDate || sentDate,
        SentBy: sentEmpId || reqEmpId || '',
        SentDate: sentDate,
        ExpectedDate: expDate || '',
        ReceivedDate: '',
        SupplierID: supplierId,
        CoatingType: coatingType,
        Reason: reason,
        TeflonCost: costNum != null ? String(costNum) : '',
        Quality: '',
        TeflonNotes: notes || 'Đi mạ khuôn / テフロン加工へ出荷',
        CreatedDate: today,
        UpdatedBy: reqEmpId || sentEmpId || '',
        UpdatedDate: today
      };

      // Chỉ tạo CHECKOUT khi trạng thái là "sent" (đã gửi đi mạ)
      let statusEntry = null;
      if (statusKey === 'sent') {
        statusEntry = {
          StatusLogID: '',
          MoldID: moldId,
          CutterID: '',
          ItemType: 'mold',
          Status: 'CHECKOUT',
          Timestamp: nowIso,
          EmployeeID: sentEmpId || reqEmpId || '',
          DestinationID: '',
          Notes: 'Đi mạ khuôn | テフロン加工出荷',
          AuditDate: sentDate || today,
          AuditType: 'TEFLON-SEND'
        };
      }

      // Đóng panel ngay, xử lý nền
      this.close();
      showToast('Đang ghi nhận gửi khuôn đi mạ...', 'info');
      isSaving = true;

      try {
        // 1) Ghi teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });

        let addJson = null;
        try {
          addJson = await addRes.json();
        } catch (e) {
          addJson = null;
        }

        if (!addRes.ok || !addJson || !addJson.success) {
          throw new Error((addJson && addJson.message) || 'Không ghi được teflonlog.csv');
        }

        // 2) Ghi statuslogs.csv CHECKOUT (chỉ khi đã gửi đi mạ)
        if (statusEntry) {
          try {
            const stRes = await fetch(API_ADD_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
            });

            let stJson = null;
            try {
              stJson = await stRes.json();
            } catch (e) {
              stJson = null;
            }

            if (!stRes.ok || !stJson || !stJson.success) {
              console.warn('[TeflonProcessManager] Không ghi được statuslogs.csv', stJson);
            }
          } catch (e) {
            console.warn('[TeflonProcessManager] Lỗi khi ghi statuslogs checkout', e);
          }
        }

        // 3) Cập nhật DataManager in-memory
        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);

          if (statusEntry) {
            if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
            data.statuslogs.unshift(statusEntry);
          }
        }

        if (dm && typeof dm.recompute === 'function') {
          try {
            dm.recompute();
          } catch (e) {
            console.warn('[TeflonProcessManager] DataManager.recompute error', e);
          }
        }

        showToast('Đã ghi nhận gửi khuôn đi mạ.', 'success');
      } catch (err) {
        console.error('[TeflonProcessManager] send error', err);
        showToast('Lỗi khi ghi dữ liệu mạ Teflon.', 'error');
        alert(
          'Lỗi khi ghi dữ liệu mạ Teflon.\n' +
            (err && err.message ? String(err.message) : '')
        );
      } finally {
        isSaving = false;
      }
    },

    async _handleCompleteSubmit(item, companies, employees) {
      if (isSaving) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const teflonlog = data.teflonlog || [];
      const moldId = String(item.MoldID).trim();

      const recvDateEl = document.getElementById('tefproc-received-date');
      const recvEmpEl = document.getElementById('tefproc-received-emp');
      const qualityEl = document.getElementById('tefproc-quality');
      const notesEl = document.getElementById('tefproc-complete-notes');

      const recvDate = recvDateEl ? recvDateEl.value : '';
      const recvEmpId = recvEmpEl ? recvEmpEl.value.trim() : '';
      const quality = qualityEl ? qualityEl.value.trim() : '';
      const notes = notesEl ? notesEl.value.trim() : '';

      if (!recvDate) {
        alert('Vui lòng chọn ngày nhận khuôn.\n受入日を入力してください。');
        if (recvDateEl) recvDateEl.focus();
        return;
      }

      const historyForMold = buildTeflonHistory(teflonlog, item);
      const lastLog = historyForMold[0] || null;

      const supplierId =
        (lastLog && lastLog.SupplierID) || DEFAULT_SUPPLIER_ID || '';

      const newLogId = getNextTeflonLogId(data);
      const today = getTodayISO();
      const nowIso = new Date().toISOString();

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: 'Completed',
        RequestedBy: (lastLog && lastLog.RequestedBy) || '',
        RequestedDate: (lastLog && lastLog.RequestedDate) || '',
        SentBy: (lastLog && lastLog.SentBy) || '',
        SentDate: (lastLog && lastLog.SentDate) || '',
        ExpectedDate: (lastLog && lastLog.ExpectedDate) || '',
        ReceivedDate: recvDate,
        SupplierID: supplierId,
        CoatingType: (lastLog && lastLog.CoatingType) || '',
        Reason: (lastLog && lastLog.Reason) || '',
        TeflonCost: (lastLog && lastLog.TeflonCost) || '',
        Quality: quality || '',
        TeflonNotes: notes || 'Hoàn tất mạ khuôn / テフロン加工完了',
        CreatedDate: today,
        UpdatedBy: recvEmpId || '',
        UpdatedDate: today
      };

      const statusEntry = {
        StatusLogID: '',
        MoldID: moldId,
        CutterID: '',
        ItemType: 'mold',
        Status: 'CHECKIN',
        Timestamp: nowIso,
        EmployeeID: recvEmpId || '',
        DestinationID: '',
        Notes: 'Khuôn mạ Teflon đã về kho / テフロン加工済み金型入庫',
        AuditDate: recvDate,
        AuditType: 'TEFLON-RETURN'
      };

      // Chuẩn bị payload update molds.csv
      const updatePayload = {
        filename: 'molds.csv',
        itemIdField: 'MoldID',
        itemIdValue: moldId,
        updates: {
          // Đã mạ xong → テフロン加工済
          TeflonCoating: statusKeyToCoatingLabel('completed'),
          TeflonReceivedDate: recvDate,
          TeflonSentDate: lastLog ? (lastLog.SentDate || '') : '',
          TeflonExpectedDate: lastLog ? (lastLog.ExpectedDate || '') : ''
        }
      };

      // Hỏi có mở LocationModule sau khi xong không
      const wantUpdateLocation = window.confirm(
        'Đã mạ xong. Có muốn cập nhật vị trí mới cho khuôn này không?\nテフロン加工完了後、新しい保管位置を更新しますか？'
      );

      // Đóng panel, xử lý nền
      this.close();
      showToast('Đang ghi nhận hoàn tất mạ khuôn...', 'info');
      isSaving = true;

      try {
        // 1) Ghi teflonlog.csv Completed
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });

        let addJson = null;
        try {
          addJson = await addRes.json();
        } catch (e) {
          addJson = null;
        }

        if (!addRes.ok || !addJson || !addJson.success) {
          throw new Error((addJson && addJson.message) || 'Không ghi được teflonlog.csv');
        }

        // 2) Ghi statuslogs.csv CHECKIN
        try {
          const stRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
          });

          let stJson = null;
          try {
            stJson = await stRes.json();
          } catch (e) {
            stJson = null;
          }

          if (!stRes.ok || !stJson || !stJson.success) {
            console.warn('[TeflonProcessManager] Không ghi được statuslogs.csv CHECKIN', stJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] Lỗi khi ghi statuslogs checkin', e);
        }

        // 3) Cập nhật molds.csv trạng thái Teflon
        try {
          const updRes = await fetch(API_UPDATE_ITEM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });

          let updJson = null;
          try {
            updJson = await updRes.json();
          } catch (e) {
            updJson = null;
          }

          if (!updRes.ok || !updJson || !updJson.success) {
            console.warn('[TeflonProcessManager] Không cập nhật được molds.csv', updJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] Lỗi khi cập nhật molds.csv', e);
        }

        // 4) Cập nhật DataManager in-memory
        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);

          if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
          data.statuslogs.unshift(statusEntry);

          // Cập nhật bản ghi molds trong bộ nhớ
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
            if (mold) {
              mold.TeflonCoating = updatePayload.updates.TeflonCoating;
              mold.TeflonReceivedDate = updatePayload.updates.TeflonReceivedDate;
              mold.TeflonSentDate = updatePayload.updates.TeflonSentDate;
              mold.TeflonExpectedDate = updatePayload.updates.TeflonExpectedDate;
            }
          }
        }

        let updatedItem = item;
        if (Array.isArray(data.molds)) {
          const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
          if (mold) updatedItem = mold;
        }

        if (dm && typeof dm.recompute === 'function') {
          try {
            dm.recompute();
          } catch (e) {
            console.warn('[TeflonProcessManager] DataManager.recompute error', e);
          }
        }

        // Bắn event detail:changed để đồng bộ badge, detail tab
        try {
          const detailEvt = new CustomEvent('detail:changed', {
            detail: {
              item: updatedItem,
              itemType: 'mold',
              itemId: moldId,
              source: 'teflon-process'
            }
          });
          document.dispatchEvent(detailEvt);
        } catch (e) {
          console.warn('[TeflonProcessManager] Không dispatch được detail:changed', e);
        }

        showToast('Đã ghi nhận hoàn tất mạ khuôn.', 'success');

        // 5) Nếu người dùng muốn cập nhật vị trí mới → mở LocationManager
        if (wantUpdateLocation) {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            window.LocationManager.openModal(updatedItem);
          } else {
            alert(
              'Không mở được module vị trí. Vui lòng mở lại từ nút Vị trí.\n位置管理モジュールを開けませんでした。位置ボタンから再度お試しください。'
            );
          }
        }
      } catch (err) {
        console.error('[TeflonProcessManager] complete error', err);
        showToast('Lỗi khi ghi dữ liệu hoàn tất mạ Teflon.', 'error');
        alert(
          'Lỗi khi ghi dữ liệu hoàn tất mạ Teflon.\n' +
            (err && err.message ? String(err.message) : '')
        );
      } finally {
        isSaving = false;
      }
    }
  };

  // Xuất ra global
  window.TeflonProcessManager = {
    INIT: TeflonProcessManager.INIT.bind(TeflonProcessManager),
    openPanel: TeflonProcessManager.openPanel.bind(TeflonProcessManager),
    close: TeflonProcessManager.close.bind(TeflonProcessManager)
  };

  // Tự động INIT khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.TeflonProcessManager.INIT();
    });
  } else {
    window.TeflonProcessManager.INIT();
  }

  // Bridge lắng nghe triggerTeflon mở panel
  document.addEventListener('triggerTeflon', function (e) {
    try {
      const detail = e && e.detail;
      const item = detail && detail.item;
      const type = detail && detail.type; // mold / cutter nếu cần sau này

      // Chỉ xử lý cho khuôn -- module này thiết kế cho molds
      if (!item || !item.MoldID) {
        console.warn('[TeflonProcess] triggerTeflon without valid Mold item', detail);
        return;
      }

      if (!window.TeflonProcessManager || typeof window.TeflonProcessManager.openPanel !== 'function') {
        console.warn('[TeflonProcess] TeflonProcessManager.openPanel not ready');
        return;
      }

      // Mở panel Teflon xử lý khuôn hiện tại
      window.TeflonProcessManager.openPanel(item);
    } catch (err) {
      console.error('[TeflonProcess] Error handling triggerTeflon event', err);
    }
  });

})();
