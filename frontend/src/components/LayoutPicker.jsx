const LAYOUTS = [
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced AI embedding — overall sonic + lyrical similarity (2D only)',
    icon: '◎',
    color: 'rgba(255,255,255,0.5)',
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
    id: 'genetics',
    label: 'Era & DNA',
    description: 'Producer, label, studio, decade — shared production lineage',
    icon: '◉',
    color: '#B84AE8',
  },
];

export default function LayoutPicker({ activeLayout, onChangeLayout, hasLayouts, hasLayouts3d, graphMode }) {
  const show2d = graphMode !== '3d' && hasLayouts;
  const show3d = graphMode === '3d' && hasLayouts3d;
  if (!show2d && !show3d) return null;

  const visibleLayouts = LAYOUTS.filter(l => graphMode === '3d' ? !l.only2d : true);

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded-xl"
      style={{
        backgroundColor: 'rgba(8,8,8,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold px-1 mr-0.5">
        Layout
      </span>
      {visibleLayouts.map(layout => {
        const isActive = activeLayout === layout.id;
        return (
          <button
            key={layout.id}
            onClick={() => onChangeLayout(layout.id)}
            title={layout.description}
            className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-[10px] font-medium"
            style={{
              backgroundColor: isActive ? `${layout.color}18` : 'transparent',
              border: isActive ? `1px solid ${layout.color}35` : '1px solid transparent',
              color: isActive ? layout.color : 'rgba(255,255,255,0.3)',
            }}
          >
            <span className="text-[11px] leading-none">{layout.icon}</span>
            {layout.label}
          </button>
        );
      })}
    </div>
  );
}
