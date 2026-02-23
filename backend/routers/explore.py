"""
routers/explore.py — Web-grounded explore endpoint and streaming search-augmented generation.
"""

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from dependencies import CurrentUser, DB
from logging_config import get_logger
from models_async import StudySession
from schemas import ExploreRequest, ExploreSearchRequest
from services.registry import ai_service
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = get_logger(__name__)
router = APIRouter(tags=["explore"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/explore")
@limiter.limit("20/minute")
async def explore_endpoint(request: Request, body: ExploreRequest, current_user: CurrentUser):
    try:
        data = ai_service.explore(body.question)
        return {"answer": data["answer"], "citations": data["citations"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch Explore results")


@router.post("/explore/search")
@limiter.limit("15/minute")
async def explore_search(
    request: Request, body: ExploreSearchRequest, current_user: CurrentUser, db: DB
):
    """Stream a Search-Augmented Generation response for the Explore Hub."""
    if body.session_id:
        try:
            result = await db.execute(
                select(StudySession).where(
                    StudySession.id == body.session_id,
                    StudySession.user_id == current_user.id,
                )
            )
            sess = result.scalar_one_or_none()
            if sess:
                sess.session_type = "explore"
                await db.commit()
        except Exception as exc:
            logger.warning("explore_search.session_mark.failed", error=str(exc))

    def _stream():
        try:
            yield from ai_service.explore_the_web(query=body.query)
        except Exception as exc:
            logger.error("explore_search.failed", error=str(exc))
            yield f"data: {json.dumps({'type': 'error', 'text': str(exc)})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
