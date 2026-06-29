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
    region: 'southeast-asia', path: 'games/tien-len.html', howToPlay: 'how-to-play/tien-len/',
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
    region: 'southeast-asia', path: 'games/o-an-quan.html', howToPlay: 'how-to-play/o-an-quan/',
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
    key: 'yote', name: 'Yoté', culture: 'West Africa', type: 'Board', maxPlayers: 2,
    region: 'west-africa', path: 'games/yote.html', howToPlay: 'how-to-play/yote/',
    description: "A fast, aggressive capture game played across West Africa — especially Senegal, Mali, and Gambia — traditionally in the sand, with pebbles and pieces of broken pottery as pieces. Each player holds a reserve of twelve pieces and chooses each turn whether to drop a new piece onto the board or move one already in play. The tension between building up your forces and striking at the enemy gives Yoté a sharp, bluff-heavy character that rewards patience and sudden aggression in equal measure.",
    didYouKnow: "In Yoté, capturing one enemy piece lets you remove a second piece from anywhere on the board — so a single jump can swing the entire game.",
    complexity: 2, players: '2',
  },
  {
    key: 'senet', name: 'Senet', culture: 'Ancient Egypt', type: 'Board', maxPlayers: 2,
    region: 'north-africa', path: 'games/senet.html', howToPlay: 'how-to-play/senet/',
    description: "One of the oldest known board games on Earth, played along the Nile for over 3,000 years — from boards scratched into temple stones by workers to the four ornate sets buried with Tutankhamun. What began as entertainment became a sacred allegory: by the New Kingdom, the 30-square board mapped the soul's journey through the afterlife, with houses of rebirth, water, and final judgment. Tomb paintings show Queen Nefertari playing Senet against an unseen opponent — her own soul, gambling for safe passage to eternity.",
    didYouKnow: "Tutankhamun was buried with four Senet boards — and tomb paintings show Egyptians playing against invisible opponents: the spirits of the dead.",
    complexity: 2, players: '2',
  },
  {
    key: 'truc', name: 'Truc', culture: 'Catalonia', type: 'Card', maxPlayers: 2,
    region: 'southern-europe', path: 'games/truc.html', howToPlay: 'how-to-play/truc/',
    description: "The Mediterranean's great bluffing game, played for centuries across Catalonia, Valencia, and the Balearic Islands — and the direct ancestor of South America's beloved Truco. Three cards, three tricks, and one explosive word — \"Truc!\" — that raises the stakes and dares your opponent to call your bluff. The cards are learned in minutes; everything that matters happens in your opponent's eyes.",
    didYouKnow: "Menorca still crowns truc champions today — its 2024 island Open drew a record 54 pairs, and a bar club in Ferreries styles itself the game's World Championship.",
    complexity: 2, players: '2',
  },
  {
    key: 'patolli', name: 'Patolli', culture: 'Mesoamerica', type: 'Dice', maxPlayers: 4,
    region: 'mesoamerica', path: 'games/patolli.html', howToPlay: 'how-to-play/patolli/',
    description: "A sacred Aztec race game whose cross-shaped board mapped the cosmos, with 52 spaces mirroring the 52-year cycle of the sacred Aztec calendar. Spanish chronicler Fray Bernardino de Sahagún documented nobles gambling away gold, precious stones, and sometimes their own freedom at Patolli matches. The Spanish banned it as idolatry in the 16th century, nearly erasing a game that had been played across Mesoamerica for over a thousand years.",
    didYouKnow: "The god Macuilxochitl — patron of games and gambling — was believed to watch every Patolli match and punish those who cheated.",
    complexity: 3, players: '2–4',
  },
  {
    key: 'puluc', name: 'Puluc', culture: 'Mesoamerica', type: 'Dice', maxPlayers: 2,
    region: 'mesoamerica', path: 'games/puluc.html', howToPlay: 'how-to-play/puluc/',
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
    region: 'northern-europe', path: 'games/hnefatafl.html', howToPlay: 'how-to-play/hnefatafl/',
    description: "The Viking war game played across Scandinavia, Iceland, the British Isles, and Russia from around 400 to 1000 AD — centuries before chess arrived from Persia. The name means \"king's table\" in Old Norse, and its asymmetric design — one king defending, many attackers surrounding — reflects Norse themes of the outnumbered hero holding out against impossible odds. Game boards have been found in Viking burial mounds, suggesting Hnefatafl was considered important enough to accompany the dead into the afterlife.",
    didYouKnow: "When chess arrived in Scandinavia around 1000 AD, Hnefatafl was so well-established that the two games coexisted for over a century.",
    complexity: 4, players: '2',
  },
  {
    key: 'mahjong', name: 'Hong Kong Mahjong', culture: 'China', type: 'Tile', maxPlayers: 4,
    region: 'east-asia', path: 'games/mahjong.html', howToPlay: 'how-to-play/mahjong/',
    description: "Mahjong emerged in China in the mid-19th century and became so culturally embedded that during the Cultural Revolution the government tried — and failed — to suppress it as a symbol of bourgeois leisure. The Hong Kong variant developed an elaborate fan-scoring system that assigns points to winning hands based on rarity and elegance, turning the game into a form of aesthetic judgment as much as strategy. Today it's played at family gatherings across East Asia and wherever Chinese diaspora communities have settled, from Vancouver to Sydney to London.",
    didYouKnow: "In the 1920s, Mahjong swept across the United States as a national craze — American women played it in Chinese dress as an exotic fashion statement.",
    complexity: 4, players: '4',
  },
  {
    key: 'pachisi', name: 'Pachisi', culture: 'Indian Subcontinent', type: 'Dice', maxPlayers: 4,
    region: 'south-asia', path: 'games/pachisi.html', howToPlay: 'how-to-play/pachisi/',
    description: "India's royal game, documented in the Mahabharata as Chaupar and played across the subcontinent for at least 1,500 years. Emperor Akbar had a giant Pachisi court built at Fatehpur Sikri in the 16th century, using palace servants dressed in four suit colors as living game pieces — a spectacle that astonished European visitors who wrote about it extensively. The British brought it back to England in the 1860s, replaced the cowrie-shell dice with a spinner, and sold it as Parcheesi — and later Ludo.",
    didYouKnow: "The Pachisi courtyard at Fatehpur Sikri still exists — you can visit it today, though the human pieces are long gone.",
    complexity: 3, players: '2–4',
  },
  {
    key: 'ganjifa', name: 'Ganjifa', culture: 'Mughal India', type: 'Card', maxPlayers: 4,
    region: 'south-asia', path: 'games/ganjifa.html', howToPlay: 'how-to-play/ganjifa/',
    description: "A Mughal card game played with circular cards hand-painted on lacquered cloth or ivory, where a single deck could represent months of an artisan's labor. The cards depicted imagery from Hindu epics, Mughal court life, and astrological symbols — making each deck a miniature cultural encyclopedia commissioned by nobles and merchants as status objects. The tradition nearly died in the 20th century; only a handful of artisan families in Odisha and Rajasthan still produce Ganjifa cards today, keeping an 800-year-old craft alive.",
    didYouKnow: "Ganjifa cards are circular — an unusual shape that comes from the Persian tradition of rolling cards to prevent cheating by marking edges.",
    complexity: 5, players: '2–6',
  },
  {
    key: 'latrunculi', name: 'Ludus Latrunculorum', culture: 'Roman Empire', type: 'Strategy', maxPlayers: 2,
    region: 'southern-europe', path: 'games/latrunculi.html', howToPlay: 'how-to-play/latrunculi/',
    description: "The Roman \"game of mercenaries\" was played across the Empire for over 400 years, with boards scratched into the steps of public buildings, forum pavements, and soldiers' barracks. Roman poets including Ovid and Martial mentioned it by name, and enough ancient texts survive to reconstruct its rules — an unusually complete record for any game from antiquity. Board fragments have been found at Hadrian's Wall, Pompeii, and along the Danube frontier, tracing the footprint of Roman military expansion in game form.",
    didYouKnow: "A Roman graffito from Pompeii preserves what may be the world's oldest recorded trash talk — scratched next to a Latrunculi board.",
    complexity: 3, players: '2',
  },
  {
    key: 'cachos', name: 'Cachos', culture: 'Latin America', type: 'Dice', maxPlayers: 6,
    region: 'south-america', path: '../cachos/', howToPlay: 'how-to-play/cachos/',
    description: "A dice bluffing game played across Latin America — particularly in Ecuador, Peru, and Colombia — where five dice are shaken in a leather cup and bids are made on the total dice showing across all cups at the table. In Ecuador the game is woven into social life at every level, from cantina tables to corporate retreats, and skilled players who can read their opponents' bluffs command genuine respect. The Spanish name comes from the word for animal horns, a reference to the original leather cups made from horn or hide.",
    didYouKnow: "In Ecuador, refusing a Cachos challenge at a social gathering is considered mildly rude — the game is that embedded in the culture.",
    complexity: 2, players: '2–6',
  },
  {
    key: 'xinjiang-fangqi', name: 'Xinjiang Fangqi', culture: 'Xinjiang', type: 'Strategy', maxPlayers: 2,
    region: 'central-asia', path: '../xinjiang-fangqi/', howToPlay: 'how-to-play/xinjiang-fangqi/',
    description: "A grid-based strategy game from Xinjiang — the ancient crossroads of Chinese, Turkic, and Persian cultural spheres — played along Silk Road trade routes where it may have influenced chess variants across Central Asia. The game's core mechanic of forming 2×2 squares to capture enemy pieces is found in no other known game tradition, suggesting it developed independently in the region. Xinjiang's position as a trading hub means the game was likely known to merchants, soldiers, and travelers from a dozen different cultures.",
    didYouKnow: "Xinjiang Fangqi boards have been found at oasis towns along the Silk Road, suggesting the game traveled with caravans between China and Persia.",
    complexity: 3, players: '2',
  },
  {
    key: 'filipino-dama', name: 'Filipino Dama', culture: 'Philippines', type: 'Board', maxPlayers: 2,
    region: 'southeast-asia', path: '../filipino-dama/', howToPlay: 'how-to-play/filipino-dama/',
    description: "The Philippine variant of draughts, adapted from Spanish checkers brought by colonizers in the 16th century and transformed into something distinctively Filipino over four centuries of play. The Dama queen piece — which can slide any distance along the diagonal, like a chess bishop — gives the game a faster, more dynamic character than its European ancestors. Dama is played in barangay plazas, school courtyards, and family gatherings across the archipelago, a colonial import that became a national pastime.",
    didYouKnow: "The word \"Dama\" comes from the Spanish word for \"lady\" — the queen piece was so powerful it became the game's name.",
    complexity: 2, players: '2',
  },
  {
    key: 'yut-nori', name: 'Yut Nori', culture: 'Korea', type: 'Board', maxPlayers: 4,
    region: 'east-asia', path: 'games/yut-nori.html', howToPlay: 'how-to-play/yut-nori/',
    description: "Korea's classic Lunar New Year race game — throw four wooden sticks and race all your horses around the cross-shaped board. The throw results were once used to predict the harvest, and families still gather around the Yut Nori board every Seollal and Chuseok.",
    didYouKnow: "Yut Nori is traditionally played on Lunar New Year — the throw results were once used to predict the harvest for the coming year.",
    complexity: 2, players: '2 or 4',
  },
  {
    key: 'cuarenta', name: 'Cuarenta', culture: 'Ecuador', type: 'Card', maxPlayers: 2,
    region: 'south-america', path: 'games/cuarenta.html', howToPlay: 'how-to-play/cuarenta/',
    description: "Ecuador's national card game, played with a 40-card Spanish deck — a colonial inheritance that Ecuadorians made entirely their own over four centuries. The game is serious: national tournaments are held annually, skilled players earn community respect, and the Caída — capturing right after your opponent using the same rank they just played — is celebrated like a chess fork, a flash of timing that separates good players from great ones. The name means simply \"forty\" — the target score and the deck size, collapsed into one word that defines an entire game culture.",
    didYouKnow: "At the highest level of Cuarenta, partners play silently across the table — communication is forbidden, and reading your partner's plays becomes a form of intuition.",
    complexity: 4, players: '2 or 4',
  },
  {
    key: 'scopa', name: 'Scopa', culture: 'Italy', type: 'Card', maxPlayers: 2,
    region: 'southern-europe', path: 'games/scopa.html', howToPlay: 'how-to-play/scopa/',
    description: "Italy's beloved \"sweep\" card game — scopa means \"broom\" — commonly associated with 18th-century Naples and counted among the country's big-three traditional games alongside Briscola and Tressette. Played with a 40-card deck, you capture face-up table cards by matching your played card's value or by taking a set that sums to it, and you score a bonus scopa whenever a capture sweeps the table clean. Much of the drama turns on the contested settebello, the 7 of coins, and the subtle primiera count in which a humble 7 outranks any king.",
    didYouKnow: "The name means \"broom\" — for sweeping the table clean — and the single most contested card is the settebello, the 7 of coins, worth a guaranteed point and the heart of the primiera.",
    complexity: 2, players: '2',
  },
  {
    key: 'durak', name: 'Durak', culture: 'Russia', type: 'Card', maxPlayers: 2,
    region: 'eastern-europe', path: 'games/durak.html', howToPlay: 'how-to-play/durak/',
    description: "Durak is, by common account, the most popular card game in Russia and across the former Soviet Union — the name means \"fool\" and refers to the loser, the last player left holding cards. Played with a 36-card deck and a trump suit, it is an attack-and-defend game: the attacker throws cards down, the defender must beat them or pick them all up. An old folk game with no recorded inventor, it is played at kitchen tables wherever Russian is spoken.",
    didYouKnow: "By tradition there is no winner's prize in Durak — only the gentle, sociable shame of being left holding the cards as the \"durak.\"",
    complexity: 3, players: '2',
  },
  {
    key: 'bagh-chal', name: 'Bagh-Chal', culture: 'Nepal', type: 'Strategy', maxPlayers: 2,
    region: 'south-asia', path: 'games/bagh-chal.html', howToPlay: 'how-to-play/bagh-chal/',
    description: "Bagh-Chal — \"moving tigers\" — is widely regarded as Nepal's national board game, a centuries-old contest kept alive largely by oral tradition. Four powerful tigers hunt by leaping while twenty weak but numerous goats win only through collective encirclement, cluttering the board until the tigers cannot move — a theme of \"few-but-strong versus many-but-weak\" likely shaped by Nepal's pastoral, herding life. Traditionally played in community rest-houses and parks, at its simplest scratched into the dirt with pebbles, it is now considered endangered, kept alive mostly by older players.",
    didYouKnow: "Authentic Bagh-Chal sets are handcrafted in brass-on-wood in Kathmandu and Patan, with the playing lines etched into the board.",
    complexity: 3, players: '2',
  },
  {
    key: 'morabaraba', name: 'Morabaraba', culture: 'Southern Africa', type: 'Strategy', maxPlayers: 2,
    region: 'southern-africa', path: 'games/morabaraba.html', howToPlay: 'how-to-play/morabaraba/',
    description: "Morabaraba — \"the mill\" in Sesotho, and Mmela in Setswana — is a strategy game of the Sotho and Tswana peoples of Southern Africa, where each player commands twelve \"cows\" on a 24-point board of three nested squares plus four corner diagonals. It is said to have been played by herdboys who scratched the board into the ground and used stones as cattle, the great symbol of wealth across the region. Today it is a recognised competitive mind sport, governed in South Africa by Mind Sports South Africa.",
    didYouKnow: "Morabaraba's four corner diagonals — absent from ordinary Twelve Men's Morris — are its signature, giving the outer corners extra mills and making them prized squares.",
    complexity: 3, players: '2',
  },
  {
    key: 'konane', name: 'Kōnane', culture: 'Hawaii', type: 'Strategy', maxPlayers: 2,
    region: 'hawaii', path: 'games/konane.html', howToPlay: 'how-to-play/konane/',
    description: "Kōnane is an indigenous Hawaiian strategy game played on a papamū — a grid of small depressions in lava stone — with ʻiliʻili pebbles of black lava and white coral, on a board that starts completely full. Enjoyed by aliʻi (chiefs) and commoners alike and woven into oral tradition, it was dubbed \"Hawaiian checkers\" by Captain Cook's crew in 1778–79 — a loose label, since Kōnane is won by making the last move, not by capturing the most pieces. Discouraged after Western contact, it is being actively revived today.",
    didYouKnow: "Kōnane isn't won by capturing the most stones — like Nim, the winner is simply whoever makes the last legal jump, leaving the opponent stuck.",
    complexity: 3, players: '2',
  },
  {
    key: 'surakarta', name: 'Surakarta', culture: 'Indonesia', type: 'Strategy', maxPlayers: 2,
    region: 'indonesia', path: 'games/surakarta.html', howToPlay: 'how-to-play/surakarta/',
    description: "Surakarta is an abstract strategy game from Central Java, Indonesia, named after the historic court city of Surakarta (Solo), where the board was traditionally scratched in the dirt and played with stones and cowrie shells. Each player lines up twelve pieces on a 6×6 grid ringed by distinctive corner loop arcs. Quiet moves are simple one-step shuffles in any of the eight directions, but captures are its own invention: a piece slides along the lines and curls around at least one corner loop to strike an enemy from a distance. Its precise origin and age are not well documented — it reached the West via a 1970 French publication, later reprinted as \"Roundabouts.\"",
    didYouKnow: "Surakarta's loop-based capture — a piece curving around the corner arcs to strike — is thought to be unique among traditional board games; you can never capture in a straight line without going around a loop.",
    complexity: 3, players: '2',
  },
  {
    key: 'mu-torere', name: 'Mū Tōrere', culture: 'Māori (Aotearoa)', type: 'Strategy', maxPlayers: 2,
    region: 'new-zealand', path: 'games/mu-torere.html', howToPlay: 'how-to-play/mu-torere/',
    description: "Mū tōrere is one of the very few board games the Māori are documented to have played before European contact, associated especially with the Ngāti Porou of the East Coast of Aotearoa New Zealand, who played it on a slab of wood, a piece of bark, or marks drawn in the earth. It is played on an eight-pointed star — eight outer arms (the kewai) around a central point (the pūtahi) — with four pieces a side and no capturing at all: you win simply by leaving your opponent with no legal move. The rules here are a standard reconstruction, since the early sources diverge on small points. Deceptively simple, it is mathematically a draw with perfect play.",
    didYouKnow: "A recorded anecdote has the Ngāti Hauā chief Wiremu Tāmihana offering to play Governor George Grey a game of mū tōrere for the stakes of the country — an offer Grey is said to have declined.",
    complexity: 2, players: '2',
  },
  {
    key: 'dou-shou-qi', name: 'Dou Shou Qi', culture: 'China', type: 'Strategy', maxPlayers: 2,
    region: 'east-asia', path: 'games/dou-shou-qi.html', howToPlay: 'how-to-play/dou-shou-qi/',
    description: "Dou Shou Qi (斗兽棋, \"the game of fighting animals,\" also called Jungle or Animal Chess) is a popular Chinese strategy game, beloved by children across the Far East. Eight ranked animals from elephant down to rat cross a 7×9 board split by two rivers — and the game's charm is its exceptions: the rat alone can swim and fell the mighty elephant, while the lion and tiger bound clear across the water. Race your animals past the traps and into the opponent's den to win.",
    didYouKnow: "The lowliest animal, the rat, is the only piece that can swim — and the only one that can capture the mighty elephant, though the elephant can never capture it back.",
    complexity: 4, players: '2',
  },
];
