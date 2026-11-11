// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

test('README.md opens with the Factory trial sentence', () => {
  const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const [firstLine, blankLine, heading] = readme.split(/\r?\n/);

  assert.equal(firstLine, 'Factory trial.');
  assert.equal(blankLine, '');
  assert.equal(heading, '# FAIMS3');
});
