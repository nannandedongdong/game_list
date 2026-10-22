'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  cleanDisplayName,
  detectCoverExtension,
  makeGameId,
  normalizeType,
  sha256,
  validateGameId,
  validateRom,
} = require('./files');
const { commitAndPush, prepareRepository } = require('./git');

class GamePublisher {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.operation = Promise.resolve();
  }

  async saveGame({ fields, files }) {
    return this.serialized(() => this.saveGameInternal({ fields, files }));
  }

  async deleteGame(id) {
    return this.serialized(() => this.deleteGameInternal(id));
  }

  serialized(task) {
    const current = this.operation.then(task, task);
    this.operation = current.catch(() => undefined);
    return current;
  }

  async saveGameInternal({ fields, files }) {
    const requestedId = String(fields.id || '').trim();
    const isUpdate = Boolean(requestedId);
    let type;
    let existing;

    if (isUpdate) {
      if (!validateGameId(requestedId)) {
        throw httpError(400, 'INVALID_GAME_ID', '游戏 ID 格式不正确');
      }
      existing = this.store.findGame(requestedId);
      if (!existing) {
        throw httpError(404, 'GAME_NOT_FOUND', '要更新的游戏不存在');
      }
      type = existing.type;
      const requestedType = String(fields.game_type || type)
        .trim()
        .toUpperCase();
      if (requestedType !== type) {
        throw httpError(
          400,
          'TYPE_CHANGE_NOT_ALLOWED',
          '已有游戏不能修改类型，请删除后重新上传',
        );
      }
    } else {
      type = normalizeType(fields.game_type, this.config.gameTypes);
    }

    const name = cleanDisplayName(fields.name);
    const rom = validateRom(
      files.rom,
      type,
      this.config.gameTypes,
      this.config.romBytes,
    );
    const coverExtension = detectCoverExtension(
      files.cover,
      this.config.coverBytes,
    );

    const catalogPath = this.store.catalogPath(type);
    const relativeCatalogPath = this.toRelative(catalogPath);
    const initialPaths = [relativeCatalogPath];
    if (isUpdate) {
      initialPaths.push(
        this.toRelative(this.store.gameDirectory(type, 'rom', requestedId)),
      );
      if (coverExtension) {
        initialPaths.push(
          this.toRelative(this.store.gameDirectory(type, 'cover', requestedId)),
        );
      }
    }
    await prepareRepository(this.config, initialPaths);

    if (isUpdate) {
      existing = this.store.findGame(requestedId);
      if (!existing) {
        throw httpError(
          409,
          'GAME_NOT_FOUND_AFTER_SYNC',
          '同步远端后目标游戏已不存在，请刷新页面',
        );
      }
      type = existing.type;
    }

    const id = isUpdate ? requestedId : this.uniqueGameId(type);
    const romDigest = sha256(rom.buffer);
    const duplicate = this.store.findDuplicateHash(romDigest, id);
    if (duplicate) {
      throw httpError(
        409,
        'DUPLICATE_ROM',
        `相同 ROM 已存在于 ${duplicate.game_type} / ${duplicate.name}`,
      );
    }

    const now = new Date().toISOString();
    const catalog = this.store.readCatalog(type);
    const romDirectory = this.store.gameDirectory(type, 'rom', id);
    const coverDirectory = this.store.gameDirectory(type, 'cover', id);
    const romPath = this.store.romFile(type, id, rom.extension);
    const coverPath = coverExtension
      ? this.store.coverFile(type, id, coverExtension)
      : null;

    let game;
    let currentIndex = -1;
    if (isUpdate) {
      currentIndex = catalog.games.findIndex((item) => item.id === id);
      if (currentIndex === -1) {
        throw httpError(404, 'GAME_NOT_FOUND', '要更新的游戏不存在');
      }
      const previous = catalog.games[currentIndex];
      game = {
        id,
        name,
        cover_path: coverExtension
          ? this.store.catalogRelativeCoverPath(type, id, coverExtension)
          : previous.cover_path || null,
        rom_path: this.store.catalogRelativeRomPath(type, id, rom.extension),
        file_name: safeFileName(files.rom.filename),
        file_size: rom.buffer.length,
        sha256: romDigest,
        revision: Number(previous.revision || 0) + 1,
        updated_at: now,
      };
    } else {
      game = {
        id,
        name,
        cover_path: coverExtension
          ? this.store.catalogRelativeCoverPath(type, id, coverExtension)
          : null,
        rom_path: this.store.catalogRelativeRomPath(type, id, rom.extension),
        file_name: safeFileName(files.rom.filename),
        file_size: rom.buffer.length,
        sha256: romDigest,
        revision: 1,
        updated_at: now,
      };
    }

    const affectedAbsolutePaths = [catalogPath, romDirectory];
    if (coverExtension || isUpdate) affectedAbsolutePaths.push(coverDirectory);
    const transaction = this.createTransaction(affectedAbsolutePaths);
    let committed = false;

    try {
      fs.mkdirSync(romDirectory, { recursive: true });
      fs.rmSync(romDirectory, { recursive: true, force: true });
      fs.mkdirSync(romDirectory, { recursive: true });
      fs.writeFileSync(romPath, rom.buffer);

      if (coverExtension) {
        fs.rmSync(coverDirectory, { recursive: true, force: true });
        fs.mkdirSync(coverDirectory, { recursive: true });
        fs.writeFileSync(coverPath, files.cover.buffer);
      }

      if (isUpdate) {
        catalog.games[currentIndex] = game;
      } else {
        catalog.games.unshift(game);
      }
      catalog.updated_at = now;
      this.store.writeCatalog(type, catalog);

      const commitPaths = [
        relativeCatalogPath,
        this.toRelative(romDirectory),
      ];
      if (coverExtension) commitPaths.push(this.toRelative(coverDirectory));

      const action = isUpdate ? 'update' : 'add';
      const commitResult = await commitAndPush(
        this.config,
        commitPaths,
        `game: ${action} ${type} ${name}`,
      );
      committed = true;
      transaction.cleanup();
      return {
        ok: true,
        game: { ...game, game_type: type },
        commit: commitResult.commit,
        pushed: true,
        public: this.store.publicGameUrls(type, game),
      };
    } catch (error) {
      if (!committed && !error.pushFailed) transaction.rollback();
      if (error.pushFailed) transaction.cleanup();
      throw error;
    }
  }

  async deleteGameInternal(id) {
    if (!validateGameId(id)) {
      throw httpError(400, 'INVALID_GAME_ID', '游戏 ID 格式不正确');
    }
    const initial = this.store.findGame(id);
    if (!initial) {
      throw httpError(404, 'GAME_NOT_FOUND', '游戏不存在');
    }

    const type = initial.type;
    const catalogPath = this.store.catalogPath(type);
    const romDirectory = this.store.gameDirectory(type, 'rom', id);
    const coverDirectory = this.store.gameDirectory(type, 'cover', id);
    await prepareRepository(this.config, [
      this.toRelative(catalogPath),
      this.toRelative(romDirectory),
      this.toRelative(coverDirectory),
    ]);

    const current = this.store.findGame(id);
    if (!current) {
      throw httpError(409, 'GAME_NOT_FOUND_AFTER_SYNC', '同步远端后游戏已不存在');
    }

    const transaction = this.createTransaction([
      catalogPath,
      romDirectory,
      coverDirectory,
    ]);
    let committed = false;

    try {
      const catalog = current.catalog;
      catalog.games.splice(current.index, 1);
      catalog.updated_at = new Date().toISOString();
      this.store.writeCatalog(type, catalog);
      fs.rmSync(romDirectory, { recursive: true, force: true });
      fs.rmSync(coverDirectory, { recursive: true, force: true });

      const commitResult = await commitAndPush(
        this.config,
        [
          this.toRelative(catalogPath),
          this.toRelative(romDirectory),
          this.toRelative(coverDirectory),
        ],
        `game: delete ${type} ${current.game.name}`,
      );
      committed = true;
      transaction.cleanup();
      return {
        ok: true,
        deleted: current.game,
        commit: commitResult.commit,
        pushed: true,
      };
    } catch (error) {
      if (!committed && !error.pushFailed) transaction.rollback();
      if (error.pushFailed) transaction.cleanup();
      throw error;
    }
  }

  uniqueGameId(type) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = makeGameId(type);
      if (!this.store.findGame(id)) return id;
    }
    throw new Error('无法生成唯一游戏 ID');
  }

  toRelative(absolutePath) {
    return path.relative(this.config.repositoryRoot, absolutePath);
  }

  createTransaction(paths) {
    const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'game-publisher-'));
    const records = [];

    try {
      paths.forEach((targetPath, index) => {
        const backupPath = path.join(backupRoot, String(index));
        const existed = fs.existsSync(targetPath);
        if (existed) {
          fs.cpSync(targetPath, backupPath, { recursive: true });
        }
        records.push({ targetPath, backupPath, existed });
      });
    } catch (error) {
      fs.rmSync(backupRoot, { recursive: true, force: true });
      throw new Error(`无法创建发布回滚快照: ${error.message}`);
    }

    return {
      rollback: () => {
        for (const record of [...records].reverse()) {
          fs.rmSync(record.targetPath, { recursive: true, force: true });
          if (record.existed) {
            fs.cpSync(record.backupPath, record.targetPath, { recursive: true });
          }
        }
        fs.rmSync(backupRoot, { recursive: true, force: true });
      },
      cleanup: () => {
        fs.rmSync(backupRoot, { recursive: true, force: true });
      },
    };
  }
}

function safeFileName(value) {
  const name = path.basename(String(value || '').replace(/\\/g, '/')).trim();
  return name || 'game';
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

module.exports = { GamePublisher };
