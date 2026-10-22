'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../../..');
const repositoryRoot = path.resolve(
  process.env.GAME_PUBLISHER_REPO_ROOT || projectRoot,
);
const configPath = path.resolve(
  process.env.GAME_PUBLISHER_CONFIG ||
    path.join(repositoryRoot, 'publisher.config.json'),
);

function fail(message) {
  throw new Error(`配置错误: ${message}`);
}

function loadConfig() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取配置文件 ${configPath}: ${error.message}`);
  }

  const server = parsed.server || {};
  const repository = parsed.repository || {};
  const limits = parsed.limits || {};
  const gameTypes = parsed.gameTypes || {};

  const host = String(server.host || '127.0.0.1');
  const port = Number(server.port || 4173);
  const remote = String(repository.remote || 'origin');
  const branch = String(repository.branch || 'main');
  const contentRoot = String(repository.contentRoot || 'public');
  const publicBaseUrl = String(parsed.publicBaseUrl || '').replace(/\/+$/, '');
  const fallbackPublicBaseUrl = String(parsed.fallbackPublicBaseUrl || '').replace(
    /\/+$/,
    '',
  );
  const romBytes = Number(limits.romBytes || 10 * 1024 * 1024);
  const coverBytes = Number(limits.coverBytes || 2 * 1024 * 1024);
  const zipMaxEntries = Number(limits.zipMaxEntries || 2048);
  const zipMaxUncompressedBytes = Number(
    limits.zipMaxUncompressedBytes || 128 * 1024 * 1024,
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('server.port 必须是 1-65535 的整数');
  }
  if (!publicBaseUrl.startsWith('https://')) {
    fail('publicBaseUrl 必须是 HTTPS 地址');
  }
  if (fallbackPublicBaseUrl && !fallbackPublicBaseUrl.startsWith('https://')) {
    fail('fallbackPublicBaseUrl 必须是 HTTPS 地址');
  }
  if (!Number.isSafeInteger(romBytes) || romBytes < 1) {
    fail('limits.romBytes 必须是正整数');
  }
  if (!Number.isSafeInteger(coverBytes) || coverBytes < 1) {
    fail('limits.coverBytes 必须是正整数');
  }
  if (!Number.isSafeInteger(zipMaxEntries) || zipMaxEntries < 1) {
    fail('limits.zipMaxEntries 必须是正整数');
  }
  if (
    !Number.isSafeInteger(zipMaxUncompressedBytes) ||
    zipMaxUncompressedBytes < 1
  ) {
    fail('limits.zipMaxUncompressedBytes 必须是正整数');
  }
  if (Object.keys(gameTypes).length === 0) {
    fail('gameTypes 不能为空');
  }

  const normalizedTypes = {};
  for (const [rawType, rawValue] of Object.entries(gameTypes)) {
    const type = rawType.toUpperCase();
    const catalog = String(rawValue.catalog || '').trim();
    const extensions = (rawValue.extensions || []).map((value) =>
      String(value).toLowerCase(),
    );

    if (!/^[A-Z0-9]+$/.test(type)) {
      fail(`游戏类型 ${rawType} 只能包含字母和数字`);
    }
    if (!/^[a-z0-9-]+\.json$/.test(catalog)) {
      fail(`${type}.catalog 必须是小写 JSON 文件名`);
    }
    if (extensions.length === 0 || extensions.some((ext) => !/^\.[a-z0-9]+$/.test(ext))) {
      fail(`${type}.extensions 配置无效`);
    }
    normalizedTypes[type] = { catalog, extensions: [...new Set(extensions)] };
  }

  return {
    configPath,
    repositoryRoot,
    host,
    port,
    remote,
    branch,
    contentRoot,
    githubUrl: String(repository.githubUrl || ''),
    publicBaseUrl,
    fallbackPublicBaseUrl,
    romBytes,
    coverBytes,
    zipMaxEntries,
    zipMaxUncompressedBytes,
    gameTypes: normalizedTypes,
  };
}

module.exports = { loadConfig };
