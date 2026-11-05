# WPS 365 V7 SKILL 工具集

面向 LLM/Agent 的 V7 API 标准 SKILL 框架，各 skill 输出 Markdown + JSON，便于解析与串联。

## 结构

- `wpsv7client/`：统一 V7 客户端，按业务域分文件（calendar、drive、im、meeting、contacts、users、airpage 等）
- `skills/<name>/`：各业务场景，每目录含 `SKILL.md`（说明）与 `run.py`（可执行脚本），输出 Markdown + 原始 JSON
- `SKILL.md`：Agent 入口说明，聚合了全部子 skill 的用法
- `aggregate_skills.py`：把 `skills/*/run.py` 聚合到 `skills/bin/` 并按 skill 名重命名

## 安装

本 skill 带 Python 依赖，复制目录后还要建虚拟环境：

```sh
cd <agent 的 skills 目录>/wpsv7-skills
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
```

Windows 下解释器是 `.venv\Scripts\python.exe`。依赖只有 `requests`。

## 凭证

`wps_sid` 有两种来源，优先级：**环境变量 > 缓存文件**。

| 来源 | 方式 |
| --- | --- |
| 环境变量 | `export wps_sid=...`（也认 `WPS_SID`） |
| 缓存文件 | `<skill 根目录>/.wps_sid_cache.json`，内容 `{"wps_sid": "..."}` |

推荐交给 Agent 按 `SKILL.md` 的流程自动取：打开 `https://365.kdocs.cn/latest` → 从 cookie 读 `wps_sid` → 写入缓存文件。必须真正访问页面，否则拿不到 `csrf` cookie，接口会返回 403 `csrfCheckFailed`。

脚本鉴权失败（退出码 10）会自动清掉缓存，重新走一次取 cookie 流程即可。

`.wps_sid_cache.json` 含会话 cookie，已在 `.gitignore` 中忽略，**不要提交**。缓存路径由 `wpsv7client/auth.py` 按 skill 根目录解析，不写死绝对路径，所以换机器、换 agent 的 skills 目录都能直接用。

## 使用

```bash
.venv/bin/python3 skills/user-current/run.py
.venv/bin/python3 skills/im/run.py list
.venv/bin/python3 skills/drive/run.py upload ./file.md --path "笔记"
```

更多命令与参数见各子目录的 `SKILL.md`，或执行 `python skills/<名称>/run.py --help`。

## 当前 SKILL

| SKILL | 说明 | 典型能力 |
|-------|------|----------|
| [user-current](skills/user-current/SKILL.md) | 查询当前登录用户信息 | GET /v7/users/current |
| [contacts](skills/contacts/SKILL.md) | 通讯录按人名搜索用户，同名返回多条 | GET /v7/users/search |
| [calendar](skills/calendar/SKILL.md) | 日历与日程增删改查、忙闲查询 | /v7/calendars、events、free_busy_list |
| [meeting](skills/meeting/SKILL.md) | 在线会议创建/查询/取消与参会人管理 | /v7/meetings* |
| [drive](skills/drive/SKILL.md) | 云文档上传/列表/详情/下载/搜索/抽取；单文件 .md 自动上传为智能文档 | /v7/drives、files、links、content extract |
| [im](skills/im/SKILL.md) | 会话列表、最近会话、搜索会话、全局搜索消息、历史消息、发送（文本/富文本/图片/云文档/卡片）、撤回 | /v7/chats、messages、send、recall |

## 注意

- `SKILL.md` 里出现的 `~/.cursor/skills/wpsv7-skills/.venv/bin/python3` 是举例路径，实际以你所处 agent 的 skills 目录为准（pi 是 `~/.pi/agent/skills/`，DSH 是 `~/.dsh/skills/`，cc-switch 是 `~/.cc-switch/skills/`）。
- 写操作（发消息、撤回、创建/修改/删除日程与会议、上传文件）执行前应先向用户确认；只读查询可直接执行。
- 时间参数必须带时区（`Z` 或 `+08:00`），禁止无后缀写法，否则东 8 区会偏 8 小时。
- 上游 `tests/` 目录未随仓库分发，端到端测试需自备真实 `wps_sid` 后自行补测。
