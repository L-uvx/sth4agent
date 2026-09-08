/**
 * thinking-collapse: 思考过程折叠增强插件
 *
 * 功能：
 * 1. 思考时（streaming）默认展开当前思考过程
 * 2. 思考完成后自动折叠为一行标题
 * 3. 折叠标题提供 [展开] 按钮，展开状态提供 [折叠] 按钮
 * 4. 点击思考内容块（任意位置，含按钮与正文）均可切换折叠
 *
 * 实现原理：
 * 运行时（bundle）内联了 @earendil-works/pi-coding-agent，扩展经 jiti
 * virtualModules 拿到与运行时同一原型的 AssistantMessageComponent，
 * 因此包装其 updateContent 方法即可在不修改 pi 文件的情况下生效。
 * 若 pi 版本升级导致类结构变化，patch 会自动跳过（/thinking-fold 可查状态）。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AssistantMessageComponent, InteractiveMode } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, MouseRegion, Spacer, Text } from "@earendil-works/pi-tui";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyObj = Record<string, any>;
type Transformer = (markdown: string, context: AnyObj) => string | undefined;

/** 当前主题（Proxy，始终指向最新实例）。由 session_start 时从 ctx.ui 获取。 */
let activeTheme: any = null;

/** 最近一次渲染消息的 InteractiveMode 实例（用于键盘 toggle 时取组件与触发重绘）。 */
let lastModeInstance: any = null;

/** 与 pi 内部 markdown-transform.js 等价的内联实现，保证其他扩展的
 *  markdown transformer 对 thinking 内容依然生效。 */
function makeTransform(
  messageType: string,
  isStreaming: boolean,
  transformers: readonly Transformer[] | undefined,
): (markdown: string, availableWidth: number) => string {
  return (markdown: string, availableWidth: number) => {
    let result = markdown;
    for (const transformer of transformers ?? []) {
      try {
        const transformed = transformer(result, {
          messageType,
          isStreaming,
          availableWidth,
        });
        if (typeof transformed === "string") {
          result = transformed;
        }
      } catch {
        // 保持当前 Markdown 并继续下一个 transformer
      }
    }
    return result;
  };
}

