# -*- coding: utf-8 -*-
"""
WPS V7 客户端基类。
凭证获取优先级：构造参数 sid > 环境变量 wps_sid/WPS_SID > 临时缓存文件。
缓存文件由 MCP Playwright 获取 cookie 后写入（详见 SKILL.md）。
请求遇到鉴权失败时自动清除缓存，脚本以特定退出码(EXIT_CODE_AUTH=10)退出，
SKILL.md 流程据此触发 MCP 重新获取 cookie。
"""
import json as _json
import os
import sys
from typing import Optional

import requests

from .auth import get_cached_sid, clear_sid, is_auth_error_response, is_auth_error_status

EXIT_CODE_AUTH = 10


class WpsV7Client:
    """V7 API 统一客户端，自动从缓存获取 wps_sid。"""

    def __init__(self, base_url: Optional[str] = None, sid: Optional[str] = None):
        self.base_url = (base_url or os.environ.get("WPS_API_BASE") or "https://api.wps.cn").rstrip("/")
        self.sid = sid or get_cached_sid()
        self._session = requests.Session()

    def _headers(self, content_type: str = "application/json") -> dict:
        if not self.sid:
            raise ValueError(
                "缺少用户凭证: 未找到 wps_sid。"
                "请通过 MCP Playwright 获取 cookie（详见 SKILL.md 认证流程），"
                "或设置环境变量 WPS_SID。"
            )
        return {
            "Content-Type": content_type,
            "Origin": "https://365.kdocs.cn",
            "Referer": "https://365.kdocs.cn/woa/im/messages",
            "cookie": f"wps_sid={self.sid}; csrf={self.sid}",
        }

    def _exit_auth(self, detail: str = "") -> None:
        """清除缓存并以 EXIT_CODE_AUTH 退出，触发 SKILL.md 重新获取 cookie。"""
        clear_sid()
        msg = "## 鉴权失败\n\nwps_sid 已失效，已清除本地缓存。\n"
        if detail:
            msg += f"原因: {detail}\n"
        msg += "请通过 MCP Playwright 重新获取 cookie（详见 SKILL.md 认证流程）。"
        print(msg, file=sys.stderr)
        sys.exit(EXIT_CODE_AUTH)

    def _check_response(self, resp: requests.Response) -> dict:
        """统一处理响应：先检查 HTTP 状态码，再检查 JSON body 中的鉴权错误。"""
        if is_auth_error_status(resp.status_code):
            self._exit_auth(f"HTTP {resp.status_code}")

        if not resp.content:
            return {}
        try:
            result = resp.json()
        except (ValueError, _json.JSONDecodeError):
            return {"code": -1, "msg": "response is not json", "text": (resp.text or "")[:500]}

        if is_auth_error_response(result):
            self._exit_auth(result.get("msg") or result.get("message") or "")
        return result

    def get(self, path: str, params: Optional[dict] = None, **kwargs) -> dict:
        """GET 请求，path 为相对路径，如 /v7/users/current。"""
        url = f"{self.base_url}{path}"
        resp = self._session.get(url, headers=self._headers(), params=params, timeout=30, **kwargs)
        return self._check_response(resp)

    def post(self, path: str, json: Optional[dict] = None, **kwargs) -> dict:
        """POST 请求。"""
        url = f"{self.base_url}{path}"
        resp = self._session.post(url, headers=self._headers(), json=json, timeout=30, **kwargs)
        return self._check_response(resp)
