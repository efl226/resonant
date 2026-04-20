import { useState, useRef, useEffect } from 'react';

export const COLOR_A = '#4A9EE8';
export const COLOR_B = '#E8724A';

const LINK_LABELS = {
  samples: 'Samples',
  shared_musician: 'Shared Musician',
  same_producer: 'Same Producer',
  same_songwriter: 'Same Songwriter',
  same_label: 'Same Label',
  same_studio: 'Same Studio',
  shared_instruments: 'Shared Instruments',
  harmonic_bridge: 'Harmonic Bridge',
};

const LINK_COLORS = {
  samples: '#E8724A',
  shared_musician: '#6BCB77',
  same_producer: '#B84AE8',
  same_songwriter: '#D44AE8',
  same_label: '#8B9FE8',
  same_studio: '#9B72CF',
  shared_instruments: '#4AE8D4',
  harmonic_bridge: '#E8C94A',
};

// Inject Google Fonts once
function useDesignFonts() {
  useEffect(() => {
    if (document.querySelector('[data-resonant-compare-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap';
    link.setAttribute('data-resonant-compare-fonts', '1');
    document.head.appendChild(link);
  }, []);
}

// Inject animation keyframes once
const PANEL_ANIM_ID = 'resonant-compare-anim';
function useAnimStyles() {
  useEffect(() => {
    if (document.getElementById(PANEL_ANIM_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_ANIM_ID;
    style.textContent = `
      @keyframes compareRise {
        from { opacity: 0; transform: translateY(18px) scale(0.985); }
        to   { opacity: 1; transform: translateY(0)    scale(1); }
      }
      @keyframes compareFadeRow {
        from { opacity: 0; transform: translateX(-6px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);
}

// ── Logic (unchanged) ────────────────────────────────────────────────────────

function computeComparison(nodeA, nodeB, allLinks) {
  const compareArr = (a, b) => {
    const setA = new Set(a || []);
    const setB = new Set(b || []);
    return {
      shared: [...setA].filter(x => setB.has(x)),
      onlyA: [...setA].filter(x => !setB.has(x)),
      onlyB: [...setB].filter(x => !setA.has(x)),
    };
  };

  const bpmA = nodeA.sonic_dna?.bpm;
  const bpmB = nodeB.sonic_dna?.bpm;
  const bpmClose = bpmA && bpmB && Math.abs(bpmA - bpmB) <= 10;
  const s = v => v ?? null;

  const sonicRows = [
    { key: 'bpm', label: 'BPM', a: bpmA ? `${bpmA}` : null, b: bpmB ? `${bpmB}` : null, match: bpmA && bpmB ? (bpmA === bpmB ? 'same' : bpmClose ? 'similar' : null) : null },
    { key: 'key', label: 'Key', a: s(nodeA.sonic_dna?.key), b: s(nodeB.sonic_dna?.key), match: nodeA.sonic_dna?.key && nodeA.sonic_dna.key === nodeB.sonic_dna?.key ? 'same' : null },
    { key: 'mode', label: 'Mode', a: s(nodeA.sonic_dna?.mode), b: s(nodeB.sonic_dna?.mode), match: nodeA.sonic_dna?.mode && nodeA.sonic_dna.mode === nodeB.sonic_dna?.mode ? 'same' : null },
    { key: 'energy', label: 'Energy', a: nodeA.sonic_dna?.energy != null ? nodeA.sonic_dna.energy.toFixed(2) : null, b: nodeB.sonic_dna?.energy != null ? nodeB.sonic_dna.energy.toFixed(2) : null, match: null },
    { key: 'ts', label: 'Time Sig', a: s(nodeA.sonic_dna?.time_signature), b: s(nodeB.sonic_dna?.time_signature), match: nodeA.sonic_dna?.time_signature && nodeA.sonic_dna.time_signature === nodeB.sonic_dna?.time_signature ? 'same' : null },
    { key: 'vocal', label: 'Vocals', a: s(nodeA.sonic_dna?.vocal_type), b: s(nodeB.sonic_dna?.vocal_type), match: nodeA.sonic_dna?.vocal_type && nodeA.sonic_dna.vocal_type === nodeB.sonic_dna?.vocal_type ? 'same' : null },
    { key: 'rhythm', label: 'Rhythm', a: s(nodeA.sonic_dna?.rhythm_feel), b: s(nodeB.sonic_dna?.rhythm_feel), match: nodeA.sonic_dna?.rhythm_feel && nodeA.sonic_dna.rhythm_feel === nodeB.sonic_dna?.rhythm_feel ? 'same' : null },
  ].filter(r => r.a || r.b);

  const dA = nodeA.genetic_dna || {};
  const dB = nodeB.genetic_dna || {};
  const peopleRows = [
    { key: 'producer', label: 'Producer', a: s(dA.producer), b: s(dB.producer), match: dA.producer && dA.producer === dB.producer ? 'same' : null },
    { key: 'label',    label: 'Label',    a: s(dA.label),    b: s(dB.label),    match: dA.label && dA.label === dB.label ? 'same' : null },
    { key: 'studio',   label: 'Studio',   a: s(dA.studio),   b: s(dB.studio),   match: dA.studio && dA.studio === dB.studio ? 'same' : null },
    { key: 'mix_eng',  label: 'Mix Eng',  a: s(dA.mixing_engineer), b: s(dB.mixing_engineer), match: dA.mixing_engineer && dA.mixing_engineer === dB.mixing_engineer ? 'same' : null },
  ].filter(r => r.a || r.b);

  const mood = compareArr(nodeA.semantic_dna?.mood, nodeB.semantic_dna?.mood);
  const themes = compareArr(nodeA.semantic_dna?.themes, nodeB.semantic_dna?.themes);
  const instruments = compareArr(nodeA.sonic_dna?.prominent_instruments, nodeB.sonic_dna?.prominent_instruments);
  const songwriter = compareArr(dA.songwriter, dB.songwriter);
  const decA = nodeA.year ? `${Math.floor(nodeA.year / 10) * 10}s` : null;
  const decB = nodeB.year ? `${Math.floor(nodeB.year / 10) * 10}s` : null;

  const directLinks = (allLinks || []).filter(link => {
    const sId = typeof link.source === 'object' ? link.source.id : link.source;
    const tId = typeof link.target === 'object' ? link.target.id : link.target;
    return (sId === nodeA.id && tId === nodeB.id) || (sId === nodeB.id && tId === nodeA.id);
  });

  return { sonicRows, mood, themes, instruments, peopleRows, songwriter, directLinks, decA, decB };
}

// ── Design tokens ────────────────────────────────────────────────────────────

const MONO = "'IBM Plex Mono', 'Courier New', monospace";
const SERIF = "'Playfair Display', Georgia, serif";
// Warm gold — like ink printed on a vinyl label
const GOLD = 'rgba(210,185,120,0.5)';
const GOLD_DIM = 'rgba(210,185,120,0.2)';

// Groove divider — two hairlines, like a pressed vinyl groove
const grooveBorder = {
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  boxShadow: '0 1px 0 rgba(0,0,0,0.6)',
};

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 20, paddingRight: 20 }}>
      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${GOLD_DIM}, transparent)` }} />
    </div>
  );
}

function MatchBadge({ match }) {
  if (!match) {
    return (
      <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.05em' }}>
        vs
      </span>
    );
  }
  const isSame = match === 'same';
  return (
    <span style={{
      fontFamily: MONO,
      fontSize: 8,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: isSame ? '#6BCB77' : '#E8C94A',
      border: `1px dashed ${isSame ? 'rgba(107,203,119,0.45)' : 'rgba(232,201,74,0.45)'}`,
      padding: '2px 5px',
      borderRadius: 2,
      whiteSpace: 'nowrap',
    }}>
      {isSame ? '≡ same' : '≈ near'}
    </span>
  );
}

function CompareRow({ label, a, b, match, index }) {
  if (!a && !b) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 88px 1fr',
        gap: 12,
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.035)',
        animation: `compareFadeRow 0.3s ease ${index * 0.04}s both`,
      }}
    >
      <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.02em' }}>
        {a ?? <span style={{ opacity: 0.2 }}>—</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD_DIM }}>
          {label}
        </span>
        <MatchBadge match={match} />
      </div>
      <div style={{ textAlign: 'left', fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.02em' }}>
        {b ?? <span style={{ opacity: 0.2 }}>—</span>}
      </div>
    </div>
  );
}

