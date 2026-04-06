// src/app/api/groq/recommendations/route.js
import { NextResponse } from 'next/server'

export async function POST(request) {
  const { currentTrack, queueTitles = [], participantCount = 1 } = await request.json()

  const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim()
  if (!GROQ_API_KEY) return NextResponse.json({ error: 'Groq API not configured' }, { status: 500 })

  const prompt = `You are a music recommendation AI for a collaborative listening room.

Current track playing: "${currentTrack?.title || 'Unknown'}" by "${currentTrack?.channelTitle || 'Unknown Artist'}"

Upcoming queue (next ${queueTitles.length} tracks):
${queueTitles.length > 0 ? queueTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'Queue is empty'}

Number of participants vibing together: ${participantCount}

Based on this context, generate exactly 7 diverse but cohesive music recommendations that match the vibe while introducing some variety. Consider the current mood, genre, energy level, and the fact that multiple people are listening.

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "recommendations": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "reasoning": "Brief 1-sentence explanation of why this fits the vibe"
    }
  ]
}`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1024,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Groq error:', err)
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''

    // Parse JSON from response
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Groq recommendations error:', err)
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}
