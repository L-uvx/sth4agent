---
name: encoding-utf8
description: 源文件与 CMake 文件编码规范（UTF-8 / UTF-8 BOM）。当新建或修改 *.cpp、*.h、CMakeLists.txt，或遇到乱码、编码问题、GBK、BOM 相关情况时使用。
---

# 文件编码规范

## 要求

| 文件类型 | 编码 |
|---|---|
| `*.cpp` / `*.h` | **UTF-8 with BOM** |
| `CMakeLists.txt` | **UTF-8**（无 BOM） |

## 操作约定

- 新建或改写上述文件时，按对应编码保存，不要混用 GBK / UTF-16 等。
- 发现 `.cpp` / `.h` 缺少 BOM，或 `CMakeLists.txt` 带 BOM / 非 UTF-8 时，应纠正后再继续改动。
- 不要为满足编码而改动无关内容（仅修正编码或必要的文件头）。

## 示例

```text
✅ mainwindow.cpp / mainwindow.h  → UTF-8 with BOM
✅ CMakeLists.txt                 → UTF-8 (no BOM)
❌ mainwindow.cpp                 → UTF-8 without BOM / GBK
❌ CMakeLists.txt                 → UTF-8 with BOM / GBK
```
