/**
 * games-data.js - Single source of truth for the game catalogue.
 * Add or remove entries here and all stat displays update automatically.
 *
 * Exposes: window.GAMES_DATA
 *
 * CANONICAL NAME REFERENCE (Phase A)
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical Name          | key           | Culture
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiến Lên               | tien-len      | Vietnam
 * Bầu Cua Tôm Cá         | bau-cua       | Vietnam
 * Ô Ăn Quan              | o-an-quan     | Vietnam
 * Oware                  | oware         | West Africa
 * Patolli                | patolli       | Mesoamerica
 * Puluc                  | puluc         | Mesoamerica
 * Pallanguzhi            | pallanguzhi   | South India
 * Fanorona               | fanorona      | Madagascar
 * Hnefatafl              | hnefatafl     | Norse
 * Hong Kong Mahjong      | mahjong       | China
 * Pachisi                | pachisi       | Indian Subcontinent
 * Ganjifa                | ganjifa       | Mughal India
 * Ludus Latrunculorum    | latrunculi    | Roman Empire
 * Cachos                 | cachos        | Latin America
 * Xinjiang Fangqi        | xinjiang-fangqi | Xinjiang
 * ─────────────────────────────────────────────────────────────────────────────
 * Filipino Dama         | filipino-dama | Philippines
 * Cuarenta              | cuarenta      | Ecuador
 * ─────────────────────────────────────────────────────────────────────────────
 * Total: 17 games, 14 unique cultures
 */
window.GAMES_DATA = [
  { key: 'tien-len',    name: 'Tiến Lên',          culture: 'Vietnam',             type: 'Card',     maxPlayers: 4 },
  { key: 'bau-cua',     name: 'Bầu Cua Tôm Cá',    culture: 'Vietnam',             type: 'Dice',     maxPlayers: 8 },
  { key: 'o-an-quan',   name: 'Ô Ăn Quan',          culture: 'Vietnam',             type: 'Board',    maxPlayers: 2 },
  { key: 'oware',       name: 'Oware',              culture: 'West Africa',         type: 'Board',    maxPlayers: 2 },
  { key: 'patolli',     name: 'Patolli',            culture: 'Mesoamerica',         type: 'Dice',     maxPlayers: 2 },
  { key: 'puluc',       name: 'Puluc',              culture: 'Mesoamerica',         type: 'Dice',     maxPlayers: 2 },
  { key: 'pallanguzhi', name: 'Pallanguzhi',        culture: 'South India',         type: 'Board',    maxPlayers: 2 },
  { key: 'fanorona',    name: 'Fanorona',           culture: 'Madagascar',          type: 'Board',    maxPlayers: 2 },
  { key: 'hnefatafl',   name: 'Hnefatafl',          culture: 'Norse',               type: 'Strategy', maxPlayers: 2 },
  { key: 'mahjong',     name: 'Hong Kong Mahjong',  culture: 'China',               type: 'Tile',     maxPlayers: 4 },
  { key: 'pachisi',     name: 'Pachisi',            culture: 'Indian Subcontinent', type: 'Dice',     maxPlayers: 4 },
  { key: 'ganjifa',    name: 'Ganjifa',            culture: 'Mughal India',        type: 'Card',     maxPlayers: 4 },
  { key: 'latrunculi', name: 'Ludus Latrunculorum', culture: 'Roman Empire',        type: 'Strategy', maxPlayers: 2, id: 'latrunculi', region: 'Europe', description: 'Ancient Roman strategy game of capture and command', href: 'pages/games/latrunculi.html', iconPath: 'assets/icons/latrunculi.svg' },
  { key: 'cachos',          name: 'Cachos',             culture: 'Latin America',       type: 'Dice',     maxPlayers: 6 },
  { key: 'xinjiang-fangqi', name: 'Xinjiang Fangqi',   culture: 'Xinjiang',            type: 'Strategy', maxPlayers: 2 },
  { key: 'filipino-dama',   name: 'Filipino Dama',     culture: 'Philippines',         type: 'Board',    maxPlayers: 2 },
  { key: 'cuarenta',        name: 'Cuarenta',          culture: 'Ecuador',             type: 'Card',     maxPlayers: 2 },
];
