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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

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

	// 工具级强制拦截：plan 模式下仅放行只读工具
	pi.on("tool_call", async (event, ctx) => {
		if (mode !== "plan") return undefined;
		if (READ_ONLY_TOOLS.has(event.toolName)) return undefined;

		return {
			block: true,
			reason: `Plan mode: 只读规划阶段，${event.toolName} 被禁用。请仅使用只读工具分析，方案输出在对话中；如需修改，请用 /build 退出规划模式。`,
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

- 禁止修改任何文件、禁止执行任何命令（工具已被强制拦截，请勿尝试）
- 允许的只读操作：阅读代码与文档、搜索、查看目录
- 目标：理解需求 → 澄清边界 → 产出一份可执行的实现方案
- 方案直接在对话中输出，不要写入任何文件，至少包含：步骤、涉及文件、关键改动点、风险
- 需要用户确认或存在歧义时，用简短问题澄清，不要擅自假设
- 方案产出后，提醒用户输入 /build 退出规划模式再执行
`,
		};
	});
}