function Tag({ label, color }) {
  return (
    <span style={{
      fontFamily: MONO,
      fontSize: 9,
      letterSpacing: '0.06em',
      padding: '3px 8px',
      borderRadius: 3,
      backgroundColor: `${color}12`,
      color: `${color}cc`,
      border: `1px solid ${color}20`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function TagGroup({ items, color, empty }) {
  if (!items || items.length === 0) {
    return empty
      ? <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.1)', fontStyle: 'italic' }}>—</span>
      : null;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {items.map((item, i) => <Tag key={i} label={item} color={color} />)}
    </div>
  );
}

function ArraySection({ title, data, colorA, colorB }) {
  const hasContent = data.shared.length > 0 || data.onlyA.length > 0 || data.onlyB.length > 0;
  if (!hasContent) return null;
  return (
    <div style={{ paddingTop: 14, paddingBottom: 14, ...grooveBorder }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px 1fr', gap: 12, paddingLeft: 20, paddingRight: 20, alignItems: 'start' }}>
        <TagGroup items={data.onlyA} color={colorA} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {data.shared.length > 0 && (
            <>
              <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '0.2em', color: GOLD_DIM, textTransform: 'uppercase' }}>shared</span>
              <TagGroup items={data.shared} color="#6BCB77" />
            </>
          )}
        </div>
        <TagGroup items={data.onlyB} color={colorB} />
      </div>
    </div>
  );
}

function SongSlot({ node, color, side, allNodes, onSelect, onPickFromMap }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const isRight = side === 'B';

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const results = editing && query.trim().length > 0
    ? allNodes.filter(n =>
        n.name?.toLowerCase().includes(query.toLowerCase()) ||
        n.artist?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleSelect = n => { onSelect(n); setEditing(false); setQuery(''); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: isRight ? 'flex-end' : 'flex-start', minWidth: 0 }}>
      {/* Album art — like a record sleeve leaning on a surface */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexDirection: isRight ? 'row-reverse' : 'row', width: '100%' }}>
        {node.img && (
          <div style={{
            flexShrink: 0,
            transform: isRight ? 'rotate(0.7deg)' : 'rotate(-0.7deg)',
            boxShadow: isRight
              ? `3px 6px 24px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05), 0 0 20px ${color}22`
              : `-3px 6px 24px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05), 0 0 20px ${color}22`,
            transition: 'transform 0.25s ease',
          }}>
            <img
              src={node.img}
              alt=""
              style={{ width: 72, height: 72, objectFit: 'cover', display: 'block', borderRadius: 2 }}
            />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, textAlign: isRight ? 'right' : 'left' }}>
          <button
            onClick={() => setEditing(e => !e)}
            title="Click to change song"
            style={{
              fontFamily: SERIF,
              fontSize: 16,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.92)',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              textAlign: isRight ? 'right' : 'left',
              width: '100%',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.name}
          </button>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', marginTop: 4, color: `${color}aa`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.artist}
          </div>
          {node.year && (
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2, letterSpacing: '0.08em' }}>
              {node.year}
            </div>
          )}
        </div>
      </div>

      {/* "Side A / Side B" vinyl label badge */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          backgroundColor: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: `0 0 8px ${color}55`,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: '#000', lineHeight: 1 }}>{side}</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
          Side {side}
        </span>
      </div>

      {/* Inline search */}
      {editing && (
        <div style={{ width: '100%', maxWidth: 240, alignSelf: isRight ? 'flex-end' : 'flex-start' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search songs…"
              style={{
                flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4, padding: '5px 8px',
                fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.75)',
                outline: 'none', letterSpacing: '0.04em',
              }}
            />
            <button onClick={() => { setEditing(false); setQuery(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>
              ×
            </button>
          </div>
          <button
            onClick={() => { onPickFromMap(); setEditing(false); setQuery(''); }}
            style={{
              width: '100%', background: 'none',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 4, padding: '5px 10px',
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
              textAlign: 'left', marginBottom: 6,
            }}
          >
            Pick from map →
          </button>
          {results.length > 0 && (
            <div style={{ backgroundColor: 'rgba(12,10,8,0.98)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
              {results.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleSelect(n)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', background: 'none', border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {n.img && <img src={n.img} alt="" style={{ width: 24, height: 24, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 11, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{n.artist}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function ComparePanel({ nodeA, nodeB, allNodes, allLinks, onClose, onRePickA, onRePickB, onSelectA, onSelectB }) {
  useDesignFonts();
  useAnimStyles();

  const comp = computeComparison(nodeA, nodeB, allLinks);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 920,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          pointerEvents: 'auto',
          // Core panel: dark warm black, like the inside of a record crate
          backgroundColor: '#0c0a08',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          // Subtle warm gold border — like the pressed edge of a record sleeve
          border: '1px solid rgba(210,185,120,0.1)',
          borderRadius: 10,
          boxShadow: '0 32px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04)',
          animation: 'compareRise 0.38s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          flexShrink: 0,
          ...grooveBorder,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Two side dots — like Side A / Side B of a record */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLOR_A, boxShadow: `0 0 6px ${COLOR_A}88` }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLOR_B, boxShadow: `0 0 6px ${COLOR_B}88` }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: GOLD }}>
              Liner Notes
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 16, lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >
            ×
          </button>
        </div>

        {/* ── Song headers ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1fr',
          flexShrink: 0,
          ...grooveBorder,
        }}>
          <div style={{ padding: '20px 20px 20px 24px' }}>
            <SongSlot node={nodeA} color={COLOR_A} side="A" allNodes={allNodes} onSelect={onSelectA} onPickFromMap={onRePickA} />
          </div>
          {/* Spine divider */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', position: 'relative', flexShrink: 0 }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%) rotate(90deg)',
              fontFamily: MONO, fontSize: 7, letterSpacing: '0.3em',
              color: 'rgba(255,255,255,0.08)', whiteSpace: 'nowrap', textTransform: 'uppercase',
            }}>
              vs
            </div>
          </div>
          <div style={{ padding: '20px 24px 20px 20px' }}>
            <SongSlot node={nodeB} color={COLOR_B} side="B" allNodes={allNodes} onSelect={onSelectB} onPickFromMap={onRePickB} />
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin', scrollbarColor: 'rgba(210,185,120,0.1) transparent' }}>

          {/* Direct connections */}
          {comp.directLinks.length > 0 && (
            <div style={{ padding: '14px 20px', ...grooveBorder }}>
              <SectionLabel>Direct Connection</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 20, paddingRight: 20 }}>
                {comp.directLinks.map((link, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: MONO,
                      fontSize: 9, letterSpacing: '0.08em',
                      padding: '4px 10px', borderRadius: 3,
                      backgroundColor: `${LINK_COLORS[link.type] || '#fff'}15`,
                      color: LINK_COLORS[link.type] || '#fff',
                      border: `1px solid ${LINK_COLORS[link.type] || '#fff'}28`,
                    }}
                  >
                    {LINK_LABELS[link.type] || link.type}
                    {link.reason && <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>· {link.reason}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Year / decade */}
          {(nodeA.year || nodeB.year) && (
            <div style={{ paddingTop: 14, paddingBottom: 14, ...grooveBorder }}>
              <SectionLabel>Released</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px 1fr', gap: 12, paddingLeft: 20, paddingRight: 20, alignItems: 'center' }}>
                <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>
                  {nodeA.year ?? '—'}
                  {comp.decA && <span style={{ color: GOLD_DIM, marginLeft: 6, fontSize: 9 }}>({comp.decA})</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD_DIM }}>Year</span>
                  {comp.decA && comp.decA === comp.decB
                    ? <MatchBadge match="same" />
                    : <MatchBadge match={null} />
                  }
                </div>
                <div style={{ textAlign: 'left', fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>
                  {nodeB.year ?? '—'}
                  {comp.decB && <span style={{ color: GOLD_DIM, marginLeft: 6, fontSize: 9 }}>({comp.decB})</span>}
                </div>
              </div>
            </div>
          )}

          {/* Sonic DNA */}
          {comp.sonicRows.length > 0 && (
            <div style={{ paddingTop: 14, paddingBottom: 6, ...grooveBorder }}>
              <SectionLabel>Sonic DNA</SectionLabel>
              <div style={{ paddingLeft: 20, paddingRight: 20 }}>
                {comp.sonicRows.map((row, i) => (
                  <CompareRow key={row.key} label={row.label} a={row.a} b={row.b} match={row.match} index={i} />
                ))}
              </div>
            </div>
          )}

          <ArraySection title="Mood" data={comp.mood} colorA={COLOR_A} colorB={COLOR_B} />
          <ArraySection title="Themes" data={comp.themes} colorA={COLOR_A} colorB={COLOR_B} />
          <ArraySection title="Instruments" data={comp.instruments} colorA={COLOR_A} colorB={COLOR_B} />
          {(comp.songwriter.shared.length + comp.songwriter.onlyA.length + comp.songwriter.onlyB.length > 0) && (
            <ArraySection title="Songwriters" data={comp.songwriter} colorA={COLOR_A} colorB={COLOR_B} />
          )}

          {/* Credits */}
          {comp.peopleRows.length > 0 && (
            <div style={{ paddingTop: 14, paddingBottom: 14 }}>
              <SectionLabel>Credits</SectionLabel>
              <div style={{ paddingLeft: 20, paddingRight: 20 }}>
                {comp.peopleRows.map((row, i) => (
                  <CompareRow key={row.key} label={row.label} a={row.a} b={row.b} match={row.match} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
