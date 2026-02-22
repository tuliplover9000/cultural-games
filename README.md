# Cultural Games

A website for discovering and playing traditional games from cultures around the world — preserved and brought to life in the browser.

## Games

| Game | Culture | Type | Phase |
|---|---|---|---|
| Bầu Cua Tôm Cá | Vietnam | Dice | Phase 2 |
| Ô Ăn Quan | Vietnam | Board | Phase 3 |
| Tiến Lên | Vietnam | Card | Phase 4 |
| Oware | West Africa | Board | Phase 5 |
| Patolli | Aztec Mesoamerica | Dice | Phase 6 |

## Development Phases

- [x] **Phase 0** — Project setup, folder structure, global CSS, nav/footer, deployment
- [ ] Phase 1 — Homepage, Browse page, About page, game page shells
- [ ] Phase 2 — Bầu Cua Tôm Cá (playable)
- [ ] Phase 3 — Ô Ăn Quan (playable)
- [ ] Phase 4 — Tiến Lên (playable)
- [ ] Phase 5 — Oware (playable)
- [ ] Phase 6 — Patolli (playable)
- [ ] Phase 7 — Real-time multiplayer
- [ ] Phase 8 — User accounts & progression
- [ ] Phase 9 — Tournament system
- [ ] Phase 10 — Polish & public launch
- [ ] Phase 11 — Expansion

## Tech Stack

- Pure HTML5, CSS3, and vanilla JavaScript — no framework required
- Google Fonts: [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) + [Inter](https://fonts.google.com/specimen/Inter)
- Deployed on Netlify (static hosting, no build step)

## Folder Structure

```
/cultural-games
├── index.html
├── pages/
│   ├── browse.html
│   ├── about.html
│   └── games/
│       ├── bau-cua.html
│       ├── o-an-quan.html
│       ├── tien-len.html
│       ├── oware.html
│       └── patolli.html
├── css/
│   ├── global.css       ← design tokens, reset, base styles
│   ├── components.css   ← nav, footer, buttons, cards
│   └── games.css        ← game page layouts and game-specific styles
├── js/
│   ├── games/           ← one file per game
│   └── utils/
│       ├── navigation.js
│       └── helpers.js
├── assets/
│   ├── images/
│   └── icons/
└── README.md
```

## Design Tokens

All colors, fonts, spacing, radii, and shadows are defined as CSS custom properties in `css/global.css`. Edit them there to change the look of the entire site.

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#FBF5E6` | Warm parchment page background |
| `--color-primary` | `#1A0E06` | Dark walnut — nav, footer |
| `--color-accent-red` | `#B83232` | Festival red — primary CTA |
| `--color-accent-gold` | `#C89B3C` | Antique gold — logo, highlights |
| `--color-accent-teal` | `#2C7873` | Jade teal — tags, secondary accent |
| `--font-display` | Playfair Display | Headings |
| `--font-body` | Inter | Body text |

## Deployment

### Netlify (recommended)
1. Push this repo to GitHub
2. Log in to [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project**
3. Connect your GitHub repo
4. Build command: *(leave empty)*
5. Publish directory: `.`
6. Click **Deploy**

### GitHub Pages
1. Push to a GitHub repo
2. Go to **Settings → Pages**
3. Source: **Deploy from a branch** → `main` → `/ (root)`
4. Your site will be live at `https://yourusername.github.io/cultural-games/`
