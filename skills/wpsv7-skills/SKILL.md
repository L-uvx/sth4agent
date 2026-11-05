---
name: wpsv7-skills
description: WPS 365 V7 API 工具集，集成通讯录、日历、会议、云文档、IM 等能力。Use when user asks to manage WPS calendar events, schedule meetings, search contacts, upload files to KDocs/WPS Drive, send IM messages, or perform any WPS 365 enterprise collaboration tasks.
---

# WPS 365 SKILL 工具集

基于 WPS 365 V7 API 封装的命令行工具，帮助你快速完成企业协作任务。

## 认证流程（自动，通过 MCP Playwright 获取 cookie）

凭证通过 MCP Playwright 从浏览器自动获取，缓存在 `~/.cursor/skills/wpsv7-skills/.wps_sid_cache.json`。**无需手动设置环境变量。**

**SKILL 根目录**：`~/.cursor/skills/wpsv7-skills`
**Python 路径**：`~/.cursor/skills/wpsv7-skills/.venv/bin/python3`

所有命令均在 SKILL 根目录执行，使用自带的 `.venv/bin/python3`。

### Step 1: 检查本地缓存

用 Read 工具读取 `~/.cursor/skills/wpsv7-skills/.wps_sid_cache.json`。

- 文件存在且 `wps_sid` 非空 → **直接跳到 Step 5 执行命令**
- 文件不存在或为空 → 执行 Step 2 获取 cookie

### Step 2: 通过 MCP Playwright 获取 cookie

1. 调用 `browser_navigate` 打开 `https://365.kdocs.cn/latest`
2. 检查页面 URL：
   - URL 包含 `365.kdocs.cn/latest` → 已自动登录，继续
   - URL 包含 `account.wps.cn` → 提示用户在浏览器中完成登录，轮询等待 URL 变回 `365.kdocs.cn`
3. 登录成功后，页面访问会自动设置 `csrf` cookie

> **重要**：必须访问页面才能获取 `csrf` cookie，缺少它会导致 API 返回 403 `csrfCheckFailed`。

### Step 3: 导出 cookie 并保存

用 `browser_run_code` 从 context 提取 `wps_sid`：

```javascript
async (page) => {
  const cookies = await page.context().cookies('https://365.kdocs.cn');
  const sidCookie = cookies.find(c => c.name === 'wps_sid');
  return { wps_sid: sidCookie ? sidCookie.value : null };
}
```

将返回的 `wps_sid` 用 Write 工具写入 `~/.cursor/skills/wpsv7-skills/.wps_sid_cache.json`：

```json
{
  "wps_sid": "<返回的 wps_sid 值>"
}
```

### Step 4: 关闭浏览器

调用 `browser_close` 关闭浏览器页面。

### Step 5: 执行 SKILL 命令

在 SKILL 根目录执行所需的命令（见下方各 SKILL 文档）。所有 `python` 命令均使用 `~/.cursor/skills/wpsv7-skills/.venv/bin/python3`。

### Step 6: 处理鉴权失败

如果脚本**退出码为 10**（或 stderr 包含「鉴权失败」）：

1. cookie 已过期，缓存已自动清除
2. **从 Step 2 重新获取 cookie**
3. 再次执行 Step 5 的命令

> 鉴权失败最多重试 1 次，避免死循环。

## 用户确认（重要）

以下**写操作**在执行前**必须先向用户确认**，列出操作摘要等待用户明确同意后才可执行：

- **IM**：发送消息（send）、撤回消息（recall）
- **日历**：创建/修改/删除日程（create-event、update-event、delete-event）、创建/删除日历
- **会议**：创建/取消会议（create、cancel）、添加/移除参会人
- **云文档**：上传文件（upload）

**只读操作**（查询、列表、搜索、详情、下载链接等）无需确认，可直接执行。

确认格式示例：
> 即将向「崔冰琦」发送文本消息："xxx"，是否确认？

## SKILL 概览

