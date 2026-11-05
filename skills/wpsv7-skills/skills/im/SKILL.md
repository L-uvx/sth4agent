---
name: wpsv7-im
description: 聊天会话管理，获取会话列表、最近会话、历史消息，发送文本/富文本/云文档消息等。
---

# 聊天会话·IM（V7）

## 何时使用

- 需要获取当前用户的会话列表
- 需要获取最近会话列表（带未读数）
- 需要根据关键字搜索会话
- 需要**全局搜索消息**（跨会话搜索关键字）
- 需要查看指定会话的详细信息
- 需要获取会话的历史消息记录
- 需要向指定会话发送消息（文本，富文本、云文档等）
- 需要撤回已发送的消息

## 前置条件

- 已设置环境变量 `wps_sid`（或 `WPS_SID`）
- 在 `wpsv7-skill` 根目录执行命令

## 命令行使用

```bash
# 获取会话列表
python skills/im/run.py list
python skills/im/run.py list --page-size 20

# 获取最近会话
python skills/im/run.py recent
python skills/im/run.py recent --filter-unread
python skills/im/run.py recent --filter-mention-me

# 搜索会话（按名称）
python skills/im/run.py search "关键字"

# 全局搜索消息（跨所有会话搜索关键字）
python skills/im/run.py search-messages --keyword "关键字"
python skills/im/run.py search-messages --keyword "关键字" --start-time 2026-01-01T00:00:00Z

# 获取会话详情
python skills/im/run.py get <chat_id>

# 获取历史消息
python skills/im/run.py history <chat_id>
python skills/im/run.py history <chat_id> --start-time 2024-01-01T00:00:00Z

# 发送消息
python skills/im/run.py send <chat_id> "文本内容"
python skills/im/run.py send <chat_id> --type rich_text --rich-text '<json>'
python skills/im/run.py send <chat_id> --type file --file '<json>'

# 撤回消息
python skills/im/run.py recall <chat_id> <message_id>
```

## 子命令

### list - 获取会话列表

获取当前用户加入的所有会话（群聊+单聊）。

```bash
python skills/im/run.py list [--page-size N]
```

- `--page-size/-p`：分页大小，默认 50

### recent - 获取最近会话

获取最近会话列表，包含未读数、置顶、免打扰等状态。

```bash
python skills/im/run.py recent [--page-size N] [--filter-unread] [--filter-mention-me]
python skills/im/run.py recent --start-time 2026-01-01T00:00:00Z --end-time 2026-03-01T00:00:00Z
```

- `--page-size/-p`：分页大小，默认 50
- `--start-time/-s`、`--end-time/-e`：时间范围（UTC ISO 8601）
- `--filter-unread`：只返回有未读的会话
- `--filter-mention-me`：只返回 @我的会话

### search - 搜索会话

根据会话名称搜索会话。

```bash
python skills/im/run.py search "关键字" [--page-size N]
```

### search-messages - 全局搜索消息

在所有会话中搜索消息。**至少指定其一**：`--keyword`、`--chat-ids`、`--sender-ids`、`--start-time`。

```bash
python skills/im/run.py search-messages --keyword "关键字"
python skills/im/run.py search-messages --keyword "关键字" --page-size 50
python skills/im/run.py search-messages --start-time 2026-01-01T00:00:00Z --end-time 2026-03-01T00:00:00Z
python skills/im/run.py search-messages --chat-ids "chat_id1,chat_id2"
python skills/im/run.py search-messages --sender-ids "user_id1,user_id2"
python skills/im/run.py search-messages --msg-types "text,file,image,cloud_file"
```

**参数说明：**
- `--keyword/-k`：搜索关键字
- `--chat-ids/-c`：会话 ID 列表，逗号分隔
- `--sender-ids/-s`：发送者 ID 列表，逗号分隔
- `--msg-types/-t`：消息类型过滤（如 text, file, image, cloud_file）
- `--page-size/-p`：分页大小，默认 20
- `--start-time`、`--end-time`：时间范围（UTC ISO 8601）
- `--order/-o`：排序方式（by_create_time_desc 或 by_create_time_asc）

### get - 获取会话详情

```bash
python skills/im/run.py get <chat_id>
```

### history - 获取历史消息

```bash
python skills/im/run.py history <chat_id> [--page-size N] [--start-time TIME] [--end-time TIME] [--order ORDER]
```

- 时间参数使用 UTC ISO 8601 格式，如 `2024-01-01T00:00:00Z`
- `order`: `by_create_time_desc`（默认，降序）或 `by_create_time_asc`（升序）

### send - 发送消息

```bash
python skills/im/run.py send <chat_id> [text] [--type TYPE] [options]
```

**消息类型：**

| 类型 | 说明 | 示例 |
|------|------|------|
| text | 文本消息（默认） | `send 123 "你好"` |
| rich_text | 富文本消息 | `send 123 --type rich_text --rich-text '<json>'` |
| file | 文件/云文档 | `send 123 --type file --file '<json>'` |
| image | 图片消息 | `send 123 --type image --image-key '<json>'` |
| card | 卡片消息 | `send 123 --type card --card '<json>'` |

**发送富文本示例：**
```bash
python skills/im/run.py send 123456 --type rich_text --rich-text '{"elements":[{"type":"text","index":1,"indent":0,"alt_text":"Hello","style_content":{"text":"Hello World","style":{"bold":true}}}]}'
```

**发送云文档示例：**
> 云文档消息中 `cloud.id` 需使用 **link_id**（上传/详情接口返回的 `link_id`）。若 JSON 中只填了 `link_id` 未填 `id`，run.py 会自动用 `link_id` 填充 `id`。

```bash
python skills/im/run.py send 123456 --type file --file '{"type":"cloud","cloud":{"link_url":"https://kdocs.cn/l/xxx","link_id":"xxx"}}'
```

### recall - 撤回消息

```bash
python skills/im/run.py recall <chat_id> <message_id>
```

## 输出格式

输出包含 Markdown 摘要 + 完整 JSON 数据。

## 错误处理

- 缺少 `wps_sid`：设置环境变量后重试
- 401/403：凭证无效或过期
- 会话/消息不存在：检查 ID 是否正确
