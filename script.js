// script.js - V4.37 Complete based on V4.31 working version
// Tích hợp đầy đủ nghiệp vụ, 7 cột chi tiết, TeflonCoating và bình luận đúng

// =================== CẤU HÌNH VÀ BIẾN TOÀN CỤC ===================
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";
const API_BASE_URL = "https://ysd-moldcutter-backend.onrender.com";

// Global variables theo V4.31
let allData = {
  molds: [], cutters: [], customers: [], molddesign: [], moldcutter: [],
  shiplog: [], locationlog: [], employees: [], racklayers: [], racks: [],
  companies: [], usercomments: [], jobs: [], processingitems: []
};

let filteredData = [];
let selectedItems = new Set();
let currentPage = 1;
let pageSize = 50;
let sortField = '';
let sortDirection = 'asc';
let searchTimeout = null;
let currentCategory = 'all';
let currentView = 'table';
let selectedItem = null;

// Search history & suggestions V4.31 working logic
let searchHistory = [];
let suggestionIndex = -1;
let isShowingSuggestions = false;
let hideTimeout = null;

// Enhanced filter fields với tất cả trường cần thiết cho V4.31
const FILTER_FIELDS = {
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
    {value: 'storageCompanyId', text: '保管会社ID / ID công ty'},
    {value: 'moldStatus', text: '状態 / Trạng thái'},
    {value: 'TeflonCoating', text: 'テフロン / Teflon'},
    {value: 'MoldReturning', text: '返却 / Trả lại'},
    {value: 'MoldDisposing', text: '廃棄 / Hủy bỏ'},
    {value: 'MoldNotes', text: '備考 / Ghi chú'},
    {value: 'CutterNote', text: 'カッター備考 / Ghi chú dao cắt'}
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
    {value: 'MoldReturning', text: '返却 / Trả lại'},
    {value: 'MoldDisposing', text: '廃棄 / Hủy bỏ'},
    {value: 'MoldNotes', text: '備考 / Ghi chú'}
  ],
  cutter: [
    {value: 'displayCode', text: 'CutterNo'},
    {value: 'displayName', text: '名前 / Tên'},
    {value: 'cutlineSize', text: 'Cutline'},
    {value: 'rackId', text: 'RackID'},
    {value: 'plasticCutType', text: 'プラスチックカット / Cắt nhựa'},
    {value: 'cutterType', text: 'カッタータイプ / Loại dao cắt'},
    {value: 'bladeCount', text: 'ブレード数 / Số lưỡi'},
    {value: 'storageCompany', text: '保管会社 / Công ty lưu trữ'},
    {value: 'CutterNote', text: '備考 / Ghi chú'}
  ]
};

// =================== KHỞI TẠO ỨNG DỤNG ===================
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing V4.37 Application based on V4.31...');
  
  // Load search history V4.31 working method
  loadSearchHistory();
  
  // Setup search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.focus();
  }
  setupSearchFunctionality();
  
  // Prevent zoom on mobile
  preventMobileZoom();
  
  // Load data and initialize
  if (isMainPage()) {
    initializeMainPage();
  }
});

// Check if current page is main page
function isMainPage() {
  const path = window.location.pathname;
  return path.includes('index.html') || path === '/' || path.endsWith('/');
}

// Initialize main page
async function initializeMainPage() {
  showLoading(true);
  try {
    await loadAllData();
    initializeFilters();
    restoreSearchState();
    performSearch();
    console.log('V4.37 Application initialized successfully');
  } catch (error) {
    console.error('Initialization error', error);
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Prevent mobile zoom
function preventMobileZoom() {
  const formElements = document.querySelectorAll('input, select, textarea');
  formElements.forEach(element => {
    element.style.fontSize = '16px';
    element.addEventListener('focus', function() {
      this.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  });
}

// =================== LOADING FUNCTIONS ===================
function showLoading(show) {
  const loading = document.getElementById('loadingIndicator');
  if (loading) loading.style.display = show ? 'flex' : 'none';
}

function showError(message) {
  console.error(message);
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
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
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
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
    
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] !== undefined ? values[index] : '';
    });
    return obj;
  });
}

// =================== ENHANCED DATA LOADING ===================
async function loadAllData() {
  const dataFiles = [
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
    {key: 'usercomments', file: 'usercomments.csv', required: false}, // FIX: Đảm bảo load usercomments
    {key: 'jobs', file: 'jobs.csv', required: false},
    {key: 'processingitems', file: 'processingitems.csv', required: false}
  ];

  const promises = dataFiles.map(async ({key, file, required}) => {
    try {
      console.log(`Loading ${file}...`);
      const response = await fetch(GITHUB_BASE_URL + file + '?t=' + Date.now());
      if (!response.ok) {
        if (required) throw new Error(`Required file ${file} not found`);
        console.warn(`Optional file ${file} not found`);
        return {key, data: []};
      }
      const csvText = await response.text();
      const data = parseCSV(csvText);
      console.log(`${file} loaded: ${data.length} records`);
      return {key, data};
    } catch (error) {
      if (required) throw error;
      console.warn(`Error loading ${file}:`, error);
      return {key, data: []};
    }
  });

  const results = await Promise.all(promises);
  results.forEach(({key, data}) => {
    allData[key] = data;
  });
  
  processDataRelationships();
}

// =================== DATE FORMATTING ===================
function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('ja-JP');
  } catch (e) {
    return dateString;
  }
}

function formatTimestamp(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  } catch (e) {
    return dateString;
  }
}
// =================== ENHANCED DATA PROCESSING VỚI ĐẦY ĐỦ RELATIONSHIPS ===================
function processDataRelationships() {
  console.log('Processing data relationships V4.37 based on V4.31...');
  
  // Create lookup maps theo V4.31 working logic
  const moldDesignMap = new Map(allData.molddesign.map(d => [d.MoldDesignID, d]));
  const customerMap = new Map(allData.customers.map(c => [c.CustomerID, c]));
  const companyMap = new Map(allData.companies.map(c => [c.CompanyID, c]));
  const rackMap = new Map(allData.racks.map(r => [r.RackID, r]));
  const rackLayerMap = new Map(allData.racklayers.map(rl => [rl.RackLayerID, rl]));
  const jobMap = new Map(allData.jobs.map(j => [j.MoldDesignID, j]));
  const processingItemMap = new Map(allData.processingitems.map(p => [p.ProcessingItemID, p]));

  // Process molds với enhanced data relationships theo V4.31
  allData.molds = allData.molds.map(mold => {
    const design = moldDesignMap.get(mold.MoldDesignID) || {};
    const customer = customerMap.get(mold.CustomerID) || {};
    const company = companyMap.get(customer.CompanyID) || {};
    const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};
    const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) : {};
    const storageCompany = companyMap.get(mold.storage_company) || {};
    const job = jobMap.get(mold.MoldDesignID) || {};
    const processingItem = processingItemMap.get(job.ProcessingItemID) || {};

    // Enhanced cutline size creation từ molddesign
    let cutlineSize = '';
    if (design.CutlineX && design.CutlineY) {
      cutlineSize = design.CutlineX + '×' + design.CutlineY;
    }

    // Enhanced mold status determination
    let moldStatus = 'Active';
    if (mold.MoldReturning === 'TRUE') {
      moldStatus = 'Returned';
    } else if (mold.MoldDisposing === 'TRUE') {
      moldStatus = 'Disposed';
    } else if (mold.MoldReturning === 'FALSE' && mold.MoldDisposing === 'FALSE') {
      moldStatus = 'In Use';
    }

    return {
      ...mold,
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
      // Enhanced fields cho V4.31
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
      // FIX: Đảm bảo TeflonCoating được đọc đúng từ CSV
      TeflonCoating: mold.TeflonCoating || '',
      TeflonSentDate: mold.TeflonSentDate || '',
      TeflonReceivedDate: mold.TeflonReceivedDate || '',
      itemType: 'mold'
    };
  });

  // Process cutters với enhanced data relationships theo V4.31
  allData.cutters = allData.cutters.map(cutter => {
    const customer = customerMap.get(cutter.CustomerID) || {};
    const company = companyMap.get(customer.CompanyID) || {};
    const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};
    const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) : {};
    const storageCompany = companyMap.get(cutter.storage_company) || {};

    // Enhanced cutline size creation từ cutter data
    let cutlineSize = '';
    if (cutter.CutlineLength && cutter.CutlineWidth) {
      cutlineSize = cutter.CutlineLength + '×' + cutter.CutlineWidth;
      if (cutter.CutterCorner) cutlineSize += '-' + cutter.CutterCorner;
      if (cutter.CutterChamfer) cutlineSize += '-' + cutter.CutterChamfer;
    }

    // Fixed display name for cutter - only show CutterName for column
    const displayName = cutter.CutterName || cutter.CutterDesignName || '';

    return {
      ...cutter,
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
      displayName: displayName, // Fixed: only CutterName, not CutterNo.CutterName
      displayDimensions: cutlineSize, // Use cutline size for cutter
      displayLocation: getDisplayLocation(rackLayer, rack),
      displayCustomer: getCustomerDisplayName(customer, company),
      displayStorageCompany: getStorageCompanyDisplay(cutter.storage_company, companyMap),
      displayRackLocation: rack.RackLocation || '',
      // Enhanced fields cho V4.31
      rackId: rackLayer.RackID || '',
      plasticCutType: cutter.PlasticCutType || '',
      cutterType: cutter.CutterType || '',
      bladeCount: cutter.BladeCount || '',
      cutlineSize: cutlineSize,
      storageCompany: storageCompany.CompanyShortName || storageCompany.CompanyName || '',
      storageCompanyId: cutter.storage_company || '',
      itemType: 'cutter'
    };
  });

  console.log('Processed', allData.molds.length, 'molds and', allData.cutters.length, 'cutters');
}

