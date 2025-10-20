/**
 * related-equipment.js - V7.7.7 FIX8
 * 連携設備 / 関連する金型・抜型 / Thiết bị liên quan (Cột 4)
 *
 * Mục tiêu FIX8:
 * - Không thay đổi danh sách cột 2 theo từ khóa hiện tại.
 * - Khi chọn ở cột 4: cập nhật chi tiết (cột 3) + gọi QuickResultsHighlight.update(id,type) để
 *   active lại thẻ tương ứng nếu có, hoặc chuyển toàn bộ thẻ cột 2 sang inactive nếu không có.
 * - Khi kết quả tìm kiếm thay đổi: nếu đang có item đã chọn, tự động gọi update để đồng bộ highlight.
 * - Giữ nền dòng theo loại (mold/cutter) và badge RackID–LayerNumber co giãn như FIX7.
 */
(function () {
  'use strict';

  const SEL = {
    hostCandidates: ['.actions-lower', '.panel.actions-panel', '[data-col="4"]', '#col-4', '.col-4'],
    wrapId: 'related-list',
    headerId: 'related-list-header',
    listClass: 'related-eq-list',
    quickGrid: '#quick-results-grid',
    quickCard: '.result-card'
  };

  const TEXT = {
    titleForMoldJP: 'カッター情報',
    titleForMoldVN: 'Thông tin dao cắt',
    titleForCutterJP: '関連金型',
    titleForCutterVN: 'Khuôn liên quan',
    empty: '項目を選択してください / Vui lòng chọn một mục',
    badgeSeparateYes: '別抜き あり',
    badgeSeparateNo:  '別抜き なし'
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
    console.log('[RelatedEquipment] FIX8 ready (sync quick highlight)');
  }

  function waitForData() {
    return new Promise(resolve => {
      const tick = () => {
        const d = window.DataManager?.data || window.moldAllData || {};
        if ((d.molds?.length||0) && (d.cutters?.length||0) && (d.molddesign?.length||0) && (d.moldcutter?.length||0)) return resolve();
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
    if (!wrap) { wrap = document.createElement('section'); wrap.id = SEL.wrapId; wrap.className = 'related-eq-wrap'; host.appendChild(wrap); }
    let header = document.getElementById(SEL.headerId);
    if (!header) { header = document.createElement('div'); header.id = SEL.headerId; header.className = 'related-eq-header'; wrap.appendChild(header); }
    let list = wrap.querySelector(`.${SEL.listClass}`);
    if (!list) { list = document.createElement('div'); list.className = SEL.listClass; wrap.appendChild(list); }
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

      .related-eq-header { margin-bottom:10px; }
      .related-eq-header .title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
      .related-eq-header .title-jp { font-weight:700; color:#111827; font-size:14px; }
      .related-eq-header .title-vn { font-size:11px; color:#6b7280; font-style:italic; }
      .related-eq-header .badge-separate { padding:3px 8px; border-radius:10px; font-size:11px; font-weight:700; }
      .related-eq-header .badge-separate.yes { background:#DC2626; color:#fff; }
      .related-eq-header .badge-separate.no  { background:#e5e7eb; color:#374151; }

      .related-eq-list { max-height: 38vh; overflow:auto; }

      .rel-row { position:relative; display:flex; align-items:center; gap:6px; padding:8px 10px; border:1px solid #e5e7ef; border-radius:8px; margin-bottom:8px; cursor:pointer; transition: background .15s, border-color .15s, filter .15s; }
      .rel-row.row-mold   { background:#F0FDFF; border-color:#A5F3FC; }
      .rel-row.row-cutter { background:#FFF9F0; border-color:#FED7AA; }
      .related-eq-wrap.theme-mold   .rel-row.row-mold:hover   { filter:brightness(0.98); }
      .related-eq-wrap.theme-cutter .rel-row.row-cutter:hover { filter:brightness(0.98); }

      .rel-id { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:13px; font-weight:700; color:#0B5CAB; flex-shrink:0; }
      .rel-name { flex:1; min-width:0; font-size:13px; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rel-location { display:flex; align-items:center; gap:3px; flex-shrink:0; color:#059669; font-size:13px; font-weight:600; white-space:nowrap; }

      /* Badge vị trí co giãn theo nội dung */
      .circle-num, .square-num { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 6px; border:1.5px solid #059669; color:#059669; background:#EAFBF6; font-size:12px; line-height:1; }
      .circle-num { border-radius:999px; }
      .square-num { border-radius:6px; }

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
    const name = isMold ? (it.MoldCode ?? it.displayCode ?? it.Code ?? '-') : (it.CutterName ?? it.displayName ?? it.Name ?? (it.CutterCode ?? '-'));
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
        <span class="rel-location">${circledHTML(rackId)}<span class="sep-dash">-</span>${squaredHTML(layerNo)}</span>
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
        chooseItem(rec.item); // cập nhật detail + highlight cột 2
      });
    });

    // Sau khi render, nếu đang có item được chọn → đảm bảo cột 2 cũng highlight đúng
    const sel = getCurrentSelection();
    if (sel) callHighlight(sel.id, sel.type);
  }

  /* ===== Chọn item: cập nhật detail + highlight cột 2 ===== */
  function chooseItem(item) {
    const type = item.MoldID != null ? 'mold' : 'cutter';
    const id = String(type === 'mold' ? (item.MoldID ?? item.MoldCode) : (item.CutterID ?? item.CutterNo));

    // Cập nhật chi tiết (cột 3) theo module hiện có
    if (window.UIRenderer) {
      if (typeof window.UIRenderer.renderDetailInfo === 'function') window.UIRenderer.renderDetailInfo(item, type);
      else if (typeof window.UIRenderer.renderDetail === 'function') window.UIRenderer.renderDetail(item, type);
      if (window.UIRenderer.state) window.UIRenderer.state.currentDetailItem = item;
    }
    document.dispatchEvent(new CustomEvent('detail:changed', { detail: { item, type } }));

    // Không thay đổi danh sách cột 2; chỉ highlight bằng helper dùng chung
    callHighlight(id, type);

    // Làm mới danh sách liên quan theo item vừa chọn
    State.lastKey = null;
    setTimeout(refreshFromDetail, 50);
  }

  // Helper: gọi QuickResultsHighlight.update nếu có
  function callHighlight(id, type) {
    if (window.QuickResultsHighlight && typeof window.QuickResultsHighlight.update === 'function') {
      window.QuickResultsHighlight.update(id, type);
    } else {
      // Fallback tối thiểu: nếu không có module highlight, tự xử lý một phần
      const grid = document.querySelector(SEL.quickGrid);
      if (!grid) return;
      const cards = Array.from(grid.querySelectorAll(SEL.quickCard));
      if (!cards.length) return;

      let matched = false;
      for (const c of cards) {
        const cid = String(c.dataset.id || c.getAttribute('data-id') || '').trim();
        const ctype = String(c.dataset.type || c.getAttribute('data-type') || '').trim().toLowerCase();
        const isMatch = cid === String(id) && ctype === String(type);
        if (isMatch) { c.classList.add('active'); c.classList.remove('inactive'); matched = true; }
        else c.classList.remove('active');
      }
      for (const c of cards) {
        if (!matched || !c.classList.contains('active')) c.classList.add('inactive');
        else c.classList.remove('inactive');
      }
    }
  }

  // Lấy lựa chọn hiện tại (nếu có) để sync highlight sau khi render kết quả
  function getCurrentSelection() {
    const it = window.UIRenderer?.state?.currentDetailItem || null;
    if (!it) return null;
    if (it.MoldID != null) return { id: String(it.MoldID ?? it.MoldCode), type: 'mold' };
    if (it.CutterID != null || it.CutterNo != null) return { id: String(it.CutterID ?? it.CutterNo), type: 'cutter' };
    return null;
  }

  function refreshFromDetail() {
    const item = window.UIRenderer?.state?.currentDetailItem || null;
    if (!item) return;
    const type = item.MoldID != null ? 'mold' : 'cutter';
    const k = type === 'mold' ? `m:${item.MoldID ?? item.MoldCode}` : `c:${item.CutterID ?? item.CutterNo}`;
    if (k === State.lastKey) return;
    State.lastKey = k;

    if (type === 'mold') renderList('mold', getRelatedCuttersForMoldKey(item.MoldID ?? item.MoldCode));
    else renderList('cutter', getRelatedMoldsForCutterKey(item.CutterID ?? item.CutterNo));

    // Đồng bộ highlight cột 2 với lựa chọn hiện tại
    const sel = getCurrentSelection();
    if (sel) callHighlight(sel.id, sel.type);
  }

  function onSearchUpdated() {
    // Giữ nguyên danh sách theo kết quả; chỉ đồng bộ highlight nếu có lựa chọn
    const sel = getCurrentSelection();
    if (sel) callHighlight(sel.id, sel.type);
  }

  function bindEvents() {
    document.addEventListener('detail:changed', refreshFromDetail);
    document.addEventListener('search:updated', onSearchUpdated);
    document.addEventListener('app:select-result', (e) => {
      // Nếu có chọn từ nơi khác (ví dụ click cột 2), vẫn sync cột 4 và highlight cột 2
      const d = e.detail || {};
      if (d.id && d.type) callHighlight(d.id, d.type);
    });

    window.RelatedEquipment = { refresh: () => { State.lastKey = null; refreshFromDetail(); } };
  }

  function str(v) { return v == null ? '' : String(v).trim(); }
  function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
})();
