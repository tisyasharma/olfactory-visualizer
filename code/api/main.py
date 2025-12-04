from typing import List, Optional
import hashlib
import tempfile
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import text

from code.database.connect import get_engine
from code.database.ingest_upload import ingest
from code.database.etl import ingest_counts_csv, get_or_create_session_id

WEB_DIR = Path(__file__).resolve().parents[1] / "web"

app = FastAPI(title="Olfactory Data API", version="0.1.0")
app.mount("/code/web", StaticFiles(directory=WEB_DIR, html=True), name="web")


@app.get("/")
def root():
    """Redirect root to the web dashboard."""
    return RedirectResponse(url="/code/web/index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    ico = WEB_DIR / "favicon.ico"
    if ico.exists():
        return FileResponse(str(ico))
    raise HTTPException(status_code=404, detail="favicon not found")


def resolve_session_id(engine, subject_id: str, experiment_type: str, session_id: Optional[str]) -> str:
    sid = (session_id or "").strip()
    if sid.lower() == "auto" or sid == "":
        with engine.connect() as conn:
            sid = get_or_create_session_id(conn, subject_id, experiment_type)
    return sid


def sha256_path(path: Path, chunk_size: int = 1_048_576) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def fetch_all(query: str, params: dict = None):
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text(query), params or {})
        cols = rows.keys()
        return [dict(zip(cols, row)) for row in rows]


class Subject(BaseModel):
    subject_id: str
    sex: Optional[str] = None
    experiment_type: Optional[str] = None
    details: Optional[str] = None


@app.get("/subjects", response_model=List[Subject])
def list_subjects():
    rows = fetch_all("SELECT subject_id, sex, experiment_type, details FROM subjects ORDER BY subject_id")
    return rows


@app.get("/sessions")
def list_sessions(subject_id: Optional[str] = None):
    q = "SELECT session_id, subject_id, modality, session_date, protocol, notes FROM sessions"
    params = {}
    if subject_id:
        q += " WHERE subject_id = :sid"
        params["sid"] = subject_id
    q += " ORDER BY session_id"
    return fetch_all(q, params)


@app.get("/regions/tree")
def regions_tree():
    rows = fetch_all(
        "SELECT region_id, name, acronym, parent_id, st_level, atlas_id, ontology_id FROM brain_regions ORDER BY region_id"
    )
    return rows


@app.get("/files")
def list_files(session_id: Optional[str] = None, subject_id: Optional[str] = None):
    q = """
    SELECT mf.file_id, mf.session_id, s.subject_id, mf.run, mf.hemisphere, mf.path, mf.sha256, mf.created_at
    FROM microscopy_files mf
    JOIN sessions s ON mf.session_id = s.session_id
    """
    params = {}
    where = []
    if session_id:
        where.append("mf.session_id = :sess")
        params["sess"] = session_id
    if subject_id:
        where.append("s.subject_id = :subj")
        params["subj"] = subject_id
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY mf.session_id, mf.run NULLS LAST"
    return fetch_all(q, params)


@app.get("/fluor/counts")
def fluor_counts(
    subject_id: Optional[str] = None,
    region_id: Optional[int] = None,
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    limit: int = Query(500, ge=1, le=5000),
):
    q = """
    SELECT rc.subject_id, rc.region_id, br.name AS region_name, rc.region_pixels, rc.region_area_mm,
           rc.object_count, rc.object_pixels, rc.object_area_mm, rc.load, rc.norm_load,
           rc.hemisphere, rc.file_id
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    """
    params = {}
    where = []
    if subject_id:
        where.append("rc.subject_id = :sid")
        params["sid"] = subject_id
    if region_id:
        where.append("rc.region_id = :rid")
        params["rid"] = region_id
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY rc.subject_id, rc.region_id LIMIT :lim"
    params["lim"] = limit
    return fetch_all(q, params)


@app.get("/fluor/summary")
def fluor_summary(
    experiment_type: Optional[str] = Query(None, regex="^(double_injection|rabies)$"),
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    subject_id: Optional[str] = None,
    region_id: Optional[int] = None,
    limit: int = Query(500, ge=1, le=5000),
):
    """
    Aggregated region-level summary to drive charts without client-side recompute.
    """
    q = """
    SELECT br.region_id,
           br.name AS region_name,
           rc.hemisphere,
           COUNT(*) AS records,
           SUM(rc.region_pixels) AS region_pixels_sum,
           AVG(rc.region_pixels) AS region_pixels_avg,
           SUM(rc.load) AS load_sum,
           AVG(rc.load) AS load_avg,
           SUM(rc.object_count) AS object_count_sum,
           AVG(rc.object_count) AS object_count_avg
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    JOIN subjects s ON rc.subject_id = s.subject_id
    """
    params = {}
    where = []
    if experiment_type:
        where.append("s.experiment_type = :exp")
        params["exp"] = experiment_type
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    if subject_id:
        where.append("rc.subject_id = :sid")
        params["sid"] = subject_id
    if region_id:
        where.append("rc.region_id = :rid")
        params["rid"] = region_id
    if where:
        q += " WHERE " + " AND ".join(where)
    q += """
    GROUP BY br.region_id, br.name, rc.hemisphere
    ORDER BY br.region_id
    LIMIT :lim
    """
    params["lim"] = limit
    return fetch_all(q, params)


