# -*- coding: utf-8 -*-
"""
WPS V7 统一客户端，供各 SKILL 复用。
认证仅支持环境变量 wps_sid（或 WPS_SID）。
时间参数统一为 UTC ISO 8601，与 API 时间戳在客户端内自动转换。
"""
from .base import WpsV7Client, EXIT_CODE_AUTH
from .auth import get_cached_sid, save_sid, clear_sid, is_auth_error_response, is_auth_error_status
from .calendar import (
    list_calendars,
    get_calendar,
    create_calendar,
    update_calendar,
    delete_calendar,
    list_events,
    get_event,
    list_free_busy,
    create_event,
    update_event,
    delete_event,
    batch_create_event_attendees,
    batch_delete_event_attendees,
)
from .time_util import (
    response_timestamps_to_iso,
    timestamp_to_iso_utc,
    iso_to_timestamp,
    iso_to_calendar_time,
)
from .users import get_current_user
from .contacts import search_users
from .meeting import (
    create_meeting,
    update_meeting,
    delete_meeting,
    get_meeting,
    list_meetings,
    list_meeting_participants,
    put_meeting_participants,
    delete_meeting_participants,
)
from .im import (
    get_chat_list,
    get_chat,
    list_chat_messages,
    send_message,
    recall_message,
    list_recent_chats,
    search_chats,
    search_messages,
    send_cloud_file,
)
from .drive import (
    upload_simple,
    list_files,
    get_file,
    get_link_meta,
    get_file_download_url,
    get_file_content,
    get_file_content_extract,
    get_drive_id,
    create_otl_document,
    search_files,
)
from .airpage import write_airpage_content

__all__ = [
    "WpsV7Client",
    "EXIT_CODE_AUTH",
    "get_cached_sid",
    "save_sid",
    "clear_sid",
    "is_auth_error_response",
    "is_auth_error_status",
    "get_current_user",
    "search_users",
    "list_calendars",
    "get_calendar",
    "create_calendar",
    "update_calendar",
    "delete_calendar",
    "list_events",
    "get_event",
    "list_free_busy",
    "create_event",
    "update_event",
    "delete_event",
    "batch_create_event_attendees",
    "batch_delete_event_attendees",
    "create_meeting",
    "update_meeting",
    "delete_meeting",
    "get_meeting",
    "list_meetings",
    "list_meeting_participants",
    "put_meeting_participants",
    "delete_meeting_participants",
    "get_chat_list",
    "get_chat",
    "list_chat_messages",
    "send_message",
    "recall_message",
    "list_recent_chats",
    "search_chats",
    "search_messages",
    "send_cloud_file",
    "upload_simple",
    "list_files",
    "get_file",
    "get_link_meta",
    "get_file_download_url",
    "get_file_content",
    "get_file_content_extract",
    "get_drive_id",
    "create_otl_document",
    "search_files",
    "write_airpage_content",
    "timestamp_to_iso_utc",
    "iso_to_timestamp",
    "iso_to_calendar_time",
    "response_timestamps_to_iso",
]
