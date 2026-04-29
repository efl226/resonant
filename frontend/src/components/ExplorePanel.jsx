import { useState, useMemo, useEffect } from 'react';

const LINK_TYPE_CONFIG = {
  samples: { label: 'Samples', color: '#E8724A', icon: '⟲' },
  shared_musician: { label: 'Shared Musician', color: '#6BCB77', icon: '♫' },
  same_producer: { label: 'Same Producer', color: '#B84AE8', icon: '◉' },
  same_songwriter: { label: 'Same Songwriter', color: '#D44AE8', icon: '✎' },
  same_label: { label: 'Same Label', color: '#8B9FE8', icon: '◎' },
  same_studio: { label: 'Same Studio', color: '#9B72CF', icon: '⌂' },
  shared_instruments: { label: 'Shared Instruments', color: '#4AE8D4', icon: '◈' },
  harmonic_bridge: { label: 'Harmonic Bridge', color: '#E8C94A', icon: '♪' },
};

export function computeMatches(filter, selectedNode, allNodes, allLinks) {
  const matches = new Set();
  if (!selectedNode || !filter) return matches;
  const selId = selectedNode.id;
  const { type, value } = filter;

  switch (type) {
    case 'nearby': {
      if (selectedNode.umap_x === null || selectedNode.umap_x === undefined) break;
      allNodes
        .filter(n => n.id !== selId && n.umap_x !== null && n.umap_y !== null)
        .map(n => ({ id: n.id, dist: Math.sqrt((n.umap_x - selectedNode.umap_x) ** 2 + (n.umap_y - selectedNode.umap_y) ** 2) }))
        .sort((a, b) => a.dist - b.dist).slice(0, 10).forEach(d => matches.add(d.id));
      break;
    }
    case 'cluster': {
      const cid = selectedNode.cluster_id;
      if (cid === null || cid === undefined) break;
      allNodes.forEach(n => { if (n.id !== selId && n.cluster_id === cid) matches.add(n.id); });
      break;
    }
    case 'connection': {
      (allLinks || []).forEach(link => {
        if (link.type !== value) return;
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        if (sId === selId) matches.add(tId);
        else if (tId === selId) matches.add(sId);
      });
      break;
    }
    case 'mood':
      allNodes.forEach(n => { if (n.id !== selId && (n.semantic_dna?.mood || []).includes(value)) matches.add(n.id); });
      break;
    case 'theme':
      allNodes.forEach(n => { if (n.id !== selId && (n.semantic_dna?.themes || []).includes(value)) matches.add(n.id); });
      break;
    case 'instrument':
      allNodes.forEach(n => { if (n.id !== selId && (n.sonic_dna?.prominent_instruments || []).includes(value)) matches.add(n.id); });
      break;
    case 'decade':
      allNodes.forEach(n => { if (n.id !== selId && n.year && `${Math.floor(n.year / 10) * 10}s` === value) matches.add(n.id); });
      break;
    case 'key':
      allNodes.forEach(n => { if (n.id !== selId && n.sonic_dna?.key === value) matches.add(n.id); });
      break;
    case 'mode':
      allNodes.forEach(n => { if (n.id !== selId && n.sonic_dna?.mode === value) matches.add(n.id); });
      break;
    case 'bpm':
      allNodes.forEach(n => { if (n.id !== selId && n.sonic_dna?.bpm && Math.abs(n.sonic_dna.bpm - value) <= 5) matches.add(n.id); });
      break;
    case 'time_signature':
      allNodes.forEach(n => { if (n.id !== selId && n.sonic_dna?.time_signature === value) matches.add(n.id); });
      break;
    case 'vocal_type':
      allNodes.forEach(n => { if (n.id !== selId && n.sonic_dna?.vocal_type === value) matches.add(n.id); });
      break;
    case 'rhythm_feel':
      allNodes.forEach(n => { if (n.id !== selId && n.sonic_dna?.rhythm_feel === value) matches.add(n.id); });
      break;
    case 'label':
      allNodes.forEach(n => { if (n.id !== selId && n.genetic_dna?.label === value) matches.add(n.id); });
      break;
    case 'studio':
      allNodes.forEach(n => { if (n.id !== selId && n.genetic_dna?.studio === value) matches.add(n.id); });
      break;
    case 'producer':
      allNodes.forEach(n => { if (n.id !== selId && n.genetic_dna?.producer === value) matches.add(n.id); });
      break;
    case 'songwriter':
      allNodes.forEach(n => { if (n.id !== selId && (n.genetic_dna?.songwriter || []).includes(value)) matches.add(n.id); });
      break;
    case 'mixing_engineer':
      allNodes.forEach(n => { if (n.id !== selId && n.genetic_dna?.mixing_engineer === value) matches.add(n.id); });
      break;
    case 'artist':
      allNodes.forEach(n => { if (n.id !== selId && n.artist === value) matches.add(n.id); });
      break;
    case 'gear':
      allNodes.forEach(n => {
        if (n.id === selId) return;
        const credits = n.sonic_dna?.instrument_credits || [];
        if (credits.some(c => [c.make, c.model].filter(Boolean).join(' ') === value)) matches.add(n.id);
      });
      break;
    case 'nearby_adjacent': {
      if (selectedNode.x === undefined) break;
      const sorted = allNodes
        .filter(n => n.id !== selId && n.x !== undefined && n.y !== undefined)
        .map(n => ({ id: n.id, dist: Math.sqrt((n.x - selectedNode.x) ** 2 + (n.y - selectedNode.y) ** 2) }))
        .sort((a, b) => a.dist - b.dist);
      if (sorted.length === 0) break;
      const radius = sorted[Math.min(4, sorted.length - 1)].dist;
      sorted.filter(c => c.dist <= radius).slice(0, 8).forEach(c => matches.add(c.id));
      break;
    }
    default: break;
  }
  return matches;
}

