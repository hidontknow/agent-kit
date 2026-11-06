'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseFrontmatter } = require('../lib/util');

test('front matter: block scalars with chomping indicators, nested maps, lists', () => {
  const { data, body } = parseFrontmatter([
    '---',
    'name: demo',
    'metadata:',
    '  version: "1.0.0"',
    '  category: Dev',
    'description: >-',
    '  folded line one',
    '  continues here.',
    '',
    '  new paragraph',
    'literal: |-',
    '  a',
    '  b',
    'tools: Read, Grep',
    'tags: [x, y]',
    'list:',
    '  - one',
    '  - two',
    '---',
    'body',
  ].join('\n'));
  assert.strictEqual(data.name, 'demo');
  assert.deepStrictEqual(data.metadata, { version: '1.0.0', category: 'Dev' });
  assert.strictEqual(data.description, 'folded line one continues here.\nnew paragraph');
  assert.strictEqual(data.literal, 'a\nb');
  assert.strictEqual(data.tools, 'Read, Grep');
  assert.deepStrictEqual(data.tags, ['x', 'y']);
  assert.deepStrictEqual(data.list, ['one', 'two']);
  assert.strictEqual(body, 'body');
});
