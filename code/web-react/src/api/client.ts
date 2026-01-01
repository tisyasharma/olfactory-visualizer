// API client with type-safe fetch wrapper

export const API_BASE = '/api/v1';

export class APIError extends Error {
  status: number;
  statusText: string;
  detail: string;

  constructor(status: number, statusText: string, detail: string) {
    super(`${status} ${statusText}${detail ? ` — ${detail}` : ''}`);
    this.name = 'APIError';
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

/**
 * Type-safe fetch wrapper for JSON APIs
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';

  const getText = () => response.text().catch(() => 'Unable to read response body.');

  if (!response.ok) {
    const detail = await getText();
    throw new APIError(response.status, response.statusText, detail);
  }

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await getText();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Expected JSON but received non-JSON response.');
  }
}

/**
 * Build URL with query parameters
 */
export function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | null | undefined>
): string {
  const url = new URL(endpoint, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.pathname + url.search;
}

/**
 * Format bytes into human-readable units
 */
export function prettyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  let b = bytes;

  do {
    b /= 1024;
    ++u;
  } while (b >= 1024 && u < units.length - 1);

  return `${b.toFixed(1)} ${units[u]}`;
}
