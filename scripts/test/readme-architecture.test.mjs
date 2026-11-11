// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const README_PATH = path.join(ROOT, 'README.md');

/** Labels the architecture diagram must draw as their own nodes. */
const REQUIRED_LABELS = [
  'Field app',
  'Control Centre',
  'Designer',
  'Conductor API',
  'CouchDB',
  'RustFS',
  'Spatial worker',
];

/**
 * Undirected links the diagram must keep. Each pair is matched against node
 * label text, so a rename of a node id does not hide a missing relationship.
 */
const REQUIRED_LINKS = [
  ['Field app', 'Conductor API'],
  ['Field app', 'CouchDB'],
  ['Control Centre', 'Conductor API'],
  ['Conductor API', 'CouchDB'],
  ['Conductor API', 'RustFS'],
  ['Spatial worker', 'CouchDB'],
  ['Spatial worker', 'RustFS'],
];

const MAX_NODES = 8;
const MAX_EDGES = 10;

const NODE_SHAPE =
  '([A-Za-z][\\w-]*)\\s*(?:\\[\\((?:"((?:\\\\.|[^"\\\\])*)"|([^)\\]]*))\\)\\]|\\[(?:"((?:\\\\.|[^"\\\\])*)"|([^\\]]*))\\]|\\((?:"((?:\\\\.|[^"\\\\])*)"|([^)]*))\\))';

const EDGE =
  '([A-Za-z][\\w-]*)\\s*(?:-->|-.->|<-->|==>|---)\\s*(?:\\|([^|]*)\\|\\s*)?([A-Za-z][\\w-]*)';

/**
 * @param {string} markdown
 * @returns {{start: number, end: number, text: string} | null}
 */
function architectureSection(markdown) {
  const heading = '\n## Architecture\n';
  const start = markdown.indexOf(heading);
  if (start < 0) {
    return null;
  }
  const bodyStart = start + heading.length;
  const next = markdown.slice(bodyStart).search(/\n## /);
  const end = next < 0 ? markdown.length : bodyStart + next;
  return {start, end, text: markdown.slice(start, end)};
}

/**
 * @param {string} markdown
 * @returns {{start: number, source: string}[]}
 */
function mermaidBlocks(markdown) {
  const blocks = [];
  const pattern = /^```mermaid\n([\s\S]*?)^```/gm;
  for (const match of markdown.matchAll(pattern)) {
    blocks.push({
      start: match.index ?? 0,
      source: match[1].replace(/\s+$/, ''),
    });
  }
  return blocks;
}

/**
 * Parse the small flowchart subset used by the top-level architecture diagram.
 * @param {string} source
 * @returns {{nodes: Map<string, string>, edges: {from: string, to: string}[]}}
 */
export function parseArchitectureFlowchart(source) {
  const lines = source
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('%%'));
  if (lines.length === 0) {
    throw new Error('diagram is empty');
  }
  if (!/^flowchart\s+(?:TB|TD|LR|RL)\s*$/.test(lines[0])) {
    throw new Error(`diagram must be a flowchart, found "${lines[0]}"`);
  }

  const nodes = new Map();
  const edges = [];
  const edgePattern = new RegExp(`^${EDGE}\\s*$`);

  for (const line of lines.slice(1)) {
    if (/^subgraph\b/.test(line) || line === 'end') {
      continue;
    }

    const nodePattern = new RegExp(NODE_SHAPE, 'g');
    const declared = [];
    for (const match of line.matchAll(nodePattern)) {
      const id = match[1];
      const label = [
        match[2],
        match[3],
        match[4],
        match[5],
        match[6],
        match[7],
      ].find(value => value !== undefined);
      if (!label || label.trim() === '') {
        throw new Error(`node ${id} has an empty label`);
      }
      if (nodes.has(id)) {
        throw new Error(`node ${id} is declared more than once`);
      }
      nodes.set(id, label.replace(/\\n/g, '\n').trim());
      declared.push(id);
    }

    const stripped = line.replace(new RegExp(NODE_SHAPE, 'g'), '$1').trim();
    if (
      declared.length > 0 &&
      stripped === declared[0] &&
      declared.length === 1
    ) {
      continue;
    }

    const edge = edgePattern.exec(stripped);
    if (!edge) {
      throw new Error(`unrecognised diagram line "${line}"`);
    }
    const from = edge[1];
    const to = edge[3];
    if (!nodes.has(from) || !nodes.has(to)) {
      throw new Error(`edge ${from} -> ${to} uses a node with no label`);
    }
    edges.push({from, to});
  }

  return {nodes, edges};
}

/**
 * Review the top-level README architecture section.
 * @param {string} markdown
 * @returns {string[]} Human-readable problems. Empty when the diagram passes.
 */
