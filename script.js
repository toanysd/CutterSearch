// script.js V4.381 - iPad 4 Optimized - Enhanced UI Fixes - Complete Professional
// Dựa trên V4.38, sửa logic theo yêu cầu V4.381

// =================== CẤU HÌNH VÀ BIẾN TOÀN CỤC ===================
var GITHUBBASEURL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";
var APIBASEURL = "https://ysd-moldcutter-backend.onrender.com";

// Global variables từ V4.31 working version
var allData = {
  molds: [], cutters: [], customers: [], molddesign: [], moldcutter: [],
  shiplog: [], locationlog: [], employees: [], racklayers: [], racks: [],
  companies: [], usercomments: [], jobs: [], processingitems: []
};

var filteredData = [];
var selectedItems = new Set();
var currentPage = 1;
var pageSize = 50;
var sortField = '';
var sortDirection = 'asc';
var searchTimeout = null;
var currentCategory = 'all';
var currentView = 'table';
var selectedItem = null;

// Search history & suggestions V4.31 working logic
var searchHistory = [];
var suggestionIndex = -1;
var isShowingSuggestions = false;
var hideTimeout = null;

// Enhanced filter fields từ V4.31
var FILTERFIELDS = {
  all: [
    {value: 'displayCode', text: 'コード / Mã'},
    {value: 'displayName', text: '名前 / Tên'},
    {value: 'displayDimensions', text: 'サイズ / Kích thước'},
    {value: 'displayLocation', text: '位置 / Vị trí'},
    {value: 'displayCustomer', text: '顧客 / Khách hàng'},
    {value: 'rackId', text: 'RackID'},
    {value: 'drawingNumber', text: '図面番号 / Số bản vẽ'},
    {value: 'equipmentCode', text: '設備コード / Mã thiết bị'},
    {value: 'plasticType', text: 'プラスチック / Nhựa'},
    {value: 'moldSetupType', text: 'セットアップ / Thiết lập'},
    {value: 'pieceCount', text: '取り数 / Số miếng'},
    {value: 'cutlineSize', text: 'Cutline'},
    {value: 'storageCompany', text: '保管会社 / Công ty lưu trữ'},
    {value: 'moldStatus', text: '状態 / Trạng thái'},
    {value: 'TeflonCoating', text: 'テフロン / Teflon'},
    {value: 'MoldNotes', text: '備考 / Ghi chú'},
    {value: 'CutterNote', text: '抜型備考 / Ghi chú dao cắt'}
  ],
  mold: [
    {value: 'displayCode', text: 'コード / Mã'},
    {value: 'displayName', text: '名前 / Tên'},
    {value: 'displayDimensions', text: 'サイズ / Kích thước'},
    {value: 'rackId', text: 'RackID'},
    {value: 'drawingNumber', text: '図面番号 / Số bản vẽ'},
    {value: 'equipmentCode', text: '設備コード / Mã thiết bị'},
    {value: 'plasticType', text: 'プラスチック / Nhựa'},
    {value: 'moldSetupType', text: 'セットアップ / Thiết lập'},
    {value: 'pieceCount', text: '取り数 / Số miếng'},
    {value: 'cutlineSize', text: 'Cutline'},
    {value: 'storageCompany', text: '保管会社 / Công ty lưu trữ'},
    {value: 'moldStatus', text: '状態 / Trạng thái'},
    {value: 'TeflonCoating', text: 'テフロン / Teflon'},
    {value: 'MoldNotes', text: '備考 / Ghi chú'}
  ],
  cutter: [
    {value: 'displayCode', text: 'CutterNo'},
    {value: 'displayName', text: '名前 / Tên'},
    {value: 'cutlineSize', text: 'Cutline'},
    {value: 'rackId', text: 'RackID'},
    {value: 'plasticCutType', text: 'プラスチックカット / Cắt nhựa'},
    {value: 'cutterType', text: '抜型タイプ / Loại dao cắt'},
    {value: 'bladeCount', text: 'ブレード数 / Số lưỡi'},
    {value: 'storageCompany', text: '保管会社 / Công ty lưu trữ'},
    {value: 'CutterNote', text: '備考 / Ghi chú'}
  ]
};

// =================== KHỞI TẠO ỨNG DỤNG ===================
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing V4.381 Application - Enhanced UI Fixes...');
  
  // Load search history V4.31 working method
  loadSearchHistory();
  
  // Setup search functionality
  setupSearchFunctionality();
  
  // Setup toggle functionality
  setupToggleFunctionality();
  
  // Setup action buttons
  setupActionButtons();
  
  // Prevent zoom on mobile
  preventMobileZoom();
  
  // Load data and initialize
  if (isMainPage()) {
    initializeMainPage();
  }
});

// Check if current page is main page
function isMainPage() {
  var path = window.location.pathname;
  return path.indexOf('index.html') !== -1 || path === '/' || /\/$/.test(path);
}

// Initialize main page
function initializeMainPage() {
  showLoading(true);
  loadAllData().then(function() {
    initializeFilters();
    restoreSearchState();
    performSearch();
    console.log('V4.381 Application initialized successfully');
  }).catch(function(error) {
    console.error('Initialization error', error);
    showError(error.message);
  }).finally(function() {
    showLoading(false);
  });
}

// Prevent mobile zoom
function preventMobileZoom() {
  var formElements = document.querySelectorAll('input, select, textarea');
  for (var i = 0; i < formElements.length; i++) {
    formElements[i].style.fontSize = '16px';
    formElements[i].addEventListener('focus', function() {
      this.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  }
}

// =================== SETUP TOGGLE FUNCTIONALITY ===================
function setupToggleFunctionality() {
  var toggles = document.querySelectorAll('input[name="typeToggle"]');
  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener('change', function() {
      if (this.checked) {
        toggleCategory(this.value);
      }
    });
  }
}

// =================== SETUP ACTION BUTTONS ===================
function setupActionButtons() {
  var updateLocationBtn = document.getElementById('updateLocationBtn');
  var updateShipmentBtn = document.getElementById('updateShipmentBtn');
  var updateTeflonBtn = document.getElementById('updateTeflonBtn');
  var updateCommentBtn = document.getElementById('updateCommentBtn');
  
  if (updateLocationBtn) {
    updateLocationBtn.addEventListener('click', function() {
      if (selectedItem) showLocationModal();
      else alert('アイテムを選択してください / Vui lòng chọn một mục');
    });
  }
  
  if (updateShipmentBtn) {
    updateShipmentBtn.addEventListener('click', function() {
      if (selectedItem) showShipmentModal();
      else alert('アイテムを選択してください / Vui lòng chọn một mục');
    });
  }
  
  if (updateTeflonBtn) {
    updateTeflonBtn.addEventListener('click', function() {
      if (selectedItem && selectedItem.itemType === 'mold') showTeflonModal();
      else alert('金型を選択してください / Vui lòng chọn khuôn');
    });
  }
  
  if (updateCommentBtn) {
    updateCommentBtn.addEventListener('click', function() {
      if (selectedItem) showCommentModal();
      else alert('アイテムを選択してください / Vui lòng chọn một mục');
    });
  }
}

// =================== LOADING FUNCTIONS ===================
function showLoading(show) {
  var loading = document.getElementById('loadingIndicator');
  if (loading) loading.style.display = show ? 'flex' : 'none';
}

function showError(message) {
  console.error(message);
  var errorMessage = document.getElementById('errorMessage');
  var errorText = document.getElementById('errorText');
  if (errorMessage && errorText) {
    errorText.textContent = message;
    errorMessage.style.display = 'block';
  } else {
    alert('エラー / Lỗi: ' + message);
  }
}

function showSuccess(message) {
  console.log(message);
  alert('成功 / Thành công: ' + message);
}

// =================== CSV PARSER ===================
function parseCSV(csvText) {
  var lines = csvText.split('\n').filter(function(line) { return line.trim() !== ''; });
  if (lines.length === 0) return [];
  
  var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/"/g, ''); });
  
  var data = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i];
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
    data.push(obj);
  }
  return data;
}

// =================== DATE FORMATTING ===================
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

function formatTimestamp(dateString) {
  if (!dateString) return '';
  try {
    var date = new Date(dateString);
    var year = date.getFullYear();
    var month = ('0' + (date.getMonth() + 1)).slice(-2);
    var day = ('0' + date.getDate()).slice(-2);
    var hours = ('0' + date.getHours()).slice(-2);
    var minutes = ('0' + date.getMinutes()).slice(-2);
    return year + '/' + month + '/' + day + ' ' + hours + ':' + minutes;
  } catch (e) {
    return dateString;
  }
}

