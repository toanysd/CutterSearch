let data = []; // Chứa dữ liệu từ Google Sheets

// Tải dữ liệu từ Google Sheets
async function loadData() {
    const url = "https://sheets.googleapis.com/v4/spreadsheets/1WwG6VlbgEhPnvRYNfjO_7ZjnwEt_Rw8u6IVGofJQasU/values/Sheet1?key=AIzaSyD2sBEWzaaqOdBAsQWoOo0lD1aBdC2sXWU"; // Thay URL với Spreadsheet ID và API Key
    try {
        const response = await fetch(url);
        const result = await response.json();

        // Chuyển dữ liệu từ Google Sheets thành mảng JSON
        const headers = result.values[0]; // Dòng tiêu đề
        data = result.values.slice(1).map(row => {
            const rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = row[index] || ""; // Gán giá trị hoặc để trống nếu không có
            });
            return rowObject;
        });

        displayData(data); // Hiển thị dữ liệu lên bảng
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        alert("Không thể tải dữ liệu từ Google Sheets!");
    }
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

// Gọi hàm loadData khi trang được tải
window.onload = loadData;
