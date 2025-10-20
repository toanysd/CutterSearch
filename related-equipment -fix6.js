/**
 * related-equipment.js - V7.7.7 FIX6
 * 連携設備 / 関連する金型・抜型 / Thiết bị liên quan (Cột 4)
 *
 * FIX6:
 * - Click item = “Chọn kết quả” với cơ chế fallback: ưu tiên AppController.selectResult,
 *   nếu không có sẽ tự render Quick Results (cột 2) và Detail (cột 3); đồng thời phát sự kiện app:select-result.
 * - Dòng luôn có màu nền theo loại (mold/cutter), không còn chỉ đổi màu khi hover.
 * - Giữ FIX5: badge 別抜き ở header nhóm, dòng 1 hàng ID | Tên | ⓵-② (RackID-RackLayerNumber).
 */
(function () {
  'use strict';

  const SEL = {
    hostCandidates: ['.actions-lower', '.panel.actions-panel', '[data-col="4"]', '#col-4', '.col-4'],
    wrapId: 'related-list',
    headerId: 'related-list-header',
    listClass: 'related-eq-list'
  };

  const TEXT = {
    titleForMoldJP: 'カッター情報',
    titleForMoldVN: 'Thông tin dao cắt',
    titleForCutterJP: '関連金型',
    titleForCutterVN: 'Khuôn liên quan',
    empty: '項目を選択してください / Vui lòng chọn một mục',
    badgeSeparateYes: '別抜き あり',
    badgeSeparateNo: '別抜き なし'
  };

  const THEME = { mold: 'theme-mold', cutter: 'theme-cutter', all: 'theme-all' };

  const State = {
    lastKey: null,
    indexesBuilt: false,
    maps: {
      designByMoldId: new Map(),
      moldsByDesign: new Map(),
      cutterIdsByDesign: new Map(),
      designIdsByCutter: new Map(),
      designSeparate: new Map()
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  async function init() {
    injectStyles();
    ensureWrapAndChildren(true);
    await waitForData();
    buildIndexes();
    bindEvents();
    refreshFromDetail();
    setInterval(refreshFromDetail, 800);
    console.log('[RelatedEquipment] FIX6 ready (robust select + persistent row colors)');
  }

  function waitForData() {
    return new Promise(resolve => {
      const tick = () => {
        const d = window.DataManager?.data || window.moldAllData || {};
        const ok = (d.molds?.length||0) && (d.cutters?.length||0) && (d.molddesign?.length||0) && (d.moldcutter?.length||0);
        if (ok) return resolve();
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function ensureHost() {
    for (const s of SEL.hostCandidates) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return document.body;
  }

  function ensureWrapAndChildren(adaptHeader = false) {
    const host = ensureHost();
    let wrap = document.getElementById(SEL.wrapId);
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = SEL.wrapId;
      wrap.className = 'related-eq-wrap';
      host.appendChild(wrap);
    }
    let header = document.getElementById(SEL.headerId);
    if (!header) {
      header = document.createElement('div');
      header.id = SEL.headerId;
      header.className = 'related-eq-header';
      wrap.appendChild(header);
    }
    let list = wrap.querySelector(`.${SEL.listClass}`);
    if (!list) {
      list = document.createElement('div');
      list.className = SEL.listClass;
      wrap.appendChild(list);
    }
    if (adaptHeader) {
      const hasPanelTitle = host.querySelector('.card-header, .panel-title, .panel .header, [data-role="panel-title"]');
      if (hasPanelTitle) wrap.classList.add('no-local-title');
    }
    return { wrap, header, list };
  }

  function applyTheme(viewType) {
    const { wrap } = ensureWrapAndChildren();
    wrap.classList.remove(THEME.mold, THEME.cutter, THEME.all);
    if (viewType === 'mold') wrap.classList.add(THEME.cutter);
    else if (viewType === 'cutter') wrap.classList.add(THEME.mold);
    else wrap.classList.add(THEME.all);
  }

  function injectStyles() {
    const css = document.createElement('style');
    css.textContent = `
      .related-eq-wrap { display:block; padding:10px; border:1px solid #e5e7ef; border-radius:8px; background:#fff; margin-top:8px; }
      .related-eq-wrap.no-local-title .related-eq-header { display:none; }

      /* Header */
      .related-eq-header { margin-bottom:10px; }
      .related-eq-header .title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
      .related-eq-header .title-jp { font-weight:700; color:#111827; font-size:14px; }
      .related-eq-header .title-vn { font-size:11px; color:#6b7280; font-style:italic; }
      .related-eq-header .badge-separate { padding:3px 8px; border-radius:10px; font-size:11px; font-weight:700; }
      .related-eq-header .badge-separate.yes { background:#DC2626; color:#fff; }
      .related-eq-header .badge-separate.no  { background:#e5e7eb; color:#374151; }

      .related-eq-list { max-height: 38vh; overflow:auto; }

      /* Row: luôn có nền theo loại */
      .rel-row { 
        position:relative; display:flex; align-items:center; gap:6px; padding:8px 10px;
        border:1px solid #e5e7ef; border-radius:8px; 
        margin-bottom:8px; cursor:pointer; transition: background .15s, border-color .15s;
      }
      .rel-row.row-mold   { background:#F0FDFF; border-color:#A5F3FC; } /* Mold mặc định */
      .rel-row.row-cutter { background:#FFF9F0; border-color:#FED7AA; } /* Cutter mặc định */
      .related-eq-wrap.theme-mold   .rel-row.row-mold:hover   { filter:brightness(0.98); }
      .related-eq-wrap.theme-cutter .rel-row.row-cutter:hover { filter:brightness(0.98); }

      .rel-id { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:13px; font-weight:700; color:#0B5CAB; flex-shrink:0; }
      .rel-name { flex:1; min-width:0; font-size:13px; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rel-location { display:flex; align-items:center; gap:3px; flex-shrink:0; color:#059669; font-size:13px; font-weight:600; white-space:nowrap; }
      .circle-num { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; border:1.5px solid #059669; color:#059669; background:#EAFBF6; font-size:12px; line-height:1; }
      .square-num { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; border:1.5px solid #059669; color:#059669; background:#EAFBF6; font-size:12px; line-height:1; }
      .sep-dash { margin:0 2px; color:#059669; }

      .related-empty { text-align:center; color:#9ca3af; padding:20px; font-size:13px; }
    `;
    document.head.appendChild(css);
  }

  /* ===== Indexes (MoldDesignID-based) ===== */
  function buildIndexes() {
    const d = window.DataManager?.data || window.moldAllData || {};
    const molds = d.molds || [];
    const molddesign = d.molddesign || [];
    const moldcutter = d.moldcutter || [];

    const designByMoldId = new Map();
    const moldsByDesign = new Map();
    const designSeparate = new Map();

    for (const dj of molddesign) {
      const moldId = str(dj.MoldID ?? dj.MoldId ?? dj.mold_id);
      const designId = str(dj.MoldDesignID ?? dj.MoldDesignId);
      if (!moldId || !designId) continue;
      designByMoldId.set(moldId, designId);
      const sepRaw = dj.SeparateCutter ?? dj.separate_cutter ?? dj.Separate ?? dj.separate ?? '';
      const sep = str(sepRaw).toUpperCase() === 'YES';
      designSeparate.set(designId, (designSeparate.get(designId) || false) || sep);
    }

    for (const m of molds) {
      const moldId = str(m.MoldID ?? m.mold_id);
      let designId = str(m.MoldDesignID ?? m.MoldDesignId);
      if (!designId) designId = designByMoldId.get(moldId) || '';
      if (!designId) continue;
      const arr = moldsByDesign.get(designId) || [];
      arr.push(m);
      moldsByDesign.set(designId, arr);
    }

    const cutterIdsByDesign = new Map();
    const designIdsByCutter = new Map();
    for (const mc of moldcutter) {
      const designId = str(mc.MoldDesignID ?? mc.MoldDesignId);
      const cutterId = str(mc.CutterID ?? mc.CutterId);
      if (!designId || !cutterId) continue;
      if (!cutterIdsByDesign.has(designId)) cutterIdsByDesign.set(designId, new Set());
      cutterIdsByDesign.get(designId).add(cutterId);
      if (!designIdsByCutter.has(cutterId)) designIdsByCutter.set(cutterId, new Set());
      designIdsByCutter.get(cutterId).add(designId);
    }

    State.maps.designByMoldId = designByMoldId;
    State.maps.moldsByDesign = moldsByDesign;
    State.maps.cutterIdsByDesign = cutterIdsByDesign;
    State.maps.designIdsByCutter = designIdsByCutter;
    State.maps.designSeparate = designSeparate;
    State.indexesBuilt = true;
  }

  /* ===== Helpers ===== */
  function findMoldByKey(k) {
    const d = window.DataManager?.data || window.moldAllData || {};
    const molds = d.molds || [];
    const key = str(k);
    let mold = molds.find(m => str(m.MoldID ?? m.mold_id) === key);
    if (!mold) mold = molds.find(m => str(m.MoldCode ?? m.displayCode ?? m.Code).toUpperCase() === key.toUpperCase());
    return mold || null;
  }
  function findCutterByKey(k) {
    const d = window.DataManager?.data || window.moldAllData || {};
    const cutters = d.cutters || [];
    const key = str(k);
    let c = cutters.find(x => str(x.CutterID ?? x.cutter_id) === key);
    if (!c) c = cutters.find(x => str(x.CutterNo ?? x.displayCode ?? x.Code).toUpperCase() === key.toUpperCase());
    return c || null;
  }
  function getDesignIdOfMold(mold) {
    const direct = str(mold.MoldDesignID ?? mold.MoldDesignId);
    if (direct) return direct;
    const moldId = str(mold.MoldID ?? mold.mold_id);
    return State.maps.designByMoldId.get(moldId) || '';
  }
  function separateByDesign(designId) { return !!State.maps.designSeparate.get(str(designId)); }

  function getRelatedCuttersForMoldKey(moldKey) {
    const d = window.DataManager?.data || window.moldAllData || {};
    const cutters = d.cutters || [];
    const mold = findMoldByKey(moldKey);
    if (!mold) return [];
    const designId = getDesignIdOfMold(mold);
    if (!designId) return [];
    const ids = Array.from(State.maps.cutterIdsByDesign.get(designId) || []);
    const sep = separateByDesign(designId);
    return ids.map(cid => {
      const c = cutters.find(x => str(x.CutterID ?? x.CutterId) === str(cid));
      return c ? { item: c, separate: sep } : null;
    }).filter(Boolean);
  }

  function getRelatedMoldsForCutterKey(cutterKey) {
    const cutter = findCutterByKey(cutterKey);
    if (!cutter) return [];
    const cutterId = str(cutter.CutterID ?? cutter.CutterId ?? cutter.cutter_id);
    const designIds = Array.from(State.maps.designIdsByCutter.get(cutterId) || []);
    const out = [];
    for (const did of designIds) {
      const molds = State.maps.moldsByDesign.get(did) || [];
      const sep = separateByDesign(did);
      for (const m of molds) out.push({ item: m, separate: sep });
    }
    return out;
  }

  function getRackId(it) {
    return it?.rackLayerInfo?.RackID ?? it?.rackInfo?.RackID ?? it?.rackInfo?.RackNo ?? it?.rackInfo?.RackName ?? '-';
  }
  function getLayerNo(it) {
    return it?.rackLayerInfo?.RackLayerNumber ?? it?.rackLayerInfo?.LayerNo ?? it?.rackLayerInfo?.LayerNumber ?? it?.RackLayerNumber ?? it?.LayerNo ?? '-';
  }

  function formatDisplay(it, isMold) {
    const id = isMold ? (it.MoldID ?? '-') : (it.CutterNo ?? it.CutterCode ?? it.CutterID ?? '-');
    const name = isMold
      ? (it.MoldCode ?? it.displayCode ?? it.Code ?? '-')
      : (it.CutterName ?? it.displayName ?? it.Name ?? (it.CutterCode ?? '-'));
    const rackId = getRackId(it);
    const layerNo = getLayerNo(it);
    return { id, name, rackId, layerNo };
  }

  function circledHTML(text) { return `<span class="circle-num">${escapeHtml(String(text))}</span>`; }
  function squaredHTML(text) { return `<span class="square-num">${escapeHtml(String(text))}</span>`; }

  function renderRow(targetType, rec, index) {
    const it = rec.item;
    const isMold = (targetType === 'mold');
    const { id, name, rackId, layerNo } = formatDisplay(it, isMold);
    const rowTypeClass = isMold ? 'row-mold' : 'row-cutter';
    return `
      <div class="rel-row ${rowTypeClass}" data-idx="${index}" data-type="${targetType}" data-id="${escapeHtml(id)}" title="${escapeHtml(String(id))} ${escapeHtml(String(name))}">
        <span class="rel-id">${escapeHtml(id)}</span>
        <span class="rel-name">${escapeHtml(name)}</span>
        <span class="rel-location">
          ${circledHTML(rackId)}<span class="sep-dash">-</span>${squaredHTML(layerNo)}
        </span>
      </div>
    `;
  }

  function renderList(viewType, related) {
    const { header, list } = ensureWrapAndChildren();
    const groupSeparate = related?.some(r => r.separate) === true;
    const titleJP = (viewType === 'mold') ? TEXT.titleForMoldJP : TEXT.titleForCutterJP;
    const titleVN = (viewType === 'mold') ? TEXT.titleForMoldVN : TEXT.titleForCutterVN;
    const badgeClass = groupSeparate ? 'yes' : 'no';
    const badgeText = groupSeparate ? TEXT.badgeSeparateYes : TEXT.badgeSeparateNo;

    header.innerHTML = `
      <div class="title-row">
        <span class="title-jp">${titleJP}</span>
        <span class="badge-separate ${badgeClass}">${badgeText}</span>
      </div>
      <div class="title-vn">/ ${titleVN}</div>
    `;
    applyTheme(viewType);

    if (!related || related.length === 0) {
      list.innerHTML = `<div class="related-empty">${TEXT.empty}</div>`;
      return;
    }

    const targetType = (viewType === 'mold') ? 'cutter' : 'mold';
    const rows = related.map((r, i) => renderRow(targetType, r, i)).join('');
    list.innerHTML = rows;

    list.querySelectorAll('.rel-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-idx'));
        const rec = related[idx];
        safeSelect(rec.item); // chọn item với fallback an toàn
      });
    });
  }

  /* ===== Robust select (không phụ thuộc biến thể module) ===== */
  function safeSelect(item) {
    const type = item.MoldID != null ? 'mold' : 'cutter';
    const id = String(type === 'mold' ? (item.MoldID ?? item.MoldCode) : (item.CutterID ?? item.CutterNo));

    // 1) Ưu tiên AppController.selectResult (biến thể TURBO có hàm này)
    if (window.AppController && typeof window.AppController.selectResult === 'function') {
      window.AppController.selectResult(id, type); // chuẩn chọn + render detail/quick tùy module
    } else {
      // 2) Fallback: UIRenderer quick + detail (hỗ trợ cả 2 biến thể)
      if (window.UIRenderer) {
        if (typeof window.UIRenderer.renderQuickResults === 'function') {
          window.UIRenderer.renderQuickResults([item]); // biến thể mới (cột 2)
        } else if (typeof window.UIRenderer.renderSearchResults === 'function') {
          window.UIRenderer.renderSearchResults([item]); // biến thể cũ (có container khác)
        }
        // Render detail
        if (typeof window.UIRenderer.renderDetailInfo === 'function') {
          window.UIRenderer.renderDetailInfo(item, type);
        } else if (typeof window.UIRenderer.renderDetail === 'function') {
          window.UIRenderer.renderDetail(item, type);
        } else {
          // Cực tiểu: phát event để ai đang nghe sẽ cập nhật
          document.dispatchEvent(new CustomEvent('detail:changed', { detail: { item, type } }));
        }
      }
    }

    // 3) Cập nhật state chung & phát sự kiện cho module khác (nếu có)
    if (window.UIRenderer && window.UIRenderer.state) {
      window.UIRenderer.state.currentDetailItem = item;
    }
    document.dispatchEvent(new CustomEvent('app:select-result', { detail: { id, type, item } }));

    // 4) Làm mới danh sách liên quan dựa trên item vừa chọn
    State.lastKey = null;
    setTimeout(refreshFromDetail, 50);
  }

  function refreshFromDetail() {
    const item = window.UIRenderer?.state?.currentDetailItem || null;
    if (!item) return;
    const type = item.MoldID != null ? 'mold' : 'cutter';
    const k = type === 'mold' ? `m:${item.MoldID ?? item.MoldCode}` : `c:${item.CutterID ?? item.CutterNo}`;
    if (k === State.lastKey) return;
    State.lastKey = k;

    if (type === 'mold') {
      renderList('mold', getRelatedCuttersForMoldKey(item.MoldID ?? item.MoldCode));
    } else {
      renderList('cutter', getRelatedMoldsForCutterKey(item.CutterID ?? item.CutterNo));
    }
  }

  function onSearchUpdated() {
    if (window.UIRenderer?.state?.currentDetailItem) return;
    const results = window.SearchModule?.getResults?.() || [];
    if (!results.length) return;
    const first = results[0];
    if (first.MoldID != null) renderList('mold', getRelatedCuttersForMoldKey(first.MoldID ?? first.MoldCode));
    else if (first.CutterID != null) renderList('cutter', getRelatedMoldsForCutterKey(first.CutterID ?? first.CutterNo));
  }

  function bindEvents() {
    document.addEventListener('detail:changed', refreshFromDetail);
    document.addEventListener('search:updated', onSearchUpdated);
    window.RelatedEquipment = { refresh: () => { State.lastKey = null; refreshFromDetail(); } };
  }

  // Utils
  function str(v) { return v == null ? '' : String(v).trim(); }
  function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
})();
