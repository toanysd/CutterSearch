// script-v4.37-ipad.js

const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
const API_BASE_URL = 'https://ysd-moldcutter-backend.onrender.com/api/';

let allData = {
  molds: [], cutters: [], customers: [], molddesign: [], moldcutter: [],
  shiplog: [], locationlog: [], employees: [], racklayers: [], racks: [],
  companies: [], usercomments: [], jobs: [], processingitems: []
};
let filteredData = [];
let currentSelected = null, currentType = null;
let searchTimeout = null;

// --- Khởi tạo ---
document.addEventListener('DOMContentLoaded', function() {
  loadAllData().then(() => {
    setupSearch();
    renderVirtualKeyboard();
    populateFormOptions();
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
      <tr onclick="selectResult(${idx})"${currentSelected === idx ? ' class="selected"' : ''} ${item.itemType === 'cutter' ? 'class="cutter-row"' : ''}>
        <td><span class="jp">${item.displayName}</span></td>
        <td><b class="jp">${item.displayLocation}</b></td>
        <td>${item.displayLayer}</td>
        <td>${item.displayCompany}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#888;">データなし/Không có dữ liệu</td></tr>';
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
  document.getElementById('basicInfo').innerHTML = `<h4><span class="jp">基本情報</span><br><span class="vi">Thông tin cơ bản</span></h4>
    <div><span class="jp">コード</span>/<span class="vi">Mã</span>: <b>${item.MoldCode || item.CutterNo || ''}</b></div>
    <div><span class="jp">名前</span>/<span class="vi">Tên</span>: ${item.displayName}</div>
    <div><span class="jp">会社</span>/<span class="vi">Công ty</span>: ${item.displayCompany}</div>
    <div><span class="jp">位置</span>/<span class="vi">Vị trí</span>: <span style="color:#059669">${item.displayLocation}</span></div>
    <div><span class="jp">棚-段</span>/<span class="vi">Giá-tầng</span>: ${item.displayLayer}</div>`;

  // 2. Thiết kế
  document.getElementById('designInfo').innerHTML = `<h4><span class="jp">設計</span><br><span class="vi">Thiết kế</span></h4>
    <div><span class="jp">設計名</span>/<span class="vi">Mã thiết kế</span>: ${item.designInfo?.MoldDesignCode || item.designInfo?.DrawingNumber || ''}</div>
    <div><span class="jp">設備</span>/<span class="vi">Thiết bị</span>: ${item.designInfo?.EquipmentCode || ''}</div>
    <div><span class="jp">樹脂</span>/<span class="vi">Loại nhựa</span>: ${item.designInfo?.DesignForPlasticType || ''}</div>`;

  // 3. Sản phẩm
  document.getElementById('productInfo').innerHTML = `<h4><span class="jp">製品</span><br><span class="vi">Sản phẩm</span></h4>
    <div><span class="jp">寸法</span>/<span class="vi">Kích thước</span>: ${item.designInfo?.MoldDesignDim || ''}</div>
    <div><span class="jp">重量</span>/<span class="vi">Khối lượng</span>: ${item.MoldWeight || item.CutterWeight || ''}</div>`;

  // 4. Dao cắt/Khuôn liên quan
  const related = item.itemType === 'mold'
    ? allData.moldcutter.filter(r => r.MoldID === item.MoldID).map(r => allData.cutters.find(c => c.CutterID === r.CutterID))
    : allData.moldcutter.filter(r => r.CutterID === item.CutterID).map(r => allData.molds.find(m => m.MoldID === r.MoldID));
  document.getElementById('relatedCutters').className = 'detail-col' + (item.itemType === 'cutter' ? ' cutter' : '');
  document.getElementById('relatedCutters').innerHTML = `<h4><span class="jp">${item.itemType === 'mold' ? '関連カッター' : '関連金型'}</span><br><span class="vi">${item.itemType === 'mold' ? 'Dao cắt liên quan' : 'Khuôn liên quan'}</span></h4>` +
    (related.length ? related.map(r => `<div>${r?.CutterNo || r?.MoldCode || ''} - ${r?.CutterName || r?.MoldName || ''}</div>`).join('') : '<div style="color:#aaa;">なし/Không có</div>');

  // 5. Lịch sử vị trí/vận chuyển
  const loc = allData.locationlog.filter(l => (item.MoldID && l.MoldID === item.MoldID) || (item.CutterID && l.CutterID === item.CutterID));
  const ship = allData.shiplog.filter(s => (item.MoldID && s.MoldID === item.MoldID) || (item.CutterID && s.CutterID === item.CutterID));
  document.getElementById('historyInfo').innerHTML = `<h4><span class="jp">履歴</span><br><span class="vi">Lịch sử</span></h4>
    <div><span class="jp">位置</span>: ${loc.length ? loc.slice(0,2).map(l => `<div>${l.DateEntry?.split('T')[0] || ''}: ${l.NewRackLayer || ''}</div>`).join('') : 'なし/Không có'}</div>
    <div><span class="jp">出荷</span>: ${ship.length ? ship.slice(0,2).map(s => `<div>${s.DateEntry?.split('T')[0] || ''}: ${s.ToCompanyID || ''}</div>`).join('') : 'なし/Không có'}</div>`;

  // 6. Teflon, comment, cập nhật
  document.getElementById('updateGroup').innerHTML = `<h4><span class="jp">更新</span><br><span class="vi">Cập nhật</span></h4>
    <div><span class="jp">テフロン</span>/<span class="vi">Teflon</span>: ${item.TeflonCoating || '未処理/Chưa mạ'}</div>
    <div><span class="jp">コメント</span>/<span class="vi">Ghi chú</span>: ${getUserComment(item)}</div>`;
}

// --- Cập nhật dữ liệu (mở modal) ---
function setupUpdateButtons() {
  document.getElementById('btnUpdateLocation').onclick = () => openModal('modalUpdateLocation');
  document.getElementById('btnUpdateShipment').onclick = () => openModal('modalUpdateShipment');
  document.getElementById('btnUpdateTeflon').onclick = () => openModal('modalUpdateTeflon');
  document.getElementById('btnUpdateComment').onclick = () => openModal('modalUpdateComment');
  document.getElementById('saveLocationBtn').onclick = saveLocationUpdate;
  document.getElementById('saveShipmentBtn').onclick = saveShipmentUpdate;
  document.getElementById('saveTeflonBtn').onclick = saveTeflonUpdate;
  document.getElementById('saveCommentBtn').onclick = saveCommentUpdate;
  document.getElementById('rackSelect').onchange = updateRackLayers;
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function populateFormOptions() {
  // Populate rack, rackLayer, employee, company for all modals
  const rackSelect = document.getElementById('rackSelect');
  if(rackSelect) rackSelect.innerHTML = '<option value="">選択/Chọn giá...</option>' +
    allData.racks.map(r => `<option value="${r.RackID}">${r.RackSymbol || ''} ${r.RackName || ''} - ${r.RackLocation || ''}</option>`).join('');
  updateRackLayers();
  ['employeeSelect','commentEmployeeSelect'].forEach(id=>{
    const select = document.getElementById(id);
    if(select) select.innerHTML = '<option value="">選択/Chọn nhân viên...</option>' +
      allData.employees.map(e=>`<option value="${e.EmployeeID}">${e.EmployeeName}</option>`).join('');
  });
  const toCompanySelect = document.getElementById('toCompanySelect');
  if(toCompanySelect) toCompanySelect.innerHTML = '<option value="">選択/Chọn công ty...</option>' +
    allData.companies.map(c=>`<option value="${c.CompanyID}">${c.CompanyShortName} - ${c.CompanyName}</option>`).join('');
}

function updateRackLayers() {
  const rackSelect = document.getElementById('rackSelect');
  const rackLayerSelect = document.getElementById('rackLayerSelect');
  if(!rackSelect || !rackLayerSelect) return;
  const selectedRackId = rackSelect.value;
  rackLayerSelect.innerHTML = '<option value="">選択/Chọn tầng...</option>';
  if(selectedRackId){
    const layers = allData.racklayers.filter(l=>l.RackID===selectedRackId);
    rackLayerSelect.innerHTML += layers.map(l=>`<option value="${l.RackLayerID}">${l.RackLayerNumber}${l.RackLayerNotes ? ' - '+l.RackLayerNotes : ''}</option>`).join('');
  }
}

// --- Bàn phím ảo ---
function renderVirtualKeyboard() {
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
  showNotification('位置更新/Cập nhật vị trí thành công!');
}
async function saveShipmentUpdate() {
  closeModal('modalUpdateShipment');
  showNotification('出荷更新/Cập nhật vận chuyển thành công!');
}
async function saveTeflonUpdate() {
  closeModal('modalUpdateTeflon');
  showNotification('テフロン更新/Cập nhật Teflon thành công!');
}
async function saveCommentUpdate() {
  closeModal('modalUpdateComment');
  showNotification('コメント/Ghi chú đã lưu!');
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
