import { useState, useMemo } from 'react';

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

// Compute which nodes match a given filter relative to the selected node.
// filter = { type, value } — new Map-based format
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
        .map(n => ({
          id: n.id,
          dist: Math.sqrt((n.umap_x - selectedNode.umap_x) ** 2 + (n.umap_y - selectedNode.umap_y) ** 2),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 10)
        .forEach(d => matches.add(d.id));
      break;
    }
    case 'cluster': {
      const cid = selectedNode.cluster_id;
      if (cid === null || cid === undefined) break;
      allNodes.forEach(n => {
        if (n.id !== selId && n.cluster_id === cid) matches.add(n.id);
      });
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
      allNodes.forEach(n => {
        if (n.id !== selId && (n.semantic_dna?.mood || []).includes(value)) matches.add(n.id);
      });
      break;
    case 'theme':
      allNodes.forEach(n => {
        if (n.id !== selId && (n.semantic_dna?.themes || []).includes(value)) matches.add(n.id);
      });
      break;
    case 'instrument':
      allNodes.forEach(n => {
        if (n.id !== selId && (n.sonic_dna?.prominent_instruments || []).includes(value)) matches.add(n.id);
      });
      break;
    case 'decade':
      allNodes.forEach(n => {
        if (n.id !== selId && n.year && `${Math.floor(n.year / 10) * 10}s` === value) matches.add(n.id);
      });
      break;
    case 'key':
      allNodes.forEach(n => {
        if (n.id !== selId && n.sonic_dna?.key === value) matches.add(n.id);
      });
      break;
    case 'mode':
      allNodes.forEach(n => {
        if (n.id !== selId && n.sonic_dna?.mode === value) matches.add(n.id);
      });
      break;
    case 'bpm':
      allNodes.forEach(n => {
        if (n.id !== selId && n.sonic_dna?.bpm && Math.abs(n.sonic_dna.bpm - value) <= 5) matches.add(n.id);
      });
      break;
    case 'time_signature':
      allNodes.forEach(n => {
        if (n.id !== selId && n.sonic_dna?.time_signature === value) matches.add(n.id);
      });
      break;
    case 'vocal_type':
      allNodes.forEach(n => {
        if (n.id !== selId && n.sonic_dna?.vocal_type === value) matches.add(n.id);
      });
      break;
    case 'rhythm_feel':
      allNodes.forEach(n => {
        if (n.id !== selId && n.sonic_dna?.rhythm_feel === value) matches.add(n.id);
      });
      break;
    case 'label':
      allNodes.forEach(n => {
        if (n.id !== selId && n.genetic_dna?.label === value) matches.add(n.id);
      });
      break;
    case 'studio':
      allNodes.forEach(n => {
        if (n.id !== selId && n.genetic_dna?.studio === value) matches.add(n.id);
      });
      break;
    case 'producer':
      allNodes.forEach(n => {
        if (n.id !== selId && n.genetic_dna?.producer === value) matches.add(n.id);
      });
      break;
    case 'songwriter':
      allNodes.forEach(n => {
        if (n.id !== selId && (n.genetic_dna?.songwriter || []).includes(value)) matches.add(n.id);
      });
      break;
    case 'mixing_engineer':
      allNodes.forEach(n => {
        if (n.id !== selId && n.genetic_dna?.mixing_engineer === value) matches.add(n.id);
      });
      break;
    case 'artist':
      allNodes.forEach(n => {
        if (n.id !== selId && n.artist === value) matches.add(n.id);
      });
      break;
    case 'nearby_adjacent': {
      // Use live rendered positions (node.x/y) so "adjacent" matches what is visually close on screen.
      // UMAP coords diverge from screen positions because charge/link forces displace nodes.
      if (selectedNode.x === undefined) break;
      const sorted = allNodes
        .filter(n => n.id !== selId && n.x !== undefined && n.y !== undefined)
        .map(n => ({
          id: n.id,
          dist: Math.sqrt((n.x - selectedNode.x) ** 2 + (n.y - selectedNode.y) ** 2),
        }))
        .sort((a, b) => a.dist - b.dist);
      if (sorted.length === 0) break;
      // Radius = distance to the 5th nearest neighbour in screen space
      const radius = sorted[Math.min(4, sorted.length - 1)].dist;
      sorted.filter(c => c.dist <= radius).slice(0, 8).forEach(c => matches.add(c.id));
      break;
    }
    default:
      break;
  }
  return matches;
}

