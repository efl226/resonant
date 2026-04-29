import { useEffect, useRef } from 'react';

const LAYOUT_LABELS = {
  default: 'Overall Similarity',
  sonic: 'Sonic',
  vibe: 'Vibe',
  decade: 'Decade',
  dna: 'DNA',
};

export default function ClusterPanel({ cluster, onClose, onNavigate, allNodes, activeLayout }) {
  const panelRef = useRef();

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!cluster) return null;

  const color = cluster.color || 'rgba(255,255,255,0.5)';
  const layoutLabel = LAYOUT_LABELS[activeLayout] || activeLayout;

  // Resolve full node data — match by id first, fall back to name+artist
  const songNodes = (cluster.songs || []).map(s => {
    const full = allNodes?.find(n =>
      (s.id && n.id === s.id) ||
      (n.name === s.name && n.artist === s.artist)
    );
    return full || s;
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 45,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 72, left: 16,
          zIndex: 50,
          width: 360,
          maxHeight: 'calc(100vh - 100px)',
          display: 'flex', flexDirection: 'column',
          backgroundColor: 'rgba(8,8,8,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${color}28`,
          borderRadius: 16,
          boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)`,
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, sans-serif',
          animation: 'slideUp 0.18s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {/* Color pip */}
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: color,
              boxShadow: `0 0 8px ${color}`,
              flexShrink: 0, marginTop: 3,
            }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700,
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.2, marginBottom: 4,
              }}>
                {cluster.label || `Cluster ${cluster.id}`}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 500,
                color: color,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                opacity: 0.8,
              }}>
                {layoutLabel} · {cluster.song_count || songNodes.length} songs
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.35)', fontSize: 18, lineHeight: 1,
                padding: '0 2px', flexShrink: 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
            >×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}>
          {/* AI Description */}
          {cluster.description && (
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Why These Songs
              </div>
              <p style={{
                fontSize: 12, lineHeight: 1.65,
                color: 'rgba(255,255,255,0.65)',
                margin: 0,
              }}>
                {cluster.description}
              </p>
            </div>
          )}

          {/* Mood tags */}
          {cluster.top_moods?.length > 0 && (
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', gap: 6, flexWrap: 'wrap',
            }}>
              {cluster.top_moods.map(mood => (
                <span key={mood} style={{
                  fontSize: 10, fontWeight: 500,
                  padding: '3px 8px', borderRadius: 20,
                  backgroundColor: `${color}14`,
                  border: `1px solid ${color}28`,
                  color: color,
                }}>
                  {mood}
                </span>
              ))}
            </div>
          )}

          {/* Song list */}
          <div style={{ padding: '10px 0 8px' }}>
            <div style={{
              padding: '0 16px 8px',
              fontSize: 10, fontWeight: 600,
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              Songs
            </div>
            {songNodes.map((song, i) => (
              <button
                key={song.id || i}
                onClick={() => { onNavigate(song); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '7px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {/* Album art or placeholder */}
                <div style={{
                  width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {song.img ? (
                    <img
                      src={song.img}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: 'rgba(255,255,255,0.2)',
                    }}>♪</div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 500,
                    color: 'rgba(255,255,255,0.85)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {song.name || 'Unknown'}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.4)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {song.artist || ''}{song.year ? ` · ${song.year}` : ''}
                  </div>
                </div>

                <div style={{
                  fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0,
                }}>›</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}
