import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.character_generator import CharacterGeneratorError
from services.walking_motion_service import (
    PLAYBACK_FPS,
    PROMPT_VERSION,
    _safe_character_id,
    build_formal_walking_prompt,
)


def test_formal_prompt_locks_identity_and_continuous_walking():
    prompt = build_formal_walking_prompt("char_test_motion")

    assert PROMPT_VERSION == "video-walking-v1-identity-lock"
    assert PLAYBACK_FPS == 15
    assert "same single character identity" in prompt
    assert "clothing pattern" in prompt
    assert "walk in place for the entire shot" in prompt
    assert "No extra person, extra limb, missing limb" in prompt


def test_formal_walking_rejects_unsafe_character_id():
    with pytest.raises(CharacterGeneratorError) as error:
        _safe_character_id("../char_escape")

    assert error.value.code == "invalid_character_id"
    assert error.value.status_code == 422
