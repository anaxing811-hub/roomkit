/**
 * Bird's-eye blueprint canvas.
 *
 * Geometry is stored in percentages of the plan, so a layout arranged on the
 * laptop reads identically on a phone — there is no pixel geometry to go wrong
 * when the viewport changes.
 *
 * Three interactions share the SVG surface, distinguished by what you grab:
 *   - the block body      -> drag to reposition (a press that never moves is a
 *                            select; a double-click opens its contents)
 *   - the rotation handle -> orbit the block through a full 360°
 *   - the door handle     -> slide the panels along the front edge
 *
 * Pointer capture is wrapped in try/catch throughout: the browser throws if it
 * no longer considers a pointer active, and an uncaught throw would either
 * abort a gesture before it starts or leave one welded to the cursor.
 */
import { useCallback, useRef } from 'react'

import { DOOR_TYPES, LIGHT_TYPES } from '@/lib/constants'
import { cn } from '@/lib/utils'

const FLOOR = 'var(--pastel-room-floor)'
const BODY = 'var(--pastel-furniture)'
const LINE = 'var(--pastel-furniture-line)'
const INNER = 'var(--pastel-furniture-inner)'

const W = 1000
const H = 700

/** Top-down interior detail — enough to read each shape at a glance. */
function Interior({ type, w, h }) {
  const pad = 6
  const stroke = { fill: 'none', stroke: LINE, strokeWidth: 2, opacity: 0.7 }

  switch (type) {
    case 'bed':
      return (
        <>
          <rect x={pad} y={pad} width={w - pad * 2} height={Math.min(30, h * 0.24)} rx={6} fill={INNER} stroke={LINE} strokeWidth={2} />
          <line x1={w / 2} y1={pad + Math.min(30, h * 0.24)} x2={w / 2} y2={h - pad} {...stroke} />
        </>
      )
    case 'desk':
      return (
        <>
          <rect x={w - Math.min(70, w * 0.3)} y={pad} width={Math.min(60, w * 0.26)} height={Math.max(4, h - pad * 2)} rx={4} fill={INNER} stroke={LINE} strokeWidth={2} />
          <line x1={pad} y1={h * 0.5} x2={Math.max(pad, w - Math.min(80, w * 0.34))} y2={h * 0.5} {...stroke} />
        </>
      )
    case 'drawer':
      return (
        <>
          {[0.33, 0.66].map((f) => (
            <line key={f} x1={pad} y1={h * f} x2={w - pad} y2={h * f} {...stroke} />
          ))}
          <rect x={w / 2 - 10} y={h * 0.14} width={20} height={4} rx={2} fill={LINE} />
        </>
      )
    case 'shelf':
      return [0.33, 0.66].map((f) => (
        <line key={f} x1={w * f} y1={pad} x2={w * f} y2={h - pad} {...stroke} />
      ))
    case 'rug':
      return <rect x={pad * 2} y={pad * 2} width={Math.max(2, w - pad * 4)} height={Math.max(2, h - pad * 4)} rx={8} {...stroke} strokeDasharray="8 6" />
    case 'storage_bin':
    case 'nightstand':
      return <ellipse cx={w / 2} cy={h / 2} rx={Math.max(3, w / 2 - pad)} ry={Math.max(3, h / 2 - pad)} {...stroke} />
    case 'lamp':
      return (
        <>
          <circle cx={w / 2} cy={h / 2} r={Math.max(3, Math.min(w, h) / 2 - pad)} fill={INNER} stroke={LINE} strokeWidth={2} />
          <circle cx={w / 2} cy={h / 2} r={Math.max(1.5, Math.min(w, h) / 6)} fill={LINE} opacity={0.5} />
        </>
      )
    default:
      return null
  }
}

/** Two panels that slide along the front edge; `offset` is 0–100. */
function DoorPanels({ w, h, offset }) {
  const railY = h - 5
  const panelW = w * 0.42
  const travel = w - panelW * 2
  const shift = (offset / 100) * travel

  return (
    <g>
      <line x1={2} y1={railY} x2={w - 2} y2={railY} stroke={LINE} strokeWidth={2} opacity={0.5} />
      <rect x={shift} y={railY - 5} width={panelW} height={10} rx={3} fill={INNER} stroke={LINE} strokeWidth={2} />
      <rect x={shift + panelW} y={railY - 5} width={panelW} height={10} rx={3} fill={BODY} stroke={LINE} strokeWidth={2} />
    </g>
  )
}

