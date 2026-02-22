# Cultural Games — Project Memory

## Stack
- Pure HTML5 / CSS3 / Vanilla JS (no framework, no build step)
- Google Fonts: Playfair Display (headings) + Inter (body)
- Deployed: Netlify (netlify.toml at root, publish = ".")
- Git: initialized, local identity set (dev@culturalgames.app)

## Folder Structure
```
/cultural-games
├── index.html                    ← root
├── pages/browse.html
├── pages/about.html
├── pages/games/{bau-cua,o-an-quan,tien-len,oware,patolli}.html
├── css/global.css                ← design tokens + reset
├── css/components.css            ← nav, footer, buttons, cards
├── css/games.css                 ← game page layouts
├── js/utils/navigation.js        ← active link + mobile menu
├── js/utils/helpers.js           ← shared utilities
├── js/games/{bau-cua,o-an-quan,tien-len,oware,patolli}.js
└── assets/{images,icons}/
```

## Relative Path Rules
- From index.html → css/global.css, pages/browse.html
- From pages/*.html → ../css/global.css, ../index.html, about.html, games/x.html
- From pages/games/*.html → ../../css/global.css, ../../index.html, ../browse.html

## Design Tokens (in css/global.css)
- --color-bg: #FBF5E6 (parchment)
- --color-primary: #1A0E06 (dark walnut)
- --color-accent-red: #B83232
- --color-accent-gold: #C89B3C
- --color-accent-teal: #2C7873
- --font-display: Playfair Display
- --font-body: Inter
- --space-N: 8px base unit (--space-1=8px, --space-2=16px, etc.)

## Phase Status
- [x] Phase 0: COMPLETE (committed, git initialized)
- [ ] Phase 1: Not started (wait for user)

## Deployment Steps (for user)
1. Push repo to GitHub
2. Netlify: Import project → connect repo → publish dir: "." → deploy
3. GitHub Pages: Settings → Pages → source: main / root
