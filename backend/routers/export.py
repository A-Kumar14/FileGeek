"""
routers/export.py — Notion, Markdown, and Evernote ENEX export endpoints.
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response

from dependencies import CurrentUser, DB
from schemas import ExportRequest, NotionExportRequest

router = APIRouter(prefix="/export", tags=["export"])


@router.post("/notion")
async def export_to_notion(
    data: NotionExportRequest, request: Request, current_user: CurrentUser, db: DB
):
    import requests as http_requests

    notion_token = request.headers.get("X-Notion-Token", "")
    if not notion_token:
        raise HTTPException(status_code=400, detail="Notion integration token required")
    if not data.content:
        raise HTTPException(status_code=400, detail="Content is required")

    search_resp = http_requests.post(
        "https://api.notion.com/v1/search",
        headers={
            "Authorization": f"Bearer {notion_token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        json={"query": "", "page_size": 1},
        timeout=10,
    )
    if search_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to connect to Notion. Check your token.")

    results = search_resp.json().get("results", [])
    parent_id = results[0]["id"] if results else None
    if not parent_id:
        raise HTTPException(
            status_code=400,
            detail="No pages found in Notion workspace. Create a page first.",
        )

    blocks = []
    for i in range(0, len(data.content), 2000):
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": data.content[i:i + 2000]}}]
            },
        })

    create_resp = http_requests.post(
        "https://api.notion.com/v1/pages",
        headers={
            "Authorization": f"Bearer {notion_token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        json={
            "parent": {"page_id": parent_id},
            "properties": {"title": [{"text": {"content": data.title}}]},
            "children": blocks[:100],
        },
        timeout=15,
    )
    if create_resp.status_code in (200, 201):
        page_url = create_resp.json().get("url", "")
        return {"message": "Exported to Notion", "url": page_url}
    raise HTTPException(status_code=500, detail="Failed to create Notion page")


@router.post("/markdown")
async def export_markdown(data: ExportRequest, current_user: CurrentUser, db: DB):
    if not data.content:
        raise HTTPException(status_code=400, detail="Content is required")
    md_content = f"# {data.title}\n\n{data.content}\n"
    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{data.title}.md"'},
    )


@router.post("/enex")
async def export_enex(data: ExportRequest, current_user: CurrentUser, db: DB):
    if not data.content:
        raise HTTPException(status_code=400, detail="Content is required")

    from xml.sax.saxutils import escape

    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    html_content = data.content.replace("\n", "<br/>")
    enex = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="{now}" application="FileGeek">
  <note>
    <title>{escape(data.title)}</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>{escape(html_content)}</en-note>]]></content>
    <created>{now}</created>
  </note>
</en-export>"""
    return Response(
        content=enex,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{data.title}.enex"'},
    )
