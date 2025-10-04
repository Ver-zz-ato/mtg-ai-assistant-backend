Project: ManaTap AI
Date: 2025-10-04
Owner: Handover for next session

Overview
- This handover summarizes recent changes, current debug tooling for the persistent spacing issue, a verification checklist, known build warnings/notes, and precise next steps.

Key recent changes (high level)
- CSP updates to allow Scryfall API and mana symbol images.
- Proxy route for chat posting to avoid TLS issues; chat functional.
- CSV parsing handles ampersand-delimited lines (e.g., 10x&Forest&The Lord of the Rings).
- Removed legacy DBG button in Profile.
- Save Profile button now publishes changes immediately.
- Fix card names (batch and individual) call internal handlers and avoid TLS proxy.
- Deck deletion confirmation replaced with a typed modal confirmation in /mydecks and deck pages.
- New badges system replacing homepage tools panel and right-sidebar snapshot with PNG badges (static imports).
- Tightened spacing around top badges and right-sidebar snapshot + creator (multiple passes). Added compact mode to CustomCardCreator to remove outer chrome.

Files touched (recent)
- frontend/components/RightSidebar.tsx
- frontend/components/TopToolsStrip.tsx
- frontend/Badges/TopBadges.tsx
- frontend/Badges/DeckSnapshotHorizontal.tsx
- frontend/components/CustomCardCreator.tsx (added compact prop + UI adjustments)
- frontend/app/page.tsx

Current spacing debug tooling
- Toggle via URL: add ?dbg=space to the homepage URL. Example: https://<host>/?dbg=space
- Toggle in UI: Small “DBG” button appears at the top-right of the right sidebar; click to toggle.
- Visual guides:
  - Top badges container: amber outline with thin amber rulers above and below the container.
  - Right sidebar snapshot: fuchsia outline with rulers above and below the snapshot element.
  - Custom Card Creator (compact): sky outline with rulers above and below the block.
- Interpretation:
  - If you see visible space between the fuchsia bottom ruler (snapshot) and sky top ruler (creator), the gap is from CSS/layout between these siblings.
  - If the snapshot image appears to have space inside its outline, it’s likely padding within the PNG asset itself.

What’s implemented to remove layout gaps
- RightSidebar container:
  - flex-col with gap-0; removes default margins/padding on children via utility selectors.
  - Forces images to display:block, align-bottom, m-0, p-0.
- Snapshot component (DeckSnapshotHorizontal.tsx): returns only an <img> with block + align-bottom + no margins/padding.
- CustomCardCreator rendered directly (no wrapper div), in compact mode (no outer padding/border/margins).
- Top badges spacing tightened:
  - TopBadges outer container mb-0.
  - TopToolsStrip reduced container margins/padding when custom badges are present.
- app/page.tsx: reduced padding around the badges and main grid (pt-0, py-0).

Verification checklist
1) Spacing debug
   - Load /?dbg=space, toggle DBG if needed.
   - Confirm fuchsia and sky rulers are directly abutting. If not, note which side shows extra space.
   - Confirm amber rulers for TopBadges hug the container with no extra gap above/below.
2) Chat
   - Send a message; verify no TLS/500. Expect normal reply or offline fallback.
3) Fix card names
   - Batch and individual suggestions should load without fetch errors.
4) CSV import
   - Paste ampersand-delimited lines; verify correct parsing.
5) Profile UI
   - DBG button gone; Save profile button publishes to public profile.
6) Custom Card Wallet
   - When empty, shows nudge with homepage link.
7) Pins and Sharing
   - No bad_origin when saving pins or sharing profile.
8) Pro Badge
   - Reflects after refresh/sign in/out when toggled by admin.

Known warnings/notes
- Optional badges fallbacks (TopRow, index, Deck-Snapshot-Horizontal, Deck_Snapshot_Horizontal) trigger module-not-found warnings at build. These are expected because only TopBadges and DeckSnapshotHorizontal exist. Harmless unless you want perfectly clean builds—can remove fallback requires if desired.
- Last local build run reported an unhandledRejection PageNotFoundError: Cannot find module for page: /_document. This is unusual for App Router projects and may be environmental. Suggested checks:
  - Remove .next and rebuild: rmdir /s /q .next (Windows) then npm --prefix frontend run build
  - Ensure you aren’t mixing a pages/ directory requiring _document.tsx; the codebase appears to be app/ only.
  - Confirm Next.js version alignment (Next 15) and plugins that might reference /_document.
  - If it persists only locally and not on Render, it may be transient.

Open items / next actions
- Spacing: If gap persists between snapshot and creator with rulers abutting, likely image padding in the PNG. If the rulers themselves have space between them, I can:
  - Add explicit leading-none and text-[0px] to the immediate parent to eliminate any inline/line-height artifacts as a belt-and-braces approach.
  - Inspect any tailwind prose/typography classes that may impose margins on first/last children, and override with [>&_*]:m-0.
- Clean build warnings by removing fallback requires for nonexistent badge modules if you prefer a quiet build.
- Optionally add server logs around /api/chat for any remaining edge cases.
- Optional: Auto-refresh Pro badge state on toggle.

Local commands
- Build: npm --prefix frontend run build
- Dev: npm --prefix frontend run dev

Rollbacks/toggles
- Spacing debug can be disabled by removing ?dbg=space and not using the DBG toggle. The code paths are fully no-op unless enabled.
- If desired later, I can cleanly remove all debug code and leave only the spacing fixes.

Handoff notes
- You can start the next chat referencing this handover. If you capture a screenshot with ?dbg=space enabled showing the ruler lines where the gap persists, I can pinpoint the exact class or apply targeted overrides (e.g., leading-none or text-[0px] on the wrapper, or eliminating any remaining margins on first/last children).
