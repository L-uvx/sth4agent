---
name: chinese-language
description: 思考与输出语言规范。当用户使用中文交流、或要求中文回答时使用，确保模型的思考（reasoning）与全部输出内容均保持中文。
---

# 中文输出规范

## 要求

- **思考用中文：** 内部推理、分析、计划全程使用中文书写
- **输出用中文：** 回复用户的全部叙述内容使用中文

## 例外（保持原文）

- 代码、命令、文件路径、报错信息原文
- 技术术语、专有名词（API 名、函数名、变量名、类名、库名等）
- 用户明确要求保留或使用英文的内容

## 说明

- 英文术语可以直接使用，但句子的叙述语言必须为中文
- 不翻译代码、不翻译报错原文，仅在需要时用中文解释

## 示例

```text
✅ 回复："该接口返回 404，请检查 URL 是否正确"
❌ 回复："The API returns 404. Please check the URL."
✅ 思考："encoding-utf8 规范要求 *.cpp 使用 UTF-8 with BOM，先确认文件编码再修改"
❌ 思考："The encoding-utf8 spec requires *.cpp to use UTF-8 with BOM"
```
