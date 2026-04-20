// src/lib/uno.js
// Pure UNO game logic — no Firebase, fully testable in isolation.
// All functions are pure (return new state, never mutate).

// ─── Constants ───────────────────────────────────────────────────────────────

export const COLORS = ['red', 'yellow', 'green', 'blue']
export const WILD_COLORS = [...COLORS] // same list, used for picker

const NUMBER_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const ACTION_VALUES = ['skip', 'reverse', 'draw2']
const WILD_VALUES   = ['wild', 'wilddraw4']

// ─── Deck builder ────────────────────────────────────────────────────────────

function buildDeck() {
  const deck = []
  let id = 0

  for (const color of COLORS) {
    // One 0 per color
    deck.push({ id: id++, color, value: '0' })
    // Two of each 1-9 and action per color
    for (const v of [...NUMBER_VALUES.slice(1), ...ACTION_VALUES]) {
      deck.push({ id: id++, color, value: v })
      deck.push({ id: id++, color, value: v })
    }
  }

  // 4 of each wild
  for (const v of WILD_VALUES) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: id++, color: 'wild', value: v })
    }
  }

  return deck // 108 cards
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Game initialization ─────────────────────────────────────────────────────

/**
 * Create a fresh game state for the given player list.
 * @param {Array<{uid, displayName, photoURL}>} players  — ordered seating
 * @param {object} houseRules  — { stackDraw: bool, sevenSwap: bool, jumpIn: bool }
 * @returns {object} full game state (safe to write directly to Firestore)
 */