export function getSharedAttributes(songA, songB) {
  const shared = [];
  if (songA.artist === songB.artist) shared.push({ label: songA.artist, type: 'artist', value: songA.artist });
  const moodsA = songA.semantic_dna?.mood || [];
  const moodsB = songB.semantic_dna?.mood || [];
  moodsA.forEach(m => { if (moodsB.includes(m)) shared.push({ label: m, type: 'mood', value: m }); });
  if (songA.year && songB.year && Math.floor(songA.year / 10) === Math.floor(songB.year / 10)) {
    const decade = `${Math.floor(songA.year / 10) * 10}s`;
    shared.push({ label: decade, type: 'decade', value: decade });
  }
  if (songA.sonic_dna?.key && songA.sonic_dna.key === songB.sonic_dna?.key)
    shared.push({ label: songA.sonic_dna.key, type: 'key', value: songA.sonic_dna.key });
  const instrA = songA.sonic_dna?.prominent_instruments || [];
  const instrB = songB.sonic_dna?.prominent_instruments || [];
  instrA.forEach(i => { if (instrB.includes(i)) shared.push({ label: i, type: 'instrument', value: i }); });
  const themesA = songA.semantic_dna?.themes || [];
  const themesB = songB.semantic_dna?.themes || [];
  themesA.forEach(t => { if (themesB.includes(t)) shared.push({ label: `#${t}`, type: 'theme', value: t }); });
  return shared.slice(0, 5);
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO = 'Inter, system-ui, sans-serif';
const SERIF = 'Inter, system-ui, sans-serif';
const GOLD = 'rgba(255,255,255,0.5)';
const GOLD_DIM = 'rgba(255,255,255,0.1)';
const PANEL_BG = '#0a0a0a';
const groove = { borderBottom: '1px solid rgba(255,255,255,0.04)', boxShadow: '0 1px 0 rgba(0,0,0,0.5)' };

const CHIP_COLORS = {
  sonic:   { base: '#4A9EE8', bg: 'rgba(74,158,232,0.1)',  border: 'rgba(74,158,232,0.3)',  text: 'rgba(74,158,232,0.85)'  },
  mood:    { base: '#E84A6A', bg: 'rgba(232,74,106,0.1)',  border: 'rgba(232,74,106,0.3)',  text: 'rgba(232,74,106,0.85)'  },
  theme:   { base: '#E8C94A', bg: 'rgba(232,201,74,0.1)',  border: 'rgba(232,201,74,0.3)',  text: 'rgba(232,201,74,0.85)'  },
  instr:   { base: '#4AE8D4', bg: 'rgba(74,232,212,0.1)',  border: 'rgba(74,232,212,0.3)',  text: 'rgba(74,232,212,0.85)'  },
  people:  { base: '#B84AE8', bg: 'rgba(184,74,232,0.1)',  border: 'rgba(184,74,232,0.3)',  text: 'rgba(184,74,232,0.85)'  },
};

function useDesignFonts() {
  useEffect(() => {
    if (!document.querySelector('[data-resonant-dseg]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/dseg@0.46.0/css/dseg.min.css';
      link.setAttribute('data-resonant-dseg', '1');
      document.head.appendChild(link);
    }
  }, []);
}

// ── Section header ─────────────────────────────────────────────────────────────
const SectionHeader = ({ title, count, sectionKey, expanded, onToggle }) => (
  <button
    onClick={() => onToggle(sectionKey)}
    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase', color: GOLD, flexShrink: 0, fontWeight: 500 }}>{title}</span>
      {count > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>[{count}]</span>}
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${GOLD_DIM}, transparent)`, minWidth: 0 }} />
    </div>
    <span style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.2)', marginLeft: 8, flexShrink: 0 }}>{expanded ? '−' : '+'}</span>
  </button>
);

// ── Hardware: 7-segment LED BPM display ───────────────────────────────────────
const BpmDisplay = ({ bpm, isActive, onClick, disabled }) => {
  const digits = bpm != null ? String(Math.round(bpm)).padStart(3, ' ') : '- -';
  const LED_AMBER = '#ffaa00';
  const LED_GLOW = 'rgba(255,160,0,0.75)';
  const LED_GHOST = 'rgba(255,100,0,0.07)';

  return (
    <div
      onClick={() => !disabled && onClick()}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1 }}
      title={isActive ? 'Remove BPM filter' : `Filter: ~${bpm} BPM`}
    >
      {/* Housing */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #0a0600 0%, #060400 100%)',
        border: `1px solid ${isActive ? 'rgba(255,160,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 3,
        padding: '6px 10px 5px',
        boxShadow: isActive
          ? `0 0 14px rgba(255,160,0,0.2), inset 0 2px 4px rgba(0,0,0,0.9), inset 0 0 8px rgba(255,140,0,0.04)`
          : `inset 0 2px 4px rgba(0,0,0,0.9)`,
      }}>
        {/* Ghost unlit segments behind */}
        <div style={{
          position: 'absolute', top: 6, left: 10,
          fontFamily: "'DSEG7 Classic', 'Courier New', monospace",
          fontSize: 22, color: LED_GHOST, letterSpacing: 3,
          userSelect: 'none', lineHeight: 1, pointerEvents: 'none',
        }}>
          888
        </div>
        {/* Lit digits */}
        <div style={{
          fontFamily: "'DSEG7 Classic', 'Courier New', monospace",
          fontSize: 22, color: LED_AMBER,
          letterSpacing: 3,
          textShadow: `0 0 5px ${LED_GLOW}, 0 0 14px rgba(255,120,0,0.4), 0 0 28px rgba(255,80,0,0.15)`,
          position: 'relative', userSelect: 'none', lineHeight: 1,
        }}>
          {digits}
        </div>
        {/* Active indicator pip */}
        {isActive && (
          <div style={{ position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: '50%', backgroundColor: LED_AMBER, boxShadow: `0 0 5px ${LED_GLOW}` }} />
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
        BPM
      </div>
    </div>
  );
};

// ── Hardware: illuminated console push-button ──────────────────────────────────
const ConsoleButton = ({ label, value, type, count, isActive, disabled, onToggle, color }) => {
  const [pressed, setPressed] = useState(false);
  const c = color || CHIP_COLORS.sonic.base;
  const displayValue = String(value).length > 8 ? String(value).slice(0, 7) + '…' : String(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: disabled ? 0.22 : 1 }}>
      {/* LED indicator pip */}
      <div style={{
        width: 4, height: 4, borderRadius: '50%',
        backgroundColor: isActive ? c : 'rgba(255,255,255,0.08)',
        boxShadow: isActive ? `0 0 6px ${c}, 0 0 10px ${c}88` : 'none',
        transition: 'all 0.12s',
      }} />

      {/* Button face */}
      <div
        onClick={() => !disabled && onToggle()}
        onMouseDown={() => !disabled && setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        title={`${label}: ${value}${count !== undefined ? ` — ${count} matches` : ''}`}
        style={{
          cursor: disabled ? 'default' : 'pointer',
          padding: '5px 9px',
          minWidth: 38, textAlign: 'center',
          borderRadius: 2,
          transform: pressed ? 'translateY(1px) scale(0.98)' : 'none',
          transition: 'transform 0.07s, box-shadow 0.12s, background 0.12s',
          background: isActive
            ? `linear-gradient(180deg, ${c}28 0%, ${c}14 100%)`
            : 'linear-gradient(180deg, rgba(52,48,44,1) 0%, rgba(28,26,22,1) 100%)',
          border: isActive ? `1px solid ${c}55` : '1px solid rgba(255,255,255,0.07)',
          boxShadow: pressed
            ? `inset 0 2px 4px rgba(0,0,0,0.7)`
            : isActive
              ? `0 0 10px ${c}18, inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.5)`
              : `inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.6)`,
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.01em', color: isActive ? c : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', lineHeight: 1 }}>
          {displayValue}
        </div>
        {count !== undefined && count > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 8, color: isActive ? `${c}99` : 'rgba(255,255,255,0.25)', marginTop: 2, lineHeight: 1 }}>
            {count}
          </div>
        )}
      </div>

      {/* Label engraved below */}
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </div>
    </div>
  );
};