export function reviewArchitectureReadme(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const errors = [];
  const section = architectureSection(text);
  const directory = text.indexOf('\n## Directory Structure\n');

  if (!section) {
    errors.push('README is missing an "## Architecture" section');
  } else if (directory < 0) {
    errors.push('README is missing "## Directory Structure"');
  } else if (section.start > directory) {
    errors.push('"## Architecture" must stay above "## Directory Structure"');
  }

  const blocks = mermaidBlocks(text);
  if (blocks.length !== 1) {
    errors.push(
      `README must contain one mermaid diagram, found ${blocks.length}`
    );
  }

  const block = blocks[0];
  if (
    section &&
    block &&
    (block.start < section.start || block.start > section.end)
  ) {
    errors.push('the mermaid diagram must sit inside "## Architecture"');
  }

  if (section) {
    for (const library of [
      'library/data-model',
      'library/forms',
      'library/build-config',
    ]) {
      if (!section.text.includes(library)) {
        errors.push(`architecture section must mention ${library}`);
      }
    }
    if (!/offline/i.test(section.text)) {
      errors.push('architecture section must describe offline collection');
    }
    if (!/downloads[\s\S]{0,80}RustFS/.test(section.text)) {
      errors.push(
        'architecture section must say the field app downloads layers from RustFS'
      );
    }
  }

  if (!block) {
    return errors;
  }

  let diagram;
  try {
    diagram = parseArchitectureFlowchart(block.source);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return errors;
  }

  if (diagram.nodes.size > MAX_NODES) {
    errors.push(
      `diagram has ${diagram.nodes.size} nodes; keep it to ${MAX_NODES} so it stays readable`
    );
  }
  if (diagram.edges.length > MAX_EDGES) {
    errors.push(
      `diagram has ${diagram.edges.length} edges; keep it to ${MAX_EDGES} so it stays readable`
    );
  }

  const labels = [...diagram.nodes.values()];
  for (const required of REQUIRED_LABELS) {
    const matches = labels.filter(label => label.includes(required));
    if (matches.length !== 1) {
      errors.push(
        `diagram must show "${required}" on exactly one node, found ${matches.length}`
      );
    }
  }

  const linked = (left, right) =>
    diagram.edges.some(edge => {
      const from = diagram.nodes.get(edge.from) ?? '';
      const to = diagram.nodes.get(edge.to) ?? '';
      return (
        (from.includes(left) && to.includes(right)) ||
        (from.includes(right) && to.includes(left))
      );
    });

  for (const [left, right] of REQUIRED_LINKS) {
    if (!linked(left, right)) {
      errors.push(`diagram must link "${left}" and "${right}"`);
    }
  }

  return errors;
}

/**
 * @param {string} markdown
 * @param {string} replacement
 * @returns {string}
 */
function replaceDiagramLine(markdown, replacement) {
  return markdown.replace('  Worker -->|write PMTiles| Files\n', replacement);
}

test('the README architecture diagram names the key components and links', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  assert.deepEqual(reviewArchitectureReadme(readme), []);
});

test('a missing component fails the review', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const broken = readme.replace('[("RustFS")]', '[("Object store")]');
  const errors = reviewArchitectureReadme(broken);
  assert.ok(
    errors.some(error => error.includes('RustFS')),
    errors.join('\n')
  );
});

test('a missing link between the spatial worker and RustFS fails the review', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const broken = replaceDiagramLine(readme, '');
  const errors = reviewArchitectureReadme(broken);
  assert.ok(
    errors.some(
      error => error.includes('Spatial worker') && error.includes('RustFS')
    ),
    errors.join('\n')
  );
});

test('an edge to an undeclared node fails the review', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const broken = replaceDiagramLine(
    readme,
    '  Worker -->|write PMTiles| Nowhere\n'
  );
  const errors = reviewArchitectureReadme(broken);
  assert.ok(
    errors.some(error => error.includes('Nowhere')),
    errors.join('\n')
  );
});

test('the diagram has to stay in the architecture section above the directory list', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const section = architectureSection(readme.replace(/\r\n/g, '\n'));
  assert.ok(section);
  const without = readme.replace(section.text, '');
  const moved = `${without.trimEnd()}\n\n${section.text.trim()}\n`;
  const errors = reviewArchitectureReadme(moved);
  assert.ok(
    errors.some(error => error.includes('Directory Structure')),
    errors.join('\n')
  );
});

test('the section must keep the direct download from RustFS', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const broken = readme.replace(
    'downloads those layers directly from RustFS',
    'reads layers through the Conductor'
  );
  const errors = reviewArchitectureReadme(broken);
  assert.ok(
    errors.some(error => error.includes('downloads')),
    errors.join('\n')
  );
});

test('extra services fail the review so the diagram stays a sketch', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const broken = readme.replace(
    '  Worker["Spatial worker"]\n',
    `  Worker["Spatial worker"]
  One["Extra one"]
  Two["Extra two"]
  Three["Extra three"]
`
  );
  const errors = reviewArchitectureReadme(broken);
  assert.ok(
    errors.some(error => error.includes('nodes')),
    errors.join('\n')
  );
});
