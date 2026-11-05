# -*- coding: utf-8 -*-
"""
WPS SID 凭证管理：从临时文件读取/写入 wps_sid。

获取 cookie 的流程由 SKILL.md 中定义的 MCP Playwright 步骤完成，
本模块仅负责临时文件的读写，以及判断是否需要刷新。
"""
import json
import os
from pathlib import Path
from typing import Optional

_CACHE_DIR = Path(__file__).resolve().parent.parent
_CACHE_FILE = _CACHE_DIR / ".wps_sid_cache.json"


def _read_cache() -> dict:
    try:
        return json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _write_cache(data: dict) -> None:
    _CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_cached_sid() -> Optional[str]:
    """从临时文件或环境变量获取 wps_sid。优先级：环境变量 > 缓存文件。"""
    sid = os.environ.get("wps_sid") or os.environ.get("WPS_SID")
    if sid:
        return sid
    cache = _read_cache()
    return cache.get("wps_sid") or None


def save_sid(sid: str) -> None:
    """将 wps_sid 写入临时文件。"""
    _write_cache({"wps_sid": sid})


def clear_sid() -> None:
    """清除缓存的 wps_sid（鉴权失败时调用）。"""
    try:
        _CACHE_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def is_auth_error_response(resp: dict) -> bool:
    """判断 API JSON 响应是否为鉴权失败。"""
    code = resp.get("code")
    msg = str(resp.get("msg") or resp.get("message") or "")
    if code in (401, 403):
        return True
    if "csrfCheckFailed" in msg or "unauthorized" in msg.lower() or "forbidden" in msg.lower():
        return True
    return False


def is_auth_error_status(http_status: int) -> bool:
    """判断 HTTP 状态码是否为鉴权失败。"""
    return http_status in (401, 403)
