# codeplan-usage

DSH Web UI 插件：在输入框下方的 composer dock 里显示 WPS Coding Plan 的额度占用。

- 一行状态条：`月度进度条 + 利用率 + 本月已用/额度 + 今日消耗`
- 点开面板：本月已用、月度额度、剩余、今日消耗、更新时间，附手动刷新
- 未配置 token 时，面板内直接粘贴保存，无需改文件

token 只存在 Host 进程内存和本地文件，前端拿不到；快照接口不返回 token。

## 安装

前提：已有一份可用的 DSH profile（`~/.dsh/profiles/<name>`）。

1. clone 仓库

```sh
git clone https://github.com/L-uvx/sth4agent
```

2. 在 profile 目录里把插件加为链接依赖

```sh
cd ~/.dsh/profiles/<profile>
pnpm add "link:/abs/path/to/sth4agent/dsh-plugins/codeplan-usage"
```

Windows 写成 `link:D:/project/sth4agent/dsh-plugins/codeplan-usage`。

3. 编辑同一目录下的 `package.json`，把插件加进 `dsh.profile.bundles`

```json
{
  "dsh": {
    "profile": {
      "bundles": ["...", "@local/codeplan-usage"]
    }
  }
}
```

4. 重启 DSH

Host 半边是 ESM，加载后不热更新，必须重启宿主进程。插件自带 `cordis.patch.yml`，bundle 挂上后会自动 `insert` 这一行，不需要手动改 `cordis.yml`。

## 获取 token

在 <https://ai-kas.kso.net/codeplan/> 的浏览器 console 里执行：

```js
copy(localStorage.getItem('wps_console_token'))
```

然后在状态条面板里粘贴保存。

token 读取优先级：

| 顺序 | 位置 | 说明 |
| --- | --- | --- |
| 1 | 环境变量 `CODEPLAN_CONSOLE_TOKEN` | 适合临时覆盖 |
| 2 | `$DSH_HOME/codeplan-token` | UI 保存到这里，权限 `0600` |
| 3 | `~/.pi/agent/codeplan-token` | 沿用 pi 扩展已存的 token，省一次配置 |

新设备上如果已经在用同目录的 pi 扩展，通常第 3 条会直接命中，开箱即用。

## 刷新时机

分两层：前端拉快照（60s）和 Host 真正打上游接口（45s 节流）。

| 层 | 时机 | 是否强制取数 |
| --- | --- | --- |
| Client | 状态条挂载时立即拉一次 | 否 |
| Client | 每 60s 轮询（仅当页面可见） | 否 |
| Client | 标签页切回可见 | 否 |
| Client | 点「刷新」按钮 | 是（`?fresh=1`） |
| Client | 保存 token 成功 | 是（`?fresh=1`） |
| Host | 非强制请求且距上次尝试 ≥ `throttleMs` | — |
| Host | 强制请求（`fresh=1`），无视节流 | — |

要点：

- **节流窗口必须小于前端轮询间隔**。默认 `45s` 对 `60s`；两者相等时，因为 `lastAttemptAt` 是在请求到达 Host 之后才打戳的，会稳定输掉竞速，表现为「每隔一次轮询被吞掉」。
- 页面隐藏时轮询不跑，切回时补一次。
- 并发请求会合并：`inflight` 存在时复用同一个 promise。
- 失败也占用节流窗口，即超时/限流后要等满一个窗口才会重试。
- 上游返回 `100401` 会置 `needsSetup`，此后彻底停止取数，直到重新粘贴 token。

## 可配置项

在 profile 的 cordis patch 里给这一行加 `config`（键全部可选）：

```yaml
- insert:
    - id: codeplan-usage
      name: '@local/codeplan-usage'
      config:
        throttleMs: 45000
```

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `apiBase` | `https://ai-kas.kso.net/codeplan/api` | 接口根地址 |
| `throttleMs` | `45000` | 上游最小请求间隔，需小于前端 60s 轮询 |
| `tokenPath` | `$DSH_HOME/codeplan-token` | token 落盘位置 |

## HTTP 接口

两条都是 loopback 路由，只走本机：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` / `HEAD` | `/plugins/codeplan-usage/snapshot[?fresh=1]` | 读快照；`fresh=1` 绕过节流强制执行 |
| `POST` | `/plugins/codeplan-usage/token` | `{"token":"…"}` 保存并立即刷新，`{"clear":true}` 清除 |

调试用的直接观察方式：

```sh
curl -s localhost:<web-port>/plugins/codeplan-usage/snapshot | grep -o '"ageMs":[0-9]*'
```

`ageMs` 稳定在 60 秒出头说明自动刷新正常；一路涨到几千秒说明 Host 没在取数。

## 已知限制

- 快照里算了 `stale`（3 分钟）和 `ageMs`，但 UI 目前没消费，数据陈旧时不会有视觉提示。
- `fresh=1` 若撞上正在飞行的普通请求，会复用它而不是额外再打一次。
- 快照不持久化，Host 重启后首屏会重新取一次。
