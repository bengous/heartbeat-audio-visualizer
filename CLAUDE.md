# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server at http://localhost:3000
bun run lint         # Lint with Biome
bun run format       # Format with Biome
bun run check        # Lint + format with auto-fix
bun run build        # Bundle for production (minified, tree-shaken, outputs to dist/)
```

## Architecture

Single-file React application (`heartbeat.jsx`) - a heartbeat audio visualizer with:

- **Web Audio API synthesis** - `createHeartbeatSound()` generates realistic heartbeat using layered oscillators (S1/S2 heart sounds) plus filtered noise for the "thump" transient
- **Canvas EKG visualization** - `EKG` component renders animated electrocardiogram waveform using `requestAnimationFrame`, speed scales with BPM
- **Heart rate zones** - BPM classified into medical zones (Bradycardia <60, Resting 60-100, Moderate 100-140, Vigorous 140-170, Maximum >170)

BPM range: 30-220, controlled via slider, direct input, or preset buttons (Sleep/Rest/Walk/Run/Sprint).

## Code Style

- Biome: single quotes, no semicolons, 2-space indent
- Biome schema must match installed version - run `bunx biome migrate --write` after upgrades
- Pin dependency versions (no `^` or `latest` in package.json)
- TypeScript strict mode enabled
- React JSX with inline styles (no external CSS files)
- Biome a11y rules: `noSvgWithoutTitle`, `useButtonType` (auto-checked via hook)
- `bunx biome lint <file>` - lint single file (avoids scanning skills directories with broken symlinks)

## Patterns

- Uses Dan Abramov's `useInterval` hook for dynamic timing without audio gaps

## Deployment

GitHub Pages at https://b3ngous.github.io/heartbeat-audio-visualizer/

- CI workflow: `.github/workflows/deploy.yml` - auto-deploys on push to main
- Build uses `--public-path '/heartbeat-audio-visualizer/'` for GitHub Pages subdirectory
- Bun version in CI must match local (`bun --version`) for reproducible builds
- Actions pinned to SHA commits for supply chain security

## Skills

Use these skills for UI/frontend work:
- `/frontend-design` - distinctive, production-grade interfaces
- `vercel-react-best-practices` - React/Next.js optimization
- `web-design-guidelines` - UI audit (trigger: "Review my UI")
- `vercel-composition-patterns` - component architecture
