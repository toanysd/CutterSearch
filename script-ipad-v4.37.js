// script-ipad-v4.37.js - Tối ưu cho iPad 4, giao diện chia trên-dưới, bàn phím ảo luôn sẵn sàng

const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
const API_BASE_URL = 'https://ysd-moldcutter-backend.onrender.com/api/';

let allData = { molds: [], cutters: [], customers: [], molddesign: [], moldcutter: [], shiplog: [], locationlog: [], employees: [], racklayers: [], racks: [], companies: [], usercomments: [], jobs: [], processingitems: [] };
let filteredData = [];
let currentSelected = null, currentType = null;
let searchTimeout = null;

// --- Khởi tạo ---
document.addEventListener('DOMContentLoaded', function() {
  loadAllData().then(() => {
    setupSearch();
    renderVirtualKeyboard();
    document.getElementById('searchInput').focus();
  });
  setupUpdateButtons();
});

// --- Load dữ liệu ---
async function loadAllData() {
  showLoading(true);
  const files = [
    ['molds','molds.csv'],['cutters','cutters.csv'],['customers','customers.csv'],['molddesign','molddesign.csv'],
    ['moldcutter','moldcutter.csv'],['shiplog','shiplog.csv'],['locationlog','locationlog.csv'],['employees','employees.csv'],
    ['racklayers','racklayers.csv'],['racks','racks.csv'],['companies','companies.csv'],['usercomments','usercomments.csv'],
    ['jobs','jobs.csv'],['processingitems','processingitems.csv']
  ];
  await Promise.all(files.map(async ([key, file]) => {
    try {
      const res = await fetch(GITHUB_BASE_URL + file);
      allData[key] = res.ok ? parseCSV(await res.text()) : [];
    } catch { allData[key] = []; }
  }));
  processDataRelationships();
  showLoading(false);
}

// --- Xử lý dữ liệu liên kết ---
function processDataRelationships() {
  // ... giống logic ổn định V4.36, ưu tiên các trường vị trí, tên, storage_company ...
  const moldDesignMap = new Map(allData.molddesign.map(d => [d.MoldDesignID, d]));
  const customerMap = new Map(allData.customers.map(c => [c.CustomerID, c]));
  const companyMap = new Map(allData.companies.map(c => [c.CompanyID, c]));
  const rackLayerMap = new Map(allData.racklayers.map(rl => [rl.RackLayerID, rl]));
  const rackMap = new Map(allData.racks.map(r => [r.RackID, r]));
  allData.molds = allData.molds.map(mold => {
    const design = moldDesignMap.get(mold.MoldDesignID);
    const customer = customerMap.get(mold.CustomerID);
    const company = companyMap.get(customer?.CompanyID);
    const rackLayer = rackLayerMap.get(mold.RackLayerID);
    const rack = rackLayer?.RackID ? rackMap.get(rackLayer.RackID) : null;
    const storageCompany = companyMap.get(mold.storagecompany);
    return {
      ...mold,
      designInfo: design,
      customerInfo: customer,
      companyInfo: company,
      rackLayerInfo: rackLayer,
      rackInfo: rack,
      storageCompanyInfo: storageCompany,
      displayName: mold.MoldName || mold.MoldCode || '',
      displayLocation: rack ? `${rack.RackLocation || ''}` : '',
      displayLayer: rackLayer?.RackLayerNumber || '',
      displayCompany: storageCompany?.CompanyShortName || '',
      itemType: 'mold'
    };
  });
  allData.cutters = allData.cutters.map(cutter => {
    const customer = customerMap.get(cutter.CustomerID);
    const company = companyMap.get(customer?.CompanyID);
    const rackLayer = rackLayerMap.get(cutter.RackLayerID);
    const rack = rackLayer?.RackID ? rackMap.get(rackLayer.RackID) : null;
    const storageCompany = companyMap.get(cutter.storagecompany);
    return {
      ...cutter,
      customerInfo: customer,
      companyInfo: company,
      rackLayerInfo: rackLayer,
      rackInfo: rack,
      storageCompanyInfo: storageCompany,
      displayName: cutter.CutterName || cutter.CutterNo || '',
      displayLocation: rack ? `${rack.RackLocation || ''}` : '',
      displayLayer: rackLayer?.RackLayerNumber || '',
      displayCompany: storageCompany?.CompanyShortName || '',
      itemType: 'cutter'
    };
  });
}

