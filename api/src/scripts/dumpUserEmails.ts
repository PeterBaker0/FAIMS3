// SPDX-License-Identifier: Apache-2.0
/* eslint-disable n/no-process-exit */
/**
 * Dump user email addresses from the people DB for maintenance notices.
 *
 * Usage (from api/, with .env pointing at the target Couch):
 *   pnpm run dump-user-emails
 *   pnpm run dump-user-emails --format=csv
 *   pnpm run dump-user-emails --format=bcc --include-disabled
 *   pnpm run dump-user-emails --skip=test,example\\.com
 *   pnpm run dump-user-emails --no-skip
 *
 * Formats:
 *   lines  one email per line (default) — paste into BCC / mailing tools
 *   bcc    comma-separated on one line — paste into a single BCC field
 *   csv    name,email,user_id,disabled,verified — for a spreadsheet
 *
 * Skip: emails matching any --skip regex are excluded (case-insensitive).
 * Default skip list: test, demo (anywhere), example\.com
 *
 * Progress / diagnostics go to stderr so stdout stays paste-ready.
 */
import {config} from '../buildconfig';
import {verifyCouchDBConnection} from '../couchdb';
import {getUsers} from '../couchdb/users';
import {listUserEmails} from '../utils/userEmailListing';

type Format = 'lines' | 'bcc' | 'csv';

/** How long to wait for the initial HTTP probe / full user fetch before failing. */
const CONNECT_TIMEOUT_MS = 15_000;
const FETCH_USERS_TIMEOUT_MS = 60_000;

function log(...args: unknown[]): void {
  console.error('[dump-user-emails]', ...args);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [`${error.name}: ${error.message}`];
    const anyErr = error as Error & {
      code?: string;
      cause?: unknown;
      status?: number;
      statusCode?: number;
    };
    if (anyErr.code) parts.push(`code=${anyErr.code}`);
    if (anyErr.status !== undefined) parts.push(`status=${anyErr.status}`);
    if (anyErr.statusCode !== undefined) {
      parts.push(`statusCode=${anyErr.statusCode}`);
    }
    if (anyErr.cause !== undefined) {
      parts.push(`cause=${formatError(anyErr.cause)}`);
    }
    if (error.stack) parts.push(error.stack);
    return parts.join('\n');
  }
  return String(error);
}

