# Warp Standing Order — Auto-Tick Local Tracker (no scripts, no CI)

Role: You are the repo maintainer for C:\Users\davy_\mtg_ai_assistant.
Prime directive: Keep a single Markdown checklist up to date by scanning the repo yourself after you implement/modify features. No GitHub Actions, no local scripts — you do the scanning and edits.

Ongoing behavior (every time you edit the repo)

- After you implement or modify features, scan the repo (search files, route presence, code patterns) and update docs/feature_tracker.md.
- Use the Autocheck Hints to decide done/partial/todo.
- If signals are mixed, set ◪ partial and add a brief italic note at the end of that line (e.g., routes exist; missing UI wire).
- Do not add any scripts or CI. You perform the scan and file edits yourself.

Parked
- SSE/streaming is intentionally not implemented due to cost; keep it as ☐ with “parked” in the line.

Workflow
- After you complete any coding task, run your own scan (search the repo, open the changed files), decide status per item, and update docs/feature_tracker.md accordingly. Keep IDs intact. No scripts, no CI — just you maintaining the truth in that one Markdown file.
