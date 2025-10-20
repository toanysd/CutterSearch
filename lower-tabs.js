/**
 * lower-tabs.js (v2) – Keyboard tab fixed layout + actions
 */
(function () {
  'use strict';

  const SEL = {
    main: '.main-container',
    upper: '.upper-section',
    lower: '.lower-section',
    tabBtn: '.lower-tab',
    pane: '.tab-pane',
    keyboardPane: '#keyboard-pane',
    resultsPane: '#results-pane',
    detailPane: '#detail-pane',
    searchInput: '#search-input, .search-input, input[name="search"]',
    historyWrap: '#history-container',
    suggestList: '#keyboard-suggest',
    vk: '#virtual-keyboard',
    abbrWrap: '#abbr-wrap',
    kbBadge: '#kb-toggle-badge',
    qrOpen: '#qr-scan-open',
    qrModal: '#qr-modal',
    qrMount: '#qr-reader',
    qrClose: '#qr-close-btn'
  };

  function ensureLowerDOM() {
    if (document.querySelector(SEL.lower) && document.querySelector('#keyboard-pane')) return;

    const main = document.querySelector(SEL.main);
    const lower = document.createElement('div');
    lower.className = 'lower-section';
    lower.innerHTML = `
      <div class="panel lower-panel">
        <div class="lower-tabs">
          <button class="lower-tab active" data-tab="keyboard"><i class="fas fa-keyboard"></i><span>[translate:キーボード] / Bàn phím</span><span class="tab-count" id="kb-toggle-badge">ON</span></button>
          <button class="lower-tab" data-tab="results"><i class="fas fa-table"></i><span>[translate:一覧] / Bảng</span></button>
          <button class="lower-tab" data-tab="detail"><i class="fas fa-list"></i><span>[translate:詳細] / Chi tiết</span></button>
          <div style="margin-left:auto;display:flex;gap:6px;padding-right:8px;"><button class="btn" id="qr-scan-open"><i class="fas fa-qrcode"></i> QR</button></div>
        </div>
        <div class="lower-content">
          <div class="tab-pane active" id="keyboard-pane">
            <div class="keyboard-layout">
              <div class="keyboard-left">
                <div class="keyboard-section history-zone">
                  <h4>[translate:履歴] / Lịch sử</h4>
                  <div id="history-container"><div id="history-chips"></div></div>
                </div>
                <div class="keyboard-section suggest-zone">
                  <h4>[translate:提案] / Gợi ý</h4>
                  <div id="keyboard-suggest"></div>
                </div>
              </div>
              <div class="keyboard-center">
                <div id="virtual-keyboard"></div>
              </div>
              <div class="keyboard-right">
                <h4>[translate:クイック入力] / Nhập nhanh</h4>
                <div id="abbr-wrap" class="quick-phrases"></div>
                <button class="qr-scan-large" id="qr-scan-open"><i class="fas fa-qrcode"></i><span>[translate:QRスキャン] / Quét QR</span></button>
              </div>
            </div>
          </div>
          <div class="tab-pane" id="results-pane">
            <div class="table-wrap">
              <table class="results-table">
                <thead><tr>
                  <th>[translate:種別] / Loại</th><th>[translate:コード] / Mã</th><th>[translate:名称] / Tên</th>
                  <th>[translate:寸法] / Kích thước</th><th>[translate:保管場所] / Nơi lưu</th><th>[translate:製造日] / Ngày SX</th>
                  <th>[translate:状態] / Trạng thái</th><th>[translate:操作] / Thao tác</th>
                </tr></thead>
                <tbody id="results-tbody"></tbody>
              </table>
            </div>
          </div>
          <div class="tab-pane" id="detail-pane"><div class="detail-full-view" id="detail-info-body"></div></div>
        </div>
      </div>
      <div class="qr-modal hidden" id="qr-modal"><div class="qr-dialog"><div class="qr-header"><span>[translate:QRスキャナ] / Máy quét QR</span><button class="btn btn-small" id="qr-close-btn"><i class="fas fa-times"></i></button></div><div id="qr-reader" class="qr-reader"></div></div></div>
    `;
    main.appendChild(lower);

    // Bổ sung style bố cục panel trái (50% lịch sử / 50% gợi ý) + popover
    if (!document.getElementById('lower-extra-style')) {
      const st = document.createElement('style');
      st.id = 'lower-extra-style';
      st.textContent = `
        .keyboard-left { display: grid; grid-template-rows: 1fr 1fr; gap: var(--spacing-md,10px); }
        .history-zone, .suggest-zone { min-height: 0; overflow: auto; }
        #keyboard-suggest .chip-row { display:flex; flex-wrap:wrap; gap:8px; }
        .qr-modal { position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:9999; }
        .qr-modal.hidden { display:none; }
        .qr-dialog { background:#fff; border-radius:10px; padding:8px; width:min(420px,92vw); }
        .qr-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .qr-reader { width:100%; min-height:320px; }
        .suggest-popover { background:#fff; border:1px solid var(--color-border,#e2e8f0); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.12); }
      `;
      document.head.appendChild(st);
    }
  }

  function bindTabs() {
    document.querySelectorAll(SEL.tabBtn).forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll(SEL.tabBtn).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll(SEL.pane).forEach(p => p.classList.remove('active'));
        document.getElementById(`${tab}-pane`)?.classList.add('active');
      });
    });
  }

  function getInput() {
    return document.querySelector(SEL.searchInput);
  }
  function pushToInput(text) {
    const input = getInput();
    if (!input) return;
    input.value = text || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Cụm nhập nhanh lấy theo tiền tố chữ cái từ lịch sử
  function buildAbbr() {
    const wrap = document.querySelector('#abbr-wrap');
    if (!wrap) return;
    const fill = (arr=[]) => {
      wrap.innerHTML = '';
      arr.forEach(code => {
        const b = document.createElement('button');
        b.className = 'quick-btn';
        b.textContent = code;
        b.addEventListener('click', () => pushToInput(code));
        wrap.appendChild(b);
      });
    };
    fill(window.SearchHistory?.getTopPrefixes?.(12) || []);
    document.addEventListener('history:updated', (e) => fill(e.detail?.prefixes || []));
  }


  // Bàn phím: Clear xuống hàng 2; trái Space=FilterReset; phải Space=NewSearch; không có Enter
  function buildKeyboard() {
    const vk = document.querySelector(SEL.vk);
    if (!vk) return;
    vk.innerHTML = '';

    const rows = [
      ['1','2','3','4','5','6','7','8','9','0','⌫'], // H1 – Backspace cuối
      ['Q','W','E','R','T','Y','U','I','O','P','Clear'], // H2 – Clear dưới Backspace
      ['A','S','D','F','G','H','J','K','L','-'],
      ['Z','X','C','V','B','N','M','_','.'],
      ['FilterReset','Space','NewSearch'] // H5 – theo yêu cầu
    ];

    rows.forEach((r, idx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      if (idx === 1) rowEl.classList.add('staggered-1');
      if (idx === 2) rowEl.classList.add('staggered-2');
      if (idx === 3) rowEl.classList.add('staggered-3');
      vk.appendChild(rowEl);
      r.forEach(k => {
        const key = document.createElement('button');
        key.className = 'key-btn';
        if (k === 'Space') key.classList.add('space-key');
        if (k === 'FilterReset') key.classList.add('key-reset');
        if (k === 'NewSearch') key.classList.add('key-warning');
        key.textContent = label(k);
        key.addEventListener('mousedown', (ev) => ev.preventDefault()); // giữ focus
        key.addEventListener('click', () => onKey(k));
        rowEl.appendChild(key);
      });
    });
  }

  const CHAR_RE = /^[A-Z0-9._-]$/;
  function label(k){
    if(k==='⌫') return '⌫';
    if(k==='Clear') return 'クリア';
    if(k==='FilterReset') return 'フィルタ';
    if(k==='NewSearch') return '新検索';
    if(k==='Space') return '⎵';
    return k;
  }

  function onKey(k) {
    const input = getInput();
    if (!input) return;
    if (CHAR_RE.test(k)) { typeAtCursor(input, k); return; }
    switch (k) {
      case 'Space': typeAtCursor(input, ' '); break;
      case '⌫': backspaceAtCursor(input); break;
      case 'Clear':
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      case 'FilterReset':
        window.FilterModule?.reset ? window.FilterModule.reset()
          : document.dispatchEvent(new CustomEvent('filter:reset', { detail: { reason: 'keyboard' } }));
        requestAnimationFrame(() => input.dispatchEvent(new Event('input', { bubbles: true })));
        break;
      case 'NewSearch':
        window.SearchModule?.setCategory?.('all');
        input.value = '';
        window.FilterModule?.reset?.();
        requestAnimationFrame(() => {
          input.focus();
          window.SearchModule?.setQuery?.('');
          window.SearchModule?.performSearch?.();
        });
        break;
    }
  }
  function typeAtCursor(input, ch) {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + ch + input.value.slice(e);
    const pos = s + ch.length;
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function backspaceAtCursor(input) {
    const s = input.selectionStart ?? 0;
    const e = input.selectionEnd ?? 0;
    if (s === e && s > 0) {
      input.value = input.value.slice(0, s - 1) + input.value.slice(e);
      input.setSelectionRange(s - 1, s - 1);
    } else {
      input.value = input.value.slice(0, s) + input.value.slice(e);
      input.setSelectionRange(s, s);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // QR events (giữ nguyên)
  let qr = null;
  function bindQR() {
    document.querySelectorAll(SEL.qrOpen).forEach(b => b.addEventListener('click', openQR));
    document.querySelector(SEL.qrClose)?.addEventListener('click', closeQR);
    document.querySelector(SEL.qrModal)?.addEventListener('click', (e) => { if (e.target?.id === 'qr-modal') closeQR(); });
  }
  async function openQR() {
    const modal = document.querySelector(SEL.qrModal);
    const mount = document.querySelector(SEL.qrMount);
    if (!modal || !mount) return;
    modal.classList.remove('hidden');
    if (!window.Html5Qrcode) return;
    qr = new Html5Qrcode(mount.id);
    try {
      await qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => {
        pushToInput(text || '');
        window.SearchModule?.setQuery?.(text || '');
        window.SearchModule?.performSearch?.();
        closeQR();
      });
    } catch {}
  }
  async function closeQR() { if (qr) { try { await qr.stop(); await qr.clear(); } catch {} qr = null; } document.querySelector(SEL.qrModal)?.classList.add('hidden'); }

  function init() {
    ensureLowerDOM();
    bindTabs();
    buildAbbr();
    buildKeyboard();
    bindQR();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
