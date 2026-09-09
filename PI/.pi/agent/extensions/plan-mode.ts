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
	const READ_ONLY_TOOLS = new Set([
		"read",
		"grep",
		"find",
		"ls",
		"vscode_get_diagnostics",
		"todo",
		"questionnaire",
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
				? "已进入 PLAN 模式：只读规划，禁止修改文件与执行命令。产出方案后请按 Tab 或 /build 退出。"
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

	// Tab 快捷键：plan / build 一键切换
	pi.registerShortcut("tab", {
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

	function isReadOnlyBashCommand(command: string): boolean {
		const trimmed = command.trim();
		if (!trimmed) return false;
		// 任何重定向/here-doc → 视为写操作
		if (/[<>]/.test(trimmed)) return false;
		// 管道/分号/逻辑符分割后，每个片段都必须只读
		const segments = trimmed.split(/\s*(?:;|&&|\|\||\||\n)\s*/).filter(Boolean);
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
			reason: `Plan mode: 只读规划阶段，${event.toolName} 被禁用。允许只读工具（read/grep/find/ls 等）与只读 bash 命令（git log/status/diff、cat/head/tail、find/grep 等）；如需修改，请用 /build 退出规划模式。`,
		};
	});

	// 注入规划指令，引导模型产出可执行方案
	pi.on("before_agent_start", async (event) => {
		if (mode !== "plan") return undefined;

		return {
			systemPrompt:
				event.systemPrompt +
				`

## PLAN 模式（只读规划阶段）

你当前处于 PLAN 模式，只做分析与规划，不执行任何修改：

- 禁止修改任何文件、禁止执行写操作命令（rm/mv/cp/mkdir、git commit/push/add、构建、安装等已被强制拦截，请勿尝试）
- 允许只读操作：阅读代码与文档、搜索、查看目录，以及只读 bash 命令（git log/status/diff/show、cat/head/tail、find/grep、pwd/which/env 等）
- 目标：理解需求 → 澄清边界 → 产出一份可执行的实现方案
- 方案直接在对话中输出，不要写入任何文件，至少包含：步骤、涉及文件、关键改动点、风险
- 需要用户确认或存在歧义时，用简短问题澄清，不要擅自假设
- 方案产出后，提醒用户输入 /build 退出规划模式再执行
`,
		};
	});
}
