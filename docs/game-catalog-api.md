# Game List 公开接口文档

本文档面向 Android/iOS 客户端。客户端只读取 GitHub 上的公开 JSON 和静态文件，不需要访问本地发布后台，也不需要登录。

## 1. 基本地址

公开文件根目录：

```text
https://raw.githubusercontent.com/nannandedongdong/game_list/main/public
```

入口索引（优先）：

```text
https://raw.githubusercontent.com/nannandedongdong/game_list/main/public/catalog/index.json
```

CDN 备用地址：

```text
https://cdn.jsdelivr.net/gh/nannandedongdong/game_list@main/public/catalog/index.json
```

两种地址的文件目录结构完全一致。客户端建议先请求 GitHub Raw，超时或失败后再切换到 jsDelivr。当前测试环境中 Raw 地址可能超时，而 jsDelivr 返回正常。

仓库地址：

```text
https://github.com/nannandedongdong/game_list
```

## 2. 推荐的客户端读取流程

```text
GET catalog/index.json
    → 获取每种游戏类型对应的 JSON 列表文件名
    → 并行或按需 GET 各类型列表
    → 展示 games 数组
    → 用户点击获取
    → 下载 rom_path 指向的 ROM
    → 用 file_size 和 sha256 校验文件
```

当前类型：

- `GBA`
- `MD`
- `CPS1`
- `FC`

数据没有分页，每次直接返回该类型的完整列表。

## 3. 索引文件

地址：

```text
public/catalog/index.json
```

响应示例：

```json
{
  "schema_version": 1,
  "lists": {
    "GBA": "gba.json",
    "MD": "md.json",
    "CPS1": "cps1.json",
    "FC": "fc.json"
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | number | 数据结构版本，当前固定为 `1` |
| `lists` | object | 游戏类型到列表文件名的映射 |

列表文件与 `index.json` 位于同一目录，所以客户端应相对于 `index.json` 的地址解析列表文件名。

例如：

```text
https://.../public/catalog/index.json
+ gba.json
= https://.../public/catalog/gba.json
```

## 4. 类型游戏列表

地址示例：

```text
public/catalog/gba.json
public/catalog/md.json
public/catalog/cps1.json
public/catalog/fc.json
```

响应示例：

```json
{
  "schema_version": 1,
  "game_type": "GBA",
  "updated_at": "2026-10-22T10:30:02.824Z",
  "games": [
    {
      "id": "gba-20261022-9fdb7626",
      "name": "热血硬派国夫君SP 汉化版V1.0",
      "cover_path": "../covers/gba/gba-20261022-9fdb7626/cover.png",
      "rom_path": "../roms/gba/gba-20261022-9fdb7626/game.gba",
      "file_name": "热血硬派国夫君SP 汉化版V1.0.gba",
      "file_size": 12058624,
      "sha256": "9f8a...完整64位十六进制...",
      "revision": 1,
      "updated_at": "2026-10-22T10:30:02.824Z"
    }
  ]
}
```

### 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | number | 当前固定为 `1` |
| `game_type` | string | 当前列表的游戏类型 |
| `updated_at` | string/null | 列表最后更新时间，ISO 8601；空列表时可能为 `null` |
| `games` | array | 游戏数组；没有游戏时为空数组 |

### 游戏字段

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | string | 否 | 稳定唯一 ID，不会因改名变化 |
| `name` | string | 否 | 游戏显示名称，允许重复 |
| `cover_path` | string/null | 是 | 海报相对路径；没有上传海报时为 `null` |
| `rom_path` | string | 否 | ROM 相对路径 |
| `file_name` | string | 否 | 下载后建议保留的原始文件名 |
| `file_size` | number | 否 | ROM 字节数 |
| `sha256` | string | 否 | ROM 的 SHA-256，小写十六进制 |
| `revision` | number | 否 | 从 `1` 开始；替换 ROM/海报时递增 |
| `updated_at` | string | 否 | 该游戏最后更新时间，ISO 8601 |

游戏条目本身不重复返回 `game_type`，客户端应使用所属列表的顶层 `game_type`。

## 5. 相对路径解析规则

`cover_path` 和 `rom_path` 是相对于**类型 JSON 所在目录**的路径，不是相对于 `public/` 根目录。

示例：

```text
类型 JSON:
https://.../public/catalog/gba.json

