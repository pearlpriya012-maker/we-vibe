'use client'
// src/components/games/UnoGame.jsx
// Full UNO game UI with invite flow + real card look + drop/fan animations.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createGame, playCard, pickWildColor, drawCard, passTurn,
  callUno, catchUno, challengeWD4, jumpIn, sevenSwap,
  getMyHand, getOpponentCounts, isMyTurn, needsColorPick,
  COLORS, cardScore,
} from '@/lib/uno'
import {
  writeUnoGame, saveUnoState, subscribeUnoGame, deleteUnoGame,
  writeUnoInvite, respondToInvite, deleteUnoInvite,
} from '@/lib/unoFirestore'

// ─── Design tokens ─────────────────────────────────────────────────────────────

const CC = {
  red:    { bg: '#C0392B', dark: '#7B241C', glow: 'rgba(192,57,43,0.7)',  text: '#fff' },
  yellow: { bg: '#D4AC0D', dark: '#9A7D0A', glow: 'rgba(212,172,13,0.7)', text: '#fff' },
  green:  { bg: '#1E8449', dark: '#145A32', glow: 'rgba(30,132,73,0.7)',   text: '#fff' },
  blue:   { bg: '#1A5276', dark: '#0D2B4A', glow: 'rgba(26,82,118,0.7)',   text: '#fff' },
  wild:   { bg: '#1a1a2e', dark: '#0D0D18', glow: 'rgba(200,200,255,0.3)', text: '#fff' },
}

const WILD_BG = 'conic-gradient(from 225deg, #C0392B 0deg 90deg, #1A5276 90deg 180deg, #1E8449 180deg 270deg, #D4AC0D 270deg 360deg)'

const VL = { skip: 'O', reverse: 'R', draw2: '+2', wild: 'W', wilddraw4: '+4' }
const cardLabel   = v => (v === 'skip' ? '\u2298' : v === 'reverse' ? '\u21bb' : v === 'wild' ? '\u2726' : VL[v] ?? v.toUpperCase())
const cornerLabel = v => (v === 'skip' ? '\u2298' : v === 'reverse' ? '\u21bb' : VL[v] ?? v)

// ─── CSS ───────────────────────────────────────────────────────────────────────

const UNO_STYLES = `
  @keyframes unoDrop {
    0%   { transform: scale(0.5) translateY(-55px) rotate(-24deg); opacity:0; }
    55%  { transform: scale(1.12) translateY(5px)  rotate(3deg);   opacity:1; }
    78%  { transform: scale(0.96) translateY(-2px) rotate(-1deg); }
    100% { transform: scale(1)   translateY(0)    rotate(0deg);   opacity:1; }
  }
  @keyframes unoGlow   { 0%,100%{filter:brightness(1) saturate(1)}50%{filter:brightness(1.22) saturate(1.35)} }
  @keyframes unoBlink  { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.8;transform:scale(1.06)} }
  @keyframes unoFadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
  @keyframes unoSpinCW  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes unoSpinCCW { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
  @keyframes unoPop     { 0%{transform:scale(.8);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1} }
  @keyframes colorBandIn{ from{opacity:0;transform:scaleX(.6)}to{opacity:1;transform:scaleX(1)} }
  @keyframes unoCardDrift { 0%,100%{transform:rotate(var(--cr)) translateY(0) scale(1)} 50%{transform:rotate(calc(var(--cr) + 5deg)) translateY(-14px) scale(1.04)} }
  @keyframes unoChipSpin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes unoLampPulse { 0%,100%{opacity:0.55} 50%{opacity:0.85} }
  .uno-drop     { animation: unoDrop   .42s cubic-bezier(.175,.885,.32,1.275) both; }
  .uno-glow     { animation: unoGlow   1.8s ease-in-out infinite; }
  .uno-blink    { animation: unoBlink    1s ease-in-out infinite; }
  .uno-fadein   { animation: unoFadeUp .25s ease both; }
  .uno-pop      { animation: unoPop    .35s cubic-bezier(.34,1.56,.64,1) both; }
  .uno-band     { animation: colorBandIn .3s ease both; }
  .spin-cw      { animation: unoSpinCW  3s linear infinite; display:inline-block; }
  .spin-ccw     { animation: unoSpinCCW 3s linear infinite; display:inline-block; }
`

// ─── CardFace ──────────────────────────────────────────────────────────────────

function CardFace({ card, small, selected, playable, onClick, style = {}, className = '' }) {
  if (!card) return null
  const isWild = card.color === 'wild'
  const W = small ? 42 : 62
  const H = small ? 60 : 88
  const r  = Math.round(W * 0.13)
  const cc = CC[card.color] || CC.wild
  const cl = cardLabel(card.value)
  const co = cornerLabel(card.value)

  return (
    <div
      onClick={onClick}
      className={[className, playable && !selected ? 'uno-glow' : ''].filter(Boolean).join(' ')}
      title={`${card.color} ${card.value}`}
      style={{
        position: 'relative', width: W, height: H, borderRadius: r,
        background: isWild ? WILD_BG : cc.bg,
        boxShadow: selected
          ? `0 0 0 3px #fff, 0 0 0 5px ${cc.bg}, 0 10px 28px ${cc.glow}`
          : playable ? `0 8px 24px ${cc.glow}, 0 3px 10px rgba(0,0,0,0.5)` : '0 3px 8px rgba(0,0,0,0.55)',
        transform: selected ? 'translateY(-20px) scale(1.09)' : playable ? 'translateY(-5px)' : 'none',
        transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .15s',
        cursor: onClick ? 'pointer' : 'default',
        opacity: onClick && !playable && !selected ? 0.52 : 1,
        userSelect: 'none', flexShrink: 0, overflow: 'hidden',
        border: selected ? '2px solid rgba(255,255,255,0.92)' : '2px solid rgba(255,255,255,0.22)',
        ...style,
      }}
    >
      <div style={{ position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'repeating-linear-gradient(45deg,transparent 0px,transparent 5px,rgba(0,0,0,0.055) 5px,rgba(0,0,0,0.055) 6px)' }} />
      <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%) rotate(-20deg)',width:W*.74,height:H*.59,borderRadius:'50%',background:isWild?WILD_BG:'rgba(255,255,255,0.93)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',pointerEvents:'none',boxShadow:'0 2px 8px rgba(0,0,0,0.28)' }}>
        <span style={{ fontFamily:'Oswald',fontWeight:800,fontSize:small?'0.92rem':'1.38rem',color:isWild?'#fff':cc.bg,textShadow:isWild?'0 1px 6px rgba(0,0,0,0.8)':'0 1px 3px rgba(0,0,0,0.12)',transform:'rotate(20deg)',display:'inline-block',lineHeight:1,letterSpacing:'-0.02em' }}>{cl}</span>
      </div>
      <div style={{ position:'absolute',top:3,left:4,fontFamily:'Oswald',fontWeight:700,fontSize:small?'0.5rem':'0.64rem',color:'#fff',lineHeight:1.1,textShadow:'0 1px 4px rgba(0,0,0,0.9)',pointerEvents:'none' }}>{co}</div>
      <div style={{ position:'absolute',bottom:3,right:4,fontFamily:'Oswald',fontWeight:700,fontSize:small?'0.5rem':'0.64rem',color:'#fff',lineHeight:1.1,textShadow:'0 1px 4px rgba(0,0,0,0.9)',transform:'rotate(180deg)',pointerEvents:'none' }}>{co}</div>
      <div style={{ position:'absolute',top:0,left:0,right:0,height:'40%',background:'linear-gradient(180deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%)',borderRadius:`${r}px ${r}px 0 0`,pointerEvents:'none' }} />
    </div>
  )
}

