'use strict';

const { execFile } = require('node:child_process');

function runGit(config, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: config.repositoryRoot,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = String(stdout || '').trim();
          error.stderr = String(stderr || '').trim();
          reject(error);
          return;
        }
        resolve(String(stdout || '').trim());
      },
    );
  });
}

async function commandStatus(config, args) {
  try {
    await runGit(config, args);
    return 0;
  } catch (error) {
    if (error.code === 1) return 1;
    throw error;
  }
}

function gitError(prefix, error) {
  const detail = error.stderr || error.stdout || error.message;
  return new Error(`${prefix}: ${detail}`);
}

async function prepareRepository(config, relativePaths = []) {
  const branch = await runGit(config, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== config.branch) {
    throw new Error(
      `当前分支是 ${branch}，发布要求使用 ${config.branch}。请先切换分支。`,
    );
  }

  if ((await commandStatus(config, ['diff', '--cached', '--quiet'])) !== 0) {
    throw new Error('仓库已有暂存改动。为避免误提交，请先提交或取消暂存。');
  }

  try {
    await runGit(config, ['fetch', '--prune', config.remote, config.branch]);
  } catch (error) {
    throw gitError('无法获取远端最新提交', error);
  }

  const counts = await runGit(config, [
    'rev-list',
    '--left-right',
    '--count',
    `HEAD...${config.remote}/${config.branch}`,
  ]);
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  if (behind > 0) {
    try {
      await runGit(config, [
        'pull',
        '--rebase',
        '--autostash',
        config.remote,
        config.branch,
      ]);
    } catch (error) {
      throw gitError('远端已有新提交，自动同步失败', error);
    }
  }

  if ((await commandStatus(config, ['diff', '--cached', '--quiet'])) !== 0) {
    throw new Error('同步远端后出现暂存改动，已停止发布。');
  }

  if (relativePaths.length > 0) {
    const status = await runGit(config, [
      'status',
      '--porcelain',
      '--',
      ...relativePaths,
    ]);
    if (status) {
      throw new Error(
        `以下发布文件已有未提交改动，请先处理后再上传:\n${status}`,
      );
    }
  }

  return { ahead, behind };
}

async function commitAndPush(config, relativePaths, message) {
  if (relativePaths.length === 0) throw new Error('没有要提交的文件');

  try {
    await runGit(config, ['add', '-A', '--', ...relativePaths]);
  } catch (error) {
    throw gitError('暂存文件失败', error);
  }

  if ((await commandStatus(config, ['diff', '--cached', '--quiet'])) === 0) {
    throw new Error('文件没有发生变化，未创建提交。');
  }

  try {
    await runGit(config, ['commit', '-m', message]);
  } catch (error) {
    throw gitError('创建 Git 提交失败', error);
  }

  const commit = await runGit(config, ['rev-parse', '--short', 'HEAD']);

  try {
    await runGit(config, [
      'push',
      config.remote,
      `HEAD:${config.branch}`,
    ]);
  } catch (error) {
    const pushError = gitError('本地提交已创建，但推送到 GitHub 失败', error);
    pushError.commit = commit;
    pushError.pushFailed = true;
    throw pushError;
  }

  return { commit, pushed: true };
}

async function pushCurrent(config) {
  const branch = await runGit(config, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== config.branch) {
    throw new Error(
      `当前分支是 ${branch}，发布要求使用 ${config.branch}。请先切换分支。`,
    );
  }
  try {
    await runGit(config, [
      'push',
      config.remote,
      `HEAD:${config.branch}`,
    ]);
    return { pushed: true };
  } catch (error) {
    throw gitError('推送失败', error);
  }
}

async function repositoryStatus(config) {
  const branch = await runGit(config, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = await runGit(config, ['rev-parse', '--short', 'HEAD']);
  let ahead = 0;
  let behind = 0;
  try {
    const counts = await runGit(config, [
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${config.remote}/${config.branch}`,
    ]);
    [ahead, behind] = counts.split(/\s+/).map(Number);
  } catch {
    // Local status still works if the remote branch has not been fetched yet.
  }
  return { branch, commit, ahead, behind };
}

module.exports = {
  commitAndPush,
  prepareRepository,
  pushCurrent,
  repositoryStatus,
  runGit,
};