rom_path:
../roms/gba/gba-20261022-9fdb7626/game.gba

最终地址:
https://.../public/roms/gba/gba-20261022-9fdb7626/game.gba
```

客户端应使用标准 URL 相对路径解析，不要手工删除或拼接 `../`。

## 6. 下载与校验

ROM 和海报均可公开下载，不需要 `Authorization`。

下载完成后建议校验：

1. 实际字节数等于 `file_size`；
2. 实际文件 SHA-256 等于 `sha256`；
3. ROM 扩展名与所属类型匹配。

允许的扩展名：

| 类型 | 扩展名 |
|---|---|
| GBA | `.gba` |
| MD | `.md`, `.gen`, `.smd`, `.bin` |
| CPS1 | `.zip` |
| FC | `.nes`, `.fds`, `.unf` |

校验失败时应删除临时文件，不要把它标记为已下载。

## 7. 已下载状态

“已下载”是客户端本地状态，不在服务端 JSON 中。

建议本地保存：

- `game.id`
- 本地 ROM 路径
- `sha256`
- `revision`
- 下载完成时间

如果服务端条目的 `sha256` 或 `revision` 变化，客户端应提示游戏包已更新。

## 8. 主地址与备用地址

同一个相对路径可以在两个域名下访问。

GitHub Raw：

```text
https://raw.githubusercontent.com/nannandedongdong/game_list/main/public/<path>
```

jsDelivr：

```text
https://cdn.jsdelivr.net/gh/nannandedongdong/game_list@main/public/<path>
```

例如：

```text
Raw:
https://raw.githubusercontent.com/nannandedongdong/game_list/main/public/catalog/gba.json

jsDelivr:
https://cdn.jsdelivr.net/gh/nannandedongdong/game_list@main/public/catalog/gba.json
```

建议客户端：

1. 优先请求 Raw；
2. 连接超时、DNS 失败或 HTTP 5xx 时切换 jsDelivr；
3. 下载 ROM 时也按同样策略切换备用域名；
4. 不依赖 GitHub API 的分页或鉴权接口。

注意：jsDelivr 的 `@main` 分支地址有 CDN 缓存，新上传游戏可能有延迟；GitHub Raw 更适合立即读取最新数据。

## 9. 缓存与刷新

公开文件可能受到网络和缓存影响。

建议：

- 启动或进入在线游戏页时请求一次索引；
- 类型列表可以缓存，但用户下拉刷新时重新请求；
- JSON 请求可附加版本参数，例如 `?v=<updated_at>`；
- 海报加载失败时显示本地默认封面；
- 不依赖 GitHub API 的分页或鉴权接口。

## 10. 错误与空数据

- 文件不存在时，GitHub Raw 通常返回 `404`。
- JSON 不存在或格式错误时，客户端应保留本地缓存并在下次刷新重试。
- `games` 为空数组表示该类型暂无游戏，不是接口失败。
- 当前接口没有服务端搜索、分页或排序参数。

## 11. 排序约定

新上传的游戏会插入到对应 `games` 数组的开头，因此客户端直接按数组顺序展示即可得到“最新上传在前”的效果。

## 12. 最小 Kotlin 数据模型参考

```kotlin
data class GameIndex(
    @SerializedName("schema_version") val schemaVersion: Int,
    val lists: Map<String, String>,
)

data class GameCatalog(
    @SerializedName("schema_version") val schemaVersion: Int,
    @SerializedName("game_type") val gameType: String,
    @SerializedName("updated_at") val updatedAt: String?,
    val games: List<GameItem>,
)

data class GameItem(
    val id: String,
    val name: String,
    @SerializedName("cover_path") val coverPath: String?,
    @SerializedName("rom_path") val romPath: String,
    @SerializedName("file_name") val fileName: String,
    @SerializedName("file_size") val fileSize: Long,
    val sha256: String,
    val revision: Int,
    @SerializedName("updated_at") val updatedAt: String,
)
```

## 13. 重要约束

- 公开文件全部可直接访问，没有鉴权。
- ROM 最大 10MB。
- 海报为可选文件，支持 JPG、PNG、WebP。
- 当前数据格式版本为 `1`。
- 新增字段时应保证旧客户端可以忽略未知字段。
