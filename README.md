# Game List

公开游戏目录与本地发布后台。

## 公开数据

- 入口：`public/catalog/index.json`
- 类型列表：`public/catalog/{gba,md,cps1,fc}.json`
- 海报：`public/covers/`
- ROM：`public/roms/`

手机端 API 文档：[docs/game-catalog-api.md](docs/game-catalog-api.md)

公开地址：

```text
https://raw.githubusercontent.com/nannandedongdong/game_list/main/public/catalog/index.json
```

备用 CDN：

```text
https://cdn.jsdelivr.net/gh/nannandedongdong/game_list@main/public/catalog/index.json
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
