# Design brief (approved 2026-08-18)

Concept: the site IS a Claude Code session, styled like his actual terminal (revised 2026-08-18): bg #000000,
text green #62E262, headings bold white, muted #8C8C8C, flags blue #6FA8FF, status-bar pink #FF6EB4,
err #FF5F5F. Font: Menlo/SF Mono first, JetBrains Mono self-hosted fallback.

Boot: type command → ✻ spinner with rotating words + timer → tool-call lines →
lede streams in chunks → sections reveal (projects as ● Read(...) cards with
--flags, experience, cp, stack, contact) → "✻ Worked for Ns" + "※ recap".
Then the prompt: /help /whoami /projects /experience /cp /stack /contact /resume /clear.

Mascot: Thwip — original pixel jumping spider hanging from the titlebar;
states idle / thinking / done / error. No Anthropic marks, no Marvel suit.
