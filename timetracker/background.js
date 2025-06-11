// --- Constants ---
const ALARM_NAME_ACTIVE_SITE = 'activeSiteTimer';
const ALARM_PERIOD_SECONDS = 1; // Alarm fires every second

// --- State ---
let currentActiveHostname = null; // e.g., "www.youtube.com"

// --- Helper: Get current date as YYYY-MM-DD ---
function getCurrentDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Storage Function ---
async function incrementStoredTime(hostname, secondsToAdd) {
    if (!hostname || typeof secondsToAdd !== 'number' || secondsToAdd <= 0) {
        return;
    }

    const dateString = getCurrentDateString();

    try {
        // We will store data under a general key, e.g., 'dailyTimeData'
        const result = await chrome.storage.local.get(['dailyTimeData']);
        const dailyTimeData = result.dailyTimeData || {};

        // Ensure the entry for the current date exists
        if (!dailyTimeData[dateString]) {
            dailyTimeData[dateString] = {};
        }

        // Increment time for the hostname on the current date
        dailyTimeData[dateString][hostname] = (dailyTimeData[dateString][hostname] || 0) + secondsToAdd;

        await chrome.storage.local.set({ dailyTimeData });
        // console.log(`Incremented: ${dateString} - ${hostname} by ${secondsToAdd}s. Total: ${dailyTimeData[dateString][hostname]}s`);
    } catch (e) {
        console.error(`Error incrementing stored time for ${dateString} - ${hostname}:`, e);
    }
}

// --- Core Logic to Process URL/Activity Changes ---
async function processNewActiveUrl(urlCandidate) {
    let newTrackedHostname = null;
    if (urlCandidate) {
        try {
            const urlObj = new URL(urlCandidate);
            if (urlObj.protocol === "http:" || urlObj.protocol === "https:") {
                newTrackedHostname = urlObj.hostname;
            }
        } catch (e) { /* Invalid URL */ }
    }

    if (currentActiveHostname !== newTrackedHostname) {
        if (currentActiveHostname) {
            await chrome.alarms.clear(ALARM_NAME_ACTIVE_SITE);
            // console.log(`Stopped timing (cleared alarm for): ${currentActiveHostname}`);
        }
        currentActiveHostname = newTrackedHostname;
        if (currentActiveHostname) {
            // console.log(`Now timing (created alarm for): ${currentActiveHostname}`);
            await chrome.alarms.create(ALARM_NAME_ACTIVE_SITE, {
                periodInMinutes: ALARM_PERIOD_SECONDS / 60.0
            });
        }
    }
}

// --- Alarm Listener ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME_ACTIVE_SITE) {
        if (currentActiveHostname) {
            await incrementStoredTime(currentActiveHostname, ALARM_PERIOD_SECONDS);
        } else {
            await chrome.alarms.clear(ALARM_NAME_ACTIVE_SITE);
        }
    }
});

// --- Event Listeners for Tab/Window Activity ---
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) { processNewActiveUrl(null); return; }
    processNewActiveUrl(tab && tab.url ? tab.url : null);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    processNewActiveUrl(changeInfo.url);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    if (currentActiveHostname) {
      await chrome.alarms.clear(ALARM_NAME_ACTIVE_SITE);
      currentActiveHostname = null;
    }
  } else {
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      processNewActiveUrl(tabs[0] && tabs[0].url ? tabs[0].url : null);
    });
  }
});

// --- Handle Action Click to Open Options Page ---
chrome.action.onClicked.addListener((tab) => {
    const optionsUrl = chrome.runtime.getURL("options/options.html");
    chrome.tabs.query({ url: optionsUrl }, (tabs) => {
        if (tabs.length > 0) {
            // If options page is already open, focus it
            chrome.tabs.update(tabs[0].id, { active: true });
            chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            // Otherwise, open it in a new tab
            chrome.tabs.create({ url: optionsUrl });
        }
    });
});


// --- Initial setup on install/startup ---
async function initializeExtensionState() {
    await chrome.alarms.clearAll(); // Clear any stale alarms
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
            processNewActiveUrl(tabs[0].url);
        }
    });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Time Tracker (Phase 6 Options Page) Installed/Updated.");
  await initializeExtensionState();
});

chrome.runtime.onStartup.addListener(async () => {
    console.log("Browser started.");
    await initializeExtensionState();
});
