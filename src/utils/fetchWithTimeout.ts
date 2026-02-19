/**
 * Fetch with timeout and retry logic
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 30000,
  retries = 2,
  retryDelay = 1000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
  };

  let lastError: Error = new Error("Unknown error");
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

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          lastError = new Error(`Request timeout after ${timeout}ms`);
        } else if (error.message.includes("Failed to fetch")) {
          lastError = new Error(`Network error: Failed to fetch from ${url}`);
        } else {
          lastError = error;
        }
      } else {
        lastError = new Error(String(error));
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
