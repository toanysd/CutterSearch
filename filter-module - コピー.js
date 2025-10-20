/**
 * V7.7.7 Filter Module (root folder)
 * - 100% tinh thần V4.31: chọn "Trường" → sinh danh sách "Giá trị" → áp trên tập kết quả tìm kiếm
 * - Tương thích UI V7.7.5: tự dò selector theo nhiều phương án để khớp HTML hiện có
 * - Không phụ thuộc các module Phase 2 khác; hoạt động ngay
 * - Cơ chế lọc: lắng nghe 'search:updated' từ SearchModule, áp filter, rồi phát lại 'search:updated' (origin='filter')
 */

(function () {
  'use strict';

  // Dò selector linh hoạt để khớp giao diện hiện có
  const SELECTORS = {
    fieldSelectCandidates: ['#filter-field', '#filter-field-select', '.filter-field select', '[data-role="filter-field"]', '#filter-key'],
    valueSelectCandidates: ['#filter-value', '#filter-value-select', '.filter-value select', '[data-role="filter-value"]', '#filter-val'],
    resetBtnCandidates: ['#btn-filter-reset', '.btn-filter-reset', '#filter-reset'],
    clearAllBtnCandidates: ['#btn-clear-all', '.search-clear-btn'],
    categoryTabs: '.category-tab[data-category]',
  };

  // Tập trường lọc theo V4.31 (ưu tiên trường thực tế có trong dữ liệu)
  // Mỗi entry gồm: id, label, getter(item) → string
  const FILTER_FIELDS = [
    { id: 'itemType', label: '種別/Loại', get: it => it.itemType },                                 // mold | cutter
    { id: 'storageCompany', label: '保管会社/Cty giữ', get: it => (it.storageCompanyInfo?.CompanyShortName || it.storageCompanyInfo?.CompanyName || it.storageCompany || '') },
    { id: 'rackLocation', label: '棚位置/Vị trí kệ', get: it => it.rackInfo?.RackLocation || '' },
    { id: 'rackId', label: '棚番号/Mã kệ', get: it => it.rackLayerInfo?.RackID || '' },
    { id: 'layerNum', label: '階層番号/Tầng', get: it => it.rackLayerInfo?.RackLayerNumber || '' },
    { id: 'customer', label: '顧客名/Khách hàng', get: it => (it.customerInfo?.CustomerShortName || it.customerInfo?.CustomerName || '') },
    { id: 'company', label: '会社名/Công ty', get: it => (it.companyInfo?.CompanyShortName || it.companyInfo?.CompanyName || '') },
    { id: 'status', label: '状態/Trạng thái', get: it => (it.currentStatus?.text || '') },          // 利用可能/返却済み/廃棄済み/出荷済み
    { id: 'teflon', label: 'テフロン/Teflon', get: it => it.TeflonCoating || '' },
    { id: 'returning', label: '返却/MoldReturning', get: it => (it.MoldReturning || '') },
    { id: 'disposing', label: '廃棄/MoldDisposing', get: it => (it.MoldDisposing || '') },
    { id: 'drawing', label: '図番/Mã bản vẽ', get: it => it.designInfo?.DrawingNumber || '' },
    { id: 'equip', label: '設備コード/Thiết bị', get: it => it.designInfo?.EquipmentCode || '' },
    { id: 'plastic', label: '樹脂/Loại nhựa', get: it => it.designInfo?.DesignForPlasticType || '' },
    { id: 'dim', label: '寸法/Kích thước', get: it => (it.displayDimensions || it.cutlineSize || '') },
  ];

  // Trạng thái nội bộ
  const state = {
    fieldId: '',
    value: '',
    _reEmitting: false,   // tránh vòng lặp khi phát lại sự kiện
  };

  const FilterModule = {
    initializeFilters() {
      const fieldSel = getFirst(SELECTORS.fieldSelectCandidates);
      const valueSel = getFirst(SELECTORS.valueSelectCandidates);
      if (!fieldSel || !valueSel) {
        console.warn('[FilterModule] Không tìm thấy combobox filter; module vẫn chạy nền để không gây lỗi.');
      }

      // Đổ danh sách trường
      if (fieldSel) {
        fieldSel.innerHTML = '';
        appendOption(fieldSel, '', 'まずフィールドを選択');  // JP ưu tiên
        FILTER_FIELDS.forEach(f => appendOption(fieldSel, f.id, `${f.label}`));
      }

      // Sự kiện: chọn trường → build danh sách giá trị
      fieldSel?.addEventListener('change', () => {
        state.fieldId = fieldSel.value || '';
        buildValueOptions(valueSel, state.fieldId);
        state.value = '';
        valueSel && (valueSel.value = '');
        triggerFilter();
      });

      // Sự kiện: chọn giá trị → lọc
      valueSel?.addEventListener('change', () => {
        state.value = valueSel.value || '';
        triggerFilter();
      });

      // Reset
      const resetBtn = getFirst(SELECTORS.resetBtnCandidates);
      resetBtn?.addEventListener('click', () => {
        if (fieldSel) fieldSel.value = '';
        if (valueSel) valueSel.value = '';
        state.fieldId = '';
        state.value = '';
        triggerFilter();
      });

      // Khi SearchModule phát kết quả, áp filter và phát lại
      document.addEventListener('search:updated', (e) => {
        const origin = e.detail?.origin || '';
        if (origin === 'filter') return; // bỏ qua chính mình

        const base = e.detail?.results || [];
        const filtered = applyFilter(base, state.fieldId, state.value);
        // Phát lại để UiRenderer render kết quả đã lọc
        state._reEmitting = true;
        document.dispatchEvent(new CustomEvent('search:updated', {
          detail: {
            ...e.detail,
            results: filtered,
            total: filtered.length,
            origin: 'filter',
          }
        }));
        state._reEmitting = false;
      });

      // Khởi tạo danh sách giá trị lần đầu (trống)
      buildValueOptions(valueSel, '');
    }
  };

  // --- Hàm hỗ trợ ---

  function triggerFilter() {
    // Gọi lại tìm kiếm để tạo tập cơ sở; FilterModule sẽ bắt 'search:updated' và áp filter
    window.SearchModule?.performSearch?.();
  }

  function buildValueOptions(selectEl, fieldId) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    appendOption(selectEl, '', 'すべて'); // All

    if (!fieldId) return;

    const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
    if (!getter) return;

    const items = window.DataManager?.getAllItems?.() || [];
    const set = new Set();
    for (const it of items) {
      const v = (getter(it) || '').toString().trim();
      if (v) set.add(v);
    }

    // Sắp xếp a→z, số trước chữ
    Array.from(set).sort((a, b) => a.localeCompare(b, 'ja')).forEach(v => appendOption(selectEl, v, v));
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

  function getFirst(candidates) {
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Public
  window.FilterModule = FilterModule;

  // Auto-init khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FilterModule.initializeFilters());
  } else {
    FilterModule.initializeFilters();
  }
})();