// =================== HELPER FUNCTIONS CHO DATA PROCESSING ===================
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
  let displayName = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
  if (company && company.CompanyShortName) {
    displayName = company.CompanyShortName + ' - ' + displayName;
  }
  return displayName;
}

function getStorageCompanyDisplay(storageCompanyId, companyMap) {
  if (!storageCompanyId) return {text: 'N/A', class: 'unknown'};
  const company = companyMap.get(storageCompanyId);
  if (!company) return {text: 'N/A', class: 'unknown'};
  const companyName = company.CompanyShortName || company.CompanyName || storageCompanyId;
  if (storageCompanyId === '2') {
    return {text: companyName, class: 'ysd'};
  }
  return {text: companyName, class: 'external'};
}

// =================== GET RELATED ITEMS V3.0 WORKING LOGIC ===================
function getRelatedCutters(moldID) {
  if (!moldID) return [];
  const relations = allData.moldcutter.filter(mc => mc.MoldID === moldID);
  return relations.map(rel => {
    const cutter = allData.cutters.find(c => c.CutterID === rel.CutterID);
    return cutter;
  }).filter(c => c && c.CutterID);
}

function getRelatedMolds(cutterID) {
  if (!cutterID) return [];
  const relations = allData.moldcutter.filter(mc => mc.CutterID === cutterID);
  return relations.map(rel => {
    const mold = allData.molds.find(m => m.MoldID === rel.MoldID);
    return mold;
  }).filter(m => m && m.MoldID);
}

// =================== GET SHIPPING HISTORY V3.0 WORKING ===================
function getShipHistory(itemType, itemID) {
  if (!itemID) return [];
  return allData.shiplog.filter(log => {
    if (itemType === 'MOLD') return log.MoldID === itemID;
    if (itemType === 'CUTTER') return log.CutterID === itemID;
    return false;
  }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

// =================== GET LOCATION HISTORY V3.0 WORKING ===================
function getLocationHistory(itemType, itemID) {
  if (!itemID) return [];
  return allData.locationlog.filter(log => {
    if (itemType === 'MOLD') return log.MoldID === itemID;
    if (itemType === 'CUTTER') return log.CutterID === itemID;
    return false;
  }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

// =================== GET CURRENT STATUS V3.0 WORKING LOGIC ===================
function getCurrentStatus(item) {
  if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
    return {status: 'returned', text: '返却済み / Đã trả lại', class: 'status-returned'};
  }
  if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
    return {status: 'disposed', text: '廃棄済み / Đã hủy bỏ', class: 'status-disposed'};
  }
  
  const history = getShipHistory(item.MoldID ? 'MOLD' : 'CUTTER', item.MoldID || item.CutterID);
  if (history.length > 0) {
    const latest = history[0];
    if (latest.ToCompanyID && latest.ToCompanyID !== 'YSD') {
      return {status: 'shipped', text: '出荷済み / Đã xuất hàng', class: 'status-shipped'};
    }
  }
  
  return {status: 'available', text: '利用可能 / Có sẵn', class: 'status-available'};
}

// =================== USER COMMENTS FUNCTIONS - FIX THEO V4.31 ===================
// FIX: Hàm getMoldUserCommentsFromServer theo V4.31 working logic
function getMoldUserCommentsFromServer(moldId) {
  console.log('=== DEBUG COMMENTS V4.31 ===');
  console.log('Looking for comments for moldId:', moldId);
  console.log('allData.usercomments total:', allData.usercomments?.length || 0);
  
  if (!allData.usercomments || allData.usercomments.length === 0) {
    console.warn('No usercomments data available');
    return [];
  }
  
  // FIX: Logic filter theo V4.31
  const serverComments = allData.usercomments.filter(comment => {
    // Enhanced matching - check both string and number
    const itemIdMatch = comment.ItemID === moldId || 
                       comment.ItemID === moldId.toString() ||
                       comment.ItemID.toString() === moldId.toString();
    
    // Enhanced type matching - case insensitive, allow empty
    const itemTypeMatch = !comment.ItemType || 
                         comment.ItemType.toLowerCase() === 'mold' ||
                         comment.ItemType === 'mold' ||
                         comment.ItemType === '';
    
    // Enhanced status matching - allow empty or active
    const statusMatch = !comment.CommentStatus || 
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
    
    return itemIdMatch && itemTypeMatch && statusMatch;
  });
  
  // Sort by date
  serverComments.sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
  
  console.log('Final comments found:', serverComments.length);
  console.log('=== END DEBUG ===');
  
  return serverComments;
}

// FIX: Hàm getCutterUserCommentsFromServer theo V4.31
function getCutterUserCommentsFromServer(cutterId) {
  console.log('=== DEBUG CUTTER COMMENTS V4.31 ===');
  console.log('Looking for comments for cutterId:', cutterId);
  console.log('allData.usercomments total:', allData.usercomments?.length || 0);
  
  if (!allData.usercomments || allData.usercomments.length === 0) {
    console.warn('No usercomments data available');
    return [];
  }
  
  const serverComments = allData.usercomments.filter(comment => {
    const itemIdMatch = comment.ItemID === cutterId || 
                       comment.ItemID === cutterId.toString() ||
                       comment.ItemID.toString() === cutterId.toString();
    
    const itemTypeMatch = !comment.ItemType || 
                         comment.ItemType.toLowerCase() === 'cutter' ||
                         comment.ItemType === 'cutter' ||
                         comment.ItemType === '';
    
    const statusMatch = !comment.CommentStatus || 
                       comment.CommentStatus === 'active' ||
                       comment.CommentStatus === 'Active' ||
                       comment.CommentStatus === '';
    
    return itemIdMatch && itemTypeMatch && statusMatch;
  });
  
  serverComments.sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
  
  console.log('Final cutter comments found:', serverComments.length);
  console.log('=== END DEBUG ===');
  
  return serverComments;
}

// =================== SERVER INTEGRATION FUNCTIONS V3.0 BACKEND LOGIC ===================
// Fix callBackendApi function in script.js V4.31
async function callBackendApi(endpoint, payload) {
  console.log('FRONTEND GLOBAL: Calling API', API_BASE_URL + endpoint, 'with payload:', payload);
  
  try {
    const response = await fetch(API_BASE_URL + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload), // FIX: đúng format cho server V3.0
    });
    
    if (!response.ok) {
      // FIX: đọc error text trước khi throw
      let errorText;
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = `HTTP ${response.status}`;
      }
      throw new Error(`Server error ${response.status}: ${errorText}`);
    }
    
    // FIX: xử lý response JSON
    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      // Nếu không phải JSON, tạo response mặc định
      responseData = { success: true, message: 'Operation completed' };
    }
    
    console.log('FRONTEND GLOBAL: API call successful for', endpoint, responseData);
    return responseData;
    
  } catch (error) {
    console.error('FRONTEND GLOBAL: API call to', endpoint, 'FAILED:', error.message);
    throw error; // Re-throw để detail-mold.js xử lý
  }
}

// =================== ENHANCED SEARCH FUNCTIONALITY ===================
function setupSearchFunctionality() {
  const searchInput = document.getElementById('searchInput');
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
    setTimeout(() => {
      if (document.activeElement === this) {
        showSearchSuggestions();
      }
    }, 100);
  });
  
  searchInput.addEventListener('blur', function() {
    hideSearchSuggestions(false);
  });
  
  // Click outside handler
  document.addEventListener('click', function(e) {
    const searchContainer = e.target.closest('.search-input-container');
    const suggestionContainer = e.target.closest('.search-suggestions');
    if (!searchContainer && !suggestionContainer) {
      hideSearchSuggestions(true);
    }
  });
  
  console.log('Search functionality setup completed');
}

function handleSearchInput() {
  updateClearSearchButton();
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  searchTimeout = setTimeout(() => {
    performSearch();
    updateSearchSuggestions();
  }, 300);
}

function updateClearSearchButton() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput && clearBtn) {
    const hasValue = searchInput.value.trim().length > 0;
    clearBtn.style.display = hasValue ? 'flex' : 'none';
  }
}

function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    updateClearSearchButton();
    hideSearchSuggestions(true);
    performSearch();
    searchInput.focus();
  }
}

