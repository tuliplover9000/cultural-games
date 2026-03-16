/**
 * games-data.js — Single source of truth for the game catalogue.
 * Add or remove entries here and all stat displays update automatically.
 *
 * Exposes: window.GAMES_DATA
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
];
