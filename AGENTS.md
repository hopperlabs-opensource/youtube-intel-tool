# Agent Operating Rules (YouTube Intel Tool)

## Git Workflow (Hard Rule)
- NEVER create a branch.
- NEVER open a PR as a workaround.
- ALWAYS work directly on `main`.
- ALWAYS commit on `main`.
- ALWAYS attempt to push directly to `origin/main`.

## If Push Is Blocked
- If branch protection blocks pushing to `main`, STOP.
- Do not create a branch.
- Do not create a PR.
- Report the exact blocking rule/check and ask the user to adjust repository protection/bypass settings so direct pushes to `main` are allowed for the maintainer.

## Intent
- Keep a single-branch workflow with zero branch/PR divergence.
