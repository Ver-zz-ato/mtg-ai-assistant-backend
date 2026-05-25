## Archive Policy

This repo keeps only live product code in `frontend/app`, `frontend/components`, and `frontend/lib`.

### Where snapshots go

- Short-lived local experiments: keep them outside the repo when possible.
- Repo-kept snapshots and historical references: move them under `C:\Users\davy_\Projects\mtg_ai_assistant\archive\frontend-snapshots\`.
- Phase notes, handovers, and audits that still help current work can stay in `frontend/docs`.

### What should not live in runtime folders

- `*.backup_*`
- `*.bak`
- one-off phase snapshots
- old copies of route/page/component files

These files add search noise and make it easier to edit the wrong source file.

### Exceptions

These can stay where they are if they are active tooling:

- admin or API routes whose name includes `backup` but are real product/admin surfaces
- scripts used for audits, migrations, or recovery
- docs that explain a shipped feature or an active workflow

### Rule of thumb

If a file is not meant to be imported, rendered, or executed as part of the current product, archive it instead of leaving it beside live source.