// ─── CardBack ──────────────────────────────────────────────────────────────────

function CardBack({ small = false, style = {} }) {
  const W = small ? 42 : 62; const H = small ? 60 : 88; const r = Math.round(W * 0.13)
  return (
    <div style={{ position:'relative',width:W,height:H,borderRadius:r,background:'linear-gradient(135deg,#100828 0%,#080818 100%)',border:'2px solid rgba(255,255,255,0.12)',overflow:'hidden',flexShrink:0,...style }}>
      <div style={{ position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(rgba(255,255,255,0.042) 1px,transparent 1px)',backgroundSize:'7px 7px' }} />
      <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%) rotate(-20deg)',width:W*.7,height:H*.52,background:'linear-gradient(135deg,#C0392B 35%,#1A5276 100%)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 14px rgba(192,57,43,0.4)',overflow:'hidden' }}>
        <span style={{ fontFamily:'Oswald',fontWeight:800,fontSize:small?'0.5rem':'0.72rem',color:'#fff',letterSpacing:'0.08em',transform:'rotate(20deg)',display:'inline-block',textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>UNO</span>
      </div>
      <div style={{ position:'absolute',top:0,left:0,right:0,height:'40%',background:'linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 100%)',borderRadius:`${r}px ${r}px 0 0`,pointerEvents:'none' }} />
    </div>
  )
}

// ─── DrawPileStack ─────────────────────────────────────────────────────────────

function DrawPileStack({ count, onClick, enabled }) {
  return (
    <div onClick={enabled ? onClick : undefined} style={{ position:'relative',width:70,height:96,flexShrink:0,cursor:enabled?'pointer':'default' }}>
      <CardBack style={{ position:'absolute',top:6,left:6,opacity:0.4 }} />
      <CardBack style={{ position:'absolute',top:3,left:3,opacity:0.65 }} />
      <CardBack style={{ position:'absolute',top:0,left:0 }} />
      {enabled && <div style={{ position:'absolute',top:0,left:0,width:62,height:88,borderRadius:8,border:'2px solid rgba(0,255,136,0.5)',boxShadow:'0 0 16px rgba(0,255,136,0.35)',pointerEvents:'none' }} />}
      {count > 0 && <div style={{ position:'absolute',top:-8,right:-2,zIndex:10,background:'rgba(0,0,0,0.9)',border:'1px solid rgba(255,255,255,0.22)',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Oswald',fontSize:'0.52rem',color:'#fff' }}>{count}</div>}
    </div>
  )
}

// ─── DiscardPileArea ───────────────────────────────────────────────────────────

function DiscardPileArea({ topCard, prevCard, currentColor }) {
  return (
    <div style={{ position:'relative',width:62,height:88,flexShrink:0 }}>
      {prevCard && <div style={{ position:'absolute',top:4,left:6,zIndex:0,opacity:0.42,transform:'rotate(14deg)',pointerEvents:'none' }}><CardFace card={prevCard} /></div>}
      {topCard && <div key={topCard.id} className="uno-drop" style={{ position:'absolute',top:0,left:0,zIndex:1 }}><CardFace card={topCard} /></div>}
      {currentColor && topCard?.color === 'wild' && (
        <div style={{ position:'absolute',bottom:-7,right:-7,width:18,height:18,borderRadius:'50%',background:CC[currentColor]?.bg,border:'2.5px solid rgba(255,255,255,0.55)',boxShadow:`0 0 10px ${CC[currentColor]?.glow}`,zIndex:5 }} />
      )}
    </div>
  )
}

// ─── DirectionIndicator ────────────────────────────────────────────────────────

function DirectionIndicator({ direction }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
      <span className={direction > 0 ? 'spin-cw' : 'spin-ccw'} style={{ fontSize:'1.1rem',opacity:0.6 }}>↻</span>
      <span style={{ fontFamily:'Oswald',fontSize:'0.48rem',color:'var(--text-dim)',letterSpacing:'0.08em' }}>{direction > 0 ? 'CW' : 'CCW'}</span>
    </div>
  )
}

// ─── ColorBand ─────────────────────────────────────────────────────────────────

function ColorBand({ color }) {
  if (!color || !CC[color]) return null
  return (
    <div key={color} className="uno-band" style={{ height:4,background:CC[color].bg,boxShadow:`0 0 12px ${CC[color].glow}`,flexShrink:0 }} />
  )
}

// ─── HandFan ───────────────────────────────────────────────────────────────────

function HandFan({ cards, selectedId, drawnId, onCardClick, cardIsPlayable }) {
  const n = cards.length
  const step = n > 12 ? 2.5 : n > 8 ? 3.5 : n > 5 ? 5 : 7
  return (
    <div style={{ display:'flex',alignItems:'flex-end',justifyContent:n<7?'center':'flex-start',paddingTop:22,paddingBottom:16,overflowX:n>10?'auto':'visible',scrollbarWidth:'none',minHeight:126 }}>
      {cards.map((card, i) => {
        const ctr = (n-1)/2; const t = n>1?(i-ctr)/Math.max(ctr,1):0
        const angle = t * step * ((n-1)/2); const arc = Math.pow(Math.abs(t),1.4)*14
        const isSelected = card.id === selectedId; const isDrawn = card.id === drawnId
        const playable = cardIsPlayable(card) || isDrawn
        return (
          <div key={card.id} className="uno-fadein" style={{ marginLeft:i===0?0:-18,zIndex:isSelected?60:i,transform:isSelected?'translateY(-22px) scale(1.1) rotate(0deg)':`rotate(${angle}deg) translateY(${arc}px)`,transformOrigin:'bottom center',transition:'transform .2s cubic-bezier(.34,1.56,.64,1)',position:'relative',flexShrink:0 }}>
            <CardFace card={card} playable={playable} selected={isSelected} onClick={playable?()=>onCardClick(card.id):undefined} />
            {isDrawn && <div style={{ position:'absolute',top:-10,left:'50%',transform:'translateX(-50%)',fontSize:'0.44rem',color:'var(--green)',background:'rgba(0,255,136,0.12)',border:'1px solid rgba(0,255,136,0.35)',borderRadius:3,padding:'1px 4px',fontFamily:'Oswald',whiteSpace:'nowrap' }}>NEW</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── OpponentSeat ──────────────────────────────────────────────────────────────

function OpponentSeat({ opponent, isCurrent, onCatchUno, unoEligible }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'8px 10px',borderRadius:12,minWidth:68,flexShrink:0,background:isCurrent?'rgba(255,215,0,0.07)':'rgba(255,255,255,0.025)',border:`1.5px solid ${isCurrent?'rgba(255,215,0,0.38)':'rgba(255,255,255,0.07)'}`,transition:'all .3s',boxShadow:isCurrent?'0 0 22px rgba(255,215,0,0.15), inset 0 0 22px rgba(255,215,0,0.04)':'none' }}>
      <div style={{ position:'relative' }}>
        {opponent.photoURL
          ? <img src={opponent.photoURL} alt="" style={{ width:32,height:32,borderRadius:'50%',objectFit:'cover',border:`2px solid ${isCurrent?'gold':'rgba(255,255,255,0.1)'}` }} />
          : <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#C0392B,#1A5276)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Oswald',fontWeight:700,fontSize:'0.85rem',color:'#fff',border:`2px solid ${isCurrent?'gold':'transparent'}` }}>{(opponent.displayName||'?')[0].toUpperCase()}</div>
        }
        {isCurrent && <div style={{ position:'absolute',top:-5,right:-5,fontSize:'0.65rem' }}>👑</div>}
      </div>
      <div style={{ fontFamily:'Oswald',fontSize:'0.62rem',color:isCurrent?'gold':'var(--text-dim)',maxWidth:64,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center' }}>{opponent.displayName}</div>
      <div style={{ display:'flex',gap:1,flexWrap:'nowrap' }}>
        {Array.from({length:Math.min(opponent.count,7)}).map((_,j)=>(
          <div key={j} style={{ width:7,height:11,borderRadius:1.5,background:'linear-gradient(135deg,#330a18,#0a106b)',border:'0.5px solid rgba(255,255,255,0.22)' }} />
        ))}
        {opponent.count>7&&<span style={{ fontSize:'0.5rem',color:'var(--text-dim)',marginLeft:2 }}>+{opponent.count-7}</span>}
      </div>
      <div style={{ fontFamily:'Oswald',fontSize:'0.68rem',color:opponent.count===1?'#ff6b6b':'var(--text-dim)' }}>{opponent.count}{opponent.count===1?' 🔔':''}</div>
      {unoEligible&&<button onClick={()=>onCatchUno(opponent.uid)} style={{ background:'linear-gradient(135deg,#C0392B,#7B241C)',border:'none',borderRadius:6,padding:'3px 8px',color:'#fff',fontFamily:'Oswald',fontSize:'0.58rem',cursor:'pointer',letterSpacing:'0.08em',boxShadow:'0 0 10px rgba(192,57,43,0.55)' }}>CATCH!</button>}
    </div>
  )
}

// ─── ColorPicker ───────────────────────────────────────────────────────────────

function ColorPicker({ onPick }) {
  return (
    <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.88)',zIndex:100,backdropFilter:'blur(5px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:28 }}>
      <div style={{ fontFamily:'Oswald',fontSize:'1.4rem',color:'#fff',letterSpacing:'0.18em' }}>CHOOSE COLOR</div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
        {COLORS.map(c=>(
          <button key={c} onClick={()=>onPick(c)} style={{ width:82,height:82,borderRadius:18,background:CC[c].bg,border:'3px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:`0 4px 22px ${CC[c].glow},inset 0 1px 0 rgba(255,255,255,0.25)`,fontFamily:'Oswald',fontWeight:700,fontSize:'0.72rem',color:'#fff',letterSpacing:'0.1em',textTransform:'uppercase',transition:'transform .15s' }}
            onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.1)'}}
            onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)'}}
          >{c}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Invite Countdown Bar ──────────────────────────────────────────────────────

function CountdownBar({ expiresAt }) {
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
  useEffect(() => {
    const iv = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setSecs(r); if (r <= 0) clearInterval(iv)
    }, 500)
    return () => clearInterval(iv)
  }, [expiresAt])
  const pct = Math.max(0, (secs / 45) * 100)
  const color = secs <= 10 ? '#e74c3c' : secs <= 20 ? '#f39c12' : '#00ff88'
  return (
    <div style={{ display:'flex',alignItems:'center',gap:10 }}>
      <div style={{ flex:1,height:6,borderRadius:3,background:'rgba(255,255,255,0.08)',overflow:'hidden' }}>
        <div style={{ height:'100%',width:`${pct}%`,background:color,borderRadius:3,transition:'width .5s linear,background .5s',boxShadow:`0 0 8px ${color}` }} />
      </div>
      <span style={{ fontFamily:'Oswald',fontSize:'0.8rem',color,minWidth:30,textAlign:'right' }}>{secs}s</span>
    </div>
  )
}

// ─── Player Response Row ───────────────────────────────────────────────────────

const STATUS_ICONS = { accepted: '✅', declined: '❌', pending: '⏳' }

function PlayerResponseRow({ participant, response, isHost, isMe }) {
  const statusColor = response === 'accepted' ? '#00ff88' : response === 'declined' ? '#ff6b6b' : 'var(--text-dim)'
  return (
    <div style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderRadius:10,background:response==='accepted'?'rgba(0,255,136,0.04)':response==='declined'?'rgba(255,107,107,0.04)':'rgba(255,255,255,0.025)',border:`1px solid ${response==='accepted'?'rgba(0,255,136,0.18)':response==='declined'?'rgba(255,107,107,0.15)':'rgba(255,255,255,0.06)'}`,marginBottom:6 }}>
      {participant.photoURL
        ? <img src={participant.photoURL} alt="" style={{ width:28,height:28,borderRadius:'50%',objectFit:'cover' }} />
        : <div style={{ width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#C0392B,#1A5276)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Oswald',fontWeight:700,fontSize:'0.75rem',color:'#fff' }}>{(participant.displayName||'?')[0].toUpperCase()}</div>
      }
      <span style={{ fontFamily:'Oswald',fontSize:'0.82rem',color:isMe?'var(--green)':'#fff',flex:1 }}>{participant.displayName}</span>
      {isHost && <span style={{ fontFamily:'Oswald',fontSize:'0.58rem',color:'gold',letterSpacing:'0.08em',marginRight:4 }}>HOST</span>}
      {isMe && !isHost && <span style={{ fontFamily:'Oswald',fontSize:'0.58rem',color:'var(--green)',letterSpacing:'0.06em',marginRight:4 }}>YOU</span>}
      <span style={{ fontSize:'0.85rem',color:statusColor }}>{STATUS_ICONS[response] || '⏳'}</span>
    </div>
  )
}

// ─── Invite Waiting Room ───────────────────────────────────────────────────────

function InviteWaitingRoom({ invite, roomParticipants, currentUser, roomId, onStartGame, onCancel }) {
  const isHost = invite.initiatorUid === currentUser.uid

  // Auto-start or cancel when countdown expires (host only)
  useEffect(() => {
    if (!isHost) return
    const remaining = invite.expiresAt - Date.now()
    if (remaining <= 0) { handleExpired(); return }
    const t = setTimeout(handleExpired, remaining)
    return () => clearTimeout(t)
  }, [invite.expiresAt])

  function handleExpired() {
    const accepted = Object.entries(invite.responses || {}).filter(([,r])=>r==='accepted').map(([uid])=>uid)
    if (accepted.length >= 2) {
      onStartGame(accepted)
    } else {
      deleteUnoInvite(roomId)
    }
  }

  const responses = invite.responses || {}
  const acceptedUids = Object.entries(responses).filter(([,r])=>r==='accepted').map(([uid])=>uid)
  const canStart = acceptedUids.length >= 2

  return (
    <div style={{ flex:1,overflowY:'auto',display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 20px',gap:20 }}>

      {/* Header */}
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Oswald',fontSize:'2.6rem',fontWeight:800,letterSpacing:'0.28em',background:WILD_BG,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',filter:'drop-shadow(0 0 18px rgba(192,57,43,0.38))' }}>UNO</div>
        <div style={{ fontFamily:'Oswald',fontSize:'0.82rem',color:'var(--text-dim)',marginTop:6,letterSpacing:'0.1em' }}>
          {isHost ? 'Waiting for players to respond…' : `${invite.initiatorName} invited you to play`}
        </div>
      </div>

      {/* Countdown */}
      <div style={{ width:'100%',maxWidth:420 }}>
        <CountdownBar expiresAt={invite.expiresAt} />
      </div>

      {/* Player responses */}
      <div style={{ width:'100%',maxWidth:420 }}>
        <div style={{ fontFamily:'Oswald',fontSize:'0.68rem',color:'var(--text-dim)',letterSpacing:'0.14em',marginBottom:10 }}>
          RESPONSES ({acceptedUids.length} accepted)
        </div>
        {roomParticipants.map(p => (
          <PlayerResponseRow
            key={p.uid}
            participant={p}
            response={responses[p.uid] || 'pending'}
            isHost={p.uid === invite.initiatorUid}
            isMe={p.uid === currentUser.uid}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display:'flex',gap:12,paddingBottom:16 }}>
        {isHost ? (
          <>
            <button onClick={onCancel} style={{ padding:'11px 22px',borderRadius:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.82rem',cursor:'pointer',letterSpacing:'0.06em' }}>
              Cancel
            </button>
            <button
              onClick={() => onStartGame(acceptedUids)}
              disabled={!canStart}
              style={{ padding:'11px 32px',borderRadius:10,border:'none',background:canStart?WILD_BG:'rgba(255,255,255,0.05)',color:canStart?'#fff':'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.9rem',fontWeight:700,letterSpacing:'0.12em',cursor:canStart?'pointer':'not-allowed',opacity:canStart?1:0.4 }}
            >
              Start Game ({acceptedUids.length})
            </button>
          </>
        ) : responses[currentUser.uid] === 'accepted' ? (
          <div style={{ fontFamily:'Oswald',fontSize:'0.78rem',color:'var(--text-dim)',textAlign:'center' }}>✅ You accepted — waiting for host to start</div>
        ) : responses[currentUser.uid] === 'declined' ? (
          <div style={{ fontFamily:'Oswald',fontSize:'0.78rem',color:'var(--text-dim)',textAlign:'center' }}>❌ You declined this game</div>
        ) : (
          <div style={{ display:'flex',gap:10 }}>
            <button onClick={() => respondToInvite(roomId,currentUser.uid,'declined')} style={{ padding:'11px 20px',borderRadius:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.82rem',cursor:'pointer',letterSpacing:'0.06em' }}>Decline</button>
            <button onClick={() => respondToInvite(roomId,currentUser.uid,'accepted')} style={{ padding:'11px 28px',borderRadius:10,border:'none',background:WILD_BG,color:'#fff',fontFamily:'Oswald',fontSize:'0.88rem',fontWeight:700,letterSpacing:'0.12em',cursor:'pointer' }}>✅ Accept</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Setup Lobby ───────────────────────────────────────────────────────────────

function SetupLobby({ roomParticipants, currentUser, roomId, onClose }) {
  const [houseRules, setHouseRules] = useState({ stackDraw:false, sevenSwap:false, jumpIn:false })
  const toggle = k => setHouseRules(r=>({...r,[k]:!r[k]}))
  const canInvite = roomParticipants.length >= 2

  async function sendInvite() {
    const responses = {}
    for (const p of roomParticipants) {
      responses[p.uid] = p.uid === currentUser.uid ? 'accepted' : 'pending'
    }
    await writeUnoInvite(roomId, {
      initiatorUid: currentUser.uid,
      initiatorName: currentUser.displayName || 'Someone',
      initiatorPhoto: currentUser.photoURL || '',
      gameName: 'UNO',
      houseRules,
      sentAt: Date.now(),
      expiresAt: Date.now() + 45000,
      responses,
    })
  }

  return (
    <div style={{ flex:1,overflowY:'auto',display:'flex',flexDirection:'column',alignItems:'center',gap:22,padding:'28px 20px' }}>

      <div style={{ fontFamily:'Oswald',fontSize:'3rem',fontWeight:800,letterSpacing:'0.3em',background:WILD_BG,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',filter:'drop-shadow(0 0 22px rgba(192,57,43,0.42))' }}>UNO</div>

      {/* Players in room */}
      <div style={{ width:'100%',maxWidth:400 }}>
        <div style={{ fontFamily:'Oswald',fontSize:'0.68rem',color:'var(--text-dim)',letterSpacing:'0.14em',marginBottom:10 }}>IN THIS ROOM ({roomParticipants.length})</div>
        {roomParticipants.map(p => (
          <div key={p.uid} style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderRadius:10,background:'rgba(255,255,255,0.035)',border:'1px solid rgba(255,255,255,0.07)',marginBottom:6 }}>
            {p.photoURL ? <img src={p.photoURL} alt="" style={{ width:28,height:28,borderRadius:'50%',objectFit:'cover' }} /> : <div style={{ width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#C0392B,#1A5276)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Oswald',fontWeight:700,fontSize:'0.75rem',color:'#fff' }}>{(p.displayName||'?')[0].toUpperCase()}</div>}
            <span style={{ fontFamily:'Oswald',fontSize:'0.82rem',color:'#fff',flex:1 }}>{p.displayName}</span>
            {p.uid === currentUser.uid && <span style={{ fontSize:'0.6rem',color:'var(--green)',letterSpacing:'0.06em' }}>YOU</span>}
          </div>
        ))}
      </div>

      {/* House Rules */}
      <div style={{ width:'100%',maxWidth:400 }}>
        <div style={{ fontFamily:'Oswald',fontSize:'0.68rem',color:'var(--text-dim)',letterSpacing:'0.14em',marginBottom:10 }}>HOUSE RULES</div>
        {[['stackDraw','Stack +2 / +4',"Chain draw cards until someone can't stack"],['sevenSwap','7-Swap / 0-Rotate','Play 7 to swap hands; 0 rotates all hands'],['jumpIn','Jump-In','Play an identical card out of turn']].map(([key,label,desc])=>(
          <div key={key} onClick={()=>toggle(key)} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,cursor:'pointer',marginBottom:8,background:houseRules[key]?'rgba(0,255,136,0.05)':'rgba(255,255,255,0.02)',border:`1px solid ${houseRules[key]?'rgba(0,255,136,0.22)':'rgba(255,255,255,0.06)'}` }}>
            <div style={{ width:36,height:20,borderRadius:10,background:houseRules[key]?'var(--green)':'rgba(255,255,255,0.1)',position:'relative',flexShrink:0,transition:'background .2s' }}>
              <div style={{ position:'absolute',top:2,left:houseRules[key]?18:2,width:16,height:16,borderRadius:'50%',background:houseRules[key]?'#000':'var(--text-dim)',transition:'left .2s' }} />
            </div>
            <div>
              <div style={{ fontFamily:'Oswald',fontSize:'0.78rem',color:houseRules[key]?'var(--green)':'#fff' }}>{label}</div>
              <div style={{ fontSize:'0.62rem',color:'var(--text-dim)',marginTop:1 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex',gap:12 }}>
        <button onClick={onClose} style={{ padding:'11px 24px',borderRadius:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.85rem',cursor:'pointer',letterSpacing:'0.06em' }}>Cancel</button>
        <button onClick={sendInvite} disabled={!canInvite} style={{ padding:'11px 36px',borderRadius:10,border:'none',background:canInvite?WILD_BG:'rgba(255,255,255,0.05)',color:canInvite?'#fff':'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.9rem',fontWeight:700,letterSpacing:'0.12em',cursor:canInvite?'pointer':'not-allowed',opacity:canInvite?1:0.4 }}>
          🎮 INVITE PLAYERS
        </button>
      </div>
      {!canInvite && <div style={{ fontSize:'0.72rem',color:'var(--text-dim)' }}>Need at least 2 players in the room</div>}
    </div>
  )
}

// ─── Game Over ─────────────────────────────────────────────────────────────────

function GameOver({ game, currentUser, onPlayAgain, onClose }) {
  const winner = game.winner; const isWinner = winner === currentUser.uid
  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:22,padding:28,overflowY:'auto' }}>
      <div className="uno-pop" style={{ fontSize:'5rem',lineHeight:1 }}>{isWinner?'🏆':'😭'}</div>
      <div style={{ fontFamily:'Oswald',fontSize:'1.8rem',letterSpacing:'0.22em',background:isWinner?'linear-gradient(135deg,gold,#ff9500)':'none',color:isWinner?'transparent':'var(--text-dim)',WebkitBackgroundClip:isWinner?'text':undefined,WebkitTextFillColor:isWinner?'transparent':undefined }}>
        {isWinner?'YOU WIN!':`${game.players[winner]?.displayName} WINS!`}
      </div>
      <div style={{ width:'100%',maxWidth:380 }}>
        <div style={{ fontFamily:'Oswald',fontSize:'0.68rem',color:'var(--text-dim)',letterSpacing:'0.14em',marginBottom:10 }}>SCORES</div>
        {Object.entries(game.scores||{}).sort((a,b)=>b[1]-a[1]).map(([uid,score])=>(
          <div key={uid} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 14px',borderRadius:10,marginBottom:6,background:uid===winner?'rgba(255,215,0,0.06)':'rgba(255,255,255,0.025)',border:`1px solid ${uid===winner?'rgba(255,215,0,0.22)':'rgba(255,255,255,0.06)'}` }}>
            <span style={{ fontFamily:'Oswald',fontSize:'0.82rem',color:uid===winner?'gold':'#fff' }}>{game.players[uid]?.displayName}</span>
            <span style={{ fontFamily:'Oswald',fontSize:'0.82rem',color:uid===winner?'gold':'var(--text-dim)' }}>{score} pts</span>
          </div>
        ))}
      </div>
      <div style={{ width:'100%',maxWidth:380 }}>
        <div style={{ fontFamily:'Oswald',fontSize:'0.64rem',color:'var(--text-dim)',letterSpacing:'0.1em',marginBottom:8 }}>HAND VALUES</div>
        {Object.entries(game.hands||{}).filter(([uid])=>uid!==winner).map(([uid,hand])=>(
          <div key={uid} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 12px',borderRadius:8,background:'rgba(255,255,255,0.018)',marginBottom:4 }}>
            <span style={{ fontFamily:'Oswald',fontSize:'0.75rem',color:'var(--text-dim)' }}>{game.players[uid]?.displayName}</span>
            <div style={{ display:'flex',gap:3,alignItems:'center' }}>
              {hand.slice(0,5).map(c=><CardFace key={c.id} card={c} small />)}
              {hand.length>5&&<span style={{ fontSize:'0.6rem',color:'var(--text-dim)' }}>+{hand.length-5}</span>}
              <span style={{ fontFamily:'Oswald',fontSize:'0.75rem',color:'#ff6b6b',marginLeft:6 }}>{hand.reduce((s,c)=>s+cardScore(c),0)} pts</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:12 }}>
        <button onClick={onClose} style={{ padding:'11px 24px',borderRadius:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.82rem',cursor:'pointer' }}>Close</button>
        <button onClick={onPlayAgain} style={{ padding:'11px 36px',borderRadius:10,background:WILD_BG,border:'none',color:'#fff',fontFamily:'Oswald',fontSize:'0.9rem',fontWeight:700,letterSpacing:'0.12em',cursor:'pointer' }}>Play Again</button>
      </div>
    </div>
  )
}

// ─── Casino Background ─────────────────────────────────────────────────────────

function UnoBg() {
  const cards = [
    { top:'6%',  left:'4%',   w:38, h:56, r:'-20deg', d:'3.2s', delay:'0s'   },
    { top:'12%', right:'5%',  w:32, h:48, r:'25deg',  d:'4.1s', delay:'0.6s' },
    { top:'62%', left:'3%',   w:36, h:52, r:'-10deg', d:'5.0s', delay:'1.1s' },
    { top:'68%', right:'5%',  w:30, h:44, r:'18deg',  d:'3.8s', delay:'0.3s' },
    { top:'38%', left:'1%',   w:28, h:42, r:'30deg',  d:'4.6s', delay:'1.8s' },
    { top:'48%', right:'2%',  w:34, h:50, r:'-15deg', d:'3.5s', delay:'0.9s' },
  ]
  const chips = [
    { top:'22%', left:'89%', size:22 },
    { top:'74%', left:'8%',  size:18 },
    { top:'55%', left:'93%', size:14 },
  ]
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:0 }}>
      {/* Base green felt */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 140% 65% at 50% -15%, #1d5c34 0%, #0b2a17 38%, #050c07 100%)' }} />
      {/* Overhead lamp warm glow */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 75% 50% at 50% 0%, rgba(255,200,80,0.09) 0%, transparent 60%)' }} />
      {/* Inner spotlight on table */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 45% at 50% 38%, rgba(28,110,58,0.2) 0%, transparent 65%)' }} />
      {/* Edge vignette */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.82) 100%)' }} />
      {/* Felt weave texture */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:'repeating-linear-gradient(0deg, rgba(255,255,255,0.007) 0px, rgba(255,255,255,0.007) 1px, transparent 1px, transparent 5px), repeating-linear-gradient(90deg, rgba(255,255,255,0.007) 0px, rgba(255,255,255,0.007) 1px, transparent 1px, transparent 5px)' }} />
      {/* Diagonal felt weave */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:'repeating-linear-gradient(45deg, rgba(255,255,255,0.004) 0px, rgba(255,255,255,0.004) 1px, transparent 1px, transparent 8px)' }} />
      {/* Gold border accent */}
      <div style={{ position:'absolute', inset:12, borderRadius:14, border:'1px solid rgba(212,175,55,0.07)' }} />
      <div style={{ position:'absolute', inset:24, borderRadius:10, border:'1px solid rgba(212,175,55,0.04)' }} />
      {/* Floating card silhouettes */}
      {cards.map((c,i) => (
        <div key={i} style={{
          position:'absolute', top:c.top, left:c.left, right:c.right,
          width:c.w, height:c.h, borderRadius:5,
          border:'1px solid rgba(255,255,255,0.06)',
          background:'rgba(0,0,0,0.18)',
          style: `--cr:${c.r}`,
          animation:`unoCardDrift ${c.d} ease-in-out ${c.delay} infinite`,
          transform:`rotate(${c.r})`,
        }}>
          <div style={{ position:'absolute', inset:3, borderRadius:3, border:'1px solid rgba(255,255,255,0.04)' }} />
        </div>
      ))}
      {/* Gold chip rings */}
      {chips.map((chip,i) => (
        <div key={i} style={{
          position:'absolute', top:chip.top, left:chip.left,
          width:chip.size, height:chip.size, borderRadius:'50%',
          border:'1px solid rgba(212,175,55,0.13)',
          animation:`unoLampPulse ${2.5 + i*0.7}s ease-in-out ${i*0.8}s infinite`,
        }}>
          <div style={{ position:'absolute', inset:3, borderRadius:'50%', border:'1px solid rgba(212,175,55,0.07)' }} />
        </div>
      ))}
      {/* Center table oval */}
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'55%', height:'45%',
        borderRadius:'50%', border:'1px solid rgba(30,100,55,0.2)', background:'transparent' }} />
    </div>
  )
}

// ─── Main UnoGame ──────────────────────────────────────────────────────────────

export default function UnoGame({ roomId, roomParticipants, currentUser, invite, onClose }) {
  const [game, setGame]                     = useState(null)
  const [loading, setLoading]               = useState(true)
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [error, setError]                   = useState(null)
  const [showLog, setShowLog]               = useState(false)
  const [sevenTarget, setSevenTarget]       = useState(null)
  const gameRef = useRef(null)

  useEffect(() => {
    const unsub = subscribeUnoGame(roomId, s => { setGame(s); gameRef.current = s; setLoading(false) })
    return unsub
  }, [roomId])

  const act = useCallback(async fn => {
    setError(null)
    try { await saveUnoState(roomId, fn(gameRef.current)) }
    catch (e) { setError(e.message); setTimeout(()=>setError(null), 3200) }
  }, [roomId])

  // ── Invite actions ──

  async function handleStartGame(acceptedUids) {
    const players = roomParticipants
      .filter(p => acceptedUids.includes(p.uid))
      .map(p => ({ uid: p.uid, displayName: p.displayName, photoURL: p.photoURL || '' }))
    if (players.length < 2) { setError('Need at least 2 accepted players'); return }
    const houseRules = invite?.houseRules || {}
    const state = createGame(players, houseRules)
    await writeUnoGame(roomId, state)
    await deleteUnoInvite(roomId)
  }

  async function handleCancelInvite() {
    await deleteUnoInvite(roomId)
  }

  // ── Game actions ──

  function handlePlayCard(cardId) {
    const g = gameRef.current; if (!g) return
    const card = g.hands[currentUser.uid]?.find(c=>c.id===cardId); if (!card) return
    if (card.value==='wild'||card.value==='wilddraw4') { setSelectedCardId(cardId); return }
    if (g.houseRules?.sevenSwap&&card.value==='7') { setSelectedCardId(cardId); setSevenTarget('PICK'); return }
    act(s=>playCard(s,currentUser.uid,cardId)); setSelectedCardId(null)
  }

  function handleColorPick(color) {
    if (!selectedCardId) { act(s=>pickWildColor(s,currentUser.uid,color)) }
    else { act(s=>playCard(s,currentUser.uid,selectedCardId,color)) }
    setSelectedCardId(null)
  }

  function handleDraw()        { act(s=>drawCard(s,currentUser.uid));  setSelectedCardId(null) }
  function handlePass()        { act(s=>passTurn(s,currentUser.uid)) }
  function handleUno()         { act(s=>callUno(s,currentUser.uid)) }
  function handleCatchUno(tgt) { act(s=>catchUno(s,currentUser.uid,tgt)) }
  function handleChallenge()   { act(s=>challengeWD4(s,currentUser.uid)) }
  function handleJumpIn(cardId){ act(s=>jumpIn(s,currentUser.uid,cardId)) }

  function handleSevenSwap(toUid) {
    act(s=>{ const g=playCard(s,currentUser.uid,selectedCardId); return sevenSwap(g,currentUser.uid,toUid) })
    setSelectedCardId(null); setSevenTarget(null)
  }

  async function handlePlayAgain() {
    const acceptedUids = Object.keys(game.players)
    await handleStartGame(acceptedUids)
  }

  async function handleClose() { await deleteUnoGame(roomId); onClose() }

  function cardIsPlayable(card) {
    if (!game||!isMyTurn(game,currentUser.uid)) return false
    if (game.wildPickerUid) return false
    const { pendingDraw, houseRules:hr } = game
    const topCard = game.discardPile?.[game.discardPile.length-1]
    if (pendingDraw>0&&!hr.stackDraw) return false
    if (pendingDraw>0&&hr.stackDraw) return (topCard.value==='draw2'&&card.value==='draw2')||(topCard.value==='wilddraw4'&&card.value==='wilddraw4')
    if (card.value==='wild'||card.value==='wilddraw4') return true
    if (card.color===game.currentColor) return true
    if (card.value===topCard?.value) return true
    return false
  }

  // ── Render ──

  if (loading) return <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Oswald',color:'var(--text-dim)',letterSpacing:'0.14em' }}>LOADING…</div>

  // No game yet: invite exists → waiting room, else → setup lobby
  if (!game) {
    if (invite) {
      return (
        <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',background:'#050c07',isolation:'isolate' }}>
          <style>{UNO_STYLES}</style>
          <UnoBg />
          <div style={{ position:'relative',zIndex:1,flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
            <InviteWaitingRoom invite={invite} roomParticipants={roomParticipants} currentUser={currentUser} roomId={roomId} onStartGame={handleStartGame} onCancel={handleCancelInvite} />
          </div>
        </div>
      )
    }
    return (
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',background:'#050c07',isolation:'isolate' }}>
        <style>{UNO_STYLES}</style>
        <UnoBg />
        <div style={{ position:'relative',zIndex:1,flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <SetupLobby roomParticipants={roomParticipants} currentUser={currentUser} roomId={roomId} onClose={onClose} />
        </div>
      </div>
    )
  }

  if (game.status==='finished') return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',background:'#050c07',isolation:'isolate' }}>
      <style>{UNO_STYLES}</style>
      <UnoBg />
      <div style={{ position:'relative',zIndex:1,flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
        <GameOver game={game} currentUser={currentUser} onPlayAgain={handlePlayAgain} onClose={handleClose} />
      </div>
    </div>
  )

  // ── Active game ──
  const myHand     = getMyHand(game, currentUser.uid)
  const opponents  = getOpponentCounts(game, currentUser.uid)
  const myTurn     = isMyTurn(game, currentUser.uid)
  const needsColor = needsColorPick(game, currentUser.uid)
  const topCard    = game.discardPile?.[game.discardPile.length-1]
  const prevCard   = game.discardPile?.length>1 ? game.discardPile[game.discardPile.length-2] : null
  const curColor   = game.currentColor
  const curName    = game.players[game.order[game.currentIdx]]?.displayName
  const prevIdx    = ((game.currentIdx-game.direction+game.order.length)%game.order.length)
  const canChallenge = myTurn && game.lastCard?.value==='wilddraw4' && game.order[prevIdx]!==currentUser.uid && game.pendingDraw>=4
  const jumpInCards  = game.houseRules?.jumpIn&&!myTurn ? myHand.filter(c=>c.color===topCard?.color&&c.value===topCard?.value) : []
  const ambientGlow  = curColor ? CC[curColor]?.glow : topCard ? CC[topCard.color]?.glow : 'rgba(100,80,200,0.15)'

  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',background:'#050c07',isolation:'isolate' }}>
      <style>{UNO_STYLES}</style>
      <UnoBg />

      {/* Content layer sits above the atmospheric background */}
      <div style={{ position:'relative',zIndex:1,flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>

      {/* Active colour band */}
      <ColorBand color={curColor} />

      {error && (
        <div className="uno-fadein" style={{ position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:200,background:'rgba(192,57,43,0.96)',padding:'8px 22px',borderRadius:10,fontFamily:'Oswald',fontSize:'0.82rem',color:'#fff',letterSpacing:'0.06em',whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(192,57,43,0.5)' }}>{error}</div>
      )}

      {needsColor && <ColorPicker onPick={handleColorPick} />}

      {sevenTarget==='PICK' && (
        <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.88)',zIndex:100,backdropFilter:'blur(5px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:20 }}>
          <div style={{ fontFamily:'Oswald',fontSize:'1.2rem',color:'#fff',letterSpacing:'0.15em' }}>SWAP HANDS WITH</div>
          <div style={{ display:'flex',gap:14,flexWrap:'wrap',justifyContent:'center' }}>
            {opponents.map(op=>(
              <button key={op.uid} onClick={()=>handleSevenSwap(op.uid)} style={{ padding:'12px 22px',borderRadius:12,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.15)',color:'#fff',fontFamily:'Oswald',fontSize:'0.85rem',cursor:'pointer' }}>
                {op.displayName} <span style={{ color:'var(--text-dim)',fontSize:'0.72rem' }}>({op.count})</span>
              </button>
            ))}
          </div>
          <button onClick={()=>setSevenTarget(null)} style={{ fontSize:'0.72rem',color:'var(--text-dim)',background:'none',border:'none',cursor:'pointer' }}>Cancel</button>
        </div>
      )}

      {/* Top bar */}
      <div style={{ flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 16px',background:'rgba(8,4,18,0.97)',borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ fontFamily:'Oswald',fontWeight:800,fontSize:'1.3rem',letterSpacing:'0.22em',background:WILD_BG,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>UNO</div>
          <DirectionIndicator direction={game.direction} />
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          {curColor&&<div style={{ width:12,height:12,borderRadius:'50%',background:CC[curColor]?.bg,boxShadow:`0 0 8px ${CC[curColor]?.glow}`,flexShrink:0 }} />}
          <span style={{ fontFamily:'Oswald',fontSize:'0.68rem',color:myTurn?'gold':'var(--text-dim)',letterSpacing:'0.08em' }}>
            {myTurn?'⚡ YOUR TURN':`${curName}'s turn`}
          </span>
          {game.pendingDraw>0&&<span style={{ fontFamily:'Oswald',fontSize:'0.62rem',color:'#ff6b6b',background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.3)',borderRadius:5,padding:'2px 7px' }}>+{game.pendingDraw}</span>}
          <button onClick={()=>setShowLog(l=>!l)} style={{ background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,padding:'4px 8px',color:'var(--text-dim)',fontSize:'0.62rem',cursor:'pointer',fontFamily:'Oswald',letterSpacing:'0.06em' }}>{showLog?'BOARD':'LOG'}</button>
          <button onClick={handleClose} style={{ width:28,height:28,borderRadius:6,background:'rgba(233,30,99,0.1)',border:'1px solid rgba(233,30,99,0.25)',color:'var(--pink)',cursor:'pointer',fontSize:'0.8rem',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        </div>
      </div>

      {showLog ? (
        <div style={{ flex:1,overflowY:'auto',padding:14,display:'flex',flexDirection:'column',gap:3 }}>
          {[...game.log].reverse().map((entry,i)=>(
            <div key={i} style={{ fontFamily:'monospace',fontSize:'0.7rem',color:i===0?'#fff':'var(--text-dim)',padding:'3px 8px',borderRadius:5,background:i===0?'rgba(255,255,255,0.04)':'transparent' }}>{entry}</div>
          ))}
        </div>
      ) : (
        <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>

          {/* Opponents */}
          <div style={{ flexShrink:0,display:'flex',gap:8,padding:'10px 14px',overflowX:'auto',borderBottom:'1px solid rgba(255,255,255,0.04)',scrollbarWidth:'none',background:'rgba(0,0,0,0.28)' }}>
            {opponents.map(op=>(
              <OpponentSeat key={op.uid} opponent={op} isCurrent={game.order[game.currentIdx]===op.uid} unoEligible={!!game.unoPenaltyEligible?.[op.uid]} onCatchUno={handleCatchUno} />
            ))}
          </div>

          {/* Centre table */}
          <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:28,padding:'14px 20px',position:'relative',background:'radial-gradient(ellipse at center,rgba(20,10,40,0.9) 0%,transparent 70%)' }}>
            {/* Ambient glow */}
            <div style={{ position:'absolute',width:200,height:120,borderRadius:'50%',background:ambientGlow,filter:'blur(44px)',pointerEvents:'none',opacity:0.6 }} />
            {/* Subtle felt ring */}
            <div style={{ position:'absolute',width:260,height:160,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.04)',boxShadow:'inset 0 0 40px rgba(0,0,0,0.5)',pointerEvents:'none' }} />

            <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8,zIndex:1 }}>
              <DrawPileStack count={game.drawPile?.length||0} enabled={myTurn&&!game.wildPickerUid} onClick={handleDraw} />
              <span style={{ fontFamily:'Oswald',fontSize:'0.58rem',color:'var(--text-dim)',letterSpacing:'0.1em' }}>DRAW</span>
            </div>

            <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8,zIndex:1 }}>
              <DiscardPileArea topCard={topCard} prevCard={prevCard} currentColor={curColor} />
              <span style={{ fontFamily:'Oswald',fontSize:'0.58rem',color:'var(--text-dim)',letterSpacing:'0.1em' }}>DISCARD</span>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:8,alignItems:'center',zIndex:1 }}>
              {myHand.length===1&&(
                <button onClick={handleUno} className={!game.unoCalledBy?.[currentUser.uid]?'uno-blink':''} style={{ padding:'9px 20px',borderRadius:10,background:game.unoCalledBy?.[currentUser.uid]?'rgba(0,255,136,0.12)':'linear-gradient(135deg,#C0392B,#D4AC0D)',border:game.unoCalledBy?.[currentUser.uid]?'1px solid rgba(0,255,136,0.3)':'none',color:'#fff',fontFamily:'Oswald',fontSize:'0.88rem',fontWeight:700,letterSpacing:'0.16em',cursor:'pointer',boxShadow:game.unoCalledBy?.[currentUser.uid]?'none':'0 0 20px rgba(192,57,43,0.55)' }}>
                  {game.unoCalledBy?.[currentUser.uid]?'✅ UNO!':'🔔 UNO!'}
                </button>
              )}
              {myTurn&&game.drawnCardId!=null&&<button onClick={handlePass} style={{ padding:'7px 16px',borderRadius:8,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text-dim)',fontFamily:'Oswald',fontSize:'0.72rem',cursor:'pointer',letterSpacing:'0.1em' }}>PASS</button>}
              {canChallenge&&<button onClick={handleChallenge} style={{ padding:'7px 14px',borderRadius:8,background:'rgba(192,57,43,0.14)',border:'1px solid rgba(192,57,43,0.38)',color:'#ff6b6b',fontFamily:'Oswald',fontSize:'0.7rem',cursor:'pointer',letterSpacing:'0.08em' }}>⚡ CHALLENGE +4</button>}
            </div>
          </div>

          {/* My hand */}
          <div style={{ flexShrink:0,borderTop:'1px solid rgba(255,255,255,0.06)',paddingInline:12,paddingBottom:8,background:'rgba(6,4,16,0.96)' }}>
            <HandFan cards={myHand} selectedId={selectedCardId} drawnId={game.drawnCardId} onCardClick={handlePlayCard} cardIsPlayable={cardIsPlayable} />
            {jumpInCards.length>0&&(
              <div style={{ display:'flex',gap:6,justifyContent:'center',alignItems:'center',marginBottom:6 }}>
                <span style={{ fontFamily:'Oswald',fontSize:'0.58rem',color:'gold',letterSpacing:'0.1em' }}>JUMP IN:</span>
                {jumpInCards.map(card=><CardFace key={card.id} card={card} small playable onClick={()=>handleJumpIn(card.id)} />)}
              </div>
            )}
            <div style={{ textAlign:'center',fontFamily:'Oswald',fontSize:'0.62rem',color:'var(--text-dim)',letterSpacing:'0.1em',paddingBottom:2 }}>
              YOUR HAND ({myHand.length}){!myTurn&&<span style={{ marginLeft:8,opacity:0.38 }}>• Wait for your turn</span>}
            </div>
          </div>

        </div>
      )}
      </div>
    </div>
  )
}
