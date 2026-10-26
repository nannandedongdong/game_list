'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_VERSION = 1;

class CatalogStore {
  constructor(config) {
    this.config = config;
    this.contentRoot = path.join(config.repositoryRoot, config.contentRoot);
    this.catalogRoot = path.join(this.contentRoot, 'catalog');
    this.coversRoot = path.join(this.contentRoot, 'covers');
    this.romsRoot = path.join(this.contentRoot, 'roms');
  }

  ensureStructure() {
    fs.mkdirSync(this.catalogRoot, { recursive: true });
    for (const type of Object.keys(this.config.gameTypes)) {
      fs.mkdirSync(path.join(this.coversRoot, type.toLowerCase()), {
        recursive: true,
      });
      fs.mkdirSync(path.join(this.romsRoot, type.toLowerCase()), {
        recursive: true,
      });
      const catalogPath = this.catalogPath(type);
      if (!fs.existsSync(catalogPath)) {
        this.writeCatalog(type, this.emptyCatalog(type));
      }
    }

    this.writeIndex();
  }

  emptyCatalog(type) {
    return {
      schema_version: SCHEMA_VERSION,
      game_type: type,
      updated_at: null,
      games: [],
    };
  }

  indexPath() {
    return path.join(this.catalogRoot, 'index.json');
  }

  writeIndex() {
    const catalogs = Object.keys(this.config.gameTypes).map((type) => ({
      type,
      catalog: this.readCatalog(type),
    }));
    const versions = Object.fromEntries(
      catalogs.map(({ type, catalog }) => [type, catalog.updated_at || null]),
    );
    const timestamps = Object.values(versions)
      .filter((value) => typeof value === 'string' && value)
      .sort();
    this.writeJsonAtomic(this.indexPath(), {
      schema_version: SCHEMA_VERSION,
      updated_at: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
      lists: Object.fromEntries(
        Object.entries(this.config.gameTypes).map(([type, item]) => [
          type,
          item.catalog,
        ]),
      ),
      list_versions: versions,
    });
  }

  nextTimestamp(previous) {
    const now = Date.now();
    const previousTime = Date.parse(previous || '');
    return new Date(
      Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now,
    ).toISOString();
  }

  catalogPath(type) {
    return path.join(this.catalogRoot, this.config.gameTypes[type].catalog);
  }

  readCatalog(type) {
    const catalogPath = this.catalogPath(type);
    let value;
    try {
      value = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    } catch (error) {
      throw new Error(`无法读取 ${type} 游戏列表: ${error.message}`);
    }
    if (!value || value.game_type !== type || !Array.isArray(value.games)) {
      throw new Error(`${type} 游戏列表格式不正确`);
    }
    return value;
  }

  writeCatalog(type, value) {
    this.writeJsonAtomic(this.catalogPath(type), {
      schema_version: SCHEMA_VERSION,
      game_type: type,
      updated_at: value.updated_at || null,
      games: value.games,
    });
  }

  allCatalogs() {
    return Object.keys(this.config.gameTypes).map((type) => ({
      type,
      catalog: this.readCatalog(type),
    }));
  }

  allGames() {
    return this.allCatalogs().flatMap(({ type, catalog }) =>
      catalog.games.map((game) => ({ ...game, game_type: type })),
    );
  }

  findGame(id) {
    for (const type of Object.keys(this.config.gameTypes)) {
      const catalog = this.readCatalog(type);
      const index = catalog.games.findIndex((game) => game.id === id);
      if (index !== -1) {
        return { type, catalog, game: catalog.games[index], index };
      }
    }
    return null;
  }

  findDuplicateHash(sha256, ignoredId = null) {
    return this.allGames().find(
      (game) => game.sha256 === sha256 && game.id !== ignoredId,
    );
  }

  gameDirectory(type, kind, id) {
    const root = kind === 'cover' ? this.coversRoot : this.romsRoot;
    return path.join(root, type.toLowerCase(), id);
  }

  coverFile(type, id, extension) {
    return path.join(this.gameDirectory(type, 'cover', id), `cover${extension}`);
  }

  romFile(type, id, extension, preferredName = null) {
    return path.join(
      this.gameDirectory(type, 'rom', id),
      preferredName || `game${extension}`,
    );
  }

  gamePathFromCatalogPath(value) {
    if (!value) return null;
    const resolved = path.resolve(this.catalogRoot, value);
    if (!resolved.startsWith(`${this.contentRoot}${path.sep}`)) {
      throw new Error('游戏资源路径超出 public 目录');
    }
    return resolved;
  }

  catalogRelativeCoverPath(type, id, extension) {
    if (!extension) return null;
    return path.posix.join(
      '..',
      'covers',
      type.toLowerCase(),
      id,
      `cover${extension}`,
    );
  }

  catalogRelativeRomPath(type, id, extension, preferredName = null) {
    return path.posix.join(
      '..',
      'roms',
      type.toLowerCase(),
      id,
      preferredName || `game${extension}`,
    );
  }

  publicCatalogUrl(type) {
    return `${this.config.publicBaseUrl}/catalog/${this.config.gameTypes[type].catalog}`;
  }

  localAssetUrl(relativePath) {
    if (!relativePath) return null;
    const normalized = path.posix
      .normalize(`/${relativePath}`)
      .replace(/^\/+/, '');
    return `/media/${normalized}`;
  }

  publicAssetUrl(relativePath) {
    if (!relativePath) return null;
    const normalized = path.posix
      .normalize(`/${relativePath}`)
      .replace(/^\/+/, '');
    return `${this.config.publicBaseUrl}/${normalized}`;
  }

  publicGameUrls(type, game) {
    return {
      catalog: this.publicCatalogUrl(type),
      cover: this.publicAssetUrl(game.cover_path),
      rom: this.publicAssetUrl(game.rom_path),
    };
  }

  writeJsonAtomic(targetPath, value) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.${process.pid}.${crypto
      .randomBytes(4)
      .toString('hex')}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporaryPath, targetPath);
  }
}

module.exports = { CatalogStore, SCHEMA_VERSION };
