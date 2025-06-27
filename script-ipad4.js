// script-ipad4.js
(function() {
  'use strict';

  // ==== Cấu hình dữ liệu ====
  var GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  var DATA_FILES = [
    {key: 'molds', file: 'molds.csv'},
    {key: 'cutters', file: 'cutters.csv'},
    {key: 'molddesign', file: 'molddesign.csv'},
    {key: 'companies', file: 'companies.csv'},
    {key: 'racklayers', file: 'racklayers.csv'},
    {key: 'racks', file: 'racks.csv'}
  ];

  var allData = {};
  var searchHistory = [];
  var filteredResults = [];
  var selectedIdx = -1;

  // ==== DOM Ready ====
  document.addEventListener('DOMContentLoaded', function() {
    setupUI();
    showLoading(true);
    loadAllData(function() {
      showLoading(false);
      renderResults();
    });
  });

  // ==== UI Setup ====
  function setupUI() {
    var searchInput = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearBtn');
    var resultsList = document.getElementById('resultsList');
    var historyBox = document.getElementById('searchHistory');

    // Tìm kiếm realtime
    searchInput.addEventListener('input', function() {
      updateClearBtn();
      renderSearchHistory();
      doSearch();
    });
    searchInput.addEventListener('focus', renderSearchHistory);
    searchInput.addEventListener('blur', function() {
      setTimeout(function() { historyBox.innerHTML = ''; }, 200);
    });

    // Clear
    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      updateClearBtn();
      doSearch();
      searchInput.focus();
    });

    // Thao tác chọn kết quả
    resultsList.addEventListener('click', function(e) {
      var li = e.target.closest('.result-item');
      if (!li) return;
      var idx = parseInt(li.getAttribute('data-idx'), 10);
      if (isNaN(idx)) return;
      selectResult(idx);
    });

    // Nút cập nhật (chưa triển khai modal nhập liệu)
    document.getElementById('updateLocationBtn').addEventListener('click', function() {
      if (selectedIdx >= 0) alert('Chức năng cập nhật vị trí sẽ triển khai sau');
    });
    document.getElementById('updateShipBtn').addEventListener('click', function() {
      if (selectedIdx >= 0) alert('Chức năng cập nhật vận chuyển sẽ triển khai sau');
    });
    document.getElementById('addNoteBtn').addEventListener('click', function() {
      if (selectedIdx >= 0) alert('Chức năng ghi chú sẽ triển khai sau');
    });
  }

  // ==== Loading ====
  function showLoading(show) {
    var el = document.getElementById('loadingIndicator');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  // ==== Dữ liệu ====
  function loadAllData(callback) {
    var loaded = 0;
    DATA_FILES.forEach(function(df) {
      loadCSVFile(df.file, function(data) {
        allData[df.key] = data;
        loaded++;
        if (loaded === DATA_FILES.length) {
          processData();
          callback && callback();
        }
      });
    });
  }

  function loadCSVFile(filename, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', GITHUB_BASE_URL + filename + '?t=' + Date.now(), true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) cb(parseCSV(xhr.responseText));
        else cb([]);
      }
    };
    xhr.onerror = function() { cb([]); };
    xhr.send();
  }

  function parseCSV(csvText) {
    var lines = csvText.split('\n').filter(function(l){return l.trim()!=='';});
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function(h){return h.trim().replace(/"/g,'');});
    return lines.slice(1).map(function(line) {
      var values = []; var current = ''; var inQuotes = false;
      for (var i=0; i<line.length; i++) {
        var c = line[i];
        if (c === '"' && (i===0 || line[i-1]!=='\\')) inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes) { values.push(current.trim().replace(/"/g,'')); current=''; }
        else current += c;
      }
      values.push(current.trim().replace(/"/g,''));
      var obj = {};
      headers.forEach(function(h,idx){ obj[h]=values[idx]||''; });
      return obj;
    });
  }

  // ==== Xử lý dữ liệu liên kết (join) ====
  function processData() {
    // Map công ty
    var companyMap = {};
    (allData.companies||[]).forEach(function(c){ companyMap[c.CompanyID]=c; });
    // Map rack/racklayer
    var rackMap = {}; (allData.racks||[]).forEach(function(r){ rackMap[r.RackID]=r; });
    var rackLayerMap = {}; (allData.racklayers||[]).forEach(function(rl){ rackLayerMap[rl.RackLayerID]=rl; });
    // Xử lý molds
    allData.molds = (allData.molds||[]).map(function(m){
      var storageCompany = companyMap[m.storagecompany];
      var rackLayer = rackLayerMap[m.RackLayerID];
      var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
      var location = rack && rackLayer ? (rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber) : '';
      return {
        ...m,
        displayNameJP: m.MoldName || '',
        displayNameVI: m.MoldCode || '',
        storageCompanyName: storageCompany ? (storageCompany.CompanyShortName + ' / ' + storageCompany.CompanyName) : '',
        location: location,
        itemType: 'mold'
      };
    });
    // Xử lý cutters
    allData.cutters = (allData.cutters||[]).map(function(c){
      var storageCompany = companyMap[c.storagecompany];
      var rackLayer = rackLayerMap[c.RackLayerID];
      var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
      var location = rack && rackLayer ? (rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber) : '';
      return {
        ...c,
        displayNameJP: c.CutterName || '',
        displayNameVI: c.CutterNo || '',
        storageCompanyName: storageCompany ? (storageCompany.CompanyShortName + ' / ' + storageCompany.CompanyName) : '',
        location: location,
        itemType: 'cutter'
      };
    });
  }

  // ==== Tìm kiếm & hiển thị ====
  function doSearch() {
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    filteredResults = [];
    if (!q) {
      filteredResults = allData.molds.concat(allData.cutters).slice(0,5);
    } else {
      var arr = allData.molds.concat(allData.cutters);
      filteredResults = arr.filter(function(item){
        var s = (item.displayNameJP + ' ' + item.displayNameVI + ' ' + item.location + ' ' + item.storageCompanyName).toLowerCase();
        return s.indexOf(q) !== -1;
      }).slice(0,5);
    }
    selectedIdx = -1;
    renderResults();
    addToSearchHistory(q);
  }

  function renderResults() {
    var ul = document.getElementById('resultsList');
    ul.innerHTML = '';
    if (!filteredResults.length) {
      ul.innerHTML = '<li class="result-item">Không tìm thấy kết quả</li>';
      updateActionBtns();
      return;
    }
    filteredResults.forEach(function(item, idx){
      var li = document.createElement('li');
      li.className = 'result-item' + (idx===selectedIdx?' selected':'');
      li.setAttribute('data-idx', idx);
      li.innerHTML =
        '<div class="jp">'+escapeHtml(item.displayNameJP)+'</div>'+
        '<div class="vi">'+escapeHtml(item.displayNameVI)+'</div>'+
        '<div class="location">'+escapeHtml(item.location)+'</div>'+
        '<div class="status-badge">'+escapeHtml(item.storageCompanyName)+'</div>';
      ul.appendChild(li);
    });
    updateActionBtns();
    renderDetailPanel();
  }

  function selectResult(idx) {
    selectedIdx = idx;
    renderResults();
    updateActionBtns();
    renderDetailPanel();
  }

  function updateActionBtns() {
    var hasSel = selectedIdx >= 0 && filteredResults[selectedIdx];
    ['updateLocationBtn','updateShipBtn','addNoteBtn'].forEach(function(id){
      var btn = document.getElementById(id);
      if (btn) btn.disabled = !hasSel;
    });
  }

  // ==== Lịch sử tìm kiếm ====
  function renderSearchHistory() {
    var box = document.getElementById('searchHistory');
    var q = document.getElementById('searchInput').value.trim();
    if (!q && searchHistory.length) {
      box.innerHTML = searchHistory.slice(-10).reverse().map(function(item,idx){
        return '<div class="search-history-item" data-idx="'+idx+'">'+
          '<span>'+escapeHtml(item)+'</span>'+
          '<button class="search-history-remove" data-idx="'+idx+'">×</button></div>';
      }).join('');
      // Chọn lại lịch sử
      box.querySelectorAll('.search-history-item').forEach(function(el){
        el.onclick = function(e){
          if (e.target.classList.contains('search-history-remove')) {
            var idx = parseInt(e.target.getAttribute('data-idx'),10);
            searchHistory.splice(searchHistory.length-1-idx,1);
            saveSearchHistory();
            renderSearchHistory();
            return false;
          }
          var idx = parseInt(this.getAttribute('data-idx'),10);
          document.getElementById('searchInput').value = searchHistory[searchHistory.length-1-idx];
          doSearch();
        };
      });
    } else {
      box.innerHTML = '';
    }
  }

  function addToSearchHistory(q) {
    if (!q || q.length < 2) return;
    if (searchHistory.indexOf(q) >= 0) return;
    searchHistory.push(q);
    if (searchHistory.length > 20) searchHistory = searchHistory.slice(-20);
    saveSearchHistory();
  }
  function saveSearchHistory() {
    try { localStorage.setItem('ipad4SearchHistory', JSON.stringify(searchHistory)); } catch(e){}
  }
  function loadSearchHistory() {
    try {
      var arr = JSON.parse(localStorage.getItem('ipad4SearchHistory')||'[]');
      if (Array.isArray(arr)) searchHistory = arr;
    } catch(e){}
  }
  loadSearchHistory();

  // ==== Nút clear ====
  function updateClearBtn() {
    var inp = document.getElementById('searchInput');
    var btn = document.getElementById('clearBtn');
    btn.style.display = inp.value ? 'block' : 'none';
  }

  // ==== Chi tiết kết quả (triển khai sau, demo hiển thị tên/mã/vị trí) ====
  function renderDetailPanel() {
    var panel = document.getElementById('detailPanel');
    if (selectedIdx < 0 || !filteredResults[selectedIdx]) {
      panel.innerHTML = '<div style="color:#999;text-align:center;">Chọn một kết quả để xem chi tiết</div>';
      return;
    }
    var item = filteredResults[selectedIdx];
    panel.innerHTML =
      '<div style="font-size:1.3rem;font-weight:700;color:#2563eb;">'+escapeHtml(item.displayNameJP)+'</div>'+
      '<div style="font-size:1.1rem;color:#6b7280;">'+escapeHtml(item.displayNameVI)+'</div>'+
      '<div style="margin-top:8px;font-size:1.1rem;"><b>Vị trí:</b> '+escapeHtml(item.location)+'</div>'+
      '<div style="margin-top:4px;"><b>Công ty lưu trữ:</b> '+escapeHtml(item.storageCompanyName)+'</div>'+
      '<div style="margin-top:4px;"><i>Chi tiết sẽ bổ sung sau...</i></div>';
  }

  // ==== Thoát toàn màn hình ====
  window.exitFullscreen = function() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else window.close();
  };

  // ==== Tiện ích ====
  function escapeHtml(txt) {
    var div = document.createElement('div');
    div.textContent = txt || '';
    return div.innerHTML;
  }
})();
