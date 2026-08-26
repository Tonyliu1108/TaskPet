from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


PetVisualState = Literal[
    "idle",
    "walking",
    "thinking",
    "working",
    "waiting",
    "celebrating",
]


class CharacterGenerationRequest(BaseModel):
    imageBase64: str = Field(min_length=32, max_length=16_000_000)
    petName: str = Field(default="桌宠", min_length=1, max_length=24)
    personality: str = Field(default="friendly", max_length=32)
    motionStyle: str = Field(default="light", max_length=32)

    @field_validator("imageBase64")
    @classmethod
    def validate_image_data_url(cls, value: str) -> str:
        supported_prefixes = (
            "data:image/jpeg;base64,",
            "data:image/png;base64,",
            "data:image/webp;base64,",
        )
        if not value.startswith(supported_prefixes):
            raise ValueError("imageBase64 must be a JPEG, PNG or WebP data URL")
        return value


class CharacterGenerationResponse(BaseModel):
    success: bool = True
    characterId: str
    baseImage: str
    transparentImage: str
    normalizedImage: str
    modelName: str
    promptVersion: str
    createdAt: str


class CharacterStateAssetRequest(BaseModel):
    characterId: str = Field(pattern=r"^char_[A-Za-z0-9_-]{4,64}$")
    state: PetVisualState


class CharacterStateAsset(BaseModel):
    assetId: str
    state: PetVisualState
    baseImage: str
    transparentImage: str
    normalizedImage: str
    modelName: str
    promptVersion: str
    createdAt: str
    providerHttpStatus: int
    durationMs: int


class CharacterStateAssetResponse(BaseModel):
    success: bool = True
    characterId: str
    masterImage: str
    asset: CharacterStateAsset


class WalkingMotionRequest(BaseModel):
    characterId: str = Field(pattern=r"^char_[A-Za-z0-9_-]{4,64}$")


class WalkingMotionFrame(BaseModel):
    frameIndex: int
    sourceFrameIndex: Optional[int] = None
    imageUrl: str
    format: Literal["png", "webp"]
    width: int
    height: int


class WalkingSourceMetadata(BaseModel):
    provider: str
    modelName: str
    modelId: Optional[str] = None
    sourceVideoUrl: str
    sourceVideoDurationSec: float
    sourceVideoFps: float
    sourceVideoWidth: int
    sourceVideoHeight: int
    cycleStartFrame: Optional[int] = None
    cycleEndFrame: Optional[int] = None
    taskId: Optional[str] = None
    callIndex: Optional[int] = None


class WalkingMotionAsset(BaseModel):
    version: str
    status: Literal["not_started", "generating", "processing", "partial", "completed", "error"]
    frames: list[WalkingMotionFrame]
    frameCount: int
    playbackFps: float
    frameDurationMs: float
    source: WalkingSourceMetadata
    promptVersion: Optional[str] = None
    errorMessage: Optional[str] = None
    createdAt: str
    updatedAt: str


class WalkingMotionResponse(BaseModel):
    success: bool = True
    characterId: str
    motion: WalkingMotionAsset


class HealthResponse(BaseModel):
    status: str
    provider: str
    modelConfigured: bool
    apiKeyConfigured: bool
    deepseekConfigured: bool
