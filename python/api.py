import os
import tempfile
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from utils.summarizer import summarize_drive_folder

app = FastAPI()


class SummaryRequest(BaseModel):
    drive_id: str


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/summarize")
def summarize(request: SummaryRequest):
    """Summarize PDFs in a Google Drive folder."""
    if not request.drive_id:
        raise HTTPException(status_code=400, detail="drive_id is required")

    try:
        summary = summarize_drive_folder(request.drive_id)
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
