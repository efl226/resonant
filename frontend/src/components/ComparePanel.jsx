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

  const s = (v) => v ?? null;

  const sonicRows = [
    {
      key: 'bpm', label: 'BPM',
      a: bpmA ? `${bpmA}` : null,
      b: bpmB ? `${bpmB}` : null,
      match: bpmA && bpmB ? (bpmA === bpmB ? 'same' : bpmClose ? 'similar' : null) : null,
    },
    {
      key: 'key', label: 'Key',
      a: s(nodeA.sonic_dna?.key), b: s(nodeB.sonic_dna?.key),
      match: nodeA.sonic_dna?.key && nodeA.sonic_dna.key === nodeB.sonic_dna?.key ? 'same' : null,
    },
    {
      key: 'mode', label: 'Mode',
      a: s(nodeA.sonic_dna?.mode), b: s(nodeB.sonic_dna?.mode),
      match: nodeA.sonic_dna?.mode && nodeA.sonic_dna.mode === nodeB.sonic_dna?.mode ? 'same' : null,
    },
    {
      key: 'energy', label: 'Energy',
      a: nodeA.sonic_dna?.energy != null ? nodeA.sonic_dna.energy.toFixed(2) : null,
      b: nodeB.sonic_dna?.energy != null ? nodeB.sonic_dna.energy.toFixed(2) : null,
      match: null,
    },
    {
      key: 'ts', label: 'Time Sig',
      a: s(nodeA.sonic_dna?.time_signature), b: s(nodeB.sonic_dna?.time_signature),
      match: nodeA.sonic_dna?.time_signature && nodeA.sonic_dna.time_signature === nodeB.sonic_dna?.time_signature ? 'same' : null,
    },
    {
      key: 'vocal', label: 'Vocals',
      a: s(nodeA.sonic_dna?.vocal_type), b: s(nodeB.sonic_dna?.vocal_type),
      match: nodeA.sonic_dna?.vocal_type && nodeA.sonic_dna.vocal_type === nodeB.sonic_dna?.vocal_type ? 'same' : null,
    },
    {
      key: 'rhythm', label: 'Rhythm',
      a: s(nodeA.sonic_dna?.rhythm_feel), b: s(nodeB.sonic_dna?.rhythm_feel),
      match: nodeA.sonic_dna?.rhythm_feel && nodeA.sonic_dna.rhythm_feel === nodeB.sonic_dna?.rhythm_feel ? 'same' : null,
    },
  ].filter(r => r.a || r.b);

  const dA = nodeA.genetic_dna || {};
  const dB = nodeB.genetic_dna || {};
  const peopleRows = [
    { key: 'producer', label: 'Producer', a: s(dA.producer), b: s(dB.producer), match: dA.producer && dA.producer === dB.producer ? 'same' : null },
    { key: 'label', label: 'Label', a: s(dA.label), b: s(dB.label), match: dA.label && dA.label === dB.label ? 'same' : null },
    { key: 'studio', label: 'Studio', a: s(dA.studio), b: s(dB.studio), match: dA.studio && dA.studio === dB.studio ? 'same' : null },
    { key: 'mix_eng', label: 'Mix Eng', a: s(dA.mixing_engineer), b: s(dB.mixing_engineer), match: dA.mixing_engineer && dA.mixing_engineer === dB.mixing_engineer ? 'same' : null },
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

// -- Sub-components --

function SongSlot({ node, color, side, allNodes, onSelect, onPickFromMap }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const results = editing && query.trim().length > 0
    ? allNodes.filter(n =>
        n.name?.toLowerCase().includes(query.toLowerCase()) ||
        n.artist?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleSelect = (n) => {
    onSelect(n);
    setEditing(false);
    setQuery('');
  };

  const isRight = side === 'B';

  return (
    <div className={`flex flex-col gap-2 min-w-0 ${isRight ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2.5 w-full ${isRight ? 'flex-row-reverse' : ''}`}>
        {node.img && (
          <img
            src={node.img}
            alt=""
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
            style={{ boxShadow: `0 0 20px ${color}44` }}
          />
        )}
        <div className={`flex-1 min-w-0 ${isRight ? 'text-right' : ''}`}>
          <button
            onClick={() => setEditing(e => !e)}
            className="text-[14px] font-semibold text-white/90 truncate block w-full hover:text-white transition-colors"
            style={{ textAlign: isRight ? 'right' : 'left' }}
            title="Click to change song"
          >
            {node.name}
          </button>
          <div className="text-[11px] truncate" style={{ color: `${color}bb` }}>{node.artist}</div>
          {node.year && <div className="text-[10px] text-white/25">{node.year}</div>}
        </div>
      </div>

      <span
        className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      >
        Song {side}
      </span>

      {editing && (
        <div className={`w-full max-w-[240px] ${isRight ? 'self-end' : ''}`}>
          <div className="flex items-center gap-1 mb-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search songs…"
              className="flex-1 rounded px-2 py-1 text-[11px] text-white/80 placeholder-white/25 outline-none border border-white/10 focus:border-white/25"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <button
              onClick={() => { setEditing(false); setQuery(''); }}
              className="text-white/30 hover:text-white/60 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <button
            onClick={() => { onPickFromMap(); setEditing(false); setQuery(''); }}
            className="w-full text-[10px] px-2 py-1.5 rounded-lg mb-1.5 transition-colors hover:bg-white/08 text-white/40 hover:text-white/65 border border-white/08 text-left"
          >
            Pick from map →
          </button>
          {results.length > 0 && (
            <div
              className="rounded-lg overflow-hidden border border-white/08"
              style={{ backgroundColor: 'rgba(10,10,10,0.97)' }}
            >
              {results.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleSelect(n)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/08 transition-colors text-left"
                >
                  {n.img && <img src={n.img} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white/80 truncate">{n.name}</div>
                    <div className="text-[9px] text-white/40 truncate">{n.artist}</div>
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

function MatchBadge({ match }) {
  if (!match) return <span className="text-white/15 text-[9px]">vs</span>;
  const isSame = match === 'same';
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{
        backgroundColor: isSame ? 'rgba(107,203,119,0.12)' : 'rgba(232,201,74,0.12)',
        color: isSame ? '#6BCB77' : '#E8C94A',
        border: `1px solid ${isSame ? 'rgba(107,203,119,0.25)' : 'rgba(232,201,74,0.25)'}`,
      }}
    >
      {isSame ? '= same' : '≈ similar'}
    </span>
  );
}

function CompareRow({ label, a, b, match }) {
  if (!a && !b) return null;
  return (
    <div className="grid grid-cols-[1fr_100px_1fr] gap-3 items-center py-1.5 border-b border-white/04 last:border-0">
      <div className="text-right text-[12px] text-white/70 truncate">{a ?? <span className="text-white/20">—</span>}</div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[9px] text-white/25 uppercase tracking-wider">{label}</span>
        <MatchBadge match={match} />
      </div>
      <div className="text-left text-[12px] text-white/70 truncate">{b ?? <span className="text-white/20">—</span>}</div>
    </div>
  );
}

function TagCloud({ items, color }) {
  if (!items || items.length === 0) return <div className="text-white/15 text-[10px] italic text-center py-1">—</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={i}
          className="px-2 py-0.5 rounded-full text-[10px]"
          style={{ backgroundColor: `${color}15`, color: `${color}cc`, border: `1px solid ${color}22` }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ArraySection({ title, data, colorA, colorB }) {
  const hasContent = data.shared.length > 0 || data.onlyA.length > 0 || data.onlyB.length > 0;
  if (!hasContent) return null;
  return (
    <div className="py-3 border-b border-white/05">
      <div className="text-[9px] uppercase tracking-widest text-white/25 font-bold mb-2.5 px-5">{title}</div>
      <div className="grid grid-cols-[1fr_100px_1fr] gap-3 px-5 items-start">
        <div><TagCloud items={data.onlyA} color={colorA} /></div>
        <div className="flex flex-col items-center gap-1">
          {data.shared.length > 0 && (
            <>
              <span className="text-[8px] uppercase tracking-wider text-white/20 mb-0.5">shared</span>
              <TagCloud items={data.shared} color="#6BCB77" />
            </>
          )}
        </div>
        <div><TagCloud items={data.onlyB} color={colorB} /></div>
      </div>
    </div>
  );
}

// -- Main ComparePanel component --

export default function ComparePanel({ nodeA, nodeB, allNodes, allLinks, onClose, onRePickA, onRePickB, onSelectA, onSelectB }) {
  const comp = computeComparison(nodeA, nodeB, allLinks);

  const panelBg = {
    backgroundColor: 'rgba(6, 6, 6, 0.97)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    boxShadow: '0 24px 72px rgba(0,0,0,0.75)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
      <div
        className="relative w-full pointer-events-auto flex flex-col overflow-hidden"
        style={{ ...panelBg, maxWidth: 900, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_A }} />
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_B }} />
            </div>
            <span className="text-[11px] font-semibold text-white/45 uppercase tracking-widest">Compare Songs</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/30 hover:text-white/80 hover:bg-white/10 transition-all text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Song headers */}
        <div
          className="grid grid-cols-[1fr_50px_1fr] gap-4 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <SongSlot node={nodeA} color={COLOR_A} side="A" allNodes={allNodes} onSelect={onSelectA} onPickFromMap={onRePickA} />
          <div className="flex items-center justify-center">
            <span className="text-white/10 text-2xl">⇄</span>
          </div>
          <SongSlot node={nodeB} color={COLOR_B} side="B" allNodes={allNodes} onSelect={onSelectB} onPickFromMap={onRePickB} />
        </div>

        {/* Scrollable body */}
        <div
          className="overflow-y-auto flex-1"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.07) transparent' }}
        >
          {/* Direct DB connections */}
          {comp.directLinks.length > 0 && (
            <div className="px-5 py-3 border-b border-white/05">
              <div className="text-[9px] uppercase tracking-widest text-white/25 font-bold mb-2">Direct Connection</div>
              <div className="flex flex-wrap gap-1.5">
                {comp.directLinks.map((link, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                    style={{
                      backgroundColor: `${LINK_COLORS[link.type] || '#fff'}18`,
                      color: LINK_COLORS[link.type] || '#fff',
                      border: `1px solid ${LINK_COLORS[link.type] || '#fff'}30`,
                    }}
                  >
                    <span>{LINK_LABELS[link.type] || link.type}</span>
                    {link.reason && (
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>· {link.reason}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Year / decade */}
          {(nodeA.year || nodeB.year) && (
            <div className="py-3 border-b border-white/05">
              <div className="text-[9px] uppercase tracking-widest text-white/25 font-bold mb-1.5 px-5">Released</div>
              <div className="grid grid-cols-[1fr_100px_1fr] gap-3 px-5 items-center">
                <div className="text-right text-[12px] text-white/70">
                  {nodeA.year ?? <span className="text-white/20">—</span>}
                  {comp.decA && <span className="text-white/25 text-[10px] ml-1">({comp.decA})</span>}
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-white/25 uppercase tracking-wider">Year</span>
                  {comp.decA && comp.decA === comp.decB
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color: '#6BCB77', backgroundColor: 'rgba(107,203,119,0.12)', border: '1px solid rgba(107,203,119,0.25)' }}>= same decade</span>
                    : <span className="text-white/15 text-[9px]">vs</span>
                  }
                </div>
                <div className="text-left text-[12px] text-white/70">
                  {nodeB.year ?? <span className="text-white/20">—</span>}
                  {comp.decB && <span className="text-white/25 text-[10px] ml-1">({comp.decB})</span>}
                </div>
              </div>
            </div>
          )}

          {/* Sonic DNA */}
          {comp.sonicRows.length > 0 && (
            <div className="py-3 border-b border-white/05">
              <div className="text-[9px] uppercase tracking-widest text-white/25 font-bold mb-1.5 px-5">Sonic DNA</div>
              <div className="px-5">
                {comp.sonicRows.map(row => (
                  <CompareRow key={row.key} label={row.label} a={row.a} b={row.b} match={row.match} />
                ))}
              </div>
            </div>
          )}

          {/* Mood */}
          <ArraySection title="Mood" data={comp.mood} colorA={COLOR_A} colorB={COLOR_B} />

          {/* Themes */}
          <ArraySection title="Themes" data={comp.themes} colorA={COLOR_A} colorB={COLOR_B} />

          {/* Instruments */}
          <ArraySection title="Instruments" data={comp.instruments} colorA={COLOR_A} colorB={COLOR_B} />

          {/* Songwriters */}
          {(comp.songwriter.shared.length + comp.songwriter.onlyA.length + comp.songwriter.onlyB.length > 0) && (
            <ArraySection title="Songwriters" data={comp.songwriter} colorA={COLOR_A} colorB={COLOR_B} />
          )}

          {/* Credits */}
          {comp.peopleRows.length > 0 && (
            <div className="py-3">
              <div className="text-[9px] uppercase tracking-widest text-white/25 font-bold mb-1.5 px-5">Credits</div>
              <div className="px-5">
                {comp.peopleRows.map(row => (
                  <CompareRow key={row.key} label={row.label} a={row.a} b={row.b} match={row.match} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
