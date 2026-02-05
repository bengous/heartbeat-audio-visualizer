# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server at http://localhost:3000
bun run lint         # Lint with Biome
bun run format       # Format with Biome
bun run check        # Lint + format with auto-fix
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

## Skills

Use these skills for UI/frontend work:
- `/frontend-design` - distinctive, production-grade interfaces
- `vercel-react-best-practices` - React/Next.js optimization
- `web-design-guidelines` - UI audit (trigger: "Review my UI")
- `vercel-composition-patterns` - component architecture
