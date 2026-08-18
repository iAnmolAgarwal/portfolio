# anmol@portfolio

Personal site styled as a Claude Code terminal session: the page types
`claude "who is anmol agarwal"`, thinks, and streams the answer — which is the
portfolio. Astro (static) + vanilla TypeScript, self-hosted JetBrains Mono, no
runtime framework.

- Content lives in `src/data/portfolio.ts` — every fact traces to the résumé or a public repo README.
- `src/scripts/session.ts` — typing, spinner, streaming, slash-command prompt (tab-complete, suggestions).
- `src/components/Thwip.astro` — Thwip, the original pixel jumping-spider mascot (inline SVG, CSS states).
- Reduced-motion / no-JS / deep-link visitors get the finished answer instantly; all text is real DOM.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```
