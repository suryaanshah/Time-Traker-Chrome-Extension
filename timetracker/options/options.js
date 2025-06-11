document.addEventListener('DOMContentLoaded', () => {
    const statsList = document.getElementById('statsList');
    const loadingMessage = document.getElementById('loadingMessage');
    const noDataMessage = document.getElementById('noDataMessage');
    const periodFilters = document.querySelectorAll('input[name="period"]');

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatTime(totalSeconds) {
        if (totalSeconds < 0) totalSeconds = 0;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        let parts = [];
        if (h > 0) parts.push(h + "h");
        if (m > 0) parts.push(m + "m");
        if (s > 0 || parts.length === 0) parts.push(s + "s");
        return parts.join(' ') || "0s";
    }

    async function fetchDataAndDisplay(selectedPeriod = 'daily') {
        loadingMessage.style.display = 'block';
        noDataMessage.style.display = 'none';
        statsList.innerHTML = '';

        try {
            const result = await chrome.storage.local.get(['dailyTimeData']);
            const allDailyData = result.dailyTimeData || {};
            let aggregatedData = {};

            const today = new Date();

            if (selectedPeriod === 'daily') {
                const todayStr = formatDate(today);
                aggregatedData = allDailyData[todayStr] || {};
            } else if (selectedPeriod === 'weekly') {
                for (let i = 0; i < 7; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() - i);
                    const dateStr = formatDate(date);
                    if (allDailyData[dateStr]) {
                        for (const hostname in allDailyData[dateStr]) {
                            aggregatedData[hostname] = (aggregatedData[hostname] || 0) + allDailyData[dateStr][hostname];
                        }
                    }
                }
            } else if (selectedPeriod === 'monthly') {
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();
                for (const dateStr in allDailyData) {
                    const [year, month] = dateStr.split('-').map(Number);
                    if (year === currentYear && (month - 1) === currentMonth) {
                        for (const hostname in allDailyData[dateStr]) {
                            aggregatedData[hostname] = (aggregatedData[hostname] || 0) + allDailyData[dateStr][hostname];
                        }
                    }
                }
            } else { // allTime
                for (const dateStr in allDailyData) {
                    for (const hostname in allDailyData[dateStr]) {
                        aggregatedData[hostname] = (aggregatedData[hostname] || 0) + allDailyData[dateStr][hostname];
                    }
                }
            }

            const sortedEntries = Object.entries(aggregatedData).sort(([, aTime], [, bTime]) => bTime - aTime);

            if (sortedEntries.length > 0) {
                sortedEntries.forEach(([hostname, totalSeconds]) => {
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `<span class="hostname">${hostname}</span>: <span class="time">${formatTime(totalSeconds)}</span>`;
                    statsList.appendChild(listItem);
                });
            } else {
                noDataMessage.style.display = 'block';
            }

        } catch (error) {
            console.error("Error fetching or processing data:", error);
            noDataMessage.textContent = "Error loading data.";
            noDataMessage.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    periodFilters.forEach(radio => {
        radio.addEventListener('change', (event) => {
            fetchDataAndDisplay(event.target.value);
        });
    });

    // Initial load
    const initiallyChecked = document.querySelector('input[name="period"]:checked');
    fetchDataAndDisplay(initiallyChecked ? initiallyChecked.value : 'daily');
});
