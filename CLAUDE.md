# CLAUDE.md — Cultural Games project rules

## TECH STACK
- Pure HTML/CSS/vanilla JS only. No external libraries, no npm, no build tools.
- IIFE pattern for all JS modules (no ES modules, no import/export except where already established)
- Canvas-based rendering for all games
- GitHub Pages hosting — everything must work as static files

## CANVAS & THEMING
- Canvas cannot read CSS variables directly via fillStyle
- All canvas colors must be bridged through window.CGTheme
- window.CGTheme is populated from CSS variables at runtime
- Never hardcode colors in canvas draw calls — always use window.CGTheme.*

## CSS NAMESPACING
- Each game has its own CSS namespace prefix (e.g. .tl- for Tiến Lên, .bc- for Bầu Cua)
- Shared styles live in /shared/
- Never use generic class names that could collide across games

## SUPABASE
- Free tier — be mindful of read/write volume
- State sync uses full-state blob pattern (entire game state in one JSON column)
- Echo suppression via last_actor field — always include this in state updates
- No Edge Functions (not available on free tier)
- RLS is enabled — any new tables need RLS policies

## FILE STRUCTURE
- /shared/utils/ — shared utility JS files (sanitize.js, rate-limit.js, etc.)
- /shared/ — shared CSS and infrastructure JS
- Each game has its own JS file and room JS file
- Auth logic is in auth.js which loads on all 20+ pages

## COMMON MISTAKES TO AVOID
- Do not use localStorage for anything security-sensitive
- Do not use innerHTML with unsanitized user input — use esc() or sanitizeText()
- Do not add external script tags or CDN dependencies
- Do not use ES module syntax (import/export) in game files
- Do not create new Supabase tables without adding RLS policies
- Canvas colors must go through window.CGTheme, not CSS variables directly

## BEFORE MAKING CHANGES
- Always show the list of files you plan to modify and wait for confirmation on changes touching 5+ files
- Existing game files are the structural template — match their patterns exactly

## SELF-UPDATING RULES
- When the user corrects a mistake, adds a preference, or says something like "remember that" or "add that to your memory" — immediately update CLAUDE.md with the new rule before continuing
- When the user approves of a pattern or says something like "I like that" or "do it like this always" — add it to CLAUDE.md as a preferred pattern
- After updating CLAUDE.md, confirm what was added with a one-line summary
- Keep additions concise — one or two lines max per rule
