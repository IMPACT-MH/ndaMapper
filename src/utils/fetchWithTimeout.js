/**
 * Fetch with timeout and retry logic
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options (same as standard fetch)
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @param {number} retries - Number of retries (default: 2)
 * @param {number} retryDelay - Delay between retries in milliseconds (default: 1000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(
    url,
    options = {},
    timeout = 30000,
    retries = 2,
    retryDelay = 1000
) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const fetchOptions = {
        ...options,
        signal: controller.signal,
    };

    let lastError;
    let currentController = controller;
    let currentTimeoutId = timeoutId;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(currentTimeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            clearTimeout(currentTimeoutId);

            // If it's an abort error (timeout), we want to retry
            if (error.name === "AbortError") {
                lastError = new Error(`Request timeout after ${timeout}ms`);
            } else if (error.message.includes("Failed to fetch")) {
                lastError = new Error(
                    `Network error: Failed to fetch from ${url}`
                );
            } else {
                lastError = error;
            }

            // If we have retries left, wait and try again
            if (attempt < retries) {
                await new Promise((resolve) =>
                    setTimeout(resolve, retryDelay * (attempt + 1))
                );
                // Create a new controller for the retry
                currentController = new AbortController();
                currentTimeoutId = setTimeout(
                    () => currentController.abort(),
                    timeout
                );
                fetchOptions.signal = currentController.signal;
            }
        }
    }

    throw lastError;
}