// =================== ENHANCED DATA LOADING ===================
function loadAllData() {
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

  var promises = [];
  for (var i = 0; i < dataFiles.length; i++) {
    (function(fileObj) {
      promises.push(new Promise(function(resolve) {
        console.log('Loading ' + fileObj.file + '...');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', GITHUBBASEURL + fileObj.file + '?t=' + Date.now(), true);
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              var data = parseCSV(xhr.responseText);
              console.log(fileObj.file + ' loaded: ' + data.length + ' records');
              resolve({key: fileObj.key, data: data});
            } else {
              if (fileObj.required) {
                showError('Required file ' + fileObj.file + ' not found');
              } else {
                console.warn('Optional file ' + fileObj.file + ' not found');
              }
              resolve({key: fileObj.key, data: []});
            }
          }
        };
        xhr.send();
      }));
    })(dataFiles[i]);
  }

  return Promise.all(promises).then(function(results) {
    for (var i = 0; i < results.length; i++) {
      allData[results[i].key] = results[i].data;
    }
    processDataRelationships();
  });
}
// =================== ENHANCED DATA PROCESSING VỚI ĐẦY ĐỦ RELATIONSHIPS V4.381 ===================
function processDataRelationships() {
  console.log('Processing data relationships V4.381 - Enhanced UI Fixes...');
  
  // Create lookup maps theo V4.31 working logic
  var moldDesignMap = {};
  var customerMap = {};
  var companyMap = {};
  var rackMap = {};
  var rackLayerMap = {};
  var jobMap = {};
  var processingItemMap = {};
  
  // Build lookup maps for performance
  for (var i = 0; i < allData.molddesign.length; i++) {
    var d = allData.molddesign[i];
    moldDesignMap[d.MoldDesignID] = d;
  }
  
  for (var i = 0; i < allData.customers.length; i++) {
    var c = allData.customers[i];
    customerMap[c.CustomerID] = c;
  }
  
  for (var i = 0; i < allData.companies.length; i++) {
    var comp = allData.companies[i];
    companyMap[comp.CompanyID] = comp;
  }
  
  for (var i = 0; i < allData.racks.length; i++) {
    var r = allData.racks[i];
    rackMap[r.RackID] = r;
  }
  
  for (var i = 0; i < allData.racklayers.length; i++) {
    var rl = allData.racklayers[i];
    rackLayerMap[rl.RackLayerID] = rl;
  }
  
  for (var i = 0; i < allData.jobs.length; i++) {
    var j = allData.jobs[i];
    jobMap[j.MoldDesignID] = j;
  }
  
  for (var i = 0; i < allData.processingitems.length; i++) {
    var p = allData.processingitems[i];
    processingItemMap[p.ProcessingItemID] = p;
  }

  // Process molds với enhanced data relationships theo V4.31
  for (var i = 0; i < allData.molds.length; i++) {
    var mold = allData.molds[i];
    var design = moldDesignMap[mold.MoldDesignID] || {};
    var customer = customerMap[mold.CustomerID] || {};
    var company = companyMap[customer.CompanyID] || {};
    var rackLayer = rackLayerMap[mold.RackLayerID] || {};
    var rack = rackLayer.RackID ? rackMap[rackLayer.RackID] : {};
    var storageCompany = companyMap[mold.storage_company] || {};
    var job = jobMap[mold.MoldDesignID] || {};
    var processingItem = processingItemMap[job.ProcessingItemID] || {};

    // Enhanced cutline size creation từ molddesign
    var cutlineSize = '';
    if (design.CutlineX && design.CutlineY) {
      cutlineSize = design.CutlineX + '×' + design.CutlineY;
    }

    // Enhanced mold status determination - V4.381 FIX
    var moldStatus = 'Active';
    if (mold.MoldReturning === 'TRUE') {
      moldStatus = 'Returned';
    } else if (mold.MoldDisposing === 'TRUE') {
      moldStatus = 'Disposed';
    } else if (mold.MoldReturning === 'FALSE' && mold.MoldDisposing === 'FALSE') {
      moldStatus = 'In Use';
    }

    // Enrich mold object with all relationships
    mold.designInfo = design;
    mold.customerInfo = customer;
    mold.companyInfo = company;
    mold.rackLayerInfo = rackLayer;
    mold.rackInfo = rack;
    mold.storageCompanyInfo = storageCompany;
    mold.jobInfo = job;
    mold.processingItemInfo = processingItem;
    mold.relatedCutters = getRelatedCutters(mold.MoldID);
    mold.shipHistory = getShipHistory('MOLD', mold.MoldID);
    mold.locationHistory = getLocationHistory('MOLD', mold.MoldID);
    mold.currentStatus = getCurrentStatus(mold); // V4.381 FIX
    mold.displayCode = mold.MoldCode || '';
    mold.displayName = mold.MoldName || mold.MoldCode || '';
    mold.displayDimensions = createMoldDimensionString(mold, design);
    mold.displayLocation = getDisplayLocation(rackLayer, rack); // V4.381 FIX
    mold.displayCustomer = getCustomerDisplayName(customer, company);
    mold.displayStorageCompany = getStorageCompanyDisplay(mold.storage_company, companyMap);
    mold.displayRackLocation = getDisplayRackLocation(rack, rackLayer); // V4.381 FIX
    
    // Enhanced fields cho V4.31 compatibility
    mold.rackId = rackLayer.RackID || '';
    mold.drawingNumber = design.DrawingNumber || '';
    mold.equipmentCode = design.EquipmentCode || '';
    mold.plasticType = design.DesignForPlasticType || '';
    mold.moldSetupType = design.MoldSetupType || '';
    mold.pieceCount = design.PieceCount || '';
    mold.cutlineSize = cutlineSize;
    mold.storageCompany = storageCompany.CompanyShortName || storageCompany.CompanyName || '';
    mold.storageCompanyId = mold.storage_company || '';
    mold.moldStatus = moldStatus;
    
    // FIX: Đảm bảo TeflonCoating được đọc đúng từ CSV - V4.381
    mold.TeflonCoating = mold.TeflonCoating || '';
    mold.TeflonSentDate = mold.TeflonSentDate || '';
    mold.TeflonReceivedDate = mold.TeflonReceivedDate || '';
    mold.itemType = 'mold';
  }

  // Process cutters với enhanced data relationships theo V4.31
  for (var i = 0; i < allData.cutters.length; i++) {
    var cutter = allData.cutters[i];
    var customer = customerMap[cutter.CustomerID] || {};
    var company = companyMap[customer.CompanyID] || {};
    var rackLayer = rackLayerMap[cutter.RackLayerID] || {};
    var rack = rackLayer.RackID ? rackMap[rackLayer.RackID] : {};
    var storageCompany = companyMap[cutter.storage_company] || {};

    // Enhanced cutline size creation từ cutter data
    var cutlineSize = '';
    if (cutter.CutlineLength && cutter.CutlineWidth) {
      cutlineSize = cutter.CutlineLength + '×' + cutter.CutlineWidth;
      if (cutter.CutterCorner) cutlineSize += '-' + cutter.CutterCorner;
      if (cutter.CutterChamfer) cutlineSize += '-' + cutter.CutterChamfer;
    }

    var displayName = cutter.CutterName || cutter.CutterDesignName || '';

    // Enrich cutter object with all relationships
    cutter.customerInfo = customer;
    cutter.companyInfo = company;
    cutter.rackLayerInfo = rackLayer;
    cutter.rackInfo = rack;
    cutter.storageCompanyInfo = storageCompany;
    cutter.relatedMolds = getRelatedMolds(cutter.CutterID);
    cutter.shipHistory = getShipHistory('CUTTER', cutter.CutterID);
    cutter.locationHistory = getLocationHistory('CUTTER', cutter.CutterID);
    cutter.currentStatus = getCurrentStatus(cutter); // V4.381 FIX
    cutter.displayCode = cutter.CutterNo || '';
    cutter.displayName = displayName;
    cutter.displayDimensions = cutlineSize;
    cutter.displayLocation = getDisplayLocation(rackLayer, rack); // V4.381 FIX
    cutter.displayCustomer = getCustomerDisplayName(customer, company);
    cutter.displayStorageCompany = getStorageCompanyDisplay(cutter.storage_company, companyMap);
    cutter.displayRackLocation = getDisplayRackLocation(rack, rackLayer); // V4.381 FIX
    
    // Enhanced fields cho V4.31 compatibility
    cutter.rackId = rackLayer.RackID || '';
    cutter.plasticCutType = cutter.PlasticCutType || '';
    cutter.cutterType = cutter.CutterType || '';
    cutter.bladeCount = cutter.BladeCount || '';
    cutter.cutlineSize = cutlineSize;
    cutter.storageCompany = storageCompany.CompanyShortName || storageCompany.CompanyName || '';
    cutter.storageCompanyId = cutter.storage_company || '';
    cutter.itemType = 'cutter';
  }

  console.log('Processed', allData.molds.length, 'molds and', allData.cutters.length, 'cutters');
}

// =================== HELPER FUNCTIONS CHO DATA PROCESSING V4.381 ===================
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

// V4.381 FIX: Tách riêng location và rack location
function getDisplayLocation(rackLayer, rack) {
  if (rack.RackLocation && rackLayer.RackLayerNumber) {
    return rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber;
  }
  return '';
}

// V4.381 FIX: Chỉ hiển thị giá và tầng
function getDisplayRackLocation(rack, rackLayer) {
  if (rack.RackID && rackLayer.RackLayerNumber) {
    return rack.RackID + '-' + rackLayer.RackLayerNumber;
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
  if (!storageCompanyId) return {text: 'N/A', class: 'unknown'};
  var company = companyMap[storageCompanyId];
  if (!company) return {text: 'N/A', class: 'unknown'};
  var companyName = company.CompanyShortName || company.CompanyName || storageCompanyId;
  if (storageCompanyId === '2') {
    return {text: companyName, class: 'ysd'};
  }
  return {text: companyName, class: 'external'};
}

// =================== GET RELATED ITEMS V3.0 WORKING LOGIC ===================
function getRelatedCutters(moldID) {
  if (!moldID) return [];
  var relations = [];
  for (var i = 0; i < allData.moldcutter.length; i++) {
    if (allData.moldcutter[i].MoldID === moldID) {
      relations.push(allData.moldcutter[i]);
    }
  }
  var result = [];
  for (var j = 0; j < relations.length; j++) {
    for (var k = 0; k < allData.cutters.length; k++) {
      if (allData.cutters[k].CutterID === relations[j].CutterID) {
        result.push(allData.cutters[k]);
        break;
      }
    }
  }
  return result.filter(function(c) { return c && c.CutterID; });
}

function getRelatedMolds(cutterID) {
  if (!cutterID) return [];
  var relations = [];
  for (var i = 0; i < allData.moldcutter.length; i++) {
    if (allData.moldcutter[i].CutterID === cutterID) {
      relations.push(allData.moldcutter[i]);
    }
  }
  var result = [];
  for (var j = 0; j < relations.length; j++) {
    for (var k = 0; k < allData.molds.length; k++) {
      if (allData.molds[k].MoldID === relations[j].MoldID) {
        result.push(allData.molds[k]);
        break;
      }
    }
  }
  return result.filter(function(m) { return m && m.MoldID; });
}

// =================== GET SHIPPING HISTORY V3.0 WORKING ===================
function getShipHistory(itemType, itemID) {
  if (!itemID) return [];
  var result = [];
  for (var i = 0; i < allData.shiplog.length; i++) {
    var log = allData.shiplog[i];
    if (itemType === 'MOLD' && log.MoldID === itemID) {
      result.push(log);
    } else if (itemType === 'CUTTER' && log.CutterID === itemID) {
      result.push(log);
    }
  }
  result.sort(function(a, b) {
    return new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0);
  });
  return result;
}

// =================== GET LOCATION HISTORY V3.0 WORKING ===================
function getLocationHistory(itemType, itemID) {
  if (!itemID) return [];
  var result = [];
  for (var i = 0; i < allData.locationlog.length; i++) {
    var log = allData.locationlog[i];
    if (itemType === 'MOLD' && log.MoldID === itemID) {
      result.push(log);
    } else if (itemType === 'CUTTER' && log.CutterID === itemID) {
      result.push(log);
    }
  }
  result.sort(function(a, b) {
    return new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0);
  });
  return result;
}

// =================== GET CURRENT STATUS V4.381 FIX ===================
function getCurrentStatus(item) {
  // V4.381 FIX: Không dùng shipping status, chỉ dùng physical status
  if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
    return {status: 'returned', text: '返却済み / Đã trả lại', class: 'status-physical returned'};
  }
  if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
    return {status: 'disposed', text: '廃棄済み / Đã hủy bỏ', class: 'status-physical disposed'};
  }
  
  // V4.381 FIX: Nếu không có trạng thái đặc biệt, hiển thị ghi chú nếu có
  if (item.MoldNotes && item.MoldNotes.trim()) {
    return {status: 'notes', text: item.MoldNotes.trim(), class: 'status-physical notes'};
  }
  
  // Mặc định là Active
  return {status: 'active', text: '利用可能 / Có sẵn', class: 'status-physical active'};
}

// =================== USER COMMENTS FUNCTIONS - FIX THEO V4.31 ===================
function getMoldUserCommentsFromServer(moldId) {
  console.log('=== DEBUG MOLD COMMENTS V4.381 ===');
  console.log('Looking for comments for moldId:', moldId);
  console.log('allData.usercomments total:', allData.usercomments ? allData.usercomments.length : 0);
  
  if (!allData.usercomments || allData.usercomments.length === 0) {
    console.warn('No usercomments data available');
    return [];
  }
  
  var serverComments = [];
  for (var i = 0; i < allData.usercomments.length; i++) {
    var comment = allData.usercomments[i];
    
    // Enhanced matching - check both string and number
    var itemIdMatch = comment.ItemID === moldId || 
                     comment.ItemID === moldId.toString() ||
                     comment.ItemID.toString() === moldId.toString();
    
    // Enhanced type matching - case insensitive, allow empty
    var itemTypeMatch = !comment.ItemType || 
                       comment.ItemType.toLowerCase() === 'mold' ||
                       comment.ItemType === 'mold' ||
                       comment.ItemType === '';
    
    // Enhanced status matching - allow empty or active
    var statusMatch = !comment.CommentStatus || 
                     comment.CommentStatus === 'active' ||
                     comment.CommentStatus === 'Active' ||
                     comment.CommentStatus === '';
    
    console.log('Checking comment:', {
      ItemID: comment.ItemID,
      ItemType: comment.ItemType,
      CommentStatus: comment.CommentStatus,
      itemIdMatch: itemIdMatch,
      itemTypeMatch: itemTypeMatch,
      statusMatch: statusMatch
    });
    
    if (itemIdMatch && itemTypeMatch && statusMatch) {
      serverComments.push(comment);
    }
  }
  
  // Sort by date
  serverComments.sort(function(a, b) {
    return new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0);
  });
  
  console.log('Final mold comments found:', serverComments.length);
  console.log('=== END DEBUG ===');
  
  return serverComments;
}

