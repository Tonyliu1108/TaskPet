from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ExcelAnalysisRequest(BaseModel):
    fileId: str
    sheetName: Optional[str] = None


class ExcelInsightsRequest(BaseModel):
    fileId: str
    analysisId: Optional[str] = None