export function getSharedAttributes(songA, songB) {
  const shared = [];
  if (songA.artist === songB.artist) {
    shared.push({ label: songA.artist, type: 'artist', value: songA.artist });
  }
  const moodsA = songA.semantic_dna?.mood || [];
  const moodsB = songB.semantic_dna?.mood || [];
  moodsA.forEach(m => {
    if (moodsB.includes(m)) shared.push({ label: m, type: 'mood', value: m });
  });
  if (songA.year && songB.year && Math.floor(songA.year / 10) === Math.floor(songB.year / 10)) {
    const decade = `${Math.floor(songA.year / 10) * 10}s`;
    shared.push({ label: decade, type: 'decade', value: decade });
  }
  if (songA.sonic_dna?.key && songA.sonic_dna.key === songB.sonic_dna?.key) {
    shared.push({ label: songA.sonic_dna.key, type: 'key', value: songA.sonic_dna.key });
  }
  const instrA = songA.sonic_dna?.prominent_instruments || [];
  const instrB = songB.sonic_dna?.prominent_instruments || [];
  instrA.forEach(i => {
    if (instrB.includes(i)) shared.push({ label: i, type: 'instrument', value: i });
  });
  const themesA = songA.semantic_dna?.themes || [];
  const themesB = songB.semantic_dna?.themes || [];
  themesA.forEach(t => {
    if (themesB.includes(t)) shared.push({ label: `#${t}`, type: 'theme', value: t });
  });
  return shared.slice(0, 5);
}

const SectionHeader = ({ title, count, sectionKey, expanded, onToggle }) => (
  <button
    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
    onClick={() => onToggle(sectionKey)}
  >
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">{title}</span>
      {count > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
        >
          {count}
        </span>
      )}
    </div>
    <span className="text-white/25 text-xs">{expanded ? '−' : '+'}</span>
  </button>
);

