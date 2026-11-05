#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云文档 Drive：调用 V7 Drive 接口，实现文件上传、列表、详情等功能。
需在 wpsv7-skill 根目录执行，并设置环境变量 wps_sid。
用法:
  python skills/drive/run.py upload <文件路径>
  python skills/drive/run.py list
  python skills/drive/run.py get <file_id>
  python skills/drive/run.py extract <file_id|link_id> [--format plain|markdown]
"""
import argparse
import json
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

_root = Path(__file__).resolve().parent.parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from wpsv7client import (
    upload_simple,
    list_files,
    get_file,
    get_link_meta,
    get_file_download_url,
    get_file_content_extract,
    create_otl_document,
    write_airpage_content,
    search_files,
    WpsV7Client,
)


def _out(md_lines, data):
    lines = [""] + md_lines + ["", "## 原始数据 (JSON)", "", "```json", json.dumps(data, ensure_ascii=False, indent=2), "```"]
    print("\n".join(lines))
    sys.stdout.flush()


def _err(msg):
    print("## 错误\n\n" + msg, file=sys.stderr)
    sys.exit(1)


def _check_resp(resp):
    if resp.get("code") != 0:
        _err(resp.get("msg") or resp.get("message") or "未知错误")
    d = resp.get("data")
    return d if d is not None else {}


def _get_drive_id(drive_name):
    """将drive名称转换为实际的drive ID"""
    if drive_name in ["private", "roaming", "special"]:
        # 获取实际的drive ID
        c = WpsV7Client()
        resp = c.get("/v7/drives?allotee_type=user&page_size=10")
        if resp.get("code") != 0:
            _err(f"获取云盘列表失败: {resp.get('msg')}")
        
        items = resp.get("data", {}).get("items", [])
        for item in items:
            if drive_name == "private" and item.get("name") == "我的企业文档":
                return item.get("id")
            elif drive_name == "roaming" and item.get("name") == "自动备份":
                return item.get("id")
            elif drive_name == "special" and item.get("source") == "special":
                return item.get("id")
        
        # 如果没有找到，返回第一个drive
        if items:
            return items[0].get("id")
        
        _err(f"未找到云盘: {drive_name}")
    else:
        # 已经是实际的drive ID
        return drive_name


def _resolve_file_and_drive(id_or_link_id, default_drive="private"):
    """
    将 file_id 或 link_id 解析为 (file_id, drive_id)。
    若传入的是 link_id，则调用 GET /v7/links/{link_id}/meta 取 file_id/drive_id；否则视为 file_id，drive 用默认值。
    """
    raw = (id_or_link_id or "").strip()
    if not raw:
        return None, None
    resp = get_link_meta(link_id=raw)
    if resp.get("code") == 0 and resp.get("data"):
        data = resp["data"]
        if data.get("file_id"):
            did = data.get("drive_id")
            if did is None or did == "":
                did = _get_drive_id(default_drive)
            else:
                did = str(did)
            return data["file_id"], did
    # 视为 file_id
    return raw, _get_drive_id(default_drive)


def _is_single_md_file(file_path):
    """判断是否为单个 .md 文件（不区分大小写）。"""
    p = Path(file_path)
    return p.is_file() and p.suffix.lower() == ".md"


def _parent_path_list(s):
    """将 '我的文档' 或 '我的文档/子目录' 转为 ['我的文档'] 或 ['我的文档','子目录']。"""
    if not (s or "").strip():
        return ["我的文档"]
    return [p.strip() for p in s.strip().split("/") if p.strip()] or ["我的文档"]


def _upload_md_as_airpage(file_path, args):
    """将 .md 文件上传为智能文档（.otl）：创建文档并写入内容（365 内容 API）。"""
    p = Path(file_path)
    content = p.read_text(encoding="utf-8", errors="replace")
    title = (getattr(args, "filename", None) or "").strip() or (p.stem or "文档")
    drive_id = _get_drive_id(args.drive or "private")
    parent_path = _parent_path_list(args.path or "我的文档")

    create_resp = create_otl_document(
        drive_id=drive_id,
        file_name=title,
        parent_path=parent_path,
        on_name_conflict="rename",
    )
    data = _check_resp(create_resp)
    file_id = (data or {}).get("id")
    if not file_id:
        _err("创建智能文档失败：未返回文件 id")

    write_airpage_content(file_id, title, content, pos="begin")
    link_url = (data or {}).get("link_url") or ""
    link_id = (data or {}).get("link_id") or ""

    md = [
        "## 已上传为智能文档",
        "",
        f"已将 Markdown 写入智能文档 **{title}**。",
        "",
        f"- **文件 ID**：`{file_id}`",
        f"- **链接**：{link_url}",
    ]
    if link_id:
        md.append("")
        md.append("发送云文档消息所需信息：")
        md.append("```json")
        md.append(f'{{"type": "cloud", "cloud": {{"id": "{link_id}", "link_url": "{link_url}", "link_id": "{link_id}"}}}}')
        md.append("```")
    _out(md, {"success": True, "file_id": file_id, "title": title, "link_url": link_url, "link_id": link_id})


def cmd_upload(args):
    if not args.file_path:
        _err("请指定文件路径，例如: run.py upload /path/to/file.md")
    
    file_path = args.file_path
    if not os.path.isabs(file_path):
        file_path = os.path.join(os.getcwd(), file_path)
    
    if not os.path.exists(file_path):
        _err(f"文件不存在: {file_path}")
    
    # 单文件为 .md 时，上传为智能文档（.otl）
    if _is_single_md_file(file_path):
        _upload_md_as_airpage(file_path, args)
        return
    
    try:
        # 获取实际的drive ID
        drive_id = _get_drive_id(args.drive or "private")
        
        data = upload_simple(
            file_path=file_path,
            drive_id=drive_id,
            parent_id=args.parent or "root",
            parent_path=args.path.split("/") if args.path else None,
            file_name=getattr(args, "filename", None),
        )
    except Exception as e:
        _err(f"上传失败: {str(e)}")
    
    # 处理响应格式：文件信息可能在data.data中，或在data.file中
    if "data" in data:
        # upload_simple返回完整响应，文件信息在data.data中
        file_data = data.get("data", {})
        if "file" in file_data:
            file_info = file_data.get("file", {})
        else:
            file_info = file_data
    elif "file" in data:
        file_info = data.get("file", {})
    else:
        file_info = data
    
    md = ["## 文件上传成功", "", f"文件已上传至云端：", "",
          f"- **文件名**: {file_info.get('name', '-')}",
          f"- **文件ID**: `{file_info.get('id', '-')}`",
          f"- **链接**: {file_info.get('link_url', '-')}",
          f"- **大小**: {file_info.get('size', '-')} 字节",
          "",
          f"发送云文档消息所需信息：",
          f"```json",
          f'{{"type": "cloud", "cloud": {{"id": "{file_info.get("id", "")}", "link_url": "{file_info.get("link_url", "")}", "link_id": "{file_info.get("link_id", "")}"}}}}',
          f"```"]
    _out(md, data)


def cmd_list(args):
    # 获取实际的drive ID
    drive_id = _get_drive_id(args.drive or "private")

    all_items = []
    page_token = (getattr(args, "page_token", None) or "").strip() or None
    last_data = {}

    while True:
        resp = list_files(
            drive_id=drive_id,
            parent_id=args.parent or "root",
            page_size=args.page_size or 50,
            page_token=page_token,
        )
        data = _check_resp(resp)
        last_data = data or {}

        items = (data or {}).get("items") or []
        all_items.extend(items)

        next_token = (data or {}).get("next_page_token") or ""
        if not getattr(args, "all", False) or not next_token:
            page_token = next_token or ""
            break
        page_token = next_token

    md = ["## 文件列表", "", f"当前目录共有 **{len(all_items)}** 个文件/文件夹。"]
    if not all_items:
        md.append("")
        md.append("目录为空。")
    else:
        md.append("")
        for i, item in enumerate(all_items, 1):
            item_type = "📁 文件夹" if item.get("type") == "folder" else "📄 文件"
            name = item.get("name", "-")
            file_id = item.get("id", "-")
            size = item.get("size", "-")
            md.append(f"{i}. {item_type} **{name}**")
            md.append(f"   > ID: `{file_id}` | 大小: {size} 字节")

    if (last_data or {}).get("next_page_token") and not getattr(args, "all", False):
        md.append("")
        md.append(f"> 还有更多条目，可使用 `list --page-token {last_data.get('next_page_token')}` 获取下一页，或使用 `list --all` 拉取全部。")

    out_data = dict(last_data or {})
    out_data["items"] = all_items
    _out(md, out_data)


def cmd_get(args):
    if not args.file_id:
        _err("请指定文件ID或 link_id，例如: run.py get <file_id|link_id>")
    file_id, drive_id = _resolve_file_and_drive(args.file_id, args.drive or "private")
    if not file_id:
        _err("无法解析 file_id")
    resp = get_file(
        drive_id=drive_id,
        file_id=file_id,
    )
    data = _check_resp(resp)
    md = ["## 文件详情", "",
          f"- **文件名**: {data.get('name', '-')}",
          f"- **文件ID**: `{data.get('id', '-')}`",
          f"- **链接**: {data.get('link_url', '-')}",
          f"- **大小**: {data.get('size', '-')} 字节",
          f"- **类型**: {data.get('type', '-')}"]
    _out(md, data)


def cmd_download(args):
    if not args.file_id:
        _err("请指定文件ID或 link_id，例如: run.py download <file_id|link_id>")
    file_id, drive_id = _resolve_file_and_drive(args.file_id, args.drive or "private")
    if not file_id:
        _err("无法解析 file_id")
    resp = get_file_download_url(
        drive_id=drive_id,
        file_id=file_id,
    )
    data = _check_resp(resp)
    md = ["## 文件下载链接", "",
          f"- **文件名**: {data.get('name', '-')}",
          f"- **下载链接**: {data.get('url', '-')}"]
    _out(md, data)


def cmd_extract(args):
    """按云文档 file 抽取正文（纯文/ markdown），走 internal GET .../content。"""
    if not getattr(args, "file_id", None):
        _err("请指定文件ID或 link_id，例如: run.py extract <file_id|link_id>")
    file_id, drive_id = _resolve_file_and_drive(
        args.file_id, getattr(args, "drive", None) or "private"
    )
    if not file_id:
        _err("无法解析 file_id")
    fmt = (getattr(args, "format", None) or "plain").strip().lower()
    if fmt not in ("plain", "markdown", "html", "kdc"):
        fmt = "plain"
    resp = get_file_content_extract(
        drive_id=drive_id,
        file_id=file_id,
        format=fmt,
    )
    data = _check_resp(resp)
    content = (data.get("plain") or data.get("markdown") or data.get("html") or "").strip()
    md = ["## 文档内容抽取", "", f"- **格式**: {fmt}", "", "### 抽取结果", ""]
    if content:
        md.append("```" + ("md" if fmt == "markdown" else ""))
        md.append(content)
        md.append("```")
    else:
        md.append("(无正文)")
    _out(md, data)


def cmd_link_meta(args):
    """根据 link_id 获取分享链接信息（含 file_id），用于 link_id 换 file_id。"""
    if not args.link_id:
        _err("请指定 link_id，例如: run.py link-meta <link_id>")
    resp = get_link_meta(link_id=args.link_id)
    data = _check_resp(resp)
    file_id = data.get("file_id") or "-"
    drive_id = data.get("drive_id") or "-"
    link_url = data.get("url") or data.get("link_url") or "-"
    md = [
        "## 分享链接详情（link_id → file_id）",
        "",
        f"- **link_id**: `{args.link_id}`",
        f"- **file_id**: `{file_id}`",
        f"- **drive_id**: `{drive_id}`",
        f"- **链接**: {link_url}",
    ]
    if file_id != "-":
        md.extend([
            "",
            "> 可使用上述 **file_id** 与 **drive_id** 调用 `get <file_id>` 或 `download <file_id>`（需指定 `--drive <drive_id>`）。",
        ])
    _out(md, data)


def cmd_search(args):
    """搜索云文档文件（简化版，便于 LLM 使用）。GET /v7/files/search。"""
    keyword = (getattr(args, "keyword", None) or "").strip() or None
    scope = getattr(args, "scope", None)
    if scope and isinstance(scope, str):
        scope = [s.strip() for s in scope.split(",") if s.strip()] or None
    resp = search_files(
        keyword=keyword,
        search_type=args.type or "all",
        scope=scope,
        page_size=args.page_size or 20,
        page_token=(getattr(args, "page_token", None) or "").strip() or None,
        with_total=not getattr(args, "no_total", False),
        with_link=True,
    )
    data = _check_resp(resp)
    items = (data or {}).get("items") or []
    total = (data or {}).get("total")
    next_token = (data or {}).get("next_page_token") or ""

    md = ["## 文件搜索结果", ""]
    if keyword:
        md.append(f"关键词：**{keyword}**")
    md.append(f"本页共 **{len(items)}** 条" + (f"，共 **{total}** 条" if total is not None else "") + "。")
    md.append("")
    for i, item in enumerate(items, 1):
        fi = (item.get("file") or item) if isinstance(item, dict) else {}
        name = fi.get("name", "-")
        file_id = fi.get("id", "-")
        size = fi.get("size", "-")
        link_url = fi.get("link_url", "")
        md.append(f"{i}. **{name}**")
        md.append(f"   > ID: `{file_id}` | 大小: {size}" + (f" | [链接]({link_url})" if link_url else ""))
    if next_token:
        md.append("")
        md.append(f"> 更多结果可使用 `search --page-token {next_token}` 获取下一页。")
    _out(md, data if data is not None else resp)


def main():
    parser = argparse.ArgumentParser(description="云文档 Drive（V7）")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("upload", help="上传文件到云端")
    p.add_argument("file_path", nargs="?", default=None, help="本地文件路径")
    p.add_argument("--filename", "-n", default=None, help="云端文件名（默认与本地文件相同）")
    p.add_argument("--drive", "-d", default="private", help="云盘ID: private(我的云文档), roaming(漫游箱)，默认 private")
    p.add_argument("--parent", "-p", default="root", help="父目录ID，默认 root")
    p.add_argument("--path", default=None, help="目标路径，如 'folder1/folder2'")
    p.set_defaults(func=cmd_upload)

    p = sub.add_parser("list", help="获取文件列表")
    p.add_argument("--drive", "-d", default="private", help="云盘ID，默认 private")
    p.add_argument("--parent", "-p", default="root", help="父目录ID，默认 root")
    p.add_argument("--page-size", "-s", type=int, default=50, help="分页大小，默认50")
    p.add_argument("--page-token", default=None, help="分页 token（从上一次返回的 next_page_token 获取）")
    p.add_argument("--all", action="store_true", help="拉取全部分页（会循环请求直到 next_page_token 为空）")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("get", help="获取文件详情（支持 file_id 或 link_id）")
    p.add_argument("file_id", nargs="?", default=None, help="文件ID 或 link_id")
    p.add_argument("--drive", "-d", default="private", help="云盘ID（仅当传入为 file_id 时生效），默认 private")
    p.set_defaults(func=cmd_get)

    p = sub.add_parser("download", help="获取文件下载链接（支持 file_id 或 link_id）")
    p.add_argument("file_id", nargs="?", default=None, help="文件ID 或 link_id")
    p.add_argument("--drive", "-d", default="private", help="云盘ID，默认 private")
    p.set_defaults(func=cmd_download)

    p = sub.add_parser("extract", help="按云文档抽取正文（plain/markdown），internal GET .../content")
    p.add_argument("file_id", nargs="?", default=None, help="文件ID 或 link_id")
    p.add_argument("--drive", "-d", default="private", help="云盘ID，默认 private")
    p.add_argument("--format", "-f", default="markdown", choices=("plain", "markdown", "html", "kdc"), help="输出格式，默认 plain")
    p.set_defaults(func=cmd_extract)

    p = sub.add_parser("link-meta", help="根据 link_id 获取分享链接信息（含 file_id），用于 link_id 换 file_id")
    p.add_argument("link_id", nargs="?", default=None, help="分享链接 ID（如云文档消息中的 link_id）")
    p.set_defaults(func=cmd_link_meta)

    p = sub.add_parser("search", help="搜索云文档文件（简化版，便于 LLM 使用）")
    p.add_argument("keyword", nargs="?", default=None, help="搜索关键词")
    p.add_argument("--type", "-t", default="all", choices=("file_name", "content", "all"), help="搜索类型：文件名/正文/全部，默认 all")
    p.add_argument("--scope", "-s", default=None, help="搜索范围，逗号分隔：all, personal_drive, group_drive, latest, share_by_me, share_to_me, recycle")
    p.add_argument("--page-size", type=int, default=20, help="每页条数，默认 20")
    p.add_argument("--page-token", default=None, help="分页 token（上一页返回的 next_page_token）")
    p.add_argument("--no-total", action="store_true", dest="no_total", help="不返回总条数")
    p.set_defaults(func=cmd_search)

    args = parser.parse_args()
    try:
        args.func(args)
    except ValueError as e:
        _err(str(e))
    except Exception as e:
        _err("请求失败: " + str(e))


if __name__ == "__main__":
    main()
