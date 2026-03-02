import React, { useMemo } from 'react';

const TimelineView = ({ data, onSelect }) => {
  
  // 1. Group Data by Decade
  const timelineData = useMemo(() => {
    const sorted = [...data.nodes].sort((a, b) => a.year - b.year);
    
    const groups = {};
    sorted.forEach(node => {
      const decade = Math.floor(node.year / 10) * 10;
      if (!groups[decade]) groups[decade] = [];
      groups[decade].push(node);
    });

    return Object.entries(groups).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [data]);

  return (
    <div style={{
      width: '100%', height: '100%',
      overflowX: 'auto', overflowY: 'hidden',
      display: 'flex', alignItems: 'center',
      padding: '0 50px', gap: '80px',
      background: '#050505',
      cursor: 'grab'
    }}>
      {/* Central Timeline Line */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0,
        height: '1px', background: 'rgba(255,255,255,0.1)',
        zIndex: 0
      }} />

      {timelineData.map(([decade, nodes]) => (
        <div key={decade} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          {/* Decade Marker */}
          <div style={{
            fontSize: '120px', fontWeight: '900', color: 'rgba(255,255,255,0.03)',
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 0, pointerEvents: 'none', fontFamily: 'sans-serif'
          }}>
            {decade}s
          </div>

          {/* Albums Grid for this Decade */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px',
            zIndex: 1, marginTop: '-20px' // Offset to center on line
          }}>
            {nodes.map(node => (
              <div 
                key={node.id}
                onClick={(e) => { e.stopPropagation(); onSelect(node); }}
                style={{
                  width: '140px', cursor: 'pointer',
                  transition: 'transform 0.2s', position: 'relative'
                }}
                className="group"
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {/* Connecting Line to Main Axis */}
                <div style={{
                  position: 'absolute', 
                  top: '50%', 
                  left: '50%', 
                  height: '100vh', 
                  width: '1px', 
                  background: `linear-gradient(to bottom, transparent, ${node.visual_dna.primary_color}, transparent)`,
                  opacity: 0.1,
                  zIndex: -1,
                  pointerEvents: 'none'
                }} />

                <img 
                  src={node.img} 
                  alt={node.name}
                  style={{
                    width: '140px', height: '140px', borderRadius: '4px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)', objectFit: 'cover',
                    border: `1px solid ${node.visual_dna.primary_color}`
                  }}
                />
                
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>{node.year}</div>
                  <div style={{ fontSize: '11px', color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {/* Padding at the end */}
      <div style={{ width: '100px', flexShrink: 0 }} />
    </div>
  );
};

export default TimelineView;