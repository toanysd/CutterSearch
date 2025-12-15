/**
 * teflon-manager-r7.1.1.i18n.js
 * i18n / 表示文言管理 (JP優先 / Ưu tiên tiếng Nhật)
 *
 * Mục tiêu:
 * - Tập trung toàn bộ label JP/VI vào một nơi.
 * - Cung cấp helper render "JP trên / VI dưới".
 * - Patch an toàn vào TeflonManager nếu tồn tại:
 *   - Override getShortStatusLabel()
 *   - Override getLongStatusLabelJPVI()
 *   - Sau openPanel(): thay text cho header/placeholder/help/option nếu UI đang dùng text cứng
 *
 * Load order khuyến nghị:
 * 1) teflon-manager-r7.1.1.js
 * 2) teflon-manager-r7.1.1.theme.js (optional)
 * 3) teflon-manager-r7.1.1.badge.js (optional)
 * 4) teflon-manager-r7.1.1.i18n.js  (this)
 */

(function () {
  'use strict';

  // -------------------------
  // Dictionary
  // -------------------------
  const I18N = {
    version: 'r7.1.1',
    langPriority: 'jp', // JP-first UI

    // Status keys used in r7.1.1.js
    status: {
      pending: {
        shortJP: '承認待ち',
        shortVI: 'Yêu cầu mạ',
        longJP: 'テフロン加工承認待ち',
        longVI: 'Yêu cầu mạ (chờ phê duyệt)'
      },
      approved: {
        shortJP: '承認済',
        shortVI: 'Đã duyệt',
        longJP: '承認済(発送待ち)',
        longVI: 'Đã duyệt (chờ gửi đi mạ)'
      },
      processing: {
        shortJP: '加工中',
        shortVI: 'Đang mạ',
        longJP: 'テフロン加工中',
        longVI: 'Đã gửi đi mạ (đang mạ)'
      },
      completed: {
        shortJP: '加工済',
        shortVI: 'Đã mạ',
        longJP: 'テフロン加工済',
        longVI: 'Đã mạ xong'
      },
      unknown: {
        shortJP: '-',
        shortVI: '-',
        longJP: '-',
        longVI: '-'
      }
    },

    ui: {
      panel: {
        titleJP: 'テフロン加工管理',
        titleVI: 'Quản lý mạ Teflon',
        summaryJP: 'ステータス別に依頼状況を表示します。',
        summaryVI: 'Hiển thị theo trạng thái xử lý.',
        helpJP: 'ヘッダークリックでソート。金型名クリックで詳細。',
        helpVI: 'Bấm tiêu đề để sắp xếp. Bấm tên khuôn để xem chi tiết.',
        filterLabelJP: '表示',
        filterLabelVI: 'Hiển thị',
        searchPlaceholderJP: '金型名・コード検索',
        searchPlaceholderVI: 'Tìm khuôn (tên/mã)'
      },

      modal: {
        titleJP: 'テフロン加工詳細',
        titleVI: 'Chi tiết mạ Teflon',
        closeJP: '閉じる',
        closeVI: 'Đóng'
      },

      buttons: {
        closeJP: '閉じる',
        closeVI: 'Đóng',
        exportJP: 'CSV出力',
        exportVI: 'Xuất CSV',
        printJP: '印刷',
        printVI: 'In',
        mailJP: 'メール送信',
        mailVI: 'Gửi email'
      },

      table: {
        moldNameJP: '金型名',
        moldNameVI: 'Khuôn',
        statusJP: '状態',
        statusVI: 'Trạng thái',
        requestedJP: '依頼日',
        requestedVI: 'Ngày yêu cầu',
        requestedByJP: '依頼者',
        requestedByVI: 'Người yêu cầu',
        sentJP: '出荷日',
        sentVI: 'Ngày gửi',
        receivedJP: '受入日',
        receivedVI: 'Ngày nhận',
        handlerJP: '担当者',
        handlerVI: 'Người phụ trách',
        memoJP: 'メモ',
        memoVI: 'Ghi chú'
      },

      filterOptions: {
        activeJP: '承認待ち・承認済・加工中',
        activeVI: 'Chờ duyệt / Chờ gửi / Đang mạ',
        pendingJP: 'テフロン加工承認待ち',
        pendingVI: 'Yêu cầu mạ (chờ phê duyệt)',
        approvedJP: '承認済(発送待ち)',
        approvedVI: 'Đã duyệt (chờ gửi đi mạ)',
        processingJP: 'テフロン加工中',
        processingVI: 'Đang mạ',
        completedJP: 'テフロン加工済',
        completedVI: 'Đã mạ xong',
        allJP: '全て',
        allVI: 'Tất cả'
      },

      alerts: {
        noDataExportJP: 'エクスポートするデータがありません。',
        noDataExportVI: 'Không có dữ liệu để xuất.',
        noDataPrintJP: '印刷するデータがありません。',
        noDataPrintVI: 'Không có dữ liệu để in.',
        noDataMailJP: 'メール送信するデータがありません。',
        noDataMailVI: 'Không có dữ liệu để gửi mail.'
      }
    }
  };

  // Expose dictionary
  window.TeflonManagerI18N = I18N;

  // -------------------------
  // Helpers
  // -------------------------
  function esc(s) {
    const div = document.createElement('div');
    div.textContent = (s == null) ? '' : String(s);
    return div.innerHTML;
  }

  function renderJPVI(jp, vi, options) {
    const opt = options || {};
    const jpTag = opt.jpTag || 'div';
    const viTag = opt.viTag || 'div';
    const jpClass = opt.jpClass || 'jp';
    const viClass = opt.viClass || 'vi';
    const wrapperTag = opt.wrapperTag || 'div';
    const wrapperClass = opt.wrapperClass || '';

    return ''
      + `<${wrapperTag}${wrapperClass ? ` class="${wrapperClass}"` : ''}>`
      + `<${jpTag} class="${jpClass}">${esc(jp)}</${jpTag}>`
      + `<${viTag} class="${viClass}">${esc(vi)}</${viTag}>`
      + `</${wrapperTag}>`;
  }

  function statusKeyNormalize(key) {
    const k = String(key || '').trim();
    if (k === 'pending' || k === 'approved' || k === 'processing' || k === 'completed') return k;
    // legacy
    if (k === 'sent') return 'processing';
    return 'unknown';
  }

  function getStatusShortJP(key) {
    const k = statusKeyNormalize(key);
    return (I18N.status[k] || I18N.status.unknown).shortJP;
  }
  function getStatusLongJP(key) {
    const k = statusKeyNormalize(key);
    return (I18N.status[k] || I18N.status.unknown).longJP;
  }
  function getStatusLongJPVIHtml(key) {
    const k = statusKeyNormalize(key);
    const obj = (I18N.status[k] || I18N.status.unknown);
    // Return as HTML "JP<br><span>VI</span>" to match existing pattern
    return `${esc(obj.longJP)}<br><span style="font-size:11px;opacity:0.85;">${esc(obj.longVI)}</span>`;
  }

  // -------------------------
  // DOM patching (panel/modal)
  // -------------------------
  function patchPanelTexts() {
    const panel = document.getElementById('teflon-panel');
    if (!panel) return;

    // Header title
    const header = panel.querySelector('.tef-header .tef-title');
    if (header) {
      // replace header inner content to ensure consistent JP/VI
      header.innerHTML =
        `<div style="font-size:15px;font-weight:800;">${esc(I18N.ui.panel.titleJP)}</div>` +
        `<div style="font-size:12px;opacity:0.88;">${esc(I18N.ui.panel.titleVI)}</div>`;
    }

    // Summary
    const summary = panel.querySelector('.tef-summary');
    if (summary) {
      const jpEl = summary.querySelector('.jp');
      const viEl = summary.querySelector('.vi');
      if (jpEl && viEl) {
        jpEl.textContent = I18N.ui.panel.summaryJP;
        viEl.textContent = I18N.ui.panel.summaryVI;
      } else {
        summary.textContent = `${I18N.ui.panel.summaryJP} / ${I18N.ui.panel.summaryVI}`;
      }
    }


    // Help (if exists)
    const help = panel.querySelector('.tef-help');
    if (help) {
      help.textContent = `${I18N.ui.panel.helpJP} / ${I18N.ui.panel.helpVI}`;
    }

    // Filter label: the file might have a hardcoded <label> before select
    const filterRow = panel.querySelector('.filter-row');
    if (filterRow) {
      const labels = filterRow.querySelectorAll('label');
      labels.forEach(lb => {
        const t = (lb.textContent || '').trim();
        if (t === '表示:' || t === '表示' || t === 'ステータス:' || t === 'ステータス') {
          lb.innerHTML = `${esc(I18N.ui.panel.filterLabelJP)}:<br><span style="font-weight:500;opacity:0.85;">${esc(I18N.ui.panel.filterLabelVI)}</span>`;
        }
      });
    }

    // Search placeholder
    const search = panel.querySelector('#teflon-search-input');
    if (search) {
      search.setAttribute('placeholder', `${I18N.ui.panel.searchPlaceholderJP} / ${I18N.ui.panel.searchPlaceholderVI}`);
    }

    // Filter options (by value)
    const select = panel.querySelector('#teflon-status-filter');
    if (select) {
      const optMap = I18N.ui.filterOptions;
      Array.from(select.options || []).forEach(opt => {
        const v = String(opt.value || '').trim();
        if (v === 'active') opt.text = `${optMap.activeJP} / ${optMap.activeVI}`;
        else if (v === 'pending') opt.text = `${optMap.pendingJP} / ${optMap.pendingVI}`;
        else if (v === 'approved') opt.text = `${optMap.approvedJP} / ${optMap.approvedVI}`;
        else if (v === 'processing') opt.text = `${optMap.processingJP} / ${optMap.processingVI}`;
        else if (v === 'completed') opt.text = `${optMap.completedJP} / ${optMap.completedVI}`;
        else if (v === 'all') opt.text = `${optMap.allJP} / ${optMap.allVI}`;
      });
    }

    // Bottom buttons: enforce JP top / VI bottom if elements exist
    const closeBtn = panel.querySelector('#teflon-close-bottom');
    const exportBtn = panel.querySelector('#teflon-export-btn');
    const printBtn = panel.querySelector('#teflon-print-btn');
    const mailBtn = panel.querySelector('#teflon-mail-btn');

    function forceButtonJPVI(btnEl, jp, vi) {
      if (!btnEl) return;
      // If button already uses .jp/.vi, keep; else replace
      const hasJP = btnEl.querySelector('.jp');
      const hasVI = btnEl.querySelector('.vi');
      if (hasJP && hasVI) {
        hasJP.textContent = jp;
        hasVI.textContent = vi;
      } else {
        btnEl.innerHTML = `<div class="jp">${esc(jp)}</div><div class="vi">${esc(vi)}</div>`;
      }
    }

    forceButtonJPVI(closeBtn, I18N.ui.buttons.closeJP, I18N.ui.buttons.closeVI);
    forceButtonJPVI(exportBtn, I18N.ui.buttons.exportJP, I18N.ui.buttons.exportVI);
    forceButtonJPVI(printBtn, I18N.ui.buttons.printJP, I18N.ui.buttons.printVI);
    forceButtonJPVI(mailBtn, I18N.ui.buttons.mailJP, I18N.ui.buttons.mailVI);
  }

  function patchModalTexts(modalOverlay) {
    const modal = modalOverlay || document.getElementById('teflon-detail-modal');
    if (!modal) return;

    // Title area: if modal header contains two lines, ensure correct.
    const header = modal.querySelector('.modal-header');
    if (header) {
      // If header already contains close button, keep it; only adjust title block if present
      const titleBlock = header.querySelector('h3');
      if (titleBlock) {
        titleBlock.innerHTML = `${esc(I18N.ui.modal.titleJP)} / ${esc(I18N.ui.modal.titleVI)}`;
      } else {
        // If using custom div title block (r7.1.1.js style), try to locate first child container
        const firstDiv = header.querySelector('div');
        if (firstDiv && firstDiv.children && firstDiv.children.length >= 1) {
          // best-effort: rewrite only if it looks like title block
          const text = (firstDiv.textContent || '').trim();
          if (text.indexOf('テフロン') !== -1 || text.indexOf('Chi tiết') !== -1) {
            firstDiv.innerHTML =
              `<div style="margin:0;font-size:15px;font-weight:800;line-height:1.1;">${esc(I18N.ui.modal.titleJP)}</div>` +
              `<div style="margin:0;font-size:12px;opacity:0.9;line-height:1.1;">${esc(I18N.ui.modal.titleVI)}</div>`;
          }
        }
      }
    }

    // Footer close button
    const closeBtn = modal.querySelector('.modal-close-btn');
    if (closeBtn) {
      const jp = closeBtn.querySelector('.jp');
      const vi = closeBtn.querySelector('.vi');
      if (jp && vi) {
        jp.textContent = I18N.ui.modal.closeJP;
        vi.textContent = I18N.ui.modal.closeVI;
      } else {
        closeBtn.innerHTML = `<div class="jp">${esc(I18N.ui.modal.closeJP)}</div><div class="vi">${esc(I18N.ui.modal.closeVI)}</div>`;
      }
    }
  }

  // -------------------------
  // Patch main module
  // -------------------------
  function patchTeflonManager() {
    if (!window.TeflonManager) return false;

    // Override short label generator
    if (typeof window.TeflonManager.getShortStatusLabel === 'function' && !window.TeflonManager.getShortStatusLabel.__tefI18nPatched) {
      window.TeflonManager.getShortStatusLabel = function (statusKey) {
        return getStatusShortJP(statusKey);
      };
      window.TeflonManager.getShortStatusLabel.__tefI18nPatched = true;
    }

    // Override long label JP/VI HTML generator
    window.TeflonManager.getLongStatusLabelJPVI = function (statusKey) {
      return getStatusLongJPVIHtml(statusKey);
    };

    // Patch openPanel to rewrite hard-coded UI labels after render
    if (typeof window.TeflonManager.openPanel === 'function' && !window.TeflonManager.openPanel.__tefI18nPatched) {
      const originalOpen = window.TeflonManager.openPanel.bind(window.TeflonManager);
      window.TeflonManager.openPanel = function () {
        const r = originalOpen();
        //setTimeout(() => patchPanelTexts(), 0);
        //setTimeout(() => patchPanelTexts(), 200);
        patchPanelTexts();
        return r;
      };
      window.TeflonManager.openPanel.__tefI18nPatched = true;
    }

    // Patch openDetailModal to rewrite modal header/footer texts
    if (typeof window.TeflonManager.openDetailModal === 'function' && !window.TeflonManager.openDetailModal.__tefI18nPatched) {
      const originalModal = window.TeflonManager.openDetailModal.bind(window.TeflonManager);
      window.TeflonManager.openDetailModal = function (row) {
        const r = originalModal(row);
        setTimeout(() => patchModalTexts(), 0);
        setTimeout(() => patchModalTexts(), 120);
        return r;
      };
      window.TeflonManager.openDetailModal.__tefI18nPatched = true;
    }

    return true;
  }

  // -------------------------
  // Public API
  // -------------------------
  window.TeflonI18N = {
    version: I18N.version,
    dict: I18N,
    renderJPVI: renderJPVI,
    patchPanel: patchPanelTexts,
    patchModal: patchModalTexts,
    patchManager: patchTeflonManager
  };

  // Boot
  patchTeflonManager();

  // Retry patching for late-load environments
  let tries = 0;
  const timer = setInterval(function () {
    tries++;
    patchTeflonManager();
    patchPanelTexts();
    // Stop after ~10s
    if (tries >= 20) clearInterval(timer);
  }, 500);

})();
