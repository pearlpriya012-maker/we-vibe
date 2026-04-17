import React, { useRef, useEffect, useState } from 'react';

// Basic drag/resize logic
function useDraggableResizable(defaultW, defaultH) {
  const [pos, setPos] = useState({ x: 60, y: 60 });
  const [size, setSize] = useState({ w: defaultW, h: defaultH });
  const dragRef = useRef();
  const resizing = useRef(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onMove(e) {
      if (dragging.current) {
        const dx = (e.touches ? e.touches[0].clientX : e.clientX) - last.current.x;
        const dy = (e.touches ? e.touches[0].clientY : e.clientY) - last.current.y;
        setPos(p => ({ x: Math.max(0, p.x + dx), y: Math.max(0, p.y + dy) }));
        last.current = { x: (e.touches ? e.touches[0].clientX : e.clientX), y: (e.touches ? e.touches[0].clientY : e.clientY) };
      } else if (resizing.current) {
        const dx = (e.touches ? e.touches[0].clientX : e.clientX) - last.current.x;
        const dy = (e.touches ? e.touches[0].clientY : e.clientY) - last.current.y;
        setSize(s => ({ w: Math.max(120, s.w + dx), h: Math.max(60, s.h + dy) }));
        last.current = { x: (e.touches ? e.touches[0].clientX : e.clientX), y: (e.touches ? e.touches[0].clientY : e.clientY) };
      }
    }
    function onUp() { dragging.current = false; resizing.current = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);
  const bindDrag = {
    onMouseDown: e => { dragging.current = true; last.current = { x: e.clientX, y: e.clientY }; },
    onTouchStart: e => { dragging.current = true; last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  };
  const bindResize = {
    onMouseDown: e => { resizing.current = true; last.current = { x: e.clientX, y: e.clientY }; e.stopPropagation(); },
    onTouchStart: e => { resizing.current = true; last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; e.stopPropagation(); }
  };
  return { pos, size, dragRef, bindDrag, bindResize };
}

export default function MiniPlayerOverlay({ visible, onClose, renderContent, defaultW = 400, defaultH = 88 }) {
  const { pos, size, dragRef, bindDrag, bindResize } = useDraggableResizable(defaultW, defaultH);
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed',
      left: pos.x, top: pos.y,
      width: size.w, height: size.h,
      zIndex: 9999,
      background: 'rgba(18,18,24,0.98)',
      borderRadius: 12,
      boxShadow: '0 4px 24px 0 rgba(0,0,0,0.28)',
      border: '1.5px solid #222',
      overflow: 'hidden',
      userSelect: 'none',
      transition: 'box-shadow 0.2s',
      display: 'flex', flexDirection: 'column',
    }}>
      <div {...bindDrag} ref={dragRef} style={{ cursor: 'move', height: 28, background: 'rgba(30,30,40,0.92)', display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: 600, fontSize: 14, color: '#fff', borderBottom: '1px solid #222' }}>
        Mini Player
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>&times;</button>
      </div>
      <div style={{ flex: 1, position: 'relative', background: 'transparent', width: '100%', height: size.h - 28 }}>
        {renderContent && renderContent(size.w, size.h - 28)}
      </div>
      <div {...bindResize} style={{ position: 'absolute', right: 2, bottom: 2, width: 18, height: 18, cursor: 'nwse-resize', zIndex: 10 }}>
        <svg width="18" height="18"><polyline points="3,15 15,15 15,3" fill="none" stroke="#888" strokeWidth="2"/></svg>
      </div>
    </div>
  );
}
