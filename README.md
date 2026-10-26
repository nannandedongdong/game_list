# Game List

公开游戏目录与本地发布后台。

## 公开数据

- 入口：`public/catalog/index.json`
- 类型列表：`public/catalog/{gba,md,cps1,fc}.json`
- 版本索引：`index.json.list_versions` 保存每个分类最后一次更新时间
- 海报：`public/covers/`
- ROM：`public/roms/`

手机端 API 文档：[docs/game-catalog-api.md](docs/game-catalog-api.md)

### 增量更新规则

- 分类表的顶层 `updated_at` 同时是该分类的版本号，使用毫秒精度 ISO 8601 时间。
- `index.json.list_versions[类型]` 必须与对应分类表的 `updated_at` 完全一致。
- 客户端启动或刷新时只请求 `index.json`；版本一致的分类表直接使用本地缓存。
- 只有版本变化的分类才请求对应 JSON，不会重新下载全部类型列表。
- 新增、更新或删除游戏成功时，分类表和 `index.json` 在同一个 Git commit 中提交。

公开地址：

```text
https://raw.githubusercontent.com/nannandedongdong/game_list/main/public/catalog/index.json
```

GitHub 代理备用地址：

```text
https://gh-proxy.com/https://raw.githubusercontent.com/nannandedongdong/game_list/main/public/catalog/index.json
```

## 本地发布后台

```bash
cd tools/game-publisher
npm install
npm start
```

打开 `http://127.0.0.1:4173`，可上传、更新、删除游戏并创建单次 Git commit。

后台说明：[docs/publisher-server.md](docs/publisher-server.md)

## 配置

仓库和发布参数位于 `publisher.config.json`，其中的仓库地址、分支、公开根地址、文件大小限制和类型扩展名都可以配置。
