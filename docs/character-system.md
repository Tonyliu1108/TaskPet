# Character System

The character flow begins in `CharacterSetupPage`. MediaPipe Tasks Vision and the bundled EfficientDet Lite model detect people in a user-selected image in the browser. The selected crop is sent to the FastAPI backend only when the user starts generation.

The backend uses the configured image provider to create the base illustration, then Pillow and rembg produce transparent and normalized assets. Character records are managed by the frontend Character Library. State assets cover idle, walking, thinking, working, waiting, and celebrating. The walking system can request compatible video generation, extract a loop, normalize frames, and fall back to static or two-frame motion when a generated pack is unavailable.

The public repository intentionally contains no source photos, generated characters, state assets, walking frames, or character videos. A first-time user starts with an empty library and is directed through character creation. Runtime media is created under ignored backend directories and must not be committed.

Character generation and video generation depend on external provider access and the provider's own terms. The repository does not include provider models, accounts, credits, or credentials.
