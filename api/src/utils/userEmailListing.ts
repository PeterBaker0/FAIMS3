// SPDX-License-Identifier: Apache-2.0
/**
 * Shared people-db → downtime-email row listing.
 *
 * Used by `dump-user-emails` and (later) GET /api/users/emails so CLI and API
 * cannot drift. Skip regexes are hardcoded; callers cannot supply patterns.
 */
import {isPeopleUserAccountDisabled} from '@faims3/data-model';

/**
 * People-db fields the listing reads. Existing people documents are
 * assignable; tests may pass fixtures that omit unused role/profile fields.
 */
export type UserEmailListingPerson = {
  _id: string;
  user_id?: string;
  name?: string | null;
  emails?: ReadonlyArray<{
    email?: string | null;
    verified?: boolean;
  }> | null;
  disabled?: boolean;
};

/** One address after skip, blank-omit, de-dupe, and sort. */
export type UserEmailListingRow = {
  email: string;
  name: string;
  userId: string;
  disabled: boolean;
  verified: boolean;
};

export type ListUserEmailsOptions = {
  /**
   * When true, include disabled accounts (rows have `disabled: true`).
   * Default false matches GET /api/users?includeArchived and CLI without
   * `--include-disabled`.
   */
  includeArchived?: boolean;
  /**
   * When true, do not apply the default skip list. Blanks are still omitted
   * and addresses are still de-duplicated.
   */
  includeSkipped?: boolean;
};

/**
 * Default skip: "test" / "demo" anywhere in the address; example.com domain.
 * Case-insensitive. Not env-configurable; not caller-supplied.
 */
const DEFAULT_SKIP_PATTERNS = ['test', 'demo', String.raw`example\.com`];

const DEFAULT_SKIP_MATCHERS = DEFAULT_SKIP_PATTERNS.map(
  pattern => new RegExp(pattern, 'i')
);

function shouldSkipEmail(email: string): boolean {
  return DEFAULT_SKIP_MATCHERS.some(re => re.test(email));
}

/**
 * Build the downtime-email row list from already-fetched people docs.
 *
 * Default (no options): omit disabled accounts, omit addresses matching the
 * hardcoded skip list, omit blank/whitespace emails, de-duplicate by trimmed
 * lowercase email (first seen wins), include unverified addresses, sort with
 * `localeCompare`.
 */
export function listUserEmails(
  people: readonly UserEmailListingPerson[],
  options: ListUserEmailsOptions = {}
): UserEmailListingRow[] {
  const includeArchived = options.includeArchived === true;
  const includeSkipped = options.includeSkipped === true;

  const users = includeArchived
    ? people
    : people.filter(user => !isPeopleUserAccountDisabled(user));

  const rows: UserEmailListingRow[] = [];
  const seen = new Set<string>();

  for (const user of users) {
    for (const entry of user.emails ?? []) {
      const email = (entry.email ?? '').trim().toLowerCase();
      if (!email || seen.has(email)) {
        continue;
      }
      if (!includeSkipped && shouldSkipEmail(email)) {
        continue;
      }
      seen.add(email);
      rows.push({
        email,
        name: user.name ?? '',
        userId: user.user_id ?? user._id,
        disabled: isPeopleUserAccountDisabled(user),
        verified: entry.verified === true,
      });
    }
  }

  rows.sort((a, b) => a.email.localeCompare(b.email));
  return rows;
}
