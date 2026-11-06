// SPDX-License-Identifier: Apache-2.0
import {INPUT_LIMITS} from '@faims3/data-model';

/** One-time auth query keys the clients already strip from the URL after login. */
const STRIP_QUERY_KEYS = ['exchangeToken'];

/**
 * Current page URL for the feedback payload: truncate to the shared redirect
 * max and drop one-time auth query keys. The API does not fetch this URL.
 */
export function feedbackPageUrl(
  href: string = typeof window === 'undefined' ? '' : window.location.href,
  maxLength: number = INPUT_LIMITS.REDIRECT_URL_MAX_LENGTH
): string {
  try {
    const url = new URL(href);
    for (const key of STRIP_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    const result = url.toString();
    return result.length > maxLength ? result.slice(0, maxLength) : result;
  } catch {
    return href.slice(0, maxLength);
  }
}
