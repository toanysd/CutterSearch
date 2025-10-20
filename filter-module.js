/**
 * V7.7.7 Filter Module (fixed reset + robust selects)
 * - Lắng nghe 'search:updated' từ SearchModule, áp filter, rồi phát lại 'search:updated' (origin='filter')
 * - Bổ sung API reset() và lắng nghe 'filter:reset'
 */
(function () {
  'use strict';

  const SELECTORS = {
    fieldSelectCandidates: ['#filter-field', '#filter-field-select', '.filter-field', '[data-role="filter-field"]', '#filter-key'],
    valueSelectCandidates: ['#filter-value', '#filter-value-select', '.filter-value', '[data-role="filter-value"]', '#filter-val'],
    resetBtnCandidates: ['#btn-filter-reset', '.btn-filter-reset', '#filter-reset', '#filter-reset-btn', '.filter-reset-btn'],
  };

  const FILTER_FIELDS = [
    { id: 'itemType',       label: '種別/Loại',            get: it => it.itemType },
    { id: 'storageCompany', label: '保管会社/Cty giữ',      get: it => (it.storageCompanyInfo?.CompanyShortName || it.storageCompanyInfo?.CompanyName || it.storageCompany || '') },
    { id: 'rackLocation',   label: '棚位置/Vị trí kệ',      get: it => it.rackInfo?.RackLocation || '' },
    { id: 'rackId',         label: '棚番号/Mã kệ',          get: it => it.rackLayerInfo?.RackID || '' },
    { id: 'layerNum',       label: '階層番号/Tầng',         get: it => it.rackLayerInfo?.RackLayerNumber || '' },
    { id: 'customer',       label: '顧客名/Khách hàng',     get: it => (it.customerInfo?.CustomerShortName || it.customerInfo?.CustomerName || '') },
    { id: 'company',        label: '会社名/Công ty',        get: it => (it.companyInfo?.CompanyShortName || it.companyInfo?.CompanyName || '') },
    { id: 'status',         label: '状態/Trạng thái',       get: it => (it.currentStatus?.text || '') },
    { id: 'teflon',         label: 'テフロン/Teflon',       get: it => it.TeflonCoating || '' },
    { id: 'returning',      label: '返却/MoldReturning',    get: it => (it.MoldReturning || '') },
    { id: 'disposing',      label: '廃棄/MoldDisposing',    get: it => (it.MoldDisposing || '') },
    { id: 'drawing',        label: '図番/Mã bản vẽ',        get: it => it.designInfo?.DrawingNumber || '' },
    { id: 'equip',          label: '設備コード/Thiết bị',   get: it => it.designInfo?.EquipmentCode || '' },
    { id: 'plastic',        label: '樹脂/Loại nhựa',        get: it => it.designInfo?.DesignForPlasticType || '' },
    { id: 'dim',            label: '寸法/Kích thước',       get: it => (it.displayDimensions || it.cutlineSize || '') },
  ];

  const state = {
    fieldId: '',
    value: '',
    _reEmitting: false
  };

  const FilterModule = {
    initializeFilters() {
      const fieldSel = resolveSelect(SELECTORS.fieldSelectCandidates);
      const valueSel = resolveSelect(SELECTORS.valueSelectCandidates);

      // Đổ danh sách trường
      if (fieldSel) {
        fieldSel.innerHTML = '';
        appendOption(fieldSel, '', 'まずフィールドを選択');
        FILTER_FIELDS.forEach(f => appendOption(fieldSel, f.id, `${f.label}`));
      }

      // Sự kiện: chọn trường → build danh sách giá trị
      fieldSel?.addEventListener('change', () => {
        state.fieldId = fieldSel.value || '';
        buildValueOptions(valueSel, state.fieldId);
        state.value = '';
        if (valueSel) valueSel.value = '';
        triggerFilter();
      });

      // Sự kiện: chọn giá trị → lọc
      valueSel?.addEventListener('change', () => {
        state.value = valueSel.value || '';
        triggerFilter();
      });

      // Nút reset trong UI (nếu có)
      const resetBtn = resolveFirst(SELECTORS.resetBtnCandidates);
      resetBtn?.addEventListener('click', () => {
        FilterModule.reset(); // dùng API thống nhất
      });

      // Lắng nghe tìm kiếm nền tảng → áp filter → phát lại
      document.addEventListener('search:updated', (e) => {
        const origin = e.detail?.origin || '';
        if (origin === 'filter') return; // tránh vòng lặp
        const base = e.detail?.results || [];
        const filtered = applyFilter(base, state.fieldId, state.value);
        state._reEmitting = true;
        document.dispatchEvent(new CustomEvent('search:updated', {
          detail: { ...e.detail, results: filtered, total: filtered.length, origin: 'filter' }
        }));
        state._reEmitting = false;
      });

      // Khởi tạo danh sách giá trị (All)
      buildValueOptions(valueSel, '');
    },

    // API reset công khai
    reset() {
      const fieldSel = resolveSelect(SELECTORS.fieldSelectCandidates);
      const valueSel = resolveSelect(SELECTORS.valueSelectCandidates);
      if (fieldSel) fieldSel.selectedIndex = 0;
      if (valueSel) valueSel.selectedIndex = 0;
      state.fieldId = '';
      state.value = '';
      buildValueOptions(valueSel, '');
      // Gọi lại tìm kiếm để trả về kết quả thuần theo keyword hiện tại
      window.SearchModule?.performSearch?.();
    }
  };

  // Đồng bộ khi bridge phát 'filter:reset'
  document.addEventListener('filter:reset', () => {
    FilterModule.reset();
  });

  // --- Helpers ---
  function triggerFilter() {
    // Tạo tập cơ sở; module sẽ áp filter ở listener 'search:updated'
    window.SearchModule?.performSearch?.();
  }

  function buildValueOptions(selectEl, fieldId) {
    const sel = ensureSelect(selectEl);
    if (!sel) return;
    sel.innerHTML = '';
    appendOption(sel, '', 'すべて'); // All
    if (!fieldId) return;

    const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
    if (!getter) return;

    const items = window.DataManager?.getAllItems?.() || [];
    const set = new Set();
    for (const it of items) {
      const v = (getter(it) || '').toString().trim();
      if (v) set.add(v);
    }
    Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'ja'))
      .forEach(v => appendOption(sel, v, v));
  }

  function applyFilter(list, fieldId, value) {
    if (!fieldId || !value) return list;
    const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
    if (!getter) return list;
    const val = value.toString().toLowerCase();
    return list.filter(it => (getter(it) || '').toString().toLowerCase().includes(val));
  }

  function appendOption(sel, val, label) {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    sel.appendChild(o);
  }

  // Nhận về phần tử select thực tế (kể cả khi selector là wrapper)
  function resolveSelect(candidates) {
    const el = resolveFirst(candidates);
    return ensureSelect(el);
  }

  function ensureSelect(el) {
    if (!el) return null;
    if (el.tagName && el.tagName.toLowerCase() === 'select') return el;
    const inner = el.querySelector?.('select');
    return inner || null;
  }

  function resolveFirst(candidates) {
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Public
  window.FilterModule = FilterModule;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FilterModule.initializeFilters());
  } else {
    FilterModule.initializeFilters();
  }
})();
