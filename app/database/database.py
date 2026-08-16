import logging
from typing import Any, Dict, List, Optional

import aiohttp

from app.config import config

logger = logging.getLogger(__name__)

_session: aiohttp.ClientSession | None = None


def _headers() -> Dict[str, str]:
    return {
        "apikey": config.supabase_service_role_key,
        "Authorization": f"Bearer {config.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base_url() -> str:
    return f"{config.supabase_url}/rest/v1"


async def get_session() -> aiohttp.ClientSession:
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(headers=_headers())
    return _session


async def close_session():
    global _session
    if _session and not _session.closed:
        await _session.close()
        _session = None


async def check_db_connection() -> bool:
    try:
        session = await get_session()
        async with session.get(
            f"{_base_url()}/tg_users",
            params={"select": "telegram_id", "limit": "1"},
        ) as resp:
            return resp.status == 200
    except Exception as e:
        logger.error("Database connection check failed: %s", e)
        return False


async def rest_select(
    table: str,
    filters: Optional[Dict[str, str]] = None,
    select: str = "*",
    order: Optional[str] = None,
    limit: Optional[int] = None,
    single: bool = False,
) -> List[Dict[str, Any]] | Dict[str, Any] | None:
    session = await get_session()
    params: Dict[str, str] = {"select": select}
    if filters:
        for k, v in filters.items():
            params[k] = f"eq.{v}"
    if order:
        params["order"] = order
    if limit:
        params["limit"] = str(limit)

    url = f"{_base_url()}/{table}"
    async with session.get(url, params=params) as resp:
        if resp.status == 200:
            data = await resp.json()
            if single:
                return data[0] if data else None
            return data
        body = await resp.text()
        logger.error("REST select %s failed: %d %s", table, resp.status, body[:200])
        if single:
            return None
        return []


async def rest_insert(
    table: str, payload: Dict[str, Any], select: str = "*"
) -> Dict[str, Any] | None:
    session = await get_session()
    url = f"{_base_url()}/{table}"
    async with session.post(url, json=payload, params={"select": select}) as resp:
        if resp.status in (200, 201):
            data = await resp.json()
            return data[0] if data else None
        body = await resp.text()
        logger.error("REST insert %s failed: %d %s", table, resp.status, body[:200])
        return None


async def rest_upsert(
    table: str, payload: Dict[str, Any], on_conflict: str, select: str = "*"
) -> Dict[str, Any] | None:
    session = await get_session()
    headers = dict(_headers())
    headers["Prefer"] = f"return=representation,resolution=merge-duplicates"
    url = f"{_base_url()}/{table}"
    async with session.post(
        url, json=payload, params={"select": select, "on_conflict": on_conflict}
    ) as resp:
        if resp.status in (200, 201):
            data = await resp.json()
            return data[0] if data else None
        body = await resp.text()
        logger.error("REST upsert %s failed: %d %s", table, resp.status, body[:200])
        return None


async def rest_update(
    table: str,
    filters: Dict[str, str],
    payload: Dict[str, Any],
    select: str = "*",
) -> List[Dict[str, Any]]:
    session = await get_session()
    params: Dict[str, str] = {"select": select}
    for k, v in filters.items():
        params[k] = f"eq.{v}"
    url = f"{_base_url()}/{table}"
    async with session.patch(url, json=payload, params=params) as resp:
        if resp.status == 200:
            return await resp.json()
        body = await resp.text()
        logger.error("REST update %s failed: %d %s", table, resp.status, body[:200])
        return []


async def rest_delete(
    table: str, filters: Dict[str, str], select: str = "*"
) -> List[Dict[str, Any]]:
    session = await get_session()
    params: Dict[str, str] = {"select": select}
    for k, v in filters.items():
        params[k] = f"eq.{v}"
    url = f"{_base_url()}/{table}"
    async with session.delete(url, params=params) as resp:
        if resp.status in (200, 204):
            if resp.status == 204:
                return []
            return await resp.json()
        body = await resp.text()
        logger.error("REST delete %s failed: %d %s", table, resp.status, body[:200])
        return []


async def rest_rpc(fn: str, params: Dict[str, Any]) -> Any:
    session = await get_session()
    url = f"{config.supabase_url}/rest/v1/rpc/{fn}"
    async with session.post(url, json=params) as resp:
        if resp.status == 200:
            return await resp.json()
        body = await resp.text()
        logger.error("REST rpc %s failed: %d %s", fn, resp.status, body[:200])
        return None


async def rest_count(table: str, filters: Optional[Dict[str, str]] = None) -> int:
    session = await get_session()
    headers = dict(_headers())
    headers["Prefer"] = "count=exact"
    params: Dict[str, str] = {"select": "id"}
    if filters:
        for k, v in filters.items():
            params[k] = f"eq.{v}"
    url = f"{_base_url()}/{table}"
    async with session.get(url, params=params) as resp:
        count = resp.headers.get("Content-Range", "*/0")
        try:
            return int(count.split("/")[1])
        except (IndexError, ValueError):
            return 0


check_db_connection_safe = check_db_connection
