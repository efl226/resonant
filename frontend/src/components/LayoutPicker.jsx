const LAYOUTS = [
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced AI embedding — overall sonic + lyrical similarity (2D only)',
    icon: '◎',
    color: 'rgba(200,200,200,0.8)',
    only2d: true,
  },
  {
    id: 'sonic',
    label: 'Sonic',
    description: 'BPM, energy, key, mode, vocal type, rhythm — pure sound',
    icon: '♩',
    color: '#4AE8D4',
  },
  {
    id: 'vibe',
    label: 'Vibe',
    description: 'Mood + themes — emotional and lyrical proximity',
    icon: '♥',
    color: '#E84A6A',
  },
  {
    id: 'decade',
    label: 'Decade',
    description: 'Era-based grouping — decade and year of release',
    icon: '◷',
    color: '#E8C94A',
  },
  {
    id: 'dna',
    label: 'DNA',
    description: 'Producer, label, studio, songwriter — production lineage',
    icon: '◉',
    color: '#B84AE8',
  },
];

// Degrees where 0 = 12 o'clock, positive = clockwise
const SWEEP = 230;
const MIN_ANGLE = -SWEEP / 2;

function angleForIndex(i, total) {
  if (total <= 1) return 0;
  return MIN_ANGLE + (i / (total - 1)) * SWEEP;
}

const KNOB = 38;   // outer container size
const BODY = 24;   // inner knob disc diameter
const TICK_R = 17; // tick radius from center

export default function LayoutPicker({ activeLayout, onChangeLayout, hasLayouts, hasLayouts3d, graphMode, showContainer = true }) {
  const show2d = graphMode !== '3d' && hasLayouts;
  const show3d = graphMode === '3d' && hasLayouts3d;
  if (!show2d && !show3d) return null;

  const visibleLayouts = LAYOUTS.filter(l => graphMode === '3d' ? !l.only2d : true);
  const rawIndex = visibleLayouts.findIndex(l => l.id === activeLayout);
  const currentIndex = rawIndex < 0 ? 0 : rawIndex;
  const currentLayout = visibleLayouts[currentIndex];
  const currentAngle = angleForIndex(currentIndex, visibleLayouts.length);

  const advance = (delta = 1) => {
    const next = (currentIndex + delta + visibleLayouts.length) % visibleLayouts.length;
    onChangeLayout(visibleLayouts[next].id);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    advance(e.deltaY > 0 ? 1 : -1);
  };

  const cx = KNOB / 2;

  const knob = (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 3, padding: '3px 8px', flexShrink: 0, userSelect: 'none',
      }}
      title={`Layout: ${currentLayout?.label} — click or scroll`}
    >
      {/* Knob assembly */}
      <div
        onClick={() => advance(1)}
        onWheel={handleWheel}
        style={{ position: 'relative', width: KNOB, height: KNOB, cursor: 'pointer' }}
      >
        {/* Tick marks — one per layout, clickable */}
        {visibleLayouts.map((layout, i) => {
          const angle = angleForIndex(i, visibleLayouts.length);
          const rad = angle * Math.PI / 180;
          const tx = cx + TICK_R * Math.sin(rad);
          const ty = cx - TICK_R * Math.cos(rad);
          const isActive = i === currentIndex;
          return (
            <div
              key={layout.id}
              onClick={e => { e.stopPropagation(); onChangeLayout(layout.id); }}
              title={layout.label}
              style={{
                position: 'absolute',
                left: tx, top: ty,
                transform: 'translate(-50%, -50%)',
                width: isActive ? 5 : 3,
                height: isActive ? 5 : 3,
                borderRadius: '50%',
                backgroundColor: isActive ? layout.color : 'rgba(255,255,255,0.18)',
                boxShadow: isActive ? `0 0 6px ${layout.color}, 0 0 3px ${layout.color}` : 'none',
                transition: 'all 0.2s',
                zIndex: 2,
                cursor: 'pointer',
              }}
            />
          );
        })}

        {/* Knob disc */}
        <div style={{
          position: 'absolute',
          top: cx - BODY / 2, left: cx - BODY / 2,
          width: BODY, height: BODY,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 38% 30%, #2e2e2e, #0a0a0a)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: [
            '0 3px 10px rgba(0,0,0,0.9)',
            '0 1px 0 rgba(255,255,255,0.07)',
            'inset 0 1px 2px rgba(255,255,255,0.05)',
            'inset 0 -1px 2px rgba(0,0,0,0.6)',
          ].join(', '),
        }}>
          {/* Indicator line */}
          <div style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: 2, height: '36%',
            background: 'linear-gradient(to top, transparent, rgba(255,255,255,0.85))',
            borderRadius: '1px 1px 0 0',
            transformOrigin: '50% 100%',
            transform: `translate(-50%, -100%) rotate(${currentAngle}deg)`,
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          }} />
          {/* Center pivot dot */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 4, height: 4, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.06)',
          }} />
        </div>
      </div>

      {/* Current layout label */}
      <div style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 8, fontWeight: 600,
        color: currentLayout?.color || 'rgba(255,255,255,0.35)',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        transition: 'color 0.2s',
        whiteSpace: 'nowrap',
      }}>
        {currentLayout?.label}
      </div>
    </div>
  );

  if (!showContainer) return knob;

  return (
    <div style={{
      backgroundColor: 'rgba(8,8,8,0.85)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {knob}
    </div>
  );
}