function patchAssistantMessageComponent(): boolean {
  const proto = AssistantMessageComponent?.prototype as AnyObj | undefined;
  if (!proto || typeof proto.updateContent !== "function") {
    return false;
  }
  if (proto.__thinkingCollapsePatched === true) {
    return true;
  }

  proto.updateContent = function (
    this: AnyObj,
    message: AnyObj,
    isStreamingArg?: boolean,
  ): void {
    const isStreaming =
      typeof isStreamingArg === "boolean" ? isStreamingArg : !!this.isStreaming;
    // 正常流程中 activeTheme 在 session_start 时已就绪；未就绪时降级为无样式
    const theme = activeTheme;
    const fg = (color: string, text: string) =>
      theme ? theme.fg(color, text) : text;
    const italic = (text: string) => (theme ? theme.italic(text) : text);
    const contents: AnyObj[] = Array.isArray(message?.content) ? message.content : [];
    const overrides: Map<number, boolean> =
      this.thinkingVisibilityOverrides ?? new Map<number, boolean>();
    this.thinkingVisibilityOverrides = overrides;

    this.lastMessage = message;
    this.isStreaming = isStreaming;
    this.contentContainer.clear();

    const hasVisibleContent = contents.some(
      (c) =>
        (c.type === "text" && !!c.text?.trim()) ||
        (c.type === "thinking" && !!c.thinking?.trim()),
    );
    if (hasVisibleContent) {
      this.contentContainer.addChild(new Spacer(1));
    }

    let thinkingRunIndex = 0;
    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      if (content.type === "text" && content.text.trim()) {
        this.contentContainer.addChild(
          new Markdown(
            content.text.trim(),
            this.outputPad,
            0,
            this.markdownTheme,
            undefined,
            {
              transform: makeTransform(
                "assistant",
                this.isStreaming,
                this.markdownTransformers,
              ),
            },
          ),
        );
      } else if (content.type === "thinking") {
        // 合并连续 thinking 块
        const thinkingBlocks: string[] = [];
        for (; i < contents.length; i++) {
          const thinkingContent = contents[i];
          if (thinkingContent.type !== "thinking") break;
          const thinking = thinkingContent.thinking?.trim();
          if (thinking) thinkingBlocks.push(thinking);
        }
        i--;
        if (thinkingBlocks.length === 0) continue;

        const hasVisibleContentAfter = contents
          .slice(i + 1)
          .some(
            (c) =>
              (c.type === "text" && !!c.text?.trim()) ||
              (c.type === "thinking" && !!c.thinking?.trim()),
          );
        const runIndex = thinkingRunIndex++;

        // 折叠判定（插件接管 thinking 显示策略，不依赖 hideThinkingBlock）：
        // - 用户手动点击/快捷键切换过的 run → 尊重用户选择
        // - 思考中（streaming）→ 展开（思考时默认打开当前思考过程）
        // - 思考完成 / 历史消息（非 streaming）→ 自动折叠
        let hidden: boolean;
        if (overrides.has(runIndex)) {
          hidden = overrides.get(runIndex) === true;
        } else {
          hidden = !this.isStreaming;
        }

        const label = this.hiddenThinkingLabel ?? "Thinking...";
        let thinkingComponent: any;
        if (hidden) {
          // 折叠：单行标题 + [展开] 按钮
          thinkingComponent = new Text(
            italic(fg("thinkingText", `▶ ${label}  [展开]`)),
            this.outputPad,
            0,
          );
        } else {
          // 展开：标题行（含 [折叠] 按钮）+ 思考内容
          const header = new Text(
            fg("thinkingText", `▼ ${label}  [折叠]`),
            this.outputPad,
            0,
          );
          const body = new Markdown(
            thinkingBlocks.join("\n\n"),
            this.outputPad,
            0,
            this.markdownTheme,
            {
              color: (text: string) => fg("thinkingText", text),
              italic: true,
            },
            {
              transform: makeTransform(
                "assistant-thinking",
                this.isStreaming,
                this.markdownTransformers,
              ),
            },
          );
          const box = new Container();
          box.addChild(header);
          box.addChild(body);
          thinkingComponent = box;
        }

        // 点击整个 thinking 块（含按钮与正文）切换折叠
        this.contentContainer.addChild(
          new MouseRegion(thinkingComponent, (event: AnyObj) => {
            if (event.type !== "click" || event.button !== "left") return undefined;
            overrides.set(runIndex, !hidden);
            if (this.lastMessage) this.updateContent(this.lastMessage);
            return { handled: true };
          }),
        );

        if (hasVisibleContentAfter) {
          this.contentContainer.addChild(new Spacer(1));
        }
      }
    }

    // 结尾的截断 / 中止 / 错误提示（与 pi 原逻辑一致）
    const hasToolCalls = contents.some((c) => c.type === "toolCall");
    this.hasToolCalls = hasToolCalls;
    if (message?.stopReason === "length") {
      this.contentContainer.addChild(new Spacer(1));
      this.contentContainer.addChild(
        new Text(
          fg("error", "Response was truncated before completion."),
          this.outputPad,
          0,
        ),
      );
    } else if (!hasToolCalls) {
      if (message?.stopReason === "aborted") {
        const abortMessage =
          message.errorMessage && message.errorMessage !== "Request was aborted"
            ? message.errorMessage
            : "Operation aborted";
        this.contentContainer.addChild(new Spacer(1));
        this.contentContainer.addChild(
          new Text(fg("error", abortMessage), this.outputPad, 0),
        );
      } else if (message?.stopReason === "error") {
        const errorMsg = message.errorMessage || "Unknown error";
        this.contentContainer.addChild(new Spacer(1));
        this.contentContainer.addChild(
          new Text(fg("error", `Error: ${errorMsg}`), this.outputPad, 0),
        );
      }
    }
  };

  proto.__thinkingCollapsePatched = true;

  // 原型方法：切换本条消息 thinking 块的展开/折叠（键盘 toggle 复用）
  proto.toggleThinkingCollapse = function (this: AnyObj): "expanded" | "collapsed" | null {
    const content: AnyObj[] = Array.isArray(this.lastMessage?.content)
      ? this.lastMessage.content
      : [];
    const runs = getThinkingRuns(content);
    if (runs.length === 0) return null;
    const overrides: Map<number, boolean> =
      this.thinkingVisibilityOverrides ?? new Map<number, boolean>();
    this.thinkingVisibilityOverrides = overrides;
    // 当前折叠状态：有 override 按 override；无 override 按渲染默认
    // （streaming 默认展开，非 streaming 默认折叠）
    const isStreaming = !!this.isStreaming;
    const currentHidden = (r: number) =>
      overrides.has(r) ? overrides.get(r) === true : !isStreaming;
    const allCollapsed = runs.every((r) => currentHidden(r));
    const next = !allCollapsed;
    for (const r of runs) overrides.set(r, next);
    this.updateContent(this.lastMessage);
    return next ? "collapsed" : "expanded";
  };

  return true;
}

