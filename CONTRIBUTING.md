# Contributing to TaskPet

Thank you for helping improve TaskPet.

1. Fork the repository and create a focused branch.
2. Install frontend dependencies with `npm ci`.
3. Create an isolated Python environment and install `server/requirements.txt`.
4. Make a small, reviewable change with tests where practical.
5. Run `npm run build` and, from `server/`, run `python -m pytest`.
6. Open an issue for bugs or larger design proposals, then submit a pull request with a clear summary and verification notes.

Never commit credentials, `.env` files, real-person photographs, generated character media, user spreadsheets, business data, runtime directories, caches, or raw provider responses. Tests and examples must use synthetic or mocked data.

TaskPet currently has no documented public CI workflow, so contributors should include the local commands and results they ran in the pull request.
