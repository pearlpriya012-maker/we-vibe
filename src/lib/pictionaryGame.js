// src/lib/pictionaryGame.js
// Pure game-logic functions for Pictionary (no side-effects, no Firebase).

// ─── Word bank ────────────────────────────────────────────────────────────────

const WORD_BANK = [
  // Animals
  'cat', 'dog', 'fish', 'bird', 'frog', 'rabbit', 'elephant', 'giraffe', 'penguin',
  'dolphin', 'octopus', 'butterfly', 'flamingo', 'gorilla', 'chameleon', 'kangaroo',
  'porcupine', 'walrus', 'peacock', 'seahorse', 'crocodile', 'parrot', 'hedgehog',
  // Food
  'pizza', 'sushi', 'taco', 'waffle', 'donut', 'burger', 'popcorn', 'hotdog',
  'pancake', 'lemonade', 'chocolate', 'avocado', 'broccoli', 'cheesecake', 'spaghetti',
  'ice cream', 'sandwich', 'cookie', 'cupcake', 'smoothie',
  // Objects
  'umbrella', 'telescope', 'lighthouse', 'skateboard', 'backpack', 'compass',
  'calculator', 'toothbrush', 'trampoline', 'chandelier', 'escalator', 'submarine',
  'helicopter', 'binoculars', 'parachute', 'microscope', 'megaphone', 'flashlight',
  // Actions
  'swimming', 'dancing', 'sleeping', 'laughing', 'climbing', 'fishing', 'painting',
  'sneezing', 'juggling', 'surfing', 'bowling', 'skydiving', 'singing', 'karate',
  'meditating', 'skateboarding', 'hiking', 'knitting',
  // Places
  'library', 'airport', 'jungle', 'museum', 'stadium', 'pyramid', 'aquarium',
  'skyscraper', 'waterfall', 'greenhouse', 'labyrinth', 'volcano', 'cemetery',
  'lighthouse', 'canyon', 'igloo',
  // Fun / Misc
  'rainbow', 'clock', 'chair', 'bridge', 'robot', 'ghost', 'crown', 'anchor',
  'magnet', 'cactus', 'planet', 'rocket', 'ladder', 'guitar', 'trophy', 'tornado',
  'dragon', 'mermaid', 'superhero', 'spaceship', 'wizard', 'treasure', 'explosion',
  'tornado', 'thunderstorm', 'snowman', 'sandcastle', 'ferris wheel',
]

function pickWords(n = 3) {
  const shuffled = [...WORD_BANK].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ─── Game state shape ─────────────────────────────────────────────────────────
// {
//   status: 'choosingWord' | 'drawing' | 'roundEnd' | 'finished'
//   players: { [uid]: { displayName, photoURL, score } }
//   order: [uid, ...]
//   drawerIdx: number
//   drawerUid: string
//   wordOptions: string[] | null
//   currentWord: string | null
//   round: number
//   totalRounds: number
//   roundStartedAt: number | null  (Date.now())
//   turnSeconds: number
//   guessedUids: string[]
//   log: string[]
//   roundId: number            (monotonically increasing, used to sync canvas clears)
// }

// ─── Pure functions ───────────────────────────────────────────────────────────

export function createGame(players, settings = {}) {
  const uids = players.map(p => p.uid)
  shuffleArray(uids)
  const firstDrawer = uids[0]
  return {
    status: 'choosingWord',
    players: Object.fromEntries(players.map(p => [p.uid, {
      displayName: p.displayName || 'Player',
      photoURL: p.photoURL || '',
      score: 0,
    }])),
    order: uids,
    drawerIdx: 0,
    drawerUid: firstDrawer,
    wordOptions: pickWords(3),
    currentWord: null,
    round: 1,
    totalRounds: settings.totalRounds || 3,
    roundStartedAt: null,
    turnSeconds: settings.turnSeconds || 80,
    guessedUids: [],
    log: [`Game started! ${players.find(p => p.uid === firstDrawer)?.displayName || 'Player'} draws first.`],
    roundId: 1,
  }
}

export function chooseWord(state, uid, word) {
  if (state.drawerUid !== uid) return state
  if (!state.wordOptions?.includes(word)) return state
  return {
    ...state,
    status: 'drawing',
    currentWord: word,
    wordOptions: null,
    roundStartedAt: Date.now(),
    guessedUids: [],
    log: [...state.log.slice(-20), `${state.players[uid].displayName} is drawing! (${word.length} letters)`],
  }
}

export function submitGuess(state, uid, guess) {
  if (state.status !== 'drawing') return state
  if (state.drawerUid === uid) return state
  if (state.guessedUids.includes(uid)) return state
  const normalized = guess.trim().toLowerCase()
  if (!normalized) return state

  if (normalized !== state.currentWord.toLowerCase()) {
    return {
      ...state,
      log: [...state.log.slice(-20), `${state.players[uid]?.displayName || '?'} guessed wrong ✗`],
    }
  }

  // Correct!
  const position = state.guessedUids.length + 1
  const guesserPoints = Math.max(10, 110 - (position - 1) * 15)
  const drawerBonus = 10
  const guessedUids = [...state.guessedUids, uid]

  const players = {
    ...state.players,
    [uid]: { ...state.players[uid], score: state.players[uid].score + guesserPoints },
    [state.drawerUid]: {
      ...state.players[state.drawerUid],
      score: state.players[state.drawerUid].score + drawerBonus,
    },
  }

  const log = [...state.log.slice(-19), `${state.players[uid].displayName} guessed it! ✅ +${guesserPoints}`]
  const allGuessed = guessedUids.length >= Object.keys(state.players).length - 1

  return { ...state, players, guessedUids, log, status: allGuessed ? 'roundEnd' : 'drawing' }
}

export function endRound(state) {
  if (state.status !== 'drawing') return state
  return {
    ...state,
    status: 'roundEnd',
    log: [...state.log.slice(-20), `⏱ Time's up! The word was "${state.currentWord}"`],
  }
}

export function advanceTurn(state) {
  const nextIdx = (state.drawerIdx + 1) % state.order.length
  const isNewRound = nextIdx === 0
  const round = isNewRound ? state.round + 1 : state.round

  if (isNewRound && round > state.totalRounds) {
    return { ...state, status: 'finished' }
  }

  const nextDrawerUid = state.order[nextIdx]
  return {
    ...state,
    status: 'choosingWord',
    drawerIdx: nextIdx,
    drawerUid: nextDrawerUid,
    wordOptions: pickWords(3),
    currentWord: null,
    roundStartedAt: null,
    guessedUids: [],
    round,
    roundId: (state.roundId || 1) + 1,
    log: [...state.log.slice(-15), `Round ${round}: ${state.players[nextDrawerUid].displayName} draws next.`],
  }
}

/** Returns a masked version of the word for guessers: "_ _ _ _" */
export function maskWord(word) {
  if (!word) return ''
  return word.split('').map(ch => ch === ' ' ? '  ' : '_').join(' ')
}

/** After 40 seconds, reveal letters at every 4th position */
export function hintWord(word, elapsed, turnSeconds) {
  if (!word) return ''
  const progress = elapsed / turnSeconds
  if (progress < 0.5) return maskWord(word)
  // Reveal ~25% of letters
  return word.split('').map((ch, i) => {
    if (ch === ' ') return '  '
    if (i % 4 === 0) return ch
    return '_'
  }).join(' ')
}
