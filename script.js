let data = []; // Chứa dữ liệu từ Google Sheets

// Tải dữ liệu từ Google CSV
async function loadData() {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRznifvae0x2DxXkshp6Udqn68kiOSF8BQ_eEsdUQoPoRNCxBYbq_4yXo6Zmz6dgkivd2vAmCw1kJgB/pub?gid=54626089&single=true&output=csv";

    try {
        const response = await fetch(url);
        const csvData = await response.text();

        const rows = csvData.split("\n");
        const headers = rows[0].split(",");
        data = rows.slice(1).map(row => {
            const values = row.split(",");
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] || "";
                return obj;
            }, {});
        });

        displayData(data); // Hiển thị dữ liệu
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
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
