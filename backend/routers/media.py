"""
routers/media.py — Audio transcription (Whisper) and text-to-speech endpoints.
"""

import asyncio
import os
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import select

from config import Config
from dependencies import CurrentUser, DB
from logging_config import get_logger
from models_async import StudySession
from schemas import TTSRequest
from services.registry import ai_service, rag_service
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = get_logger(__name__)
router = APIRouter(tags=["media"])
limiter = Limiter(key_func=get_remote_address)

UPLOAD_FOLDER = Config.UPLOAD_FOLDER

_WHISPER_SILENCE = frozenset({
    "[blank_audio]", "you", "thank you.", "thanks.", ".", "..", "...", "the",
    "thank you for watching.", "subtitles by the amara.org community",
})


@router.post("/transcribe")
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(None),
    synthesize: bool = Form(False),
    current_user: CurrentUser = None,  # noqa: B008
    db: DB = None,  # noqa: B008
):
    """
    Transcribe an audio file. Optionally synthesize with document context
    to produce a structured Research Note artifact.
    """
    filename = file.filename or ""
    ext = os.path.splitext(filename.lower())[1]
    if ext not in Config.ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(Config.ALLOWED_AUDIO_EXTENSIONS)}",
        )

    openai_client = ai_service.client
    if not openai_client:
        raise HTTPException(
            status_code=503, detail="Transcription requires OPENAI_API_KEY to be set"
        )

    from werkzeug.utils import secure_filename
    safe_name = secure_filename(filename)
    filepath = os.path.join(
        UPLOAD_FOLDER, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{safe_name}"
    )
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        with open(filepath, "rb") as audio_file:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1", file=audio_file, response_format="text"
            )

        transcript_clean = (transcript or "").strip()
        if not transcript_clean or len(transcript_clean) < 5 \
                or transcript_clean.lower() in _WHISPER_SILENCE:
            return {"transcript": transcript_clean, "warning": "No speech detected"}

        if synthesize and session_id and transcript_clean:
            _sess_check = await db.execute(
                select(StudySession).where(
                    StudySession.id == session_id,
                    StudySession.user_id == current_user.id,
                )
            )
            if not _sess_check.scalar_one_or_none():
                return {"transcript": transcript_clean}

            try:
                rag_result = await rag_service.query_async(
                    transcript_clean, session_id, current_user.id, n_results=5
                )
                if rag_result["chunks"]:
                    synthesis_prompt = (
                        f"The user recorded the following voice note:\n\"{transcript_clean}\"\n\n"
                        "Here are relevant excerpts from their uploaded documents:\n"
                        + "\n---\n".join(rag_result["chunks"][:3])
                        + "\n\nCreate a structured Research Note that connects the voice "
                          "note with the document evidence. Include three sections: "
                          "**Key Points**, **Supporting Evidence**, and **Synthesis**."
                    )
                    loop = asyncio.get_event_loop()
                    research_note = await loop.run_in_executor(
                        None,
                        lambda: ai_service.answer_from_context(
                            context_chunks=rag_result["chunks"][:3],
                            question=synthesis_prompt,
                            chat_history=[],
                        ),
                    )
                    sources = rag_service.build_sources(
                        rag_result["chunks"], rag_result["metas"]
                    )
                    return {
                        "transcript": transcript,
                        "research_note": research_note,
                        "sources": sources,
                        "artifact": {
                            "type": "research_note",
                            "artifact_type": "research_note",
                            "content": research_note,
                        },
                    }
            except Exception as synth_exc:
                logger.warning("transcribe.synthesis.failed: %s", synth_exc)

        return {"transcript": transcript_clean}
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass


@router.post("/tts")
@limiter.limit("10/minute")
async def text_to_speech(
    data: TTSRequest, request: Request, current_user: CurrentUser, db: DB
):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="Text too long (max 4096 characters)")

    tts_client = ai_service.client
    if not tts_client:
        raise HTTPException(
            status_code=503, detail="TTS requires OPENAI_API_KEY to be set"
        )

    tts_response = tts_client.audio.speech.create(model="tts-1", voice="alloy", input=text)
    return Response(content=tts_response.content, media_type="audio/mpeg")
