import React, { useState, useEffect } from 'react';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255';
};

const linkTypeConfig = {
  samples: { label: 'SAMPLES', color: '#E8724A', icon: '⟲' },
  shared_musician: { label: 'SHARED MUSICIAN', color: '#6BCB77', icon: '♫' },
  same_producer: { label: 'SAME PRODUCER', color: '#B84AE8', icon: '◉' },
  same_songwriter: { label: 'SAME SONGWRITER', color: '#D44AE8', icon: '✎' },
  same_label: { label: 'SAME LABEL', color: '#8B9FE8', icon: '◎' },
  same_studio: { label: 'SAME STUDIO', color: '#9B72CF', icon: '⌂' },
  shared_instruments: { label: 'SHARED INSTRUMENTS', color: '#4AE8D4', icon: '◈' },
  harmonic_bridge: { label: 'HARMONIC BRIDGE', color: '#E8C94A', icon: '♪' },
  same_key_bpm: { label: 'HARMONIC MATCH', color: '#E8C94A', icon: '♪' },
  same_artist: { label: 'SAME ARTIST', color: '#4A9EE8', icon: '●' },
  same_mood: { label: 'MOOD', color: '#E84A6A', icon: '◐' },
  same_feel: { label: 'FEEL', color: '#8B9FE8', icon: '∿' },
};

const addFilter = (key, value) => {
  window.dispatchEvent(new CustomEvent('resonant-add-filter', {
    detail: { key, value }
  }));
};

const FilterTag = ({ label, filterKey, filterValue, color, className = "" }) => {
  if (!filterValue) return null;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        addFilter(filterKey, filterValue);
      }}
      className={`cursor-pointer hover:opacity-80 transition-opacity ${className}`}
      style={{ color: color || undefined }}
      title={`Filter by ${label || filterKey}: ${filterValue}`}
    >
      {filterValue}
    </span>
  );
};

const FilterPill = ({ value, filterKey, accentRgb }) => {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        addFilter(filterKey, value);
      }}
      className="px-2 py-0.5 rounded text-[11px] cursor-pointer transition-all hover:scale-105"
      style={{
        backgroundColor: `rgba(${accentRgb}, 0.08)`,
        color: `rgba(${accentRgb}, 0.65)`,
        border: `1px solid rgba(${accentRgb}, 0.12)`,
      }}
      title={`Filter by ${filterKey}: ${value}`}
    >
      {value}
    </span>
  );
};

const SIDEBAR_WIDTH = 420;
const COLLAPSED_WIDTH = 48;

