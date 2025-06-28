// api.js — Centralized API calls with local → config.remote fallback

let CONFIG = {
  apiBasePath: null,
  showApiDataButton: false
};

// Load config from shared JSON file
export async function loadConfig() {
  try {
    const res = await fetch('bug-bounty-document-template.json');
    const json = await res.json();
    CONFIG = { ...CONFIG, ...json.config };
    console.log("✅ Config loaded:", CONFIG);
  } catch (err) {
    console.warn("❌ Failed to load config JSON:", err);
  }
}

// Shared fetch options
const FETCH_OPTIONS = {
  mode: "cors",
  credentials: "omit",
  headers: {
    "Content-Type": "application/json",
  }
};

const LOCAL_API_URL = "http://localhost:5000";
const API_TIMEOUT = 60_000;

/**
 * Wrap fetch in a timeout.
 */
function fetchWithTimeout(url, options = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const signal = controller.signal;

    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Request timed out"));
    }, API_TIMEOUT);

    fetch(url, { ...options, signal })
      .then(res => {
        clearTimeout(timeout);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * Try a single POST request to baseURL + endpoint
 */
async function tryRequest(baseURL, endpoint, body) {
  const cleanEndpoint = endpoint.replace(/^\//, "");
  const url = `${baseURL}/${cleanEndpoint}`;
  console.log(`→ Fetching ${url}`, body);

  const res = await fetchWithTimeout(url, {
    ...FETCH_OPTIONS,
    method: "POST",
    body: JSON.stringify(body),
  });

  console.log(`← ${url} responded ${res.status}`);
  if (!res.ok) throw new Error(`Server error ${res.status}`);

  return res.json();
}

/**
 * Try localhost first, fallback to config.apiBasePath
 */
async function makeApiRequest(endpoint, body) {
  let lastError = null;

  try {
    return await tryRequest(LOCAL_API_URL, endpoint, body);
  } catch (err) {
    console.warn("⚠ Local API failed, trying remote:", err);
    lastError = err;
  }

  try {
    if (!CONFIG.apiBasePath) throw new Error("No remote API base path configured.");
    return await tryRequest(CONFIG.apiBasePath, endpoint, body);
  } catch (err) {
    console.warn("❌ Remote API failed:", err);
    lastError = err;
  }

  const isTimeout = lastError.name === "AbortError" || lastError.message.includes("timed out");
  return {
    error: true,
    message: isTimeout
      ? `Request timed out after ${API_TIMEOUT / 1000} seconds`
      : `Connection failed: ${lastError.message}`,
    details: isTimeout
      ? "Neither local nor remote API responded in time."
      : "Could not connect to any API server.",
    originalError: lastError.toString(),
  };
}

/**
 * Public export: fetch mobile app details
 */
export async function fetchMobileAppDetailsForDomain(
  domain,
  search_mode = "app_name",
  retrieve_android_version = false
) {
  return makeApiRequest("mobile-app-details-for-domain", {
    domain,
    search_mode,
    retrieve_android_version
  });
}

/**
 * Public export: fetch API details
 */
export async function fetchApiDetails(domain) {
  return makeApiRequest("api-details", { domain });
}

export function setRemoteApiBasePath(path) {
  CONFIG.apiBasePath = path;
}
