# -*- coding: utf-8 -*-
"""
会议域 V7 API 封装。
参考 apis-dev/spec/internal/meeting：会议创建/查询/列表、参会人管理。

约定：
- 入参时间统一使用 UTC ISO 8601 字符串（如 2026-03-02T08:00:00Z）
- 若 API 使用时间戳（秒/毫秒），则在客户端内做入参与出参的自动兼容
"""

from typing import Any, Iterable, Optional

from .base import WpsV7Client
from .time_util import iso_to_timestamp, response_timestamps_to_iso


def _normalize_resp(resp: Any) -> dict:
    """保持 {code, msg, data} 结构，仅对 data 做时间字段转换。"""
    if resp is None:
        return {}
    if not isinstance(resp, dict):
        return resp if isinstance(resp, dict) else {}
    out = dict(resp)
    if "data" in out and out["data"] is not None:
        out["data"] = response_timestamps_to_iso(out["data"])
    return out


def _build_participants(participant_ids: Optional[Iterable[str]], role: str = "attendee") -> Optional[list]:
    if not participant_ids:
        return None
    items = []
    for pid in participant_ids:
        if not pid:
            continue
        items.append({"role": role, "id": str(pid)})
    return items or None


def create_meeting(
    subject: str,
    start_time: str,
    end_time: str,
    participant_ids: Optional[Iterable[str]] = None,
    *,
    approval_required_to_join: Optional[bool] = None,
    allow_attendee_to_join: Optional[str] = None,
    attendee_mic_status: Optional[str] = None,
    attendee_camera_status: Optional[str] = None,
    generate_summary: Optional[bool] = None,
    allow_early_start: Optional[bool] = None,
    recurring: bool = False,
    recurring_rule: Optional[dict] = None,
    ext_attrs: Optional[list] = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    创建在线会议。POST /v7/meetings/create。
    start_time/end_time：建议带 Z（UTC）或 +08:00；无时区时按 UTC 解析，东8区用户易出现 8 小时偏差。
    """
    c = client or WpsV7Client()
    st = iso_to_timestamp(start_time)
    et = iso_to_timestamp(end_time)
    if not st or not et:
        raise ValueError("start_time 与 end_time 需为有效 ISO 8601（如 2026-03-02T08:00:00Z 或 2026-03-02T16:00:00+08:00）")
    if et <= st:
        raise ValueError("end_time 需晚于 start_time")

    booking = {"start_date_time": st, "end_date_time": et, "recurring": bool(recurring)}
    if recurring:
        if not recurring_rule or not isinstance(recurring_rule, dict):
            raise ValueError("recurring=true 时需提供 recurring_rule（dict）")
        booking["recurring_rule"] = recurring_rule

    settings = {}
    if approval_required_to_join is not None:
        settings["approval_required_to_join"] = bool(approval_required_to_join)
    if generate_summary is not None:
        settings["generate_summary"] = bool(generate_summary)
    if allow_early_start is not None:
        settings["allow_early_start"] = bool(allow_early_start)
    if allow_attendee_to_join is not None:
        settings["allow_attendee_to_join"] = allow_attendee_to_join
    if attendee_mic_status is not None:
        settings["attendee_mic_status"] = attendee_mic_status
    if attendee_camera_status is not None:
        settings["attendee_camera_status"] = attendee_camera_status

    body = {"subject": subject, "booking": booking}
    participants = _build_participants(participant_ids)
    if participants is not None:
        body["participants"] = participants
    if settings:
        body["settings"] = settings
    if ext_attrs is not None:
        body["ext_attrs"] = ext_attrs

    resp = c.post("/v7/meetings/create", json=body)
    return _normalize_resp(resp)


def update_meeting(
    meeting_id: str,
    *,
    subject: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    recurring: bool = False,
    recurring_rule: Optional[dict] = None,
    approval_required_to_join: Optional[bool] = None,
    allow_attendee_to_join: Optional[str] = None,
    attendee_mic_status: Optional[str] = None,
    attendee_camera_status: Optional[str] = None,
    generate_summary: Optional[bool] = None,
    allow_early_start: Optional[bool] = None,
    ext_attrs: Optional[list] = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """修改在线会议。POST /v7/meetings/{meeting_id}/update。"""
    c = client or WpsV7Client()
    body: dict = {}

    if subject is not None:
        body["subject"] = subject

    if (start_time is None) ^ (end_time is None):
        raise ValueError("修改时间需同时提供 start_time 与 end_time")
    if start_time is not None and end_time is not None:
        st = iso_to_timestamp(start_time)
        et = iso_to_timestamp(end_time)
        if not st or not et:
            raise ValueError("start_time 与 end_time 需为有效 ISO 8601（建议带 Z 或 +08:00）")
        if et <= st:
            raise ValueError("end_time 需晚于 start_time")
        booking = {"start_date_time": st, "end_date_time": et, "recurring": bool(recurring)}
        if recurring:
            if not recurring_rule or not isinstance(recurring_rule, dict):
                raise ValueError("recurring=true 时需提供 recurring_rule（dict）")
            booking["recurring_rule"] = recurring_rule
        body["booking"] = booking

    settings = {}
    if approval_required_to_join is not None:
        settings["approval_required_to_join"] = bool(approval_required_to_join)
    if generate_summary is not None:
        settings["generate_summary"] = bool(generate_summary)
    if allow_early_start is not None:
        settings["allow_early_start"] = bool(allow_early_start)
    if allow_attendee_to_join is not None:
        settings["allow_attendee_to_join"] = allow_attendee_to_join
    if attendee_mic_status is not None:
        settings["attendee_mic_status"] = attendee_mic_status
    if attendee_camera_status is not None:
        settings["attendee_camera_status"] = attendee_camera_status
    if settings:
        body["settings"] = settings

    if ext_attrs is not None:
        body["ext_attrs"] = ext_attrs

    if not body:
        raise ValueError("请至少指定一个可修改字段（如 subject 或 start_time/end_time 或 settings）")

    resp = c.post(f"/v7/meetings/{meeting_id}/update", json=body)
    return _normalize_resp(resp)


def delete_meeting(meeting_id: str, client: Optional[WpsV7Client] = None) -> dict:
    """取消会议。POST /v7/meetings/{meeting_id}/delete。"""
    c = client or WpsV7Client()
    resp = c.post(f"/v7/meetings/{meeting_id}/delete")
    return _normalize_resp(resp)


def get_meeting(meeting_id: str, client: Optional[WpsV7Client] = None) -> dict:
    """获取会议信息。GET /v7/meetings/{meeting_id}。"""
    c = client or WpsV7Client()
    resp = c.get(f"/v7/meetings/{meeting_id}")
    return _normalize_resp(resp)


def list_meetings(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """获取会议列表。GET /v7/meetings。"""
    c = client or WpsV7Client()
    params = {}
    if (start_time is None) ^ (end_time is None):
        raise ValueError("查询列表需同时提供 start_time 与 end_time，或都不提供")
    if start_time is not None and end_time is not None:
        st = iso_to_timestamp(start_time)
        et = iso_to_timestamp(end_time)
        if not st or not et:
            raise ValueError("start_time 与 end_time 需为有效 ISO 8601（建议带 Z 或 +08:00）")
        params["start_date_time"] = st
        params["end_date_time"] = et
    resp = c.get("/v7/meetings", params=params or None)
    return _normalize_resp(resp)


def list_meeting_participants(
    meeting_id: str,
    page_token: Optional[str] = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """获取会议邀请成员列表。GET /v7/meetings/{meeting_id}/participants。"""
    c = client or WpsV7Client()
    params = {"page_token": page_token} if page_token else None
    resp = c.get(f"/v7/meetings/{meeting_id}/participants", params=params)
    return _normalize_resp(resp)


def put_meeting_participants(
    meeting_id: str,
    participant_ids: Iterable[str],
    *,
    role: str = "attendee",
    client: Optional[WpsV7Client] = None,
) -> dict:
    """添加会议邀请成员。POST /v7/meetings/{meeting_id}/participants/put。"""
    c = client or WpsV7Client()
    items = _build_participants(participant_ids, role=role) or []
    body = {"items": items}
    resp = c.post(f"/v7/meetings/{meeting_id}/participants/put", json=body)
    return _normalize_resp(resp)


def delete_meeting_participants(
    meeting_id: str,
    participant_ids: Iterable[str],
    client: Optional[WpsV7Client] = None,
) -> dict:
    """移除会议邀请成员。POST /v7/meetings/{meeting_id}/participants/delete。"""
    c = client or WpsV7Client()
    ids = [str(x) for x in participant_ids if x]
    body = {"items": ids}
    resp = c.post(f"/v7/meetings/{meeting_id}/participants/delete", json=body)
    return _normalize_resp(resp)

