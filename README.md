# Game List

公开游戏目录与本地发布后台。

## 公开数据

- 总库入口：`public/catalog/index.json`
- 分类仓库：每个游戏类型可以配置到独立 GitHub 仓库
- 分类列表：`public/catalog/{gba,md,cps1,fc}.json`
- 版本索引：`index.json.catalogs` 保存分类地址、仓库和毫秒级版本
- 海报：各分类仓库的 `public/covers/`
- ROM：各分类仓库的 `public/roms/`

手机端 API 文档：[docs/game-catalog-api.md](docs/game-catalog-api.md)

### 多仓库与增量更新

- `gamelist` 是总库，保存 `index.json` 和版本索引。
- GBA、MD、CPS1、FC 可以分别配置到不同 GitHub 仓库。
- 第一版默认全部指向 `gamelist`，以后只需修改 `publisher.config.json` 中对应分类的 `repository`。
- 分类表的顶层 `updated_at` 同时是该分类的版本号，使用毫秒精度 ISO 8601 时间。
- 客户端只请求总库 `index.json`，按其中的分类 URL 和版本决定是否下载分类表。
- 分类仓库与总库不同时，发布器先推送分类仓库，再推送总库索引。

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

打开 `http://127.0.0.1:4173`，可上传、更新、删除游戏；同仓库发布创建一个 Git commit，跨仓库发布分别推送分类仓库和总库索引。

后台说明：[docs/publisher-server.md](docs/publisher-server.md)

## 配置

仓库和发布参数位于 `publisher.config.json`：

- `repositories` 配置每个 GitHub 仓库的本地目录、remote、分支、公开地址和备用地址；
- `mainRepository` 指定总库；
- `gameTypes.<类型>.repository` 指定该分类使用哪个仓库；
- 文件大小限制和类型扩展名也在这里配置。