function getCutterUserCommentsFromServer(cutterId) {
  console.log('=== DEBUG CUTTER COMMENTS V4.381 ===');
  console.log('Looking for comments for cutterId:', cutterId);
  console.log('allData.usercomments total:', allData.usercomments ? allData.usercomments.length : 0);
  
  if (!allData.usercomments || allData.usercomments.length === 0) {
    console.warn('No usercomments data available');
    return [];
  }
  
  var serverComments = [];
  for (var i = 0; i < allData.usercomments.length; i++) {
    var comment = allData.usercomments[i];
    
    var itemIdMatch = comment.ItemID === cutterId || 
                     comment.ItemID === cutterId.toString() ||
                     comment.ItemID.toString() === cutterId.toString();
    
    var itemTypeMatch = !comment.ItemType || 
                       comment.ItemType.toLowerCase() === 'cutter' ||
                       comment.ItemType === 'cutter' ||
                       comment.ItemType === '';
    
    var statusMatch = !comment.CommentStatus || 
                     comment.CommentStatus === 'active' ||
                     comment.CommentStatus === 'Active' ||
                     comment.CommentStatus === '';
    
    if (itemIdMatch && itemTypeMatch && statusMatch) {
      serverComments.push(comment);
    }
  }
  
  serverComments.sort(function(a, b) {
    return new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0);
  });
  
  console.log('Final cutter comments found:', serverComments.length);
  console.log('=== END DEBUG ===');
  
  return serverComments;
}

// =================== SERVER INTEGRATION FUNCTIONS V3.0 BACKEND LOGIC ===================
function callBackendApi(endpoint, payload) {
  return new Promise(function(resolve, reject) {
    console.log('FRONTEND V4.381: Calling API', APIBASEURL + endpoint, 'with payload:', payload);
    
    var xhr = new XMLHttpRequest();
    xhr.open('POST', APIBASEURL + endpoint, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            console.log('FRONTEND V4.381: API call successful', data);
            resolve(data);
          } catch (e) {
            resolve({success: true, message: 'Operation completed'});
          }
        } else {
          var errorText;
          try {
            errorText = xhr.responseText;
          } catch (e) {
            errorText = 'HTTP ' + xhr.status;
          }
          reject(new Error('Server error ' + xhr.status + ': ' + errorText));
        }
      }
    };
    xhr.onerror = function() {
      reject(new Error('Network error'));
    };
    xhr.send(JSON.stringify(payload));
  });
}
// =================== SEARCH FUNCTIONALITY V4.381 ===================
function setupSearchFunctionality() {
  var searchInput = document.getElementById('searchInput');
  if (!searchInput) {
    console.warn('Search input not found');
    return;
  }
  
  searchInput.addEventListener('input', handleSearchInput);
  searchInput.addEventListener('keydown', handleSearchKeydown);
  searchInput.addEventListener('focus', function() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    setTimeout(function() {
      if (document.activeElement === searchInput) {
        showSearchSuggestions();
      }
    }, 100);
  });
  
  searchInput.addEventListener('blur', function() {
    hideSearchSuggestions(false);
  });
  
  console.log('Search functionality setup completed');
}

function handleSearchInput() {
  updateClearSearchButton();
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  searchTimeout = setTimeout(function() {
    performSearch();
    updateSearchSuggestions();
  }, 300);
}

function updateClearSearchButton() {
  var searchInput = document.getElementById('searchInput');
  var clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput && clearBtn) {
    var hasValue = searchInput.value.trim().length > 0;
    clearBtn.style.display = hasValue ? 'flex' : 'none';
  }
}

function clearSearch() {
  var searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    updateClearSearchButton();
    hideSearchSuggestions(true);
    performSearch();
    searchInput.focus();
  }
}

function handleSearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    hideSearchSuggestions(true);
    performSearch();
  } else if (event.key === 'Escape') {
    hideSearchSuggestions(true);
  }
}

// =================== SEARCH HISTORY & SUGGESTIONS ===================
function loadSearchHistory() {
  try {
    var saved = localStorage.getItem('moldSearchHistory');
    if (saved) {
      searchHistory = JSON.parse(saved);
      if (searchHistory.length > 20) {
        searchHistory = searchHistory.slice(-20);
      }
    }
  } catch (e) {
    console.warn('Failed to load search history', e);
    searchHistory = [];
  }
}

function saveSearchHistory() {
  try {
    localStorage.setItem('moldSearchHistory', JSON.stringify(searchHistory));
  } catch (e) {
    console.warn('Failed to save search history', e);
  }
}

function addToSearchHistory(query) {
  if (!query || query.trim().length < 2) return;
  
  var trimmedQuery = query.trim();
  var now = new Date();
  
  // Remove existing entry if exists
  searchHistory = searchHistory.filter(function(item) {
    return item.query !== trimmedQuery;
  });
  
  // Add new entry at the end
  searchHistory.push({
    query: trimmedQuery,
    timestamp: now.toISOString(),
    count: 1,
    results: filteredData.length
  });
  
  // Keep only last 20 searches
  if (searchHistory.length > 20) {
    searchHistory = searchHistory.slice(-20);
  }
  
  saveSearchHistory();
}

function showSearchSuggestions() {
  var searchInput = document.getElementById('searchInput');
  var suggestionsContainer = document.getElementById('searchSuggestions');
  if (!searchInput || !suggestionsContainer) {
    return;
  }
  
  var query = searchInput.value.trim();
  
  // Show suggestions container
  suggestionsContainer.style.display = 'block';
  isShowingSuggestions = true;
  
  // Clear hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  updateSearchSuggestions(query);
}

function hideSearchSuggestions(immediate) {
  var suggestionsContainer = document.getElementById('searchSuggestions');
  if (!suggestionsContainer) return;
  
  if (immediate) {
    suggestionsContainer.style.display = 'none';
    isShowingSuggestions = false;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  } else {
    hideTimeout = setTimeout(function() {
      suggestionsContainer.style.display = 'none';
      isShowingSuggestions = false;
    }, 150);
  }
}

