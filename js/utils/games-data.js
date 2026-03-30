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
 *   description — 2–3 sentence cultural origin (browse panel)
 *   didYouKnow  — single striking fact, max ~150 chars
 *   complexity  — 1–5 rating
 *   players     — player count string e.g. '2', '2–4'
 */
window.GAMES_DATA = [
  {
    key: 'tien-len', name: 'Tiến Lên', culture: 'Vietnam', type: 'Card', maxPlayers: 4,
    region: 'southeast-asia', path: 'games/tien-len.html',
    description: "Vietnam's most beloved card game, played everywhere from Hanoi coffee shops to diaspora kitchens in California and Sydney. The name means \"go forward\" — a phrase that captures a Vietnamese cultural value of persistence and momentum. It spread rapidly after the 1970s, becoming a staple of community gatherings wherever Vietnamese families resettled abroad.",
    didYouKnow: "Tiến Lên became a lifeline for Vietnamese diaspora communities — a shared game that needed no translation across generations.",
    complexity: 2, players: '2–4',
  },
  {
    key: 'bau-cua', name: 'Bầu Cua Tôm Cá', culture: 'Vietnam', type: 'Dice', maxPlayers: 8,
    region: 'southeast-asia', path: 'games/bau-cua.html', howToPlay: 'how-to-play/bau-cua/',
    description: "A festive betting game inseparable from Tết — Vietnam's Lunar New Year — played on patterned cloth mats spread across living room floors. The six symbols (gourd, crab, shrimp, fish, rooster, deer) each carry traditional associations with luck and prosperity. Gambling is culturally permitted during Tết, and Bầu Cua is the game Vietnamese families return to year after year, grandparents teaching grandchildren the same rules they learned as children.",
    didYouKnow: "Bầu Cua is one of the few gambling games officially tolerated in Vietnam — only during the Tết holiday period.",
    complexity: 1, players: '2–8',
  },
  {
    key: 'o-an-quan', name: 'Ô Ăn Quan', culture: 'Vietnam', type: 'Board', maxPlayers: 2,
    region: 'southeast-asia', path: 'games/o-an-quan.html',
    description: "An ancient Vietnamese mancala that has taught children arithmetic and strategic thinking for centuries through the language of seeds and pits. The \"mandarin squares\" at each end hold far more seeds than the small pits, creating a power imbalance that rewards patience and long-range thinking. It was traditionally played by children on dirt boards scratched into the ground — no equipment needed beyond a handful of pebbles or seeds.",
    didYouKnow: "The mandarin squares can hold over 30 seeds each — capturing one is often more valuable than winning the entire row of small pits.",
    complexity: 2, players: '2',
  },
  {
    key: 'oware', name: 'Oware', culture: 'West Africa', type: 'Board', maxPlayers: 2,
    region: 'west-africa', path: 'games/oware.html', howToPlay: 'how-to-play/oware/',
    description: "One of the world's oldest continuously played games, with roots in Akan culture going back at least 7,000 years. The \"starvation rule\" — requiring a player to always leave the opponent with seeds to play — encodes Akan values of fairness and communal responsibility directly into the game's mechanics. Enslaved Akan people carried Oware to the Caribbean, where it still survives in Jamaica, Trinidad, and Barbados under different names.",
    didYouKnow: "Oware boards have been found in ancient Egypt, suggesting the game may have spread along trade routes across the entire African continent.",
    complexity: 3, players: '2',
  },
  {
    key: 'patolli', name: 'Patolli', culture: 'Mesoamerica', type: 'Dice', maxPlayers: 4,
    region: 'mesoamerica', path: 'games/patolli.html',
    description: "A sacred Aztec race game whose cross-shaped board mapped the cosmos, with 52 spaces mirroring the 52-year cycle of the sacred Aztec calendar. Spanish chronicler Fray Bernardino de Sahagún documented nobles gambling away gold, precious stones, and sometimes their own freedom at Patolli matches. The Spanish banned it as idolatry in the 16th century, nearly erasing a game that had been played across Mesoamerica for over a thousand years.",
    didYouKnow: "The god Macuilxochitl — patron of games and gambling — was believed to watch every Patolli match and punish those who cheated.",
    complexity: 3, players: '2–4',
  },
  {
    key: 'puluc', name: 'Puluc', culture: 'Mesoamerica', type: 'Dice', maxPlayers: 2,
    region: 'mesoamerica', path: 'games/puluc.html',
    description: "A Maya war game from highland Guatemala where captured pieces become \"prisoners\" carried on top of enemy stones — a mechanic that mirrors the Maya practice of taking noble captives in warfare. It's one of the only pre-Columbian games for which scholars reconstructed original rules from living tradition, because the Kekchi Maya of Alta Verapaz were still playing it in the 20th century. The game encodes the Maya concept of conflict as a cyclical process of capture, reversal, and liberation.",
    didYouKnow: "Puluc pieces are called \"soldiers\" — and a captured soldier isn't dead, just a prisoner waiting to be rescued by their own team.",
    complexity: 3, players: '2',
  },
  {
    key: 'pallanguzhi', name: 'Pallanguzhi', culture: 'South India', type: 'Board', maxPlayers: 2,
    region: 'south-asia', path: 'games/pallanguzhi.html', howToPlay: 'how-to-play/pallanguzhi/',
    description: "An ancient Tamil mancala with a 14-cup board, played across South India and Sri Lanka for at least two thousand years. Boards were carved into the stone steps of South Indian temples, where players gathered in the shade between rituals — a form of contemplative play embedded in sacred space. The game was traditionally associated with women, played during festivals and passed down through female family lines as a mark of cultural literacy.",
    didYouKnow: "Temple-carved Pallanguzhi boards still exist in Tamil Nadu — some are over 800 years old and still playable.",
    complexity: 2, players: '2',
  },
  {
    key: 'fanorona', name: 'Fanorona', culture: 'Madagascar', type: 'Board', maxPlayers: 2,
    region: 'madagascar', path: 'games/fanorona.html', howToPlay: 'how-to-play/fanorona/',
    description: "Madagascar's national game, played on a grid of intersecting lines whose pattern mirrors the woven mat — a central Malagasy cultural symbol. A famous 18th-century legend holds that King Andriantompokondrindra was so absorbed in a Fanorona match that he ignored warnings of an approaching army, leading to his defeat and the French colonial foothold on the island. The game is still taught in Malagasy schools as part of national cultural heritage education.",
    didYouKnow: "Fanorona's capture-by-approach mechanic is unique in the world — no other traditional game uses the same system.",
    complexity: 4, players: '2',
  },
  {
    key: 'hnefatafl', name: 'Hnefatafl', culture: 'Norse', type: 'Strategy', maxPlayers: 2,
    region: 'northern-europe', path: 'games/hnefatafl.html',
    description: "The Viking war game played across Scandinavia, Iceland, the British Isles, and Russia from around 400 to 1000 AD — centuries before chess arrived from Persia. The name means \"king's table\" in Old Norse, and its asymmetric design — one king defending, many attackers surrounding — reflects Norse themes of the outnumbered hero holding out against impossible odds. Game boards have been found in Viking burial mounds, suggesting Hnefatafl was considered important enough to accompany the dead into the afterlife.",
    didYouKnow: "When chess arrived in Scandinavia around 1000 AD, Hnefatafl was so well-established that the two games coexisted for over a century.",
    complexity: 4, players: '2',
  },
  {
    key: 'mahjong', name: 'Hong Kong Mahjong', culture: 'China', type: 'Tile', maxPlayers: 4,
    region: 'east-asia', path: 'games/mahjong.html',
    description: "Mahjong emerged in China in the mid-19th century and became so culturally embedded that during the Cultural Revolution the government tried — and failed — to suppress it as a symbol of bourgeois leisure. The Hong Kong variant developed an elaborate fan-scoring system that assigns points to winning hands based on rarity and elegance, turning the game into a form of aesthetic judgment as much as strategy. Today it's played at family gatherings across East Asia and wherever Chinese diaspora communities have settled, from Vancouver to Sydney to London.",
    didYouKnow: "In the 1920s, Mahjong swept across the United States as a national craze — American women played it in Chinese dress as an exotic fashion statement.",
    complexity: 4, players: '4',
  },
  {
    key: 'pachisi', name: 'Pachisi', culture: 'Indian Subcontinent', type: 'Dice', maxPlayers: 4,
    region: 'south-asia', path: 'games/pachisi.html',
    description: "India's royal game, documented in the Mahabharata as Chaupar and played across the subcontinent for at least 1,500 years. Emperor Akbar had a giant Pachisi court built at Fatehpur Sikri in the 16th century, using palace servants dressed in four suit colors as living game pieces — a spectacle that astonished European visitors who wrote about it extensively. The British brought it back to England in the 1860s, replaced the cowrie-shell dice with a spinner, and sold it as Parcheesi — and later Ludo.",
    didYouKnow: "The Pachisi courtyard at Fatehpur Sikri still exists — you can visit it today, though the human pieces are long gone.",
    complexity: 3, players: '2–4',
  },
  {
    key: 'ganjifa', name: 'Ganjifa', culture: 'Mughal India', type: 'Card', maxPlayers: 4,
    region: 'south-asia', path: 'games/ganjifa.html',
    description: "A Mughal card game played with circular cards hand-painted on lacquered cloth or ivory, where a single deck could represent months of an artisan's labor. The cards depicted imagery from Hindu epics, Mughal court life, and astrological symbols — making each deck a miniature cultural encyclopedia commissioned by nobles and merchants as status objects. The tradition nearly died in the 20th century; only a handful of artisan families in Odisha and Rajasthan still produce Ganjifa cards today, keeping an 800-year-old craft alive.",
    didYouKnow: "Ganjifa cards are circular — an unusual shape that comes from the Persian tradition of rolling cards to prevent cheating by marking edges.",
    complexity: 5, players: '2–6',
  },
  {
    key: 'latrunculi', name: 'Ludus Latrunculorum', culture: 'Roman Empire', type: 'Strategy', maxPlayers: 2,
    region: 'southern-europe', path: 'games/latrunculi.html',
    description: "The Roman \"game of mercenaries\" was played across the Empire for over 400 years, with boards scratched into the steps of public buildings, forum pavements, and soldiers' barracks. Roman poets including Ovid and Martial mentioned it by name, and enough ancient texts survive to reconstruct its rules — an unusually complete record for any game from antiquity. Board fragments have been found at Hadrian's Wall, Pompeii, and along the Danube frontier, tracing the footprint of Roman military expansion in game form.",
    didYouKnow: "A Roman graffito from Pompeii preserves what may be the world's oldest recorded trash talk — scratched next to a Latrunculi board.",
    complexity: 3, players: '2',
  },
  {
    key: 'cachos', name: 'Cachos', culture: 'Latin America', type: 'Dice', maxPlayers: 6,
    region: 'south-america', path: 'games/cachos.html',
    description: "A dice bluffing game played across Latin America — particularly in Ecuador, Peru, and Colombia — where five dice are shaken in a leather cup and bids are made on the total dice showing across all cups at the table. In Ecuador the game is woven into social life at every level, from cantina tables to corporate retreats, and skilled players who can read their opponents' bluffs command genuine respect. The Spanish name comes from the word for animal horns, a reference to the original leather cups made from horn or hide.",
    didYouKnow: "In Ecuador, refusing a Cachos challenge at a social gathering is considered mildly rude — the game is that embedded in the culture.",
    complexity: 2, players: '2–6',
  },
  {
    key: 'xinjiang-fangqi', name: 'Xinjiang Fangqi', culture: 'Xinjiang', type: 'Strategy', maxPlayers: 2,
    region: 'central-asia', path: '../xinjiang-fangqi/',
    description: "A grid-based strategy game from Xinjiang — the ancient crossroads of Chinese, Turkic, and Persian cultural spheres — played along Silk Road trade routes where it may have influenced chess variants across Central Asia. The game's core mechanic of forming 2×2 squares to capture enemy pieces is found in no other known game tradition, suggesting it developed independently in the region. Xinjiang's position as a trading hub means the game was likely known to merchants, soldiers, and travelers from a dozen different cultures.",
    didYouKnow: "Xinjiang Fangqi boards have been found at oasis towns along the Silk Road, suggesting the game traveled with caravans between China and Persia.",
    complexity: 3, players: '2',
  },
  {
    key: 'filipino-dama', name: 'Filipino Dama', culture: 'Philippines', type: 'Board', maxPlayers: 2,
    region: 'southeast-asia', path: '../filipino-dama/',
    description: "The Philippine variant of draughts, adapted from Spanish checkers brought by colonizers in the 16th century and transformed into something distinctively Filipino over four centuries of play. The Dama queen piece — which can slide any distance along the diagonal, like a chess bishop — gives the game a faster, more dynamic character than its European ancestors. Dama is played in barangay plazas, school courtyards, and family gatherings across the archipelago, a colonial import that became a national pastime.",
    didYouKnow: "The word \"Dama\" comes from the Spanish word for \"lady\" — the queen piece was so powerful it became the game's name.",
    complexity: 2, players: '2',
  },
  {
    key: 'cuarenta', name: 'Cuarenta', culture: 'Ecuador', type: 'Card', maxPlayers: 2,
    region: 'south-america', path: 'games/cuarenta.html',
    description: "Ecuador's national card game, played with a 40-card Spanish deck — a colonial inheritance that Ecuadorians made entirely their own over four centuries. The game is serious: national tournaments are held annually, skilled players earn community respect, and the Caída — capturing right after your opponent using the same rank they just played — is celebrated like a chess fork, a flash of timing that separates good players from great ones. The name means simply \"forty\" — the target score and the deck size, collapsed into one word that defines an entire game culture.",
    didYouKnow: "At the highest level of Cuarenta, partners play silently across the table — communication is forbidden, and reading your partner's plays becomes a form of intuition.",
    complexity: 4, players: '2 or 4',
  },
];