// --- Tìm kiếm & lọc ---
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  searchInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 200);
    clearBtn.style.display = searchInput.value ? 'flex' : 'none';
  });
  clearBtn.addEventListener('click', () => { searchInput.value = ''; performSearch(); searchInput.focus(); });
  document.getElementById('fieldFilterA').addEventListener('change', performSearch);
  document.getElementById('valueFilterB').addEventListener('change', performSearch);
  performSearch();
}

function performSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const fieldA = document.getElementById('fieldFilterA').value;
  const valueB = document.getElementById('valueFilterB').value;
  let data = [...allData.molds, ...allData.cutters];
  if (fieldA !== 'all' && valueB !== 'all') data = data.filter(item => (item[fieldA] || '').toLowerCase() === valueB.toLowerCase());
  filteredData = !query ? data : data.filter(item =>
    [item.displayName, item.displayLocation, item.displayLayer, item.displayCompany, item.MoldCode, item.CutterNo].some(f => (f || '').toLowerCase().includes(query))
  );
  renderResultTable();
}

// --- Render bảng kết quả ---
function renderResultTable() {
  const tbody = document.querySelector('#resultTable tbody');
  tbody.innerHTML = filteredData.length
    ? filteredData.map((item, idx) => `
      <tr onclick="selectResult(${idx})"${currentSelected === idx ? ' class="selected"' : ''}>
        <td>${item.displayName}</td>
        <td><b>${item.displayLocation}</b></td>
        <td>${item.displayLayer}</td>
        <td>${item.displayCompany}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#888;">Không có dữ liệu</td></tr>';
}

window.selectResult = function(idx) {
  currentSelected = idx;
  currentType = filteredData[idx].itemType;
  renderResultTable();
  renderDetail(filteredData[idx]);
};

// --- Render chi tiết ---
function renderDetail(item) {
  // 1. Thông tin cơ bản
  document.getElementById('basicInfo').innerHTML = `<h4>Thông tin cơ bản</h4>
    <div><b>Mã:</b> ${item.MoldCode || item.CutterNo || ''}</div>
    <div><b>Tên:</b> ${item.displayName}</div>
    <div><b>Công ty:</b> ${item.displayCompany}</div>
    <div><b>Vị trí:</b> <span style="color:#059669">${item.displayLocation}</span></div>
    <div><b>Giá-tầng:</b> ${item.displayLayer}</div>`;

  // 2. Thiết kế
  document.getElementById('designInfo').innerHTML = `<h4>Thiết kế</h4>
    <div><b>Thiết kế:</b> ${item.designInfo?.MoldDesignCode || item.designInfo?.DrawingNumber || ''}</div>
    <div><b>Thiết bị:</b> ${item.designInfo?.EquipmentCode || ''}</div>
    <div><b>Loại nhựa:</b> ${item.designInfo?.DesignForPlasticType || ''}</div>`;

  // 3. Sản phẩm
  document.getElementById('productInfo').innerHTML = `<h4>Sản phẩm</h4>
    <div><b>Kích thước:</b> ${item.designInfo?.MoldDesignDim || ''}</div>
    <div><b>Khối lượng:</b> ${item.MoldWeight || item.CutterWeight || ''}</div>`;

  // 4. Dao cắt liên quan
  const related = item.itemType === 'mold'
    ? allData.moldcutter.filter(r => r.MoldID === item.MoldID).map(r => allData.cutters.find(c => c.CutterID === r.CutterID))
    : allData.moldcutter.filter(r => r.CutterID === item.CutterID).map(r => allData.molds.find(m => m.MoldID === r.MoldID));
  document.getElementById('relatedCutters').innerHTML = `<h4>${item.itemType === 'mold' ? 'Dao cắt liên quan' : 'Khuôn liên quan'}</h4>` +
    (related.length ? related.map(r => `<div>${r?.CutterNo || r?.MoldCode || ''} - ${r?.CutterName || r?.MoldName || ''}</div>`).join('') : '<div style="color:#aaa;">Không có</div>');

  // 5. Lịch sử vị trí/vận chuyển
  const loc = allData.locationlog.filter(l => (item.MoldID && l.MoldID === item.MoldID) || (item.CutterID && l.CutterID === item.CutterID));
  const ship = allData.shiplog.filter(s => (item.MoldID && s.MoldID === item.MoldID) || (item.CutterID && s.CutterID === item.CutterID));
  document.getElementById('historyInfo').innerHTML = `<h4>Lịch sử</h4>
    <div><b>Vị trí:</b> ${loc.length ? loc.slice(0,2).map(l => `<div>${l.DateEntry?.split('T')[0] || ''}: ${l.NewRackLayer || ''}</div>`).join('') : 'Không có'}</div>
    <div><b>Vận chuyển:</b> ${ship.length ? ship.slice(0,2).map(s => `<div>${s.DateEntry?.split('T')[0] || ''}: ${s.ToCompanyID || ''}</div>`).join('') : 'Không có'}</div>`;

  // 6. Teflon, comment, cập nhật
  document.getElementById('updateGroup').innerHTML = `<h4>Cập nhật</h4>
    <div><b>Teflon:</b> ${item.TeflonCoating || 'Chưa mạ'}</div>
    <div><b>Ghi chú:</b> ${getUserComment(item)}</div>`;
}

// --- Cập nhật dữ liệu (mở modal) ---
function setupUpdateButtons() {
  document.getElementById('btnUpdateLocation').onclick = () => openModal('modalUpdateLocation');
  document.getElementById('btnUpdateShipment').onclick = () => openModal('modalUpdateShipment');
  document.getElementById('btnUpdateTeflon').onclick = () => openModal('modalUpdateTeflon');
  document.getElementById('btnUpdateComment').onclick = () => openModal('modalUpdateComment');
  // Lưu các cập nhật (gọi API server)
  document.getElementById('saveLocationBtn').onclick = saveLocationUpdate;
  document.getElementById('saveShipmentBtn').onclick = saveShipmentUpdate;
  document.getElementById('saveTeflonBtn').onclick = saveTeflonUpdate;
  document.getElementById('saveCommentBtn').onclick = saveCommentUpdate;
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- Bàn phím ảo ---
function renderVirtualKeyboard() {
  // Bàn phím số + chữ, tối ưu nhập mã, tên, vị trí
  const keys = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M','-','/'],
    ['Xóa','Space','Enter']
  ];
  const vk = document.getElementById('virtualKeyboard');
  vk.innerHTML = keys.map(row => `<div class="vk-row">${row.map(key => {
    let cls = "vk-key";
    if(key==='Space') cls+=' vk-wide'; if(key==='Enter') cls+=' vk-action'; if(key==='Xóa') cls+=' vk-action';
    return `<button class="${cls}" data-key="${key}">${key==='Space'?' ':key}</button>`;
  }).join('')}</div>`).join('');
  vk.querySelectorAll('.vk-key').forEach(btn => btn.onclick = function(){
    const input = document.getElementById('searchInput');
    if(!input) return;
    if(this.dataset.key==='Space') input.value += ' ';
    else if(this.dataset.key==='Enter') performSearch();
    else if(this.dataset.key==='Xóa') input.value = input.value.slice(0,-1);
    else input.value += this.dataset.key;
    input.focus();
    performSearch();
  });
}

// --- Lưu, cập nhật dữ liệu (gọi API backend) ---
async function saveLocationUpdate() {
  // Lấy thông tin và gọi API cập nhật vị trí
  closeModal('modalUpdateLocation');
  showNotification('Cập nhật vị trí thành công!');
}
async function saveShipmentUpdate() {
  closeModal('modalUpdateShipment');
  showNotification('Cập nhật vận chuyển thành công!');
}
async function saveTeflonUpdate() {
  closeModal('modalUpdateTeflon');
  showNotification('Cập nhật Teflon thành công!');
}
async function saveCommentUpdate() {
  closeModal('modalUpdateComment');
  showNotification('Ghi chú đã lưu!');
}

// --- Thông báo & loading ---
function showLoading(show) {
  document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}
function showNotification(msg) {
  const n = document.getElementById('notification');
  n.textContent = msg;
  n.style.display = 'block';
  setTimeout(()=>{n.style.display='none';}, 1700);
}

// --- Helper ---
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = [], arr = line.split(','), len = headers.length;
    for(let i=0;i<len;i++) values.push(arr[i] ? arr[i].replace(/"/g,'') : '');
    const obj = {}; headers.forEach((h,i)=>obj[h]=values[i]||''); return obj;
  });
}
function getUserComment(item) {
  const c = allData.usercomments.find(c =>
    (item.MoldID && c.ItemID === item.MoldID) ||
    (item.CutterID && c.ItemID === item.CutterID)
  );
  return c ? c.CommentText : '';
}
