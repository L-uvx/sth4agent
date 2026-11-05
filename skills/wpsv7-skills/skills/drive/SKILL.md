---
name: wpsv7-drive
description: 云文档管理：上传、列表、详情、下载、正文抽取、搜索、分享链接信息。单文件 .md 自动上传为智能文档。调用 V7 Drive 接口。
---

# 云文档·Drive（V7）

## 何时使用

- 需要将本地文件上传到云端（我的云文档/漫游箱）
- 需要查看云端文件列表或**按关键词搜索**云文档
- 需要获取文件详情、下载链接或**抽取文档正文**（plain/markdown/html）
- 需要根据 link_id 解析 file_id，或获取云文档信息用于发送 IM 消息

## 前置条件

- 已设置环境变量 `wps_sid`（或 `WPS_SID`）
- 在 `wpsv7-skill` 根目录执行命令

## 能力概览

| 操作 | 说明 | 常用参数 |
|------|------|----------|
| 上传 | 上传本地文件到云端；**单文件 .md 时自动走 Airpage 上传为智能文档** | `file_path`，`--path`（目标路径），`--filename`（云端文件名）|
| 列表 | 获取目录文件列表 | `--drive`，`--parent`，`--page-size` / `--page-token` / `--all` |
| 详情 | 获取文件详情（支持 file_id 或 link_id） | `file_id\|link_id`，`--drive` |
| 下载 | 获取文件下载链接 | `file_id\|link_id`，`--drive` |
| **抽取** | 按云文档抽取正文，internal GET .../content | `file_id\|link_id`，`--format`（plain/markdown/html/kdc），`--drive` |
| **搜索** | 搜索云文档文件，GET /v7/files/search | `keyword`，`--type`，`--scope`，`--page-size` / `--page-token` |
| Link 详情 | 根据 link_id 获取分享链接信息（含 file_id、drive_id） | `link_id` |

> **云盘ID**：`private`（我的云文档）、`roaming`（漫游箱）、`special`（团队云文档）

## 使用方式

在 `wpsv7-skill` 根目录执行：
```bash
python skills/drive/run.py <子命令> [参数...]
```

## run.py 子命令

- **upload** `[文件路径]` — 上传文件到云端；若为**单个 .md 文件**则自动走 Airpage 上传为**智能文档**（.otl）
  - `--drive/-d`：云盘ID（private/roaming/special），默认 private
  - `--parent/-p`：父目录ID，默认 root（仅普通上传生效）
  - `--path`：目标路径，如 `我的文档/子目录`；.md 时对应智能文档父路径
  - `--filename/-n`：云端文件名（默认与本地相同）
- **list** — 文件列表
  - `--drive/-d`：云盘ID，默认 private
  - `--parent/-p`：目录ID，默认 root
  - `--page-size/-s`：分页大小，默认 50
  - `--page-token`：分页 token（上一页返回的 next_page_token）
  - `--all`：拉取全部分页
- **get** `<file_id|link_id>` — 文件详情（传 link_id 时自动解析为 file_id）
  - `--drive/-d`：云盘ID（仅传入 file_id 时生效）
- **download** `<file_id|link_id>` — 文件下载链接（同上）
- **extract** `<file_id|link_id>` — 按云文档抽取正文（internal GET .../content）
  - `--format/-f`：输出格式 plain | markdown | html | kdc，默认 markdown
  - `--drive/-d`：云盘ID，默认 private
- **search** `[关键词]` — 搜索云文档文件
  - `--type/-t`：file_name | content | all，默认 all
  - `--scope/-s`：范围，逗号分隔（如 all, personal_drive, group_drive, latest, share_by_me, share_to_me, recycle）
  - `--page-size`：每页条数，默认 20
  - `--page-token`：分页 token
  - `--no-total`：不返回总条数
- **link-meta** `<link_id>` — 根据 link_id 获取分享链接信息（含 file_id、drive_id），GET /v7/links/{link_id}/meta

## 输出格式

先输出 Markdown 摘要，再输出完整 JSON（`## 原始数据 (JSON)`）。

## 发送云文档消息

上传或 get 返回的 JSON 中通常含 `link_id`、`link_url`，可用于 IM 发送云文档消息。`cloud.id` 需为 **link_id**（若只填 link_id 不填 id，IM 的 run.py 会自动用 link_id 填充 id）。

```bash
python skills/im/run.py send <chat_id> --type file --file '{"type":"cloud","cloud":{"link_url":"https://kdocs.cn/l/xxx","link_id":"xxx"}}'
```

## 错误处理

- 缺少 `wps_sid`：请先设置环境变量后重试
- 文件不存在：检查文件路径是否正确
- 401/403：凭证无效或权限不足
