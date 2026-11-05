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

## 配置 token

token 是 console 的登录态，同一账号可在多设备复用。在任意一台**已登录** <https://ai-kas.kso.net/codeplan/> 的机器上取一次即可：

```js
copy(localStorage.getItem('wps_console_token'))
```

### 三种来源与优先级

| 顺序 | 位置 | 写入方式 | 是否需重启 |
| --- | --- | --- | --- |
| 1 | 环境变量 `CODEPLAN_CONSOLE_TOKEN` | 启动宿主前设置 | 是 |
| 2 | `$DSH_HOME/codeplan-token` | UI 粘贴，或手写文件 | UI 粘贴否 / 手写是 |
| 3 | `~/.pi/agent/codeplan-token` | 已有 pi 扩展时自动复用 | 否 |

`$DSH_HOME` 未设置时按 `~/.dsh` 处理，所以默认落盘位置是 `~/.dsh/codeplan-token`；Windows 上是 `C:\Users\<user>\.dsh\codeplan-token`。文件内容为单行明文 token，读取时会 trim。

最省事的路径是 **UI 粘贴**：装好插件重启后，状态条显示「未配置 · 点击粘贴 token」，点开面板粘贴保存即可。Host 会立刻写文件（`0600`）并强制取一次数，不需要再重启。

新设备上如果已经在用 pi 扩展，第 3 条会直接命中，装完插件重启就开箱可用。

### 三个容易踩的坑

1. **token 只在插件加载时读一次**。`resolveToken()` 在 `apply()` 里调用，没有文件监听。因此环境变量和手写文件都必须重启宿主才生效；只有 UI 粘贴是即时的，它直接改内存并落盘。
2. **环境变量会永久压制 UI 粘贴的 token**。之前设过 `CODEPLAN_CONSOLE_TOKEN` 的话，在 UI 里更新 token 只对当前进程有效，下次重启又会回到环境变量里的旧值，表现为「明明更新过，重启又失效」。要么别设环境变量，要么两处一起改。
3. **校验规则不是严格的 36 位**。占位符写「36 位 token」只是提示，实际按 `^[\w.-]{16,128}$` 校验。token 里若含 `+` `/` `=` 会被拒成「看起来不是 console token」。

另外 UI 没有「清除 token」的入口，清除只能打接口：

```sh
curl -X POST localhost:<web-port>/plugins/codeplan-usage/token \
  -H 'content-type: application/json' -d '{"clear":true}'
```

清完同样需要重启。

### 验证

```sh
curl -s localhost:<web-port>/plugins/codeplan-usage/snapshot
```

`configured` 为 `true`、`error` 为 `null`、`monthUsedCny` 有数值即配置成功；`needsSetup` 为 `true` 则是登录态失效（见下）。

### token 失效

上游返回 `100401` 会把状态置为 `needsSetup`，此后**彻底停止取数**，状态条显示「登录态失效，请重新粘贴 token」。重新粘贴一个有效 token 即恢复，不需要重启。

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
