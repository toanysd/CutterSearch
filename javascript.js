const API_KEY = 'AIzaSyD2sBEWzaaqOdBAsQWoOo0lD1aBdC2sXWU';
const SPREADSHEET_ID = '1JG-CZBM1wdmXvfSSwsyAph7KoZpsWtDF4MD2p-ZK91w';
const RANGE = 'Sheet1!A:D'; // Phạm vi dữ liệu trong Google Sheets

document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const moldCode = document.getElementById('moldCode').value;
    const cutterNo = document.getElementById('cutterNo').value;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const rows = data.values;

    const filteredRows = rows.filter(row => {
        const matchesMold = moldCode ? row[0]?.includes(moldCode) : true;
        const matchesCutter = cutterNo ? row[2]?.includes(cutterNo) : true;
        return matchesMold && matchesCutter;
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