export function createGame(players, houseRules = {}) {
  if (players.length < 2 || players.length > 10) throw new Error('2–10 players required')

  let drawPile = shuffle(buildDeck())

  // Deal 7 cards each
  const hands = {}
  for (const p of players) {
    hands[p.uid] = drawPile.splice(0, 7)
  }

  // Flip first card — reshuffle WD4 back into pile, keep flipping
  let topCard
  do {
    topCard = drawPile.shift()
    if (topCard.value === 'wilddraw4') drawPile.push(topCard) // put back
  } while (topCard.value === 'wilddraw4')

  // Reshuffle if we somehow exhausted pile (shouldn't happen)
  if (!topCard) throw new Error('Could not deal starting card')

  // Handle special starting card
  let currentIdx = 0
  let direction = 1  // 1 = clockwise, -1 = counter-clockwise
  let pendingDraw = 0
  let currentColor = topCard.color === 'wild' ? null : topCard.color // host will pick if Wild

  if (topCard.value === 'reverse') {
    direction = players.length === 2 ? 1 : -1
    if (players.length === 2) currentIdx = 0 // acts as skip for 2p
  } else if (topCard.value === 'skip') {
    currentIdx = 1 % players.length
  } else if (topCard.value === 'draw2') {
    pendingDraw = 2
    currentIdx = 1 % players.length
  } else if (topCard.value === 'wild') {
    // first player must pick color — flag it
    currentColor = null
  }

  const order = players.map(p => p.uid)

  return {
    status: 'playing',          // waiting | playing | finished
    order,                       // [uid, uid, ...] seat order
    players: players.reduce((m, p) => ({ ...m, [p.uid]: { displayName: p.displayName, photoURL: p.photoURL || '' } }), {}),
    hands,                       // { uid: [{id, color, value}] }
    drawPile,
    discardPile: [topCard],
    currentIdx,                  // index into order[]
    direction,
    pendingDraw,                 // accumulated draw count waiting for next player
    currentColor,                // active color (null = waiting for wild pick)
    wildPickerUid: topCard.value === 'wild' ? order[0] : null,
    isStartingWild: topCard.value === 'wild', // first player picks colour but keeps their turn
    lastCard: topCard,
    unoCalledBy: {},             // { uid: true } — who pressed UNO
    unoPenaltyEligible: {},      // { uid: true } — who can be caught
    winner: null,
    scores: {},                  // accumulated round scores { uid: number }
    houseRules: {
      stackDraw: houseRules.stackDraw ?? false,
      sevenSwap: houseRules.sevenSwap ?? false,
      jumpIn:    houseRules.jumpIn    ?? false,
    },
    log: [`Game started! ${players[currentIdx]?.displayName} goes first.`],
    updatedAt: Date.now(),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentUid(state) {
  return state.order[state.currentIdx]
}

function nextIdx(state, skip = 0) {
  const n = state.order.length
  return ((state.currentIdx + state.direction * (1 + skip)) % n + n) % n
}

function advanceTurn(state, skip = 0) {
  return { ...state, currentIdx: nextIdx(state, skip) }
}

/** Reshuffle discard pile into draw pile when empty */
function ensureDrawPile(state) {
  if (state.drawPile.length > 0) return state
  const discard = [...state.discardPile]
  const top = discard.pop()
  const newDraw = shuffle(discard.map(c => c.color === 'wild' ? { ...c, color: 'wild' } : c))
  return { ...state, drawPile: newDraw, discardPile: [top] }
}

function removeFromHand(hand, cardId) {
  const idx = hand.findIndex(c => c.id === cardId)
  if (idx === -1) throw new Error('Card not in hand')
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
}

function isPlayable(card, topCard, currentColor, pendingDraw, houseRules) {
  // If there's a pending draw and stacking is disabled, must draw
  if (pendingDraw > 0 && !houseRules.stackDraw) return false

  // If stacking enabled: must play a stackable card or draw
  if (pendingDraw > 0 && houseRules.stackDraw) {
    const stackTop = topCard.value
    if (stackTop === 'draw2') return card.value === 'draw2'
    if (stackTop === 'wilddraw4') return card.value === 'wilddraw4'
  }

  if (card.value === 'wild' || card.value === 'wilddraw4') return true
  if (card.color === currentColor) return true
  if (card.value === topCard.value) return true
  return false
}

function canPlay(hand, topCard, currentColor, pendingDraw, houseRules) {
  return hand.some(c => isPlayable(c, topCard, currentColor, pendingDraw, houseRules))
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * A player plays a card from their hand.
 * Returns new state or throws with a user-facing error message.
 */
export function playCard(state, uid, cardId, chosenColor = null) {
  if (state.status !== 'playing') throw new Error('Game is not active')
  if (currentUid(state) !== uid) throw new Error("It's not your turn")
  if (state.wildPickerUid) throw new Error('Waiting for color choice')

  const hand = state.hands[uid]
  const card = hand.find(c => c.id === cardId)
  if (!card) throw new Error('Card not in your hand')

  const topCard = state.discardPile[state.discardPile.length - 1]

  if (!isPlayable(card, topCard, state.currentColor, state.pendingDraw, state.houseRules)) {
    throw new Error('That card cannot be played right now')
  }

  let s = {
    ...state,
    hands: { ...state.hands, [uid]: removeFromHand(hand, cardId) },
    discardPile: [...state.discardPile, card],
    lastCard: card,
    updatedAt: Date.now(),
  }

  // Clear UNO penalty eligibility for this player (they just had their turn)
  const unoPenaltyEligible = { ...s.unoPenaltyEligible }
  delete unoPenaltyEligible[uid]
  s = { ...s, unoPenaltyEligible }

  // Check win
  if (s.hands[uid].length === 0) {
    const roundScore = calculateRoundScore(s)
    return {
      ...s,
      status: 'finished',
      winner: uid,
      scores: { ...s.scores, [uid]: (s.scores[uid] || 0) + roundScore },
      log: [...s.log, `🎉 ${s.players[uid].displayName} wins the round! +${roundScore} pts`],
    }
  }

  // UNO call eligibility — if player now has 1 card
  const newUnoPenalty = { ...s.unoPenaltyEligible }
  if (s.hands[uid].length === 1 && !s.unoCalledBy[uid]) {
    newUnoPenalty[uid] = true
  }
  s = { ...s, unoPenaltyEligible: newUnoPenalty }

  const log = [...s.log]

  // Handle special cards
  switch (card.value) {
    case 'skip': {
      const skippedUid = s.order[nextIdx(s)]
      log.push(`⛔ ${s.players[skippedUid].displayName} is skipped!`)
      s = advanceTurn(s, 1) // skip next
      s = { ...s, currentColor: card.color, log }
      break
    }

    case 'reverse': {
      if (s.order.length === 2) {
        // Acts as skip in 2-player
        log.push(`🔄 Reverse! (2-player → skip)`)
        s = { ...s, log }
        // stay on same player — no direction change needed, just skip
        s = advanceTurn(s, 1)
      } else {
        log.push(`🔄 Direction reversed!`)
        s = { ...s, direction: s.direction * -1, log }
        s = advanceTurn(s)
      }
      s = { ...s, currentColor: card.color }
      break
    }

    case 'draw2': {
      if (s.houseRules.stackDraw) {
        log.push(`+2 stacked! Pending draw: ${s.pendingDraw + 2}`)
        s = { ...s, pendingDraw: s.pendingDraw + 2, currentColor: card.color, log }
        s = advanceTurn(s)
      } else {
        const targetUid = s.order[nextIdx(s)]
        s = ensureDrawPile(s)
        const drawn = s.drawPile.slice(0, 2)
        s = {
          ...s,
          drawPile: s.drawPile.slice(2),
          hands: { ...s.hands, [targetUid]: [...s.hands[targetUid], ...drawn] },
          currentColor: card.color,
        }
        log.push(`✌️ ${s.players[targetUid].displayName} draws 2 and is skipped!`)
        s = advanceTurn(s, 1) // skip them
        s = { ...s, log }
      }
      break
    }

    case 'wild': {
      if (chosenColor) {
        log.push(`🌈 Wild! Color set to ${chosenColor}`)
        s = { ...s, currentColor: chosenColor, wildPickerUid: null, log }
        s = advanceTurn(s)
      } else {
        s = { ...s, wildPickerUid: uid, currentColor: null, log }
        // Don't advance turn yet — waiting for color pick
      }
      // Handle 7-swap house rule
      if (s.houseRules.sevenSwap && card.value === '7') {
        // handled separately in sevenSwap action
      }
      break
    }

    case 'wilddraw4': {
      if (chosenColor) {
        // preWD4Color already stored when card was first played (no-color branch)
        if (s.houseRules.stackDraw) {
          log.push(`+4 stacked! Pending: ${s.pendingDraw + 4}`)
          s = { ...s, pendingDraw: s.pendingDraw + 4, currentColor: chosenColor, wildPickerUid: null, log }
          s = advanceTurn(s)
        } else {
          const targetUid = s.order[nextIdx(s)]
          s = ensureDrawPile(s)
          const drawn = s.drawPile.slice(0, 4)
          s = {
            ...s,
            drawPile: s.drawPile.slice(4),
            hands: { ...s.hands, [targetUid]: [...s.hands[targetUid], ...drawn] },
            currentColor: chosenColor,
            wildPickerUid: null,
          }
          log.push(`💀 ${s.players[targetUid].displayName} draws 4 and is skipped!`)
          s = advanceTurn(s, 1)
          s = { ...s, log }
        }
      } else {
        // Store the active colour BEFORE it becomes null — needed for WD4 challenge legality check
        s = { ...s, wildPickerUid: uid, currentColor: null, preWD4Color: state.currentColor, log }
      }
      break
    }

    default: {
      // Number card
      if (s.houseRules.sevenSwap && card.value === '7') {
        // Triggered separately via swapHands action — just advance normally for now
      }
      if (s.houseRules.sevenSwap && card.value === '0') {
        // Rotate all hands
        log.push(`0 played! All hands rotate!`)
        s = rotateAllHands(s)
        s = { ...s, log }
      }
      s = { ...s, currentColor: card.color, log }
      s = advanceTurn(s)
      break
    }
  }

  // If stacking pending draw and next player has no stack card, they must draw
  return s
}

/** Pick color after playing a wild */
export function pickWildColor(state, uid, color) {
  if (state.wildPickerUid !== uid) throw new Error('Not your color pick')
  if (!COLORS.includes(color)) throw new Error('Invalid color')

  const topCard = state.discardPile[state.discardPile.length - 1]
  let s = { ...state, currentColor: color, wildPickerUid: null, updatedAt: Date.now() }

  const log = [...s.log, `🎨 ${s.players[uid].displayName} chose ${color}`]

  // Starting wild: first player just picks the colour — it's still their turn to play
  if (state.isStartingWild) {
    return { ...s, isStartingWild: false, log }
  }

  if (topCard.value === 'wilddraw4' && !s.houseRules.stackDraw) {
    const targetUid = s.order[nextIdx(s)]
    s = ensureDrawPile(s)
    const drawn = s.drawPile.slice(0, 4)
    s = {
      ...s,
      drawPile: s.drawPile.slice(4),
      hands: { ...s.hands, [targetUid]: [...s.hands[targetUid], ...drawn] },
    }
    log.push(`💀 ${s.players[targetUid].displayName} draws 4 and is skipped!`)
    s = advanceTurn(s, 1)
  } else {
    s = advanceTurn(s)
  }

  return { ...s, log }
}

/** Draw card(s) — normal draw or forced pending draw */
export function drawCard(state, uid) {
  if (state.status !== 'playing') throw new Error('Game not active')
  if (currentUid(state) !== uid) throw new Error("Not your turn")
  if (state.wildPickerUid) throw new Error('Waiting for color pick')

  let s = ensureDrawPile(state)
  const log = [...s.log]

  if (s.pendingDraw > 0) {
    const count = s.pendingDraw
    const drawn = s.drawPile.slice(0, count)
    s = {
      ...s,
      drawPile: s.drawPile.slice(count),
      hands: { ...s.hands, [uid]: [...s.hands[uid], ...drawn] },
      pendingDraw: 0,
    }
    log.push(`${s.players[uid].displayName} draws ${count} and is skipped!`)
    s = advanceTurn(s)
    return { ...s, log, updatedAt: Date.now() }
  }

  // Normal draw — draw 1, may play it
  const [drawn, ...rest] = s.drawPile
  const newHand = [...s.hands[uid], drawn]
  s = { ...s, drawPile: rest, hands: { ...s.hands, [uid]: newHand } }

  const topCard = s.discardPile[s.discardPile.length - 1]
  if (isPlayable(drawn, topCard, s.currentColor, 0, s.houseRules)) {
    log.push(`${s.players[uid].displayName} drew a playable card — can play or pass.`)
    // Mark drawn card as "just drawn" so UI shows play-drawn-card option
    s = { ...s, drawnCardId: drawn.id }
  } else {
    log.push(`${s.players[uid].displayName} drew a card and passes.`)
    s = advanceTurn(s)
    s = { ...s, drawnCardId: null }
  }

  return { ...s, log, updatedAt: Date.now() }
}

/** Pass after drawing — only valid if player drew this turn and can't/won't play it */
export function passTurn(state, uid) {
  if (currentUid(state) !== uid) throw new Error("Not your turn")
  return {
    ...advanceTurn(state),
    drawnCardId: null,
    log: [...state.log, `${state.players[uid].displayName} passes.`],
    updatedAt: Date.now(),
  }
}

/** Call UNO — player announces they have 1 card */
export function callUno(state, uid) {
  return {
    ...state,
    unoCalledBy: { ...state.unoCalledBy, [uid]: true },
    unoPenaltyEligible: { ...state.unoPenaltyEligible, [uid]: false },
    log: [...state.log, `🔔 ${state.players[uid].displayName} says UNO!`],
    updatedAt: Date.now(),
  }
}

/** Catch a player who didn't say UNO — draw 2 penalty */
export function catchUno(state, catcherUid, targetUid) {
  if (!state.unoPenaltyEligible[targetUid]) throw new Error('No penalty available')
  if (state.hands[targetUid]?.length !== 1) throw new Error('Target does not have 1 card')

  let s = ensureDrawPile(state)
  const drawn = s.drawPile.slice(0, 2)
  s = {
    ...s,
    drawPile: s.drawPile.slice(2),
    hands: { ...s.hands, [targetUid]: [...s.hands[targetUid], ...drawn] },
    unoPenaltyEligible: { ...s.unoPenaltyEligible, [targetUid]: false },
    log: [...s.log, `😱 ${s.players[catcherUid].displayName} caught ${s.players[targetUid].displayName}! +2 cards penalty!`],
    updatedAt: Date.now(),
  }
  return s
}

/** Challenge a Wild Draw 4 — if challenger wins, player of WD4 draws 4 instead */
export function challengeWD4(state, challengerUid) {
  const topCard = state.discardPile[state.discardPile.length - 1]
  const prevIdx = ((state.currentIdx - state.direction + state.order.length) % state.order.length)
  const playedByUid = state.order[prevIdx]

  if (topCard.value !== 'wilddraw4') throw new Error('Last card was not Wild Draw 4')

  // Check if player had a card matching the colour that was active when WD4 was played.
  // Use preWD4Color (stored at play time) — fallback to card before WD4 in discard pile.
  const preWD4Color = state.preWD4Color || state.discardPile[state.discardPile.length - 2]?.color
  const hand = state.hands[playedByUid]
  const hadPlayable = preWD4Color && preWD4Color !== 'wild' && hand.some(c => c.color === preWD4Color)

  let s = ensureDrawPile(state)
  const log = [...s.log]

  if (hadPlayable) {
    // Challenger wins — WD4 player draws 4
    const drawn = s.drawPile.slice(0, 4)
    s = {
      ...s,
      drawPile: s.drawPile.slice(4),
      hands: { ...s.hands, [playedByUid]: [...s.hands[playedByUid], ...drawn] },
    }
    log.push(`✅ Challenge successful! ${s.players[playedByUid].displayName} draws 4!`)
    // Challenger does NOT draw, just continues
  } else {
    // Challenger loses — draws 6 instead of 4
    const drawn = s.drawPile.slice(0, 6)
    s = {
      ...s,
      drawPile: s.drawPile.slice(6),
      hands: { ...s.hands, [challengerUid]: [...s.hands[challengerUid], ...drawn] },
    }
    log.push(`❌ Challenge failed! ${s.players[challengerUid].displayName} draws 6!`)
    s = advanceTurn(s)
  }

  return { ...s, pendingDraw: 0, log, updatedAt: Date.now() }
}

/** Jump-in: play an exact matching card out of turn */
export function jumpIn(state, uid, cardId) {
  if (!state.houseRules.jumpIn) throw new Error('Jump-in not enabled')
  const topCard = state.discardPile[state.discardPile.length - 1]
  const card = state.hands[uid]?.find(c => c.id === cardId)
  if (!card) throw new Error('Card not in hand')
  if (card.color !== topCard.color || card.value !== topCard.value) throw new Error('Must match exactly to jump in')

  // Find this player's index and make it their turn, then play
  const newIdx = state.order.indexOf(uid)
  const s = { ...state, currentIdx: newIdx }
  return playCard(s, uid, cardId)
}

/** Seven-swap house rule: pick who to swap hands with */
export function sevenSwap(state, fromUid, toUid) {
  if (!state.houseRules.sevenSwap) throw new Error('Seven-swap not enabled')
  const fromHand = state.hands[fromUid]
  const toHand = state.hands[toUid]
  return {
    ...state,
    hands: { ...state.hands, [fromUid]: toHand, [toUid]: fromHand },
    log: [...state.log, `🔀 ${state.players[fromUid].displayName} swapped hands with ${state.players[toUid].displayName}!`],
    updatedAt: Date.now(),
  }
}

function rotateAllHands(state) {
  const order = state.order
  const n = order.length
  const newHands = {}
  for (let i = 0; i < n; i++) {
    const from = order[(i - state.direction + n) % n]
    newHands[order[i]] = state.hands[from]
  }
  return { ...state, hands: newHands }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function cardScore(card) {
  if (card.value === 'wild' || card.value === 'wilddraw4') return 50
  if (['skip', 'reverse', 'draw2'].includes(card.value)) return 20
  return parseInt(card.value, 10)
}

export function calculateRoundScore(state) {
  return Object.entries(state.hands)
    .filter(([uid]) => uid !== state.winner)
    .reduce((total, [, hand]) => total + hand.reduce((s, c) => s + cardScore(c), 0), 0)
}

// ─── Queries (used by UI) ────────────────────────────────────────────────────

/** Return only the cards in a specific player's hand (for per-player visibility) */
export function getMyHand(state, uid) {
  return state.hands[uid] || []
}

/** Return card count for all opponents (no card data) */
export function getOpponentCounts(state, myUid) {
  return state.order
    .filter(uid => uid !== myUid)
    .map(uid => ({ uid, displayName: state.players[uid].displayName, photoURL: state.players[uid].photoURL, count: state.hands[uid]?.length ?? 0 }))
}

export function isMyTurn(state, uid) {
  return state.status === 'playing' && currentUid(state) === uid && !state.wildPickerUid
}

export function needsColorPick(state, uid) {
  return state.wildPickerUid === uid
}
