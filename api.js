// api.js — Centralized API calls with hardcoded backend

const API_BASE_URL = "http://207.246.87.60:5000";  // Live: http://207.246.87.60:5000  Local: http://localhost:5000
const API_TIMEOUT = 60_000;

// Shared fetch options
const FETCH_OPTIONS = {
  mode: "cors",
  credentials: "omit",
  headers: {
    "Content-Type": "application/json",
  }
};

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
 * POST request to baseURL + endpoint
 */
async function makeApiRequest(endpoint, body) {
  const cleanEndpoint = endpoint.replace(/^\//, "");
  const url = `${API_BASE_URL}/${cleanEndpoint}`;
  console.log(`→ Fetching ${url}`, body);

  try {
    const res = await fetchWithTimeout(url, {
      ...FETCH_OPTIONS,
      method: "POST",
      body: JSON.stringify(body),
    });

    console.log(`← ${url} responded ${res.status}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    return res.json();
  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.message.includes("timed out");
    return {
      error: true,
      message: isTimeout
        ? `Request timed out after ${API_TIMEOUT / 1000} seconds`
        : `Connection failed: ${err.message}`,
      details: isTimeout
        ? "API server did not respond in time."
        : "Could not connect to API server.",
      originalError: err.toString(),
    };
  }
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
