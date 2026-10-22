# 本地游戏发布后台

本地网页后台负责把 ROM、可选海报以及对应类型 JSON 一次性提交到 GitHub。每次新增、更新或删除只创建一个 Git commit，并立即 push。

## 1. 仓库与公开目录

- GitHub 仓库：`https://github.com/nannandedongdong/game_list`
- 分支：`main`
- 公开目录：`public/`
- Git remote：`origin`

目录结构：

```text
public/
├── catalog/
│   ├── index.json
│   ├── gba.json
│   ├── md.json
│   ├── cps1.json
│   └── fc.json
├── covers/<类型>/<game-id>/cover.<jpg|png|webp>
└── roms/<类型>/<game-id>/game.<扩展名>
```

## 2. 环境要求

- Node.js 20 或更高版本
- Git
- 当前用户拥有该仓库的 SSH 推送权限
- 仓库 remote `origin` 已配置为：

```text
git@github.com:nannandedongdong/game_list.git
```

可以先验证权限：

```bash
git ls-remote --heads origin
```

## 3. 安装与启动

```bash
cd /Users/wudz/game_list/tools/game-publisher
npm install
npm start
```

打开：

```text
http://127.0.0.1:4173
```

后台只监听本机回环地址，不对局域网或公网开放。

## 4. 配置

配置文件位于仓库根目录：

```text
publisher.config.json
```

主要配置项：

| 配置 | 说明 |
|---|---|
| `server.host` | 监听地址，默认 `127.0.0.1` |
| `server.port` | 本地端口，默认 `4173` |
| `repository.remote` | Git remote，默认 `origin` |
| `repository.branch` | 发布分支，默认 `main` |
| `repository.contentRoot` | 公开文件目录，默认 `public` |
| `repository.githubUrl` | 页面显示的 GitHub 地址 |
| `publicBaseUrl` | 手机端访问的公开根地址 |
| `limits.romBytes` | 单 ROM 上限，默认 10MB |
| `limits.coverBytes` | 单海报上限，默认 2MB |
| `gameTypes` | 类型、JSON 文件名、允许的 ROM 扩展名 |

临时覆盖配置可使用环境变量：

```bash
GAME_PUBLISHER_REPO_ROOT=/path/to/repo \
GAME_PUBLISHER_CONFIG=/path/to/publisher.config.json \
npm start
```

## 5. 发布规则

### 新增游戏

一次 commit 包含：

```text
public/roms/<类型>/<game-id>/game.<扩展名>
public/covers/<类型>/<game-id>/cover.<扩展名>   # 仅选择海报时
public/catalog/<类型>.json
```

### 更新游戏

页面选择已有游戏后可以：

- 修改游戏名称；
- 替换 ROM；
- 可选替换海报；
- 不能修改游戏类型。

更新不保留旧 ROM 版本，直接覆盖固定路径，`revision` 自动加 1。

### 删除游戏

删除操作在同一个 commit 中：

- 从类型 JSON 删除条目；
- 删除 ROM 目录；
- 删除海报目录。

### 海报

海报不是必填项。未上传海报时，JSON 中：

```json
"cover_path": null
```

## 6. 校验规则

上传前会检查：

- 游戏名称非空且不超过 160 字符；
- 类型属于 GBA / MD / CPS1 / FC；
- ROM 扩展名与类型匹配；
- ROM 不超过 10MB；
- 海报不超过 2MB；
- 海报必须是 JPG、PNG 或 WebP；
- CPS1 必须是有效 ZIP 文件头；
- SHA-256 与已有 ROM 不重复；
- 发布时间文件不能已有未提交改动。

## 7. Git 行为

每次发布：

```text
git add -A -- <本次文件>
git commit -m "game: add/update/delete ..."
git push origin HEAD:main
```

发布前会：

1. 检查当前分支是否为 `main`；
2. 检查是否有别的暂存改动；
3. `git fetch origin main`；
4. 如远端有新提交，执行 `git pull --rebase --autostash`；
5. 检查本次目标文件是否有未提交改动。

如果 commit 成功但 push 失败，文件仍保存在本地，界面会提示“重试推送”。

## 8. 本地 API

后台自身的 API 只供本机网页调用。

| 接口 | 说明 |
|---|---|
| `GET /api/health` | 服务与 Git 状态 |
| `GET /api/config` | 当前配置和限制 |
| `GET /api/games` | 读取本地公开 JSON |
| `POST /api/games` | multipart 上传或更新游戏 |
| `DELETE /api/games/:id` | 删除游戏 |
| `POST /api/sync` | 重试 push |

`POST /api/games` 的 multipart 字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 游戏名称 |
| `game_type` | 新游戏必填 | GBA / MD / CPS1 / FC |
| `rom` | 是 | ROM 文件 |
| `cover` | 否 | JPG / PNG / WebP |
| `id` | 更新时必填 | 已有游戏 ID |

## 9. 测试

```bash
cd tools/game-publisher
npm test
```

测试覆盖：

- 类型规范化；
- ROM 大小和扩展名校验；
- 海报文件头识别；
- ID 与 SHA-256；
- 类型 JSON 与索引生成；
- 相对资源地址解析。

## 10. 常见问题

### 推送失败

检查：

```bash
ssh -T git@github.com
git ls-remote --heads origin
```

修复后点击页面上的“重试推送”。

### 当前分支不是 main

```bash
git switch main
```

### 仓库有暂存改动

```bash
git status
```

先提交或取消暂存，再发布游戏。

### 远端有新提交且同步失败

```bash
git status
git pull --rebase --autostash origin main
```

处理冲突后重新发布。

### 手机端还看到旧数据

GitHub Raw 可能有缓存。等待片刻，或在请求上级加 `?v=<updated_at>`。
