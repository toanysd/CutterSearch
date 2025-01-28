const API_KEY = 'AIzaSyD2sBEWzaaqOdBAsQWoOo0lD1aBdC2sXWU';
const SPREADSHEET_ID = '1JG-CZBM1wdmXvfSSwsyAph7KoZpsWtDF4MD2p-ZK91w';
const RANGE = 'Sheet1!A:X'; // Phạm vi dữ liệu trong Google Sheets



document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cutterNo = document.getElementById('cutterNo').value.toLowerCase();
    const moldName = document.getElementById('moldName').value.toLowerCase();

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const rows = data.values;

    const filteredRows = rows.filter(row => {
        const matchesCutterNo = cutterNo ? row[0]?.toLowerCase().includes(cutterNo) : true;
        const matchesMoldName = moldName ? row[1]?.toLowerCase().includes(moldName) : true;
        return matchesCutterNo && matchesMoldName;
    });

    const tbody = document.querySelector('#resultsTable tbody');
    tbody.innerHTML = '';
    filteredRows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
});
