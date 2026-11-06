// SPDX-License-Identifier: Apache-2.0
/**
 * Unit tests for the shared dump-user-emails listing helper.
 * Fixture people only — no CouchDB.
 */
import {describe, expect, it} from 'vitest';
import {
  listUserEmails,
  UserEmailListingPerson,
  UserEmailListingRow,
} from '../src/utils/userEmailListing';

function person(
  id: string,
  emails: Array<{email?: string; verified?: boolean}>,
  overrides: Partial<UserEmailListingPerson> = {}
): UserEmailListingPerson {
  return {
    _id: id,
    user_id: id,
    name: id,
    emails,
    ...overrides,
  };
}

/** Fixture set covering skip, archived, blanks, de-dupe, sort, unverified, empty. */
const FIXTURES: UserEmailListingPerson[] = [
  person('zeta', [{email: 'zeta@csiro.au', verified: true}], {name: 'Zeta'}),
  person('alice', [{email: 'alice@csiro.au', verified: true}], {name: 'Alice'}),
  person('tester', [{email: 'tester@university.edu', verified: true}]),
  person('demo', [{email: 'demo.user@csiro.au', verified: true}]),
  person('example', [{email: 'person@example.com', verified: true}]),
  person('retired', [{email: 'retired@csiro.au', verified: true}], {
    name: 'Retired',
    disabled: true,
  }),
  person('blank', [
    {email: '   ', verified: true},
    {email: '', verified: true},
  ]),
  person('dup-a', [{email: '  Shared@Org.au  ', verified: true}], {
    name: 'First',
  }),
  person('dup-b', [{email: 'shared@org.au', verified: false}], {
    name: 'Second',
  }),
  person('unverified', [{email: 'unverified@csiro.au', verified: false}], {
    name: 'Unverified',
  }),
  person('admin', [], {name: 'Admin User'}),
  person('missing-emails', [], {name: 'No Emails Field', emails: undefined}),
];

function emailsOf(rows: UserEmailListingRow[]): string[] {
  return rows.map(row => row.email);
}

describe('listUserEmails', () => {
  it('default listing omits skip matches, disabled, and blanks; de-dupes; sorts', () => {
    const rows = listUserEmails(FIXTURES);

    expect(emailsOf(rows)).toEqual([
      'alice@csiro.au',
      'shared@org.au',
      'unverified@csiro.au',
      'zeta@csiro.au',
    ]);
  });

  it('skips test, demo, and example.com addresses case-insensitively', () => {
    const rows = listUserEmails([
      person('t1', [{email: 'TEST@university.edu', verified: true}]),
      person('d1', [{email: 'Demo.User@csiro.au', verified: true}]),
      person('e1', [{email: 'Person@Example.COM', verified: true}]),
      person('ok', [{email: 'ok@csiro.au', verified: true}]),
    ]);

    expect(emailsOf(rows)).toEqual(['ok@csiro.au']);
  });

  it('includeSkipped returns addresses the default skip would drop, still omitting blanks', () => {
    const rows = listUserEmails(FIXTURES, {includeSkipped: true});
    const emails = emailsOf(rows);

    expect(emails).toContain('tester@university.edu');
    expect(emails).toContain('demo.user@csiro.au');
    expect(emails).toContain('person@example.com');
    expect(emails).not.toContain('');
    expect(emails).not.toContain('   ');
    expect(emails).not.toContain('retired@csiro.au');
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('omits disabled accounts by default and with includeArchived false', () => {
    const omitted = listUserEmails(FIXTURES);
    const explicit = listUserEmails(FIXTURES, {includeArchived: false});

    expect(emailsOf(omitted)).not.toContain('retired@csiro.au');
    expect(emailsOf(explicit)).toEqual(emailsOf(omitted));
    expect(omitted.every(row => row.disabled === false)).toBe(true);
  });

  it('includeArchived includes disabled accounts with disabled true', () => {
    const rows = listUserEmails(FIXTURES, {includeArchived: true});
    const retired = rows.find(row => row.email === 'retired@csiro.au');

    expect(retired).toEqual({
      email: 'retired@csiro.au',
      name: 'Retired',
      userId: 'retired',
      disabled: true,
      verified: true,
    });
    expect(emailsOf(rows)).toEqual([
      'alice@csiro.au',
      'retired@csiro.au',
      'shared@org.au',
      'unverified@csiro.au',
      'zeta@csiro.au',
    ]);
  });

  it('omits blank and whitespace-only addresses', () => {
    const rows = listUserEmails([
      person('only-blank', [
        {email: '', verified: true},
        {email: ' \t', verified: true},
        {email: undefined, verified: true},
      ]),
      person('ok', [{email: 'ok@csiro.au', verified: true}]),
    ]);

    expect(emailsOf(rows)).toEqual(['ok@csiro.au']);
  });

  it('de-duplicates by trimmed lowercase email; first seen wins', () => {
    const rows = listUserEmails(FIXTURES);
    const shared = rows.filter(row => row.email === 'shared@org.au');

    expect(shared).toHaveLength(1);
    expect(shared[0]).toEqual({
      email: 'shared@org.au',
      name: 'First',
      userId: 'dup-a',
      disabled: false,
      verified: true,
    });
  });

  it('sorts remaining emails with localeCompare', () => {
    const rows = listUserEmails([
      person('z', [{email: 'zeta@csiro.au', verified: true}]),
      person('m', [{email: 'mike@csiro.au', verified: true}]),
      person('a', [{email: 'alice@csiro.au', verified: true}]),
    ]);

    const emails = emailsOf(rows);
    const sorted = [...emails].sort((a, b) => a.localeCompare(b));
    expect(emails).toEqual(sorted);
    expect(emails).toEqual([
      'alice@csiro.au',
      'mike@csiro.au',
      'zeta@csiro.au',
    ]);
  });

  it('includes unverified addresses and sets verified from the email entry', () => {
    const rows = listUserEmails(FIXTURES);
    const unverified = rows.find(row => row.email === 'unverified@csiro.au');

    expect(unverified).toEqual({
      email: 'unverified@csiro.au',
      name: 'Unverified',
      userId: 'unverified',
      disabled: false,
      verified: false,
    });
  });

  it('a user with an empty emails array contributes no row', () => {
    const rows = listUserEmails([
      person('admin', [], {name: 'Admin User'}),
      person('ok', [{email: 'ok@csiro.au', verified: true}]),
    ]);

    expect(emailsOf(rows)).toEqual(['ok@csiro.au']);
    expect(rows.some(row => row.userId === 'admin')).toBe(false);
  });

  it('a user with missing emails contributes no row', () => {
    const rows = listUserEmails([
      {_id: 'ghost', user_id: 'ghost', name: 'Ghost'},
    ]);

    expect(rows).toEqual([]);
  });

  it('does not take caller skip regexes: always uses the hardcoded list', () => {
    const rows = listUserEmails(
      [person('ok', [{email: 'ok@csiro.au', verified: true}])],
      // @ts-expect-error caller regexes are not part of the helper API
      {skipPatterns: ['ok']}
    );

    expect(emailsOf(rows)).toEqual(['ok@csiro.au']);
  });

  it('default options match the dump-user-emails default set', () => {
    const viaDefault = listUserEmails(FIXTURES);
    const viaExplicit = listUserEmails(FIXTURES, {
      includeArchived: false,
      includeSkipped: false,
    });

    expect(viaDefault).toEqual(viaExplicit);
    expect(emailsOf(viaDefault)).toEqual([
      'alice@csiro.au',
      'shared@org.au',
      'unverified@csiro.au',
      'zeta@csiro.au',
    ]);
  });
});
