# -*- coding: utf-8 -*-
"""
Drive V7 API 封装。
云文档（Drive）相关接口：文件上传、列表、详情、创建 .otl 智能文档等。
"""
import hashlib
import os
from typing import Any, List, Optional

from .base import WpsV7Client
from .time_util import response_timestamps_to_iso


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


def request_upload(
    drive_id: str = "private",
    parent_id: str = "root",
    file_path: str = None,
    file_name: str = None,
    size: int = None,
    parent_path: list = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    请求文件上传地址。
    POST /v7/drives/{drive_id}/files/{parent_id}/request_upload
    drive_id: 云盘ID，private（我的云文档）、roaming（漫游箱）
    parent_id: 父目录ID，root表示根目录
    file_path: 本地文件路径（可选，若提供则自动计算size和name）
    file_name: 文件名（若file_path为空则必填）
    size: 文件大小（若file_path为空则必填）
    parent_path: 相对于父目录的路径，如 ["folder1", "folder2"]
    """
    c = client or WpsV7Client()
    
    # 将'root'转换为'0'
    if parent_id == 'root':
        parent_id = '0'
    
    if file_path and os.path.exists(file_path):
        file_size = os.path.getsize(file_path)
        file_name = file_name or os.path.basename(file_path)
        size = file_size
        
        # Calculate SHA256 hash
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        file_hash = sha256_hash.hexdigest()
    
    if not file_name or not size:
        raise ValueError("file_name 和 size 不能为空")
    
    body = {
        "name": file_name,
        "size": size,
        "mode": "sequential",  # Required parameter discovered in testing
    }
    
    if parent_path:
        body["parent_path"] = parent_path
    
    # Add hash if calculated - 使用'sum'而不是'value'（根据成功案例）
    if 'file_hash' in locals():
        body["hashes"] = [{"type": "sha256", "sum": file_hash}]
    
    resp = c.post(f"/v7/drives/{drive_id}/files/{parent_id}/request_upload", json=body)
    return _normalize_resp(resp)


def upload_file(
    upload_url: str,
    file_path: str,
    method: str = "PUT",
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    上传文件到获取的URL。
    upload_url: request_upload返回的上传地址
    file_path: 本地文件路径
    method: 上传方法，PUT或POST
    """
    if not os.path.exists(file_path):
        raise ValueError(f"文件不存在: {file_path}")
    
    with open(file_path, "rb") as f:
        file_data = f.read()
    
    c = client or WpsV7Client()
    
    # 上传文件需要特定的头
    headers = {
        "Content-Type": "application/octet-stream",
        "Origin": "https://365.kdocs.cn",
        "Referer": "https://365.kdocs.cn/woa/im/messages",
        "cookie": f"wps_sid={c.sid}; csrf={c.sid}",
    }
    
    if method == "POST":
        resp = c._session.post(upload_url, data=file_data, headers=headers)
    else:
        resp = c._session.put(upload_url, data=file_data, headers=headers)
    
    return {"status_code": resp.status_code, "response_text": resp.text[:200] if resp.text else ""}


def upload_chunk(
    upload_url: str,
    file_path: str,
    chunk_size: int = 5 * 1024 * 1024,  # 5MB chunks
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    上传文件分块到指定的URL。
    upload_url: request_upload返回的上传地址
    file_path: 本地文件路径
    chunk_size: 分块大小，默认5MB
    """
    if not os.path.exists(file_path):
        raise ValueError(f"文件不存在: {file_path}")
    
    c = client or WpsV7Client()
    file_size = os.path.getsize(file_path)
    
    with open(file_path, "rb") as f:
        chunk_number = 1
        while True:
            chunk_data = f.read(chunk_size)
            if not chunk_data:
                break
                
            # Upload chunk - 需要认证头
            headers = {
                "Content-Type": "application/octet-stream",
                "Content-Length": str(len(chunk_data)),
                "Origin": "https://365.kdocs.cn",
                "Referer": "https://365.kdocs.cn/woa/im/messages",
                "cookie": f"wps_sid={c.sid}; csrf={c.sid}",
            }
            
            resp = c._session.put(upload_url, data=chunk_data, headers=headers)
            
            if resp.status_code != 200:
                return {
                    "status_code": resp.status_code,
                    "error": f"上传分块 {chunk_number} 失败",
                    "response": resp.text
                }
            
            chunk_number += 1
    
    return {"status_code": 200, "chunks_uploaded": chunk_number - 1}


def commit_upload(
    drive_id: str,
    parent_id: str,
    upload_id: str,
    file_name: str,
    size: int,
    store_request_keys: dict = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    确认文件上传完成。
    POST /v7/drives/{drive_id}/files/{parent_id}/commit_upload
    drive_id: 云盘ID
    parent_id: 父目录ID
    upload_id: request_upload返回的upload_id
    file_name: 文件名
    size: 文件大小
    store_request_keys: request_upload返回的store_request中的key信息
    """
    c = client or WpsV7Client()
    
    # 将'root'转换为'0'
    if parent_id == 'root':
        parent_id = '0'
    
    body = {
        "upload_id": upload_id,
        "file_name": file_name,
        "size": size,
    }
    
    if store_request_keys:
        body["file"] = store_request_keys
    
    resp = c.post(f"/v7/drives/{drive_id}/files/{parent_id}/commit_upload", json=body)
    return _normalize_resp(resp)


def upload_simple(
    file_path: str,
    drive_id: str = "private",
    parent_id: str = "root",
    parent_path: list = None,
    file_name: Optional[str] = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    简单上传文件到云端（单步上传）。
    自动完成请求地址、上传、确认三步。
    file_path: 本地文件路径
    drive_id: 云盘ID，private（我的云文档）、roaming（漫游箱）
    parent_id: 父目录ID，root表示根目录
    parent_path: 相对于父目录的路径
    file_name: 云端文件名，默认与本地文件名相同
    返回：云文档信息 {id, link_url, link_id}
    """
    if not os.path.exists(file_path):
        raise ValueError(f"文件不存在: {file_path}")
    
    cloud_name = (file_name or "").strip() or os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    
    req_resp = request_upload(
        drive_id=drive_id,
        parent_id=parent_id,
        file_path=file_path,
        file_name=cloud_name,
        parent_path=None,
        client=client,
    )
    
    data = req_resp.get("data", {})
    if not data:
        raise ValueError(f"获取上传地址失败: {req_resp}")
    
    upload_id = data.get("upload_id")
    store_request = data.get("store_request", {})
    upload_url = store_request.get("url")
    method = store_request.get("method", "PUT")
    
    if not upload_id or not upload_url:
        raise ValueError(f"获取上传地址失败: {data}")
    
    # 上传文件
    upload_result = upload_file(upload_url, file_path, method, client)
    if upload_result.get("status_code") != 200:
        raise ValueError(f"上传文件失败: {upload_result}")
    
    # 从upload_url中提取key（最后一个路径部分）
    import urllib.parse
    parsed_url = urllib.parse.urlparse(upload_url)
    key = parsed_url.path.split('/')[-1]
    
    commit_resp = commit_upload(
        drive_id=drive_id,
        parent_id=parent_id,
        upload_id=upload_id,
        file_name=cloud_name,
        size=file_size,
        store_request_keys={'key': key},
        client=client,
    )
    
    return commit_resp


def list_files(
    drive_id: str = "private",
    parent_id: str = "root",
    page_size: int = 50,
    page_token: Optional[str] = None,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    获取文件列表。
    GET /v7/drives/{drive_id}/files/{parent_id}/children
    drive_id: 云盘ID
    parent_id: 目录ID
    """
    c = client or WpsV7Client()
    
    # 将'root'转换为'0'
    if parent_id == 'root':
        parent_id = '0'
    
    params = {
        "page_size": min(100, max(1, page_size)),
    }
    if page_token:
        params["page_token"] = page_token
    
    resp = c.get(f"/v7/drives/{drive_id}/files/{parent_id}/children", params=params)
    return _normalize_resp(resp)


def get_file(
    drive_id: str,
    file_id: str,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    获取文件详情。
    GET /v7/drives/{drive_id}/files/{file_id}/meta
    drive_id: 云盘ID
    file_id: 文件ID
    """
    c = client or WpsV7Client()
    resp = c.get(f"/v7/drives/{drive_id}/files/{file_id}/meta")
    return _normalize_resp(resp)


def get_link_meta(
    link_id: str,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    根据 link_id 获取分享链接信息（含 file_id、drive_id），用于 link_id 换 file_id。
    GET /v7/links/{link_id}/meta
    link_id: 分享链接 ID（如云文档消息中的 link_id）
    返回：{ code, msg, data }，data 为 v7_link，含 id、url、drive_id、file_id 等。
    """
    c = client or WpsV7Client()
    resp = c.get(f"/v7/links/{link_id}/meta")
    return _normalize_resp(resp)


def get_file_download_url(
    drive_id: str,
    file_id: str,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    获取文件下载信息（含临时下载地址）。
    GET /v7/drives/{drive_id}/files/{file_id}/download
    drive_id: 云盘ID
    file_id: 文件ID
    返回 data 含 url、expiration、hashes 等。
    """
    c = client or WpsV7Client()
    resp = c.get(f"/v7/drives/{drive_id}/files/{file_id}/download")
    return _normalize_resp(resp)


def get_file_content_extract(
    drive_id: str,
    file_id: str,
    format: str = "plain",
    client: Optional[WpsV7Client] = None,
    **query,
) -> dict:
    """
    文档内容抽取（internal）。
    GET /v7/drives/{drive_id}/files/{file_id}/content
    format: plain | markdown | html | kdc，默认 plain
    query: 可选 include_elements, mode, page_range 等。
    返回接口原始响应（含 data.plain / data.markdown 等）。
    """
    c = client or WpsV7Client()
    params = {"format": format, **query}
    resp = c.get(
        f"/v7/drives/{drive_id}/files/{file_id}/content",
        params=params,
    )
    return _normalize_resp(resp)


def get_file_content(
    drive_id: str,
    file_id: str,
    encoding: str = "utf-8",
    client: Optional[WpsV7Client] = None,
) -> str:
    """
    获取云文档文件文本内容：优先通过下载链接拉取；失败时（如 .otl 无法下载）回退为内容抽取接口。
    drive_id: 云盘ID
    file_id: 文件ID
    encoding: 解码使用的编码，默认 utf-8
    """
    c = client or WpsV7Client()
    try:
        url_resp = get_file_download_url(drive_id, file_id, client=c)
        data = url_resp.get("data") or url_resp
        url = data.get("url") or data.get("download_url")
        if not url:
            raise ValueError("未获取到下载链接")
        r = c._session.get(url, headers=c._headers(), timeout=30)
        r.raise_for_status()
        return r.content.decode(encoding, errors="replace")
    except Exception:
        extract_resp = get_file_content_extract(
            drive_id, file_id, format="plain", client=c
        )
        data = extract_resp.get("data") or extract_resp
        if extract_resp.get("code") not in (None, 0):
            raise ValueError(
                extract_resp.get("msg") or extract_resp.get("message") or "内容抽取失败"
            )
        text = (data.get("plain") or data.get("markdown") or "").strip()
        if not text:
            raise ValueError("内容抽取未返回正文")
        return text


def create_otl_document(
    drive_id: str,
    file_name: str,
    parent_path: Optional[List[str]] = None,
    on_name_conflict: str = "rename",
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    在云盘下创建智能文档（.otl 文件）。POST /v7/drives/{drive_id}/files/0/create。
    file_name: 文件名（不含 .otl 则自动加后缀）。
    parent_path: 父路径列表，如 ["我的文档"]，默认 ["我的文档"]。
    返回 data：含 id、link_id、link_url。
    """
    c = client or WpsV7Client()
    name = f"{file_name}.otl" if not (file_name or "").strip().endswith(".otl") else file_name
    body = {
        "name": name,
        "parent_path": parent_path or ["我的文档"],
        "on_name_conflict": on_name_conflict,
        "file_type": "file",
    }
    resp = c.post(f"/v7/drives/{drive_id}/files/0/create", json=body)
    return _normalize_resp(resp)


def get_drive_id(
    drive_name: str = "private",
    client: Optional[WpsV7Client] = None,
) -> str:
    """
    将 drive 名称（private/roaming/special）解析为实际 drive_id。
    若 drive_name 已是 id 则原样返回。
    """
    if drive_name not in ("private", "roaming", "special"):
        return drive_name
    c = client or WpsV7Client()
    resp = c.get("/v7/drives?allotee_type=user&page_size=10")
    if resp.get("code") != 0:
        raise ValueError(resp.get("msg") or "获取云盘列表失败")
    items = (resp.get("data") or {}).get("items") or []
    for item in items:
        if drive_name == "private" and item.get("name") == "我的企业文档":
            return item.get("id", "")
        if drive_name == "roaming" and item.get("name") == "自动备份":
            return item.get("id", "")
        if drive_name == "special" and item.get("source") == "special":
            return item.get("id", "")
    if items:
        return items[0].get("id", "")
    raise ValueError(f"未找到云盘: {drive_name}")


def search_files(
    keyword: Optional[str] = None,
    search_type: str = "all",
    scope: Optional[List[str]] = None,
    page_size: int = 20,
    page_token: Optional[str] = None,
    with_total: bool = True,
    with_link: bool = True,
    client: Optional[WpsV7Client] = None,
) -> dict:
    """
    搜索云文档文件。GET /v7/files/search。
    简化参数便于 LLM 使用。
    keyword: 搜索关键词，不传则按类型/范围列举。
    search_type: file_name（仅文件名）/ content（仅正文）/ all（全部），默认 all。
    scope: 范围，如 all、personal_drive、group_drive、latest、share_by_me、share_to_me、recycle 等。
    """
    c = client or WpsV7Client()
    params = {
        "type": search_type,
        "page_size": min(500, max(1, page_size)),
        "with_total": "true" if with_total else "false",
        "with_link": "true" if with_link else "false",
    }
    if keyword:
        params["keyword"] = keyword
    if scope:
        params["scope"] = scope
    if page_token:
        params["page_token"] = page_token
    resp = c.get("/v7/files/search", params=params)
    return _normalize_resp(resp)
