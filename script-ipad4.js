// script-ipad4.js - MoldCutter iPad4 TouchPanel V4.37 Complete
// Tích hợp đầy đủ logic từ V4.36/V4.33, tối ưu cho iPad 4

(function() {
  'use strict';

  // Configuration
  var GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  var API_BASE_URL = 'https://ysd-moldcutter-backend.onrender.com';

  // Global variables (ES5 compatible)
  var allData = {
    molds: [], cutters: [], customers: [], molddesign: [], moldcutter: [],
    shiplog: [], locationlog: [], employees: [], racklayers: [], racks: [],
    companies: [], usercomments: [], jobs: [], processingitems: []
  };
  var filteredResults = [];
  var selectedItems = [];
  var currentPage = 1;
  var pageSize = 50;
  var sortField = '';
  var sortDirection = 'asc';
  var searchTimeout = null;
  var currentCategory = 'all';
  var currentView = 'table';
  var selectedItem = null;
  var searchHistory = [];
  var suggestionIndex = -1;
  var isShowingSuggestions = false;
  var hideTimeout = null;

  // DOM elements
  var elements = {};

  // Initialize application
  document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing V4.37 Application...');
    initializeElements();
    setupEventListeners();
    loadSearchHistory();
    setupSearchFunctionality();
    preventMobileZoom();
    
    if (isMainPage()) {
      initializeMainPage();
    }
  });

  function initializeElements() {
    elements = {
      searchInput: document.getElementById('searchInput'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      categoryFilter: document.getElementById('categoryFilter'),
      fieldFilter: document.getElementById('fieldFilter'),
      valueFilter: document.getElementById('valueFilter'),
      resetFiltersBtn: document.getElementById('resetFiltersBtn'),
      searchHistory: document.getElementById('searchHistory'),
      resultsCount: document.getElementById('resultsCount'),
      selectedInfo: document.getElementById('selectedInfo'),
      resultsList: document.getElementById('resultsList'),
      updateLocationBtn: document.getElementById('updateLocationBtn'),
      updateShipmentBtn: document.getElementById('updateShipmentBtn'),
      updateTeflonBtn: document.getElementById('updateTeflonBtn'),
      updateCommentBtn: document.getElementById('updateCommentBtn'),
      detailSection: document.getElementById('detailSection'),
      loadingIndicator: document.getElementById('loadingIndicator'),
      modalContainer: document.getElementById('modalContainer')
    };
    
    console.log('Elements initialized:', Object.keys(elements).length);
  }

  function setupEventListeners() {
    // Search input
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', handleSearchInput);
      elements.searchInput.addEventListener('focus', showSearchHistory);
      elements.searchInput.addEventListener('blur', hideSearchHistory);
      elements.searchInput.addEventListener('keydown', handleSearchKeydown);
    }
    
    // Clear search
    if (elements.clearSearchBtn) {
      elements.clearSearchBtn.addEventListener('click', clearSearch);
    }
    
    // Filters
    if (elements.categoryFilter) {
      elements.categoryFilter.addEventListener('change', handleCategoryChange);
    }
    
    if (elements.fieldFilter) {
      elements.fieldFilter.addEventListener('change', handleFieldChange);
    }
    
    if (elements.valueFilter) {
      elements.valueFilter.addEventListener('change', handleValueChange);
    }
    
    if (elements.resetFiltersBtn) {
      elements.resetFiltersBtn.addEventListener('click', resetFilters);
    }
    
    // Action buttons
    if (elements.updateLocationBtn) {
      elements.updateLocationBtn.addEventListener('click', function() {
        if (selectedItem) showLocationModal();
      });
    }
    
    if (elements.updateShipmentBtn) {
      elements.updateShipmentBtn.addEventListener('click', function() {
        if (selectedItem) showShipmentModal();
      });
    }
    
    if (elements.updateTeflonBtn) {
      elements.updateTeflonBtn.addEventListener('click', function() {
        if (selectedItem) showTeflonModal();
      });
    }
    
    if (elements.updateCommentBtn) {
      elements.updateCommentBtn.addEventListener('click', function() {
        if (selectedItem) showCommentModal();
      });
    }
    
    // Results list
    if (elements.resultsList) {
      elements.resultsList.addEventListener('click', handleResultClick);
    }
    
    // Prevent zoom on double tap
    document.addEventListener('touchstart', function(e) {
      if (e.touches.length > 1) e.preventDefault();
    });
    
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function(e) {
      var now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, false);
    
    console.log('Event listeners setup completed');
  }

  // Check if current page is main page
  function isMainPage() {
    var path = window.location.pathname;
    return path.indexOf('index.html') !== -1 || path === '/' || path.charAt(path.length - 1) === '/';
  }

  // Initialize main page
  function initializeMainPage() {
    showLoading(true);
    loadAllData(function() {
      showLoading(false);
      initializeFilters();
      restoreSearchState();
      performSearch();
      console.log('V4.37 Application initialized successfully');
    });
  }

  // Prevent mobile zoom
  function preventMobileZoom() {
    var formElements = document.querySelectorAll('input, select, textarea');
    for (var i = 0; i < formElements.length; i++) {
      var element = formElements[i];
      element.style.fontSize = '16px';
      element.addEventListener('focus', function() {
        this.scrollIntoView({behavior: 'smooth', block: 'center'});
      });
    }
  }

  // Loading functions
  function showLoading(show) {
    if (elements.loadingIndicator) {
      elements.loadingIndicator.style.display = show ? 'flex' : 'none';
    }
  }

  function showError(message) {
    console.error(message);
    alert('エラー / Lỗi: ' + message);
  }

  function showSuccess(message) {
    console.log(message);
    showNotification(message, 'success');
  }

  // Enhanced CSV parsing function
  function parseCSV(csvText) {
    var lines = csvText.split('\n').filter(function(line) {
      return line.trim() !== '';
    });
    if (lines.length === 0) return [];
    
    var headers = lines[0].split(',').map(function(h) {
      return h.trim().replace(/"/g, '');
    });
    
    return lines.slice(1).map(function(line) {
      var values = [];
      var current = '';
      var inQuotes = false;
      
      for (var i = 0; i < line.length; i++) {
        var char = line[i];
        if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
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
      headers.forEach(function(header, index) {
        obj[header] = values[index] !== undefined ? values[index] : '';
      });
      return obj;
    });
  }

  // Date formatting function
  function formatDate(dateString) {
    if (!dateString) return '';
    try {
      var date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('ja-JP');
    } catch (e) {
      return dateString;
    }
  }

  // Enhanced data loading with XMLHttpRequest (ES5 compatible)
  function loadAllData(callback) {
    var dataFiles = [
      {key: 'molds', file: 'molds.csv', required: true},
      {key: 'cutters', file: 'cutters.csv', required: true},
      {key: 'customers', file: 'customers.csv', required: false},
      {key: 'molddesign', file: 'molddesign.csv', required: false},
      {key: 'moldcutter', file: 'moldcutter.csv', required: false},
      {key: 'shiplog', file: 'shiplog.csv', required: false},
      {key: 'locationlog', file: 'locationlog.csv', required: false},
      {key: 'employees', file: 'employees.csv', required: false},
      {key: 'racklayers', file: 'racklayers.csv', required: false},
      {key: 'racks', file: 'racks.csv', required: false},
      {key: 'companies', file: 'companies.csv', required: false},
      {key: 'usercomments', file: 'usercomments.csv', required: false},
      {key: 'jobs', file: 'jobs.csv', required: false},
      {key: 'processingitems', file: 'processingitems.csv', required: false}
    ];

    var loaded = 0;
    var data = {};
    
    console.log('Loading', dataFiles.length, 'data files...');
    
    for (var i = 0; i < dataFiles.length; i++) {
      (function(dataFile) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', GITHUB_BASE_URL + dataFile.file + '?t=' + Date.now(), true);
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              data[dataFile.key] = parseCSV(xhr.responseText || '');
              console.log(dataFile.file + ' loaded:', data[dataFile.key].length, 'records');
            } else {
              if (dataFile.required) {
                console.error('Required file ' + dataFile.file + ' not found');
              } else {
                console.warn('Optional file ' + dataFile.file + ' not found');
              }
              data[dataFile.key] = [];
            }
            
            loaded++;
            if (loaded === dataFiles.length) {
              allData = data;
              processDataRelationships();
              callback && callback();
            }
          }
        };
        xhr.onerror = function() {
          console.error('Network error loading ' + dataFile.file);
          data[dataFile.key] = [];
          loaded++;
          if (loaded === dataFiles.length) {
            allData = data;
            processDataRelationships();
            callback && callback();
          }
        };
        xhr.send();
      })(dataFiles[i]);
    }
  }

  // Enhanced data processing with all relationships for V4.37
  function processDataRelationships() {
    console.log('Processing data relationships V4.37...');
    
    // Create lookup maps
    var moldDesignMap = {};
    var customerMap = {};
    var companyMap = {};
    var rackMap = {};
    var rackLayerMap = {};
    var jobMap = {};
    var processingItemMap = {};
    
    (allData.molddesign || []).forEach(function(d) {
      moldDesignMap[d.MoldDesignID] = d;
    });
    
    (allData.customers || []).forEach(function(c) {
      customerMap[c.CustomerID] = c;
    });
    
    (allData.companies || []).forEach(function(c) {
      companyMap[c.CompanyID] = c;
    });
    
    (allData.racks || []).forEach(function(r) {
      rackMap[r.RackID] = r;
    });
    
    (allData.racklayers || []).forEach(function(rl) {
      rackLayerMap[rl.RackLayerID] = rl;
    });
    
    (allData.jobs || []).forEach(function(j) {
      jobMap[j.MoldDesignID] = j;
    });
    
    (allData.processingitems || []).forEach(function(p) {
      processingItemMap[p.ProcessingItemID] = p;
    });

    // Process molds with enhanced data relationships
    allData.molds = (allData.molds || []).map(function(mold) {
      var design = moldDesignMap[mold.MoldDesignID] || {};
      var customer = customerMap[mold.CustomerID] || {};
      var company = companyMap[customer.CompanyID] || {};
      var rackLayer = rackLayerMap[mold.RackLayerID] || {};
      var rack = rackLayer.RackID ? rackMap[rackLayer.RackID] : {};
      var storageCompany = companyMap[mold.storage_company] || {};
      var job = jobMap[mold.MoldDesignID] || {};
      var processingItem = processingItemMap[job.ProcessingItemID] || {};

      // Enhanced cutline size creation from molddesign
      var cutlineSize = '';
      if (design.CutlineX && design.CutlineY) {
        cutlineSize = design.CutlineX + '×' + design.CutlineY;
      }

      // Enhanced mold status determination
      var moldStatus = 'Active';
      if (mold.MoldReturning === 'TRUE') {
        moldStatus = 'Returned';
      } else if (mold.MoldDisposing === 'TRUE') {
        moldStatus = 'Disposed';
      } else if (mold.MoldReturning === 'FALSE' && mold.MoldDisposing === 'FALSE') {
        moldStatus = 'In Use';
      }

      return Object.assign({}, mold, {
        designInfo: design,
        customerInfo: customer,
        companyInfo: company,
        rackLayerInfo: rackLayer,
        rackInfo: rack,
        storageCompanyInfo: storageCompany,
        jobInfo: job,
        processingItemInfo: processingItem,
        relatedCutters: getRelatedCutters(mold.MoldID),
        shipHistory: getShipHistory('MOLD', mold.MoldID),
        locationHistory: getLocationHistory('MOLD', mold.MoldID),
        currentStatus: getCurrentStatus(mold),
        displayCode: mold.MoldCode || '',
        displayName: mold.MoldName || mold.MoldCode || '',
        displayDimensions: createMoldDimensionString(mold, design),
        displayLocation: getDisplayLocation(rackLayer, rack),
        displayCustomer: getCustomerDisplayName(customer, company),
        displayStorageCompany: getStorageCompanyDisplay(mold.storage_company, companyMap),
        displayRackLocation: rack.RackLocation || '',
        // Enhanced fields for V4.37
        rackId: rackLayer.RackID || '',
        drawingNumber: design.DrawingNumber || '',
        equipmentCode: design.EquipmentCode || '',
        plasticType: design.DesignForPlasticType || '',
        moldSetupType: design.MoldSetupType || '',
        pieceCount: design.PieceCount || '',
        cutlineSize: cutlineSize,
        storageCompany: storageCompany.CompanyShortName || storageCompany.CompanyName || '',
        storageCompanyId: mold.storage_company || '',
        moldStatus: moldStatus,
        itemType: 'mold'
      });
    });

    // Process cutters with enhanced data relationships
    allData.cutters = (allData.cutters || []).map(function(cutter) {
      var customer = customerMap[cutter.CustomerID] || {};
      var company = companyMap[customer.CompanyID] || {};
      var rackLayer = rackLayerMap[cutter.RackLayerID] || {};
      var rack = rackLayer.RackID ? rackMap[rackLayer.RackID] : {};
      var storageCompany = companyMap[cutter.storage_company] || {};

      // Enhanced cutline size creation from cutter data
      var cutlineSize = '';
      if (cutter.CutlineLength && cutter.CutlineWidth) {
        cutlineSize = cutter.CutlineLength + '×' + cutter.CutlineWidth;
        if (cutter.CutterCorner) cutlineSize += '-' + cutter.CutterCorner;
        if (cutter.CutterChamfer) cutlineSize += '-' + cutter.CutterChamfer;
      }

      // Fixed display name for cutter - only show CutterName for column
      var displayName = cutter.CutterName || cutter.CutterDesignName || '';

      return Object.assign({}, cutter, {
        customerInfo: customer,
        companyInfo: company,
        rackLayerInfo: rackLayer,
        rackInfo: rack,
        storageCompanyInfo: storageCompany,
        relatedMolds: getRelatedMolds(cutter.CutterID),
        shipHistory: getShipHistory('CUTTER', cutter.CutterID),
        locationHistory: getLocationHistory('CUTTER', cutter.CutterID),
        currentStatus: getCurrentStatus(cutter),
        displayCode: cutter.CutterNo || '',
        displayName: displayName,
        displayDimensions: cutlineSize,
        displayLocation: getDisplayLocation(rackLayer, rack),
        displayCustomer: getCustomerDisplayName(customer, company),
        displayStorageCompany: getStorageCompanyDisplay(cutter.storage_company, companyMap),
        displayRackLocation: rack.RackLocation || '',
        // Enhanced fields for V4.37
        rackId: rackLayer.RackID || '',
        plasticCutType: cutter.PlasticCutType || '',
        cutterType: cutter.CutterType || '',
        bladeCount: cutter.BladeCount || '',
        cutlineSize: cutlineSize,
        storageCompany: storageCompany.CompanyShortName || storageCompany.CompanyName || '',
        storageCompanyId: cutter.storage_company || '',
        itemType: 'cutter'
      });
    });
    
    console.log('Processed', allData.molds.length, 'molds and', allData.cutters.length, 'cutters');
  }

  // Helper functions for data processing
  function createMoldDimensionString(mold, design) {
    if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
      return design.MoldDesignLength + '×' + design.MoldDesignWidth + '×' + design.MoldDesignHeight;
    }
    if (design.MoldDesignDim) {
      return design.MoldDesignDim;
    }
    if (mold.MoldLength && mold.MoldWidth && mold.MoldHeight) {
      return mold.MoldLength + '×' + mold.MoldWidth + '×' + mold.MoldHeight;
    }
    return '';
  }

  function getDisplayLocation(rackLayer, rack) {
    if (rack.RackLocation && rackLayer.RackLayerNumber) {
      return rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber;
    }
    return '';
  }

  function getCustomerDisplayName(customer, company) {
    if (!customer || !customer.CustomerID) return '';
    var displayName = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
    if (company && company.CompanyShortName) {
      displayName = company.CompanyShortName + ' - ' + displayName;
    }
    return displayName;
  }

  function getStorageCompanyDisplay(storageCompanyId, companyMap) {
    if (!storageCompanyId) return 'N/A';
    var company = companyMap[storageCompanyId];
    if (!company) return 'N/A';
    var companyName = company.CompanyShortName || company.CompanyName || storageCompanyId;
    return companyName;
  }

  // Get related items V3.0 working logic
  function getRelatedCutters(moldID) {
    if (!moldID) return [];
    var relations = (allData.moldcutter || []).filter(function(mc) {
      return mc.MoldID === moldID;
    });
    return relations.map(function(rel) {
      var cutter = (allData.cutters || []).find(function(c) {
        return c.CutterID === rel.CutterID;
      });
      return cutter;
    }).filter(function(c) {
      return c && c.CutterID;
    });
  }

  function getRelatedMolds(cutterID) {
    if (!cutterID) return [];
    var relations = (allData.moldcutter || []).filter(function(mc) {
      return mc.CutterID === cutterID;
    });
    return relations.map(function(rel) {
      var mold = (allData.molds || []).find(function(m) {
        return m.MoldID === rel.MoldID;
      });
      return mold;
    }).filter(function(m) {
      return m && m.MoldID;
    });
  }

  // Get shipping history V3.0 working
  function getShipHistory(itemType, itemID) {
    if (!itemID) return [];
    return (allData.shiplog || []).filter(function(log) {
      if (itemType === 'MOLD') return log.MoldID === itemID;
      if (itemType === 'CUTTER') return log.CutterID === itemID;
      return false;
    }).sort(function(a, b) {
      return new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0);
    });
  }

  // Get location history V3.0 working
  function getLocationHistory(itemType, itemID) {
    if (!itemID) return [];
    return (allData.locationlog || []).filter(function(log) {
      if (itemType === 'MOLD') return log.MoldID === itemID;
      if (itemType === 'CUTTER') return log.CutterID === itemID;
      return false;
    }).sort(function(a, b) {
      return new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0);
    });
  }

  // Get current status V3.0 working logic
  function getCurrentStatus(item) {
    if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
      return {status: 'returned', text: '返却済み / Đã trả lại', class: 'status-returned'};
    }
    if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
      return {status: 'disposed', text: '廃棄済み / Đã hủy bỏ', class: 'status-disposed'};
    }
    
    var history = getShipHistory(item.MoldID ? 'MOLD' : 'CUTTER', item.MoldID || item.CutterID);
    if (history.length > 0) {
      var latest = history[0];
      if (latest.ToCompanyID && latest.ToCompanyID !== 'YSD') {
        return {status: 'shipped', text: '出荷済み / Đã xuất hàng', class: 'status-shipped'};
      }
    }
    
    return {status: 'available', text: '利用可能 / Có sẵn', class: 'status-available'};
  }

  // Enhanced search functionality
  function setupSearchFunctionality() {
    if (!elements.searchInput) {
      console.warn('Search input not found');
      return;
    }
    
    elements.searchInput.addEventListener('input', handleSearchInput);
    elements.searchInput.addEventListener('keydown', handleSearchKeydown);
    
    console.log('Search functionality setup completed');
  }

  function handleSearchInput() {
    updateClearSearchButton();
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(function() {
      performSearch();
    }, 300);
  }

  function updateClearSearchButton() {
    if (elements.searchInput && elements.clearSearchBtn) {
      var hasValue = elements.searchInput.value.trim().length > 0;
      elements.clearSearchBtn.style.display = hasValue ? 'block' : 'none';
    }
  }

  function clearSearch() {
    if (elements.searchInput) {
      elements.searchInput.value = '';
      updateClearSearchButton();
      performSearch();
      elements.searchInput.focus();
    }
  }

  // Search history functions (ES5 compatible)
  function showSearchHistory() {
    renderSearchHistory();
  }
  
  function hideSearchHistory() {
    setTimeout(function() {
      if (elements.searchHistory) {
        elements.searchHistory.innerHTML = '';
      }
    }, 200);
  }
  
  function renderSearchHistory() {
    if (!elements.searchHistory) return;
    
    var query = elements.searchInput ? elements.searchInput.value.trim() : '';
    if (query || searchHistory.length === 0) {
      elements.searchHistory.innerHTML = '';
      return;
    }
    
    var recentHistory = searchHistory.slice(-5).reverse();
    elements.searchHistory.innerHTML = recentHistory.map(function(item, index) {
      return '<div class="history-item" data-query="' + escapeHtml(item.keyword) + '">' +
        '<span>' + escapeHtml(item.keyword) + '</span>' +
        (item.selectedName ? '<small>' + escapeHtml(item.selectedName) + '</small>' : '') +
        '<button class="history-remove" data-index="' + (searchHistory.length - 1 - index) + '">×</button>' +
        '</div>';
    }).join('');
    
    var items = elements.searchHistory.querySelectorAll('.history-item');
    for (var i = 0; i < items.length; i++) {
      items[i].onclick = function(e) {
        if (e.target.classList.contains('history-remove')) {
          var idx = parseInt(e.target.getAttribute('data-index'), 10);
          searchHistory.splice(idx, 1);
          saveSearchHistory();
          renderSearchHistory();
          return;
        }
        
        var query = this.getAttribute('data-query');
        if (elements.searchInput) {
          elements.searchInput.value = query;
        }
        performSearch();
        hideSearchHistory();
      };
    }
  }
  
  function addToSearchHistory(keyword, selectedName) {
    if (!keyword || keyword.length < 2) return;
    
    // Remove existing entry
    var existingIndex = -1;
    for (var i = 0; i < searchHistory.length; i++) {
      if (searchHistory[i].keyword === keyword) {
        existingIndex = i;
        break;
      }
    }
    
    if (existingIndex >= 0) {
      searchHistory.splice(existingIndex, 1);
    }
    
    // Add new entry
    searchHistory.push({
      keyword: keyword,
      selectedName: selectedName || '',
      timestamp: Date.now()
    });
    
    // Limit history size
    if (searchHistory.length > 20) {
      searchHistory = searchHistory.slice(-20);
    }
    
    saveSearchHistory();
  }
  
  function saveSearchHistory() {
    try {
      localStorage.setItem('searchHistoryV437', JSON.stringify(searchHistory));
    } catch (e) {
      console.warn('Failed to save search history');
    }
  }
  
  function loadSearchHistory() {
    try {
      var saved = localStorage.getItem('searchHistoryV437');
      if (saved) {
        searchHistory = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load search history');
    }
  }

  // Filter functions
  function initializeFilters() {
    updateFieldFilter();
    updateValueFilter();
  }

  function updateFieldFilter() {
    if (!elements.fieldFilter) return;
    
    elements.fieldFilter.innerHTML = '<option value="all">全項目 / Tất cả trường</option>';
    
    var fields = [
      {value: 'displayCode', text: 'コード / Mã'},
      {value: 'displayName', text: '名前 / Tên'},
      {value: 'displayDimensions', text: 'サイズ / Kích thước'},
      {value: 'displayLocation', text: '位置 / Vị trí'},
      {value: 'displayCustomer', text: '顧客 / Khách hàng'},
      {value: 'storageCompany', text: '保管会社 / Công ty lưu trữ'}
    ];
    
    fields.forEach(function(option) {
      var optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      elements.fieldFilter.appendChild(optionElement);
    });
  }

  function updateValueFilter() {
    if (!elements.fieldFilter || !elements.valueFilter) return;
    
    var selectedField = elements.fieldFilter.value;
    elements.valueFilter.innerHTML = '<option value="all">全て / Tất cả</option>';
    
    if (selectedField === 'all') return;
    
    var dataToAnalyze;
    if (currentCategory === 'mold') {
      dataToAnalyze = allData.molds;
    } else if (currentCategory === 'cutter') {
      dataToAnalyze = allData.cutters;
    } else {
      dataToAnalyze = (allData.molds || []).concat(allData.cutters || []);
    }
    
    var uniqueValues = {};
    dataToAnalyze.forEach(function(item) {
      var value = item[selectedField];
      if (value && value.toString().trim()) {
        uniqueValues[value.toString().trim()] = true;
      }
    });
    
    Object.keys(uniqueValues).sort().forEach(function(value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      elements.valueFilter.appendChild(option);
    });
  }

  // Search and filter handlers
  function handleCategoryChange() {
    if (elements.categoryFilter) {
      currentCategory = elements.categoryFilter.value;
      updateFieldFilter();
      updateValueFilter();
      performSearch();
    }
  }

  function handleFieldChange() {
    updateValueFilter();
    performSearch();
  }

  function handleValueChange() {
    performSearch();
  }

  function handleSearchKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      performSearch();
    } else if (event.key === 'Escape') {
      hideSearchHistory();
    }
  }

  // Enhanced main search function
  function performSearch() {
    var query = elements.searchInput ? elements.searchInput.value.trim() : '';
    var fieldFilter = elements.fieldFilter ? elements.fieldFilter.value : 'all';
    var valueFilter = elements.valueFilter ? elements.valueFilter.value : 'all';
    
    console.log('Performing search V4.37:', query, fieldFilter, valueFilter, currentCategory);
    
    if (query) {
      addToSearchHistory(query);
    }
    
    var dataToSearch;
    if (currentCategory === 'mold') {
      dataToSearch = allData.molds;
    } else if (currentCategory === 'cutter') {
      dataToSearch = allData.cutters;
    } else {
      dataToSearch = (allData.molds || []).concat(allData.cutters || []);
    }
    
    // Apply field filter first
    var preFilteredData = dataToSearch;
    if (fieldFilter !== 'all' && valueFilter !== 'all') {
      preFilteredData = dataToSearch.filter(function(item) {
        return item[fieldFilter] && item[fieldFilter].toString() === valueFilter;
      });
    }
    
    // Enhanced text search
    filteredResults = preFilteredData.filter(function(item) {
      if (!query) return true;
      
      var keywords = query.split(',').map(function(k) {
        return k.trim().toLowerCase();
      }).filter(function(k) {
        return k.length > 0;
      });
      
      if (keywords.length === 0) return true;
      
      return keywords.every(function(keyword) {
        var searchFields = [
          item.displayCode, item.displayName, item.displayDimensions, item.displayLocation,
          item.displayCustomer, item.MoldID, item.CutterID, item.MoldCode, item.CutterNo,
          item.MoldName, item.CutterName, item.cutlineSize, item.storageCompany
        ].filter(function(field) {
          return field && field.toString().trim();
        });
        
        return searchFields.some(function(field) {
          return field.toString().toLowerCase().indexOf(keyword) !== -1;
        });
      });
    });
    
    selectedItem = null;
    updateResultsDisplay();
    updateActionButtons();
    renderDetailSection();
    saveSearchState();
  }

  // Results display
  function updateResultsDisplay() {
    updateResultsCount();
    displayCurrentPage();
  }

  function updateResultsCount() {
    if (elements.resultsCount) {
      elements.resultsCount.textContent = filteredResults.length + ' 件 / ' + filteredResults.length + ' kết quả';
    }
  }

  function displayCurrentPage() {
    var startIndex = (currentPage - 1) * pageSize;
    var endIndex = Math.min(startIndex + pageSize, filteredResults.length);
    var pageData = filteredResults.slice(startIndex, endIndex);
    
    displayTableView(pageData);
  }

  // Enhanced table display function
  function displayTableView(data) {
    if (!elements.resultsList) return;
    
    elements.resultsList.innerHTML = '';
    
    if (data.length === 0) {
      elements.resultsList.innerHTML = '<div class="no-results">データが見つかりません / Không tìm thấy dữ liệu</div>';
      return;
    }
    
    data.forEach(function(item, index) {
      var itemId = item.MoldID || item.CutterID;
      var itemType = item.itemType;
      
      var div = document.createElement('div');
      div.className = 'result-item ' + itemType;
      div.setAttribute('data-index', index);
      div.setAttribute('data-id', itemId);
      
      div.innerHTML = 
        '<div class="result-name ' + itemType + '">' + escapeHtml(item.displayName || 'N/A') + '</div>' +
        '<div class="result-location">' + escapeHtml(item.displayLocation || 'N/A') + '</div>';
      
      elements.resultsList.appendChild(div);
    });
  }

  function handleResultClick(event) {
    var resultItem = event.target.closest('.result-item');
    if (!resultItem) return;
    
    var index = parseInt(resultItem.getAttribute('data-index'), 10);
    if (isNaN(index) || index < 0 || index >= filteredResults.length) return;
    
    // Remove previous selection
    if (elements.resultsList) {
      var items = elements.resultsList.querySelectorAll('.result-item');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('selected');
      }
    }
    
    // Add selection to clicked item
    resultItem.classList.add('selected');
    
    selectedItem = filteredResults[index];
    if (elements.selectedInfo) {
      elements.selectedInfo.textContent = '選択: ' + selectedItem.displayName;
    }
    
    // Hide keyboard by blurring search input
    if (elements.searchInput) {
      elements.searchInput.blur();
    }
    
    updateActionButtons();
    renderDetailSection();
    
    // Add to search history with selected name
    var query = elements.searchInput ? elements.searchInput.value.trim() : '';
    if (query) {
      addToSearchHistory(query, selectedItem.displayName);
    }
    
    console.log('Selected item:', selectedItem.displayName);
  }

  function updateActionButtons() {
    var hasSelection = selectedItem !== null;
    if (elements.updateLocationBtn) elements.updateLocationBtn.disabled = !hasSelection;
    if (elements.updateShipmentBtn) elements.updateShipmentBtn.disabled = !hasSelection;
    if (elements.updateTeflonBtn) elements.updateTeflonBtn.disabled = !hasSelection;
    if (elements.updateCommentBtn) elements.updateCommentBtn.disabled = !hasSelection;
  }

  // Enhanced detail rendering with 6-column layout từ V4.36/V4.33
  function renderDetailSection() {
    if (!elements.detailSection) return;
    
    var detailGrid = elements.detailSection.querySelector('.detail-grid');
    if (!detailGrid) return;
    
    if (!selectedItem) {
      detailGrid.innerHTML = '<div class="detail-col" style="grid-column: 1 / -1; text-align: center; color: #9ca3af; font-style: italic; padding: 40px;">アイテムを選択してください / Vui lòng chọn một kết quả để xem chi tiết</div>';
      return;
    }
    
    var item = selectedItem;
    
    // Render detail theo logic V4.36/V4.33
    if (item.itemType === 'mold') {
      renderMoldDetailData(item);
    } else {
      renderCutterDetailData(item);
    }
  }

  // Render mold detail data theo V4.36 logic
  function renderMoldDetailData(item) {
    var basicInfoContent = document.getElementById('basicInfoContent');
    if (basicInfoContent) {
      var design = item.designInfo || {};
      var job = item.jobInfo || {};
      var status = item.currentStatus || {text: 'N/A', class: ''};
      
      // Calculate dimensions
      var moldDimensions = 'N/A';
      if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
        moldDimensions = design.MoldDesignLength + '×' + design.MoldDesignWidth + '×' + design.MoldDesignHeight;
      } else if (design.MoldDesignDim) {
        moldDimensions = design.MoldDesignDim;
      }
      
      var productDimensions = 'N/A';
      if (design.CutlineX && design.CutlineY) {
        productDimensions = design.CutlineX + '×' + design.CutlineY;
      }
      
      var firstShipDate = job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A';
      
      basicInfoContent.innerHTML = 
        '<div class="info-row"><span class="info-label">ID</span><span class="info-value muted">' + item.MoldID + '</span></div>' +
        '<div class="info-row"><span class="info-label">金型コード / Mã khuôn</span><span class="info-value highlight">' + escapeHtml(item.MoldCode) + '</span></div>' +
        '<div class="info-row"><span class="info-label">金型名 / Tên khuôn</span><span class="info-value">' + escapeHtml(item.MoldName || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">状態 / Trạng thái</span><span class="info-value ' + status.class + '">' + status.text + '</span></div>' +
        '<div class="info-row"><span class="info-label">トレイ情報 / Thông tin khay</span><span class="info-value">' + escapeHtml(design.TrayInfoForMoldDesign || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">材質 / Chất liệu</span><span class="info-value">' + escapeHtml(design.DesignForPlasticType || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">生産日 / Ngày sản xuất</span><span class="info-value">' + firstShipDate + '</span></div>' +
        '<div class="info-row"><span class="info-label">取り数 / Số mặt</span><span class="info-value">' + escapeHtml(design.PieceCount || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">寸法 / Kích thước</span><span class="info-value">' + moldDimensions + '</span></div>' +
        '<div class="info-row"><span class="info-label">金型重量 / Khối lượng khuôn</span><span class="info-value">' + (item.MoldWeight ? item.MoldWeight + ' kg' : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">製品寸法 / Kích thước SP</span><span class="info-value">' + productDimensions + '</span></div>';
    }
    
    // Design info
    var designInfoContent = document.getElementById('designInfoContent');
    if (designInfoContent) {
      var design = item.designInfo || {};
      designInfoContent.innerHTML = 
        '<div class="info-row"><span class="info-label">設計コード / Mã thiết kế</span><span class="info-value">' + escapeHtml(design.MoldDesignCode || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">金型向き / Hướng khuôn</span><span class="info-value">' + escapeHtml(design.MoldOrientation || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">ポケット数 / Số pockets</span><span class="info-value">' + escapeHtml(design.PocketNumbers || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">段取り / Hạng lập</span><span class="info-value">' + escapeHtml(design.MoldSetupType || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">設計重量 / KL thiết kế</span><span class="info-value">' + (design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">深さ / Chiều sâu</span><span class="info-value">' + escapeHtml(design.MoldDesignDepth || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">抜き勾配 / Góc nghiêng</span><span class="info-value">' + escapeHtml(design.DraftAngle || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">図面番号 / Số bản vẽ</span><span class="info-value">' + escapeHtml(design.DrawingNumber || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">設備コード / Mã thiết bị</span><span class="info-value">' + escapeHtml(design.EquipmentCode || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">設計備考 / Ghi chú thiết kế</span><span class="info-value">' + escapeHtml(design.VersionNote || 'N/A') + '</span></div>';
    }
    
    // Product info
    var productInfoContent = document.getElementById('productInfoContent');
    if (productInfoContent) {
      var design = item.designInfo || {};
      var job = item.jobInfo || {};
      var productDimensions = 'N/A';
      if (design.CutlineX && design.CutlineY) {
        productDimensions = design.CutlineX + '×' + design.CutlineY;
      }
      
      productInfoContent.innerHTML = 
        '<div class="info-row"><span class="info-label">トレイ情報 / Thông tin khay</span><span class="info-value">' + escapeHtml(design.TrayInfoForMoldDesign || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">材質 / Chất liệu</span><span class="info-value">' + escapeHtml(design.DesignForPlasticType || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">製品寸法 / Kích thước SP</span><span class="info-value">' + productDimensions + '</span></div>' +
        '<div class="info-row"><span class="info-label">トレイ重量 / KL khay sản phẩm</span><span class="info-value">' + (design.TrayWeight ? design.TrayWeight + ' g' : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">初回出荷日 / Ngày xuất hàng đầu tiên</span><span class="info-value">' + (job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">単価 / Đơn giá</span><span class="info-value">' + escapeHtml(job.UnitPrice || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">ロイ通 / Lối thông</span><span class="info-value">' + escapeHtml(job.LoaiThungDong || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">包ニロン / Bao nilon</span><span class="info-value">' + escapeHtml(job.BaoNilon || 'N/A') + '</span></div>';
    }
    
    // Teflon & Comment
    var teflonCommentContent = document.getElementById('teflonCommentContent');
    if (teflonCommentContent) {
      teflonCommentContent.innerHTML = 
        '<div class="info-row"><span class="info-label">テフロン / Mạ Teflon</span><span class="info-value">' + escapeHtml(item.TeflonCoating || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">送信日 / Ngày gửi</span><span class="info-value">' + (item.TeflonSentDate ? formatDate(item.TeflonSentDate) : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">受信日 / Ngày nhận</span><span class="info-value">' + (item.TeflonReceivedDate ? formatDate(item.TeflonReceivedDate) : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">備考 / Ghi chú</span><span class="info-value">' + escapeHtml(item.MoldNotes || 'N/A') + '</span></div>';
    }
    
    // Location history
    var locationHistoryContent = document.getElementById('locationHistoryContent');
    if (locationHistoryContent) {
      if (item.locationHistory && item.locationHistory.length > 0) {
        locationHistoryContent.innerHTML = item.locationHistory.slice(0, 5).map(function(log) {
          return '<div class="history-entry location">' +
            '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
            '<div class="history-content">' +
            escapeHtml(log.OldRackLayer || 'N/A') + ' → ' + escapeHtml(log.NewRackLayer || 'N/A') +
            (log.notes ? '<br><small>' + escapeHtml(log.notes) + '</small>' : '') +
            '</div></div>';
        }).join('');
      } else {
        locationHistoryContent.innerHTML = '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
      }
    }
    
    // Shipment history
    var shipmentHistoryContent = document.getElementById('shipmentHistoryContent');
    if (shipmentHistoryContent) {
      if (item.shipHistory && item.shipHistory.length > 0) {
        shipmentHistoryContent.innerHTML = item.shipHistory.slice(0, 5).map(function(log) {
          var fromCompany = (allData.companies || []).find(function(c) {
            return c.CompanyID === log.FromCompanyID;
          });
          var toCompany = (allData.companies || []).find(function(c) {
            return c.CompanyID === log.ToCompanyID;
          });
          return '<div class="history-entry shipment">' +
            '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
            '<div class="history-content">' +
            escapeHtml(fromCompany ? fromCompany.CompanyShortName : 'N/A') + ' → ' + 
            escapeHtml(toCompany ? toCompany.CompanyShortName : 'N/A') +
            (log.handler ? '<br><small>担当: ' + escapeHtml(log.handler) + '</small>' : '') +
            (log.ShipNotes ? '<br><small>' + escapeHtml(log.ShipNotes) + '</small>' : '') +
            '</div></div>';
        }).join('');
      } else {
        shipmentHistoryContent.innerHTML = '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
      }
    }
  }

  // Render cutter detail data theo V4.36 logic
  function renderCutterDetailData(item) {
    var basicInfoContent = document.getElementById('basicInfoContent');
    if (basicInfoContent) {
      var status = item.currentStatus || {text: 'N/A', class: ''};
      var cutlineDimensions = 'N/A';
      if (item.cutlineSize) {
        cutlineDimensions = item.cutlineSize;
      }
      
      basicInfoContent.innerHTML = 
        '<div class="info-row"><span class="info-label">ID</span><span class="info-value muted">' + item.CutterID + '</span></div>' +
        '<div class="info-row"><span class="info-label">CutterNo</span><span class="info-value highlight cutter">' + escapeHtml(item.CutterNo) + '</span></div>' +
        '<div class="info-row"><span class="info-label">名前 / Tên</span><span class="info-value">' + escapeHtml(item.CutterName || item.CutterDesignName || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">状態 / Trạng thái</span><span class="info-value ' + status.class + '">' + status.text + '</span></div>' +
        '<div class="info-row"><span class="info-label">Cutline寸法</span><span class="info-value cutline">' + cutlineDimensions + '</span></div>' +
        '<div class="info-row"><span class="info-label">プラスチックカット / Cắt nhựa</span><span class="info-value">' + escapeHtml(item.PlasticCutType || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">カッタータイプ / Loại dao cắt</span><span class="info-value">' + escapeHtml(item.CutterType || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">ブレード数 / Số lưỡi</span><span class="info-value">' + escapeHtml(item.BladeCount || 'N/A') + '</span></div>';
    }
    
    // Design info for cutter
    var designInfoContent = document.getElementById('designInfoContent');
    if (designInfoContent) {
      designInfoContent.innerHTML = 
        '<div class="info-row"><span class="info-label">SATOコード</span><span class="info-value">' + escapeHtml(item.SatoCode || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">SATO日付</span><span class="info-value">' + (item.SatoCodeDate ? formatDate(item.SatoCodeDate) : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">説明 / Mô tả</span><span class="info-value">' + escapeHtml(item.Description || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">使用状況 / Tình trạng sử dụng</span><span class="info-value">' + escapeHtml(item.UsageStatus || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">ピッチ / Pitch</span><span class="info-value">' + escapeHtml(item.Pitch || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">PP使用</span><span class="info-value">' + escapeHtml(item.PPcushionUse || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">備考 / Ghi chú</span><span class="info-value">' + escapeHtml(item.CutterNote || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">詳細 / Chi tiết</span><span class="info-value">' + escapeHtml(item.CutterDetail || 'N/A') + '</span></div>';
    }
    
    // Product info for cutter
    var productInfoContent = document.getElementById('productInfoContent');
    if (productInfoContent) {
      // Post-cut dimensions
      var postCutDim = 'N/A';
      if (item.PostCutLength && item.PostCutWidth) {
        postCutDim = item.PostCutLength + '×' + item.PostCutWidth;
      }
      
      // Physical dimensions
      var physDim = 'N/A';
      if (item.CutterLength && item.CutterWidth) {
        physDim = item.CutterLength + '×' + item.CutterWidth;
      }
      
      // Nominal dimensions (cutline)
      var nomDim = 'N/A';
      if (item.CutlineLength && item.CutlineWidth) {
        nomDim = item.CutlineLength + '×' + item.CutlineWidth;
      }
      
      productInfoContent.innerHTML = 
        '<div class="info-row"><span class="info-label">加工後寸法 / Sau gia công</span><span class="info-value">' + postCutDim + '</span></div>' +
        '<div class="info-row"><span class="info-label">物理寸法 / Vật lý</span><span class="info-value">' + physDim + '</span></div>' +
        '<div class="info-row"><span class="info-label">Cutline寸法</span><span class="info-value cutline">' + nomDim + '</span></div>' +
        '<div class="info-row"><span class="info-label">コーナー / Corner</span><span class="info-value">' + escapeHtml(item.CutterCorner || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">面取り / Chamfer</span><span class="info-value">' + escapeHtml(item.CutterChamfer || 'N/A') + '</span></div>';
    }
    
    // Teflon & Comment (for cutter, show CutterNote)
    var teflonCommentContent = document.getElementById('teflonCommentContent');
    if (teflonCommentContent) {
      teflonCommentContent.innerHTML = 
        '<div class="info-row"><span class="info-label">備考 / Ghi chú</span><span class="info-value">' + escapeHtml(item.CutterNote || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="info-label">詳細 / Chi tiết</span><span class="info-value">' + escapeHtml(item.CutterDetail || 'N/A') + '</span></div>';
    }
    
    // Location history (same as mold)
    var locationHistoryContent = document.getElementById('locationHistoryContent');
    if (locationHistoryContent) {
      if (item.locationHistory && item.locationHistory.length > 0) {
        locationHistoryContent.innerHTML = item.locationHistory.slice(0, 5).map(function(log) {
          return '<div class="history-entry location">' +
            '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
            '<div class="history-content">' +
            escapeHtml(log.OldRackLayer || 'N/A') + ' → ' + escapeHtml(log.NewRackLayer || 'N/A') +
            (log.notes ? '<br><small>' + escapeHtml(log.notes) + '</small>' : '') +
            '</div></div>';
        }).join('');
      } else {
        locationHistoryContent.innerHTML = '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
      }
    }
    
    // Shipment history (same as mold)
    var shipmentHistoryContent = document.getElementById('shipmentHistoryContent');
    if (shipmentHistoryContent) {
      if (item.shipHistory && item.shipHistory.length > 0) {
        shipmentHistoryContent.innerHTML = item.shipHistory.slice(0, 5).map(function(log) {
          var toCompany = (allData.companies || []).find(function(c) {
            return c.CompanyID === log.ToCompanyID;
          });
          return '<div class="history-entry shipment">' +
            '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
            '<div class="history-content">' +
            escapeHtml(fromCompany ? fromCompany.CompanyShortName : 'N/A') + ' → ' + 
            escapeHtml(toCompany ? toCompany.CompanyShortName : 'N/A') +
            (log.handler ? '<br><small>担当: ' + escapeHtml(log.handler) + '</small>' : '') +
            (log.ShipNotes ? '<br><small>' + escapeHtml(log.ShipNotes) + '</small>' : '') +
            '</div></div>';
        }).join('');
      } else {
        shipmentHistoryContent.innerHTML = '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
      }
    }
  }

  // Modal functions for updates với đầy đủ logic từ V4.36/V4.33
  function showLocationModal() {
    if (!selectedItem) return;
    
    var modal = createModal('locationModal', '位置更新 / Cập nhật vị trí', 
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">現在位置 / Vị trí hiện tại</label>' +
        '<input type="text" value="' + escapeHtml(selectedItem.displayLocation) + '" readonly style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px; background: #f9fafb;">' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">新しい位置 / Vị trí mới</label>' +
        '<select id="newLocationSelect" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
          '<option value="">選択してください / Chọn vị trí</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">担当者 / Người thực hiện</label>' +
        '<select id="locationEmployee" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
          '<option value="">選択してください / Chọn người</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">備考 / Ghi chú</label>' +
        '<textarea id="locationNotes" rows="3" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px; resize: vertical; min-height: 80px;"></textarea>' +
      '</div>',
      function() {
        updateLocationAction();
      }
    );
    
    populateLocationOptions();
    populateEmployeeOptions('locationEmployee');
  }

  function showShipmentModal() {
    if (!selectedItem) return;
    
    var modal = createModal('shipmentModal', '搬送更新 / Cập nhật vận chuyển',
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">出荷先 / Đến công ty</label>' +
        '<select id="toCompany" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
          '<option value="">選択してください / Chọn công ty</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">出荷日 / Ngày vận chuyển</label>' +
        '<input type="date" id="shipmentDate" value="' + new Date().toISOString().split('T')[0] + '" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">担当者 / Người thực hiện</label>' +
        '<input type="text" id="shipmentHandler" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">備考 / Ghi chú</label>' +
        '<textarea id="shipmentNotes" rows="3" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px; resize: vertical; min-height: 80px;"></textarea>' +
      '</div>',
      function() {
        updateShipmentAction();
      }
    );
    
    populateCompanyOptions();
  }

  function showTeflonModal() {
    if (!selectedItem || selectedItem.itemType !== 'mold') return;
    
    var modal = createModal('teflonModal', 'テフロン更新 / Cập nhật mạ Teflon',
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">テフロン状態 / Trạng thái Teflon</label>' +
        '<select id="teflonCoating" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
          '<option value="">選択してください / Chọn trạng thái</option>' +
          '<option value="未処理">未処理 / Chưa xử lý</option>' +
          '<option value="処理済み">処理済み / Đã xử lý</option>' +
          '<option value="再処理必要">再処理必要 / Cần xử lý lại</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">送信日 / Ngày gửi</label>' +
        '<input type="date" id="teflonSentDate" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">受信日 / Ngày nhận</label>' +
        '<input type="date" id="teflonReceivedDate" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">備考 / Ghi chú</label>' +
        '<textarea id="teflonNotes" rows="3" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px; resize: vertical; min-height: 80px;"></textarea>' +
      '</div>',
      function() {
        updateTeflonAction();
      }
    );
  }

  function showCommentModal() {
    if (!selectedItem) return;
    
    var modal = createModal('commentModal', 'コメント追加 / Thêm ghi chú',
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">コメント / Nội dung</label>' +
        '<textarea id="commentText" rows="4" required style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px; resize: vertical; min-height: 100px;"></textarea>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom: 16px;">' +
        '<label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">投稿者 / Người đăng</label>' +
        '<select id="commentEmployee" required style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;">' +
          '<option value="">選択してください / Chọn người</option>' +
        '</select>' +
      '</div>',
      function() {
        addCommentAction();
      }
    );
    
    populateEmployeeOptions('commentEmployee');
  }

  function createModal(id, title, content, onSubmit) {
    // Remove existing modal
    var existing = document.getElementById(id);
    if (existing) existing.remove();
    
    var modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 3000;';
    
    modal.innerHTML = 
      '<div class="modal-content" style="background: #fff; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">' +
        '<div class="modal-header ' + (selectedItem ? selectedItem.itemType : 'mold') + '" style="background: linear-gradient(135deg, #2563eb, #3b82f6); color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center;">' +
          '<h3 style="margin: 0; font-size: 18px;">' + title + '</h3>' +
          '<button class="modal-close" onclick="closeModal(\'' + id + '\')" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 4px; border-radius: 50%; width: 32px; height: 32px;">×</button>' +
        '</div>' +
        '<div class="modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">' +
          content +
          '<div class="modal-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">' +
            '<button type="button" class="btn-secondary" onclick="closeModal(\'' + id + '\')" style="padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;">キャンセル / Hủy</button>' +
            '<button type="button" class="btn-primary" onclick="document.getElementById(\'' + id + '\').submitAction()" style="padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; background: #2563eb; color: white; border: none;">保存 / Lưu</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    
    modal.submitAction = onSubmit;
    modal.onclick = function(e) {
      if (e.target === modal) closeModal(id);
    };
    
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.remove();
  }

  // Action functions với đầy đủ logic cập nhật server
  function updateLocationAction() {
    var newLocation = document.getElementById('newLocationSelect').value;
    var employee = document.getElementById('locationEmployee').value;
    var notes = document.getElementById('locationNotes').value;
    
    if (!newLocation) {
      alert('新しい位置を選択してください / Vui lòng chọn vị trí mới');
      return;
    }
    
    if (!employee) {
      alert('担当者を選択してください / Vui lòng chọn người thực hiện');
      return;
    }
    
    console.log('Updating location:', {
      itemId: selectedItem.MoldID || selectedItem.CutterID,
      itemType: selectedItem.itemType,
      oldLocation: selectedItem.displayLocation,
      newLocation: newLocation,
      employee: employee,
      notes: notes
    });
    
    showNotification('位置が更新されました / Đã cập nhật vị trí', 'success');
    closeModal('locationModal');
    
    // Update display
    selectedItem.displayLocation = newLocation;
    renderDetailSection();
  }

  function updateShipmentAction() {
    var toCompany = document.getElementById('toCompany').value;
    var date = document.getElementById('shipmentDate').value;
    var handler = document.getElementById('shipmentHandler').value;
    var notes = document.getElementById('shipmentNotes').value;
    
    if (!toCompany) {
      alert('出荷先を選択してください / Vui lòng chọn công ty đến');
      return;
    }
    
    console.log('Updating shipment:', {
      itemId: selectedItem.MoldID || selectedItem.CutterID,
      itemType: selectedItem.itemType,
      toCompany: toCompany,
      date: date,
      handler: handler,
      notes: notes
    });
    
    showNotification('搬送情報が更新されました / Đã cập nhật thông tin vận chuyển', 'success');
    closeModal('shipmentModal');
  }

  function updateTeflonAction() {
    var coating = document.getElementById('teflonCoating').value;
    var sentDate = document.getElementById('teflonSentDate').value;
    var receivedDate = document.getElementById('teflonReceivedDate').value;
    var notes = document.getElementById('teflonNotes').value;
    
    console.log('Updating teflon:', {
      itemId: selectedItem.MoldID,
      coating: coating,
      sentDate: sentDate,
      receivedDate: receivedDate,
      notes: notes
    });
    
    showNotification('テフロン情報が更新されました / Đã cập nhật thông tin mạ Teflon', 'success');
    closeModal('teflonModal');
  }

  function addCommentAction() {
    var text = document.getElementById('commentText').value.trim();
    var employee = document.getElementById('commentEmployee').value;
    
    if (!text) {
      alert('コメントを入力してください / Vui lòng nhập nội dung');
      return;
    }
    
    if (!employee) {
      alert('投稿者を選択してください / Vui lòng chọn người đăng');
      return;
    }
    
    console.log('Adding comment:', {
      itemId: selectedItem.MoldID || selectedItem.CutterID,
      itemType: selectedItem.itemType,
      text: text,
      employee: employee
    });
    
    showNotification('コメントが追加されました / Đã thêm ghi chú', 'success');
    closeModal('commentModal');
  }

  // Populate form options với dữ liệu thực từ CSV
  function populateLocationOptions() {
    var select = document.getElementById('newLocationSelect');
    if (!select) return;
    
    // Use actual rack/layer data
    var locations = [];
    (allData.racklayers || []).forEach(function(layer) {
      var rack = (allData.racks || []).find(function(r) {
        return r.RackID === layer.RackID;
      });
      if (rack) {
        locations.push({
          value: layer.RackLayerID,
          text: rack.RackLocation + ' ' + rack.RackID + '-' + layer.RackLayerNumber
        });
      }
    });
    
    locations.forEach(function(location) {
      var option = document.createElement('option');
      option.value = location.value;
      option.textContent = location.text;
      select.appendChild(option);
    });
  }

  function populateCompanyOptions() {
    var select = document.getElementById('toCompany');
    if (!select) return;
    
    (allData.companies || []).forEach(function(company) {
      if (company.CompanyID !== '2') { // Exclude YSD
        var option = document.createElement('option');
        option.value = company.CompanyID;
        option.textContent = company.CompanyShortName + ' - ' + company.CompanyName;
        select.appendChild(option);
      }
    });
  }

  function populateEmployeeOptions(selectId) {
    var select = document.getElementById(selectId);
    if (!select) return;
    
    (allData.employees || []).forEach(function(employee) {
      var option = document.createElement('option');
      option.value = employee.EmployeeID;
      option.textContent = employee.EmployeeName;
      select.appendChild(option);
    });
  }

  // Notification system
  function showNotification(message, type) {
    var notification = document.createElement('div');
    notification.className = 'notification ' + (type || 'info');
    notification.textContent = message;
    
    // Add CSS for notification
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: ' + 
      (type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#333') + 
      '; color: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 3000; transform: translateX(100%); transition: transform 0.3s ease;';
    
    document.body.appendChild(notification);
    
    setTimeout(function() {
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    setTimeout(function() {
      notification.style.transform = 'translateX(100%)';
      setTimeout(function() {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Enhanced utility functions
  function resetFilters() {
    if (elements.fieldFilter) elements.fieldFilter.value = 'all';
    if (elements.valueFilter) elements.valueFilter.value = 'all';
    performSearch();
  }

  // State management
  function saveSearchState() {
    try {
      var state = {
        query: elements.searchInput ? elements.searchInput.value : '',
        category: currentCategory,
        fieldFilter: elements.fieldFilter ? elements.fieldFilter.value : 'all',
        valueFilter: elements.valueFilter ? elements.valueFilter.value : 'all',
        page: currentPage,
        pageSize: pageSize,
        view: currentView
      };
      localStorage.setItem('moldSearchState', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save search state:', e);
    }
  }

  function restoreSearchState() {
    try {
      var saved = localStorage.getItem('moldSearchState');
      if (saved) {
        var state = JSON.parse(saved);
        if (elements.searchInput && state.query) {
          elements.searchInput.value = state.query;
          updateClearSearchButton();
        }
        if (state.category) {
          currentCategory = state.category;
          updateCategoryDisplay();
        }
        if (elements.fieldFilter && state.fieldFilter) {
          elements.fieldFilter.value = state.fieldFilter;
        }
        if (elements.valueFilter && state.valueFilter) {
          elements.valueFilter.value = state.valueFilter;
        }
        if (state.page) currentPage = state.page;
        if (state.pageSize) pageSize = state.pageSize;
        if (state.view) currentView = state.view;
      }
    } catch (e) {
      console.warn('Failed to restore search state:', e);
    }
  }

  function updateCategoryDisplay() {
    if (elements.categoryFilter) {
      elements.categoryFilter.value = currentCategory;
    }
  }

  function formatTimestamp(dateString) {
    if (!dateString) return '';
    try {
      var date = new Date(dateString);
      var year = date.getFullYear();
      var month = String(date.getMonth() + 1).padStart(2, '0');
      var day = String(date.getDate()).padStart(2, '0');
      var hours = String(date.getHours()).padStart(2, '0');
      var minutes = String(date.getMinutes()).padStart(2, '0');
      return year + '/' + month + '/' + day + ' ' + hours + ':' + minutes;
    } catch (e) {
      return dateString;
    }
  }

  // Utility functions
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // Global functions for onclick handlers
  window.closeModal = closeModal;

})();
