(function() {
  'use strict';
  var GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  var DATA_FILES = [
    {key: 'molds', file: 'molds.csv'},
    {key: 'cutters', file: 'cutters.csv'},
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
    loadSearchHistory();
    showLoading(true);
    loadAllData(function() {
      showLoading(false);
      renderResults();
    });
  });

  function setupUI() {
    var searchInput = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearBtn');
    var resetBtn = document.getElementById('resetBtn');
    searchInput.addEventListener('input', function() {
      updateClearBtn();
      renderSearchHistory();
      performSearch();
    });
    searchInput.addEventListener('focus', renderSearchHistory);
    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      updateClearBtn();
      performSearch();
      searchInput.focus();
    });
    resetBtn.addEventListener('click', function() {
      searchInput.value = '';
      updateClearBtn();
      selectedIdx = -1;
      performSearch();
      searchInput.focus();
    });
    document.getElementById('updateLocationBtn').onclick = function() {
      if (selectedIdx >= 0) alert('位置更新機能 / Chức năng cập nhật vị trí');
    };
    document.getElementById('updateShipBtn').onclick = function() {
      if (selectedIdx >= 0) alert('搬送更新機能 / Chức năng cập nhật vận chuyển');
    };
    document.getElementById('addNoteBtn').onclick = function() {
      if (selectedIdx >= 0) alert('メモ機能 / Chức năng ghi chú');
    };
  }

  function updateClearBtn() {
    var searchInput = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearBtn');
    clearBtn.style.display = searchInput.value ? 'block' : 'none';
  }

  function showLoading(show) {
    var loading = document.getElementById('loadingIndicator');
    loading.style.display = show ? 'flex' : 'none';
  }

  function loadAllData(callback) {
    var loaded = 0;
    for (var i = 0; i < DATA_FILES.length; i++) {
      (function(dataFile) {
        loadCSVFile(dataFile.file, function(data) {
          allData[dataFile.key] = data;
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
      if (xhr.readyState === 4 && xhr.status === 200) {
        cb(parseCSV(xhr.responseText));
      }
    };
    xhr.send();
  }

  function parseCSV(csvText) {
    var lines = csvText.split('\n');
    if (lines.length < 2) return [];
    var headers = lines[0].split(',');
    var result = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var values = [];
      var current = '';
      var inQuotes = false;
      for (var j = 0; j < line.length; j++) {
        var char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      var obj = {};
      for (var k = 0; k < headers.length; k++) {
        obj[headers[k]] = values[k] || '';
      }
      result.push(obj);
    }
    return result;
  }

  function processData() {
    var companyMap = {};
    allData.companies.forEach(function(company) {
      companyMap[company.CompanyID] = company;
    });
    var rackMap = {};
    allData.racks.forEach(function(rack) {
      rackMap[rack.RackID] = rack;
    });
    var rackLayerMap = {};
    allData.racklayers.forEach(function(layer) {
      rackLayerMap[layer.RackLayerID] = layer;
    });
    allData.molds.forEach(function(mold) {
      var storageCompany = companyMap[mold.storagecompany];
      var rackLayer = rackLayerMap[mold.RackLayerID];
      var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
      mold.displayNameJP = mold.MoldName || '';
      mold.displayNameVI = mold.MoldCode || '';
      mold.location = rack && rackLayer ?
        (rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber) : '';
      mold.storageCompanyName = storageCompany ?
        (storageCompany.CompanyShortName + ' / ' + storageCompany.CompanyName) : '';
      mold.itemType = 'mold';
    });
    allData.cutters.forEach(function(cutter) {
      var storageCompany = companyMap[cutter.storagecompany];
      var rackLayer = rackLayerMap[cutter.RackLayerID];
      var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
      cutter.displayNameJP = cutter.CutterName || '';
      cutter.displayNameVI = cutter.CutterNo || '';
      cutter.location = rack && rackLayer ?
        (rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber) : '';
      cutter.storageCompanyName = storageCompany ?
        (storageCompany.CompanyShortName + ' / ' + storageCompany.CompanyName) : '';
      cutter.itemType = 'cutter';
    });
  }

  function performSearch() {
    var query = document.getElementById('searchInput').value.trim().toLowerCase();
    filteredResults = [];
    if (!query) {
      filteredResults = allData.molds.slice(0, 5).concat(allData.cutters.slice(0, 5));
    } else {
      allData.molds.forEach(function(item) {
        if (matchesQuery(item, query)) filteredResults.push(item);
      });
      allData.cutters.forEach(function(item) {
        if (matchesQuery(item, query)) filteredResults.push(item);
      });
      filteredResults = filteredResults.slice(0, 10);
    }
    selectedIdx = -1;
    renderResults();
    addToSearchHistory(query);
  }

  function matchesQuery(item, query) {
    var s = (item.displayNameJP + ' ' + item.displayNameVI + ' ' + item.location + ' ' + item.storageCompanyName).toLowerCase();
    return s.indexOf(query) !== -1;
  }

  function renderResults() {
    var resultsList = document.getElementById('resultsList');
    var resultsCount = document.getElementById('resultsCount');
    resultsList.innerHTML = '';
    resultsCount.textContent = filteredResults.length + ' 件 / ' + filteredResults.length + ' kết quả';
    if (filteredResults.length === 0) {
      resultsList.innerHTML = '<li class="result-item">データが見つかりません / Không tìm thấy dữ liệu</li>';
      renderDetailPanel();
      return;
    }
    filteredResults.forEach(function(item, index) {
      var li = document.createElement('li');
      li.className = 'result-item' + (index === selectedIdx ? ' selected' : '');
      li.setAttribute('data-idx', index);
      li.innerHTML =
        '<div class="jp">' + escapeHtml(item.displayNameJP) + '</div>' +
        '<div class="vi">' + escapeHtml(item.displayNameVI) + '</div>' +
        '<div class="location">' + escapeHtml(item.location || '位置不明 / Vị trí chưa xác định') + '</div>';
      li.addEventListener('click', function() {
        selectResult(index);
      });
      resultsList.appendChild(li);
    });
    renderDetailPanel();
    updateActionButtons();
  }

  function selectResult(idx) {
    selectedIdx = idx;
    renderResults();
    updateActionButtons();
  }

  function renderDetailPanel() {
    var panel = document.getElementById('detailPanel');
    if (selectedIdx === -1 || !filteredResults[selectedIdx]) {
      panel.innerHTML = '<div class="detail-placeholder">アイテムを選択 / Chọn một kết quả</div>';
      return;
    }
    var item = filteredResults[selectedIdx];
    panel.innerHTML =
      '<div class="detail-header">' +
        '<div class="jp">' + escapeHtml(item.displayNameJP) + '</div>' +
        '<div class="vi">' + escapeHtml(item.displayNameVI) + '</div>' +
      '</div>' +
      '<div class="detail-content">' +
        '<div><strong>位置 / Vị trí:</strong> ' + escapeHtml(item.location || 'N/A') + '</div>' +
        '<div><strong>保管会社 / Công ty lưu trữ:</strong> ' + escapeHtml(item.storageCompanyName || 'N/A') + '</div>' +
        '<div><strong>種類 / Loại:</strong> ' + (item.itemType === 'mold' ? '金型 / Khuôn' : 'カッター / Dao cắt') + '</div>' +
      '</div>';
  }

  function updateActionButtons() {
    var hasSelection = selectedIdx !== -1;
    document.getElementById('updateLocationBtn').disabled = !hasSelection;
    document.getElementById('updateShipBtn').disabled = !hasSelection;
    document.getElementById('addNoteBtn').disabled = !hasSelection;
  }

  // Search history
  function renderSearchHistory() {
    var historyContainer = document.getElementById('searchHistory');
    historyContainer.innerHTML = '';
    if (searchHistory.length === 0) return;
    var recentHistory = searchHistory.slice(-5).reverse();
    recentHistory.forEach(function(query) {
      var item = document.createElement('div');
      item.className = 'search-history-item';
      item.textContent = query;
      item.addEventListener('click', function() {
        document.getElementById('searchInput').value = query;
        performSearch();
      });
      historyContainer.appendChild(item);
    });
  }

  function addToSearchHistory(query) {
    if (!query || query.length < 2) return;
    var index = searchHistory.indexOf(query);
    if (index !== -1) searchHistory.splice(index, 1);
    searchHistory.push(query);
    if (searchHistory.length > 20) searchHistory = searchHistory.slice(-20);
    saveSearchHistory();
  }

  function saveSearchHistory() {
    try {
      localStorage.setItem('ipad4SearchHistory', JSON.stringify(searchHistory));
    } catch (e) { }
  }

  function loadSearchHistory() {
    try {
      var saved = localStorage.getItem('ipad4SearchHistory');
      if (saved) searchHistory = JSON.parse(saved);
    } catch (e) { }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
