/* ========================================================================
   AUDIT HISTORY VIEWER - R1.0
   ========================================================================
   Quản lý lịch sử kiểm kê, thay đổi vị trí, check-in/out
   
   Features:
   - Load dữ liệu từ statuslogs.csv và locationlog.csv
   - Tìm kiếm theo mã, tên, ghi chú
   - Lọc theo loại hành động, nhân viên, vị trí, thời gian
   - Hiển thị thống kê tổng hợp
   - Export CSV
   - Pagination
   
   Created: 2025-11-14
   Version: 1.0
   ======================================================================== */

(function() {
    'use strict';

    // ======================================== 
    // CONSTANTS
    // ======================================== 
    const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
    const ITEMS_PER_PAGE = 50;

    // ======================================== 
    // STATE
    // ======================================== 
    const State = {
        statusLogs: [],
        locationLogs: [],
        molds: [],
        cutters: [],
        employees: [],
        allRecords: [],
        filteredRecords: [],
        currentPage: 1,
        filters: {
            searchText: '',
            dateFrom: '',
            dateTo: '',
            actionType: 'all',
            rackLayer: '',
            employee: 'all'
        },
        sortBy: 'date-desc'
    };

    // ======================================== 
    // INITIALIZATION
    // ======================================== 
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[AuditHistoryViewer] Initializing...');
        
        setupEventListeners();
        await loadAllData();
        
        console.log('[AuditHistoryViewer] Ready!');
    });

    // ======================================== 
    // EVENT LISTENERS
    // ======================================== 
    function setupEventListeners() {
        // Refresh button
        document.getElementById('ahv-refresh-btn')?.addEventListener('click', async () => {
            await loadAllData();
        });

        // Apply filter
        document.getElementById('ahv-apply-filter-btn')?.addEventListener('click', () => {
            applyFilters();
        });

        // Clear filter
        document.getElementById('ahv-clear-filter-btn')?.addEventListener('click', () => {
            clearFilters();
        });

        // Export CSV
        document.getElementById('ahv-export-btn')?.addEventListener('click', () => {
            exportToCSV();
        });

        // Sort change
        document.getElementById('ahv-sort-select')?.addEventListener('change', (e) => {
            State.sortBy = e.target.value;
            renderResults();
        });

        // Search on Enter
        document.getElementById('ahv-search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    }

    // ======================================== 
    // DATA LOADING
    // ======================================== 
    async function loadAllData() {
        showLoading(true);
        
        try {
            console.log('[AuditHistoryViewer] Loading data from GitHub...');
            
            // Load all CSV files in parallel
            const [statusLogs, locationLogs, molds, cutters, employees] = await Promise.all([
                loadCSV('statuslogs.csv'),
                loadCSV('locationlog.csv'),
                loadCSV('molds.csv'),
                loadCSV('cutters.csv'),
                loadCSV('employees.csv')
            ]);

            State.statusLogs = statusLogs;
            State.locationLogs = locationLogs;
            State.molds = molds;
            State.cutters = cutters;
            State.employees = employees;

            console.log('[AuditHistoryViewer] Data loaded:', {
                statusLogs: statusLogs.length,
                locationLogs: locationLogs.length,
                molds: molds.length,
                cutters: cutters.length,
                employees: employees.length
            });

            // Merge and prepare records
            mergeRecords();
            
            // Populate employee filter
            populateEmployeeFilter();
            
            // Apply initial filters
            applyFilters();

        } catch (error) {
            console.error('[AuditHistoryViewer] Error loading data:', error);
            showError('データの読み込みに失敗しました | Lỗi tải dữ liệu');
        } finally {
            showLoading(false);
        }
    }

    async function loadCSV(filename) {
        const url = GITHUB_RAW_BASE + filename;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}`);
        }
        
        const text = await response.text();
        return parseCSV(text);
    }

    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const record = {};
            
            headers.forEach((header, index) => {
                record[header] = values[index] || '';
            });
            
            records.push(record);
        }

        return records;
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    // ======================================== 
    // DATA PROCESSING
    // ======================================== 
    function mergeRecords() {
        const records = [];

        // Process statuslogs
        State.statusLogs.forEach(log => {
            const moldId = log.MoldID;
            const cutterId = log.CutterID;
            const itemId = moldId || cutterId;
            const itemType = moldId ? 'mold' : 'cutter';

            // Find item details
            const item = itemType === 'mold' 
                ? State.molds.find(m => m.MoldID === itemId)
                : State.cutters.find(c => c.CutterID === itemId);

            // Find employee
            const employee = State.employees.find(e => e.EmployeeID === log.EmployeeID);

            records.push({
                source: 'statuslog',
                timestamp: log.Timestamp || log.AuditDate || '',
                itemId: itemId,
                itemCode: item?.MoldCode || item?.CutterCode || itemId,
                itemName: item?.MoldName || item?.CutterName || '',
                itemType: itemType,
                actionType: log.AuditType || log.Status || '',
                rackLayer: item?.RackLayerID || '',
                employeeId: log.EmployeeID || '',
                employeeName: employee?.EmployeeName || log.EmployeeID || '',
                notes: log.Notes || '',
                destinationId: log.DestinationID || '',
                raw: log
            });
        });

        // Process locationlogs
        State.locationLogs.forEach(log => {
            const moldId = log.MoldID;
            const item = State.molds.find(m => m.MoldID === moldId);
            const employee = State.employees.find(e => e.EmployeeID === log.EmployeeID);

            records.push({
                source: 'locationlog',
                timestamp: log.DateEntry || '',
                itemId: moldId,
                itemCode: item?.MoldCode || moldId,
                itemName: item?.MoldName || '',
                itemType: 'mold',
                actionType: 'LOCATION_CHANGE',
                rackLayer: `${log.OldRackLayer || '?'} → ${log.NewRackLayer || '?'}`,
                employeeId: log.EmployeeID || '',
                employeeName: employee?.EmployeeName || log.EmployeeID || '',
                notes: log.notes || '',
                oldRackLayer: log.OldRackLayer,
                newRackLayer: log.NewRackLayer,
                raw: log
            });
        });

        State.allRecords = records;
        console.log('[AuditHistoryViewer] Merged records:', records.length);
    }

    // ======================================== 
    // FILTERING
    // ======================================== 
    function applyFilters() {
        console.log('[AuditHistoryViewer] Applying filters...');

        // Get filter values
        State.filters.searchText = document.getElementById('ahv-search-input')?.value.toLowerCase().trim() || '';
        State.filters.dateFrom = document.getElementById('ahv-date-from')?.value || '';
        State.filters.dateTo = document.getElementById('ahv-date-to')?.value || '';
        State.filters.actionType = document.getElementById('ahv-action-filter')?.value || 'all';
        State.filters.rackLayer = document.getElementById('ahv-rack-filter')?.value.trim() || '';
        State.filters.employee = document.getElementById('ahv-employee-filter')?.value || 'all';

        // Filter records
        State.filteredRecords = State.allRecords.filter(record => {
            // Search text (itemId, itemCode, itemName, notes)
            if (State.filters.searchText) {
                const searchIn = [
                    record.itemId,
                    record.itemCode,
                    record.itemName,
                    record.notes
                ].join(' ').toLowerCase();

                if (!searchIn.includes(State.filters.searchText)) {
                    return false;
                }
            }

            // Date range
            if (State.filters.dateFrom || State.filters.dateTo) {
                const recordDate = record.timestamp.split('T')[0]; // YYYY-MM-DD
                
                if (State.filters.dateFrom && recordDate < State.filters.dateFrom) {
                    return false;
                }
                
                if (State.filters.dateTo && recordDate > State.filters.dateTo) {
                    return false;
                }
            }

            // Action type
            if (State.filters.actionType !== 'all') {
                if (record.actionType !== State.filters.actionType) {
                    return false;
                }
            }

            // Rack/Layer
            if (State.filters.rackLayer) {
                if (!record.rackLayer.includes(State.filters.rackLayer)) {
                    return false;
                }
            }

            // Employee
            if (State.filters.employee !== 'all') {
                if (record.employeeId !== State.filters.employee) {
                    return false;
                }
            }

            return true;
        });

        console.log('[AuditHistoryViewer] Filtered:', State.filteredRecords.length);

        // Reset to page 1
        State.currentPage = 1;

        // Render results
        renderResults();
        updateStatistics();
    }

    function clearFilters() {
        document.getElementById('ahv-search-input').value = '';
        document.getElementById('ahv-date-from').value = '';
        document.getElementById('ahv-date-to').value = '';
        document.getElementById('ahv-action-filter').value = 'all';
        document.getElementById('ahv-rack-filter').value = '';
        document.getElementById('ahv-employee-filter').value = 'all';

        State.filters = {
            searchText: '',
            dateFrom: '',
            dateTo: '',
            actionType: 'all',
            rackLayer: '',
            employee: 'all'
        };

        applyFilters();
    }

    // ======================================== 
    // SORTING
    // ======================================== 
    function sortRecords(records) {
        const sorted = [...records];

        switch (State.sortBy) {
            case 'date-desc':
                sorted.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                break;
            case 'date-asc':
                sorted.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                break;
            case 'moldid-asc':
                sorted.sort((a, b) => String(a.itemId).localeCompare(String(b.itemId)));
                break;
            case 'moldid-desc':
                sorted.sort((a, b) => String(b.itemId).localeCompare(String(a.itemId)));
                break;
        }

        return sorted;
    }

    // ======================================== 
    // RENDERING
    // ======================================== 
    function renderResults() {
        const tbody = document.getElementById('ahv-results-tbody');
        if (!tbody) return;

        // Sort records
        const sorted = sortRecords(State.filteredRecords);

        // Pagination
        const startIndex = (State.currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const pageRecords = sorted.slice(startIndex, endIndex);

        // Update count
        document.getElementById('ahv-results-count').textContent = `(${State.filteredRecords.length}件)`;

        // Clear table
        tbody.innerHTML = '';

        if (pageRecords.length === 0) {
            tbody.innerHTML = `
                <tr class="ahv-no-results">
                    <td colspan="8" class="ahv-no-results-cell">
                        <div class="ahv-no-results-icon">🔍</div>
                        <div class="ahv-no-results-text">
                            データがありません<br>
                            Không có dữ liệu
                        </div>
                    </td>
                </tr>
            `;
            renderPagination(0);
            return;
        }

        // Render rows
        pageRecords.forEach(record => {
            const row = document.createElement('tr');
            row.className = 'ahv-row';
            row.innerHTML = `
                <td class="ahv-td-date">${formatDateTime(record.timestamp)}</td>
                <td class="ahv-td-code">
                    <span class="ahv-item-code">${escapeHtml(record.itemCode)}</span>
                </td>
                <td class="ahv-td-name">${escapeHtml(record.itemName)}</td>
                <td class="ahv-td-type">${renderItemTypeBadge(record.itemType)}</td>
                <td class="ahv-td-rack">${renderRackLayer(record.rackLayer)}</td>
                <td class="ahv-td-employee">${escapeHtml(record.employeeName)}</td>
                <td class="ahv-td-action">${renderActionBadge(record.actionType)}</td>
                <td class="ahv-td-notes">${escapeHtml(record.notes)}</td>
            `;
            tbody.appendChild(row);
        });

        // Render pagination
        renderPagination(sorted.length);
    }

    function renderPagination(totalRecords) {
        const container = document.getElementById('ahv-pagination');
        if (!container) return;

        const totalPages = Math.ceil(totalRecords / ITEMS_PER_PAGE);

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '<div class="ahv-pagination-inner">';

        // Previous button
        if (State.currentPage > 1) {
            html += `<button class="ahv-page-btn" onclick="AuditHistoryViewer.goToPage(${State.currentPage - 1})">‹ 前へ</button>`;
        }

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === totalPages ||
                (i >= State.currentPage - 2 && i <= State.currentPage + 2)
            ) {
                const activeClass = i === State.currentPage ? 'ahv-page-btn-active' : '';
                html += `<button class="ahv-page-btn ${activeClass}" onclick="AuditHistoryViewer.goToPage(${i})">${i}</button>`;
            } else if (i === State.currentPage - 3 || i === State.currentPage + 3) {
                html += `<span class="ahv-page-ellipsis">...</span>`;
            }
        }

        // Next button
        if (State.currentPage < totalPages) {
            html += `<button class="ahv-page-btn" onclick="AuditHistoryViewer.goToPage(${State.currentPage + 1})">次へ ›</button>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }

    // ======================================== 
    // STATISTICS
    // ======================================== 
    function updateStatistics() {
        const stats = {
            total: State.filteredRecords.length,
            audit: 0,
            location: 0,
            checkinout: 0
        };

        State.filteredRecords.forEach(record => {
            if (record.actionType.includes('AUDIT')) {
                stats.audit++;
            } else if (record.actionType === 'LOCATION_CHANGE') {
                stats.location++;
            } else if (record.actionType === 'CHECK_IN' || record.actionType === 'CHECK_OUT') {
                stats.checkinout++;
            }
        });

        document.getElementById('ahv-stat-total').textContent = stats.total;
        document.getElementById('ahv-stat-audit').textContent = stats.audit;
        document.getElementById('ahv-stat-location').textContent = stats.location;
        document.getElementById('ahv-stat-checkinout').textContent = stats.checkinout;
    }

    // ======================================== 
    // HELPERS - RENDERING
    // ======================================== 
    function formatDateTime(dateTimeStr) {
        if (!dateTimeStr) return '-';
        
        const date = new Date(dateTimeStr);
        if (isNaN(date)) return dateTimeStr;

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');

        return `${year}/${month}/${day} ${hour}:${minute}`;
    }

    function renderItemTypeBadge(type) {
        if (type === 'mold') {
            return '<span class="ahv-badge ahv-badge-mold">金型 | Khuôn</span>';
        } else if (type === 'cutter') {
            return '<span class="ahv-badge ahv-badge-cutter">抜型 | Dao</span>';
        }
        return '<span class="ahv-badge">-</span>';
    }

    function renderActionBadge(actionType) {
        const badges = {
            'AUDIT_ONLY': '<span class="ahv-badge ahv-badge-audit">棚卸</span>',
            'AUDIT_WITH_RELOCATION': '<span class="ahv-badge ahv-badge-audit-move">棚卸+移動</span>',
            'CHECK_IN': '<span class="ahv-badge ahv-badge-checkin">入庫</span>',
            'CHECK_OUT': '<span class="ahv-badge ahv-badge-checkout">出庫</span>',
            'LOCATION_CHANGE': '<span class="ahv-badge ahv-badge-location">位置変更</span>'
        };

        return badges[actionType] || `<span class="ahv-badge">${escapeHtml(actionType)}</span>`;
    }

    function renderRackLayer(rackLayer) {
        if (!rackLayer) return '-';
        
        if (rackLayer.includes('→')) {
            // Location change
            return `<span class="ahv-rack-change">${escapeHtml(rackLayer)}</span>`;
        }
        
        return `<span class="ahv-rack">${escapeHtml(rackLayer)}</span>`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ======================================== 
    // EMPLOYEE FILTER
    // ======================================== 
    function populateEmployeeFilter() {
        const select = document.getElementById('ahv-employee-filter');
        if (!select) return;

        // Get unique employees from records
        const employeeMap = new Map();
        
        State.allRecords.forEach(record => {
            if (record.employeeId && record.employeeName) {
                employeeMap.set(record.employeeId, record.employeeName);
            }
        });

        // Clear and populate
        select.innerHTML = '<option value="all">すべて | Tất cả</option>';
        
        Array.from(employeeMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                select.appendChild(option);
            });
    }

    // ======================================== 
    // EXPORT CSV
    // ======================================== 
    function exportToCSV() {
        const sorted = sortRecords(State.filteredRecords);
        
        const headers = [
            '日時',
            '金型コード',
            '名前',
            'タイプ',
            '棚段',
            '担当者',
            'アクション',
            'メモ'
        ];

        const rows = sorted.map(record => [
            record.timestamp,
            record.itemCode,
            record.itemName,
            record.itemType,
            record.rackLayer,
            record.employeeName,
            record.actionType,
            record.notes
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_history_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('[AuditHistoryViewer] CSV exported:', sorted.length, 'records');
    }

    // ======================================== 
    // UI HELPERS
    // ======================================== 
    function showLoading(show) {
        const overlay = document.getElementById('ahv-loading-overlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    function showError(message) {
        alert(message);
    }

    // ======================================== 
    // PUBLIC API
    // ======================================== 
    window.AuditHistoryViewer = {
        goToPage(page) {
            State.currentPage = page;
            renderResults();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        refresh: loadAllData,
        getState: () => State
    };

})();