const ExplorePanel = ({
  selectedNode,
  allNodes,
  allLinks,
  clusters,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  combineMode,
  onToggleCombineMode,
  onNavigate,
  activeTab,
  onTabChange,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState(
    new Set(['cluster', 'attributes'])
  );

  // --- Data computations (all before conditional return) ---

  const nearbySongs = useMemo(() => {
    if (selectedNode?.x === undefined) return [];
    const sorted = allNodes
      .filter(n => n.id !== selectedNode.id && n.x !== undefined && n.y !== undefined)
      .map(n => ({
        ...n,
        _dist: Math.sqrt((n.x - selectedNode.x) ** 2 + (n.y - selectedNode.y) ** 2),
      }))
      .sort((a, b) => a._dist - b._dist);
    if (sorted.length === 0) return [];
    // Same circle: radius = distance to 5th nearest neighbour in screen space
    const radius = sorted[Math.min(4, sorted.length - 1)]._dist;
    return sorted
      .filter(n => n._dist <= radius)
      .slice(0, 8)
      .map(n => ({ ...n, sharedAttrs: getSharedAttributes(selectedNode, n) }));
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
        ? (typeof link.target === 'object' ? link.target.id : link.target)
        : sId;
      const otherNode = allNodes.find(n => n.id === otherNodeId);
      if (!byType[link.type]) byType[link.type] = [];
      byType[link.type].push({ link, otherNode });
    });
    return byType;
  }, [selectedNode, allLinks, allNodes]);

  const attrCounts = useMemo(() => {
    if (!selectedNode) return {};
    const counts = {};
    const countFor = (key, matchFn) => {
      counts[key] = allNodes.filter(n => n.id !== selectedNode.id && matchFn(n)).length;
    };
    if (selectedNode.year) {
      const decade = `${Math.floor(selectedNode.year / 10) * 10}s`;
      countFor(`decade:${decade}`, n => n.year && Math.floor(n.year / 10) === Math.floor(selectedNode.year / 10));
    }
    if (selectedNode.sonic_dna?.key) {
      const k = selectedNode.sonic_dna.key;
      countFor(`key:${k}`, n => n.sonic_dna?.key === k);
    }
    if (selectedNode.sonic_dna?.mode) {
      const m = selectedNode.sonic_dna.mode;
      countFor(`mode:${m}`, n => n.sonic_dna?.mode === m);
    }
    if (selectedNode.sonic_dna?.bpm) {
      const bpm = selectedNode.sonic_dna.bpm;
      countFor(`bpm:${bpm}`, n => n.sonic_dna?.bpm && Math.abs(n.sonic_dna.bpm - bpm) <= 5);
    }
    if (selectedNode.sonic_dna?.time_signature) {
      const ts = selectedNode.sonic_dna.time_signature;
      countFor(`time_signature:${ts}`, n => n.sonic_dna?.time_signature === ts);
    }
    if (selectedNode.sonic_dna?.vocal_type) {
      const vt = selectedNode.sonic_dna.vocal_type;
      countFor(`vocal_type:${vt}`, n => n.sonic_dna?.vocal_type === vt);
    }
    if (selectedNode.sonic_dna?.rhythm_feel) {
      const rf = selectedNode.sonic_dna.rhythm_feel;
      countFor(`rhythm_feel:${rf}`, n => n.sonic_dna?.rhythm_feel === rf);
    }
    (selectedNode.semantic_dna?.mood || []).forEach(m => {
      countFor(`mood:${m}`, n => (n.semantic_dna?.mood || []).includes(m));
    });
    (selectedNode.semantic_dna?.themes || []).forEach(t => {
      countFor(`theme:${t}`, n => (n.semantic_dna?.themes || []).includes(t));
    });
    (selectedNode.sonic_dna?.prominent_instruments || []).forEach(i => {
      countFor(`instrument:${i}`, n => (n.sonic_dna?.prominent_instruments || []).includes(i));
    });
    if (selectedNode.genetic_dna?.label) {
      const lb = selectedNode.genetic_dna.label;
      countFor(`label:${lb}`, n => n.genetic_dna?.label === lb);
    }
    if (selectedNode.genetic_dna?.studio) {
      const st = selectedNode.genetic_dna.studio;
      countFor(`studio:${st}`, n => n.genetic_dna?.studio === st);
    }
    if (selectedNode.genetic_dna?.producer) {
      const pr = selectedNode.genetic_dna.producer;
      countFor(`producer:${pr}`, n => n.genetic_dna?.producer === pr);
    }
    (selectedNode.genetic_dna?.songwriter || []).forEach(sw => {
      countFor(`songwriter:${sw}`, n => (n.genetic_dna?.songwriter || []).includes(sw));
    });
    if (selectedNode.genetic_dna?.mixing_engineer) {
      const me = selectedNode.genetic_dna.mixing_engineer;
      countFor(`mixing_engineer:${me}`, n => n.genetic_dna?.mixing_engineer === me);
    }
    return counts;
  }, [selectedNode, allNodes]);

  // Exclude 'nearby:adjacent' from matched-songs — adjacent is shown in its own tab
  const nonAdjacentFilters = useMemo(
    () => [...activeFilters.entries()].filter(([key]) => key !== 'nearby:adjacent'),
    [activeFilters]
  );

  const matchedSongs = useMemo(() => {
    if (!selectedNode || nonAdjacentFilters.length === 0) return [];
    const sets = nonAdjacentFilters.map(([, filter]) =>
      computeMatches(filter, selectedNode, allNodes, allLinks)
    );
    let resultIds;
    if (combineMode === 'intersection') {
      resultIds = sets.reduce((acc, s) => {
        if (!acc) return new Set(s);
        return new Set([...acc].filter(id => s.has(id)));
      }, null) || new Set();
    } else {
      resultIds = new Set();
      sets.forEach(s => s.forEach(id => resultIds.add(id)));
    }
    return allNodes.filter(n => resultIds.has(n.id));
  }, [nonAdjacentFilters, combineMode, selectedNode, allNodes, allLinks]);

  if (!selectedNode) return null;

  // Derive accent color from album art, with brightness fallback for dark colors
  const accentColor = selectedNode.visual_dna?.primary_color || '#6BCB77';
  const accentRgb = (() => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accentColor);
    if (!r) return '107, 203, 119';
    const rv = parseInt(r[1], 16), gv = parseInt(r[2], 16), bv = parseInt(r[3], 16);
    const brightness = (rv * 299 + gv * 587 + bv * 114) / 1000;
    return brightness < 60 ? '255, 255, 255' : `${rv}, ${gv}, ${bv}`;
  })();

  // Category colors for attribute chips
  const CHIP_COLORS = {
    sonic:   { base: '#4A9EE8', bg: 'rgba(74,158,232,0.1)',  border: 'rgba(74,158,232,0.25)',  text: 'rgba(74,158,232,0.85)'  },
    mood:    { base: '#E84A6A', bg: 'rgba(232,74,106,0.1)',  border: 'rgba(232,74,106,0.25)',  text: 'rgba(232,74,106,0.85)'  },
    theme:   { base: '#E8C94A', bg: 'rgba(232,201,74,0.1)',  border: 'rgba(232,201,74,0.25)',  text: 'rgba(232,201,74,0.85)'  },
    instr:   { base: '#4AE8D4', bg: 'rgba(74,232,212,0.1)',  border: 'rgba(74,232,212,0.25)',  text: 'rgba(74,232,212,0.85)'  },
    people:  { base: '#B84AE8', bg: 'rgba(184,74,232,0.1)',  border: 'rgba(184,74,232,0.25)',  text: 'rgba(184,74,232,0.85)'  },
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalConnectionCount = Object.values(directConnections).reduce((sum, arr) => sum + arr.length, 0);

  // Returns a human-readable label for an active filter entry
  const getFilterLabel = (key, filter) => {
    if (filter.type === 'nearby_adjacent') return 'Adjacent Songs';
    if (filter.type === 'cluster') return 'Same Cluster';
    if (filter.type === 'connection') return filter.value?.replace(/_/g, ' ');
    if (filter.type === 'bpm') return `~${filter.value} BPM`;
    return filter.value !== undefined ? String(filter.value) : filter.type;
  };

  // Chip component — accepts a category color set
  const Chip = ({ type, value, label, count, colors }) => {
    const key = `${type}:${value}`;
    const isActive = activeFilters.has(key);
    const disabled = count === 0;
    const c = colors || CHIP_COLORS.sonic;
    return (
      <button
        onClick={() => !disabled && onToggleFilter(key, { type, value })}
        disabled={disabled}
        className="px-2 py-0.5 rounded text-[11px] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        style={{
          backgroundColor: isActive ? c.bg : 'rgba(255,255,255,0.03)',
          border: isActive ? `1px solid ${c.border}` : '1px solid rgba(255,255,255,0.07)',
          color: isActive ? c.text : 'rgba(255,255,255,0.45)',
        }}
      >
        {label ?? value}
        {count !== undefined && (
          <span style={{ opacity: 0.5, marginLeft: 4 }}>({count})</span>
        )}
      </button>
    );
  };

  const hasPeopleAndPlaces = selectedNode.genetic_dna?.label ||
    selectedNode.genetic_dna?.studio ||
    selectedNode.genetic_dna?.producer ||
    (selectedNode.genetic_dna?.songwriter || []).length > 0 ||
    selectedNode.genetic_dna?.mixing_engineer;

  const panelStyle = {
    backgroundColor: 'rgba(8, 8, 8, 0.92)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid rgba(${accentRgb}, 0.18)`,
    borderRadius: 12,
    boxShadow: `0 0 30px rgba(${accentRgb}, 0.08), 0 8px 32px rgba(0,0,0,0.5)`,
  };

  return (
    // Flex column anchored at bottom-left — children stack bottom-to-top, results appear above panel
    <div className="fixed bottom-4 left-4 z-30 flex flex-col gap-2" style={{ width: 400 }}>

      {/* ── RESULTS CARD (above main panel, only when non-adjacent filters active) ── */}
      {nonAdjacentFilters.length > 0 && (
        <div className="w-full rounded-xl overflow-hidden flex-shrink-0" style={panelStyle}>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: `rgba(${accentRgb}, 0.55)` }}>
                Filters
              </span>
              {nonAdjacentFilters.length > 1 && (
                <button
                  onClick={onToggleCombineMode}
                  className="text-[9px] px-1.5 py-0.5 rounded-full transition-colors hover:bg-white/10"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
                >
                  {combineMode === 'intersection' ? 'Match ALL' : 'Match ANY'}
                </button>
              )}
            </div>
            <button onClick={onClearFilters} className="text-[10px] text-white/20 hover:text-white/55 transition-colors">
              Clear all
            </button>
          </div>

          {/* Active filter chips */}
          <div className="px-4 pb-2 flex flex-wrap gap-1">
            {nonAdjacentFilters.map(([key, filter]) => (
              <span
                key={key}
                onClick={() => onToggleFilter(key, filter)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] cursor-pointer hover:opacity-75 transition-opacity"
                style={{ backgroundColor: `rgba(${accentRgb}, 0.1)`, color: `rgba(${accentRgb}, 0.85)`, border: `1px solid rgba(${accentRgb}, 0.2)` }}
              >
                {getFilterLabel(key, filter)}
                <span style={{ opacity: 0.5 }}>×</span>
              </span>
            ))}
          </div>

          {matchedSongs.length > 0 && (
            <div className="px-4 pb-2 text-[10px] font-medium" style={{ color: `rgba(${accentRgb}, 0.35)` }}>
              {matchedSongs.length} song{matchedSongs.length !== 1 ? 's' : ''} highlighted on map
            </div>
          )}
        </div>
      )}

      {/* ── MAIN EXPLORE PANEL ── */}
      <div className="w-full flex flex-col overflow-hidden" style={{ ...panelStyle, maxHeight: '60vh' }}>
        {/* Header with tabs */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: `1px solid rgba(${accentRgb}, 0.1)` }}
        >
          <div className="flex items-center gap-1">
            {[['adjacent', 'Adjacent'], ['explore', 'Explore']].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className="text-[10px] px-3 py-1 rounded-full transition-all font-medium"
                style={{
                  backgroundColor: activeTab === tab ? `rgba(${accentRgb}, 0.18)` : 'rgba(255,255,255,0.04)',
                  border: activeTab === tab ? `1px solid rgba(${accentRgb}, 0.35)` : '1px solid rgba(255,255,255,0.07)',
                  color: activeTab === tab ? `rgba(${accentRgb}, 0.9)` : 'rgba(255,255,255,0.35)',
                }}
              >
                {label}
                {tab === 'adjacent' && nearbySongs.length > 0 && (
                  <span className="ml-1.5 text-[9px] opacity-60">{nearbySongs.length}</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-white/25 hover:text-white/60 transition-colors text-base leading-none w-5 h-5 flex items-center justify-center"
          >
            {collapsed ? '+' : '−'}
          </button>
        </div>

        {!collapsed && (
          <div
            className="overflow-y-auto flex-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.07) transparent' }}
          >

            {/* ── ADJACENT TAB ── */}
            {activeTab === 'adjacent' && (
              <div className="px-3 py-2 space-y-0.5">
                {nearbySongs.length === 0 ? (
                  <p className="text-[11px] text-white/25 italic px-2 py-4 text-center">No spatial data available</p>
                ) : nearbySongs.map(song => {
                  const songAccent = song.visual_dna?.primary_color || '#ffffff';
                  return (
                    <button
                      key={song.id}
                      onClick={() => onNavigate(song)}
                      className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                      style={{ borderLeft: `2px solid ${songAccent}30` }}
                    >
                      {song.img && (
                        <img src={song.img} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 mt-0.5"
                          style={{ boxShadow: `0 0 6px ${songAccent}55` }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-white/85 truncate font-medium">{song.name}</div>
                        <div className="text-[10px] truncate mb-1.5" style={{ color: `${songAccent}99` }}>{song.artist}</div>
                        {song.sharedAttrs.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {song.sharedAttrs.map((attr, i) => (
                              <span
                                key={i}
                                onClick={e => {
                                  e.stopPropagation();
                                  onToggleFilter(`${attr.type}:${attr.value}`, { type: attr.type, value: attr.value });
                                }}
                                className="px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-all hover:bg-white/10"
                                style={{
                                  backgroundColor: activeFilters.has(`${attr.type}:${attr.value}`) ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                                  color: 'rgba(255,255,255,0.45)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                }}
                              >
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

            {/* ── SECTION 1: SAME CLUSTER ── */}
            {clusterInfo && (
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <SectionHeader
                  title={clusterInfo.meta?.label ? `Cluster: ${clusterInfo.meta.label}` : 'Same Cluster'}
                  count={clusterInfo.songs.length}
                  sectionKey="cluster"
                  expanded={expandedSections.has('cluster')}
                  onToggle={toggleSection}
                />
                {expandedSections.has('cluster') && (
                  <div className="px-3 pb-3">
                    <button
                      onClick={() => onToggleFilter('cluster:current', { type: 'cluster', value: selectedNode.cluster_id })}
                      className="mb-2 w-full text-left px-2 py-1.5 rounded-md text-[10px] transition-colors hover:bg-white/5"
                      style={{
                        color: activeFilters.has('cluster:current') ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)',
                        border: activeFilters.has('cluster:current')
                          ? '1px solid rgba(255,255,255,0.18)'
                          : '1px solid rgba(255,255,255,0.06)',
                        backgroundColor: activeFilters.has('cluster:current') ? 'rgba(255,255,255,0.05)' : 'transparent',
                      }}
                    >
                      {activeFilters.has('cluster:current')
                        ? `Showing all ${clusterInfo.songs.length} on graph ✓`
                        : `Show all ${clusterInfo.songs.length} songs on graph →`}
                    </button>
                    <div
                      className="space-y-0.5 max-h-44 overflow-y-auto pr-1"
                      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.07) transparent' }}
                    >
                      {clusterInfo.songs.map(song => (
                        <button
                          key={song.id}
                          onClick={() => onNavigate(song)}
                          className="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition-colors text-left"
                        >
                          {song.img && (
                            <img src={song.img} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-white/70 truncate">{song.name}</div>
                            <div className="text-[9px] text-white/30 truncate">{song.artist}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION 3: DIRECT CONNECTIONS ── */}
            {totalConnectionCount > 0 && (
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <SectionHeader
                  title="Direct Connections"
                  count={totalConnectionCount}
                  sectionKey="connections"
                  expanded={expandedSections.has('connections')}
                  onToggle={toggleSection}
                />
                {expandedSections.has('connections') && (
                  <div className="px-3 pb-3 space-y-4">
                    {Object.entries(directConnections).map(([linkType, items]) => {
                      const cfg = LINK_TYPE_CONFIG[linkType] || { label: linkType, color: '#888', icon: '·' };
                      const filterKey = `connection:${linkType}`;
                      const isActive = activeFilters.has(filterKey);
                      return (
                        <div key={linkType}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: cfg.color, fontSize: 13 }}>{cfg.icon}</span>
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                            </div>
                            <button
                              onClick={() => onToggleFilter(filterKey, { type: 'connection', value: linkType })}
                              className="text-[9px] px-2 py-0.5 rounded-full transition-colors"
                              style={{
                                backgroundColor: isActive ? `${cfg.color}22` : 'rgba(255,255,255,0.04)',
                                border: isActive ? `1px solid ${cfg.color}55` : '1px solid rgba(255,255,255,0.08)',
                                color: isActive ? cfg.color : 'rgba(255,255,255,0.3)',
                              }}
                            >
                              {isActive ? `Showing ${items.length} ✓` : `Show ${items.length} on graph →`}
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {items.map(({ link, otherNode }, i) => (
                              <div
                                key={i}
                                className="px-3 py-2 rounded-lg"
                                style={{
                                  backgroundColor: `${cfg.color}09`,
                                  border: `1px solid ${cfg.color}18`,
                                }}
                              >
                                {otherNode && (
                                  <button
                                    onClick={() => onNavigate(otherNode)}
                                    className="text-left w-full group mb-0.5"
                                  >
                                    <span className="text-[12px] text-white/80 font-medium group-hover:text-white/95 transition-colors">
                                      {otherNode.name}
                                    </span>
                                    <span className="text-[11px] text-white/35 ml-1">
                                      — {otherNode.artist}
                                    </span>
                                  </button>
                                )}
                                {link.reason && (
                                  <p className="text-[10px] text-white/30 leading-relaxed mt-0.5">{link.reason}</p>
                                )}
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

            {/* ── SECTION 4: FILTER BY ATTRIBUTE ── */}
            <div>
              <SectionHeader
                title="Filter by Attribute"
                count={0}
                sectionKey="attributes"
                expanded={expandedSections.has('attributes')}
                onToggle={toggleSection}
              />
              {expandedSections.has('attributes') && (
                <div className="px-4 pb-4 space-y-4">

                  {/* Sonic */}
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] mb-2 font-bold" style={{ color: CHIP_COLORS.sonic.text }}>
                      Sonic
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNode.year && (() => {
                        const decade = `${Math.floor(selectedNode.year / 10) * 10}s`;
                        return <Chip key="decade" type="decade" value={decade} count={attrCounts[`decade:${decade}`] ?? 0} colors={CHIP_COLORS.sonic} />;
                      })()}
                      {selectedNode.sonic_dna?.key && (
                        <Chip type="key" value={selectedNode.sonic_dna.key} count={attrCounts[`key:${selectedNode.sonic_dna.key}`] ?? 0} colors={CHIP_COLORS.sonic} />
                      )}
                      {selectedNode.sonic_dna?.mode && (
                        <Chip type="mode" value={selectedNode.sonic_dna.mode} count={attrCounts[`mode:${selectedNode.sonic_dna.mode}`] ?? 0} colors={CHIP_COLORS.sonic} />
                      )}
                      {selectedNode.sonic_dna?.bpm && (
                        <Chip type="bpm" value={selectedNode.sonic_dna.bpm} label={`~${selectedNode.sonic_dna.bpm} BPM`} count={attrCounts[`bpm:${selectedNode.sonic_dna.bpm}`] ?? 0} colors={CHIP_COLORS.sonic} />
                      )}
                      {selectedNode.sonic_dna?.time_signature && (
                        <Chip type="time_signature" value={selectedNode.sonic_dna.time_signature} label={`${selectedNode.sonic_dna.time_signature} time`} count={attrCounts[`time_signature:${selectedNode.sonic_dna.time_signature}`] ?? 0} colors={CHIP_COLORS.sonic} />
                      )}
                      {selectedNode.sonic_dna?.vocal_type && (
                        <Chip type="vocal_type" value={selectedNode.sonic_dna.vocal_type} count={attrCounts[`vocal_type:${selectedNode.sonic_dna.vocal_type}`] ?? 0} colors={CHIP_COLORS.sonic} />
                      )}
                      {selectedNode.sonic_dna?.rhythm_feel && (
                        <Chip type="rhythm_feel" value={selectedNode.sonic_dna.rhythm_feel} count={attrCounts[`rhythm_feel:${selectedNode.sonic_dna.rhythm_feel}`] ?? 0} colors={CHIP_COLORS.sonic} />
                      )}
                    </div>
                  </div>

                  {/* Moods */}
                  {(selectedNode.semantic_dna?.mood || []).length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.2em] mb-2 font-bold" style={{ color: CHIP_COLORS.mood.text }}>
                        Moods
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.semantic_dna.mood.map(m => (
                          <Chip key={m} type="mood" value={m} count={attrCounts[`mood:${m}`] ?? 0} colors={CHIP_COLORS.mood} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Themes */}
                  {(selectedNode.semantic_dna?.themes || []).length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.2em] mb-2 font-bold" style={{ color: CHIP_COLORS.theme.text }}>
                        Themes
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.semantic_dna.themes.map(t => (
                          <Chip key={t} type="theme" value={t} label={`#${t}`} count={attrCounts[`theme:${t}`] ?? 0} colors={CHIP_COLORS.theme} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Instruments */}
                  {(selectedNode.sonic_dna?.prominent_instruments || []).length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.2em] mb-2 font-bold" style={{ color: CHIP_COLORS.instr.text }}>
                        Instruments
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.sonic_dna.prominent_instruments.map(i => (
                          <Chip key={i} type="instrument" value={i} count={attrCounts[`instrument:${i}`] ?? 0} colors={CHIP_COLORS.instr} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* People & Places */}
                  {hasPeopleAndPlaces && (
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.2em] mb-2 font-bold" style={{ color: CHIP_COLORS.people.text }}>
                        People & Places
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.genetic_dna?.producer && (
                          <Chip type="producer" value={selectedNode.genetic_dna.producer} label={`◉ ${selectedNode.genetic_dna.producer}`} count={attrCounts[`producer:${selectedNode.genetic_dna.producer}`] ?? 0} colors={CHIP_COLORS.people} />
                        )}
                        {(selectedNode.genetic_dna?.songwriter || []).map(sw => (
                          <Chip key={sw} type="songwriter" value={sw} label={`✎ ${sw}`} count={attrCounts[`songwriter:${sw}`] ?? 0} colors={CHIP_COLORS.people} />
                        ))}
                        {selectedNode.genetic_dna?.label && (
                          <Chip type="label" value={selectedNode.genetic_dna.label} label={`◎ ${selectedNode.genetic_dna.label}`} count={attrCounts[`label:${selectedNode.genetic_dna.label}`] ?? 0} colors={CHIP_COLORS.people} />
                        )}
                        {selectedNode.genetic_dna?.studio && (
                          <Chip type="studio" value={selectedNode.genetic_dna.studio} label={`⌂ ${selectedNode.genetic_dna.studio}`} count={attrCounts[`studio:${selectedNode.genetic_dna.studio}`] ?? 0} colors={CHIP_COLORS.people} />
                        )}
                        {selectedNode.genetic_dna?.mixing_engineer && (
                          <Chip type="mixing_engineer" value={selectedNode.genetic_dna.mixing_engineer} count={attrCounts[`mixing_engineer:${selectedNode.genetic_dna.mixing_engineer}`] ?? 0} colors={CHIP_COLORS.people} />
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