async function withTimeout<T>(
  label: string,
  ms: number,
  work: Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${ms}ms. Check COUCHDB_INTERNAL_URL, network/VPN, and that Couch is reachable.`
        )
      );
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function parseArgs(argv: string[]): {
  format: Format;
  includeDisabled: boolean;
  /** Undefined means use the helper's hardcoded default skip list. */
  skipPatterns: string[] | undefined;
  noSkip: boolean;
} {
  let format: Format = 'lines';
  let includeDisabled = false;
  let skipPatterns: string[] | undefined;
  let noSkip = false;

  for (const arg of argv) {
    if (arg === '--include-disabled') {
      includeDisabled = true;
      continue;
    }
    if (arg === '--no-skip') {
      noSkip = true;
      continue;
    }
    if (arg.startsWith('--skip=')) {
      const raw = arg.slice('--skip='.length);
      skipPatterns = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length) as Format;
      if (value !== 'lines' && value !== 'bcc' && value !== 'csv') {
        throw new Error(`Unknown format '${value}'. Use lines, bcc, or csv.`);
      }
      format = value;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      console.log(`Usage: pnpm run dump-user-emails [options]

Options:
  --format=lines|bcc|csv   Output format (default: lines)
  --include-disabled       Include disabled accounts
  --skip=pat1,pat2         Comma-separated regexes; exclude matching emails
                           (default: test,demo,example\\.com)
  --no-skip                Do not exclude any emails by pattern
`);
      process.exit(0);
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (noSkip) {
    skipPatterns = [];
  }

  return {format, includeDisabled, skipPatterns, noSkip};
}

function compileSkipMatchers(patterns: string[]): RegExp[] {
  return patterns.map(pattern => {
    try {
      return new RegExp(pattern, 'i');
    } catch {
      throw new Error(`Invalid --skip regex: ${pattern}`);
    }
  });
}

function shouldSkipEmail(email: string, matchers: RegExp[]): boolean {
  return matchers.some(re => re.test(email));
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function logConfigSummary(): void {
  const auth = config.localCouchdbAuth;
  log('Config:');
  log(`  COUCHDB_INTERNAL_URL=${config.couchdbInternalUrl}`);
  log(`  COUCHDB_PUBLIC_URL=${config.couchdbPublicUrl}`);
  log(
    `  auth=${auth ? `user=${auth.username} password=set` : 'missing (defaults may apply)'}`
  );
}

/** Quick HTTP reachability check with AbortSignal (PouchDB has no useful timeout). */
async function probeCouchHttp(timeoutMs: number): Promise<void> {
  const url = config.couchdbInternalUrl;
  const headers: Record<string, string> = {Accept: 'application/json'};
  const auth = config.localCouchdbAuth;
  if (auth) {
    headers.Authorization =
      'Basic ' +
      Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString(
        'base64'
      );
  }

  log(`Probing ${url} (GET /, timeout ${timeoutMs}ms)...`);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const bodyPreview = (await response.text()).slice(0, 200);
    log(
      `Probe OK in ${Date.now() - started}ms: HTTP ${response.status}` +
        (bodyPreview ? ` body=${JSON.stringify(bodyPreview)}` : '')
    );
    if (!response.ok && response.status !== 401) {
      // 401 still proves we reached Couch; other errors are useful to surface.
      log(`Warning: unexpected HTTP status ${response.status}`);
    }
  } catch (error) {
    const elapsed = Date.now() - started;
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('aborted'))
    ) {
      throw new Error(
        `Timed out after ${elapsed}ms connecting to ${url}. ` +
          'Check COUCHDB_INTERNAL_URL, DNS, VPN/firewall, and that the ALB/Couch target is healthy.'
      );
    }
    throw new Error(
      `Failed to reach CouchDB at ${url} after ${elapsed}ms: ${formatError(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

const main = async () => {
  try {
    const {format, includeDisabled, skipPatterns, noSkip} = parseArgs(
      process.argv.slice(2)
    );

    logConfigSummary();
    log(
      `Options: format=${format}` +
        (includeDisabled ? ' includeDisabled' : '') +
        (noSkip
          ? ' no-skip'
          : skipPatterns !== undefined
            ? ` skip=${JSON.stringify(skipPatterns)}`
            : ' skip=default')
    );

    await probeCouchHttp(CONNECT_TIMEOUT_MS);

    log('Verifying required databases (people, projects, templates, auth)...');
    const verifyStarted = Date.now();
    const connection = await withTimeout(
      'verifyCouchDBConnection',
      CONNECT_TIMEOUT_MS * 2,
      verifyCouchDBConnection()
    );
    log(`verifyCouchDBConnection finished in ${Date.now() - verifyStarted}ms`);
    if (!connection.valid) {
      log('CouchDB validity check failed:');
      if (connection.server_msg) log(`  server: ${connection.server_msg}`);
      if (connection.validate_error) {
        log(`  validate: ${connection.validate_error}`);
      }
      for (const dbErr of connection.database_errors ?? []) {
        log(`  database: ${dbErr}`);
      }
      process.exit(1);
    }
    log('Required databases reachable.');

    log(`Fetching people docs (timeout ${FETCH_USERS_TIMEOUT_MS}ms)...`);
    const fetchStarted = Date.now();
    const allUsers = await withTimeout(
      'getUsers()',
      FETCH_USERS_TIMEOUT_MS,
      getUsers()
    );
    log(
      `Fetched ${allUsers.length} people docs in ${Date.now() - fetchStarted}ms`
    );

    const includeSkipped = noSkip || skipPatterns !== undefined;
    let rows = listUserEmails(allUsers, {
      includeArchived: includeDisabled,
      includeSkipped,
    });

    if (skipPatterns !== undefined && skipPatterns.length > 0) {
      const skipMatchers = compileSkipMatchers(skipPatterns);
      rows = rows.filter(row => !shouldSkipEmail(row.email, skipMatchers));
    }

    log(`users=${allUsers.length} emails=${rows.length} format=${format}`);

    if (format === 'lines') {
      for (const row of rows) {
        console.log(row.email);
      }
    } else if (format === 'bcc') {
      console.log(rows.map(r => r.email).join(', '));
    } else {
      console.log('name,email,user_id,disabled,verified');
      for (const row of rows) {
        console.log(
          [
            csvEscape(row.name),
            csvEscape(row.email),
            csvEscape(row.userId),
            row.disabled ? 'true' : 'false',
            row.verified ? 'true' : 'false',
          ].join(',')
        );
      }
    }

    log('Done.');
    process.exit(0);
  } catch (error) {
    log('Failed:');
    console.error(formatError(error));
    process.exit(1);
  }
};

main();
