import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from starlette.concurrency import run_in_threadpool  # noqa: E402

from schemas.character import (  # noqa: E402
    CharacterGenerationRequest,
    CharacterGenerationResponse,
    CharacterStateAssetRequest,
    CharacterStateAssetResponse,
    HealthResponse,
    WalkingMotionRequest,
    WalkingMotionResponse,
)
from schemas.excel import ExcelAnalysisRequest, ExcelInsightsRequest  # noqa: E402
from services.character_generator import (  # noqa: E402
    ArkSettings,
    CharacterGeneratorError,
    generate_character,
)
from services.character_assets import AssetSettings  # noqa: E402
from services.state_asset_generator import generate_state_asset  # noqa: E402
from services.walking_motion_service import generate_formal_walking_motion  # noqa: E402
from services.excel_analysis import ExcelAnalysisError, analyze_excel  # noqa: E402
from services.business_insights import generate_business_insights  # noqa: E402
from services.deepseek_client import DeepSeekClientError, DeepSeekSettings  # noqa: E402
from services.upload_storage import (  # noqa: E402
    FileStorageError,
    UploadSettings,
    resolve_upload,
    save_upload,
)


def _allowed_origins() -> list[str]:
    value = os.getenv(
        "ALLOW_ORIGIN",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    )
    return [origin.strip() for origin in value.split(",") if origin.strip()]


app = FastAPI(
    title="TaskPet Character Generation API",
    version="0.5.0",
    description="TaskPet API with Phase 7A1 local XLSX analysis.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
asset_settings = AssetSettings.from_environment()
asset_settings.output_dir.mkdir(parents=True, exist_ok=True)
upload_settings = UploadSettings.from_environment()
upload_settings.upload_dir.mkdir(parents=True, exist_ok=True)
analysis_cache: dict[str, dict[str, object]] = {}
app.mount(
    "/generated",
    StaticFiles(directory=asset_settings.output_dir.parent),
    name="generated-character-assets",
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = ArkSettings.from_environment()
    return HealthResponse(
        status="ok",
        provider=settings.provider_name,
        modelConfigured=bool(settings.configured_model),
        apiKeyConfigured=bool(settings.api_key),
        deepseekConfigured=DeepSeekSettings.from_environment().configured,
    )


@app.post("/api/files/upload")
async def upload_excel(file: UploadFile = File(...)) -> dict[str, object]:
    try:
        return await run_in_threadpool(
            save_upload,
            file.file,
            file.filename or "",
            file.content_type,
            upload_settings,
        )
    except FileStorageError as error:
        raise HTTPException(status_code=error.status_code, detail=error.as_detail()) from error
    finally:
        await file.close()


@app.get("/api/files/{file_id}")
async def get_uploaded_excel_metadata(file_id: str) -> dict[str, object]:
    try:
        _file_path, metadata = await run_in_threadpool(resolve_upload, file_id, upload_settings)
        return {**metadata, "status": "available"}
    except FileStorageError as error:
        raise HTTPException(status_code=error.status_code, detail=error.as_detail()) from error


@app.post("/api/excel/analyze")
async def analyze_uploaded_excel(request: ExcelAnalysisRequest) -> dict[str, object]:
    try:
        file_path, metadata = resolve_upload(request.fileId, upload_settings)
        result = await run_in_threadpool(analyze_excel, file_path, metadata, request.sheetName)
        analysis_cache[result["analysisId"]] = result
        return result
    except (FileStorageError, ExcelAnalysisError) as error:
        raise HTTPException(status_code=error.status_code, detail=error.as_detail()) from error
    except Exception as error:
        detail = {"code": "ANALYSIS_FAILED", "message": "Excel 分析失败，请检查文件后重试。"}
        raise HTTPException(status_code=500, detail=detail) from error


@app.post("/api/excel/insights")
async def generate_excel_insights(request: ExcelInsightsRequest) -> dict[str, object]:
    try:
        analysis = analysis_cache.get(request.analysisId or "")
        if not analysis or analysis.get("fileId") != request.fileId:
            file_path, metadata = resolve_upload(request.fileId, upload_settings)
            analysis = await run_in_threadpool(analyze_excel, file_path, metadata, None)
            analysis_cache[analysis["analysisId"]] = analysis
        return await run_in_threadpool(generate_business_insights, analysis)
    except (FileStorageError, ExcelAnalysisError, DeepSeekClientError) as error:
        detail = error.as_detail()
        diagnostics = getattr(error, "diagnostics", None)
        if isinstance(diagnostics, dict):
            detail["diagnostics"] = diagnostics
        raise HTTPException(status_code=error.status_code, detail=detail) from error


@app.post("/api/character/generate", response_model=CharacterGenerationResponse)
async def create_character(request: CharacterGenerationRequest) -> CharacterGenerationResponse:
    try:
        result = await generate_character(
            image_data_url=request.imageBase64,
            pet_name=request.petName,
            personality=request.personality,
            motion_style=request.motionStyle,
        )
    except CharacterGeneratorError as error:
        raise HTTPException(status_code=error.status_code, detail=error.as_detail()) from error

    return CharacterGenerationResponse(success=True, **result)


@app.post(
    "/api/character/generate-state-asset",
    response_model=CharacterStateAssetResponse,
)
async def create_character_state_asset(
    request: CharacterStateAssetRequest,
) -> CharacterStateAssetResponse:
    try:
        result = await generate_state_asset(
            character_id=request.characterId,
            state=request.state,
        )
    except CharacterGeneratorError as error:
        raise HTTPException(status_code=error.status_code, detail=error.as_detail()) from error

    return CharacterStateAssetResponse(success=True, **result)


@app.post(
    "/api/character/generate-walking-motion",
    response_model=WalkingMotionResponse,
)
async def create_walking_motion(request: WalkingMotionRequest) -> WalkingMotionResponse:
    try:
        result = await generate_formal_walking_motion(request.characterId)
    except CharacterGeneratorError as error:
        raise HTTPException(status_code=error.status_code, detail=error.as_detail()) from error
    return WalkingMotionResponse(success=True, **result)
