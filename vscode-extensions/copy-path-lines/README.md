# Copy Path with Line Range

* **定位：** 把编辑器选中区变成可直接粘贴的 `路径#L42-L58` 代码引用
* **用途：** 贴给 AI、issue、PR 评论或终端，让下游无需猜测即可精确定位代码位置
* **核心结论：** 相对路径 + GitHub 行锚点，跨 Windows/WSL 均有效；`git pull` 后 Reload Window 即更新

## 一、输出格式

| 操作 | 剪贴板内容 |
| --- | --- |
| 选中 42-58 行，按 `Ctrl+Alt+R` | `src/core/store.cpp#L42-L58` |
| 光标停在第 42 行（无选区） | `src/core/store.cpp#L42` |
| 两处多光标选区 | 每个选区一行，共两行 |
| 选中 42-58 行，按 `Ctrl+Alt+K` | `D:/work/demo-project/src/core/store.cpp#L42-L58` |

### 1、路径为何取相对工作区根

代码常在 Windows（`D:\project\...`）与 WSL（`/mnt/d/project/...`）两个视图下打开，绝对路径换环境即失效，相对工作区根的路径始终有效，且贴给 AI 时更省 token。无法确定工作区时（单独打开一个文件）自动回退为绝对路径

### 2、行号为何用 #L 锚点

`#L42-L58` 与 GitHub permalink 的行锚点格式完全一致，将来增加 permalink 变体只需拼接前缀。相比之下 `path:42-58` 的写法在 Windows 盘符下（`D:/work/a.cpp:42-58`）会让解析器无法可靠切分路径与行号的边界

### 3、单行为何不写 L42-L42

`#L42` 更短且无歧义，消费方按「起止相同即为单行」处理。多行范围才写全 `#L42-L58`

### 4、列号为何不输出

列号（`#L42:5-L58:12`）会显著增加噪音，且与盘符冒号叠加后更难解析；多数场景只需定位到行

## 二、调用方式

| 方式 | 相对路径 | 绝对路径 |
| --- | --- | --- |
| 快捷键 | `Ctrl+Alt+R` | `Ctrl+Alt+K` |
| 右键菜单 | 选中代码 → 右键 → `Copy Reference (Relative Path)` | 同菜单中的 `Copy Reference (Absolute Path)` |
| 命令面板 | `Ctrl+Shift+P` → 搜 `Copy Reference` | 同左 |

快捷键由 `contributes.keybindings` 声明，右键菜单由 `contributes.menus` 声明，安装后无需任何用户配置即生效

### 1、为何同时提供右键菜单

快捷键可能被本机其他程序抢走（见第三节）。右键菜单不经过按键分发链路，只要编辑器有焦点就一定可用，是快捷键失效时的兜底通道

### 2、如何改绑快捷键

`Ctrl+K Ctrl+S` 打开 Keyboard Shortcuts，搜 `copyPathLines`，双击条目改键。VSCode 会即时提示该键是否与其他命令冲突

## 三、快捷键冲突排查

VSCode 内的冲突与系统级抢占是两套机制，排查手段不同

### 1、VSCode 内是否冲突

1. `Ctrl+K Ctrl+S` 搜目标键位，冲突会在条目上标出
2. 查内置默认绑定：命令面板 → `Preferences: Open Default Keyboard Shortcuts (JSON)`
3. 查已装扩展：读 `~/.vscode/extensions/*/package.json` 的 `contributes.keybindings`

### 2、系统级是否被抢占

系统级热键有两种实现，拦截行为不同：

| 实现 | 特征 | 探测方式 |
| --- | --- | --- |
| `RegisterHotKey` | 系统注册，可枚举 | PowerShell 调 `user32.dll` 逐个注册候选键，返回 `ERROR_HOTKEY_ALREADY_REGISTERED` 即为被占用 |
| 低级键盘钩子 | `WH_KEYBOARD_LL`，对枚举隐形；输入法与 PowerToys Keyboard Manager 常用 | 只能实测：命令面板 → `Developer: Toggle Keyboard Shortcuts Troubleshooting`，按键后输出面板无记录即为被抢 |

### 3、本扩展选定键位的依据

`Ctrl+Alt+R` / `Ctrl+Alt+K` 经三方验证：

1. 系统 `RegisterHotKey` 探测：FREE
2. VSCode 官方默认键绑定表：无占用
3. 已装扩展的 `contributes.keybindings`：无占用

已排除的候选：`Ctrl+Shift+C` 是 VSCode 内置的 `Open New Command Prompt`；`Alt+Shift+C` 是内置的在资源管理器中复制文件路径；`Alt+Shift+A` 是 Toggle Block Comment

## 四、边界行为

| 场景 | 行为 |
| --- | --- |
| 选区结尾恰好停在下一行行首 | 不包含该行，输出 `#L42-L58` 而非 `#L42-L59` |
| 无工作区（单独打开文件） | 回退为绝对路径 |
| `Untitled-1` 未保存缓冲区 | 输出 `Untitled-1#L3-L4` |
| 多个选区产生重复内容 | 去重，保持首次出现的顺序 |
| 无活动编辑器 | 命令在命令面板中置灰（`enablement: editorIsOpen`） |
| WSL / SSH / 容器远程窗口 | 以 `extensionKind: ui` 在本地运行，可直接操作编辑器与剪贴板 |

## 五、安装

### 1、从仓库安装（推荐）

```powershell
powershell -ExecutionPolicy Bypass -File ..\install.ps1
```

脚本创建 junction，把 `%USERPROFILE%\.vscode\extensions\local.copy-path-lines-1.0.0` 指向本目录。此后 `git pull` + `Developer: Reload Window` 即生效

### 2、从 vsix 安装

```sh
code --install-extension copy-path-lines-1.0.0.vsix
```

## 六、开发

* 回归检查：

```sh
node verify.js
```

`verify.js` 注入 mock 的 `vscode` 模块后加载真实实现，逐条断言剪贴板内容，覆盖单行、跨行、行首结尾、多光标、去重、无工作区、Untitled 等场景；同时校验 manifest 的命令、快捷键、右键菜单、`extensionKind` 与 BOM

* 打包 vsix：

```sh
npx -y @vscode/vsce package
```

产物为 `copy-path-lines-1.0.0.vsix`（已被 `.gitignore` 忽略），上传到 GitHub Releases

* 改输出格式时：

1. 改 `extension.js` 的 `anchor()` / `relativeLabel()` / `absoluteLabel()`
2. 同步更新 `verify.js` 的期望值，否则多设备行为会悄悄漂移
3. 若属于行为变更，升 `package.json` 的 `version`，否则 vsix 安装方式不会收到更新提示
