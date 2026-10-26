'use strict';

const path = require('node:path');
const express = require('express');
const Busboy = require('busboy');
const { loadConfig } = require('./config');
const { CatalogStore } = require('./catalog');
const { GamePublisher } = require('./publisher');
const { pushCurrent, repositoryStatus } = require('./git');

function createApp(config, store, publisher) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', async (req, res) => {
    const repositories = Object.fromEntries(
      await Promise.all(
        Object.values(config.repositories).map(async (repository) => [
          repository.id,
          await repositoryStatus(repository),
        ]),
      ),
    );
    res.json({
      ok: true,
      service: 'game-list-publisher',
      main_repository: config.mainRepositoryId,
      repositories,
    });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      ok: true,
      main_repository: config.mainRepositoryId,
      repositories: Object.fromEntries(
        Object.entries(config.repositories).map(([id, repository]) => [
          id,
          {
            url: repository.githubUrl,
            remote: repository.remote,
            branch: repository.branch,
            content_root: repository.contentRoot,
            public_base_url: repository.publicBaseUrl,
            fallback_public_base_url: repository.fallbackPublicBaseUrl || null,
          },
        ]),
      ),
      limits: {
        rom_bytes: config.romBytes,
        cover_bytes: config.coverBytes,
        zip_max_entries: config.zipMaxEntries,
        zip_max_uncompressed_bytes: config.zipMaxUncompressedBytes,
      },
      game_types: Object.fromEntries(
        Object.entries(config.gameTypes).map(([type, value]) => {
          const repository = config.repositories[value.repository];
          return [
            type,
            {
              extensions: value.extensions,
              upload_enabled: value.uploadEnabled !== false,
              repository: value.repository,
              repository_url: repository.githubUrl,
            },
          ];
        }),
      ),
    });
  });

  app.get('/api/games', (req, res) => {
    const catalogs = store.allCatalogs();
    const games = catalogs.flatMap(({ type, catalog }) =>
      catalog.games.map((game) => ({
        ...game,
        game_type: type,
        local: {
          cover: store.localAssetUrl(type, game.cover_path),
          rom: store.localAssetUrl(type, game.rom_path),
        },
        public: store.publicGameUrls(type, game),
      })),
    );
    const catalogVersions = Object.fromEntries(
      catalogs.map(({ type, catalog }) => [type, catalog.updated_at || null]),
    );
    const catalogRepositories = Object.fromEntries(
      catalogs.map(({ type, repository }) => [
        type,
        {
          repository: repository.id,
          url: repository.githubUrl,
          public_base_url: repository.publicBaseUrl,
          fallback_public_base_url: repository.fallbackPublicBaseUrl || null,
        },
      ]),
    );
    res.json({
      ok: true,
      games,
      catalog_versions: catalogVersions,
      catalog_repositories: catalogRepositories,
    });
  });

  app.post('/api/games', async (req, res, next) => {
    try {
      const payload = await parseMultipart(req, Math.max(config.romBytes, config.coverBytes));
      const result = await publisher.saveGame(payload);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/games/:id', async (req, res, next) => {
    try {
      const result = await publisher.deleteGame(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sync', async (req, res, next) => {
    try {
      const repositoryId = String(req.query.repository || config.mainRepositoryId);
      const repository = config.repositories[repositoryId];
      if (!repository) {
        throw httpError(400, 'UNKNOWN_REPOSITORY', `仓库不存在: ${repositoryId}`);
      }
      const result = await pushCurrent(repository);
      res.json({ ok: true, repository: repositoryId, ...result });
    } catch (error) {
      next(error);
    }
  });

  for (const repository of Object.values(config.repositories)) {
    app.use(
      `/media/${repository.id}`,
      express.static(repository.contentRootPath),
    );
  }
  app.use(express.static(path.join(__dirname, '..', 'web')));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const statusCode = Number(error.statusCode || 500);
    const message =
      statusCode >= 500 && !error.pushFailed
        ? String(error.message || '服务器内部错误')
        : String(error.message || '请求失败');
    if (statusCode >= 500) console.error(error);
    res.status(statusCode).json({
      ok: false,
      code: error.code || (error.pushFailed ? 'PUSH_FAILED' : 'INTERNAL_ERROR'),
      error: message,
      commit: error.commit || null,
      repository: error.repository || null,
    });
  });

  return app;
}

function parseMultipart(req, maxFileBytes) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        defParamCharset: 'utf8',
        limits: {
          files: 2,
          fields: 8,
          fieldSize: 16 * 1024,
          fileSize: maxFileBytes + 1,
        },
      });
    } catch {
      reject(httpError(400, 'INVALID_MULTIPART', '请求必须使用 multipart/form-data'));
      return;
    }

    const fields = {};
    const files = {};
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, stream, info) => {
      if (name !== 'rom' && name !== 'cover') {
        stream.resume();
        return;
      }
      const chunks = [];
      let size = 0;
      let truncated = false;
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
      });
      stream.on('limit', () => {
        truncated = true;
      });
      stream.on('error', fail);
      stream.on('end', () => {
        files[name] = {
          filename: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks, size),
          truncated,
        };
      });
    });

    busboy.on('filesLimit', () => fail(httpError(400, 'TOO_MANY_FILES', '一次最多上传 ROM 和海报两个文件')));
    busboy.on('fieldsLimit', () => fail(httpError(400, 'TOO_MANY_FIELDS', '表单字段过多')));
    busboy.on('error', () => fail(httpError(400, 'INVALID_MULTIPART', '无法解析上传内容')));
    busboy.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve({ fields, files });
    });

    req.pipe(busboy);
  });
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function startServer() {
  const config = loadConfig();
  const store = new CatalogStore(config);
  store.ensureStructure();
  const publisher = new GamePublisher(config, store);
  const app = createApp(config, store, publisher);
  const server = app.listen(config.port, config.host, () => {
    console.log(`Game publisher: http://${config.host}:${config.port}`);
    console.log(
      `Main repository: ${config.mainRepositoryId} (${config.mainRepository.githubUrl || config.mainRepository.root})`,
    );
    for (const repository of Object.values(config.repositories)) {
      console.log(
        `  ${repository.id}: ${repository.githubUrl} [${repository.branch}]`,
      );
    }
  });
  return { app, server, config, store, publisher };
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, parseMultipart, startServer };