function updateSearchSuggestions(query) {
  var suggestionsList = document.getElementById('suggestionsList');
  if (!suggestionsList) return;
  
  var html = '';
  
  // Show search history
  var history = getRecentSearchHistory();
  if (history.length > 0) {
    html += '<div class="suggestions-section">';
    html += '<div class="suggestions-section-title">履歴 / Lịch sử</div>';
    history.forEach(function(item) {
      var highlightedQuery = query ? highlightMatch(item.query, query) : item.query;
      html += '<div class="suggestion-item" onclick="selectSuggestion(\'' + escapeHtml(item.query) + '\')">';
      html += '<div class="suggestion-text">' + highlightedQuery + '</div>';
      html += '<div class="suggestion-meta">';
      html += '<span class="suggestion-count">' + item.results + '</span>';
      html += '<span class="suggestion-time">' + formatRelativeTime(item.timestamp) + '</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  
  // Show smart suggestions based on current data
  if (query.length >= 1) {
    var smartSuggestions = generateSmartSuggestions(query);
    if (smartSuggestions.length > 0) {
      html += '<div class="suggestions-section">';
      html += '<div class="suggestions-section-title">候補 / Gợi ý</div>';
      smartSuggestions.forEach(function(suggestion) {
        var highlightedSuggestion = highlightMatch(suggestion, query);
        html += '<div class="suggestion-item" onclick="selectSuggestion(\'' + escapeHtml(suggestion) + '\')">';
        html += '<div class="suggestion-text">' + highlightedSuggestion + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
  }
  
  if (html === '') {
    html = '<div class="no-suggestions">候補なし / Không có gợi ý</div>';
  }
  
  suggestionsList.innerHTML = html;
}

function generateSmartSuggestions(query) {
  var suggestions = {};
  var queryLower = query.toLowerCase();
  
  // Search in all data for matching patterns
  var allItems = allData.molds.concat(allData.cutters);
  allItems.forEach(function(item) {
    // Check various fields for partial matches
    var fields = [
      item.displayCode, item.displayName, item.displayDimensions, item.cutlineSize,
      item.designInfo && item.designInfo.DrawingNumber,
      item.designInfo && item.designInfo.EquipmentCode,
      item.MoldCode, item.CutterNo
    ].filter(function(field) { return field && field.toString().trim(); });
    
    fields.forEach(function(field) {
      var fieldStr = field.toString().toLowerCase();
      if (fieldStr.indexOf(queryLower) !== -1 && fieldStr !== queryLower) {
        suggestions[field.toString()] = true;
      }
    });
  });
  
  return Object.keys(suggestions).slice(0, 5);
}

function highlightMatch(text, query) {
  if (!query) return text;
  var regex = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function formatRelativeTime(timestamp) {
  var now = new Date();
  var time = new Date(timestamp);
  var diffMs = now - time;
  var diffMins = Math.floor(diffMs / 60000);
  var diffHours = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return '今 / Vừa xong';
  if (diffMins < 60) return diffMins + '分前 / ' + diffMins + ' phút trước';
  if (diffHours < 24) return diffHours + '時間前 / ' + diffHours + ' giờ trước';
  if (diffDays < 7) return diffDays + '日前 / ' + diffDays + ' ngày trước';
  return time.toLocaleDateString('ja-JP');
}

function selectSuggestion(query) {
  var searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = query;
    updateClearSearchButton();
    hideSearchSuggestions(true);
    performSearch();
  }
}

function getRecentSearchHistory() {
  return searchHistory
    .sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); })
    .slice(0, 10);
}

function clearSearchHistory() {
  searchHistory = [];
  saveSearchHistory();
  updateSearchSuggestions('');
  alert('履歴をクリアしました / Đã xóa lịch sử');
}

// =================== FILTER FUNCTIONS ===================
function initializeFilters() {
  updateFieldFilter();
  updateValueFilter();
}

function updateFieldFilter() {
  var fieldFilter = document.getElementById('fieldFilterA');
  if (!fieldFilter) return;
  
  fieldFilter.innerHTML = '<option value="all">全項目 / Tất cả trường</option>';
  
  var fields = FILTERFIELDS[currentCategory] || FILTERFIELDS.all;
  fields.forEach(function(option) {
    var optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.text;
    fieldFilter.appendChild(optionElement);
  });
}

function updateValueFilter() {
  var fieldFilter = document.getElementById('fieldFilterA');
  var valueFilter = document.getElementById('valueFilterB');
  if (!fieldFilter || !valueFilter) return;
  
  var selectedField = fieldFilter.value;
  valueFilter.innerHTML = '<option value="all">全て / Tất cả</option>';
  
  if (selectedField === 'all') return;
  
  var dataToAnalyze;
  if (currentCategory === 'mold') {
    dataToAnalyze = allData.molds;
  } else if (currentCategory === 'cutter') {
    dataToAnalyze = allData.cutters;
  } else {
    dataToAnalyze = allData.molds.concat(allData.cutters);
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
    valueFilter.appendChild(option);
  });
}

// =================== SEARCH AND FILTER HANDLERS ===================
function handleFieldFilterChange() {
  updateValueFilter();
  performSearch();
}

function handleValueFilterChange() {
  performSearch();
}

function toggleCategory(category) {
  currentCategory = category;
  updateCategoryDisplay();
  updateFieldFilter();
  updateValueFilter();
  performSearch();
}

function updateCategoryDisplay() {
  var header = document.querySelector('.dynamic-header');
  if (header) {
    header.className = 'dynamic-header ' + currentCategory;
  }
}

function resetFilters() {
  var fieldFilter = document.getElementById('fieldFilterA');
  var valueFilter = document.getElementById('valueFilterB');
  if (fieldFilter) fieldFilter.value = 'all';
  if (valueFilter) valueFilter.value = 'all';
  performSearch();
}

// =================== ENHANCED MAIN SEARCH FUNCTION V4.381 ===================
function performSearch() {
  var query = document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '';
  var fieldFilter = document.getElementById('fieldFilterA') ? document.getElementById('fieldFilterA').value : 'all';
  var valueFilter = document.getElementById('valueFilterB') ? document.getElementById('valueFilterB').value : 'all';
  
  console.log('Performing search V4.381:', query, fieldFilter, valueFilter, currentCategory);
  
  if (query) {
    addToSearchHistory(query);
  }
  
  var dataToSearch;
  if (currentCategory === 'mold') {
    dataToSearch = allData.molds;
  } else if (currentCategory === 'cutter') {
    dataToSearch = allData.cutters;
  } else {
    dataToSearch = allData.molds.concat(allData.cutters);
  }
  
  // Apply field filter first
  var preFilteredData = dataToSearch;
  if (fieldFilter !== 'all' && valueFilter !== 'all') {
    preFilteredData = dataToSearch.filter(function(item) {
      return item[fieldFilter] && item[fieldFilter].toString() === valueFilter;
    });
  }
  
  // Enhanced text search with cutline size support and comma separation
  filteredData = preFilteredData.filter(function(item) {
    if (!query) return true;
    
    var keywords = query.split(',').map(function(k) {
      return k.trim().toLowerCase();
    }).filter(function(k) {
      return k.length > 0;
    });
    
    if (keywords.length === 0) return true;
    
    return keywords.every(function(keyword) {
      // Enhanced search fields with cutline size support
      var searchFields = [
        item.displayCode, item.displayName, item.displayDimensions, item.displayLocation,
        item.displayCustomer, item.MoldID, item.CutterID, item.MoldCode, item.CutterNo,
        item.MoldName, item.CutterName, item.CutterDesignName,
        item.designInfo && item.designInfo.TextContent,
        item.designInfo && item.designInfo.DrawingNumber,
        item.designInfo && item.designInfo.EquipmentCode,
        item.designInfo && item.designInfo.DesignForPlasticType,
        item.designInfo && item.designInfo.MoldSetupType,
        item.designInfo && item.designInfo.PieceCount,
        item.cutlineSize, // Enhanced cutline size search
        item.PlasticCutType,
        item.CutterType,
        item.BladeCount,
        item.MoldNotes,
        item.CutterNote,
        item.rackInfo && item.rackInfo.RackLocation,
        item.storageCompanyInfo && (item.storageCompanyInfo.CompanyName || item.storageCompanyInfo.CompanyShortName),
        item.storageCompany,
        item.moldStatus,
        item.jobInfo && item.jobInfo.JobName,
        item.processingItemInfo && item.processingItemInfo.ProcessingItemName,
        item.TeflonCoating, // FIX: Include TeflonCoating in search
        item.MoldReturning,
        item.MoldDisposing,
        // Additional cutline search support
        item.designInfo && item.designInfo.CutlineX && item.designInfo.CutlineY ? 
          item.designInfo.CutlineX + 'x' + item.designInfo.CutlineY : null,
        item.CutlineLength && item.CutlineWidth ? 
          item.CutlineLength + 'x' + item.CutlineWidth : null
      ].filter(function(field) {
        return field && field.toString().trim();
      });
      
      return searchFields.some(function(field) {
        return field.toString().toLowerCase().indexOf(keyword) !== -1;
      });
    });
  });
  
  // Apply sorting - V4.381 FIX
  if (sortField) {
    filteredData.sort(function(a, b) {
      var aVal = getSortValue(a, sortField);
      var bVal = getSortValue(b, sortField);
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }
  
  selectedItem = null;
  currentPage = 1;
  updateResultsDisplay();
  updateActionButtons();
  saveSearchState();
}

function getSortValue(item, field) {
  switch (field) {
    case 'id':
      return item.MoldID || item.CutterID;
    case 'name':
      return item.displayName;
    case 'size':
      return item.displayDimensions;
    case 'location':
      return item.displayLocation;
    case 'rackLocation':
      return item.displayRackLocation;
    case 'company':
      return item.displayStorageCompany && item.displayStorageCompany.text;
    case 'notes':
      return item.MoldNotes || item.CutterNote;
    default:
      return item[field];
  }
}

// =================== SORT TABLE FUNCTIONALITY V4.381 ===================
function sortTable(field) {
  if (sortField === field) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortField = field;
    sortDirection = 'asc';
  }
  
  // Update visual indicators
  var headers = document.querySelectorAll('.data-table th');
  for (var i = 0; i < headers.length; i++) {
    headers[i].classList.remove('sort-asc', 'sort-desc');
  }
  
  var currentHeader = document.querySelector('.data-table th[onclick*="' + field + '"]');
  if (currentHeader) {
    currentHeader.classList.add('sort-' + sortDirection);
  }
  
  performSearch();
}

// =================== RESULTS DISPLAY ===================
function updateResultsDisplay() {
  updateResultsCount();
  renderQuickResults();
  renderFullResultsTable();
}

function updateResultsCount() {
  var resultsCount = document.getElementById('resultsCount');
  var resultsCountBottom = document.getElementById('resultsCountBottom');
  
  if (resultsCount) {
    resultsCount.textContent = filteredData.length + ' 件';
  }
  
  if (resultsCountBottom) {
    resultsCountBottom.textContent = filteredData.length + ' 件見つかりました / ' + filteredData.length + ' kết quả';
  }
}

// =================== ENHANCED QUICK VIEW V4.381 ===================
// =================== ENHANCED QUICK RESULTS TABLE V4.381 ===================
function renderQuickResults() {
  var tbody = document.getElementById('quickResultsBody');
  if (!tbody) return;
  
  var quickData = filteredData.slice(0, 8);
  var html = '';
  
  if (quickData.length === 0) {
    html = '<tr><td colspan="6" style="text-align:center; color:#9ca3af; font-style:italic;">データなし / Không có dữ liệu</td></tr>';
  } else {
    for (var i = 0; i < quickData.length; i++) {
      var item = quickData[i];
      
      // Tạo thông tin vị trí đầy đủ
      var locationInfo = '';
      if (item.rackInfo && item.rackLayerInfo) {
        var rackId = item.rackInfo.RackID || '';
        var layerNum = item.rackLayerInfo.RackLayerNumber || '';
        var rackLocation = item.rackInfo.RackLocation || '';
        
        // Tạo HTML cho vị trí với khung tròn/chữ nhật
        if (rackId && layerNum) {
          var rackDisplay = '';
          if (item.itemType === 'mold') {
            rackDisplay = '<span class="rack-circle mold">' + rackId + '</span>-' + layerNum;
          } else {
            rackDisplay = '<span class="rack-square cutter">' + rackId + '</span>-' + layerNum;
          }
          locationInfo = rackLocation + ' ' + rackDisplay;
        } else {
          locationInfo = item.displayLocation || '';
        }
      } else {
        locationInfo = item.displayLocation || '';
      }
      
      // Thông tin công ty
      var companyInfo = '';
      if (item.displayStorageCompany && item.displayStorageCompany.text) {
        companyInfo = item.displayStorageCompany.text;
      } else {
        companyInfo = item.storageCompany || '';
      }
      
      // Tạo row với class phù hợp
      html += '<tr class="quick-row ' + item.itemType + '-row" data-id="' + (item.MoldID || item.CutterID) + '" data-type="' + item.itemType + '">';
      html += '<td class="quick-col-type"><span class="type-badge ' + item.itemType + '">' + (item.itemType === 'mold' ? '金型' : '抜型') + '</span></td>';
      
      if (item.itemType === 'mold') {
        html += '<td class="quick-col-code mold-code"><strong>' + escapeHtml(item.MoldCode || '') + '</strong></td>';
        html += '<td class="quick-col-name mold-name">' + escapeHtml(item.MoldName || '') + '</td>';
        html += '<td class="quick-col-size">' + escapeHtml(item.displayDimensions || '') + '</td>';
      } else {
        html += '<td class="quick-col-code cutter-code"><strong>' + escapeHtml(item.CutterNo || '') + '</strong></td>';
        html += '<td class="quick-col-name cutter-name">' + escapeHtml(item.CutterName || item.CutterDesignName || '') + '</td>';
        html += '<td class="quick-col-size">Cutline: ' + escapeHtml(item.cutlineSize || '') + '</td>';
      }
      
      html += '<td class="quick-col-location">' + locationInfo + '</td>';
      html += '<td class="quick-col-company">' + escapeHtml(companyInfo) + '</td>';
      html += '</tr>';
    }
  }
  
  tbody.innerHTML = html;
  
  // Attach click handlers
  var rows = tbody.querySelectorAll('tr[data-id]');
  for (var j = 0; j < rows.length; j++) {
    rows[j].style.cursor = 'pointer';
    rows[j].onclick = function() {
      var id = this.getAttribute('data-id');
      var type = this.getAttribute('data-type');
      showDetailView(id, type);
    };
  }
}

// =================== ENHANCED TABLE RESULTS V4.381 ===================
function renderFullResultsTable() {
  var tbody = document.getElementById('dataTableBody');
  if (!tbody) return;
  
  var html = '';
  
  if (filteredData.length === 0) {
    html = '<tr><td colspan="8" style="text-align:center;">データが見つかりません / Không tìm thấy dữ liệu</td></tr>';
  } else {
    for (var i = 0; i < filteredData.length; i++) {
      var item = filteredData[i];
      var id = item.MoldID || item.CutterID;
      var isSelected = selectedItems.has(id);
      
      // V4.381 FIX: Hiển thị đúng theo yêu cầu - tách riêng location và rack
      var displayId = item.itemType === 'cutter' ? (item.CutterNo || item.CutterID) : item.MoldID;
      var displaySize = item.itemType === 'cutter' ? ('Cutline: ' + (item.cutlineSize || '')) : (item.displayDimensions || '');
      
      // FIX: Cột 場所 hiển thị location đầy đủ, cột 棚位置 chỉ hiển thị rack-layer
      var fullLocation = item.displayLocation || ''; // Location đầy đủ
      var rackLocation = ''; // Chỉ rack-layer
      if (item.rackInfo && item.rackLayerInfo) {
        var rackId = item.rackInfo.RackID || '';
        var layerNum = item.rackLayerInfo.RackLayerNumber || '';
        if (rackId && layerNum) {
          if (item.itemType === 'mold') {
            rackLocation = '<span class="rack-circle mold">' + rackId + '</span>-' + layerNum;
          } else {
            rackLocation = '<span class="rack-square cutter">' + rackId + '</span>-' + layerNum;
          }
        }
      }
      
      html += '<tr class="' + item.itemType + '-row' + (isSelected ? ' selected' : '') + '" data-id="' + id + '" data-type="' + item.itemType + '">';
      html += '<td class="col-select" onclick="event.stopPropagation()"><input type="checkbox" data-id="' + id + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleItemSelection(\'' + id + '\', this.checked)"></td>';
      html += '<td class="col-id ' + item.itemType + '-id">' + escapeHtml(displayId) + '</td>';
      html += '<td class="col-name ' + item.itemType + '-name">' + escapeHtml(item.displayName) + '</td>';
      html += '<td class="col-size">' + escapeHtml(displaySize) + '</td>';
      html += '<td class="col-location">' + escapeHtml(fullLocation) + '</td>'; // Location đầy đủ
      html += '<td class="col-rack-location">' + rackLocation + '</td>'; // Chỉ rack-layer với khung
      html += '<td class="col-company">' + escapeHtml(item.displayStorageCompany && item.displayStorageCompany.text || item.displayStorageCompany || '') + '</td>';
      html += '<td class="col-notes">' + escapeHtml(item.MoldNotes || item.CutterNote || '') + '</td>';
      html += '</tr>';
    }
  }
  
  tbody.innerHTML = html;
  
  // Attach click handlers for table rows
  var rows = tbody.querySelectorAll('tr[data-id]');
  for (var k = 0; k < rows.length; k++) {
    rows[k].style.cursor = 'pointer';
    rows[k].onclick = function(e) {
      if (e.target.type === 'checkbox' || e.target.closest('.col-select')) {
        return;
      }
      var id = this.getAttribute('data-id');
      var type = this.getAttribute('data-type');
      showDetailView(id, type);
    };
  }
  
  updateSelectionDisplay();
}

// =================== SELECTION FUNCTIONS ===================
function toggleSelectAll() {
  var selectAllCheckbox = document.getElementById('selectAllCheckbox');
  var checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
  
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = selectAllCheckbox.checked;
    var id = checkboxes[i].getAttribute('data-id');
    if (selectAllCheckbox.checked) {
      selectedItems.add(id);
    } else {
      selectedItems.delete(id);
    }
  }
  updateSelectionDisplay();
}

function selectAll() {
  var selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = true;
    toggleSelectAll();
  }
}

function clearSelection() {
  var selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    toggleSelectAll();
  }
}

function toggleItemSelection(id, checked) {
  if (checked) {
    selectedItems.add(id);
  } else {
    selectedItems.delete(id);
  }
  updateSelectionDisplay();
  
  // Update select all checkbox
  var selectAllCheckbox = document.getElementById('selectAllCheckbox');
  var totalCheckboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]').length;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedItems.size === totalCheckboxes;
    selectAllCheckbox.indeterminate = selectedItems.size > 0 && selectedItems.size < totalCheckboxes;
  }
}

