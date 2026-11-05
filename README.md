# sth4agent

* **定位：** 跨设备复用的 AI coding agent 配置与工具集
* **用法：** clone 到任意设备，按下方目录说明各取所需
* **核心结论：** 四类内容互不依赖，只装需要的即可

## 一、目录结构

| 目录 | 内容 | 部署方式 |
| --- | --- | --- |
| `PI/` | pi agent 扩展（plan-mode、thinking-collapse） | 复制到 `~/.pi/agent/extensions/` |
| `skills/` | 跨项目复用的 skill | 复制到 `~/.pi/agent/skills/<name>/` |
| `dsh-plugins/` | DSH（DeepSeek Harness）Web UI 插件 | 加进 DSH profile 的依赖与 bundles（见第三节） |
| `vscode-extensions/` | VSCode 扩展源码 | 运行 `vscode-extensions/install.ps1`（见第四节） |

## 二、pi 扩展与 skill

* pi 扩展：

1. 把 `PI/.pi/agent/extensions/*.ts` 复制到 `~/.pi/agent/extensions/`
2. 在 pi 里执行 `/reload` 使其生效

* skill：

1. 把 `skills/<name>/` 整个目录复制到 `~/.pi/agent/skills/<name>/`
2. 新会话即可被自动发现

## 三、DSH 插件

DeepSeek Harness 的 Web UI 插件，装进 DSH profile 后直接在界面里生效。和上面两类一样按需安装，互不依赖。

```sh
git clone https://github.com/L-uvx/sth4agent
cd ~/.dsh/profiles/<profile>
pnpm add "link:/abs/path/to/sth4agent/dsh-plugins/codeplan-usage"
```

再把 `@local/codeplan-usage` 加进该 profile `package.json` 的 `dsh.profile.bundles`，然后重启 DSH（Host 半边是 ESM，不热更新）。插件自带 `cordis.patch.yml`，bundle 挂上后会自行注册，不必手改 `cordis.yml`。

各插件的配置项、token 位置、可调参数见其目录下的 README。

## 四、VSCode 扩展

Windows：

```powershell
git clone https://github.com/L-uvx/sth4agent
powershell -ExecutionPolicy Bypass -File sth4agent\vscode-extensions\install.ps1
```

Linux / macOS：

```sh
git clone https://github.com/L-uvx/sth4agent
sh ./sth4agent/vscode-extensions/install.sh
```

（用 `sh` 调用而非 `./install.sh`：仓库在 Windows 上维护，clone 出来可能没有可执行位）

安装脚本为每个扩展建立指向本仓库的 junction / symlink，因此 `git pull` 后只需 `Ctrl+Shift+P` → `Developer: Reload Window` 即可用上新版本，不必重装

* 可选参数：

1. `-Mode Copy`（PowerShell）/ `copy`（sh）：文件复制而非链接，适用于无法使用链接的机器
2. `-ExtensionsDir <path>` / 环境变量 `VSCODE_EXTENSIONS_DIR`：覆盖目标扩展目录，例如 VSCodium 的 `~/.vscode-oss/extensions` 或 WSL Remote 的 `~/.vscode-server/extensions`

* vsix 安装（不 clone 仓库时）：

```sh
code --install-extension copy-path-lines-1.0.0.vsix
```

vsix 产物放在 GitHub Releases，不进 git

## 五、扩展清单

| 扩展 | 说明 |
| --- | --- |
| [`copy-path-lines`](vscode-extensions/copy-path-lines/README.md) | 把选中区复制成 `路径#L42-L58` 引用，贴给 AI / issue / 终端 |
| [`codeplan-usage`](dsh-plugins/codeplan-usage/README.md) | DSH 插件：在输入框下方显示 Coding Plan 额度占用，可手动刷新 |