@app.get("/status")
def status():
    rows = fetch_all("SELECT count(*) AS subjects FROM subjects")
    subs = rows[0]["subjects"]
    rows = fetch_all("SELECT count(*) AS files FROM microscopy_files")
    files = rows[0]["files"]
    rows = fetch_all("SELECT count(*) AS counts FROM region_counts")
    counts = rows[0]["counts"]
    return {"subjects": subs, "files": files, "counts": counts}




@app.post("/upload/microscopy")
async def upload_microscopy(
    subject_id: str = Form(..., description="BIDS subject id (e.g., sub-DBL_A)"),
    session_id: str = Form(..., description="BIDS session id (e.g., ses-dbl or 'auto')"),
    hemisphere: str = Form("bilateral", regex="^(left|right|bilateral)$"),
    pixel_size_um: float = Form(1.0),
    experiment_type: str = Form("double_injection", regex="^(double_injection|rabies)$"),
    files: List[UploadFile] = File(...),
):
    """
    Accept microscopy uploads, convert to OME-Zarr, register sessions/files.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    image_ext = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".ome.tif", ".ome.tiff", ".zarr", ".ome.zarr")

    tmpdir = Path(tempfile.mkdtemp())
    saved_paths: List[Path] = []
    try:
        engine = get_engine()
        session_id = resolve_session_id(engine, subject_id, experiment_type, session_id)
        # prevent duplicate experiment loads
        with engine.connect() as conn:
            already = conn.execute(
                text("SELECT 1 FROM microscopy_files WHERE session_id = :sid LIMIT 1"),
                {"sid": session_id},
            ).first()
            if already:
                raise HTTPException(
                    status_code=409,
                    detail=f"Session {session_id} already has microscopy files registered. Duplicate ingest blocked.",
                )
        # Stage uploads to temp
        for uf in files:
            fname = uf.filename or ""
            lower = fname.lower()
            if not lower.endswith(image_ext):
                raise HTTPException(status_code=400, detail=f"Unsupported file type for {fname}. Upload images only.")
            dest = tmpdir / fname
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            saved_paths.append(dest)

        if not saved_paths:
            raise HTTPException(status_code=400, detail="No valid image files found in upload.")

        # Stable order so run numbering is deterministic when folder uploads are used
        all_images = sorted(saved_paths, key=lambda p: p.name)

        try:
            ingested = ingest(
                subject=subject_id,
                session=session_id,
                hemisphere=hemisphere,
                files=all_images,
                pixel_size_um=pixel_size_um,
                experiment_type=experiment_type,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Microscopy ingest failed: {e}")
        return {"status": "ok", "ingested": [str(p) for p in ingested], "files_processed": [p.name for p in all_images]}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.post("/upload/region-counts")
async def upload_region_counts(
    subject_id: str = Form(..., description="BIDS subject id (e.g., sub-DBL_A)"),
    session_id: Optional[str] = Form(None, description="BIDS session id (e.g., ses-dbl)"),
    hemisphere: str = Form("auto", regex="^(left|right|bilateral|auto)$"),
    experiment_type: str = Form("double_injection", regex="^(double_injection|rabies)$"),
    files: List[UploadFile] = File(...),
):
    """
    Accept quantification CSV uploads and load them into region_counts.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    engine = get_engine()
    sess = resolve_session_id(engine, subject_id, experiment_type, session_id)

    tmpdir = Path(tempfile.mkdtemp())
    rows = 0
    try:
        saved = []
        saved_hashes = {}
        for uf in files:
            if not uf.filename.lower().endswith(".csv"):
                raise HTTPException(status_code=400, detail=f"Unsupported file type for {uf.filename}. Upload CSV only.")
            dest = tmpdir / uf.filename
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            saved.append(dest)
            saved_hashes[dest] = sha256_path(dest)

        with engine.connect() as conn:
            # Block duplicate ingest for the same session if any region_counts already linked
            dup = conn.execute(
                text(
                    """
                    SELECT 1
                    FROM region_counts rc
                    JOIN microscopy_files mf ON rc.file_id = mf.file_id
                    WHERE mf.session_id = :sid
                    LIMIT 1
                    """
                ),
                {"sid": sess},
            ).first()
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=f"Session {sess} already has quantification rows registered. Duplicate ingest blocked.",
                )
            # Block identical file contents if checksum already ingested
            for chk in saved_hashes.values():
                existing = conn.execute(
                    text("SELECT 1 FROM ingest_log WHERE checksum = :c AND status = 'success' LIMIT 1"),
                    {"c": chk},
                ).first()
                if existing:
                    raise HTTPException(
                        status_code=409,
                        detail="This quantification file matches a previously ingested file (checksum duplicate).",
                    )
        for path in saved:
            try:
                rows += ingest_counts_csv(engine, path, subject_id, sess, hemisphere, experiment_type)
                # log checksum for dedupe
                chk = saved_hashes.get(path)
                if chk:
                    with engine.begin() as conn:
                        conn.execute(
                            text(
                                "INSERT INTO ingest_log (source_path, checksum, rows_loaded, status, message) "
                                "VALUES (:p, :c, :r, :s, :m)"
                            ),
                            {"p": str(path), "c": chk, "r": rows, "s": "success", "m": f"upload {sess}"},
                        )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        return {"status": "ok", "rows_ingested": rows}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
