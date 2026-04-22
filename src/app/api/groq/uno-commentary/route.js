// src/app/api/groq/uno-commentary/route.js
// Generates a short, punchy AI commentary line for dramatic UNO events.
import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a hype commentator for a live UNO card game. 
Your commentary is short (max 12 words), punchy, dramatic, funny, and occasionally savage.
Use emojis sparingly (0-2 per line). No hashtags. No explanations.
Match the energy to the event type:
- skip/reverse: playful/teasing
- +2/+4: dramatic/ruthless  
- UNO: tense/exciting
- win: celebratory
- challenge: edgy/suspenseful
- caught UNO: brutal/shocked
Vary your replies — never repeat the same line.`

const EVENTS = {
  skip:      ({ player, target })  => `${player} just skipped ${target}. No mercy.`,
  reverse:   ({ player })          => `${player} flipped the direction!`,
  draw2:     ({ player, target })  => `${player} sent ${target} a +2 gift.`,
  draw4:     ({ player, target })  => `${player} dropped a +4 on ${target}!`,
  wild:      ({ player, color })   => `${player} chose ${color}.`,
  uno:       ({ player })          => `${player} has ONE card left!`,
  caught:    ({ catcher, target }) => `${catcher} caught ${target} lacking!`,
  challenge_bluff: ({ challenger, target }) => `${challenger} called ${target}'s bluff!`,
  challenge_legal: ({ challenger, target }) => `${target}'s +4 was legal — ${challenger} takes extra cards!`,
  win:       ({ player, score })   => `${player} wins the round! +${score} pts.`,
  stack:     ({ player, total })   => `${player} stacked it — ${total} cards pending!`,
  rotate:    ({ player })          => `${player} rotated everyone's hands!`,
  swap:      ({ player, target })  => `${player} swapped hands with ${target}!`,
  jumpIn:    ({ player })          => `${player} jumped in out of nowhere!`,
}

export async function POST(request) {
  try {
    const { event, context, userApiKey } = await request.json()

    const GROQ_API_KEY = (userApiKey || '').trim() || process.env.GROQ_API_KEY?.trim()
    if (!GROQ_API_KEY) {
      // Silently return nothing — commentary is optional, don't error the game
      return NextResponse.json({ line: null })
    }

    const eventDesc = EVENTS[event]?.(context || {}) ?? `Something dramatic happened in UNO.`
    const userPrompt = `Event: ${eventDesc}\nWrite one commentary line.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 1.0,
        max_tokens: 40,
      }),
    })

    if (!response.ok) return NextResponse.json({ line: null })

    const data = await response.json()
    const raw  = data.choices?.[0]?.message?.content?.trim() || null
    // Strip surrounding quotes if LLM added them
    const line = raw ? raw.replace(/^["']|["']$/g, '').trim() : null
    return NextResponse.json({ line })
  } catch {
    return NextResponse.json({ line: null })
  }
}
