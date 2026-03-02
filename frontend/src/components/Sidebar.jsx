import React from 'react';

// Helper: convert hex to RGB string for use in rgba()
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result 
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255';
};

const Sidebar = ({ node, links, onClose }) => {
  if (!node) return null;

  // Extract color system from the song's visual DNA
  const accent = node.visual_dna?.primary_color || '#ffffff';
  const accentRgb = hexToRgb(accent);
  const palette = node.visual_dna?.palette || [];

  const nodeLinks = (links || []).filter(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    return sourceId === node.id || targetId === node.id;
  });

  return (
    <div 
      className="fixed top-0 right-0 w-[400px] h-full bg-neutral-950/95 text-white z-50 overflow-y-auto backdrop-blur-2xl transition-transform duration-300"
      style={{
        borderLeft: `1px solid rgba(${accentRgb}, 0.2)`,
        boxShadow: `-20px 0 60px rgba(${accentRgb}, 0.08), -5px 0 30px rgba(0,0,0,0.8)`,
      }}
    >
      
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 text-2xl z-10 hover:opacity-100 transition-opacity"
        style={{ color: `rgba(${accentRgb}, 0.5)` }}
      >
        ×
      </button>

      {/* HERO — full-bleed image with colored gradient fade */}
      <div className="relative">
        <img src={node.img} alt="cover" className="w-full" />
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, 
              transparent 30%, 
              rgba(${accentRgb}, 0.15) 60%, 
              rgb(10, 10, 10) 100%
            )`,
          }}
        />
      </div>

      <div className="px-8 pb-8 -mt-12 relative z-10">

        {/* HEADER */}
        <h1 className="text-4xl font-bold tracking-tight mb-1">{node.name}</h1>
        <h2 className="text-xl mb-1" style={{ color: `rgba(${accentRgb}, 0.7)` }}>{node.artist}</h2>
        <h3 className="text-sm text-white/25 mb-8">
          {node.album && <span className="italic">{node.album}</span>}
          {node.album && node.year && <span> • </span>}
          {node.year}
        </h3>

        <div className="space-y-8">

          {/* VISUAL DNA — palette bar */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/20 font-bold mb-3">Visual Palette</h3>
            <div className="flex h-3 rounded-full overflow-hidden w-full">
              {palette.map((color, i) => (
                <div key={i} style={{ backgroundColor: color }} className="flex-1" title={color} />
              ))}
            </div>
          </section>
          
          {/* NEURAL CONNECTIONS */}
          <section>
            <h3 
              className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3"
              style={{ color: `rgba(${accentRgb}, 0.4)` }}
            >
              Neural Connections
            </h3>
            <div className="flex flex-col gap-3">
              {nodeLinks.map((link, i) => {
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                const isSource = sourceId === node.id;
                const otherNode = isSource ? link.target : link.source;
                const otherName = typeof otherNode === 'object' ? otherNode.name : `Song ${otherNode}`;
                const otherArtist = typeof otherNode === 'object' ? otherNode.artist : '';

                return (
                  <div 
                    key={i} 
                    className="p-4 rounded-lg transition-all duration-200 cursor-default"
                    style={{
                      backgroundColor: `rgba(${accentRgb}, 0.05)`,
                      border: `1px solid rgba(${accentRgb}, 0.1)`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `rgba(${accentRgb}, 0.12)`;
                      e.currentTarget.style.borderColor = `rgba(${accentRgb}, 0.25)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `rgba(${accentRgb}, 0.05)`;
                      e.currentTarget.style.borderColor = `rgba(${accentRgb}, 0.1)`;
                    }}
                  >
                    <div className="mb-2">
                      <span className="text-sm font-bold text-white/90">{otherName}</span>
                      {otherArtist && <span className="text-xs text-white/40 ml-2">{otherArtist}</span>}
                    </div>
                    <p className="text-xs text-white/50 italic leading-relaxed">
                      "{link.reason}"
                    </p>
                  </div>
                );
              })}
              {nodeLinks.length === 0 && (
                <div className="text-white/30 text-xs italic">No active connections in this network subset.</div>
              )}
            </div>
          </section>
          
          {/* SONIC DNA */}
          <section 
            className="p-5 rounded-xl"
            style={{
              backgroundColor: `rgba(${accentRgb}, 0.04)`,
              border: `1px solid rgba(${accentRgb}, 0.1)`,
            }}
          >
            <h3 
              className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4"
              style={{ color: `rgba(${accentRgb}, 0.5)` }}
            >
              Sonic Architecture
            </h3>
            <div 
              className="grid grid-cols-4 gap-3 mb-4 pb-4"
              style={{ borderBottom: `1px solid rgba(${accentRgb}, 0.08)` }}
            >
              {[
                { label: 'BPM', value: node.sonic_dna?.bpm },
                { label: 'KEY', value: node.sonic_dna?.key },
                { label: 'ENERGY', value: node.sonic_dna?.energy },
                { label: 'LENGTH', value: node.sonic_dna?.duration },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <span className="block text-[10px] text-white/30 mb-1">{label}</span>
                  <span 
                    className="text-lg font-mono"
                    style={{ color: `rgba(${accentRgb}, 0.8)` }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Energy bar */}
            <div className="mb-4">
              <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-700"
                  style={{ 
                    width: `${(node.sonic_dna?.energy || 0) * 100}%`,
                    background: `linear-gradient(90deg, rgba(${accentRgb}, 0.3), ${accent})`,
                  }}
                />
              </div>
            </div>

            <div>
              <strong className="text-white block mb-2 text-xs uppercase tracking-wider">Key Instruments</strong>
              <div className="flex flex-wrap gap-1.5">
                {node.sonic_dna?.prominent_instruments.map((inst, i) => (
                  <span 
                    key={i} 
                    className="px-2 py-0.5 rounded text-[11px]"
                    style={{
                      backgroundColor: `rgba(${accentRgb}, 0.1)`,
                      color: `rgba(${accentRgb}, 0.7)`,
                      border: `1px solid rgba(${accentRgb}, 0.15)`,
                    }}
                  >
                    {inst}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* GENETIC DNA */}
          <section>
            <h3 
              className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3"
              style={{ color: `rgba(${accentRgb}, 0.3)` }}
            >
              The Village
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-white/40 mb-1">PRODUCER</div>
                <div className="text-white/90">{node.genetic_dna?.producer}</div>
              </div>
              <div className="text-right">
                <div className="text-white/40 mb-1">SONGWRITER</div>
                <div className="text-white/90">{node.genetic_dna?.songwriter}</div>
              </div>
              <div>
                <div className="text-white/40 mb-1">MIX ENGINEER</div>
                <div className="text-white/90">{node.genetic_dna?.mixing_engineer}</div>
              </div>
              <div className="text-right">
                <div className="text-white/40 mb-1">FEATURING</div>
                <div className="text-white/90">{node.genetic_dna?.featuring || '—'}</div>
              </div>
              <div 
                className="col-span-2 pt-2"
                style={{ borderTop: `1px solid rgba(${accentRgb}, 0.08)` }}
              >
                <div className="text-white/40 mb-1">STUDIO</div>
                <div className="text-white/90 font-mono text-[10px]">{node.genetic_dna?.studio}</div>
              </div>
            </div>
          </section>

          {/* SEMANTIC DNA */}
          <section>
            <h3 
              className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3"
              style={{ color: `rgba(${accentRgb}, 0.3)` }}
            >
              Semantic Themes
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {node.semantic_dna?.themes.map((tag, i) => (
                <span 
                  key={i} 
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: `rgba(${accentRgb}, 0.12)`,
                    color: `rgba(${accentRgb}, 0.8)`,
                    border: `1px solid rgba(${accentRgb}, 0.2)`,
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
            <div className="mb-3">
              <span className="text-xs text-white/30 uppercase tracking-wider">Mood: </span>
              <span className="text-xs" style={{ color: `rgba(${accentRgb}, 0.6)` }}>{node.semantic_dna?.mood}</span>
            </div>
            <p 
              className="text-sm text-white/50 leading-relaxed italic pl-4"
              style={{ borderLeft: `2px solid rgba(${accentRgb}, 0.3)` }}
            >
              "{node.semantic_dna?.ai_summary}"
            </p>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Sidebar;