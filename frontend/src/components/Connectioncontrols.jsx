import { useState, useMemo } from 'react';

const connectionTypes = {
  samples: { label: 'Samples', color: '#E8724A', icon: '⟲', description: 'Songs that sample each other' },
  shared_musician: { label: 'Shared Musicians', color: '#6BCB77', icon: '♫', description: 'Same musician on different songs' },
  same_producer: { label: 'Same Producer', color: '#B84AE8', icon: '◉', description: 'Produced by the same person' },
  same_songwriter: { label: 'Same Songwriter', color: '#D44AE8', icon: '✎', description: 'Written by the same songwriter' },
  same_label: { label: 'Same Label', color: '#8B9FE8', icon: '◎', description: 'Released on the same label' },
  same_studio: { label: 'Same Studio', color: '#9B72CF', icon: '⌂', description: 'Recorded at the same studio' },
  shared_instruments: { label: 'Shared Instruments', color: '#4AE8D4', icon: '◈', description: 'Share rare instruments' },
  harmonic_bridge: { label: 'Harmonic Bridge', color: '#E8C94A', icon: '♪', description: 'Same key & BPM across genres' },
  same_key_bpm: { label: 'Harmonic Match', color: '#E8C94A', icon: '♪', description: 'Same key & similar BPM' },
};

const ConnectionControls = ({ links, activeTypes, onToggleType }) => {
  const [expanded, setExpanded] = useState(false);

  // Count links by type
  const typeCounts = useMemo(() => {
    const counts = {};
    (links || []).forEach(link => {
      const type = link.type;
      if (type) counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [links]);

  // Only show types that exist in the data
  const availableTypes = Object.entries(connectionTypes).filter(
    ([key]) => typeCounts[key] > 0
  );

  if (availableTypes.length === 0) return null;

  const activeCount = activeTypes.size;

  return (
    <div className="fixed bottom-5 left-5 z-30">
      {/* Expanded panel */}
      {expanded && (
        <div 
          className="mb-3 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 w-[240px] shadow-2xl"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] uppercase tracking-wider text-white/40 font-medium">
              Connections
            </span>
            {activeCount > 0 && (
              <button
                onClick={() => onToggleType('clear_all')}
                className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-1">
            {availableTypes.map(([type, config]) => {
              const isActive = activeTypes.has(type);
              const count = typeCounts[type];

              return (
                <button
                  key={type}
                  onClick={() => onToggleType(type)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left"
                  style={{
                    backgroundColor: isActive ? `${config.color}15` : 'transparent',
                    border: isActive ? `1px solid ${config.color}30` : '1px solid transparent',
                  }}
                >
                  {/* Toggle indicator */}
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: isActive ? config.color : 'transparent',
                      border: `2px solid ${isActive ? config.color : 'rgba(255,255,255,0.15)'}`,
                    }}
                  />
                  
                  {/* Label */}
                  <span 
                    className="text-xs flex-1 transition-colors"
                    style={{ color: isActive ? config.color : 'rgba(255,255,255,0.4)' }}
                  >
                    {config.label}
                  </span>

                  {/* Count */}
                  <span 
                    className="text-[10px] flex-shrink-0 transition-colors"
                    style={{ color: isActive ? `${config.color}99` : 'rgba(255,255,255,0.2)' }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-md transition-all hover:scale-105"
        style={{
          backgroundColor: activeCount > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: activeCount > 0 ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Connection icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
          <circle cx="6" cy="6" r="3"/>
          <circle cx="18" cy="18" r="3"/>
          <line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>
        </svg>

        <span className="text-xs text-white/50">
          {activeCount > 0 ? `${activeCount} active` : 'Connections'}
        </span>

        {/* Active type color dots */}
        {activeCount > 0 && (
          <div className="flex gap-1">
            {[...activeTypes].map(type => (
              <div
                key={type}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: connectionTypes[type]?.color || '#888' }}
              />
            ))}
          </div>
        )}
      </button>
    </div>
  );
};

export default ConnectionControls;