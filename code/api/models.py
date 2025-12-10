from pydantic import BaseModel
from typing import Optional, List


class DuplicateCheckResponse(BaseModel):
    duplicate: bool
    message: Optional[str] = ""


class MicroscopyFile(BaseModel):
    file_id: int
    session_id: str
    hemisphere: Optional[str] = None
    path: str
    sha256: Optional[str] = None


class RegionCountSummary(BaseModel):
    subject_id: str
    region_id: int
    file_id: int
    hemisphere: Optional[str] = None
    region_pixels: Optional[float] = None
    load: Optional[float] = None


class HashesPayload(BaseModel):
    hashes: List[str]
