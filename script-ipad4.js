// script-ipad4.js - Tương thích với iOS 10.3.4
(function() {
    'use strict';
    
    // Polyfills cho iPad 4
    if (!Array.prototype.find) {
        Array.prototype.find = function(predicate) {
            for (var i = 0; i < this.length; i++) {
                if (predicate(this[i], i, this)) {
                    return this[i];
                }
            }
            return undefined;
        };
    }
    
    if (!Array.prototype.includes) {
        Array.prototype.includes = function(searchElement) {
            return this.indexOf(searchElement) !== -1;
        };
    }
    
    // Constants
    var GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
    
    // Global variables
    var allData = {
        molds: [],
        cutters: [],
        molddesign: [],
        companies: [],
        racklayers: [],
        racks: []
    };
    
    var filteredData = [];
    var searchTimeout = null;
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Initializing iPad 4 version...');
        setupEventListeners();
        loadAllData();
    });
    
    function setupEventListeners() {
        var searchInput = document.getElementById('searchInput');
        var clearBtn = document.getElementById('clearSearchBtn');
        var categoryFilter = document.getElementById('categoryFilter');
        var resetBtn = document.getElementById('resetBtn');
        
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
            searchInput.addEventListener('focus', function() {
                this.scrollIntoView({behavior: 'smooth', block: 'center'});
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', clearSearch);
        }
        
        if (categoryFilter) {
            categoryFilter.addEventListener('change', performSearch);
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', resetFilters);
        }
    }
    
    function handleSearchInput() {
        updateClearButton();
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        searchTimeout = setTimeout(function() {
            performSearch();
        }, 500); // Tăng delay cho iPad 4
    }
    
    function updateClearButton() {
        var searchInput = document.getElementById('searchInput');
        var clearBtn = document.getElementById('clearSearchBtn');
        
        if (searchInput && clearBtn) {
            var hasValue = searchInput.value.trim().length > 0;
            clearBtn.style.display = hasValue ? 'block' : 'none';
        }
    }
    
    function clearSearch() {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
            updateClearButton();
            performSearch();
            searchInput.focus();
        }
    }
    
    function resetFilters() {
        var searchInput = document.getElementById('searchInput');
        var categoryFilter = document.getElementById('categoryFilter');
        
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = 'all';
        
        updateClearButton();
        performSearch();
    }
    
    // Load data using XMLHttpRequest (tương thích với iPad 4)
    function loadAllData() {
        showLoading(true);
        
        var filesToLoad = [
            'molds.csv',
            'cutters.csv',
            'molddesign.csv',
            'companies.csv',
            'racklayers.csv',
            'racks.csv'
        ];
        
        var loadedCount = 0;
        var totalFiles = filesToLoad.length;
        
        filesToLoad.forEach(function(file) {
            loadCSVFile(file, function(data) {
                var key = file.replace('.csv', '');
                allData[key] = data || [];
                loadedCount++;
                
                if (loadedCount === totalFiles) {
                    processDataRelationships();
                    performSearch();
                    showLoading(false);
                    console.log('Data loaded successfully for iPad 4');
                }
            });
        });
    }
    
    function loadCSVFile(filename, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', GITHUB_BASE_URL + filename + '?t=' + Date.now(), true);
        
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    var data = parseCSV(xhr.responseText);
                    callback(data);
                } else {
                    console.warn('Failed to load ' + filename);
                    callback([]);
                }
            }
        };
        
        xhr.onerror = function() {
            console.error('Error loading ' + filename);
            callback([]);
        };
        
        xhr.send();
    }
    
    // CSV Parser tương thích với iPad 4
    function parseCSV(csvText) {
        var lines = csvText.split('\n').filter(function(line) {
            return line.trim() !== '';
        });
        
        if (lines.length < 2) return [];
        
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
    
    function processDataRelationships() {
        // Tạo maps cho performance
        var moldDesignMap = {};
        var companyMap = {};
        var rackLayerMap = {};
        var rackMap = {};
        
        allData.molddesign.forEach(function(d) {
            moldDesignMap[d.MoldDesignID] = d;
        });
        
        allData.companies.forEach(function(c) {
            companyMap[c.CompanyID] = c;
        });
        
        allData.racklayers.forEach(function(rl) {
            rackLayerMap[rl.RackLayerID] = rl;
        });
        
        allData.racks.forEach(function(r) {
            rackMap[r.RackID] = r;
        });
        
        // Process molds
        allData.molds = allData.molds.map(function(mold) {
            var design = moldDesignMap[mold.MoldDesignID];
            var storageCompany = companyMap[mold.storagecompany];
            var rackLayer = rackLayerMap[mold.RackLayerID];
            var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
            
            // Create display fields
            var displayCode = mold.MoldCode || '';
            var displayName = mold.MoldName || mold.MoldCode || '';
            var displayDimensions = '';
            
            if (design && design.CutlineX && design.CutlineY) {
                displayDimensions = design.CutlineX + 'x' + design.CutlineY;
            }
            
            var displayLocation = '';
            if (rack && rackLayer) {
                displayLocation = rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber;
            }
            
            var displayCompany = storageCompany ? storageCompany.CompanyShortName : 'N/A';
            
            return {
                MoldID: mold.MoldID,
                MoldCode: mold.MoldCode,
                MoldName: mold.MoldName,
                displayCode: displayCode,
                displayName: displayName,
                displayDimensions: displayDimensions,
                displayLocation: displayLocation,
                displayCompany: displayCompany,
                itemType: 'mold',
                designInfo: design,
                storageCompanyInfo: storageCompany,
                rackLayerInfo: rackLayer,
                rackInfo: rack
            };
        });
        
        // Process cutters
        allData.cutters = allData.cutters.map(function(cutter) {
            var storageCompany = companyMap[cutter.storagecompany];
            var rackLayer = rackLayerMap[cutter.RackLayerID];
            var rack = rackLayer ? rackMap[rackLayer.RackID] : null;
            
            var displayCode = cutter.CutterNo || '';
            var displayName = cutter.CutterName || '';
            var displayDimensions = '';
            
            if (cutter.CutlineLength && cutter.CutlineWidth) {
                displayDimensions = cutter.CutlineLength + 'x' + cutter.CutlineWidth;
                if (cutter.CutterCorner) displayDimensions += '-' + cutter.CutterCorner;
                if (cutter.CutterChamfer) displayDimensions += '-' + cutter.CutterChamfer;
            }
            
            var displayLocation = '';
            if (rack && rackLayer) {
                displayLocation = rack.RackLocation + ' ' + rack.RackID + '-' + rackLayer.RackLayerNumber;
            }
            
            var displayCompany = storageCompany ? storageCompany.CompanyShortName : 'N/A';
            
            return {
                CutterID: cutter.CutterID,
                CutterNo: cutter.CutterNo,
                CutterName: cutter.CutterName,
                displayCode: displayCode,
                displayName: displayName,
                displayDimensions: displayDimensions,
                displayLocation: displayLocation,
                displayCompany: displayCompany,
                itemType: 'cutter',
                storageCompanyInfo: storageCompany,
                rackLayerInfo: rackLayer,
                rackInfo: rack
            };
        });
        
        console.log('Processed ' + allData.molds.length + ' molds and ' + allData.cutters.length + ' cutters');
    }
    
    function performSearch() {
        var searchInput = document.getElementById('searchInput');
        var categoryFilter = document.getElementById('categoryFilter');
        
        var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        var category = categoryFilter ? categoryFilter.value : 'all';
        
        // Combine data based on category
        var dataToSearch = [];
        if (category === 'all' || category === 'mold') {
            dataToSearch = dataToSearch.concat(allData.molds);
        }
        if (category === 'all' || category === 'cutter') {
            dataToSearch = dataToSearch.concat(allData.cutters);
        }
        
        // Filter data
        if (query === '') {
            filteredData = dataToSearch;
        } else {
            filteredData = dataToSearch.filter(function(item) {
                var searchFields = [
                    item.displayCode,
                    item.displayName,
                    item.displayDimensions,
                    item.displayLocation,
                    item.displayCompany
                ].join(' ').toLowerCase();
                
                return searchFields.indexOf(query) !== -1;
            });
        }
        
        displayResults();
    }
    
    function displayResults() {
        var container = document.getElementById('resultsTable');
        if (!container) return;
        
        if (filteredData.length === 0) {
            container.innerHTML = '<div class="no-results-ipad4"><p>結果が見つかりません / Không tìm thấy kết quả</p></div>';
            return;
        }
        
        var html = '<table class="table-ipad4">';
        html += '<thead><tr>';
        html += '<th>コード / Mã</th>';
        html += '<th>名前 / Tên</th>';
        html += '<th>サイズ / Kích thước</th>';
        html += '<th>位置 / Vị trí</th>';
        html += '<th>会社 / Công ty</th>';
        html += '</tr></thead><tbody>';
        
        filteredData.forEach(function(item) {
            var rowClass = item.itemType === 'mold' ? 'mold-row' : 'cutter-row';
            var codeClass = item.itemType === 'mold' ? 'mold-code' : 'cutter-code';
            var nameClass = item.itemType === 'mold' ? 'mold-name' : 'cutter-name';
            
            html += '<tr class="' + rowClass + '">';
            html += '<td><span class="' + codeClass + '">' + (item.displayCode || '') + '</span></td>';
            html += '<td><span class="' + nameClass + '">' + (item.displayName || '') + '</span></td>';
            html += '<td>' + (item.displayDimensions || '') + '</td>';
            html += '<td>' + (item.displayLocation || '') + '</td>';
            html += '<td>' + (item.displayCompany || '') + '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }
    
    function showLoading(show) {
        var loading = document.getElementById('loadingIndicator');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }
    
})();
