import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.character_assets import alpha_content_bbox
from services.walking_video_frames import normalize_walking_sequence


def frame_payload(*, top: int, bottom: int) -> bytes:
    image = Image.new("RGBA", (200, 240), (0, 0, 0, 0))
    ImageDraw.Draw(image).rectangle((70, top, 130, bottom), fill=(150, 100, 180, 255))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_sequence_normalization_keeps_canvas_and_natural_vertical_offset():
    normalized = normalize_walking_sequence([
        frame_payload(top=30, bottom=210),
        frame_payload(top=24, bottom=204),
    ])

    assert len(normalized) == 2
    boxes = []
    for payload in normalized:
        with Image.open(io.BytesIO(payload)) as image:
            assert image.size == (768, 768)
            assert image.mode == "RGBA"
            boxes.append(alpha_content_bbox(image, threshold=0))
    assert boxes[0] is not None and boxes[1] is not None
    assert boxes[0][3] > boxes[1][3]
    assert boxes[0][3] - boxes[1][3] >= 10