function updateSelectionDisplay() {
  var selectedCount = document.getElementById('selectedCount');
  var printSelectedBtn = document.getElementById('printSelectedBtn');
  
  if (selectedCount) {
    if (selectedItems.size > 0) {
      selectedCount.textContent = selectedItems.size + ' 選択 / ' + selectedItems.size + ' đã chọn';
      selectedCount.style.display = 'inline';
    } else {
      selectedCount.style.display = 'none';
    }
  }
  
  if (printSelectedBtn) {
    printSelectedBtn.style.display = selectedItems.size > 0 ? 'inline-block' : 'none';
  }
}

// =================== UTILITY FUNCTIONS ===================
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =================== STATE MANAGEMENT ===================
function saveSearchState() {
  try {
    var state = {
      query: document.getElementById('searchInput') ? document.getElementById('searchInput').value : '',
      category: currentCategory,
      fieldFilter: document.getElementById('fieldFilterA') ? document.getElementById('fieldFilterA').value : 'all',
      valueFilter: document.getElementById('valueFilterB') ? document.getElementById('valueFilterB').value : 'all',
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
      if (document.getElementById('searchInput') && state.query) {
        document.getElementById('searchInput').value = state.query;
        updateClearSearchButton();
      }
      if (state.category) {
        currentCategory = state.category;
        updateCategoryDisplay();
        // Update radio button
        var radio = document.querySelector('input[name="typeToggle"][value="' + state.category + '"]');
        if (radio) radio.checked = true;
      }
      if (document.getElementById('fieldFilterA') && state.fieldFilter) {
        document.getElementById('fieldFilterA').value = state.fieldFilter;
      }
      if (document.getElementById('valueFilterB') && state.valueFilter) {
        document.getElementById('valueFilterB').value = state.valueFilter;
      }
      if (state.page) currentPage = state.page;
      if (state.pageSize) pageSize = state.pageSize;
      if (state.view) currentView = state.view;
    }
  } catch (e) {
    console.warn('Failed to restore search state:', e);
  }
}
// =================== DETAIL VIEW (HIỂN THỊ TRONG PHẦN 2) - 7 CỘT CÓ MÀU SẮC V4.381 ===================
function showDetailView(id, type) {
  console.log('showDetailView called with:', id, type);
  
  var dataArray = (type === 'cutter') ? allData.cutters : allData.molds;
  selectedItem = null;
  
  for (var i = 0; i < dataArray.length; i++) {
    if ((dataArray[i].MoldID || dataArray[i].CutterID) == id) {
      selectedItem = dataArray[i];
      break;
    }
  }
  
  if (!selectedItem) {
    console.error('Item not found:', id, type);
    return;
  }
  
  console.log('Selected item:', selectedItem);
  
  // Hide table, show detail view
  var fullResultsTable = document.getElementById('fullResultsTable');
  var detailView = document.getElementById('detailView');
  
  if (fullResultsTable && detailView) {
    fullResultsTable.style.display = 'none';
    detailView.style.display = 'block';
    renderDetailSection();
    updateActionButtons();
    console.log('Detail view shown');
  } else {
    console.error('Detail view elements not found');
  }
}

function backToFullResults() {
  console.log('backToFullResults called');
  
  selectedItem = null;
  var fullResultsTable = document.getElementById('fullResultsTable');
  var detailView = document.getElementById('detailView');
  
  if (fullResultsTable && detailView) {
    fullResultsTable.style.display = 'block';
    detailView.style.display = 'none';
    updateActionButtons();
    console.log('Back to full results');
  } else {
    console.error('Elements not found for back navigation');
  }
}

function updateActionButtons() {
  var hasSelection = selectedItem !== null;
  var updateLocationBtn = document.getElementById('updateLocationBtn');
  var updateShipmentBtn = document.getElementById('updateShipmentBtn');
  var updateTeflonBtn = document.getElementById('updateTeflonBtn');
  var updateCommentBtn = document.getElementById('updateCommentBtn');
  
  if (updateLocationBtn) updateLocationBtn.disabled = !hasSelection;
  if (updateShipmentBtn) updateShipmentBtn.disabled = !hasSelection;
  if (updateTeflonBtn) updateTeflonBtn.disabled = !hasSelection || (selectedItem && selectedItem.itemType !== 'mold');
  if (updateCommentBtn) updateCommentBtn.disabled = !hasSelection;
}

// =================== DETAIL SECTION RENDERING - 7 CỘT CÓ MÀU SẮC V4.381 ===================
function renderDetailSection() {
  var detailView = document.getElementById('detailView');
  if (!detailView) return;
  
  if (!selectedItem) {
    detailView.innerHTML = '<div style="text-align:center; padding:40px; color:#9ca3af; font-style: italic;">アイテムを選択してください / Vui lòng chọn một kết quả để xem chi tiết</div>';
    return;
  }
  
  var item = selectedItem;
  
  if (item.itemType === 'mold') {
    renderMoldDetailData(item);
  } else {
    renderCutterDetailData(item);
  }
}

