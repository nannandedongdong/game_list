'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectCoverExtension,
  makeGameId,
  normalizeType,
  sha256,
  validateGameId,
  validateRom,
} = require('../src/files');

const gameTypes = {
  GBA: { catalog: 'gba.json', extensions: ['.gba', '.zip'] },
  CPS1: { catalog: 'cps1.json', extensions: ['.zip'] },
};

test('normalizes supported game types', () => {
  assert.equal(normalizeType('gba', gameTypes), 'GBA');
  assert.throws(() => normalizeType('SNES', gameTypes), /不支持/);
});

test('validates ROM extension and preserves buffer', () => {
  const buffer = Buffer.from('rom');
  const result = validateRom(
    { filename: 'game.gba', buffer, truncated: false },
    'GBA',
    gameTypes,
    100,
  );
  assert.equal(result.extension, '.gba');
  assert.equal(result.buffer, buffer);
});

test('accepts a valid ZIP package for GBA', () => {
  const result = validateRom(
    {
      filename: 'game.zip',
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
      truncated: false,
    },
    'GBA',
    gameTypes,
    100,
  );
  assert.equal(result.extension, '.zip');
});

test('rejects an invalid ZIP package', () => {
  assert.throws(
    () =>
      validateRom(
        { filename: 'game.zip', buffer: Buffer.from('not-zip'), truncated: false },
        'GBA',
        gameTypes,
        100,
      ),
    /ZIP 游戏包格式无效/,
  );
});

test('rejects oversized and mismatched ROMs', () => {
  assert.throws(
    () =>
      validateRom(
        { filename: 'game.gba', buffer: Buffer.alloc(11), truncated: false },
        'GBA',
        gameTypes,
        10,
      ),
    /大小限制/,
  );
  assert.throws(
    () =>
      validateRom(
        { filename: 'game.gba', buffer: Buffer.from('rom'), truncated: false },
        'CPS1',
        gameTypes,
        100,
      ),
    /扩展名/,
  );
});

test('detects supported cover signatures', () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  assert.equal(detectCoverExtension({ buffer: png, truncated: false }, 100), '.png');
  assert.throws(
    () => detectCoverExtension({ buffer: Buffer.from('not-image'), truncated: false }, 100),
    /JPG/,
  );
});

test('creates parseable game IDs and stable SHA-256 values', () => {
  const id = makeGameId('GBA', new Date(2026, 9, 22));
  assert.match(id, /^gba-20261022-[a-f0-9]{8}$/);
  assert.equal(validateGameId(id), true);
  assert.equal(
    sha256(Buffer.from('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