// =================== SEARCH HISTORY & SUGGESTIONS ===================
function loadSearchHistory() {
  try {
    const saved = localStorage.getItem('moldSearchHistory');
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
  
  const trimmedQuery = query.trim();
  const now = new Date();
  
  // Remove existing entry if exists
  searchHistory = searchHistory.filter(item => item.query !== trimmedQuery);
  
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
// =================== SEARCH SUGGESTIONS & SMART SEARCH ===================
function showSearchSuggestions() {
  const searchInput = document.getElementById('searchInput');
  const suggestionsContainer = document.getElementById('searchSuggestions');
  if (!searchInput || !suggestionsContainer) {
    console.warn('Search suggestions elements not found');
    return;
  }
  
  const query = searchInput.value.trim();
  
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
  const suggestionsContainer = document.getElementById('searchSuggestions');
  if (!suggestionsContainer) return;
  
  if (immediate) {
    suggestionsContainer.style.display = 'none';
    isShowingSuggestions = false;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  } else {
    hideTimeout = setTimeout(() => {
      suggestionsContainer.style.display = 'none';
      isShowingSuggestions = false;
    }, 150);
  }
}

function updateSearchSuggestions(query) {
  const suggestionsList = document.getElementById('suggestionsList');
  if (!suggestionsList) {
    console.warn('Suggestions list element not found');
    return;
  }
  
  let html = '';
  
  // Show search history
  const history = getRecentSearchHistory();
  if (history.length > 0) {
    html += '<div class="suggestions-section">';
    html += '<div class="suggestions-section-title">履歴 / Lịch sử</div>';
    history.forEach(item => {
      const highlightedQuery = query ? highlightMatch(item.query, query) : item.query;
      html += `<div class="suggestion-item" onclick="selectSuggestion('${escapeHtml(item.query)}')">`;
      html += `<div class="suggestion-text">${highlightedQuery}</div>`;
      html += '<div class="suggestion-meta">';
      html += `<span class="suggestion-count">${item.results}</span>`;
      html += `<span class="suggestion-time">${formatRelativeTime(item.timestamp)}</span>`;
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  
  // Show smart suggestions based on current data
  if (query.length >= 1) {
    const smartSuggestions = generateSmartSuggestions(query);
    if (smartSuggestions.length > 0) {
      html += '<div class="suggestions-section">';
      html += '<div class="suggestions-section-title">候補 / Gợi ý</div>';
      smartSuggestions.forEach(suggestion => {
        const highlightedSuggestion = highlightMatch(suggestion, query);
        html += `<div class="suggestion-item" onclick="selectSuggestion('${escapeHtml(suggestion)}')">`;
        html += `<div class="suggestion-text">${highlightedSuggestion}</div>`;
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
  const suggestions = new Set();
  const queryLower = query.toLowerCase();
  
  // Search in all data for matching patterns
  const allItems = allData.molds.concat(allData.cutters);
  allItems.forEach(item => {
    // Check various fields for partial matches
    const fields = [
      item.displayCode, item.displayName, item.displayDimensions, item.cutlineSize,
      item.designInfo?.DrawingNumber,
      item.designInfo?.EquipmentCode,
      item.MoldCode, item.CutterNo
    ].filter(field => field && field.toString().trim());
    
    fields.forEach(field => {
      const fieldStr = field.toString().toLowerCase();
      if (fieldStr.includes(queryLower) && fieldStr !== queryLower) {
        suggestions.add(field.toString());
      }
    });
  });
  
  return Array.from(suggestions).slice(0, 5);
}

function highlightMatch(text, query) {
  if (!query) return text;
  const regex = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function formatRelativeTime(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return '今 / Vừa xong';
  if (diffMins < 60) return `${diffMins}分前 / ${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours}時間前 / ${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays}日前 / ${diffDays} ngày trước`;
  return time.toLocaleDateString('ja-JP');
}

function selectSuggestion(query) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = query;
    updateClearSearchButton();
    hideSearchSuggestions(true);
    performSearch();
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

function getRecentSearchHistory() {
  return searchHistory
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
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
  const fieldFilter = document.getElementById('fieldFilterA');
  if (!fieldFilter) return;
  
  fieldFilter.innerHTML = '<option value="all">全項目 / Tất cả trường</option>';
  
  const fields = FILTER_FIELDS[currentCategory] || FILTER_FIELDS.all;
  fields.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.text;
    fieldFilter.appendChild(optionElement);
  });
}

function updateValueFilter() {
  const fieldFilter = document.getElementById('fieldFilterA');
  const valueFilter = document.getElementById('valueFilterB');
  if (!fieldFilter || !valueFilter) return;
  
  const selectedField = fieldFilter.value;
  valueFilter.innerHTML = '<option value="all">全て / Tất cả</option>';
  
  if (selectedField === 'all') return;
  
  let dataToAnalyze;
  if (currentCategory === 'mold') {
    dataToAnalyze = allData.molds;
  } else if (currentCategory === 'cutter') {
    dataToAnalyze = allData.cutters;
  } else {
    dataToAnalyze = allData.molds.concat(allData.cutters);
  }
  
  const uniqueValues = new Set();
  dataToAnalyze.forEach(item => {
    const value = item[selectedField];
    if (value && value.toString().trim()) {
      uniqueValues.add(value.toString().trim());
    }
  });
  
  Array.from(uniqueValues).sort().forEach(value => {
    const option = document.createElement('option');
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

function toggleCategory() {
  const categories = ['all', 'mold', 'cutter'];
  const currentIndex = categories.indexOf(currentCategory);
  const nextIndex = (currentIndex + 1) % categories.length;
  currentCategory = categories[nextIndex];
  updateCategoryDisplay();
  updateFieldFilter();
  updateValueFilter();
  performSearch();
}

function updateCategoryDisplay() {
  const categoryToggle = document.getElementById('categoryToggle');
  const categoryText = document.getElementById('categoryText');
  if (categoryToggle && categoryText) {
    categoryToggle.className = 'category-toggle ' + currentCategory;
    const categoryNames = {
      'all': '全て / Tất cả',
      'mold': '金型 / Khuôn',
      'cutter': 'カッター / Dao cắt'
    };
    categoryText.textContent = categoryNames[currentCategory];
  }
}

// =================== ENHANCED MAIN SEARCH FUNCTION ===================
function performSearch() {
  const query = document.getElementById('searchInput')?.value.trim() || '';
  const fieldFilter = document.getElementById('fieldFilterA')?.value || 'all';
  const valueFilter = document.getElementById('valueFilterB')?.value || 'all';
  
  console.log('Performing search V4.37:', query, fieldFilter, valueFilter, currentCategory);
  
  if (query) {
    addToSearchHistory(query);
  }
  
  let dataToSearch;
  if (currentCategory === 'mold') {
    dataToSearch = allData.molds;
  } else if (currentCategory === 'cutter') {
    dataToSearch = allData.cutters;
  } else {
    dataToSearch = allData.molds.concat(allData.cutters);
  }
  
  // Apply field filter first
  let preFilteredData = dataToSearch;
  if (fieldFilter !== 'all' && valueFilter !== 'all') {
    preFilteredData = dataToSearch.filter(item => {
      return item[fieldFilter] && item[fieldFilter].toString() === valueFilter;
    });
  }
  
  // Enhanced text search with cutline size support and comma separation
  filteredData = preFilteredData.filter(item => {
    if (!query) return true;
    
    const keywords = query.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    
    if (keywords.length === 0) return true;
    
    return keywords.every(keyword => {
      // Enhanced search fields with cutline size support
      const searchFields = [
        item.displayCode, item.displayName, item.displayDimensions, item.displayLocation,
        item.displayCustomer, item.MoldID, item.CutterID, item.MoldCode, item.CutterNo,
        item.MoldName, item.CutterName, item.CutterDesignName,
        item.designInfo?.TextContent,
        item.designInfo?.DrawingNumber,
        item.designInfo?.EquipmentCode,
        item.designInfo?.DesignForPlasticType,
        item.designInfo?.MoldSetupType,
        item.designInfo?.PieceCount,
        item.cutlineSize, // Enhanced cutline size search
        item.PlasticCutType,
        item.CutterType,
        item.BladeCount,
        item.MoldNotes,
        item.CutterNote,
        item.rackInfo?.RackLocation,
        item.storageCompanyInfo?.CompanyName || item.storageCompanyInfo?.CompanyShortName,
        item.storageCompany,
        item.moldStatus,
        item.jobInfo?.JobName,
        item.processingItemInfo?.ProcessingItemName,
        item.TeflonCoating, // FIX: Include TeflonCoating in search
        item.MoldReturning,
        item.MoldDisposing,
        // Additional cutline search support
        item.designInfo?.CutlineX && item.designInfo?.CutlineY ? 
          item.designInfo.CutlineX + 'x' + item.designInfo.CutlineY : null,
        item.CutlineLength && item.CutlineWidth ? 
          item.CutlineLength + 'x' + item.CutlineWidth : null
      ].filter(field => field && field.toString().trim());
      
      return searchFields.some(field => 
        field.toString().toLowerCase().includes(keyword)
      );
    });
  });
  
  // Apply sorting
  if (sortField) {
    filteredData.sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      
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
  renderDetailSection();
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
      return item.displayStorageCompany?.text;
    case 'notes':
      return item.MoldNotes || item.CutterNote;
    default:
      return item[field];
  }
}

// =================== RESULTS DISPLAY ===================
function updateResultsDisplay() {
  updateResultsCount();
  renderQuickResults();
  renderFullResultsTable();
}

function updateResultsCount() {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    resultsCount.textContent = `${filteredData.length} 件 / ${filteredData.length} kết quả`;
  }
}

// =================== QUICK VIEW (PHẦN TRÊN) ===================
function renderQuickResults() {
  const container = document.getElementById('quickResults');
  if (!container) return;
  
  const quickData = filteredData.slice(0, 6);
  let html = '';
  
  for (let i = 0; i < quickData.length; i++) {
    const item = quickData[i];
    html += `<div class="quick-result-item ${item.itemType}" data-id="${item.MoldID || item.CutterID}" data-type="${item.itemType}">`;
    html += `<div class="quick-item-type">${item.itemType === 'mold' ? '金型' : 'カッター'}</div>`;
    html += `<div class="quick-item-code"><b>${escapeHtml(item.displayCode || item.CutterNo || item.MoldCode)}</b></div>`;
    html += `<div class="quick-item-name">${escapeHtml(item.displayName || '')}</div>`;
    html += `<div class="quick-item-location">${escapeHtml(item.displayLocation || '')}</div>`;
    html += `<div class="quick-item-status ${item.currentStatus?.class || ''}">${escapeHtml(item.currentStatus?.text || '')}</div>`;
    html += '</div>';
  }
  
  container.innerHTML = html;
  
  // Attach click handlers
  const items = container.querySelectorAll('.quick-result-item');
  items.forEach(item => {
    item.onclick = function() {
      const id = this.getAttribute('data-id');
      const type = this.getAttribute('data-type');
      showDetailView(id, type);
    };
  });
}

// =================== BẢNG KẾT QUẢ ĐẦY ĐỦ (PHẦN DƯỚI) ===================
function renderFullResultsTable() {
  const tbody = document.getElementById('dataTableBody');
  if (!tbody) return;
  
  let html = '';
  
  if (filteredData.length === 0) {
    html = '<tr><td colspan="9" style="text-align:center;">データが見つかりません / Không tìm thấy dữ liệu</td></tr>';
  } else {
    for (let i = 0; i < filteredData.length; i++) {
      const item = filteredData[i];
      const id = item.MoldID || item.CutterID;
      const isSelected = selectedItems.has(id);
      
      html += `<tr class="${item.itemType}-row${isSelected ? ' selected' : ''}" data-id="${id}">`;
      html += `<td class="col-select"><input type="checkbox" data-id="${id}" ${isSelected ? 'checked' : ''} onchange="toggleItemSelection('${id}', this.checked)"></td>`;
      html += `<td class="col-id">${escapeHtml(id)}</td>`;
      html += `<td class="col-name">${escapeHtml(item.displayName)}</td>`;
      html += `<td class="col-size">${escapeHtml(item.displayDimensions || item.cutlineSize || '')}</td>`;
      html += `<td class="col-location">${escapeHtml(item.displayLocation)}</td>`;
      html += `<td class="col-rack-location">${escapeHtml(item.displayRackLocation)}</td>`;
      html += `<td class="col-company">${escapeHtml(item.displayStorageCompany?.text || item.displayStorageCompany || '')}</td>`;
      html += `<td class="col-status">${escapeHtml(item.moldStatus || 'Active')}</td>`;
      html += `<td class="col-notes">${escapeHtml(item.MoldNotes || item.CutterNote || '')}</td>`;
      html += '</tr>';
    }
  }
  
  tbody.innerHTML = html;
  
  // Update select all checkbox state
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    const totalCheckboxes = filteredData.length;
    selectAllCheckbox.checked = selectedItems.size === totalCheckboxes && totalCheckboxes > 0;
    selectAllCheckbox.indeterminate = selectedItems.size > 0 && selectedItems.size < totalCheckboxes;
  }
  
  updateSelectionDisplay();
}

// =================== HIỂN THỊ CHI TIẾT (PHẦN DƯỚI) - 7 CỘT ===================
function showDetailView(id, type) {
  const dataArray = (type === 'cutter') ? allData.cutters : allData.molds;
  selectedItem = null;
  
  for (let i = 0; i < dataArray.length; i++) {
    if ((dataArray[i].MoldID || dataArray[i].CutterID) == id) {
      selectedItem = dataArray[i];
      break;
    }
  }
  
  if (!selectedItem) return;
  
  const detailView = document.getElementById('detailView');
  const fullResultsTable = document.getElementById('fullResultsTable');
  
  if (detailView && fullResultsTable) {
    detailView.classList.add('visible');
    fullResultsTable.classList.add('hidden');
  }
  
  renderDetailSection();
  updateActionButtons();
}

function backToFullResults() {
  selectedItem = null;
  const detailView = document.getElementById('detailView');
  const fullResultsTable = document.getElementById('fullResultsTable');
  
  if (detailView && fullResultsTable) {
    detailView.classList.remove('visible');
    fullResultsTable.classList.remove('hidden');
  }
  
  updateActionButtons();
}

function updateActionButtons() {
  const hasSelection = selectedItem !== null;
  const updateLocationBtn = document.getElementById('updateLocationBtn');
  const updateShipmentBtn = document.getElementById('updateShipmentBtn');
  const updateTeflonBtn = document.getElementById('updateTeflonBtn');
  const updateCommentBtn = document.getElementById('updateCommentBtn');
  
  if (updateLocationBtn) updateLocationBtn.disabled = !hasSelection;
  if (updateShipmentBtn) updateShipmentBtn.disabled = !hasSelection;
  if (updateTeflonBtn) updateTeflonBtn.disabled = !hasSelection;
  if (updateCommentBtn) updateCommentBtn.disabled = !hasSelection;
}

// =================== UTILITY FUNCTIONS ===================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function resetFilters() {
  const fieldFilter = document.getElementById('fieldFilterA');
  const valueFilter = document.getElementById('valueFilterB');
  if (fieldFilter) fieldFilter.value = 'all';
  if (valueFilter) valueFilter.value = 'all';
  performSearch();
}
// =================== CHI TIẾT ĐẦY ĐỦ 7 CỘT - FIX TEFLONCOATING VÀ BÌNH LUẬN ===================
function renderDetailSection() {
  const detailContent = document.getElementById('detailContent');
  if (!detailContent) return;
  
  if (!selectedItem) {
    detailContent.innerHTML = '<div style="text-align:center; padding:40px; color:#9ca3af; font-style: italic;">アイテムを選択してください / Vui lòng chọn một kết quả để xem chi tiết</div>';
    return;
  }
  
  const item = selectedItem;
  
  if (item.itemType === 'mold') {
    renderMoldDetailData(item);
  } else {
    renderCutterDetailData(item);
  }
}

// Render mold detail data với 7 cột theo V4.31 logic
function renderMoldDetailData(item) {
  const detailContent = document.getElementById('detailContent');
  if (!detailContent) return;
  
  const design = item.designInfo || {};
  const job = item.jobInfo || {};
  const status = item.currentStatus || {text: 'N/A', class: ''};
  
  // Calculate dimensions
  let moldDimensions = 'N/A';
  if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
    moldDimensions = design.MoldDesignLength + '×' + design.MoldDesignWidth + '×' + design.MoldDesignHeight;
  } else if (design.MoldDesignDim) {
    moldDimensions = design.MoldDesignDim;
  }
  
  let productDimensions = 'N/A';
  if (design.CutlineX && design.CutlineY) {
    productDimensions = design.CutlineX + '×' + design.CutlineY;
  }
  
  const firstShipDate = job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A';
  
  let html = '<div class="detail-grid-7">';
  
  // 1. Thông tin cơ bản
  html += '<div class="detail-section">';
  html += '<h3>基本情報 / Thông tin cơ bản</h3>';
  html += `<div class="info-row"><span class="info-label">ID</span><span class="info-value muted">${item.MoldID}</span></div>`;
  html += `<div class="info-row"><span class="info-label">金型コード / Mã khuôn</span><span class="info-value highlight">${escapeHtml(item.MoldCode)}</span></div>`;
  html += `<div class="info-row"><span class="info-label">金型名 / Tên khuôn</span><span class="info-value">${escapeHtml(item.MoldName || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">状態 / Trạng thái</span><span class="info-value ${status.class}">${status.text}</span></div>`;
  html += `<div class="info-row"><span class="info-label">トレイ情報 / Thông tin khay</span><span class="info-value">${escapeHtml(design.TrayInfoForMoldDesign || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">材質 / Chất liệu</span><span class="info-value">${escapeHtml(design.DesignForPlasticType || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">生産日 / Ngày sản xuất</span><span class="info-value">${firstShipDate}</span></div>`;
  html += `<div class="info-row"><span class="info-label">取り数 / Số mặt</span><span class="info-value">${escapeHtml(design.PieceCount || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">寸法 / Kích thước</span><span class="info-value">${moldDimensions}</span></div>`;
  html += `<div class="info-row"><span class="info-label">金型重量 / Khối lượng khuôn</span><span class="info-value">${item.MoldWeight ? item.MoldWeight + ' kg' : 'N/A'}</span></div>`;
  html += `<div class="info-row"><span class="info-label">製品寸法 / Kích thước SP</span><span class="info-value">${productDimensions}</span></div>`;
  html += '</div>';
  
  // 2. Design info
  html += '<div class="detail-section">';
  html += '<h3>設計情報 / Thông tin thiết kế</h3>';
  html += `<div class="info-row"><span class="info-label">設計コード / Mã thiết kế</span><span class="info-value">${escapeHtml(design.MoldDesignCode || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">金型向き / Hướng khuôn</span><span class="info-value">${escapeHtml(design.MoldOrientation || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">ポケット数 / Số pockets</span><span class="info-value">${escapeHtml(design.PocketNumbers || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">段取り / Hạng lập</span><span class="info-value">${escapeHtml(design.MoldSetupType || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">設計重量 / KL thiết kế</span><span class="info-value">${design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A'}</span></div>`;
  html += `<div class="info-row"><span class="info-label">深さ / Chiều sâu</span><span class="info-value">${escapeHtml(design.MoldDesignDepth || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">抜き勾配 / Góc nghiêng</span><span class="info-value">${escapeHtml(design.DraftAngle || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">図面番号 / Số bản vẽ</span><span class="info-value">${escapeHtml(design.DrawingNumber || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">設備コード / Mã thiết bị</span><span class="info-value">${escapeHtml(design.EquipmentCode || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">設計備考 / Ghi chú thiết kế</span><span class="info-value">${escapeHtml(design.VersionNote || 'N/A')}</span></div>`;
  html += '</div>';
  
  // 3. Product info
  html += '<div class="detail-section">';
  html += '<h3>製品情報 / Thông tin sản phẩm</h3>';
  html += `<div class="info-row"><span class="info-label">トレイ情報 / Thông tin khay</span><span class="info-value">${escapeHtml(design.TrayInfoForMoldDesign || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">材質 / Chất liệu</span><span class="info-value">${escapeHtml(design.DesignForPlasticType || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">製品寸法 / Kích thước SP</span><span class="info-value">${productDimensions}</span></div>`;
  html += `<div class="info-row"><span class="info-label">トレイ重量 / KL khay sản phẩm</span><span class="info-value">${design.TrayWeight ? design.TrayWeight + ' g' : 'N/A'}</span></div>`;
  html += `<div class="info-row"><span class="info-label">初回出荷日 / Ngày xuất hàng đầu tiên</span><span class="info-value">${job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A'}</span></div>`;
  html += `<div class="info-row"><span class="info-label">単価 / Đơn giá</span><span class="info-value">${escapeHtml(job.UnitPrice || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">ロイ通 / Lối thông</span><span class="info-value">${escapeHtml(job.LoaiThungDong || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">包ニロン / Bao nilon</span><span class="info-value">${escapeHtml(job.BaoNilon || 'N/A')}</span></div>`;
  html += '</div>';
  
  // 4. Location history
  html += '<div class="detail-section">';
  html += '<h3>位置履歴 / Lịch sử vị trí</h3>';
  if (item.locationHistory && item.locationHistory.length > 0) {
    html += item.locationHistory.slice(0, 5).map(log => {
      return `<div class="history-entry location">
        <div class="history-date">${formatTimestamp(log.DateEntry)}</div>
        <div class="history-content">
        ${escapeHtml(log.OldRackLayer || 'N/A')} → ${escapeHtml(log.NewRackLayer || 'N/A')}
        ${log.notes ? '<br><small>' + escapeHtml(log.notes) + '</small>' : ''}
        </div></div>`;
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 5. Shipment history
  html += '<div class="detail-section">';
  html += '<h3>搬送履歴 / Lịch sử vận chuyển</h3>';
  if (item.shipHistory && item.shipHistory.length > 0) {
    html += item.shipHistory.slice(0, 5).map(log => {
      const fromCompany = allData.companies.find(c => c.CompanyID === log.FromCompanyID);
      const toCompany = allData.companies.find(c => c.CompanyID === log.ToCompanyID);
      return `<div class="history-entry shipment">
        <div class="history-date">${formatTimestamp(log.DateEntry)}</div>
        <div class="history-content">
        ${escapeHtml(fromCompany ? fromCompany.CompanyShortName : 'N/A')} → 
        ${escapeHtml(toCompany ? toCompany.CompanyShortName : 'N/A')}
        ${log.handler ? '<br><small>担当: ' + escapeHtml(log.handler) + '</small>' : ''}
        ${log.ShipNotes ? '<br><small>' + escapeHtml(log.ShipNotes) + '</small>' : ''}
        </div></div>`;
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 6. FIX: Teflon & Comment - TÁCH THÀNH 2 NHÓM RIÊNG TRONG CÙNG 1 CỘT
  html += '<div class="detail-section">';
  html += '<h3>テフロン・備考 / Teflon & Ghi chú</h3>';
  
  // Nhóm Teflon
  html += '<div class="sub-section teflon-section">';
  html += '<h4>テフロン情報 / Thông tin Teflon</h4>';
  // FIX: Hiển thị đúng dữ liệu TeflonCoating từ CSV
  const teflonStatus = item.TeflonCoating || 'N/A';
  const teflonSentDate = item.TeflonSentDate ? formatDate(item.TeflonSentDate) : 'N/A';
  const teflonReceivedDate = item.TeflonReceivedDate ? formatDate(item.TeflonReceivedDate) : 'N/A';
  
  html += `<div class="info-row"><span class="info-label">テフロン状態 / Trạng thái Teflon</span><span class="info-value teflon-status">${escapeHtml(teflonStatus)}</span></div>`;
  html += `<div class="info-row"><span class="info-label">送信日 / Ngày gửi</span><span class="info-value">${teflonSentDate}</span></div>`;
  html += `<div class="info-row"><span class="info-label">受信日 / Ngày nhận</span><span class="info-value">${teflonReceivedDate}</span></div>`;
  html += '</div>';
  
  // Nhóm Bình luận - FIX: Sử dụng hàm V4.31 working logic
  html += '<div class="sub-section comments-section">';
  html += '<h4>コメント / Bình luận</h4>';
  html += `<div class="info-row"><span class="info-label">備考 / Ghi chú</span><span class="info-value">${escapeHtml(item.MoldNotes || 'N/A')}</span></div>`;
  
  // FIX: Hiển thị user comments từ server
  const userComments = getMoldUserCommentsFromServer(item.MoldID);
  if (userComments && userComments.length > 0) {
    html += '<div class="user-comments-list">';
    userComments.slice(0, 3).forEach(comment => {
      const employee = allData.employees.find(e => e.EmployeeID === comment.EmployeeID);
      html += `<div class="comment-item-compact">
        <div class="comment-header-compact">
          <span class="comment-author">${escapeHtml(employee?.EmployeeName || 'Unknown')}</span>
          <span class="comment-date">${formatTimestamp(comment.DateEntry)}</span>
        </div>
        <div class="comment-text">${escapeHtml(comment.CommentText)}</div>
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="no-comments">コメントなし / Không có bình luận</div>';
  }
  html += '</div>';
  
  html += '</div>';
  
  // 7. Related Items (Cột thứ 7)
  html += '<div class="detail-section">';
  html += '<h3>関連アイテム / Liên quan</h3>';
  
  // Related cutters
  if (item.relatedCutters && item.relatedCutters.length > 0) {
    html += '<div class="sub-section">';
    html += '<h4>関連カッター / Dao cắt liên quan</h4>';
    item.relatedCutters.slice(0, 5).forEach(cutter => {
      html += `<div class="related-item cutter">
        <span class="related-code">${escapeHtml(cutter.CutterNo)}</span>
        <span class="related-name">${escapeHtml(cutter.CutterName || '')}</span>
      </div>`;
    });
    html += '</div>';
  }
  
  // Customer info
  if (item.customerInfo && item.customerInfo.CustomerID) {
    html += '<div class="sub-section">';
    html += '<h4>顧客情報 / Thông tin khách hàng</h4>';
    html += `<div class="info-row"><span class="info-label">顧客名 / Tên khách hàng</span><span class="info-value">${escapeHtml(item.customerInfo.CustomerName || 'N/A')}</span></div>`;
    html += `<div class="info-row"><span class="info-label">会社 / Công ty</span><span class="info-value">${escapeHtml(item.companyInfo?.CompanyName || 'N/A')}</span></div>`;
    html += '</div>';
  }
  
  html += '</div>';
  
  html += '</div>';
  detailContent.innerHTML = html;
}

// Render cutter detail data với 7 cột theo V4.31 logic
function renderCutterDetailData(item) {
  const detailContent = document.getElementById('detailContent');
  if (!detailContent) return;
  
  const status = item.currentStatus || {text: 'N/A', class: ''};
  const cutlineDimensions = item.cutlineSize || 'N/A';
  
  let html = '<div class="detail-grid-7">';
  
  // 1. Thông tin cơ bản
  html += '<div class="detail-section">';
  html += '<h3>基本情報 / Thông tin cơ bản</h3>';
  html += `<div class="info-row"><span class="info-label">ID</span><span class="info-value muted">${item.CutterID}</span></div>`;
  html += `<div class="info-row"><span class="info-label">CutterNo</span><span class="info-value highlight cutter">${escapeHtml(item.CutterNo)}</span></div>`;
  html += `<div class="info-row"><span class="info-label">名前 / Tên</span><span class="info-value">${escapeHtml(item.CutterName || item.CutterDesignName || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">状態 / Trạng thái</span><span class="info-value ${status.class}">${status.text}</span></div>`;
  html += `<div class="info-row"><span class="info-label">Cutline寸法</span><span class="info-value cutline">${cutlineDimensions}</span></div>`;
  html += `<div class="info-row"><span class="info-label">プラスチックカット / Cắt nhựa</span><span class="info-value">${escapeHtml(item.PlasticCutType || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">カッタータイプ / Loại dao cắt</span><span class="info-value">${escapeHtml(item.CutterType || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">ブレード数 / Số lưỡi</span><span class="info-value">${escapeHtml(item.BladeCount || 'N/A')}</span></div>`;
  html += '</div>';
  
  // 2. Design info for cutter
  html += '<div class="detail-section">';
  html += '<h3>設計情報 / Thông tin thiết kế</h3>';
  html += `<div class="info-row"><span class="info-label">SATOコード</span><span class="info-value">${escapeHtml(item.SatoCode || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">SATO日付</span><span class="info-value">${item.SatoCodeDate ? formatDate(item.SatoCodeDate) : 'N/A'}</span></div>`;
  html += `<div class="info-row"><span class="info-label">説明 / Mô tả</span><span class="info-value">${escapeHtml(item.Description || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">使用状況 / Tình trạng sử dụng</span><span class="info-value">${escapeHtml(item.UsageStatus || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">ピッチ / Pitch</span><span class="info-value">${escapeHtml(item.Pitch || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">PP使用</span><span class="info-value">${escapeHtml(item.PPcushionUse || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">備考 / Ghi chú</span><span class="info-value">${escapeHtml(item.CutterNote || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">詳細 / Chi tiết</span><span class="info-value">${escapeHtml(item.CutterDetail || 'N/A')}</span></div>`;
  html += '</div>';
  
  // 3. Product info for cutter
  html += '<div class="detail-section">';
  html += '<h3>製品情報 / Thông tin sản phẩm</h3>';
  // Post-cut dimensions
  const postCutDim = (item.PostCutLength && item.PostCutWidth) ? 
    item.PostCutLength + '×' + item.PostCutWidth : 'N/A';
  
  // Physical dimensions
  const physDim = (item.CutterLength && item.CutterWidth) ? 
    item.CutterLength + '×' + item.CutterWidth : 'N/A';
  
  // Nominal dimensions (cutline)
  const nomDim = (item.CutlineLength && item.CutlineWidth) ? 
    item.CutlineLength + '×' + item.CutlineWidth : 'N/A';
  
  html += `<div class="info-row"><span class="info-label">加工後寸法 / Sau gia công</span><span class="info-value">${postCutDim}</span></div>`;
  html += `<div class="info-row"><span class="info-label">物理寸法 / Vật lý</span><span class="info-value">${physDim}</span></div>`;
  html += `<div class="info-row"><span class="info-label">Cutline寸法</span><span class="info-value cutline">${nomDim}</span></div>`;
  html += `<div class="info-row"><span class="info-label">コーナー / Corner</span><span class="info-value">${escapeHtml(item.CutterCorner || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">面取り / Chamfer</span><span class="info-value">${escapeHtml(item.CutterChamfer || 'N/A')}</span></div>`;
  html += '</div>';
  
  // 4. Location history (same as mold)
  html += '<div class="detail-section">';
  html += '<h3>位置履歴 / Lịch sử vị trí</h3>';
  if (item.locationHistory && item.locationHistory.length > 0) {
    html += item.locationHistory.slice(0, 5).map(log => {
      return `<div class="history-entry location">
        <div class="history-date">${formatTimestamp(log.DateEntry)}</div>
        <div class="history-content">
        ${escapeHtml(log.OldRackLayer || 'N/A')} → ${escapeHtml(log.NewRackLayer || 'N/A')}
        ${log.notes ? '<br><small>' + escapeHtml(log.notes) + '</small>' : ''}
        </div></div>`;
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 5. Shipment history (same as mold)
  html += '<div class="detail-section">';
  html += '<h3>搬送履歴 / Lịch sử vận chuyển</h3>';
  if (item.shipHistory && item.shipHistory.length > 0) {
    html += item.shipHistory.slice(0, 5).map(log => {
      const fromCompany = allData.companies.find(c => c.CompanyID === log.FromCompanyID);
      const toCompany = allData.companies.find(c => c.CompanyID === log.ToCompanyID);
      return `<div class="history-entry shipment">
        <div class="history-date">${formatTimestamp(log.DateEntry)}</div>
        <div class="history-content">
        ${escapeHtml(fromCompany ? fromCompany.CompanyShortName : 'N/A')} → 
        ${escapeHtml(toCompany ? toCompany.CompanyShortName : 'N/A')}
        ${log.handler ? '<br><small>担当: ' + escapeHtml(log.handler) + '</small>' : ''}
        ${log.ShipNotes ? '<br><small>' + escapeHtml(log.ShipNotes) + '</small>' : ''}
        </div></div>`;
    }).join('');
  } else {
    html += '<div class="info-row"><span class="info-value">履歴なし / Không có lịch sử</span></div>';
  }
  html += '</div>';
  
  // 6. Ghi chú và Comments cho cutter
  html += '<div class="detail-section">';
  html += '<h3>備考・コメント / Ghi chú & Bình luận</h3>';
  
  // Nhóm Ghi chú
  html += '<div class="sub-section notes-section">';
  html += '<h4>備考情報 / Thông tin ghi chú</h4>';
  html += `<div class="info-row"><span class="info-label">備考 / Ghi chú</span><span class="info-value">${escapeHtml(item.CutterNote || 'N/A')}</span></div>`;
  html += `<div class="info-row"><span class="info-label">詳細 / Chi tiết</span><span class="info-value">${escapeHtml(item.CutterDetail || 'N/A')}</span></div>`;
  html += '</div>';
  
  // Nhóm Bình luận - FIX: Sử dụng hàm V4.31 working logic
  html += '<div class="sub-section comments-section">';
  html += '<h4>コメント / Bình luận</h4>';
  
  // FIX: Hiển thị user comments từ server cho cutter
  const userComments = getCutterUserCommentsFromServer(item.CutterID);
  if (userComments && userComments.length > 0) {
    html += '<div class="user-comments-list">';
    userComments.slice(0, 3).forEach(comment => {
      const employee = allData.employees.find(e => e.EmployeeID === comment.EmployeeID);
      html += `<div class="comment-item-compact">
        <div class="comment-header-compact">
          <span class="comment-author">${escapeHtml(employee?.EmployeeName || 'Unknown')}</span>
          <span class="comment-date">${formatTimestamp(comment.DateEntry)}</span>
        </div>
        <div class="comment-text">${escapeHtml(comment.CommentText)}</div>
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="no-comments">コメントなし / Không có bình luận</div>';
  }
  html += '</div>';
  
  html += '</div>';
  
  // 7. Related Items (Cột thứ 7)
  html += '<div class="detail-section">';
  html += '<h3>関連アイテム / Liên quan</h3>';
  
  // Related molds
  if (item.relatedMolds && item.relatedMolds.length > 0) {
    html += '<div class="sub-section">';
    html += '<h4>関連金型 / Khuôn liên quan</h4>';
    item.relatedMolds.slice(0, 5).forEach(mold => {
      html += `<div class="related-item mold">
        <span class="related-code">${escapeHtml(mold.MoldCode)}</span>
        <span class="related-name">${escapeHtml(mold.MoldName || '')}</span>
      </div>`;
    });
    html += '</div>';
  }
  
  // Customer info
  if (item.customerInfo && item.customerInfo.CustomerID) {
    html += '<div class="sub-section">';
    html += '<h4>顧客情報 / Thông tin khách hàng</h4>';
    html += `<div class="info-row"><span class="info-label">顧客名 / Tên khách hàng</span><span class="info-value">${escapeHtml(item.customerInfo.CustomerName || 'N/A')}</span></div>`;
    html += `<div class="info-row"><span class="info-label">会社 / Công ty</span><span class="info-value">${escapeHtml(item.companyInfo?.CompanyName || 'N/A')}</span></div>`;
    html += '</div>';
  }
  
  html += '</div>';
  
  html += '</div>';
  detailContent.innerHTML = html;
}

// =================== MODAL CẬP NHẬT ĐẦY ĐỦ ===================
function showLocationModal() {
  if (!selectedItem) return;
  
  const modal = createModal('locationModal', '位置更新 / Cập nhật vị trí', 
    `<div class="form-group">
      <label>現在位置 / Vị trí hiện tại</label>
      <input type="text" value="${escapeHtml(selectedItem.displayLocation)}" readonly>
    </div>
    <div class="form-group">
      <label>新しい位置 / Vị trí mới</label>
      <select id="newLocationSelect">
        <option value="">選択してください / Chọn vị trí</option>
      </select>
    </div>
    <div class="form-group">
      <label>担当者 / Người thực hiện</label>
      <select id="locationEmployee">
        <option value="">選択してください / Chọn người</option>
      </select>
    </div>
    <div class="form-group">
      <label>備考 / Ghi chú</label>
      <textarea id="locationNotes" rows="3"></textarea>
    </div>`,
    function() {
      updateLocationAction();
    }
  );
  
  populateLocationOptions();
  populateEmployeeOptions('locationEmployee');
}

function showShipmentModal() {
  if (!selectedItem) return;
  
  const modal = createModal('shipmentModal', '搬送更新 / Cập nhật vận chuyển',
    `<div class="form-group">
      <label>出荷先 / Đến công ty</label>
      <select id="toCompany">
        <option value="">選択してください / Chọn công ty</option>
      </select>
    </div>
    <div class="form-group">
      <label>出荷日 / Ngày vận chuyển</label>
      <input type="date" id="shipmentDate" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="form-group">
      <label>担当者 / Người thực hiện</label>
      <input type="text" id="shipmentHandler">
    </div>
    <div class="form-group">
      <label>備考 / Ghi chú</label>
      <textarea id="shipmentNotes" rows="3"></textarea>
    </div>`,
    function() {
      updateShipmentAction();
    }
  );
  
  populateCompanyOptions();
}

function showTeflonModal() {
  if (!selectedItem || selectedItem.itemType !== 'mold') return;
  
  const modal = createModal('teflonModal', 'テフロン更新 / Cập nhật mạ Teflon',
    `<div class="form-group">
      <label>テフロン状態 / Trạng thái Teflon</label>
      <select id="teflonCoating">
        <option value="">選択してください / Chọn trạng thái</option>
        <option value="未処理">未処理 / Chưa xử lý</option>
        <option value="処理済み">処理済み / Đã xử lý</option>
        <option value="再処理必要">再処理必要 / Cần xử lý lại</option>
        <option value="テフロン加工済">テフロン加工済 / Đã gia công Teflon</option>
      </select>
    </div>
    <div class="form-group">
      <label>送信日 / Ngày gửi</label>
      <input type="date" id="teflonSentDate">
    </div>
    <div class="form-group">
      <label>受信日 / Ngày nhận</label>
      <input type="date" id="teflonReceivedDate">
    </div>
    <div class="form-group">
      <label>備考 / Ghi chú</label>
      <textarea id="teflonNotes" rows="3"></textarea>
    </div>`,
    function() {
      updateTeflonAction();
    }
  );
}

function showCommentModal() {
  if (!selectedItem) return;
  
  const modal = createModal('commentModal', 'コメント追加 / Thêm ghi chú',
    `<div class="form-group">
      <label>コメント / Nội dung</label>
      <textarea id="commentText" rows="4" required></textarea>
    </div>
    <div class="form-group">
      <label>投稿者 / Người đăng</label>
      <select id="commentEmployee" required>
        <option value="">選択してください / Chọn người</option>
      </select>
    </div>`,
    function() {
      addCommentAction();
    }
  );
  
  populateEmployeeOptions('commentEmployee');
}
// =================== MODAL CREATION AND ACTIONS ===================
function createModal(id, title, content, onSubmit) {
  // Remove existing modal
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal-overlay';
  modal.innerHTML = 
    `<div class="modal-content">
      <div class="modal-header ${selectedItem ? selectedItem.itemType : 'mold'}">
        <h3>${title}</h3>
        <button class="modal-close" onclick="closeModal('${id}')">×</button>
      </div>
      <div class="modal-body">
        ${content}
        <div class="modal-actions">
          <button type="button" class="btn-secondary" onclick="closeModal('${id}')">キャンセル / Hủy</button>
          <button type="button" class="btn-primary" onclick="document.getElementById('${id}').submitAction()">保存 / Lưu</button>
        </div>
      </div>
    </div>`;
  
  modal.submitAction = onSubmit;
  modal.onclick = function(e) {
    if (e.target === modal) closeModal(id);
  };
  
  document.body.appendChild(modal);
  return modal;
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.remove();
}

// =================== MODAL ACTION FUNCTIONS ===================
async function updateLocationAction() {
  const newLocation = document.getElementById('newLocationSelect').value;
  const employee = document.getElementById('locationEmployee').value;
  const notes = document.getElementById('locationNotes').value;
  
  if (!newLocation) {
    alert('新しい位置を選択してください / Vui lòng chọn vị trí mới');
    return;
  }
  
  if (!employee) {
    alert('担当者を選択してください / Vui lòng chọn người thực hiện');
    return;
  }
  
  try {
    showLoading(true);
    
    // Create location log entry
    const newLocationLogEntry = {
      LocationLogID: String(Date.now()),
      OldRackLayer: selectedItem.RackLayerID || '',
      NewRackLayer: newLocation,
      MoldID: selectedItem.itemType === 'mold' ? selectedItem.MoldID : '',
      CutterID: selectedItem.itemType === 'cutter' ? selectedItem.CutterID : '',
      DateEntry: new Date().toISOString(),
      notes: notes.trim()
    };
    
    // Update item location
    const itemUpdates = {
      RackLayerID: newLocation,
      storage_company: '2' // YSD
    };
    
    // Call backend API
    await callBackendApi('/api/add-log', {
      endpoint: 'locationlog.csv',
      data: newLocationLogEntry
    });
    
    await callBackendApi('/api/update-item', {
      endpoint: selectedItem.itemType === 'mold' ? 'molds.csv' : 'cutters.csv',
      data: {
        itemId: selectedItem.MoldID || selectedItem.CutterID,
        idField: selectedItem.itemType === 'mold' ? 'MoldID' : 'CutterID',
        updatedFields: itemUpdates
      }
    });
    
    // Wait for GitHub propagation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Reload data
    await loadAllData();
    
    closeModal('locationModal');
    showSuccess('位置が更新されました / Đã cập nhật vị trí');
    
    // Refresh display
    performSearch();
    
  } catch (error) {
    console.error('Location update failed:', error);
    showError('位置更新に失敗しました / Cập nhật vị trí thất bại: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function updateShipmentAction() {
  const toCompany = document.getElementById('toCompany').value;
  const date = document.getElementById('shipmentDate').value;
  const handler = document.getElementById('shipmentHandler').value;
  const notes = document.getElementById('shipmentNotes').value;
  
  if (!toCompany) {
    alert('出荷先を選択してください / Vui lòng chọn công ty đến');
    return;
  }
  
  try {
    showLoading(true);
    
    const newShipLogEntry = {
      ShipLogID: String(Date.now()),
      FromCompanyID: '2', // YSD
      ToCompanyID: toCompany,
      MoldID: selectedItem.itemType === 'mold' ? selectedItem.MoldID : '',
      CutterID: selectedItem.itemType === 'cutter' ? selectedItem.CutterID : '',
      DateEntry: date ? new Date(date).toISOString() : new Date().toISOString(),
      handler: handler.trim(),
      ShipNotes: notes.trim()
    };
    
    await callBackendApi('/api/add-log', {
      endpoint: 'shiplog.csv',
      data: newShipLogEntry
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    await loadAllData();
    
    closeModal('shipmentModal');
    showSuccess('搬送情報が更新されました / Đã cập nhật thông tin vận chuyển');
    performSearch();
    
  } catch (error) {
    console.error('Shipment update failed:', error);
    showError('搬送更新に失敗しました / Cập nhật vận chuyển thất bại: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function updateTeflonAction() {
  const coating = document.getElementById('teflonCoating').value;
  const sentDate = document.getElementById('teflonSentDate').value;
  const receivedDate = document.getElementById('teflonReceivedDate').value;
  const notes = document.getElementById('teflonNotes').value;
  
  try {
    showLoading(true);
    
    const teflonUpdates = {};
    if (coating) teflonUpdates.TeflonCoating = coating;
    if (sentDate) teflonUpdates.TeflonSentDate = sentDate;
    if (receivedDate) teflonUpdates.TeflonReceivedDate = receivedDate;
    if (notes.trim()) teflonUpdates.MoldNotes = notes.trim();
    
    await callBackendApi('/api/update-item', {
      endpoint: 'molds.csv',
      data: {
        itemId: selectedItem.MoldID,
        idField: 'MoldID',
        updatedFields: teflonUpdates
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    await loadAllData();
    
    closeModal('teflonModal');
    showSuccess('テフロン情報が更新されました / Đã cập nhật thông tin mạ Teflon');
    performSearch();
    
  } catch (error) {
    console.error('Teflon update failed:', error);
    showError('テフロン更新に失敗しました / Cập nhật Teflon thất bại: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function addCommentAction() {
  const text = document.getElementById('commentText').value.trim();
  const employee = document.getElementById('commentEmployee').value;
  
  if (!text) {
    alert('コメントを入力してください / Vui lòng nhập nội dung');
    return;
  }
  
  if (!employee) {
    alert('投稿者を選択してください / Vui lòng chọn người đăng');
    return;
  }
  
  try {
    showLoading(true);
    
    const newCommentEntry = {
      UserCommentID: String(Date.now()),
      ItemID: selectedItem.MoldID || selectedItem.CutterID,
      ItemType: selectedItem.itemType,
      CommentText: text,
      EmployeeID: employee,
      DateEntry: new Date().toISOString(),
      CommentStatus: 'active'
    };
    
    await callBackendApi('/api/add-log', {
      endpoint: 'usercomments.csv',
      data: newCommentEntry
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    await loadAllData();
    
    closeModal('commentModal');
    showSuccess('コメントが追加されました / Đã thêm ghi chú');
    
    // Refresh detail view to show new comment
    renderDetailSection();
    
  } catch (error) {
    console.error('Comment add failed:', error);
    showError('コメント追加に失敗しました / Thêm ghi chú thất bại: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// =================== POPULATE FORM OPTIONS ===================
function populateLocationOptions() {
  const select = document.getElementById('newLocationSelect');
  if (!select) return;
  
  // Use actual rack/layer data
  const locations = [];
  allData.racklayers.forEach(layer => {
    const rack = allData.racks.find(r => r.RackID === layer.RackID);
    if (rack) {
      locations.push({
        value: layer.RackLayerID,
        text: rack.RackLocation + ' ' + rack.RackID + '-' + layer.RackLayerNumber
      });
    }
  });
  
  locations.forEach(location => {
    const option = document.createElement('option');
    option.value = location.value;
    option.textContent = location.text;
    select.appendChild(option);
  });
}

function populateCompanyOptions() {
  const select = document.getElementById('toCompany');
  if (!select) return;
  
  allData.companies.forEach(company => {
    if (company.CompanyID !== '2') { // Exclude YSD
      const option = document.createElement('option');
      option.value = company.CompanyID;
      option.textContent = company.CompanyShortName + ' - ' + company.CompanyName;
      select.appendChild(option);
    }
  });
}

function populateEmployeeOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  allData.employees.forEach(employee => {
    const option = document.createElement('option');
    option.value = employee.EmployeeID;
    option.textContent = employee.EmployeeName;
    select.appendChild(option);
  });
}

// =================== SELECTION FUNCTIONS ===================
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
    const id = checkbox.getAttribute('data-id');
    if (selectAllCheckbox.checked) {
      selectedItems.add(id);
    } else {
      selectedItems.delete(id);
    }
  });
  updateSelectionDisplay();
}

function selectAll() {
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = true;
    toggleSelectAll();
  }
}

function clearSelection() {
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
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
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const totalCheckboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]').length;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedItems.size === totalCheckboxes;
    selectAllCheckbox.indeterminate = selectedItems.size > 0 && selectedItems.size < totalCheckboxes;
  }
}

function updateSelectionDisplay() {
  const selectedCount = document.getElementById('selectedCount');
  const printSelectedBtn = document.getElementById('printSelectedBtn');
  
  if (selectedCount) {
    if (selectedItems.size > 0) {
      selectedCount.textContent = `${selectedItems.size} 選択 / ${selectedItems.size} đã chọn`;
      selectedCount.style.display = 'inline';
    } else {
      selectedCount.style.display = 'none';
    }
  }
  
  if (printSelectedBtn) {
    printSelectedBtn.style.display = selectedItems.size > 0 ? 'inline-block' : 'none';
  }
}

// =================== PRINT FUNCTIONS ===================
function onPrint() {
  if (document.getElementById('detailView').classList.contains('visible')) {
    printDetail();
  } else {
    printSelected();
  }
}

function printSelected() {
  if (selectedItems.size === 0) {
    alert('選択されたアイテムがありません / Không có mục nào được chọn');
    return;
  }
  
  const selectedData = filteredData.filter(item => 
    selectedItems.has(item.MoldID || item.CutterID)
  );
  
  // Create new print window
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  const printContent = `<!DOCTYPE html>
    <html><head><title>印刷 / In - ${new Date().toLocaleDateString('ja-JP')}</title>
    <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; font-weight: bold; }
    .mold-row { background-color: #e0f2fe; }
    .cutter-row { background-color: #fff7ed; }
    .print-info { margin-bottom: 20px; color: #666; }
    </style></head><body>
    <h1>金型・カッター管理システム V4.37</h1>
    <div class="print-info">${new Date().toLocaleString('ja-JP')}<br>${selectedData.length} 件のアイテム / mục</div>
    <table><thead><tr>
    <th>タイプ / Loại</th><th>IDNo</th><th>名前 / Tên</th><th>サイズ / Kích thước</th>
    <th>位置 / Vị trí</th><th>会社 / Công ty</th><th>備考 / Ghi chú</th>
    </tr></thead><tbody>
    ${selectedData.map(item => {
      const itemType = item.itemType === 'mold' ? '金型 / Khuôn' : 'カッター / Dao cắt';
      const itemId = item.itemType === 'cutter' ? item.CutterNo || item.CutterID : item.MoldID;
      const notes = item.itemType === 'cutter' ? item.CutterNote || 'N/A' : item.MoldNotes || 'N/A';
      return `<tr class="${item.itemType}-row">
        <td>${itemType}</td>
        <td>${escapeHtml(itemId)}</td>
        <td>${escapeHtml(item.displayName || 'N/A')}</td>
        <td>${escapeHtml(item.displayDimensions || 'N/A')}</td>
        <td>${escapeHtml(item.displayLocation || 'N/A')}</td>
        <td>${escapeHtml(item.storageCompany || 'N/A')}</td>
        <td>${escapeHtml(notes)}</td>
        </tr>`;
    }).join('')}
    </tbody></table></body></html>`;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

function printDetail() {
  if (!selectedItem) return;
  
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  const itemType = selectedItem.itemType === 'mold' ? '金型 / Khuôn' : 'カッター / Dao cắt';
  const itemId = selectedItem.itemType === 'cutter' ? selectedItem.CutterNo || selectedItem.CutterID : selectedItem.MoldID;
  
  const printContent = `<!DOCTYPE html>
    <html><head><title>詳細印刷 / In chi tiết - ${itemId}</title>
    <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
    .detail-section { margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; }
    .detail-section h3 { margin-top: 0; color: #374151; }
    .info-row { display: flex; margin-bottom: 8px; }
    .info-label { font-weight: bold; min-width: 150px; }
    .info-value { flex: 1; }
    .history-entry { margin-bottom: 10px; padding: 8px; background: #f9fafb; border-left: 3px solid #3b82f6; }
    .print-info { margin-bottom: 20px; color: #666; }
    </style></head><body>
    <h1>金型・カッター管理システム V4.37</h1>
    <div class="print-info">${new Date().toLocaleString('ja-JP')}<br>${itemType}: ${itemId}</div>
    ${document.getElementById('detailContent').innerHTML}
    </body></html>`;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

// =================== STATE MANAGEMENT ===================
function saveSearchState() {
  try {
    const state = {
      query: document.getElementById('searchInput')?.value || '',
      category: currentCategory,
      fieldFilter: document.getElementById('fieldFilterA')?.value || 'all',
      valueFilter: document.getElementById('valueFilterB')?.value || 'all',
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
    const saved = localStorage.getItem('moldSearchState');
    if (saved) {
      const state = JSON.parse(saved);
      if (document.getElementById('searchInput') && state.query) {
        document.getElementById('searchInput').value = state.query;
        updateClearSearchButton();
      }
      if (state.category) {
        currentCategory = state.category;
        updateCategoryDisplay();
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

// =================== DEBUG FUNCTIONS ===================
function debugTeflonAndComments() {
  console.log('=== DEBUG TEFLON & COMMENTS V4.37 ===');
  
  // Check TeflonCoating data
  console.log('Sample molds with TeflonCoating:');
  const moldsWithTeflon = allData.molds.filter(m => m.TeflonCoating && m.TeflonCoating.trim() !== '');
  console.log('Molds with TeflonCoating:', moldsWithTeflon.length);
  moldsWithTeflon.slice(0, 5).forEach(m => {
    console.log('MoldID:', m.MoldID, 'TeflonCoating:', m.TeflonCoating);
  });
  
  // Check usercomments data
  console.log('usercomments.csv loaded:', allData.usercomments?.length || 0);
  if (allData.usercomments && allData.usercomments.length > 0) {
    console.log('Sample comments:', allData.usercomments.slice(0, 3));
  }
  
  // Check selectedItem
  if (selectedItem) {
    console.log('selectedItem TeflonCoating:', selectedItem.TeflonCoating);
    console.log('selectedItem MoldID:', selectedItem.MoldID);
  }
  
  console.log('=== END DEBUG ===');
}

// =================== GLOBAL FUNCTIONS FOR ONCLICK HANDLERS ===================
// These functions need to be globally accessible for onclick handlers in HTML
window.toggleCategory = toggleCategory;
window.clearSearch = clearSearch;
window.resetFilters = resetFilters;
window.handleFieldFilterChange = handleFieldFilterChange;
window.handleValueFilterChange = handleValueFilterChange;
window.selectSuggestion = selectSuggestion;
window.clearSearchHistory = clearSearchHistory;
window.showLocationModal = showLocationModal;
window.showShipmentModal = showShipmentModal;
window.showTeflonModal = showTeflonModal;
window.showCommentModal = showCommentModal;
window.closeModal = closeModal;
window.printSelected = printSelected;
window.printDetail = printDetail;
window.onPrint = onPrint;
window.toggleItemSelection = toggleItemSelection;
window.toggleSelectAll = toggleSelectAll;
window.selectAll = selectAll;
window.clearSelection = clearSelection;
window.debugTeflonAndComments = debugTeflonAndComments;

// =================== VERSION INFORMATION ===================
window.MOLDCUTTERSEARCH_VERSION = 'V4.37';
window.MOLDCUTTERSEARCH_BUILD = new Date().toISOString();

console.log('🎉 ' + window.MOLDCUTTERSEARCH_VERSION + ' initialized successfully');
console.log('📱 V4.37 Script loaded with V4.31 working logic integration');
console.log('🔧 Two-panel layout with 7-column detail view');
console.log('✅ TeflonCoating and user comments fixed');
console.log('📊 Full business logic preserved');

// =================== FINAL INITIALIZATION ===================
// Performance monitoring
const performanceMonitor = {
  searchTimes: [],
  averageSearchTime: 0,
  recordSearchTime: function(startTime) {
    const endTime = performance.now();
    const searchTime = endTime - startTime;
    this.searchTimes.push(searchTime);
    if (this.searchTimes.length > 100) {
      this.searchTimes.shift();
    }
    this.averageSearchTime = this.searchTimes.reduce((a, b) => a + b, 0) / this.searchTimes.length;
    if (searchTime > 1000) {
      console.warn('Slow search detected:', searchTime.toFixed(2) + 'ms');
    }
  }
};

// Enhanced search with performance monitoring
const originalPerformSearch = performSearch;
performSearch = function() {
  const startTime = performance.now();
  const result = originalPerformSearch.apply(this, arguments);
  performanceMonitor.recordSearchTime(startTime);
  return result;
};

// Mobile optimizations
function optimizeForMobile() {
  if (window.innerWidth <= 768) {
    pageSize = Math.min(pageSize, 25); // Reduce page size on mobile
    
    // Optimize table display for mobile
    const table = document.getElementById('dataTable');
    if (table) {
      table.classList.add('mobile-optimized');
    }
    
    // Optimize search suggestions for mobile
    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) {
      suggestions.classList.add('mobile-suggestions');
    }
  }
}

// Initialize mobile optimizations
window.addEventListener('resize', optimizeForMobile);
window.addEventListener('orientationchange', optimizeForMobile);

// Accessibility enhancements
function enhanceAccessibility() {
  // Add ARIA labels
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.setAttribute('aria-describedby', 'search-help');
    searchInput.setAttribute('role', 'combobox');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.setAttribute('aria-autocomplete', 'list');
  }
  
  // Add keyboard navigation hints
  const suggestions = document.getElementById('searchSuggestions');
  if (suggestions) {
    suggestions.setAttribute('role', 'listbox');
    suggestions.setAttribute('aria-label', '検索候補 / Gợi ý tìm kiếm');
  }
}

// Initialize accessibility enhancements
document.addEventListener('DOMContentLoaded', enhanceAccessibility);

// Export for global access if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    version: 'V4.37',
    performSearch: performSearch,
    loadAllData: loadAllData,
    showDetailView: showDetailView,
    printSelected: printSelected,
    debugTeflonAndComments: debugTeflonAndComments
  };
}

// =================== KẾT THÚC SCRIPT V4.37 ===================
console.log('✅ V4.37 Script.js hoàn chỉnh - Tích hợp đầy đủ nghiệp vụ từ V4.31');
console.log('🔧 7 cột chi tiết, TeflonCoating và bình luận đã fix');
console.log('📱 Tương thích iPad cũ, bố cục hai phần hoàn chỉnh');
console.log('🚀 Sẵn sàng sử dụng!');
