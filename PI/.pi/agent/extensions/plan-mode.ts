/**
 * Plan Mode Extension
 *
 * 为 pi 提供类似 opencode 的 plan 模式：规划阶段只读，禁止任何修改与命令执行。
 *
 * 用法：
 *   /plan   进入规划模式（只读，产出对话内方案）
 *   /build  退出规划模式，恢复全权访问
 *   环境变量 PI_PLAN_MODE=1 可令启动即进入规划模式（便于非交互测试）
 *
 * 实现：
 *   - on("tool_call")          工具级强制拦截，模型无法绕过
 *   - on("before_agent_start") 注入规划指令引导模型产出方案
 *   - ctx.ui.setStatus         状态栏实时显示 [PLAN] / [BUILD]
 */

import { isToolCallEventType, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function planModeExtension(pi: ExtensionAPI) {
	// plan 模式下放行的只读工具白名单；其余工具一律拦截
	// 只读工具白名单。同时收录 pi 内置工具名与扩展提供的等价工具名，
	// 避免因装了搜索/诊断类扩展（pi-fff、pi-lens、rpiv-*）导致规划模式下无工具可用。
	// 注意：写入类工具（edit、write、ast_grep_replace、lens_diagnostic_mark、subagent）
	// 永远不在此列表中。
	const READ_ONLY_TOOLS = new Set([
		// 核心文件读取
		"read",
		"ls",
		// 搜索：内置 grep/find 与 pi-fff 两套命名（tools-and-ui / override 模式）
		"grep",
		"find",
		"ffgrep",
		"fffind",
		"fff-multi-grep",
		"multi_grep",
		// 交互与进度跟踪（只改会话状态，不触碰项目文件）
		"ask_user_question",
		"questionnaire",
		"todo",
		// pi-lens 只读能力（结构化浏览、诊断、情境工具激活）
		"symbol_search",
		"module_report",
		"project_report",
		"read_symbol",
		"read_enclosing",
		"lens_diagnostics",
		"pi_lens_activate_tools",
		"ast_grep_search",
		"ast_grep_outline",
		"lsp_navigation",
		"vscode_get_diagnostics",
		// 环境自省
		"effective_config",
		// 联网调研（只读，不修改项目）
		"web_search",
		"fetch_content",
		"get_search_content",
		"source_check",
	]);

	// 初始模式：环境变量 PI_PLAN_MODE=1 启动即进入 plan；否则默认 build
	let mode: "plan" | "build" = process.env.PI_PLAN_MODE === "1" ? "plan" : "build";

	// 状态栏颜色：BUILD 蓝色、PLAN 橙色（ANSI truecolor）
	const COLOR_BUILD = "\x1B[38;2;0;140;255m"; // 蓝
	const COLOR_PLAN = "\x1B[38;2;255;150;0m"; // 橙
	const COLOR_RESET = "\x1B[39m";

	function updateStatus(ctx: { ui: { setStatus: (id: string, text: string) => void } }) {
		if (mode === "plan") {
			ctx.ui.setStatus("plan-mode", `${COLOR_PLAN} [PLAN]${COLOR_RESET}`);
		} else {
			ctx.ui.setStatus("plan-mode", `${COLOR_BUILD} [BUILD]${COLOR_RESET}`);
		}
	}

	// 切换模式并刷新状态栏 + 通知
	function setMode(next: "plan" | "build", ctx: ExtensionContext) {
		mode = next;
		updateStatus(ctx);
		ctx.ui.notify(
			next === "plan"
				? "已进入 PLAN 模式：只读规划，禁止修改文件与执行命令。产出方案后请按 Alt+X 或 /build 退出。"
				: "已退出 PLAN 模式，恢复全权访问。",
			"info"
		);
	}

	// /plan 与 /build 切换命令
	pi.registerCommand("plan", {
		description: "进入规划模式（只读，禁止修改/执行命令，产出对话内方案）",
		handler: async (_args, ctx) => {
			setMode("plan", ctx);
		},
	});

	pi.registerCommand("build", {
		description: "退出规划模式，恢复全权访问",
		handler: async (_args, ctx) => {
			setMode("build", ctx);
		},
	});

	// Alt+X 快捷键：plan / build 一键切换
	// （最初用 ctrl+tab，但终端/VS Code 均占用 tab 组合；alt+x 在 pi 内置、Windows Terminal、VS Code 集成终端均无冲突）
	pi.registerShortcut("alt+x", {
		description: "切换 PLAN / BUILD 模式",
		handler: async (ctx) => {
			setMode(mode === "plan" ? "build" : "plan", ctx);
		},
	});

	// 会话开始时在状态栏显示当前模式
	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
	});

	// bash 只读命令白名单：查看类命令放行，写操作/脚本解释器/包管理器一律拦截
	const BASH_READ_COMMANDS = new Set([
		// 文件查看
		"cat", "head", "tail", "less", "more", "wc", "file", "stat", "tree", "du", "df",
		"ls", "find", "grep", "rg", "diff", "comm", "cmp", "sort", "uniq", "cut", "tr",
		"awk", "sed", "echo", "printf", "nl", "od", "xxd", "hexdump", "strings", "basename",
		"dirname", "readlink", "realpath",
		// 环境与进程查看
		"pwd", "which", "type", "command", "uname", "date", "env", "printenv", "whoami",
		"id", "hostname", "uptime", "ps", "free", "nproc", "lscpu", "getconf", "ulimit",
	]);

	// 命令级黑名单：出现即视为写操作（脚本解释器、包管理器、写命令、危险命令）
	const BASH_WRITE_COMMANDS = new Set([
		"rm", "mv", "cp", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp", "ln", "dd",
		"tee", "truncate", "install", "shred", "mkfs", "mount", "umount", "sudo", "su",
		"kill", "pkill", "killall", "xargs", "eval", "exec", "source", "timeout",
		"python", "python3", "py", "node", "nodejs", "npm", "npx", "pnpm", "yarn", "pip",
		"pip3", "gem", "cargo", "go", "rustc", "make", "cmake", "ninja", "meson", "gcc",
		"g++", "cl", "clang", "clang++", "msbuild", "dotnet", "mvn", "gradle",
		"curl", "wget", "unzip", "zip", "tar", "gzip", "gunzip", "xz", "bzip2", "zstd",
	]);

	// git 只读子命令；branch/remote/stash/tag/config 等可带写参数的子命令另做参数校验
	const GIT_READ_SUBCOMMANDS = new Set([
		"log", "status", "diff", "show", "rev-parse", "ls-files", "check-ignore",
		"name-rev", "describe", "diff-tree", "ls-remote", "for-each-ref", "shortlog",
		"blame", "grep", "ls-tree", "show-ref", "fsck", "help", "version", "branch",
		"remote", "stash", "tag", "config",
	]);

	function isReadOnlyGit(parts: string[]): boolean {
		const sub = parts[1] ?? "";
		if (!GIT_READ_SUBCOMMANDS.has(sub)) return false;
		switch (sub) {
			case "branch":
				// 仅放行纯列出（含 -a/-r/-v/-vv/--merged 等查看参数）；创建/删除/改名等拦截
				return (
					parts.length === 2 ||
					parts.slice(2).every((a) => a.startsWith("-") && !/^-[dDmMcC]$/.test(a))
				);
			case "remote":
				// 仅放行 remote / remote -v（列出）；add/remove/rename/set-url 拦截
				return parts.length === 2 || (parts[2] === "-v" && parts.length === 3);
			case "stash":
				// 仅放行 stash / stash list / stash show
				return parts.length === 2 || (["list", "show"].includes(parts[2]) && parts.length === 3);
			case "tag":
				// 仅放行 tag / tag -l / tag --list（列出）；打标签/删除拦截
				return parts.length === 2 || (["-l", "--list"].includes(parts[2]) && parts.length === 3);
			case "config":
				// 只放行查看：无参数 / --list / -l / 仅查询一个 key；key + value 是写入
				return (
					parts.length === 2 ||
					parts.slice(2).some((a) => ["--list", "-l"].includes(a)) ||
					parts.slice(2).filter((a) => !a.startsWith("-")).length === 1
				);
			default:
				return true;
		}
	}

	function isReadOnlySegment(segment: string): boolean {
		const parts = segment.trim().split(/\s+/);
		const raw = parts[0] ?? "";
		const cmd = raw.split("/").pop() ?? "";

		if (cmd === "git") return isReadOnlyGit(parts);
		if (BASH_WRITE_COMMANDS.has(cmd)) return false;
		// 命令替换（$() / 反引号）可执行任意命令 → 保守拦截
		if (segment.includes("$(") || segment.includes("`")) return false;
		return BASH_READ_COMMANDS.has(cmd);
	}

	/**
	 * 引号感知扫描一条 bash 命令：
	 * - 按引号外分隔符（;、&&、||、|、&、换行）切分为多个片段；引号（' " `）内的
	 *   分隔符不会被误切（如 grep -n "a\|b" file | head 中 \| 里的 | 是字面量）
	 * - 引号外出现 < > 时仅放行安全重定向（>/dev/null、2>&1、2>&- 等），
	 *   其余（>file、2>1、<file、>>file 等）一律标记为写操作
	 */
	function scanBashCommand(command: string): { segments: string[]; hasUnquotedRedirect: boolean } {
		const segments: string[] = [];
		let current = "";
		let hasUnquotedRedirect = false;
		let quote: "'" | '"' | "`" | null = null;
		let i = 0;
		const len = command.length;

		while (i < len) {
			const ch = command[i];

			if (quote === null) {
				if (ch === "'" || ch === '"' || ch === "`") {
					quote = ch;
					current += ch;
					i++;
					continue;
				}
				if (ch === "\\") {
					// 引号外反斜杠转义下一个字符，原样保留（如 \; 不是分隔符）
					current += ch;
					if (i + 1 < len) {
						current += command[i + 1];
						i += 2;
					} else {
						i++;
					}
					continue;
				}
				if (ch === ";" || ch === "|" || ch === "\n" || ch === "&") {
					// 分隔符（含单个 & 的后台执行）：&& 占两个字符
					segments.push(current);
					current = "";
					i += ch === "&" && command[i + 1] === "&" ? 2 : 1;
					continue;
				}
				if (ch === "<" || ch === ">") {
					// 安全重定向：[<>]{1,2} 后跟 /dev/null 或 &[0-9-]（如 >/dev/null、2>&1、>&-）
					const rest = command.slice(i);
					const safe = /^(?:[<>]{1,2})\s*(\/dev\/null|&[0-9-])/.exec(rest);
					if (safe) {
						current += rest.slice(0, safe[0].length);
						i += safe[0].length;
					} else {
						hasUnquotedRedirect = true;
						current += ch;
						i++;
					}
					continue;
				}
				current += ch;
				i++;
				continue;
			}

			// 引号内：双引号处理 \" \\ \$ \` 转义，其余原样累积
			if (quote === '"' && ch === "\\" && i + 1 < len && ['"', "\\", "$", "`"].includes(command[i + 1])) {
				current += ch + command[i + 1];
				i += 2;
				continue;
			}
			current += ch;
			if (ch === quote) {
				quote = null;
			}
			i++;
		}

		if (current.trim()) segments.push(current);
		return {
			segments: segments.map((s) => s.trim()).filter(Boolean),
			hasUnquotedRedirect,
		};
	}

	function isReadOnlyBashCommand(command: string): boolean {
		const trimmed = command.trim();
		if (!trimmed) return false;
		const { segments, hasUnquotedRedirect } = scanBashCommand(trimmed);
		if (hasUnquotedRedirect) return false;
		return segments.length > 0 && segments.every((seg) => isReadOnlySegment(seg));
	}

	// 工具级强制拦截：plan 模式下仅放行只读工具 + bash 只读命令
	pi.on("tool_call", async (event, ctx) => {
		if (mode !== "plan") return undefined;
		if (event.toolName === "bash" && isToolCallEventType("bash", event) && isReadOnlyBashCommand(event.input.command)) {
			return undefined;
		}
		if (READ_ONLY_TOOLS.has(event.toolName)) return undefined;

		return {
			block: true,
			reason: `Plan mode: 只读规划阶段，${event.toolName} 被禁用。请勿重试或尝试绕过；改用只读操作（read/ffgrep/fffind/symbol_search/lens_diagnostics、git log/status/diff/show、cat/head/tail 等）；如需修改请按 Alt+X 或 /build 退出。`,
		};
	});

	// 注入模式指令：PLAN 时限制只读，BUILD 时明确已恢复全权访问，
	// 避免模型沿用历史中的 PLAN 指令、误以为自己仍在规划阶段
	pi.on("before_agent_start", async (event) => {
		if (mode === "plan") {
			return {
				systemPrompt:
					event.systemPrompt +
					`

## PLAN 模式（只读规划阶段）

你当前处于 PLAN 模式：只读分析与规划，禁止一切修改。所有写操作已被工具强制拦截，无法绕过。

允许的操作：
- 读取与浏览：read、ls
- 搜索：ffgrep（内容）、fffind（文件名）、fff-multi-grep（多模式 OR）；若为 override 模式则为 grep/find/multi_grep
- 结构化浏览与诊断（pi-lens）：symbol_search、module_report、project_report、read_symbol、read_enclosing、lens_diagnostics、pi_lens_activate_tools（可激活 ast_grep_search / ast_grep_outline / lsp_navigation 等只读情境工具）
- 交互与跟踪：ask_user_question、todo
- 联网调研：web_search、fetch_content、get_search_content、source_check
- 只读 bash 查看类命令：git log/status/diff/show/stash list/remote -v、cat/head/tail/sed/grep/find/ls/wc/sort/uniq/awk、pwd/which/env/ps/free/du/df 等（可管道组合多个只读命令）

会被拦截、请勿尝试的操作：
- 文件修改：edit、write、rm、mv、cp、touch、mkdir、重定向 >、>>、< 等
- git 写操作：commit、push、add、branch -d、config 写入等
- 脚本/构建/安装/网络/解压：python、node、npm、pip、make、cmake、curl、wget、unzip、tar 等

被拦截时的行为：
- 不要反复重试、不要尝试绕过拦截（如用 python 替代 shell、加 2>&1 规避检查）
- 改用允许的只读命令达成同一查看/分析目标
- 确实需要写操作时，直接告知用户：按 Alt+X 或 /build 退出 PLAN 模式

工作方式：
- 理解需求 → 澄清边界 → 产出一份可执行的实现方案
- 方案直接在对话中输出，不写入任何文件，至少包含：步骤、涉及文件、关键改动点、风险
- 存在歧义时用简短问题澄清，不要擅自假设
- 方案产出后提醒用户按 Alt+X 或 /build 退出规划模式再执行
`,
			};
		}

		return {
			systemPrompt:
				event.systemPrompt +
				`

## BUILD 模式（全权访问）

你当前处于 BUILD 模式：已退出只读规划阶段，恢复全权访问。edit/write/bash 等写操作均可用，无需再按 Alt+X 或 /build 退出。

若历史消息中存在 PLAN 模式的只读限制说明，一律作废，以本条为准。

工作方式：
- 直接执行用户批准的方案，不要再重复产出规划
- 改完代码按项目规范验证（编译 / 格式化 / 测试）
`,
		};
	});
}
