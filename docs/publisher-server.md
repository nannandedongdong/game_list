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
git clone git@github.com:nannandedongdong/game_list.git
cd game_list/tools/game-publisher
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
| `publicBaseUrl` | 手机端优先访问的公开根地址 |
| `fallbackPublicBaseUrl` | GitHub Raw 不可用时使用的 jsDelivr 备用根地址 |
| `limits.romBytes` | 单个游戏包上限，默认 10MB；ZIP 按 ZIP 文件大小计算 |
| `limits.coverBytes` | 单海报上限，默认 2MB |
| `limits.zipMaxEntries` | ZIP 内文件数量上限，默认 2048 |
| `limits.zipMaxUncompressedBytes` | ZIP 解压后总大小上限，默认 128MB |
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

页面选择已有游戏后，左侧会显示当前 ROM 的文件名、大小、SHA-256 和下载链接，并可以：

- 修改游戏名称；
- 不重新选择 ROM，直接保留当前 ROM；
- 选择新 ROM / ZIP 时替换当前游戏包；
- 可选替换海报；
- 不能修改游戏类型。

浏览器不允许把旧文件自动填回文件选择框，因此更新时 ROM 输入变为可选。没有选择新文件就保持原 ROM 不变。

替换 ROM 时不保留旧版本，直接覆盖固定路径。

任意成功更新都会让 `revision` 自动加 1，包括只修改名称或海报；客户端判断游戏包是否变化应比较 `sha256`。

只修改名称或海报、不上传新 ROM 时，本次 commit 只包含类型 JSON；如果还替换了海报，则同时包含海报文件。

### 删除游戏

点击“删除”后会先显示确认弹窗；确认后立即显示提交进度条。

删除操作在同一个 commit 中：

- 从类型 JSON 删除条目；
- 删除 ROM 目录；
- 如果存在海报，同时删除海报目录；
- push 到 GitHub。

没有海报的游戏不会因为不存在的海报路径而提交失败。若 push 失败，弹窗会提示并允许直接重试。

### 海报

海报不是必填项。未上传海报时，JSON 中：

```json
"cover_path": null
```

## 6. 校验规则

上传前会检查：

- 游戏名称非空且不超过 160 字符；
- 类型属于 GBA / MD / CPS1 / FC；
- 游戏包扩展名属于该类型允许范围；
- GBA / MD / FC / CPS1 均支持 `.zip` 游戏包；
- 游戏包不超过 10MB；
- 海报不超过 2MB；
- 海报必须是 JPG、PNG 或 WebP；
- 扩展名为 `.zip` 时，文件必须是有效 ZIP；
- ZIP 会被主动检查，GBA/MD/FC 通过文件头识别，CPS1 支持多文件街机包；
- ZIP 内容与所选类型不一致、混装多种类型、嵌套 ZIP、加密 ZIP 或异常路径会被拒绝；
- ZIP 解压后总体积和解压文件数量有安全上限；
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
| `rom` | 新游戏必填；更新时可选 | ROM 或 ZIP 游戏包；更新时不传表示保留当前 ROM |
| `cover` | 否 | JPG / PNG / WebP |
| `id` | 更新时必填 | 已有游戏 ID |

上传 ZIP 时的成功响应会额外包含：

```json
{
  "package": {
    "format": "zip",
    "detected_type": "GBA",
    "detection": "file-header",
    "entry_count": 1,
    "uncompressed_size": 33554432
  }
}
```

更新但未重新选择 ROM 时：

```json
{
  "package": {
    "format": "zip",
    "preserved": true
  }
}
```

主要错误码：

| 错误码 | 说明 |
|---|---|
| `INVALID_ZIP` | ZIP 无法读取或格式错误 |
| `GAME_TYPE_MISMATCH` | ZIP 内容类型和页面选择不一致 |
| `MIXED_GAME_TYPES` | 同一个 ZIP 内混装多个游戏类型 |
| `UNRECOGNIZED_GAME_TYPE` | 未找到可识别的游戏文件 |
| `NESTED_ZIP` | ZIP 内嵌套了 ZIP |
| `ENCRYPTED_ZIP` | ZIP 加密 |
| `UNSAFE_ZIP_ENTRY` | ZIP 中包含异常路径 |
| `ZIP_TOO_MANY_ENTRIES` | ZIP 内文件数量超限 |
| `ZIP_UNCOMPRESSED_TOO_LARGE` | ZIP 解压后体积超限 |
| `DUPLICATE_ROM` | 相同 SHA-256 的游戏包已存在 |
| `PUSH_FAILED` | 本地 commit 成功，但 push 失败 |

## 9. 测试

```bash
cd tools/game-publisher
npm test
```

测试覆盖：

- 类型规范化；
- 游戏包大小和扩展名校验；
- GBA / MD / FC 的 ZIP 文件头识别；
- CPS1 多文件街机包；
- 类型不匹配、混装类型和无效 ZIP；
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

GitHub Raw 可能有缓存。等待片刻，或在请求地址后加 `?v=<updated_at>`。

如果主地址网络不可用，可切换到配置中的 jsDelivr 备用地址。注意 jsDelivr 的 `@main` 有 CDN 缓存，最新数据仍优先使用 GitHub Raw。

## 11. 变更记录

### 2026-10-22

- 支持 GBA / MD / FC / CPS1 上传 ZIP 游戏包。
- 增加 ZIP 内部类型识别和 ZIP 安全限制。
- 更新已有游戏时展示当前 ROM，并允许不重新选择 ROM。
- 单次新增、更新、删除仍只创建一个 Git commit。
- 删除操作增加确认弹窗、进度条和失败重试。
- 修复无海报游戏删除时 Git 提交路径不存在的问题。