/** 跟踪 InteractiveMode：记录最近添加的 assistant 组件，供键盘 toggle 使用。 */
function patchChatTracking(): boolean {
  const proto = InteractiveMode?.prototype as AnyObj | undefined;
  if (!proto || typeof proto.addMessageToChat !== "function") {
    return false;
  }
  if (proto.__thinkingCollapseTrackChat === true) {
    return true;
  }
  const original = proto.addMessageToChat;
  proto.addMessageToChat = function (
    this: AnyObj,
    message: AnyObj,
    options?: AnyObj,
  ): void {
    original.call(this, message, options);
    lastModeInstance = this;
    if (message?.role === "assistant") {
      const children = this.chatContainer?.children ?? [];
      this.__lastAssistantComponent = children[children.length - 1];
    }
  };
  proto.__thinkingCollapseTrackChat = true;
  return true;
}

/** 统计消息中的 thinking run（与渲染逻辑一致：连续 thinking 合并为一个 run，空块不计）。 */
function getThinkingRuns(content: AnyObj[]): number[] {
  const runs: number[] = [];
  let runIndex = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i]?.type === "thinking") {
      const blocks: string[] = [];
      while (i < content.length && content[i]?.type === "thinking") {
        if (content[i].thinking?.trim()) blocks.push(content[i].thinking.trim());
        i++;
      }
      i--;
      if (blocks.length > 0) {
        runs.push(runIndex);
        runIndex++;
      }
    }
  }
  return runs;
}

/**
 * 切换最近消息（含 streaming 中的当前消息）thinking 块的折叠状态：
 * 全部折叠 → 全部展开；否则全部折叠。
 * 返回 "expanded" | "collapsed" | null（无可切换目标）。
 */
function toggleLatestThinking(): "expanded" | "collapsed" | null {
  const mode = lastModeInstance;
  const comp = mode?.streamingComponent ?? mode?.__lastAssistantComponent;
  if (!comp || typeof comp.toggleThinkingCollapse !== "function") return null;
  const result = comp.toggleThinkingCollapse();
  mode?.ui?.requestRender?.();
  return result;
}

export default function (pi: ExtensionAPI): void {
  const patched = patchAssistantMessageComponent();
  const tracked = patchChatTracking();

  pi.on("session_start", (_event, ctx) => {
    activeTheme = (ctx.ui as AnyObj).theme ?? null;
  });

  // 键盘兑底：不依赖鼠标，切换最近 thinking 块的展开/折叠（regular 模式可用）
  pi.registerShortcut("ctrl+shift+y", {
    description: "Toggle latest thinking block (expand/collapse)",
    handler: async (ctx) => {
      const result = toggleLatestThinking();
      if (result === null) {
        ctx.ui.notify("No thinking block to toggle", "info");
      }
    },
  });

  pi.registerCommand("thinking-fold", {
    description: "Show thinking-collapse plugin status",
    handler: async (_args, ctx) => {
      const isPatched = patched && tracked;
      ctx.ui.notify(
        isPatched
          ? "thinking-collapse: enabled（思考完成后自动折叠，点击块或按钮/ctrl+shift+y 展开折叠）"
          : "thinking-collapse: not patched（当前 pi 版本与插件不兼容）",
        "info",
      );
    },
  });
}
