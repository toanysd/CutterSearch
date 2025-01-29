let data = []; // Chứa dữ liệu từ Excel

// Đọc file Excel và chuyển thành JSON
function loadExcel(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const dataArray = new Uint8Array(e.target.result);
        const workbook = XLSX.read(dataArray, { type: 'array' });

        // Lấy dữ liệu từ sheet đầu tiên
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet); // Chuyển sheet thành JSON

        // Hiển thị dữ liệu lên bảng
        displayData(data);
    };

    reader.readAsArrayBuffer(file);
}

// Hiển thị dữ liệu trong bảng
function displayData(data) {
    const tableBody = document.getElementById("dataTable");
    tableBody.innerHTML = ""; // Xóa bảng cũ

    data.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.CutterID || ""}</td>
            <td>${row.CutterNo || ""}</td>
            <td>${row.MoldDesignName || ""}</td>
            <td>${row.MoldDesignCode || ""}</td>
            <td>${row.CutterType || ""}</td>
            <td>${row.RackLayerID || ""}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// Tìm kiếm dữ liệu
function searchData() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const columnFilter = document.getElementById("columnFilter").value;

    let filteredData = data.filter(row => {
        if (columnFilter === "all") {
            return Object.values(row).some(value =>
                value && value.toString().toLowerCase().includes(query)
            );
        } else {
            return row[columnFilter] && row[columnFilter].toString().toLowerCase().includes(query);
        }
    });

    displayData(filteredData);
}
