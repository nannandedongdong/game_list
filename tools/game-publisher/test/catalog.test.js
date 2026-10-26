'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CatalogStore } = require('../src/catalog');

function makeStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-store-'));
  const config = {
    repositoryRoot: root,
    contentRoot: 'public',
    publicBaseUrl: 'https://example.com/public',
    gameTypes: {
      GBA: { catalog: 'gba.json', extensions: ['.gba'] },
      MD: { catalog: 'md.json', extensions: ['.md'] },
    },
  };
  return new CatalogStore(config);
}

test('creates one catalog file per type and an index', () => {
  const store = makeStore();
  store.ensureStructure();
  assert.equal(store.readCatalog('GBA').game_type, 'GBA');
  assert.equal(store.readCatalog('MD').games.length, 0);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(store.catalogRoot, 'index.json'), 'utf8')),
    {
      schema_version: 1,
      updated_at: null,
      lists: { GBA: 'gba.json', MD: 'md.json' },
      list_versions: { GBA: null, MD: null },
    },
  );
});

test('resolves relative asset paths against the catalog directory', () => {
  const store = makeStore();
  assert.equal(
    store.publicAssetUrl('../roms/gba/id/game.gba'),
    'https://example.com/public/roms/gba/id/game.gba',
  );
  assert.equal(
    store.publicAssetUrl('../covers/gba/id/cover.webp'),
    'https://example.com/public/covers/gba/id/cover.webp',
  );
});

test('index records each catalog updated_at as its version', () => {
  const store = makeStore();
  store.ensureStructure();
  store.writeCatalog('GBA', {
    updated_at: '2026-10-26T01:02:03.456Z',
    games: [],
  });
  store.writeCatalog('MD', {
    updated_at: '2026-10-26T04:05:06.789Z',
    games: [],
  });
  store.writeIndex();

  assert.deepEqual(
    JSON.parse(fs.readFileSync(store.indexPath(), 'utf8')),
    {
      schema_version: 1,
      updated_at: '2026-10-26T04:05:06.789Z',
      lists: { GBA: 'gba.json', MD: 'md.json' },
      list_versions: {
        GBA: '2026-10-26T01:02:03.456Z',
        MD: '2026-10-26T04:05:06.789Z',
      },
    },
  );
});

test('nextTimestamp is millisecond precision and strictly increases', () => {
  const store = makeStore();
  const previous = new Date().toISOString();
  const next = store.nextTimestamp(previous);
  assert.match(next, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Date.parse(next) > Date.parse(previous));
});
