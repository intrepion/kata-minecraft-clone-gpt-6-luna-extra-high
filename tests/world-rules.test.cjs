const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/game.js', 'utf8');
const start = source.indexOf('function seededHash(');
const end = source.indexOf('function generateWorld(');
assert.ok(start >= 0 && end > start, 'Could not find the terrain and block rules');
const rules = vm.runInNewContext(`const THREE = { MathUtils: { lerp: (a, b, t) => a + (b - a) * t } }; const blockMap = new Map();\n${source.slice(start, end)}\n({ seededHash, terrainHeight, setBlock, getBlock, addTree })`);

test('terrain heights are deterministic integers and vary across the map', () => {
  const positions = Array.from({ length: 25 }, (_, i) => [i - 12, i * 3 - 20]);
  const heights = positions.map(([x, z]) => rules.terrainHeight(x, z));
  assert.deepEqual(positions.map(([x, z]) => rules.terrainHeight(x, z)), heights);
  assert.ok(heights.every(Number.isInteger));
  assert.ok(new Set(heights).size > 1);
  assert.ok(positions.every(([x, z]) => rules.seededHash(x, z) >= 0 && rules.seededHash(x, z) <= 1));
});

test('blocks use distinct coordinates and trees grow wood with leaves', () => {
  rules.setBlock(1, 2, 3, 'stone');
  assert.equal(rules.getBlock(1, 2, 3), 'stone');
  assert.equal(rules.getBlock(1, 3, 2), undefined);
  rules.addTree(10, 10, 3);
  assert.equal(rules.getBlock(10, 4, 10), 'wood');
  assert.equal(rules.getBlock(10, 7, 10), 'wood');
  assert.equal(rules.getBlock(10, 9, 10), 'leaves');
});
