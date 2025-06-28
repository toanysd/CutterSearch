(function() {
  'use strict';

  // Cấu hình
  var GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  var DATA_FILES = [
    {key: 'molds', file: 'molds.csv'},
    {key: 'cutters', file: 'cutters.csv'},
    {key: 'companies', file: 'companies.csv'},
    {key: 'racklayers', file: 'racklayers.csv'},
    {key: 'racks', file: 'racks.csv'}
  ];

  // Biến global
  var allData = {};
  var searchHistory = [];
  var filteredResults = [];
  var selectedIdx = -1;

  // Khởi tạo
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
    var resultsList = document.getElementById('resultsList');
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var exitFullscreenBtn = document.getElementById('exitFullscreenBtn');

    // Tìm kiếm
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        updateClearBtn();
        doSearch();
      });
      searchInput.addEventListener('focus', renderSearchHistory);
      searchInput.addEventListener('blur', function() {
        setTimeout(function() {
          document.getElementById('searchHistory').innerHTML = '';
        }, 200);
      });
    }

    // Nút clear
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        updateClearBtn();
        doSearch();
        searchInput.focus();
      });
    }

    // Nút reset
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        searchInput.value = '';
        updateClearBtn();
        selectedIdx = -1;
        filteredResults = [];
        renderResults();
        searchInput.focus();
      });
    }

    // Chọn kết quả
    if (resultsList) {
      resultsList.addEventListener('click', function(e) {
        var li = e.target.closest('.result-item');
        if (!li) return;
        var idx = parseInt(li.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) {
          selectResult(idx);
        }
      });
    }

    // Nút fullscreen - Sửa lại logic
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function() {
        enterFullscreen();
      });
    }

    if (exitFullscreenBtn) {
      exitFullscreenBtn.addEventListener('click', function() {
        exitFullscreen();
      });
    }

    // Thao tác
    var updateLocationBtn = document.getElementById('updateLocationBtn');
    var updateShipBtn = document.getElementById('updateShipBtn');
    var addNoteBtn = document.getElementById('addNoteBtn');

    if (updateLocationBtn) {
      updateLocationBtn.addEventListener('click', function() {
        if (selectedIdx >= 0) alert('Cập nhật vị trí: sẽ bổ sung sau');
      });
    }

    if (updateShipBtn) {
      updateShipBtn.addEventListener('click', function() {
        if (selectedIdx >= 0) alert('Cập nhật vận chuyển: sẽ bổ sung sau');
      });
    }

    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', function() {
        if (selectedIdx >= 0) alert('Ghi chú: sẽ bổ sung sau');
      });
    }
  }

  // Fullscreen - Sửa lại cho iPad
  function enterFullscreen() {
    var elem = document.documentElement;
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var exitFullscreenBtn = document.getElementById('exitFullscreenBtn');

    try {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().then(function() {
          fullscreenBtn.style.display = 'none';
          exitFullscreenBtn.style.display = 'block';
        }).catch(function(err) {
          console.warn('Fullscreen failed:', err);
        });
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
        fullscreenBtn.style.display = 'none';
        exitFullscreenBtn.style.display = 'block';
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
        fullscreenBtn.style.display = 'none';
        exitFullscreenBtn.style.display = 'block';
      } else {
        alert('Trình duyệt không hỗ trợ toàn màn hình');
      }
    } catch (e) {
      console.warn('Fullscreen error:', e);
      alert('Không thể chuyển toàn màn hình');
    }
  }

  function exitFullscreen() {
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var exitFullscreenBtn = document.getElementById('exitFullscreenBtn');

    try {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(function() {
          fullscreenBtn.style.display = 'block';
          exitFullscreenBtn.style.display = 'none';
        });
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
        fullscreenBtn.style.display = 'block';
        exitFullscreenBtn.style.display = 'none';
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
        fullscreenBtn.style.display = 'block';
        exitFullscreenBtn.style.display = 'none';
      }
    } catch (e) {
      console.warn('Exit fullscreen error:', e);
    }
  }

  function updateClearBtn() {
    var searchInput = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearBtn');
    if (searchInput && clearBtn) {
      clearBtn.style.display = searchInput.value.trim() ? 'block' : 'none';
    }
  }

  function showLoading(show) {
    var loading = document.getElementById('loadingIndicator');
    if (loading) {
      loading.style.display = show ? 'flex' : 'none';
    }
  }

  function loadAllData(callback) {
    var loaded = 0;
    var totalFiles = DATA_FILES.length;

    for (var i = 0; i < DATA_FILES.length; i++) {
      (function(dataFile) {
        loadCSVFile(dataFile.file, function(data) {
          allData[dataFile.key] = data || [];
          loaded++;
          if (loaded === totalFiles) {
            processData();
            callback && callback();
          }
        });
      })(DATA_FILES[i]);
    }
  }

  function loadCSVFile(filename, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', GITHUB_BASE_URL + filename + '?t=' + Date.now(), true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          callback(parseCSV(xhr.responseText));
        } else {
          console.warn('Failed to load:', filename);
          callback([]);
        }
      }
    };
    xhr.onerror = function() {
      console.error('Error loading:', filename);
      callback([]);
    };
    xhr.send();
  }

  function parseCSV(csvText) {
    var lines = csvText.split('\n');
    if (lines.length < 2) return [];
    
    var headers = lines[0].split(',').map(function(h) {
      return h.trim().replace(/"/g, '');
    });
    
    var result = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      
      var values = [];
      var current = '';
      var inQuotes = false;
      
      for (var j = 0; j < line.length; j++) {
        var char = line[j];
        if (char === '"' && (j === 0 || line[j-1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/"/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/"/g, ''));
      
      var obj = {};
      for (var k = 0; k < headers.length; k++) {
        obj[headers[k]] = values[k] !== undefined ? values[k] : '';
      }
      result.push(obj);
    }
    return result;
  }

  function processData() {
    // Tạo maps
    var companyMap = {};
    var rackMap = {};
    var rackLayerMap = {};

    for (var i = 0; i < (allData.companies || []).length; i++) {
      var c = allData.companies[i];
      companyMap[c.CompanyID] = c;
    }

    for (var i = 0; i < (allData.racks || []).length; i++) {
      var r = allData.racks[i];
      rackMap[r.RackID] = r;
    }

    for (var i = 0; i < (allData.racklayers || []).length; i++) {
      var rl = allData.racklayers[i];
      rackLayerMap[rl.RackLayerID] = rl;
    }

    // Xử lý molds
    allData.molds = (allData.molds || []).map(function(mold) {
      var storageCompany = companyMap[mold.storagecompany];
      var rackLayer = rackLayerMap[mold.RackLayerID];
      var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
      
      var location = '';
      if (rack && rackLayer) {
        location = rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber;
      }

      return {
        MoldID: mold.MoldID,
        MoldCode: mold.MoldCode,
        MoldName: mold.MoldName,
        displayNameJP: mold.MoldName || '',
        displayNameVI: mold.MoldCode || '',
        location: location,
        storageCompanyName: storageCompany ? storageCompany.CompanyShortName : '',
        itemType: 'mold'
      };
    });

    // Xử lý cutters
    allData.cutters = (allData.cutters || []).map(function(cutter) {
      var storageCompany = companyMap[cutter.storagecompany];
      var rackLayer = rackLayerMap[cutter.RackLayerID];
      var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
      
      var location = '';
      if (rack && rackLayer) {
        location = rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber;
      }

      return {
        CutterID: cutter.CutterID,
        CutterNo: cutter.CutterNo,
        CutterName: cutter.CutterName,
        displayNameJP: cutter.CutterName || '',
        displayNameVI: cutter.CutterNo || '',
        location: location,
        storageCompanyName: storageCompany ? storageCompany.CompanyShortName : '',
        itemType: 'cutter'
      };
    });

    console.log('Processed:', allData.molds.length, 'molds,', allData.cutters.length, 'cutters');
  }

  function doSearch() {
    var searchInput = document.getElementById('searchInput');
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    filteredResults = [];
    selectedIdx = -1;

    if (!query) {
      filteredResults = (allData.molds || []).concat(allData.cutters || []).slice(0, 10);
    } else {
      var allItems = (allData.molds || []).concat(allData.cutters || []);
      for (var i = 0; i < allItems.length && filteredResults.length < 10; i++) {
        var item = allItems[i];
        var searchText = (
          item.displayNameJP + ' ' +
          item.displayNameVI + ' ' +
          item.location + ' ' +
          item.storageCompanyName
        ).toLowerCase();
        
        if (searchText.indexOf(query) !== -1) {
          filteredResults.push(item);
        }
      }
    }

    renderResults();
    if (query.length >= 2) {
      addToSearchHistory(query);
    }
  }

  function renderResults() {
    var resultsList = document.getElementById('resultsList');
    var resultsCount = document.getElementById('resultsCount');
    
    if (!resultsList) return;

    // Cập nhật số lượng
    if (resultsCount) {
      resultsCount.textContent = filteredResults.length + ' kết quả';
    }

    // Render danh sách
    resultsList.innerHTML = '';
    
    if (filteredResults.length === 0) {
      resultsList.innerHTML = '<li class="result-item">Không tìm thấy kết quả</li>';
      updateActionBtns();
      renderDetailPanel();
      return;
    }

    for (var i = 0; i < filteredResults.length; i++) {
      var item = filteredResults[i];
      var li = document.createElement('li');
      li.className = 'result-item' + (i === selectedIdx ? ' selected' : '');
      li.setAttribute('data-idx', i);
      
      li.innerHTML = 
        '<div class="jp">' + escapeHtml(item.displayNameJP) + '</div>' +
        '<div class="vi">' + escapeHtml(item.displayNameVI) + '</div>' +
        '<div class="location">' + escapeHtml(item.location) + '</div>' +
        '<div class="company">' + escapeHtml(item.storageCompanyName) + '</div>';
      
      resultsList.appendChild(li);
    }

    updateActionBtns();
    renderDetailPanel();
  }

  function selectResult(idx) {
    selectedIdx = idx;
    renderResults();
  }

  function updateActionBtns() {
    var hasSelection = selectedIdx >= 0 && filteredResults[selectedIdx];
    var btns = ['updateLocationBtn', 'updateShipBtn', 'addNoteBtn'];
    
    for (var i = 0; i < btns.length; i++) {
      var btn = document.getElementById(btns[i]);
      if (btn) {
        btn.disabled = !hasSelection;
      }
    }
  }

  function renderDetailPanel() {
    var panel = document.getElementById('detailPanel');
    if (!panel) return;

    if (selectedIdx < 0 || !filteredResults[selectedIdx]) {
      panel.innerHTML = '<div class="detail-placeholder">Chọn một kết quả để xem chi tiết</div>';
      return;
    }

    var item = filteredResults[selectedIdx];
    panel.innerHTML = 
      '<div style="font-size:18px;font-weight:bold;color:#2563eb;margin-bottom:8px;">' + 
      escapeHtml(item.displayNameJP) + '</div>' +
      '<div style="font-size:16px;color:#6b7280;margin-bottom:8px;">' + 
      escapeHtml(item.displayNameVI) + '</div>' +
      '<div style="margin-bottom:4px;"><strong>Vị trí:</strong> ' + 
      escapeHtml(item.location) + '</div>' +
      '<div><strong>Công ty:</strong> ' + 
      escapeHtml(item.storageCompanyName) + '</div>' +
      '<div style="margin-top:12px;font-style:italic;color:#9ca3af;">Chi tiết sẽ bổ sung sau...</div>';
  }

  // Lịch sử tìm kiếm
  function renderSearchHistory() {
    var historyBox = document.getElementById('searchHistory');
    var searchInput = document.getElementById('searchInput');
    
    if (!historyBox || !searchInput) return;

    var query = searchInput.value.trim();
    if (query || searchHistory.length === 0) {
      historyBox.innerHTML = '';
      return;
    }

    var html = '';
    var recentHistory = searchHistory.slice(-10).reverse();
    
    for (var i = 0; i < recentHistory.length; i++) {
      var item = recentHistory[i];
      html += 
        '<div class="search-history-item" data-query="' + escapeHtml(item) + '">' +
        '<span>' + escapeHtml(item) + '</span>' +
        '<button class="search-history-remove" data-query="' + escapeHtml(item) + '">×</button>' +
        '</div>';
    }
    
    historyBox.innerHTML = html;

    // Event listeners cho lịch sử
    var items = historyBox.querySelectorAll('.search-history-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function(e) {
        if (e.target.classList.contains('search-history-remove')) {
          var query = e.target.getAttribute('data-query');
          removeFromSearchHistory(query);
          renderSearchHistory();
          e.stopPropagation();
          return;
        }
        
        var query = this.getAttribute('data-query');
        searchInput.value = query;
        updateClearBtn();
        doSearch();
        historyBox.innerHTML = '';
      });
    }
  }

  function addToSearchHistory(query) {
    if (!query || query.length < 2) return;
    
    // Xóa nếu đã tồn tại
    var index = searchHistory.indexOf(query);
    if (index !== -1) {
      searchHistory.splice(index, 1);
    }
    
    // Thêm vào cuối
    searchHistory.push(query);
    
    // Giới hạn 20 items
    if (searchHistory.length > 20) {
      searchHistory = searchHistory.slice(-20);
    }
    
    saveSearchHistory();
  }

  function removeFromSearchHistory(query) {
    var index = searchHistory.indexOf(query);
    if (index !== -1) {
      searchHistory.splice(index, 1);
      saveSearchHistory();
    }
  }

  function saveSearchHistory() {
    try {
      localStorage.setItem('ipad4SearchHistory', JSON.stringify(searchHistory));
    } catch (e) {
      console.warn('Cannot save search history:', e);
    }
  }

  function loadSearchHistory() {
    try {
      var saved = localStorage.getItem('ipad4SearchHistory');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          searchHistory = parsed;
        }
      }
    } catch (e) {
      console.warn('Cannot load search history:', e);
      searchHistory = [];
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

})();
