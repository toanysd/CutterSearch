/**
 * V7.7.7 Search History (chips row + prefixes API)
 * - Chip một hàng có nút xóa cho panel trái (nửa trên)
 * - Phát 'history:updated' để nơi khác (cụm nhập nhanh) bám theo
 */
(function () {
  'use strict';

  const CONFIG = {
    storageKey: 'moldcutter_search_history_v777',
    maxItems: 100,
    displayLimit: 20
  };

  const SELECTORS = {
    historyContainers: ['#history-chips', '#history-container', '.history-list', "[data-role='search-history']", "[data-section='history']"],
    clearButtons: ['#btn-history-clear', '.btn-history-clear', "[data-action='history-clear']"],
    searchInputCandidates: ['#search-input', '.search-input input', '.search-input']
  };

  const state = {
    items: [], // [{query, timestamp, count}]
    lastRenderedHash: ''
  };

  const SearchHistory = {
    init() {
      this.load();
      this.render();
      this.bind();
      this.ensureStyle();
      window.SearchHistory = this;
      console.log('[SearchHistory] ready.');
    },

    // Query → danh sách history (phục vụ gợi ý)
    searchHistory(partial) {
      const p = (partial || '').trim().toLowerCase();
      if (!p) return [...state.items];
      return state.items.filter(x => x.query.toLowerCase().includes(p));
    },

    // Trả về toàn bộ để module khác tra cứu nguồn gốc gợi ý
    get() {
      return [...state.items];
    },

    // Top tiền tố viết tắt đầu mã khuôn (ưu tiên tần suất)
    getTopPrefixes(limit = 12) {
      const freq = new Map();
      for (const it of state.items) {
        const p = extractPrefix(it.query);
        if (!p) continue;
        freq.set(p, (freq.get(p) || 0) + (it.count || 1));
      }
      return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k]) => k);
    },

    add(query) {
      const q = (query || '').trim();
      if (!q) return;
      const idx = state.items.findIndex(x => x.query.toLowerCase() === q.toLowerCase());
      if (idx >= 0) {
        const it = state.items[idx];
        it.count = (it.count || 0) + 1;
        it.timestamp = Date.now();
        state.items.splice(idx, 1);
        state.items.unshift(it);
      } else {
        state.items.unshift({ query: q, timestamp: Date.now(), count: 1 });
      }
      if (state.items.length > CONFIG.maxItems) state.items.length = CONFIG.maxItems;
      this.save();
      this.render();
      emitUpdated();
    },

    remove(query) {
      const q = (query || '').trim().toLowerCase();
      state.items = state.items.filter(x => x.query.toLowerCase() !== q);
      this.save();
      this.render();
      emitUpdated();
    },

    clear() {
      state.items = [];
      this.save();
      this.render();
      emitUpdated();
    },

    // storage
    load() {
      try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        const arr = raw ? JSON.parse(raw) : [];
        state.items = Array.isArray(arr) ? arr.slice(0, CONFIG.maxItems) : [];
      } catch {
        state.items = [];
      }
    },
    save() {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.items)); } catch {}
    },

    // UI
    bind() {
      // Clear thủ công (nếu có nút)
      getAll(SELECTORS.clearButtons).forEach(btn => btn.addEventListener('click', () => this.clear()));
      // Ghi lịch sử mỗi lần có query tìm kiếm hợp lệ
      document.addEventListener('search:updated', (e) => {
        const q = (e.detail?.query || '').trim();
        if (!q) return;
        this.add(q);
      });
    },

    render() {
      const wrap = getFirst(SELECTORS.historyContainers);
      if (!wrap) return;

      const recent = state.items.slice(0, CONFIG.displayLimit);
      const hash = recent.map(x => `${x.query}:${x.count}`).join('|');
      if (hash === state.lastRenderedHash) return;
      state.lastRenderedHash = hash;

      if (recent.length === 0) {
        wrap.innerHTML = `<div class="muted">[提案なし] / Chưa có gợi ý</div>`;
        return;
      }

      // Chip row (no-wrap, scroll ngang)
      wrap.innerHTML = `
        <div class="chip-row" role="list">
          ${recent.map(x => `
            <button class="history-chip" role="listitem" data-q="${escapeHtml(x.query)}" title="${escapeHtml(x.query)}">
              <span class="chip-text">${escapeHtml(x.query)}</span>
              <span class="chip-count">${x.count || 1}</span>
              <span class="chip-remove" aria-label="remove" data-remove="1">×</span>
            </button>
          `).join('')}
        </div>
      `;

      const input = getSearchInput();
      wrap.querySelectorAll('.history-chip').forEach(chip => {
        chip.addEventListener('click', (ev) => {
          const isRemove = ev.target?.dataset?.remove === '1';
          const q = chip.dataset.q || '';
          if (isRemove) {
            ev.stopPropagation();
            this.remove(q);
            return;
          }
          if (input) {
            input.value = q;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });
    },

    ensureStyle() {
      if (document.getElementById('history-chip-style')) return;
      const st = document.createElement('style');
      st.id = 'history-chip-style';
      st.textContent = `
        #history-chips, .history-list { overflow: hidden; }
        #history-chips .chip-row, .history-list .chip-row {
          display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; white-space: nowrap; padding-right: 4px;
          scrollbar-width: thin;
        }
        .history-chip {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--color-bg, #f8f9fa);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-lg, 12px);
          padding: 6px 10px;
          font-size: 12px; cursor: pointer; user-select: none;
        }
        .history-chip .chip-count {
          background: var(--kiosk-green, #4CAF50);
          color: #fff; padding: 2px 6px; border-radius: 10px; font-size: 10px;
        }
        .history-chip .chip-remove { margin-left: 4px; color: #9aa4b2; }
        .history-chip:hover { background: #eef2ff; }
      `;
      document.head.appendChild(st);
    }
  };

  function ensureStyle() {
    if (document.getElementById('history-grid-style')) return;
    const st = document.createElement('style');
    st.id = 'history-grid-style';
    st.textContent = `
      .keyboard-left { display: grid; grid-template-rows: 1fr 1fr; gap: var(--spacing-md,10px); }
      .keyboard-left .history-zone #history-chips{height:100%!important;overflow:auto}
      .keyboard-left .history-zone #history-chips .chip-grid{
        display:grid!important;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px
      }
      .history-chip{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--color-border,#e2e8f0);
        border-radius:12px;background:#fff;font-size:12px;user-select:none}
      .history-chip .chip-count{background:var(--kiosk-green,#4CAF50);color:#fff;padding:2px 6px;border-radius:10px;font-size:10px}
    `;
    document.head.appendChild(st);
  }


  function extractPrefix(q) {
    const s = String(q || '').toUpperCase().trim();
    const m = s.match(/^[A-Z]{2,6}(?=(?:-|\\s|\\d|$))/);
    return m ? m[0] : null;
  }

  function emitUpdated() {
    document.dispatchEvent(new CustomEvent('history:updated', {
      detail: {
        items: SearchHistory.get(),
        prefixes: SearchHistory.getTopPrefixes(12)
      }
    }));
  }

  function getFirst(arr) {
    for (const sel of arr) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function getAll(arr) {
    return arr.flatMap(sel => Array.from(document.querySelectorAll(sel)));
  }
  function getSearchInput() {
    return getFirst(SELECTORS.searchInputCandidates);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SearchHistory.init(), { once: true });
  } else {
    SearchHistory.init();
  }
})();
