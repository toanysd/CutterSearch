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

  document.addEventListener('DOMContentLoaded', function() {
    setupUI();
    showLoading(true);
    loadAllData(function() {
      showLoading(false);
      renderResults();
    });
  });

  function setupUI() {
    var searchInput = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearBtn');
    var resultsList = document.getElementById('resultsList');
    var historyBox = document.getElementById('searchHistory');

    searchInput.addEventListener('input', function() {
      updateClearBtn();
      renderSearchHistory();
      doSearch();
    });
    searchInput.addEventListener('focus', renderSearchHistory);
    searchInput.addEventListener('blur', function() {
      setTimeout(function() { historyBox.innerHTML = ''; }, 200);
    });

    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      updateClearBtn();
      doSearch();
      searchInput.focus();
    });

    resultsList.addEventListener('click', function(e) {
      var li = e.target.closest('.result-item');
      if (!li) return;
      var idx = parseInt(li.getAttribute('data-idx'), 10);
      if (isNaN(idx)) return;
      selectResult(idx);
    });

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

  function showLoading(show) {
    var el = document.getElementById('loadingIndicator');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function loadAllData(callback) {
    var loaded = 0;
    for (var i = 0; i < DATA_FILES.length; i++) {
      (function(df){
        loadCSVFile(df.file, function(data) {
          allData[df.key] = data;
          loaded++;
          if (loaded === DATA_FILES.length) {
            processData();
            callback && callback();
          }
        });
      })(DATA_FILES[i]);
    }
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
    var lines = csvText.split('\n');
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function(h){return h.trim().replace(/"/g,'');});
    var arr = [];
    for (var i=1; i<lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      var values = [];
      var current = ''; var inQuotes = false;
      for (var j=0; j<line.length; j++) {
        var c = line[j];
        if (c === '"' && (j===0 || line[j-1]!=='\\')) inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes) { values.push(current.trim().replace(/"/g,'')); current=''; }
        else current += c;
      }
      values.push(current.trim().replace(/"/g,''));
      var obj = {};
      for (var k=0; k<headers.length; k++) obj[headers[k]] = values[k]!==undefined ? values[k] : '';
      arr.push(obj);
    }
    return arr;
  }

  function processData() {
    var companyMap = {};
    for (var i=0; i<(allData.companies||[]).length; i++) {
      var c = allData.companies[i];
      companyMap[c.CompanyID]=c;
    }
    var rackMap = {}; for (var i=0; i<(allData.racks||[]).length; i++) rackMap[allData.racks[i].RackID]=allData.racks[i];
    var rackLayerMap = {}; for (var i=0; i<(allData.racklayers||[]).length; i++) rackLayerMap[allData.racklayers[i].RackLayerID]=allData.racklayers[i];

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

  function doSearch() {
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    filteredResults = [];
    if (!q) {
      filteredResults = allData.molds.concat(allData.cutters).slice(0,5);
    } else {
      var arr = allData.molds.concat(allData.cutters);
      filteredResults = [];
      for (var i=0; i<arr.length; i++) {
        var item = arr[i];
        var s = (item.displayNameJP + ' ' + item.displayNameVI + ' ' + item.location + ' ' + item.storageCompanyName).toLowerCase();
        if (s.indexOf(q) !== -1) filteredResults.push(item);
        if (filteredResults.length >= 5) break;
      }
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
    for (var i=0; i<filteredResults.length; i++) {
      var item = filteredResults[i];
      var li = document.createElement('li');
      li.className = 'result-item' + (i===selectedIdx?' selected':'');
      li.setAttribute('data-idx', i);
      li.innerHTML =
        '<div class="jp">'+escapeHtml(item.displayNameJP)+'</div>'+
        '<div class="vi">'+escapeHtml(item.displayNameVI)+'</div>'+
        '<div class="location">'+escapeHtml(item.location)+'</div>'+
        '<div class="status-badge">'+escapeHtml(item.storageCompanyName)+'</div>';
      ul.appendChild(li);
    }
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
    document.getElementById('updateLocationBtn').disabled = !hasSel;
    document.getElementById('updateShipBtn').disabled = !hasSel;
    document.getElementById('addNoteBtn').disabled = !hasSel;
  }

  function renderSearchHistory() {
    var box = document.getElementById('searchHistory');
    var q = document.getElementById('searchInput').value.trim();
    if (!q && searchHistory.length) {
      var html = '';
      for (var i=searchHistory.length-1; i>=0; i--) {
        html += '<div class="search-history-item" data-idx="'+i+'">'+
          '<span>'+escapeHtml(searchHistory[i])+'</span>'+
          '<button class="search-history-remove" data-idx="'+i+'">×</button></div>';
      }
      box.innerHTML = html;
      var items = box.querySelectorAll('.search-history-item');
      for (var j=0; j<items.length; j++) {
        items[j].onclick = function(e){
          if (e.target.classList.contains('search-history-remove')) {
            var idx = parseInt(e.target.getAttribute('data-idx'),10);
            searchHistory.splice(idx,1);
            saveSearchHistory();
            renderSearchHistory();
            return false;
          }
          var idx = parseInt(this.getAttribute('data-idx'),10);
          document.getElementById('searchInput').value = searchHistory[idx];
          doSearch();
        };
      }
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

  function updateClearBtn() {
    var inp = document.getElementById('searchInput');
    var btn = document.getElementById('clearBtn');
    btn.style.display = inp.value ? 'block' : 'none';
  }

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

  // Toàn màn hình
  window.enterFullscreen = function() {
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };
  window.exitFullscreen = function() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else window.close();
  };

  function escapeHtml(txt) {
    var div = document.createElement('div');
    div.textContent = txt || '';
    return div.innerHTML;
  }
})();