// ── Hardware: VU meter column ──────────────────────────────────────────────────
const VuMeter = ({ label, level = 0 }) => {
  const SEGS = 10;
  const filled = Math.round(Math.min(1, Math.max(0, level)) * SEGS);

  const segColor = (i) => {
    // i=0 is bottom, i=9 is top
    if (i >= 8) return '#ff2200';
    if (i >= 6) return '#ffb300';
    return '#00cc55';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {/* Meter housing */}
      <div style={{
        background: '#060604',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 2,
        padding: '4px 4px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 2,
      }}>
        {Array.from({ length: SEGS }, (_, i) => {
          const lit = i < filled;
          const c = segColor(i);
          return (
            <div key={i} style={{
              width: 10, height: 4, borderRadius: 1,
              backgroundColor: lit ? c : `${c}18`,
              boxShadow: lit ? `0 0 5px ${c}cc, 0 0 2px ${c}` : 'none',
              transition: 'background-color 0.08s, box-shadow 0.08s',
            }} />
          );
        })}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </div>
    </div>
  );
};

// ── Hardware: full sonic channel strip ────────────────────────────────────────
const SonicStrip = ({ node, activeFilters, attrCounts, onToggleFilter }) => {
  const s = node.sonic_dna || {};
  const decade = node.year ? `${Math.floor(node.year / 10) * 10}s` : null;

  const vuMeters = [
    { label: 'NRGY', level: s.energy },
    { label: 'BASS', level: s.bass_weight },
    { label: 'MID',  level: s.mid_weight },
    { label: 'TREB', level: s.treble_weight },
  ].filter(d => d.level != null && d.level !== undefined);

  const buttons = [
    s.key            && { label: 'KEY',   type: 'key',            value: s.key,            count: attrCounts[`key:${s.key}`] ?? 0 },
    s.mode           && { label: 'MODE',  type: 'mode',           value: s.mode,           count: attrCounts[`mode:${s.mode}`] ?? 0 },
    decade           && { label: 'ERA',   type: 'decade',         value: decade,           count: attrCounts[`decade:${decade}`] ?? 0 },
    s.time_signature && { label: 'TIME',  type: 'time_signature', value: s.time_signature, count: attrCounts[`time_signature:${s.time_signature}`] ?? 0 },
    s.vocal_type     && { label: 'VOCAL', type: 'vocal_type',     value: s.vocal_type,     count: attrCounts[`vocal_type:${s.vocal_type}`] ?? 0 },
    s.rhythm_feel    && { label: 'FEEL',  type: 'rhythm_feel',    value: s.rhythm_feel,    count: attrCounts[`rhythm_feel:${s.rhythm_feel}`] ?? 0 },
  ].filter(Boolean);

  const hasMeter = vuMeters.length > 0;
  const hasBpm   = s.bpm != null;
  const hasTop   = hasMeter || hasBpm;

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 100%), #0e0b08',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3,
      padding: '12px 12px 10px',
    }}>
      {/* Channel strip label */}
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase', color: CHIP_COLORS.sonic.text, marginBottom: 10, fontWeight: 500 }}>
        Sonic
      </div>

      {/* Top row: VU meters + BPM LED */}
      {hasTop && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14 }}>
          {hasMeter && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              {vuMeters.map(({ label, level }) => (
                <VuMeter key={label} label={label} level={level} />
              ))}
            </div>
          )}
          {hasBpm && (
            <BpmDisplay
              bpm={s.bpm}
              isActive={activeFilters.has(`bpm:${s.bpm}`)}
              onClick={() => onToggleFilter(`bpm:${s.bpm}`, { type: 'bpm', value: s.bpm })}
              disabled={(attrCounts[`bpm:${s.bpm}`] ?? 0) === 0}
            />
          )}
        </div>
      )}

      {/* Divider rule between meter row and buttons */}
      {hasTop && buttons.length > 0 && (
        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 12 }} />
      )}

      {/* Console buttons row */}
      {buttons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {buttons.map(btn => (
            <ConsoleButton
              key={btn.type}
              label={btn.label}
              value={btn.value}
              type={btn.type}
              count={btn.count}
              isActive={activeFilters.has(`${btn.type}:${btn.value}`)}
              disabled={btn.count === 0}
              onToggle={() => onToggleFilter(`${btn.type}:${btn.value}`, { type: btn.type, value: btn.value })}
              color={CHIP_COLORS.sonic.base}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Catalog tag chip (for mood/theme/instrument/people) ───────────────────────
const Chip = ({ type, value, label, count, colors, activeFilters, onToggleFilter }) => {
  const key = `${type}:${value}`;
  const isActive = activeFilters.has(key);
  const disabled = count === 0;
  const c = colors || CHIP_COLORS.sonic;
  return (
    <button
      onClick={() => !disabled && onToggleFilter(key, { type, value })}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 9px', fontFamily: MONO, fontSize: 10,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.2 : 1,
        backgroundColor: isActive ? c.bg : 'rgba(255,255,255,0.03)',
        border: isActive ? `1px solid ${c.border}` : '1px solid rgba(255,255,255,0.08)',
        color: isActive ? c.text : 'rgba(255,255,255,0.4)',
        borderRadius: 8, transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = isActive ? c.border : 'rgba(255,255,255,0.18)'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.borderColor = isActive ? c.border : 'rgba(255,255,255,0.08)'; }}
    >
      {isActive && <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: c.base, flexShrink: 0 }} />}
      {label ?? value}
      {count !== undefined && <span style={{ opacity: 0.4, marginLeft: 2 }}>{count}</span>}
    </button>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const ExplorePanel = ({
  selectedNode, allNodes, allLinks, clusters,
  activeFilters, onToggleFilter, onClearFilters,
  combineMode, onToggleCombineMode,
  onNavigate, activeTab, onTabChange, onCompare,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState(new Set(['cluster', 'attributes']));

  useDesignFonts();

  const nearbySongs = useMemo(() => {
    if (selectedNode?.x === undefined) return [];
    const sorted = allNodes
      .filter(n => n.id !== selectedNode.id && n.x !== undefined && n.y !== undefined)
      .map(n => ({ ...n, _dist: Math.sqrt((n.x - selectedNode.x) ** 2 + (n.y - selectedNode.y) ** 2) }))
      .sort((a, b) => a._dist - b._dist);
    if (sorted.length === 0) return [];
    const radius = sorted[Math.min(4, sorted.length - 1)]._dist;
    return sorted.filter(n => n._dist <= radius).slice(0, 8).map(n => ({ ...n, sharedAttrs: getSharedAttributes(selectedNode, n) }));
  }, [selectedNode?.x, selectedNode?.y, allNodes]);

  const clusterInfo = useMemo(() => {
    if (!selectedNode || selectedNode.cluster_id === null || selectedNode.cluster_id === undefined) return null;
    const meta = clusters?.find(c => c.id === selectedNode.cluster_id);
    const songs = allNodes.filter(n => n.id !== selectedNode.id && n.cluster_id === selectedNode.cluster_id);
    return { meta, songs };
  }, [selectedNode, allNodes, clusters]);

  const directConnections = useMemo(() => {
    if (!selectedNode) return {};
    const nodeLinks = (allLinks || []).filter(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      return sId === selectedNode.id || tId === selectedNode.id;
    });
    const byType = {};
    nodeLinks.forEach(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const otherNodeId = sId === selectedNode.id
        ? (typeof link.target === 'object' ? link.target.id : link.target) : sId;
      const otherNode = allNodes.find(n => n.id === otherNodeId);
      if (!byType[link.type]) byType[link.type] = [];
      byType[link.type].push({ link, otherNode });
    });
    return byType;
  }, [selectedNode, allLinks, allNodes]);

  const attrCounts = useMemo(() => {
    if (!selectedNode) return {};
    const counts = {};
    const countFor = (key, matchFn) => { counts[key] = allNodes.filter(n => n.id !== selectedNode.id && matchFn(n)).length; };
    if (selectedNode.year) {
      const decade = `${Math.floor(selectedNode.year / 10) * 10}s`;
      countFor(`decade:${decade}`, n => n.year && Math.floor(n.year / 10) === Math.floor(selectedNode.year / 10));
    }
    if (selectedNode.sonic_dna?.key) { const k = selectedNode.sonic_dna.key; countFor(`key:${k}`, n => n.sonic_dna?.key === k); }
    if (selectedNode.sonic_dna?.mode) { const m = selectedNode.sonic_dna.mode; countFor(`mode:${m}`, n => n.sonic_dna?.mode === m); }
    if (selectedNode.sonic_dna?.bpm) { const bpm = selectedNode.sonic_dna.bpm; countFor(`bpm:${bpm}`, n => n.sonic_dna?.bpm && Math.abs(n.sonic_dna.bpm - bpm) <= 5); }
    if (selectedNode.sonic_dna?.time_signature) { const ts = selectedNode.sonic_dna.time_signature; countFor(`time_signature:${ts}`, n => n.sonic_dna?.time_signature === ts); }
    if (selectedNode.sonic_dna?.vocal_type) { const vt = selectedNode.sonic_dna.vocal_type; countFor(`vocal_type:${vt}`, n => n.sonic_dna?.vocal_type === vt); }
    if (selectedNode.sonic_dna?.rhythm_feel) { const rf = selectedNode.sonic_dna.rhythm_feel; countFor(`rhythm_feel:${rf}`, n => n.sonic_dna?.rhythm_feel === rf); }
    (selectedNode.semantic_dna?.mood || []).forEach(m => countFor(`mood:${m}`, n => (n.semantic_dna?.mood || []).includes(m)));
    (selectedNode.semantic_dna?.themes || []).forEach(t => countFor(`theme:${t}`, n => (n.semantic_dna?.themes || []).includes(t)));
    (selectedNode.sonic_dna?.prominent_instruments || []).forEach(i => countFor(`instrument:${i}`, n => (n.sonic_dna?.prominent_instruments || []).includes(i)));
    if (selectedNode.genetic_dna?.label) { const lb = selectedNode.genetic_dna.label; countFor(`label:${lb}`, n => n.genetic_dna?.label === lb); }
    if (selectedNode.genetic_dna?.studio) { const st = selectedNode.genetic_dna.studio; countFor(`studio:${st}`, n => n.genetic_dna?.studio === st); }
    if (selectedNode.genetic_dna?.producer) { const pr = selectedNode.genetic_dna.producer; countFor(`producer:${pr}`, n => n.genetic_dna?.producer === pr); }
    (selectedNode.genetic_dna?.songwriter || []).forEach(sw => countFor(`songwriter:${sw}`, n => (n.genetic_dna?.songwriter || []).includes(sw)));
    if (selectedNode.genetic_dna?.mixing_engineer) { const me = selectedNode.genetic_dna.mixing_engineer; countFor(`mixing_engineer:${me}`, n => n.genetic_dna?.mixing_engineer === me); }
    (selectedNode.sonic_dna?.instrument_credits || []).forEach(credit => {
      if (!credit.make && !credit.model) return;
      const gv = [credit.make, credit.model].filter(Boolean).join(' ');
      countFor(`gear:${gv}`, n => (n.sonic_dna?.instrument_credits || []).some(c => [c.make, c.model].filter(Boolean).join(' ') === gv));
    });
    return counts;
  }, [selectedNode, allNodes]);

  const nonAdjacentFilters = useMemo(
    () => [...activeFilters.entries()].filter(([key]) => key !== 'nearby:adjacent'),
    [activeFilters]
  );

  const matchedSongs = useMemo(() => {
    if (!selectedNode || nonAdjacentFilters.length === 0) return [];
    const sets = nonAdjacentFilters.map(([, filter]) => computeMatches(filter, selectedNode, allNodes, allLinks));
    let resultIds;
    if (combineMode === 'intersection') {
      resultIds = sets.reduce((acc, s) => { if (!acc) return new Set(s); return new Set([...acc].filter(id => s.has(id))); }, null) || new Set();
    } else {
      resultIds = new Set();
      sets.forEach(s => s.forEach(id => resultIds.add(id)));
    }
    return allNodes.filter(n => resultIds.has(n.id));
  }, [nonAdjacentFilters, combineMode, selectedNode, allNodes, allLinks]);

  if (!selectedNode) return null;

  const accentColor = selectedNode.visual_dna?.primary_color || '#6BCB77';
  const accentRgb = (() => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accentColor);
    if (!r) return '107, 203, 119';
    const rv = parseInt(r[1], 16), gv = parseInt(r[2], 16), bv = parseInt(r[3], 16);
    const brightness = (rv * 299 + gv * 587 + bv * 114) / 1000;
    return brightness < 60 ? '255, 255, 255' : `${rv}, ${gv}, ${bv}`;
  })();

  const toggleSection = (key) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const totalConnectionCount = Object.values(directConnections).reduce((sum, arr) => sum + arr.length, 0);

  const getFilterLabel = (key, filter) => {
    if (filter.type === 'nearby_adjacent') return 'Adjacent Songs';
    if (filter.type === 'cluster') return 'Same Cluster';
    if (filter.type === 'connection') return filter.value?.replace(/_/g, ' ');
    if (filter.type === 'bpm') return `~${filter.value} BPM`;
    if (filter.type === 'gear') return filter.value;
    return filter.value !== undefined ? String(filter.value) : filter.type;
  };

  const hasPeopleAndPlaces = selectedNode.genetic_dna?.label ||
    selectedNode.genetic_dna?.studio ||
    selectedNode.genetic_dna?.producer ||
    (selectedNode.genetic_dna?.songwriter || []).length > 0 ||
    selectedNode.genetic_dna?.mixing_engineer;

  const panelShell = {
    backgroundColor: PANEL_BG,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    boxShadow: '0 12px 48px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
  };

  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 6, width: 380 }}>

      {/* ── RESULTS / ACTIVE FILTERS CARD ── */}
      {nonAdjacentFilters.length > 0 && (
        <div style={{ ...panelShell, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...groove }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD, fontWeight: 500 }}>Active Filters</span>
              {nonAdjacentFilters.length > 1 && (
                <button
                  onClick={onToggleCombineMode}
                  style={{ fontFamily: MONO, fontSize: 9, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {combineMode === 'intersection' ? 'ALL' : 'ANY'}
                </button>
              )}
            </div>
            <button
              onClick={onClearFilters}
              style={{ fontFamily: MONO, fontSize: 9, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
            >
              CLEAR
            </button>
          </div>
          <div style={{ padding: '8px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {nonAdjacentFilters.map(([key, filter]) => (
              <span key={key} onClick={() => onToggleFilter(key, filter)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.01em',
                padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                backgroundColor: `rgba(${accentRgb}, 0.1)`,
                border: `1px solid rgba(${accentRgb}, 0.25)`,
                color: `rgba(${accentRgb}, 0.8)`,
              }}>
                {getFilterLabel(key, filter)}
                <span style={{ opacity: 0.5, fontFamily: 'sans-serif' }}>×</span>
              </span>
            ))}
          </div>
          {matchedSongs.length > 0 && (
            <div style={{ padding: '0 14px 10px', fontFamily: MONO, fontSize: 10, color: `rgba(${accentRgb}, 0.4)` }}>
              {matchedSongs.length} song{matchedSongs.length !== 1 ? 's' : ''} highlighted
            </div>
          )}
        </div>
      )}

      {/* ── MAIN PANEL ── */}
      <div style={{ ...panelShell, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '60vh' }}>

        {/* Folder tab header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 14px', paddingTop: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
            {[['adjacent', 'Adjacent'], ['explore', 'Explore']].map(([tab, label]) => {
              const isActive = activeTab === tab;
              return (
                <button key={tab} onClick={() => onTabChange(tab)} style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em',
                  padding: '6px 14px 5px', cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  border: isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
                  borderBottom: isActive ? `1px solid ${PANEL_BG}` : '1px solid rgba(255,255,255,0.04)',
                  backgroundColor: isActive ? PANEL_BG : 'rgba(255,255,255,0.02)',
                  color: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
                  fontWeight: isActive ? 500 : 400,
                  marginBottom: isActive ? -1 : 0,
                }}>
                  {label}
                  {tab === 'adjacent' && nearbySongs.length > 0 && <span style={{ marginLeft: 5, opacity: 0.5, fontSize: 8 }}>{nearbySongs.length}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 5 }}>
            {onCompare && (
              <button
                onClick={() => onCompare(selectedNode)}
                style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.02em', padding: '4px 12px', cursor: 'pointer', borderRadius: 8, backgroundColor: 'transparent', border: '1px dashed rgba(74,158,232,0.3)', color: 'rgba(74,158,232,0.6)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(74,158,232,0.6)'; e.currentTarget.style.color = 'rgba(74,158,232,0.9)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(74,158,232,0.3)'; e.currentTarget.style.color = 'rgba(74,158,232,0.6)'; }}
              >
                Compare
              </button>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              style={{ fontFamily: MONO, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', lineHeight: 1, width: 16 }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
            >
              {collapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {/* ── Persistent cluster badge ── */}
        {clusterInfo && (
          <button
            onClick={() => {
              onTabChange('explore');
              setExpandedSections(prev => new Set([...prev, 'cluster']));
            }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: clusterInfo.meta?.color
                ? `linear-gradient(90deg, ${clusterInfo.meta.color}12 0%, transparent 60%)`
                : 'rgba(255,255,255,0.01)',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              backgroundColor: clusterInfo.meta?.color || 'rgba(255,255,255,0.3)',
              boxShadow: clusterInfo.meta?.color ? `0 0 6px ${clusterInfo.meta.color}88` : 'none',
            }} />
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.03em', color: clusterInfo.meta?.color ? `${clusterInfo.meta.color}cc` : 'rgba(255,255,255,0.45)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {clusterInfo.meta?.label || `Cluster ${selectedNode.cluster_id}`}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
              {clusterInfo.songs.length + 1} songs →
            </span>
          </button>
        )}

        {!collapsed && (
          <div style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>

            {/* ── ADJACENT TAB ── */}
            {activeTab === 'adjacent' && (
              <div style={{ padding: '8px 10px' }}>
                {nearbySongs.length === 0 ? (
                  <p style={{ fontFamily: SERIF, fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '20px 0' }}>
                    No spatial data available
                  </p>
                ) : nearbySongs.map((song, idx) => {
                  const songAccent = song.visual_dna?.primary_color || '#ffffff';
                  return (
                    <button key={song.id} onClick={() => onNavigate(song)} style={{
                      width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 8px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: idx < nearbySongs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {song.img ? (
                        <img src={song.img} alt="" style={{ flexShrink: 0, width: 38, height: 38, objectFit: 'cover', boxShadow: `2px 3px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)` }} />
                      ) : (
                        <div style={{ flexShrink: 0, width: 38, height: 38, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, color: 'rgba(255,255,255,0.1)' }}>♪</span>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: `${songAccent}88`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, marginBottom: 5 }}>{song.artist}</div>
                        {song.sharedAttrs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {song.sharedAttrs.map((attr, i) => (
                              <span key={i} onClick={e => { e.stopPropagation(); onToggleFilter(`${attr.type}:${attr.value}`, { type: attr.type, value: attr.value }); }} style={{
                                fontFamily: MONO, fontSize: 9,
                                padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
                                backgroundColor: activeFilters.has(`${attr.type}:${attr.value}`) ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
                              }}>
                                {attr.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── EXPLORE TAB ── */}
            {activeTab === 'explore' && <>

            {/* CLUSTER */}
            {clusterInfo && (
              <div style={groove}>
                {/* Custom cluster header with color dot */}
                <button
                  onClick={() => toggleSection('cluster')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: clusterInfo.meta?.color || 'rgba(255,255,255,0.3)',
                      boxShadow: clusterInfo.meta?.color ? `0 0 6px ${clusterInfo.meta.color}88` : 'none',
                    }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', color: clusterInfo.meta?.color ? `${clusterInfo.meta.color}cc` : GOLD, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, fontWeight: 500 }}>
                      {clusterInfo.meta?.label || `Cluster ${selectedNode.cluster_id}`}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                      [{clusterInfo.songs.length}]
                    </span>
                    <div style={{ flex: 1, height: 1, background: clusterInfo.meta?.color ? `linear-gradient(to right, ${clusterInfo.meta.color}30, transparent)` : `linear-gradient(to right, ${GOLD_DIM}, transparent)`, minWidth: 0 }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(255,255,255,0.2)', marginLeft: 8, flexShrink: 0 }}>
                    {expandedSections.has('cluster') ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.has('cluster') && (
                  <div style={{ padding: '0 12px 12px' }}>
                    <button
                      onClick={() => onToggleFilter('cluster:current', { type: 'cluster', value: selectedNode.cluster_id })}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        fontFamily: MONO, fontSize: 10,
                        padding: '6px 10px', marginBottom: 8, cursor: 'pointer', borderRadius: 8,
                        backgroundColor: activeFilters.has('cluster:current') ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: activeFilters.has('cluster:current') ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.08)',
                        color: activeFilters.has('cluster:current') ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
                      }}
                    >
                      {activeFilters.has('cluster:current') ? `✓ Showing all ${clusterInfo.songs.length} on graph` : `Show all ${clusterInfo.songs.length} songs on graph →`}
                    </button>
                    <div style={{ maxHeight: 160, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
                      {clusterInfo.songs.map((song, idx) => (
                        <button key={song.id} onClick={() => onNavigate(song)} style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 4px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: idx < clusterInfo.songs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                        }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {song.img ? (
                            <img src={song.img} alt="" style={{ width: 24, height: 24, objectFit: 'cover', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }} />
                          ) : (
                            <div style={{ width: 24, height: 24, flexShrink: 0, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DIRECT CONNECTIONS */}
            {totalConnectionCount > 0 && (
              <div style={groove}>
                <SectionHeader title="Direct Connections" count={totalConnectionCount} sectionKey="connections" expanded={expandedSections.has('connections')} onToggle={toggleSection} />
                {expandedSections.has('connections') && (
                  <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {Object.entries(directConnections).map(([linkType, items]) => {
                      const cfg = LINK_TYPE_CONFIG[linkType] || { label: linkType, color: '#888', icon: '·' };
                      const filterKey = `connection:${linkType}`;
                      const isActive = activeFilters.has(filterKey);
                      return (
                        <div key={linkType}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: cfg.color, fontSize: 12 }}>{cfg.icon}</span>
                              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                            </div>
                            <button onClick={() => onToggleFilter(filterKey, { type: 'connection', value: linkType })} style={{
                              fontFamily: MONO, fontSize: 10, padding: '3px 10px', cursor: 'pointer', borderRadius: 8,
                              backgroundColor: isActive ? `${cfg.color}18` : 'transparent',
                              border: isActive ? `1px solid ${cfg.color}55` : '1px solid rgba(255,255,255,0.08)',
                              color: isActive ? cfg.color : 'rgba(255,255,255,0.28)',
                            }}>
                              {isActive ? `✓ ${items.length} shown` : `Show ${items.length} →`}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {items.map(({ link, otherNode }, i) => (
                              <div key={i} style={{ padding: '8px 10px', backgroundColor: `${cfg.color}07`, borderLeft: `2px solid ${cfg.color}55`, borderTop: `1px solid ${cfg.color}15`, borderRight: `1px solid ${cfg.color}15`, borderBottom: `1px solid ${cfg.color}15` }}>
                                {otherNode && (
                                  <button onClick={() => onNavigate(otherNode)} style={{ textAlign: 'left', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: link.reason ? 4 : 0 }}>
                                    <span style={{ fontFamily: SERIF, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{otherNode.name}</span>
                                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>{otherNode.artist}</span>
                                  </button>
                                )}
                                {link.reason && <p style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.32)', lineHeight: 1.5, margin: 0 }}>{link.reason}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* FILTER BY ATTRIBUTE */}
            <div>
              <SectionHeader title="Filter by Attribute" count={0} sectionKey="attributes" expanded={expandedSections.has('attributes')} onToggle={toggleSection} />
              {expandedSections.has('attributes') && (
                <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* ── Hardware sonic channel strip ── */}
                  <SonicStrip
                    node={selectedNode}
                    activeFilters={activeFilters}
                    attrCounts={attrCounts}
                    onToggleFilter={onToggleFilter}
                  />

                  {/* Moods */}
                  {(selectedNode.semantic_dna?.mood || []).length > 0 && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, color: CHIP_COLORS.mood.text, marginBottom: 7 }}>Mood</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {selectedNode.semantic_dna.mood.map(m => (
                          <Chip key={m} type="mood" value={m} count={attrCounts[`mood:${m}`] ?? 0} colors={CHIP_COLORS.mood} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Themes */}
                  {(selectedNode.semantic_dna?.themes || []).length > 0 && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, color: CHIP_COLORS.theme.text, marginBottom: 7 }}>Themes</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {selectedNode.semantic_dna.themes.map(t => (
                          <Chip key={t} type="theme" value={t} label={`#${t}`} count={attrCounts[`theme:${t}`] ?? 0} colors={CHIP_COLORS.theme} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Instruments */}
                  {(selectedNode.sonic_dna?.prominent_instruments || []).length > 0 && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, color: CHIP_COLORS.instr.text, marginBottom: 7 }}>Instruments</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {selectedNode.sonic_dna.prominent_instruments.map(i => (
                          <Chip key={i} type="instrument" value={i} count={attrCounts[`instrument:${i}`] ?? 0} colors={CHIP_COLORS.instr} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gear — only interesting credits (have make or model) */}
                  {(selectedNode.sonic_dna?.instrument_credits || []).some(c => c.make || c.model) && (() => {
                    const interesting = (selectedNode.sonic_dna.instrument_credits || []).filter(c => c.make || c.model);
                    return (
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, color: CHIP_COLORS.instr.text, marginBottom: 7, opacity: 0.7 }}>Gear</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {interesting.map((credit, i) => {
                            const gv = [credit.make, credit.model].filter(Boolean).join(' ');
                            const label = credit.player ? `${gv} · ${credit.player}` : gv;
                            return (
                              <Chip
                                key={i}
                                type="gear"
                                value={gv}
                                label={label}
                                count={attrCounts[`gear:${gv}`] ?? 0}
                                colors={CHIP_COLORS.instr}
                                activeFilters={activeFilters}
                                onToggleFilter={onToggleFilter}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* People & Places */}
                  {hasPeopleAndPlaces && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, color: CHIP_COLORS.people.text, marginBottom: 7 }}>People & Places</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {selectedNode.genetic_dna?.producer && (
                          <Chip type="producer" value={selectedNode.genetic_dna.producer} label={`◉ ${selectedNode.genetic_dna.producer}`} count={attrCounts[`producer:${selectedNode.genetic_dna.producer}`] ?? 0} colors={CHIP_COLORS.people} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        )}
                        {(selectedNode.genetic_dna?.songwriter || []).map(sw => (
                          <Chip key={sw} type="songwriter" value={sw} label={`✎ ${sw}`} count={attrCounts[`songwriter:${sw}`] ?? 0} colors={CHIP_COLORS.people} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        ))}
                        {selectedNode.genetic_dna?.label && (
                          <Chip type="label" value={selectedNode.genetic_dna.label} label={`◎ ${selectedNode.genetic_dna.label}`} count={attrCounts[`label:${selectedNode.genetic_dna.label}`] ?? 0} colors={CHIP_COLORS.people} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        )}
                        {selectedNode.genetic_dna?.studio && (
                          <Chip type="studio" value={selectedNode.genetic_dna.studio} label={`⌂ ${selectedNode.genetic_dna.studio}`} count={attrCounts[`studio:${selectedNode.genetic_dna.studio}`] ?? 0} colors={CHIP_COLORS.people} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        )}
                        {selectedNode.genetic_dna?.mixing_engineer && (
                          <Chip type="mixing_engineer" value={selectedNode.genetic_dna.mixing_engineer} count={attrCounts[`mixing_engineer:${selectedNode.genetic_dna.mixing_engineer}`] ?? 0} colors={CHIP_COLORS.people} activeFilters={activeFilters} onToggleFilter={onToggleFilter} />
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            </>}
          </div>
        )}

      </div>
    </div>
  );
};

export default ExplorePanel;
