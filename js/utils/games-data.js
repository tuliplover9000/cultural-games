/**
 * games-data.js - Single source of truth for the game catalogue.
 * Add or remove entries here and all stat displays update automatically.
 *
 * Exposes: window.GAMES_DATA
 *
 * Fields per entry:
 *   key, name, culture, type, maxPlayers   — existing
 *   region      — map region key (used by browse-panel)
 *   path        — URL relative to pages/ directory
 *   description — one-sentence cultural origin (browse panel)
 *   didYouKnow  — single interesting fact, max 120 chars
 *   complexity  — 1–5 rating
 *   players     — player count string e.g. '2', '2–4'
 */
window.GAMES_DATA = [
  {
    key: 'tien-len', name: 'Tiến Lên', culture: 'Vietnam', type: 'Card', maxPlayers: 4,
    region: 'southeast-asia', path: 'games/tien-len.html',
    description: "Vietnam's most beloved card game, played from Hanoi's streets to family tables across the diaspora.",
    didYouKnow: "The name means \"go forward\" — the goal is to be first to shed all your cards.",
    complexity: 2, players: '2–4',
  },
  {
    key: 'bau-cua', name: 'Bầu Cua Tôm Cá', culture: 'Vietnam', type: 'Dice', maxPlayers: 8,
    region: 'southeast-asia', path: 'games/bau-cua.html',
    description: "A festive dice betting game played at Tết celebrations across Vietnam, named after six symbols on the dice.",
    didYouKnow: "Bầu Cua means \"gourd crab\" — named after two of the six symbols on the dice.",
    complexity: 1, players: '2–8',
  },
  {
    key: 'o-an-quan', name: 'Ô Ăn Quan', culture: 'Vietnam', type: 'Board', maxPlayers: 2,
    region: 'southeast-asia', path: 'games/o-an-quan.html',
    description: "An ancient Vietnamese mancala where players sow seeds and race to capture the mandarin's squares.",
    didYouKnow: "The name translates to \"mandarin's box eating\" — the mandarin squares hold the most seeds.",
    complexity: 2, players: '2',
  },
  {
    key: 'oware', name: 'Oware', culture: 'West Africa', type: 'Board', maxPlayers: 2,
    region: 'west-africa', path: 'games/oware.html',
    description: "One of the oldest games in the world, played across West Africa and carried to the Caribbean by the Akan diaspora.",
    didYouKnow: "Oware is played across West Africa and the Caribbean — the diaspora carried it across the Atlantic.",
    complexity: 3, players: '2',
  },
  {
    key: 'patolli', name: 'Patolli', culture: 'Mesoamerica', type: 'Dice', maxPlayers: 4,
    region: 'mesoamerica', path: 'games/patolli.html',
    description: "A sacred Aztec race game played on a cross-shaped board — nobles bet precious stones and even their freedom on the outcome.",
    didYouKnow: "Patolli was played by the Aztec nobility as both a game and a ritual — stakes could include precious stones.",
    complexity: 3, players: '2–4',
  },
  {
    key: 'puluc', name: 'Puluc', culture: 'Mesoamerica', type: 'Dice', maxPlayers: 2,
    region: 'mesoamerica', path: 'games/puluc.html',
    description: "A Maya war game where captured pieces become prisoners — one of the only surviving pre-Columbian race games with original documented rules.",
    didYouKnow: "Puluc is one of the only surviving pre-Columbian race games with documented original rules.",
    complexity: 3, players: '2',
  },
  {
    key: 'pallanguzhi', name: 'Pallanguzhi', culture: 'South India', type: 'Board', maxPlayers: 2,
    region: 'south-asia', path: 'games/pallanguzhi.html',
    description: "An ancient Tamil mancala played across South India for centuries, with boards once carved into the steps of temples.",
    didYouKnow: "Pallanguzhi boards were traditionally carved into the steps of South Indian temples.",
    complexity: 2, players: '2',
  },
  {
    key: 'fanorona', name: 'Fanorona', culture: 'Madagascar', type: 'Board', maxPlayers: 2,
    region: 'madagascar', path: 'games/fanorona.html',
    description: "Madagascar's national strategy game, played for centuries — legend holds that a king's defeat foretold colonial conquest.",
    didYouKnow: "Fanorona is Madagascar's national game — legend says a king's defeat at Fanorona foretold a colonial conquest.",
    complexity: 4, players: '2',
  },
  {
    key: 'hnefatafl', name: 'Hnefatafl', culture: 'Norse', type: 'Strategy', maxPlayers: 2,
    region: 'northern-europe', path: 'games/hnefatafl.html',
    description: "The Viking war game that preceded chess in Scandinavia by centuries, played from Iceland to Russia during the Viking Age.",
    didYouKnow: "Hnefatafl predates chess in Scandinavia by centuries — Vikings carried it across Europe and to Iceland.",
    complexity: 4, players: '2',
  },
  {
    key: 'mahjong', name: 'Hong Kong Mahjong', culture: 'China', type: 'Tile', maxPlayers: 4,
    region: 'east-asia', path: 'games/mahjong.html',
    description: "The iconic Chinese tile game beloved across East Asia, refined in Hong Kong's distinctive variant with fan scoring.",
    didYouKnow: "Mahjong's exact origins are debated — some trace it to a card game invented by Confucius himself.",
    complexity: 4, players: '4',
  },
  {
    key: 'pachisi', name: 'Pachisi', culture: 'Indian Subcontinent', type: 'Dice', maxPlayers: 4,
    region: 'south-asia', path: 'games/pachisi.html',
    description: "India's royal game, once played at Fatehpur Sikri with palace servants as living pieces — the ancestor of Ludo and Parcheesi.",
    didYouKnow: "The giant courtyard game at Fatehpur Sikri used slaves as living pieces — Emperor Akbar played it there.",
    complexity: 3, players: '2–4',
  },
  {
    key: 'ganjifa', name: 'Ganjifa', culture: 'Mughal India', type: 'Card', maxPlayers: 4,
    region: 'south-asia', path: 'games/ganjifa.html',
    description: "An elaborate Mughal card game played with hand-painted circular cards — each deck a unique work of art.",
    didYouKnow: "Ganjifa cards were hand-painted on lacquered cloth — a single deck could take months to produce.",
    complexity: 5, players: '2–6',
  },
  {
    key: 'latrunculi', name: 'Ludus Latrunculorum', culture: 'Roman Empire', type: 'Strategy', maxPlayers: 2,
    region: 'southern-europe', path: 'games/latrunculi.html',
    description: "The Roman legions' favourite strategy game, played across the Empire for over 400 years from Britain to Egypt.",
    didYouKnow: "Latrunculi was the Roman legions' favourite strategy game — boards have been found at Hadrian's Wall.",
    complexity: 3, players: '2',
  },
  {
    key: 'cachos', name: 'Cachos', culture: 'Latin America', type: 'Dice', maxPlayers: 6,
    region: 'south-america', path: 'games/cachos.html',
    description: "The most popular dice bluffing game in Latin America, played with five dice and leather shaking cups at every gathering.",
    didYouKnow: "Cachos is Ecuador's most popular dice game — no family gathering is complete without a set of leather cups.",
    complexity: 2, players: '2–6',
  },
  {
    key: 'xinjiang-fangqi', name: 'Xinjiang Fangqi', culture: 'Xinjiang', type: 'Strategy', maxPlayers: 2,
    region: 'central-asia', path: '../xinjiang-fangqi/',
    description: "An ancient strategy game from the Silk Road crossroads of Xinjiang — one of the oldest grid-based games in Central Asia.",
    didYouKnow: "Fangqi translates to \"square chess\" — it's one of the oldest grid-based strategy games in Central Asia.",
    complexity: 3, players: '2',
  },
  {
    key: 'filipino-dama', name: 'Filipino Dama', culture: 'Philippines', type: 'Board', maxPlayers: 2,
    region: 'southeast-asia', path: '../filipino-dama/',
    description: "Philippine draughts with a distinctive twist — pieces crowned as Dama queens can slide the full diagonal.",
    didYouKnow: "Filipino Dama is a faster variant of draughts — pieces can chain multiple captures in a single turn.",
    complexity: 2, players: '2',
  },
  {
    key: 'cuarenta', name: 'Cuarenta', culture: 'Ecuador', type: 'Card', maxPlayers: 2,
    region: 'south-america', path: 'games/cuarenta.html',
    description: "Ecuador's national card game, played passionately from Quito's cafés to rural Sierra communities since the colonial era.",
    didYouKnow: "Cuarenta is Ecuador's national card game — partners are forbidden from communicating, making silent intuition everything.",
    complexity: 4, players: '2 or 4',
  },
];