const Sidebar = ({ node, links, onClose, onPlay, onNavigate }) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Reset to expanded whenever a new node is selected
  useEffect(() => {
    setCollapsed(false);
    setShowLyrics(false);
  }, [node?.id]);

  if (!node) return null;

  const accent = node.visual_dna?.primary_color || '#ffffff';
  const accentRgb = hexToRgb(accent);
  const palette = node.visual_dna?.palette || [];
  const musicianCredits = node.genetic_dna?.musician_credits || {};
  const samplesFrom = node.genetic_dna?.samples_from || [];
  const songwriter = node.genetic_dna?.songwriter || [];
  const mood = node.semantic_dna?.mood || [];

  const shellStyle = {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100%',
    zIndex: 50,
    backgroundColor: 'rgba(10,10,10,0.97)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderLeft: `1px solid rgba(${accentRgb}, 0.18)`,
    boxShadow: `-20px 0 60px rgba(${accentRgb}, 0.06), -4px 0 24px rgba(0,0,0,0.8)`,
    width: collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH,
    transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  };

  // ── Collapsed strip ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={shellStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', paddingTop: 12, gap: 12 }}>
          {/* Expand button */}
          <button
            onClick={() => setCollapsed(false)}
            style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
            title="Expand sidebar"
          >
            ‹
          </button>

          {/* Album art thumbnail */}
          {node.img && (
            <img
              src={node.img}
              alt=""
              onClick={() => setCollapsed(false)}
              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0, cursor: 'pointer', boxShadow: `0 0 0 1px rgba(${accentRgb}, 0.3)` }}
            />
          )}

          {/* Accent dot */}
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: accent, boxShadow: `0 0 8px ${accent}88`, flexShrink: 0 }} />

          {/* Song name rotated */}
          <div
            onClick={() => setCollapsed(false)}
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.55)',
              cursor: 'pointer',
              overflow: 'hidden',
              maxHeight: 200,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              userSelect: 'none',
            }}
            title={node.name}
          >
            {node.name}
          </div>

          {/* Close button at bottom */}
          <button
            onClick={onClose}
            style={{
              marginTop: 'auto', marginBottom: 16,
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 16,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded sidebar ─────────────────────────────────────────────────────────
  return (
    <div style={{ ...shellStyle, overflowY: 'auto' }}>

      {/* Top controls */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 10 }}>
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
          title="Collapse sidebar"
        >
          ›
        </button>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            color: `rgba(${accentRgb}, 0.45)`, cursor: 'pointer', fontSize: 18,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = `rgba(${accentRgb}, 0.9)`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = `rgba(${accentRgb}, 0.45)`; }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* HERO */}
      <div className="relative">
        <img src={node.img} alt="cover" className="w-full" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 30%, rgba(${accentRgb}, 0.15) 60%, rgb(10, 10, 10) 100%)`,
          }}
        />
      </div>

      <div className="px-8 pb-8 -mt-12 relative z-10">

        {/* HEADER */}
        <h1 className="text-3xl font-bold tracking-tight mb-1">{node.name}</h1>
        <h2
          className="text-lg mb-1 cursor-pointer hover:opacity-80 transition-opacity"
          style={{ color: `rgba(${accentRgb}, 0.7)` }}
          onClick={() => addFilter('artist', node.artist)}
          title={`Filter by artist: ${node.artist}`}
        >
          {node.artist}
        </h2>
        <div className="text-sm text-white/25 mb-2">
          {node.album && <span className="italic">{node.album}</span>}
          {node.album && node.year && <span> • </span>}
          {node.year && (
            <span
              className="cursor-pointer hover:text-white/50 transition-colors"
              onClick={() => {
                const decade = `${Math.floor(node.year / 10) * 10}s`;
                addFilter('decade', decade);
              }}
              title="Filter by decade"
            >
              {node.year}
            </span>
          )}
          {node.genetic_dna?.label && (
            <>
              <span> • </span>
              <span
                className="cursor-pointer hover:text-white/50 transition-colors"
                onClick={() => addFilter('label', node.genetic_dna.label)}
                title={`Filter by label: ${node.genetic_dna.label}`}
              >
                {node.genetic_dna.label}
              </span>
            </>
          )}
        </div>

        {/* Quick stats row */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {node.sonic_dna?.bpm && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50">
              {node.sonic_dna.bpm} BPM
            </span>
          )}
          {node.sonic_dna?.key && (
            <span
              className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => addFilter('key', node.sonic_dna.key)}
              title={`Filter by key: ${node.sonic_dna.key}`}
            >
              {node.sonic_dna.key}
            </span>
          )}
          {node.sonic_dna?.time_signature && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50">
              {node.sonic_dna.time_signature}
            </span>
          )}
          {node.sonic_dna?.duration && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50">
              {node.sonic_dna.duration}
            </span>
          )}
          {node.sonic_dna?.vocal_type && (
            <span
              className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => addFilter('vocal_type', node.sonic_dna.vocal_type)}
              title="Filter by vocal type"
            >
              {node.sonic_dna.vocal_type}
            </span>
          )}
          {node.sonic_dna?.mode && (
            <span
              className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => addFilter('mode', node.sonic_dna.mode)}
              title="Filter by mode"
            >
              {node.sonic_dna.mode}
            </span>
          )}
        </div>

        {/* Play button */}
        {node.spotify_uri && onPlay && (
          <button
            onClick={() => onPlay(node)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4 transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: '#1DB954', color: 'white' }}
          >
            ▶ Play this song
          </button>
        )}

        <div className="space-y-6">

          {/* PALETTE */}
          {palette.length > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden w-full">
              {palette.map((color, i) => (
                <div key={i} style={{ backgroundColor: color }} className="flex-1" />
              ))}
            </div>
          )}

          {/* FUN FACT */}
          {node.semantic_dna?.fun_fact && (
            <div
              className="p-4 rounded-lg text-sm leading-relaxed"
              style={{
                backgroundColor: `rgba(${accentRgb}, 0.06)`,
                borderLeft: `3px solid rgba(${accentRgb}, 0.4)`,
              }}
            >
              <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-2">Did you know?</span>
              <span className="text-white/70">{node.semantic_dna.fun_fact}</span>
            </div>
          )}

          {/* MOOD & THEMES */}
          <section>
            <div className="flex flex-wrap gap-2 mb-3">
              {mood.map((m, i) => (
                <span
                  key={i}
                  onClick={() => addFilter('mood', m)}
                  className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:scale-105 transition-all"
                  style={{
                    backgroundColor: `rgba(${accentRgb}, 0.12)`,
                    color: `rgba(${accentRgb}, 0.8)`,
                    border: `1px solid rgba(${accentRgb}, 0.2)`,
                  }}
                  title={`Filter by mood: ${m}`}
                >
                  {m}
                </span>
              ))}
              {(node.semantic_dna?.themes || []).map((tag, i) => (
                <span
                  key={`t-${i}`}
                  onClick={() => addFilter('themes', tag)}
                  className="px-3 py-1 rounded-full text-xs cursor-pointer hover:scale-105 transition-all"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  title={`Filter by theme: ${tag}`}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </section>

          {/* AI SUMMARY */}
          {node.semantic_dna?.ai_summary && (
            <p className="text-sm text-white/45 leading-relaxed italic">
              "{node.semantic_dna.ai_summary}"
            </p>
          )}

          {/* SAMPLING */}
          {samplesFrom.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3" style={{ color: '#E8724A' }}>
                Samples
              </h3>
              <div className="space-y-2">
                {samplesFrom.map((sample, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg text-xs"
                    style={{ backgroundColor: 'rgba(232, 114, 74, 0.08)', border: '1px solid rgba(232, 114, 74, 0.15)' }}
                  >
                    <span className="text-white/80 font-medium">{sample.sampled_song}</span>
                    <span
                      className="text-white/40 cursor-pointer hover:text-white/60 transition-colors"
                      onClick={() => addFilter('artist', sample.sampled_artist)}
                    > by {sample.sampled_artist}</span>
                    {sample.element && (
                      <span className="text-white/30 block mt-1">{sample.element}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* INSTRUMENTS */}
          {node.sonic_dna?.prominent_instruments?.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">
                Instruments
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {node.sonic_dna.prominent_instruments.map((inst, i) => (
                  <FilterPill key={i} value={inst} filterKey="instruments" accentRgb={accentRgb} />
                ))}
              </div>
            </section>
          )}

          {/* MUSICIAN CREDITS */}
          {Object.keys(musicianCredits).length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">
                Musicians
              </h3>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(musicianCredits).map(([name, role], i) => (
                  <div key={i} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-white/70">{name}</span>
                    <span
                      className="text-white/30 italic cursor-pointer hover:text-white/50 transition-colors"
                      onClick={() => addFilter('instruments', role)}
                      title={`Filter by instrument: ${role}`}
                    >
                      {role}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PRODUCTION */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">
              Production
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {node.genetic_dna?.producer && (
                <div className="group">
                  <div className="text-white/30 mb-0.5">PRODUCER</div>
                  <div
                    className="text-white/80 cursor-pointer hover:text-white transition-colors"
                    onClick={() => addFilter('producer', node.genetic_dna.producer)}
                    title={`Filter by producer: ${node.genetic_dna.producer}`}
                  >
                    {node.genetic_dna.producer}
                  </div>
                </div>
              )}
              {node.genetic_dna?.mixing_engineer && (
                <div>
                  <div className="text-white/30 mb-0.5">MIX ENGINEER</div>
                  <div className="text-white/80">{node.genetic_dna.mixing_engineer}</div>
                </div>
              )}
              {songwriter.length > 0 && (
                <div className="col-span-2">
                  <div className="text-white/30 mb-0.5">SONGWRITERS</div>
                  <div className="text-white/80">
                    {songwriter.map((sw, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        <span
                          className="cursor-pointer hover:text-white transition-colors"
                          onClick={() => addFilter('artist', sw)}
                          title={`Search for: ${sw}`}
                        >
                          {sw}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {node.genetic_dna?.label && (
                <div>
                  <div className="text-white/30 mb-0.5">LABEL</div>
                  <div
                    className="text-white/80 cursor-pointer hover:text-white transition-colors"
                    onClick={() => addFilter('label', node.genetic_dna.label)}
                    title={`Filter by label: ${node.genetic_dna.label}`}
                  >
                    {node.genetic_dna.label}
                  </div>
                </div>
              )}
              {node.genetic_dna?.studio && (
                <div className="col-span-2">
                  <div className="text-white/30 mb-0.5">STUDIO</div>
                  <div className="text-white/80 font-mono text-[10px]">{node.genetic_dna.studio}</div>
                </div>
              )}
            </div>
          </section>

          {/* SONIC CHARACTER */}
          {(node.sonic_dna?.energy !== null || node.sonic_dna?.rhythm_feel) && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">
                Sonic Character
              </h3>
              <div className="space-y-2">
                {node.sonic_dna?.energy !== null && (
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/30">Energy</span>
                      <span className="text-white/50">{node.sonic_dna.energy_shape || ''}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(node.sonic_dna.energy || 0) * 100}%`,
                          backgroundColor: `rgba(${accentRgb}, 0.6)`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {node.sonic_dna?.bass_weight !== null && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Bass', value: node.sonic_dna?.bass_weight },
                      { label: 'Mid', value: node.sonic_dna?.mid_weight },
                      { label: 'Treble', value: node.sonic_dna?.treble_weight },
                    ].map((band, i) => band.value !== null && band.value !== undefined && (
                      <div key={i}>
                        <div className="text-[10px] text-white/25 mb-1">{band.label}</div>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(band.value || 0) * 100}%`,
                              backgroundColor: `rgba(${accentRgb}, 0.4)`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {node.sonic_dna?.rhythm_feel && node.sonic_dna.rhythm_feel !== 'straight' && (
                  <div
                    className="text-xs text-white/40 cursor-pointer hover:text-white/60 transition-colors"
                    onClick={() => addFilter('rhythm_feel', node.sonic_dna.rhythm_feel)}
                  >
                    Rhythm: <span className="text-white/60">{node.sonic_dna.rhythm_feel}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* LYRICS PREVIEW */}
          {node.has_lyrics && (
            <section>
              <button
                onClick={() => setShowLyrics(!showLyrics)}
                className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3 flex items-center gap-2 cursor-pointer hover:opacity-80"
                style={{ color: `rgba(${accentRgb}, 0.4)` }}
              >
                Lyrics {showLyrics ? '▾' : '▸'}
              </button>
              {showLyrics && node.lyrics_preview && (
                <pre
                  className="text-xs text-white/30 leading-relaxed whitespace-pre-wrap font-sans max-h-[200px] overflow-y-auto"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: `rgba(${accentRgb}, 0.2) transparent`,
                  }}
                >
                  {node.lyrics_preview}
                </pre>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
};

export default Sidebar;
