# Brief — anmol@portfolio, a Claude Code terminal session

The site must look like Anmol's actual Claude Code session in macOS Terminal.app
(Menlo, black background). Six reference screenshots were supplied; their visual
vocabulary is binding:

## Palette (from the references)
- bg #000000 · user-message block bg #3a3a3a
- response green #5fdf5f · bold white #ffffff · grey meta #9a9a9a · dim grey #6f6f6f
- Claude orange #d9825a — ONLY for: ✻ spinner + status word, Thwip mascot, ● tool-call
  bullets, the welcome-banner frame + its bold headers, heatmap cells, highlighted tab
- lavender #b4a7f5 inline code · yellow #e8b75a ⚠ notices · pink #f27089 status-bar mode
- blue #7ea8f5 only for a secondary tab/link accent if needed

## Structure (top → bottom)
1. Welcome banner: orange box frame with title in the top rule; left pane bold-white
   greeting + orange Thwip + grey meta lines; right pane orange bold "Tips for getting
   started" (green line: type /projects…), dashed rule, orange bold "What's new" with
   3 green lines of REAL latest facts + grey "/experience for more".
2. Yellow ⚠ line: "⚠ open to internships (summer 2027) · run /contact".
3. Sent message: grey block, dim › glyph, WHITE text "tell me about anmol agarwal" typed live.
4. Spinner: orange "✻ Noodling…" + grey "(1.2s · ↓ 2.1k tokens · thinking with high effort)"
   + grey "⎿ Tip: …" line. Rotating words.
5. Response: green ● + green text; bold → white; inline code lavender; then sections:
   projects (tool-call cards), experience (BSERC done, SkyWatch capstone), cp, stack,
   stats (Stats-tab style: orange dot-matrix streak + stat rows, streak 242 days), contact.
   Grey summary "Read N files, listed 1 directory, ran 0 shell commands" (numbers bold white).
   "✻ Worked for Ns" grey. "※ recap:" grey.
6. Fixed footer: dashed rule → › input (grey block cursor, tab-complete ghost) → dashed rule
   → status bar "▶▶ open to internships (summer 2027)" pink + grey "(shift+tab to cycle) ·
   esc to interrupt · ← 1 visitor" + right "/portfolio".

## Rules
- Every fact from src/data/portfolio.ts only. No CP_inventory. No Anthropic marks.
- Real text in DOM; reduced-motion & no-JS show the finished transcript; any key skips.
- Mobile ≥ 360px readable; no horizontal scroll; 60fps; near-instant load.
- Typography: Menlo → SF Mono → JetBrains Mono fallback, 14px/1.55.