export function FloorPlan({
  furniture,
  counts,
  selectedId,
  lighting,
  onSelect,
  onOpen,
  onMove,
  className,
}) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)

  const pct = useCallback((event) => {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    }
  }, [])

  const capture = (event) => {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      /* best effort — the stage-level move handler still tracks it */
    }
  }

  const startMove = (event, piece) => {
    event.stopPropagation()
    capture(event)
    const p = pct(event)
    dragRef.current = { mode: 'move', id: piece.id, dx: p.x - piece.x, dy: p.y - piece.y, moved: false }
    onSelect(piece.id)
  }

  const startRotate = (event, piece) => {
    event.stopPropagation()
    capture(event)
    dragRef.current = {
      mode: 'rotate',
      id: piece.id,
      cx: piece.x + piece.w / 2,
      cy: piece.y + piece.h / 2,
      moved: true,
    }
  }

  const startDoor = (event, piece) => {
    event.stopPropagation()
    capture(event)
    dragRef.current = { mode: 'door', id: piece.id, x0: piece.x, w: piece.w, moved: true }
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const p = pct(event)
    drag.moved = true

    if (drag.mode === 'move') {
      onMove(drag.id, { x: p.x - drag.dx, y: p.y - drag.dy })
    } else if (drag.mode === 'rotate') {
      // Aspect correction: the plan is wider than it is tall, so raw percentage
      // deltas would skew the angle. Convert to plan units before atan2.
      const dx = (p.x - drag.cx) * W
      const dy = (p.y - drag.cy) * H
      onMove(drag.id, { rotation: (Math.atan2(dy, dx) * 180) / Math.PI + 90 })
    } else if (drag.mode === 'door') {
      onMove(drag.id, { doorOffset: ((p.x - drag.x0) / drag.w) * 100 })
    }
  }

  const endDrag = (event) => {
    const drag = dragRef.current
    if (!drag) return
    // Clear state FIRST: releasePointerCapture throws for an inactive pointer,
    // and a throw before the reset would weld the block to the cursor.
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      /* pointer already gone */
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={() => onSelect(null)}
      role="group"
      aria-label="Top-down room blueprint"
      className={cn('h-full w-full touch-none select-none', className)}
    >
      <defs>
        {/* Warm sunlight falling from the window, and the pooled glow a lamp
            throws after dark. Both are alpha-blended over the floor. */}
        <linearGradient id="rk-sun" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe9b0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="rk-lamp">
          <stop offset="0%" stopColor="#ffd98a" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#ffc76b" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ffbe57" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* floor + walls */}
      <rect x={0} y={0} width={W} height={H} fill={FLOOR} />
      <rect x={6} y={6} width={W - 12} height={H - 12} fill="none" stroke={LINE} strokeWidth={10} opacity={0.55} />

      {/* grid */}
      <g opacity={0.32}>
        {Array.from({ length: 19 }, (_, i) => (
          <line key={`v${i}`} x1={(W / 20) * (i + 1)} y1={8} x2={(W / 20) * (i + 1)} y2={H - 8} stroke={LINE} strokeWidth={0.6} />
        ))}
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`h${i}`} x1={8} y1={(H / 14) * (i + 1)} x2={W - 8} y2={(H / 14) * (i + 1)} stroke={LINE} strokeWidth={0.6} />
        ))}
      </g>

      {/* ── The window, and the light it throws ── */}
      <g>
        <rect
          x={W * 0.34}
          y={2}
          width={W * 0.32}
          height={14}
          rx={3}
          fill={lighting.daylight > 0.15 ? '#cfe9ff' : '#1d2733'}
          stroke={LINE}
          strokeWidth={3}
        />
        <line x1={W * 0.5} y1={2} x2={W * 0.5} y2={16} stroke={LINE} strokeWidth={2} />
      </g>

      {/* Daytime rays: two diagonal shafts from the window across the floor. */}
      {lighting.daylight > 0.02 && (
        <g
          style={{ opacity: lighting.daylight * 0.9 }}
          className="pointer-events-none transition-opacity duration-1000"
        >
          <polygon points={`${W * 0.36},16 ${W * 0.48},16 ${W * 0.86},${H} ${W * 0.52},${H}`} fill="url(#rk-sun)" />
          <polygon points={`${W * 0.52},16 ${W * 0.64},16 ${W * 0.3},${H} ${W * 0.05},${H}`} fill="url(#rk-sun)" opacity={0.65} />
        </g>
      )}

      {/* ── Furniture ── */}
      {furniture.map((piece) => {
        const x = (piece.x / 100) * W
        const y = (piece.y / 100) * H
        const w = (piece.w / 100) * W
        const h = (piece.h / 100) * H
        const cx = x + w / 2
        const cy = y + h / 2
        const count = counts[piece.location] ?? 0
        const isSelected = piece.id === selectedId
        const showLabel = w > 86 && h > 40
        const hasDoors = DOOR_TYPES.includes(piece.type)

        return (
          <g key={piece.id} transform={`rotate(${piece.rotation ?? 0} ${cx} ${cy})`}>
            <g
              role="button"
              tabIndex={0}
              aria-label={`${piece.label}: ${count} items. Drag to move, double-click to open.`}
              onPointerDown={(e) => startMove(e, piece)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onOpen(piece.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(piece.id)
                }
              }}
              className="cursor-grab outline-none active:cursor-grabbing"
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={8}
                fill={BODY}
                stroke={isSelected ? 'var(--primary)' : LINE}
                strokeWidth={isSelected ? 5 : 3}
              />
              <g transform={`translate(${x} ${y})`}>
                <Interior type={piece.type} w={w} h={h} />
                {hasDoors && <DoorPanels w={w} h={h} offset={piece.doorOffset ?? 50} />}
              </g>

              {showLabel && (
                <text
                  x={cx}
                  y={cy + 5}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={600}
                  fill="var(--pastel-furniture-line)"
                  className="pointer-events-none"
                >
                  {piece.label}
                </text>
              )}

              <g className="pointer-events-none">
                <circle cx={x + w - 14} cy={y + 14} r={15} fill="var(--pastel-dot)" stroke={LINE} strokeWidth={1.5} />
                <text x={x + w - 14} y={y + 19} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--pastel-dot-text)">
                  {count}
                </text>
              </g>
            </g>

            {/* ── Sliding door handle ── */}
            {hasDoors && isSelected && (
              <circle
                role="slider"
                aria-label={`${piece.label} door position`}
                aria-valuenow={Math.round(piece.doorOffset ?? 50)}
                onPointerDown={(e) => startDoor(e, piece)}
                cx={x + ((piece.doorOffset ?? 50) / 100) * (w - w * 0.84) + w * 0.42}
                cy={y + h - 5}
                r={9}
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth={3}
                className="cursor-ew-resize"
              />
            )}

            {/* ── Rotation handle, on a stalk above the block ── */}
            {isSelected && (
              <g className="cursor-grab" onPointerDown={(e) => startRotate(e, piece)}>
                <line x1={cx} y1={y} x2={cx} y2={y - 26} stroke="var(--primary)" strokeWidth={3} />
                <circle
                  role="slider"
                  aria-label={`${piece.label} rotation`}
                  aria-valuenow={Math.round(piece.rotation ?? 0)}
                  cx={cx}
                  cy={y - 32}
                  r={10}
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth={3}
                />
              </g>
            )}
          </g>
        )
      })}

      {/* ── Night: dim the room, then pool light under every lamp ── */}
      {lighting.daylight < 0.9 && (
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="#0b1622"
          opacity={(1 - lighting.daylight) * 0.5}
          className="pointer-events-none transition-opacity duration-1000"
        />
      )}

      {lighting.lampsOn &&
        furniture
          .filter((p) => LIGHT_TYPES.includes(p.type))
          .map((p) => {
            const cx = ((p.x + p.w / 2) / 100) * W
            const cy = ((p.y + p.h / 2) / 100) * H
            return (
              <circle
                key={`glow-${p.id}`}
                cx={cx}
                cy={cy}
                r={Math.max(90, (p.w / 100) * W * 3)}
                fill="url(#rk-lamp)"
                className="pointer-events-none transition-opacity duration-1000"
              />
            )
          })}
    </svg>
  )
}