| SKILL | 功能 | 典型场景 |
|-------|------|----------|
| [contacts](#contacts) | 通讯录搜索 | 查人、获取用户ID |
| [user-current](#user-current) | 当前用户 | 确认当前登录身份 |
| [calendar](#calendar) | 日历与日程 | 创建/查询日程、忙闲查询 |
| [meeting](#meeting) | 会议管理 | 创建会议、管理参会人 |
| [drive](#drive) | 云文档 | 上传文件、获取文件信息 |
| [im](#im) | 聊天消息 | 会话管理、发送消息、搜索 |

---

## contacts

按姓名搜索企业通讯录，获取用户 ID。

```bash
# 搜索用户
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/contacts/run.py search "姓名"

# 获取用户 ID 后可用于添加日程/会议参与者
```

**用途**：获取的 `user_id` 可用于日程/会议的参与者邀请。

---

## user-current

查询当前登录用户信息。

```bash
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/user-current/run.py
```

返回：用户ID、昵称、企业、部门、邮箱、手机等。

---

## calendar

日历与日程管理。

```bash
# 列出日历
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/calendar/run.py list-calendars

# 创建日程
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/calendar/run.py create-event --calendar-id <id> --title "会议" --start 2026-03-04T03:00:00Z --end 2026-03-04T04:00:00Z

# 查询忙闲（用户/会议室在指定区间的忙时段，其余为空闲）
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/calendar/run.py free-busy --user-ids "user_id1,user_id2" --start 2026-03-04T00:00:00Z --end 2026-03-05T00:00:00Z

# 更多命令：get-event, update-event, delete-event, list-events
```

**时间格式**：须带时区，如 `2026-03-04T03:00:00Z` 或 `2026-03-04T11:00:00+08:00`（禁止无后缀，防东 8 区错 8 小时）。

---

## meeting

在线会议管理。

```bash
# 创建会议
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py create --subject "主题" --start 2026-03-04T03:00:00Z --end 2026-03-04T04:00:00Z --participants "user_id1,user_id2"

# 查询会议
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py get <meeting_id>

# 会议列表
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py list --start 2026-03-01T00:00:00Z --end 2026-03-07T00:00:00Z

# 取消会议
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py cancel <meeting_id>

# 管理参会人
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py add-participants <meeting_id> --ids "user_id"
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py remove-participants <meeting_id> --ids "user_id"
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py list-participants <meeting_id>
```

**返回信息**：meeting_id、join_url（入会链接）、meeting_code（入会码）  
**时间格式**：start/end 须带 `Z` 或 `+08:00`，禁止无后缀（防东 8 区错 8 小时）。

---

## drive

金山云文档管理。上传**单个 .md 文件**时自动转为**智能文档**（.otl）。

```bash
# 上传文件（.md 会以智能文档形式上传）
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py upload /path/to/file.md
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py upload /path/to/file.docx

# 指定云盘与路径
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py upload /path/to/file.md --drive private --path "我的文档/子目录"

# 文件列表
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py list

# 文件详情
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py get <file_id>

# 获取下载链接
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py download <file_id>
```

---

## im

聊天会话与消息管理。

### 会话管理

```bash
# 会话列表
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py list

# 最近会话（带未读数）
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py recent

# 搜索会话
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py search "关键字"

# 会话详情
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py get <chat_id>
```

### 消息管理

```bash
# 历史消息
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py history <chat_id>

# 全局搜索消息（跨所有会话）
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py search-messages --keyword "关键字"

# 发送消息
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py send <chat_id> "文本内容"

# 发送富文本
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py send <chat_id> --type rich_text --rich-text '<json>'

# 发送云文档
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py send <chat_id> --type file --file '<json>'

# 撤回消息
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py recall <chat_id> <message_id>
```

**消息类型**：
- `text` - 文本消息
- `rich_text` - 富文本（支持加粗、斜体等样式）
- `file` - 文件/云文档
- `image` - 图片（需要 storage_key）

---

## 常见场景

### 场景1：创建会议并邀请参会人

```bash
# 1. 查找参会人
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/contacts/run.py search "张三"

# 2. 查询忙闲
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/calendar/run.py free-busy --user-ids "user_id" --start 2026-03-04T00:00:00Z --end 2026-03-04T23:59:59Z

# 3. 创建会议
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/meeting/run.py create --subject "项目评审" --start 2026-03-04T03:00:00Z --end 2026-03-04T04:00:00Z --participants "user_id1,user_id2"
```

### 场景2：发送云文档到群聊

```bash
# 1. 上传文档到云端（.md 会以智能文档上传，返回 link_id / link_url）
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/drive/run.py upload /path/to/doc.docx

# 2. 上传输出中会包含「发送云文档消息所需信息」JSON

# 3. 发送到群聊（id 字段填 link_id，不是 file_id）
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py send <chat_id> --type file --file '{"type":"cloud","cloud":{"id":"<link_id>","link_url":"<link_url>","link_id":"<link_id>"}}'
```

### 场景3：搜索历史消息

```bash
# 全局搜索关键字
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py search-messages --keyword "需求"

# 按时间范围搜索
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py search-messages --start-time 2026-01-01T00:00:00Z --end-time 2026-03-01T00:00:00Z

# 按会话搜索
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/im/run.py search-messages --chat-ids "chat_id1,chat_id2"
```

---

## 错误处理

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 退出码 10 / 鉴权失败 | wps_sid 过期或无效 | 缓存已自动清除，从认证流程 Step 2 重新获取 cookie |
| 缺少用户凭证 | 无缓存且无环境变量 | 执行认证流程 Step 2 获取 cookie |
| csrfCheckFailed | CSRF 验证失败 | 重新获取 cookie（需访问页面以获取 csrf cookie） |

---

## 时间格式与时区（重要，防 LLM 出错）

所有涉及**开始/结束时间**的参数（日历、会议、忙闲等）必须使用 **带时区的 ISO 8601**，**禁止使用无时区后缀**的写法，否则在东 8 区会导致**约 8 小时偏差**（会议/日程会晚 8 小时或显示错误）。

- **推荐（二选一）**：
  - UTC：`2026-03-04T06:00:00Z`（表示北京时间 14:00）
  - 东 8 区：`2026-03-04T14:00:00+08:00`（北京时间 14:00）
- **错误示例**：`2026-03-04T14:00:00`（无 `Z` 或无 `+08:00`）会被当作 14:00 UTC，对应北京时间 22:00，易导致会议/日程晚 8 小时。

调用日历、会议、忙闲等 SKILL 时，请始终在时间字符串末尾带 `Z`（UTC）或 `+08:00`（东 8 区）。

---

## 获取帮助

```bash
# 查看所有 SKILL
ls ~/.cursor/skills/wpsv7-skills/skills/*/SKILL.md

# 查看具体 SKILL 帮助
~/.cursor/skills/wpsv7-skills/.venv/bin/python3 ~/.cursor/skills/wpsv7-skills/skills/<skill>/run.py --help
```
