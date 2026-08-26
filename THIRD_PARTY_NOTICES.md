# Third-Party Notices

TaskPet is licensed under MIT, but its dependencies, runtime files, external models, external services, and generated outputs retain their own licenses and terms. Versions below come from `package-lock.json` and `server/requirements.txt`; licenses are verified from installed package metadata.

## Frontend direct dependencies

| Package | Version | Purpose | License | Project/source |
| --- | ---: | --- | --- | --- |
| `@mediapipe/tasks-vision` | 1.0.1 | Browser vision tasks | Apache-2.0 | https://www.npmjs.com/package/@mediapipe/tasks-vision |
| `lucide-react` | 0.468.0 | UI icons | ISC | https://lucide.dev |
| `react` | 18.3.1 | UI library | MIT | https://react.dev |
| `react-dom` | 18.3.1 | Browser renderer | MIT | https://react.dev |

## Frontend direct development dependencies

| Package | Version | Purpose | License | Project/source |
| --- | ---: | --- | --- | --- |
| `@types/react` | 18.3.31 | React TypeScript types | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react-dom` | 18.3.7 | React DOM TypeScript types | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@vitejs/plugin-react` | 4.7.0 | Vite React integration | MIT | https://github.com/vitejs/vite-plugin-react |
| `typescript` | 5.6.3 | TypeScript compiler | Apache-2.0 | https://www.typescriptlang.org |
| `vite` | 6.4.3 | Development/build tool | MIT | https://vite.dev |

## Backend direct dependencies

The exact license values in this table were read from the installed distribution metadata in the isolated Python 3.9 verification environment used for this release candidate.

| Package | Version | Purpose | License | Project/source |
| --- | ---: | --- | --- | --- |
| `fastapi` | 0.116.1 | Web API framework | MIT | https://github.com/fastapi/fastapi |
| `uvicorn` | 0.35.0 | ASGI server | BSD-3-Clause | https://github.com/encode/uvicorn |
| `httpx` | 0.28.1 | HTTP client | BSD-3-Clause | https://github.com/encode/httpx |
| `python-dotenv` | 1.1.1 | Environment file loading | BSD-3-Clause | https://github.com/theskumar/python-dotenv |
| `pydantic` | 2.11.7 | Data validation | MIT | https://github.com/pydantic/pydantic |
| `Pillow` | 11.3.0 | Image processing | MIT-CMU | https://python-pillow.org |
| `rembg` | 2.0.61 | Background removal | MIT | https://github.com/danielgatis/rembg |
| `onnxruntime` | 1.19.2 | ONNX model runtime | MIT | https://onnxruntime.ai |
| `numpy` | 2.0.2 | Numerical arrays | BSD-3-Clause | https://numpy.org |
| `scipy` | 1.13.1 | Image/numerical operations | BSD-3-Clause | https://scipy.org |
| `pytest` | 8.4.1 | Test runner | MIT | https://pytest.org |
| `pytest-asyncio` | 1.1.0 | Async pytest support | Apache-2.0 | https://github.com/pytest-dev/pytest-asyncio |
| `imageio-ffmpeg` | 0.6.0 | ffmpeg binary integration | BSD-2-Clause | https://github.com/imageio/imageio-ffmpeg |
| `openpyxl` | 3.1.5 | XLSX reading/writing | MIT | https://openpyxl.readthedocs.io |
| `pandas` | 2.3.2 | Tabular Excel analysis | BSD-3-Clause | https://pandas.pydata.org |
| `python-multipart` | 0.0.20 | Multipart upload parsing | Apache-2.0 | https://github.com/Kludex/python-multipart |

## MediaPipe runtime and external vision model

- `npm ci` copies the browser runtime files from MediaPipe Tasks Vision into ignored `public/mediapipe/`. The generated copy is not included in the source release archive and remains covered by the dependency's Apache-2.0 metadata.

### EfficientDet-Lite0

- Source: Google MediaPipe / TensorFlow
- Upstream: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
- License: Apache-2.0
- Distribution mode: downloaded separately from upstream; binary not included in this repository
- Local path after download: `public/models/efficientdet_lite0.tflite`

## External services

DeepSeek-compatible, Seedream-compatible, Seedance-compatible, Volcano Ark, and other configured external services are not redistributed by TaskPet and are not relicensed under TaskPet's MIT license. Users must review the relevant provider terms and model/output policies.

This notice covers direct dependencies. Transitive dependencies remain subject to the license metadata shipped with their packages and lockfile-resolved distributions.