// =================== MOLD DETAIL DATA - 7 CỘT CÓ MÀU SẮC V4.381 ===================
function renderMoldDetailData(item) {
  var detailView = document.getElementById('detailView');
  if (!detailView) return;
  
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
  
  var html = '<div class="detail-header-ipad mold-theme">';
  html += '<button onclick="backToFullResults()" class="back-btn mold-btn">← 戻る / Quay lại</button>';
  html += '<h2 class="detail-title mold-title">🔧 金型詳細 / Chi tiết khuôn: ' + escapeHtml(item.MoldCode) + '</h2>';
  html += '<button onclick="printDetail()" class="print-detail-btn">🖨️ 印刷 / In</button>';
  html += '</div>';
  
  html += '<div class="detail-grid-7 mold-grid">';
  
  // 1. Thông tin cơ bản (Cột 1) - Màu xanh
  html += '<div class="detail-section mold-basic">';
  html += '<h3 class="section-title mold-section">基本情報 / Thông tin cơ bản</h3>';
  html += '<div class="info-row"><span class="info-label">ID</span><span class="info-value muted">' + item.MoldID + '</span></div>';
  html += '<div class="info-row"><span class="info-label">金型コード</span><span class="info-value highlight mold-highlight">' + escapeHtml(item.MoldCode) + '</span></div>';
  html += '<div class="info-row"><span class="info-label">金型名</span><span class="info-value">' + escapeHtml(item.MoldName || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">状態</span><span class="info-value ' + status.class + '">' + status.text + '</span></div>';
  html += '<div class="info-row"><span class="info-label">材質</span><span class="info-value">' + escapeHtml(design.DesignForPlasticType || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">取り数</span><span class="info-value">' + escapeHtml(design.PieceCount || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">寸法</span><span class="info-value">' + moldDimensions + '</span></div>';
  html += '<div class="info-row"><span class="info-label">製品寸法</span><span class="info-value">' + productDimensions + '</span></div>';
  html += '</div>';
  
  // 2. Design info (Cột 2) - Màu tím
  html += '<div class="detail-section design-info">';
  html += '<h3 class="section-title design-section">設計情報 / Thông tin thiết kế</h3>';
  html += '<div class="info-row"><span class="info-label">図面番号</span><span class="info-value">' + escapeHtml(design.DrawingNumber || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">設備コード</span><span class="info-value">' + escapeHtml(design.EquipmentCode || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">段取り</span><span class="info-value">' + escapeHtml(design.MoldSetupType || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">設計重量</span><span class="info-value">' + (design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">深さ</span><span class="info-value">' + escapeHtml(design.MoldDesignDepth || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">抜き勾配</span><span class="info-value">' + escapeHtml(design.DraftAngle || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">金型向き</span><span class="info-value">' + escapeHtml(design.MoldOrientation || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">ポケット数</span><span class="info-value">' + escapeHtml(design.PocketNumbers || 'N/A') + '</span></div>';
  html += '</div>';
  
  // 3. Product info (Cột 3) - Màu cam
  html += '<div class="detail-section product-info">';
  html += '<h3 class="section-title product-section">製品情報 / Thông tin sản phẩm</h3>';
  html += '<div class="info-row"><span class="info-label">トレイ情報</span><span class="info-value">' + escapeHtml(design.TrayInfoForMoldDesign || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">初回出荷日</span><span class="info-value">' + firstShipDate + '</span></div>';
  html += '<div class="info-row"><span class="info-label">単価</span><span class="info-value">' + escapeHtml(job.UnitPrice || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">トレイ重量</span><span class="info-value">' + (design.TrayWeight ? design.TrayWeight + ' g' : 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">ロイ通</span><span class="info-value">' + escapeHtml(job.LoaiThungDong || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">包ニロン</span><span class="info-value">' + escapeHtml(job.BaoNilon || 'N/A') + '</span></div>';
  html += '</div>';
  
  // 4. Location history (Cột 4) - Màu xanh lá
  html += '<div class="detail-section location-history">';
  html += '<h3 class="section-title location-section">位置履歴 / Lịch sử vị trí</h3>';
  if (item.locationHistory && item.locationHistory.length > 0) {
    html += item.locationHistory.slice(0, 5).map(function(log) {
      return '<div class="history-entry location-entry">' +
        '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
        '<div class="history-content">' +
        escapeHtml(log.OldRackLayer || 'N/A') + ' → ' + escapeHtml(log.NewRackLayer || 'N/A') +
        (log.notes ? '<br><small>' + escapeHtml(log.notes) + '</small>' : '') +
        '</div></div>';
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 5. Shipment history (Cột 5) - Màu vàng
  html += '<div class="detail-section shipment-history">';
  html += '<h3 class="section-title shipment-section">搬送履歴 / Lịch sử vận chuyển</h3>';
  if (item.shipHistory && item.shipHistory.length > 0) {
    html += item.shipHistory.slice(0, 5).map(function(log) {
      var fromCompany = null;
      var toCompany = null;
      for (var i = 0; i < allData.companies.length; i++) {
        if (allData.companies[i].CompanyID === log.FromCompanyID) fromCompany = allData.companies[i];
        if (allData.companies[i].CompanyID === log.ToCompanyID) toCompany = allData.companies[i];
      }
      return '<div class="history-entry shipment-entry">' +
        '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
        '<div class="history-content">' +
        escapeHtml(fromCompany ? fromCompany.CompanyShortName : 'N/A') + ' → ' + 
        escapeHtml(toCompany ? toCompany.CompanyShortName : 'N/A') +
        (log.handler ? '<br><small>担当: ' + escapeHtml(log.handler) + '</small>' : '') +
        (log.ShipNotes ? '<br><small>' + escapeHtml(log.ShipNotes) + '</small>' : '') +
        '</div></div>';
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 6. Teflon & Comment (Cột 6) - V4.381 FIX: Màu bình thường
  html += '<div class="detail-section teflon-comments">';
  html += '<h3 class="section-title teflon-section">テフロン・備考 / Teflon & Ghi chú</h3>';
  
  // Nhóm Teflon - V4.381 FIX: Kiểm tra đúng TeflonCoating
  html += '<div class="sub-section teflon-subsection">';
  html += '<h4 class="subsection-title teflon-title">テフロン情報 / Thông tin Teflon</h4>';
  var teflonStatus = item.TeflonCoating || 'N/A';
  var teflonSentDate = item.TeflonSentDate ? formatDate(item.TeflonSentDate) : 'N/A';
  var teflonReceivedDate = item.TeflonReceivedDate ? formatDate(item.TeflonReceivedDate) : 'N/A';
  
  console.log('V4.381 DEBUG Teflon:', {
    TeflonCoating: item.TeflonCoating,
    TeflonSentDate: item.TeflonSentDate,
    TeflonReceivedDate: item.TeflonReceivedDate
  });
  
  html += '<div class="info-row"><span class="info-label">テフロン状態</span><span class="info-value teflon-status">' + escapeHtml(teflonStatus) + '</span></div>';
  html += '<div class="info-row"><span class="info-label">送信日</span><span class="info-value">' + teflonSentDate + '</span></div>';
  html += '<div class="info-row"><span class="info-label">受信日</span><span class="info-value">' + teflonReceivedDate + '</span></div>';
  html += '</div>';
  
  // Nhóm Bình luận
  html += '<div class="sub-section comments-subsection">';
  html += '<h4 class="subsection-title comment-title">コメント / Bình luận</h4>';
  html += '<div class="info-row"><span class="info-label">備考</span><span class="info-value">' + escapeHtml(item.MoldNotes || 'N/A') + '</span></div>';
  
  var userComments = getMoldUserCommentsFromServer(item.MoldID);
  if (userComments && userComments.length > 0) {
    html += '<div class="user-comments-list">';
    userComments.slice(0, 3).forEach(function(comment) {
      var employee = null;
      for (var i = 0; i < allData.employees.length; i++) {
        if (allData.employees[i].EmployeeID === comment.EmployeeID) {
          employee = allData.employees[i];
          break;
        }
      }
      html += '<div class="comment-item-compact">' +
        '<div class="comment-header-compact">' +
        '<span class="comment-author">' + escapeHtml(employee ? employee.EmployeeName : 'Unknown') + '</span>' +
        '<span class="comment-date">' + formatTimestamp(comment.DateEntry) + '</span>' +
        '</div>' +
        '<div class="comment-text">' + escapeHtml(comment.CommentText) + '</div>' +
        '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="no-comments">コメントなし / Không có bình luận</div>';
  }
  html += '</div>';
  html += '</div>';
  
  // 7. Related Items (Cột 7) - V4.381 FIX: Màu nổi bật
  html += '<div class="detail-section related-items">';
  html += '<h3 class="section-title related-section">関連アイテム / Thiết bị liên quan</h3>';
  
  if (item.relatedCutters && item.relatedCutters.length > 0) {
    html += '<div class="sub-section related-cutters">';
    html += '<h4 class="subsection-title cutter-title">関連抜型 / Dao cắt liên quan</h4>';
    item.relatedCutters.slice(0, 5).forEach(function(cutter) {
      html += '<div class="related-item cutter-related">' +
        '<span class="related-code cutter-code">' + escapeHtml(cutter.CutterNo) + '</span>' +
        '<span class="related-name">' + escapeHtml(cutter.CutterName || '') + '</span>' +
        '</div>';
    });
    html += '</div>';
  }
  
  if (item.customerInfo && item.customerInfo.CustomerID) {
    html += '<div class="sub-section customer-info">';
    html += '<h4 class="subsection-title customer-title">顧客情報 / Thông tin khách hàng</h4>';
    html += '<div class="info-row"><span class="info-label">顧客名</span><span class="info-value">' + escapeHtml(item.customerInfo.CustomerName || 'N/A') + '</span></div>';
    html += '<div class="info-row"><span class="info-label">会社</span><span class="info-value">' + escapeHtml(item.companyInfo ? item.companyInfo.CompanyName : 'N/A') + '</span></div>';
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  detailView.innerHTML = html;
}

// =================== CUTTER DETAIL DATA - 7 CỘT CÓ MÀU SẮC V4.381 ===================
function renderCutterDetailData(item) {
  var detailView = document.getElementById('detailView');
  if (!detailView) return;
  
  var status = item.currentStatus || {text: 'N/A', class: ''};
  var cutlineDimensions = item.cutlineSize || 'N/A';
  
  var html = '<div class="detail-header-ipad cutter-theme">';
  html += '<button onclick="backToFullResults()" class="back-btn cutter-btn">← 戻る / Quay lại</button>';
  html += '<h2 class="detail-title cutter-title">✂️ 抜型詳細 / Chi tiết dao cắt: ' + escapeHtml(item.CutterNo) + '</h2>';
  html += '<button onclick="printDetail()" class="print-detail-btn">🖨️ 印刷 / In</button>';
  html += '</div>';
  
  html += '<div class="detail-grid-7 cutter-grid">';
  
  // 1. Thông tin cơ bản (Cột 1) - Màu cam
  html += '<div class="detail-section cutter-basic">';
  html += '<h3 class="section-title cutter-section">基本情報 / Thông tin cơ bản</h3>';
  html += '<div class="info-row"><span class="info-label">ID</span><span class="info-value muted">' + item.CutterID + '</span></div>';
  html += '<div class="info-row"><span class="info-label">CutterNo</span><span class="info-value highlight cutter-highlight">' + escapeHtml(item.CutterNo) + '</span></div>';
  html += '<div class="info-row"><span class="info-label">名前</span><span class="info-value">' + escapeHtml(item.CutterName || item.CutterDesignName || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">状態</span><span class="info-value ' + status.class + '">' + status.text + '</span></div>';
  html += '<div class="info-row"><span class="info-label">Cutline寸法</span><span class="info-value cutline">' + cutlineDimensions + '</span></div>';
  html += '<div class="info-row"><span class="info-label">プラスチックカット</span><span class="info-value">' + escapeHtml(item.PlasticCutType || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">抜型タイプ</span><span class="info-value">' + escapeHtml(item.CutterType || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">ブレード数</span><span class="info-value">' + escapeHtml(item.BladeCount || 'N/A') + '</span></div>';
  html += '</div>';
  
  // 2. Design info for cutter (Cột 2) - Màu tím
  html += '<div class="detail-section cutter-design">';
  html += '<h3 class="section-title design-section">設計情報 / Thông tin thiết kế</h3>';
  html += '<div class="info-row"><span class="info-label">SATOコード</span><span class="info-value">' + escapeHtml(item.SatoCode || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">SATO日付</span><span class="info-value">' + (item.SatoCodeDate ? formatDate(item.SatoCodeDate) : 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">説明</span><span class="info-value">' + escapeHtml(item.Description || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">使用状況</span><span class="info-value">' + escapeHtml(item.UsageStatus || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">ピッチ</span><span class="info-value">' + escapeHtml(item.Pitch || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">PP使用</span><span class="info-value">' + escapeHtml(item.PPcushionUse || 'N/A') + '</span></div>';
  html += '</div>';
  
  // 3. Product info for cutter (Cột 3) - Màu xanh lá
  html += '<div class="detail-section cutter-product">';
  html += '<h3 class="section-title product-section">製品情報 / Thông tin sản phẩm</h3>';
  var postCutDim = (item.PostCutLength && item.PostCutWidth) ? 
    item.PostCutLength + '×' + item.PostCutWidth : 'N/A';
  var physDim = (item.CutterLength && item.CutterWidth) ? 
    item.CutterLength + '×' + item.CutterWidth : 'N/A';
  var nomDim = (item.CutlineLength && item.CutlineWidth) ? 
    item.CutlineLength + '×' + item.CutlineWidth : 'N/A';
  
  html += '<div class="info-row"><span class="info-label">加工後寸法</span><span class="info-value">' + postCutDim + '</span></div>';
  html += '<div class="info-row"><span class="info-label">物理寸法</span><span class="info-value">' + physDim + '</span></div>';
  html += '<div class="info-row"><span class="info-label">Cutline寸法</span><span class="info-value cutline">' + nomDim + '</span></div>';
  html += '<div class="info-row"><span class="info-label">コーナー</span><span class="info-value">' + escapeHtml(item.CutterCorner || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">面取り</span><span class="info-value">' + escapeHtml(item.CutterChamfer || 'N/A') + '</span></div>';
  html += '</div>';
  
  // 4. Location history (Cột 4) - Màu xanh lá
  html += '<div class="detail-section location-history">';
  html += '<h3 class="section-title location-section">位置履歴 / Lịch sử vị trí</h3>';
  if (item.locationHistory && item.locationHistory.length > 0) {
    html += item.locationHistory.slice(0, 5).map(function(log) {
      return '<div class="history-entry location-entry">' +
        '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
        '<div class="history-content">' +
        escapeHtml(log.OldRackLayer || 'N/A') + ' → ' + escapeHtml(log.NewRackLayer || 'N/A') +
        (log.notes ? '<br><small>' + escapeHtml(log.notes) + '</small>' : '') +
        '</div></div>';
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 5. Shipment history (Cột 5) - Màu vàng
  html += '<div class="detail-section shipment-history">';
  html += '<h3 class="section-title shipment-section">搬送履歴 / Lịch sử vận chuyển</h3>';
  if (item.shipHistory && item.shipHistory.length > 0) {
    html += item.shipHistory.slice(0, 5).map(function(log) {
      var fromCompany = null;
      var toCompany = null;
      for (var i = 0; i < allData.companies.length; i++) {
        if (allData.companies[i].CompanyID === log.FromCompanyID) fromCompany = allData.companies[i];
        if (allData.companies[i].CompanyID === log.ToCompanyID) toCompany = allData.companies[i];
      }
      return '<div class="history-entry shipment-entry">' +
        '<div class="history-date">' + formatTimestamp(log.DateEntry) + '</div>' +
        '<div class="history-content">' +
        escapeHtml(fromCompany ? fromCompany.CompanyShortName : 'N/A') + ' → ' + 
        escapeHtml(toCompany ? toCompany.CompanyShortName : 'N/A') +
        (log.handler ? '<br><small>担当: ' + escapeHtml(log.handler) + '</small>' : '') +
        (log.ShipNotes ? '<br><small>' + escapeHtml(log.ShipNotes) + '</small>' : '') +
        '</div></div>';
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 6. Ghi chú và Comments cho cutter (Cột 6) - Màu bình thường
  html += '<div class="detail-section cutter-comments">';
  html += '<h3 class="section-title comment-section">備考・コメント / Ghi chú & Bình luận</h3>';
  
  // Nhóm Ghi chú
  html += '<div class="sub-section notes-subsection">';
  html += '<h4 class="subsection-title note-title">備考情報 / Thông tin ghi chú</h4>';
  html += '<div class="info-row"><span class="info-label">備考</span><span class="info-value">' + escapeHtml(item.CutterNote || 'N/A') + '</span></div>';
  html += '<div class="info-row"><span class="info-label">詳細</span><span class="info-value">' + escapeHtml(item.CutterDetail || 'N/A') + '</span></div>';
  html += '</div>';
  
  // Nhóm Bình luận
  html += '<div class="sub-section comments-subsection">';
  html += '<h4 class="subsection-title comment-title">コメント / Bình luận</h4>';
  
  var userComments = getCutterUserCommentsFromServer(item.CutterID);
  if (userComments && userComments.length > 0) {
    html += '<div class="user-comments-list">';
    userComments.slice(0, 3).forEach(function(comment) {
      var employee = null;
      for (var i = 0; i < allData.employees.length; i++) {
        if (allData.employees[i].EmployeeID === comment.EmployeeID) {
          employee = allData.employees[i];
          break;
        }
      }
      html += '<div class="comment-item-compact">' +
        '<div class="comment-header-compact">' +
        '<span class="comment-author">' + escapeHtml(employee ? employee.EmployeeName : 'Unknown') + '</span>' +
        '<span class="comment-date">' + formatTimestamp(comment.DateEntry) + '</span>' +
        '</div>' +
        '<div class="comment-text">' + escapeHtml(comment.CommentText) + '</div>' +
        '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="no-comments">コメントなし / Không có bình luận</div>';
  }
  html += '</div>';
  html += '</div>';
  
  // 7. Related Items (Cột 7) - V4.381 FIX: Màu nổi bật
  html += '<div class="detail-section related-items">';
  html += '<h3 class="section-title related-section">関連アイテム / Thiết bị liên quan</h3>';
  
  if (item.relatedMolds && item.relatedMolds.length > 0) {
    html += '<div class="sub-section related-molds">';
    html += '<h4 class="subsection-title mold-title">関連金型 / Khuôn liên quan</h4>';
    item.relatedMolds.slice(0, 5).forEach(function(mold) {
      html += '<div class="related-item mold-related">' +
        '<span class="related-code mold-code">' + escapeHtml(mold.MoldCode) + '</span>' +
        '<span class="related-name">' + escapeHtml(mold.MoldName || '') + '</span>' +
        '</div>';
    });
    html += '</div>';
  }
  
  if (item.customerInfo && item.customerInfo.CustomerID) {
    html += '<div class="sub-section customer-info">';
    html += '<h4 class="subsection-title customer-title">顧客情報 / Thông tin khách hàng</h4>';
    html += '<div class="info-row"><span class="info-label">顧客名</span><span class="info-value">' + escapeHtml(item.customerInfo.CustomerName || 'N/A') + '</span></div>';
    html += '<div class="info-row"><span class="info-label">会社</span><span class="info-value">' + escapeHtml(item.companyInfo ? item.companyInfo.CompanyName : 'N/A') + '</span></div>';
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  detailView.innerHTML = html;
}
// =================== MODAL CẬP NHẬT HOẠT ĐỘNG ĐẦY ĐỦ V4.381 ===================

// Location Modal - V4.381 FIX: Tách 2 trường vị trí
function showLocationModal() {
  if (!selectedItem) {
    alert('アイテムを選択してください / Vui lòng chọn một mục');
    return;
  }
  
  var modal = createModal('locationModal', '位置更新 / Cập nhật vị trí', 
    '<div class="form-group">' +
      '<label>現在位置 / Vị trí hiện tại</label>' +
      '<input type="text" value="' + escapeHtml(selectedItem.displayLocation) + '" readonly>' +
    '</div>' +
    '<div class="form-group-row">' +
      '<div class="form-group">' +
        '<label>新しい棚 / Giá mới <span class="required">*</span></label>' +
        '<select id="newRackSelect" required>' +
          '<option value="">選択してください / Chọn giá</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>新しい層 / Tầng mới <span class="required">*</span></label>' +
        '<select id="newLayerSelect" required>' +
          '<option value="">選択してください / Chọn tầng</option>' +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>担当者 / Người thực hiện <span class="required">*</span></label>' +
      '<select id="locationEmployee" required>' +
        '<option value="">選択してください / Chọn người</option>' +
      '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>備考 / Ghi chú</label>' +
      '<textarea id="locationNotes" rows="3" placeholder="位置変更の理由など..."></textarea>' +
    '</div>',
    updateLocationAction
  );
  
  populateRackOptions();
  populateEmployeeOptions('locationEmployee');
}

// Shipment Modal
function showShipmentModal() {
  if (!selectedItem) {
    alert('アイテムを選択してください / Vui lòng chọn một mục');
    return;
  }
  
  var modal = createModal('shipmentModal', '搬送更新 / Cập nhật vận chuyển',
    '<div class="form-group">' +
      '<label>出荷先 / Đến công ty <span class="required">*</span></label>' +
      '<select id="toCompany" required>' +
        '<option value="">選択してください / Chọn công ty</option>' +
      '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>出荷日 / Ngày vận chuyển</label>' +
      '<input type="date" id="shipmentDate" value="' + new Date().toISOString().split('T')[0] + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label>担当者 / Người thực hiện</label>' +
      '<input type="text" id="shipmentHandler" placeholder="担当者名を入力...">' +
    '</div>' +
    '<div class="form-group">' +
      '<label>備考 / Ghi chú</label>' +
      '<textarea id="shipmentNotes" rows="3" placeholder="搬送に関する備考..."></textarea>' +
    '</div>',
    updateShipmentAction
  );
  
  populateCompanyOptions();
}

// Teflon Modal - V4.381 FIX: Đúng giá trị TeflonCoating
function showTeflonModal() {
  if (!selectedItem || selectedItem.itemType !== 'mold') {
    alert('金型を選択してください / Vui lòng chọn khuôn');
    return;
  }
  
  var modal = createModal('teflonModal', 'テフロン更新 / Cập nhật mạ Teflon',
    '<div class="form-group">' +
      '<label>テフロン状態 / Trạng thái Teflon <span class="required">*</span></label>' +
      '<select id="teflonCoating" required>' +
        '<option value="">選択してください / Chọn trạng thái</option>' +
        '<option value="テフロン加工済">テフロン加工済 / Đã gia công Teflon</option>' +
        '<option value="テフロン加工まち">テフロン加工まち / Chờ gia công Teflon</option>' +
        '<option value="">未処理 / Chưa xử lý</option>' +
      '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>送信日 / Ngày gửi</label>' +
      '<input type="date" id="teflonSentDate">' +
    '</div>' +
    '<div class="form-group">' +
      '<label>受信日 / Ngày nhận</label>' +
      '<input type="date" id="teflonReceivedDate">' +
    '</div>' +
    '<div class="form-group">' +
      '<label>備考 / Ghi chú</label>' +
      '<textarea id="teflonNotes" rows="3" placeholder="テフロン処理に関する備考..."></textarea>' +
    '</div>',
    updateTeflonAction
  );
  
  // Pre-fill current values - V4.381 FIX
  if (selectedItem.TeflonCoating) {
    setTimeout(function() {
      var select = document.getElementById('teflonCoating');
      if (select) select.value = selectedItem.TeflonCoating;
    }, 100);
  }
  
  if (selectedItem.TeflonSentDate) {
    setTimeout(function() {
      var input = document.getElementById('teflonSentDate');
      if (input) input.value = selectedItem.TeflonSentDate;
    }, 100);
  }
  
  if (selectedItem.TeflonReceivedDate) {
    setTimeout(function() {
      var input = document.getElementById('teflonReceivedDate');
      if (input) input.value = selectedItem.TeflonReceivedDate;
    }, 100);
  }
}

// Comment Modal
function showCommentModal() {
  if (!selectedItem) {
    alert('アイテムを選択してください / Vui lòng chọn một mục');
    return;
  }
  
  var modal = createModal('commentModal', 'コメント追加 / Thêm ghi chú',
    '<div class="form-group">' +
      '<label>コメント / Nội dung <span class="required">*</span></label>' +
      '<textarea id="commentText" rows="4" required placeholder="コメントを入力してください..."></textarea>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>投稿者 / Người đăng <span class="required">*</span></label>' +
      '<select id="commentEmployee" required>' +
        '<option value="">選択してください / Chọn người</option>' +
      '</select>' +
    '</div>',
    addCommentAction
  );
  
  populateEmployeeOptions('commentEmployee');
}

// =================== MODAL CREATION AND MANAGEMENT ===================
function createModal(id, title, content, onSubmit) {
  // Remove existing modal
  var existing = document.getElementById(id);
  if (existing) existing.remove();
  
  var modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal-overlay';
  modal.innerHTML = 
    '<div class="modal-content ' + (selectedItem ? selectedItem.itemType : 'mold') + '">' +
      '<div class="modal-header">' +
        '<h3>' + title + '</h3>' +
        '<button class="modal-close" onclick="closeModal(\'' + id + '\')">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        content +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-secondary" onclick="closeModal(\'' + id + '\')">キャンセル / Hủy</button>' +
          '<button type="button" class="btn-primary" onclick="document.getElementById(\'' + id + '\').submitAction()">保存 / Lưu</button>' +
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

// =================== MODAL ACTION FUNCTIONS V4.381 ===================
function updateLocationAction() {
  var newRack = document.getElementById('newRackSelect').value;
  var newLayer = document.getElementById('newLayerSelect').value;
  var employee = document.getElementById('locationEmployee').value;
  var notes = document.getElementById('locationNotes').value;
  
  if (!newRack) {
    alert('新しい棚を選択してください / Vui lòng chọn giá mới');
    return;
  }
  
  if (!newLayer) {
    alert('新しい層を選択してください / Vui lòng chọn tầng mới');
    return;
  }
  
  if (!employee) {
    alert('担当者を選択してください / Vui lòng chọn người thực hiện');
    return;
  }
  
  showLoading(true);
  
  var newLocationLogEntry = {
    LocationLogID: String(Date.now()),
    OldRackLayer: selectedItem.RackLayerID || '',
    NewRackLayer: newLayer,
    MoldID: selectedItem.itemType === 'mold' ? selectedItem.MoldID : '',
    CutterID: selectedItem.itemType === 'cutter' ? selectedItem.CutterID : '',
    DateEntry: new Date().toISOString(),
    notes: notes.trim()
  };
  
  var itemUpdates = {
    RackLayerID: newLayer,
    storage_company: '2'
  };
  
  callBackendApi('/api/add-log', {
    endpoint: 'locationlog.csv',
    data: newLocationLogEntry
  }).then(function() {
    return callBackendApi('/api/update-item', {
      endpoint: selectedItem.itemType === 'mold' ? 'molds.csv' : 'cutters.csv',
      data: {
        itemId: selectedItem.MoldID || selectedItem.CutterID,
        idField: selectedItem.itemType === 'mold' ? 'MoldID' : 'CutterID',
        updatedFields: itemUpdates
      }
    });
  }).then(function() {
    return new Promise(function(resolve) { setTimeout(resolve, 3000); });
  }).then(function() {
    return loadAllData();
  }).then(function() {
    closeModal('locationModal'); // V4.381 FIX: Tự động đóng modal
    showSuccess('位置が更新されました / Đã cập nhật vị trí');
    performSearch();
    if (selectedItem) {
      renderDetailSection(); // Refresh detail view nếu đang mở
    }
  }).catch(function(error) {
    console.error('Location update failed:', error);
    showError('位置更新に失敗しました / Cập nhật vị trí thất bại: ' + error.message);
  }).finally(function() {
    showLoading(false);
  });
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
  
  showLoading(true);
  
  var newShipLogEntry = {
    ShipLogID: String(Date.now()),
    FromCompanyID: '2',
    ToCompanyID: toCompany,
    MoldID: selectedItem.itemType === 'mold' ? selectedItem.MoldID : '',
    CutterID: selectedItem.itemType === 'cutter' ? selectedItem.CutterID : '',
    DateEntry: date ? new Date(date).toISOString() : new Date().toISOString(),
    handler: handler.trim(),
    ShipNotes: notes.trim()
  };
  
  callBackendApi('/api/add-log', {
    endpoint: 'shiplog.csv',
    data: newShipLogEntry
  }).then(function() {
    return new Promise(function(resolve) { setTimeout(resolve, 3000); });
  }).then(function() {
    return loadAllData();
  }).then(function() {
    closeModal('shipmentModal'); // V4.381 FIX: Tự động đóng modal
    showSuccess('搬送情報が更新されました / Đã cập nhật thông tin vận chuyển');
    performSearch();
    if (selectedItem) {
      renderDetailSection(); // Refresh detail view
    }
  }).catch(function(error) {
    console.error('Shipment update failed:', error);
    showError('搬送更新に失敗しました / Cập nhật vận chuyển thất bại: ' + error.message);
  }).finally(function() {
    showLoading(false);
  });
}

function updateTeflonAction() {
  var coating = document.getElementById('teflonCoating').value;
  var sentDate = document.getElementById('teflonSentDate').value;
  var receivedDate = document.getElementById('teflonReceivedDate').value;
  var notes = document.getElementById('teflonNotes').value;
  
  if (!coating && coating !== '') {
    alert('テフロン状態を選択してください / Vui lòng chọn trạng thái Teflon');
    return;
  }
  
  showLoading(true);
  
  var teflonUpdates = {};
  teflonUpdates.TeflonCoating = coating; // V4.381 FIX: Cho phép giá trị rỗng
  if (sentDate) teflonUpdates.TeflonSentDate = sentDate;
  if (receivedDate) teflonUpdates.TeflonReceivedDate = receivedDate;
  if (notes.trim()) {
    // V4.381 FIX: Append to existing notes
    var existingNotes = selectedItem.MoldNotes || '';
    teflonUpdates.MoldNotes = existingNotes ? existingNotes + '\n' + notes.trim() : notes.trim();
  }
  
  console.log('V4.381 Teflon update payload:', teflonUpdates);
  
  callBackendApi('/api/update-item', {
    endpoint: 'molds.csv',
    data: {
      itemId: selectedItem.MoldID,
      idField: 'MoldID',
      updatedFields: teflonUpdates
    }
  }).then(function() {
    return new Promise(function(resolve) { setTimeout(resolve, 3000); });
  }).then(function() {
    return loadAllData();
  }).then(function() {
    closeModal('teflonModal'); // V4.381 FIX: Tự động đóng modal
    showSuccess('テフロン情報が更新されました / Đã cập nhật thông tin mạ Teflon');
    performSearch();
    if (selectedItem) {
      renderDetailSection(); // Refresh detail view
    }
  }).catch(function(error) {
    console.error('Teflon update failed:', error);
    showError('テフロン更新に失敗しました / Cập nhật Teflon thất bại: ' + error.message);
  }).finally(function() {
    showLoading(false);
  });
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
  
  showLoading(true);
  
  var newCommentEntry = {
    UserCommentID: String(Date.now()),
    ItemID: selectedItem.MoldID || selectedItem.CutterID,
    ItemType: selectedItem.itemType,
    CommentText: text,
    EmployeeID: employee,
    DateEntry: new Date().toISOString(),
    CommentStatus: 'active'
  };
  
  callBackendApi('/api/add-log', {
    endpoint: 'usercomments.csv',
    data: newCommentEntry
  }).then(function() {
    return new Promise(function(resolve) { setTimeout(resolve, 3000); });
  }).then(function() {
    return loadAllData();
  }).then(function() {
    closeModal('commentModal'); // V4.381 FIX: Tự động đóng modal
    showSuccess('コメントが追加されました / Đã thêm ghi chú');
    if (selectedItem) {
      renderDetailSection(); // Refresh detail view
    }
  }).catch(function(error) {
    console.error('Comment add failed:', error);
    showError('コメント追加に失敗しました / Thêm ghi chú thất bại: ' + error.message);
  }).finally(function() {
    showLoading(false);
  });
}

// =================== POPULATE FORM OPTIONS V4.381 ===================
function populateRackOptions() {
  var rackSelect = document.getElementById('newRackSelect');
  var layerSelect = document.getElementById('newLayerSelect');
  if (!rackSelect || !layerSelect) return;
  
  // Populate racks
  var racks = {};
  for (var i = 0; i < allData.racks.length; i++) {
    var rack = allData.racks[i];
    racks[rack.RackID] = rack;
    var option = document.createElement('option');
    option.value = rack.RackID;
    option.textContent = rack.RackLocation + ' (' + rack.RackID + ')';
    rackSelect.appendChild(option);
  }
  
  // Handle rack selection change
  rackSelect.addEventListener('change', function() {
    layerSelect.innerHTML = '<option value="">選択してください / Chọn tầng</option>';
    
    if (this.value) {
      for (var i = 0; i < allData.racklayers.length; i++) {
        var layer = allData.racklayers[i];
        if (layer.RackID === this.value) {
          var option = document.createElement('option');
          option.value = layer.RackLayerID;
          option.textContent = '第' + layer.RackLayerNumber + '層 / Tầng ' + layer.RackLayerNumber;
          layerSelect.appendChild(option);
        }
      }
    }
  });
}

function populateCompanyOptions() {
  var select = document.getElementById('toCompany');
  if (!select) return;
  
  for (var i = 0; i < allData.companies.length; i++) {
    var company = allData.companies[i];
    if (company.CompanyID !== '2') {
      var option = document.createElement('option');
      option.value = company.CompanyID;
      option.textContent = company.CompanyShortName + ' - ' + company.CompanyName;
      select.appendChild(option);
    }
  }
}

function populateEmployeeOptions(selectId) {
  var select = document.getElementById(selectId);
  if (!select) return;
  
  for (var i = 0; i < allData.employees.length; i++) {
    var employee = allData.employees[i];
    var option = document.createElement('option');
    option.value = employee.EmployeeID;
    option.textContent = employee.EmployeeName;
    select.appendChild(option);
  }
}

// =================== PRINT FUNCTIONS V4.381 ===================
function printSelected() {
  if (selectedItems.size === 0) {
    alert('選択されたアイテムがありません / Không có mục nào được chọn');
    return;
  }
  
  var selectedData = filteredData.filter(function(item) {
    return selectedItems.has(item.MoldID || item.CutterID);
  });
  
  var printWindow = window.open('', '_blank', 'width=800,height=600');
  var printContent = '<!DOCTYPE html><html><head><title>印刷 / In - ' + (new Date()).toLocaleDateString('ja-JP') + '</title>' +
    '<style>body{font-family:Arial,sans-serif;margin:20px;}h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:10px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f5f5f5;font-weight:bold;}.mold-row{background-color:#e0f2fe;}.cutter-row{background-color:#fff7ed;}.print-info{margin-bottom:20px;color:#666;}</style></head><body>' +
    '<h1>金型・抜型管理システム V4.381</h1>' +
    '<div class="print-info">' + (new Date()).toLocaleString('ja-JP') + '<br>' + selectedData.length + ' 件のアイテム / mục</div>' +
    '<table><thead><tr>' +
    '<th>タイプ / Loại</th><th>IDNo</th><th>名前 / Tên</th><th>サイズ / Kích thước</th>' +
    '<th>位置 / Vị trí</th><th>会社 / Công ty</th><th>備考 / Ghi chú</th>' +
    '</tr></thead><tbody>' +
    selectedData.map(function(item) {
      var itemType = item.itemType === 'mold' ? '金型 / Khuôn' : '抜型 / Dao cắt';
      var itemId = item.itemType === 'cutter' ? (item.CutterNo || item.CutterID) : item.MoldID;
      var notes = item.itemType === 'cutter' ? (item.CutterNote || 'N/A') : (item.MoldNotes || 'N/A');
      return '<tr class="' + item.itemType + '-row">' +
        '<td>' + itemType + '</td>' +
        '<td>' + escapeHtml(itemId) + '</td>' +
        '<td>' + escapeHtml(item.displayName || 'N/A') + '</td>' +
        '<td>' + escapeHtml(item.displayDimensions || 'N/A') + '</td>' +
        '<td>' + escapeHtml(item.displayLocation || 'N/A') + '</td>' +
        '<td>' + escapeHtml(item.storageCompany || 'N/A') + '</td>' +
        '<td>' + escapeHtml(notes) + '</td>' +
        '</tr>';
    }).join('') +
    '</tbody></table></body></html>';
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

function printDetail() {
  if (!selectedItem) return;
  
  var printWindow = window.open('', '_blank', 'width=800,height=600');
  var itemType = selectedItem.itemType === 'mold' ? '金型 / Khuôn' : '抜型 / Dao cắt';
  var itemId = selectedItem.itemType === 'cutter' ? (selectedItem.CutterNo || selectedItem.CutterID) : selectedItem.MoldID;
  
  var printContent = '<!DOCTYPE html><html><head><title>詳細印刷 / In chi tiết - ' + itemId + '</title>' +
    '<style>body{font-family:Arial,sans-serif;margin:20px;}h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:10px;}.detail-section{margin-bottom:20px;border:1px solid #ddd;padding:15px;}.detail-section h3{margin-top:0;color:#374151;}.info-row{display:flex;margin-bottom:8px;}.info-label{font-weight:bold;min-width:150px;}.info-value{flex:1;}.history-entry{margin-bottom:10px;padding:8px;background:#f9fafb;border-left:3px solid #3b82f6;}.print-info{margin-bottom:20px;color:#666;}</style></head><body>' +
    '<h1>金型・抜型管理システム V4.381</h1>' +
    '<div class="print-info">' + (new Date()).toLocaleString('ja-JP') + '<br>' + itemType + ': ' + itemId + '</div>' +
    document.getElementById('detailView').innerHTML.replace(/<button[^>]*>.*?<\/button>/gi, '') +
    '</body></html>';
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

function zoomFit() {
  if (document.body.requestFullscreen) document.body.requestFullscreen();
  else if (document.body.webkitRequestFullscreen) document.body.webkitRequestFullscreen();
}

// =================== GLOBAL FUNCTIONS FOR ONCLICK HANDLERS V4.381 ===================
window.toggleCategory = toggleCategory;
window.clearSearch = clearSearch;
window.resetFilters = resetFilters;
window.handleFieldFilterChange = handleFieldFilterChange;
window.handleValueFilterChange = handleValueFilterChange;
window.toggleSelectAll = toggleSelectAll;
window.selectAll = selectAll;
window.clearSelection = clearSelection;
window.toggleItemSelection = toggleItemSelection;
window.showLocationModal = showLocationModal;
window.showShipmentModal = showShipmentModal;
window.showTeflonModal = showTeflonModal;
window.showCommentModal = showCommentModal;
window.closeModal = closeModal;
window.printSelected = printSelected;
window.printDetail = printDetail;
window.backToFullResults = backToFullResults;
window.selectSuggestion = selectSuggestion;
window.clearSearchHistory = clearSearchHistory;
window.callBackendApi = callBackendApi;
window.sortTable = sortTable;
window.zoomFit = zoomFit;

// =================== VERSION INFORMATION ===================
window.MOLDCUTTERSEARCH_VERSION = 'V4.381';
window.MOLDCUTTERSEARCH_BUILD = new Date().toISOString();

console.log('🎉 ' + window.MOLDCUTTERSEARCH_VERSION + ' initialized successfully');
console.log('📱 V4.381 Script loaded - iPad 4 optimized, Enhanced UI Fixes');
console.log('🔧 Features: 3 column layout, 7 detail columns with colors, working modals');
console.log('✅ Fixed: Enhanced search input, quick results, table sort, location modal 2 fields');
console.log('✅ Fixed: TeflonCoating values, auto-close modals, status logic, カッター→抜型');
console.log('✅ Fixed: Related items highlight, table colors, print functions');
console.log('📊 Full business logic preserved from V4.31');
console.log('🚀 Ready for production use!');

// =================== PERFORMANCE MONITORING ===================
var performanceMonitor = {
  searchTimes: [],
  averageSearchTime: 0,
  recordSearchTime: function(startTime) {
    var endTime = performance.now();
    var searchTime = endTime - startTime;
    this.searchTimes.push(searchTime);
    if (this.searchTimes.length > 100) {
      this.searchTimes.shift();
    }
    this.averageSearchTime = this.searchTimes.reduce(function(a, b) { return a + b; }, 0) / this.searchTimes.length;
    if (searchTime > 1000) {
      console.warn('Slow search detected:', searchTime.toFixed(2) + 'ms');
    }
  }
};

// Enhanced search with performance monitoring
var originalPerformSearch = performSearch;
performSearch = function() {
  var startTime = performance.now();
  var result = originalPerformSearch.apply(this, arguments);
  performanceMonitor.recordSearchTime(startTime);
  return result;
};

// =================== MOBILE OPTIMIZATIONS ===================
function optimizeForMobile() {
  if (window.innerWidth <= 768) {
    pageSize = Math.min(pageSize, 25);
    var table = document.getElementById('dataTable');
    if (table) {
      table.classList.add('mobile-optimized');
    }
  }
}

window.addEventListener('resize', optimizeForMobile);
window.addEventListener('orientationchange', optimizeForMobile);

// =================== ACCESSIBILITY ENHANCEMENTS ===================
function enhanceAccessibility() {
  var searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.setAttribute('aria-describedby', 'search-help');
    searchInput.setAttribute('role', 'combobox');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.setAttribute('aria-autocomplete', 'list');
  }
}

document.addEventListener('DOMContentLoaded', enhanceAccessibility);

// =================== EXPORT FOR GLOBAL ACCESS ===================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    version: 'V4.381',
    performSearch: performSearch,
    loadAllData: loadAllData,
    showDetailView: showDetailView,
    printSelected: printSelected,
    printDetail: printDetail,
    showLocationModal: showLocationModal,
    showShipmentModal: showShipmentModal,
    showTeflonModal: showTeflonModal,
    showCommentModal: showCommentModal,
    sortTable: sortTable
  };
}

// =================== KẾT THÚC SCRIPT V4.381 ===================
console.log('✅ V4.381 Script.js hoàn chỉnh - Professional iPad 4 optimized');
console.log('🔧 Enhanced UI fixes: search input, quick results, table sort, modals');
console.log('📱 3 column layout, 7 detail columns with colors, working backend');
console.log('🚀 Ready for production use with all requested fixes!');
