import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import TimelineView from './components/TimelineView';
import PlayerBar from './components/PlayerBar';
import DiscoverPanel from './components/DiscoverPanel';
import ConnectionHint from './components/ConnectionHint';
import ExplorePanel, { computeMatches, getSharedAttributes } from './components/ExplorePanel';
import ComparePanel, { COLOR_A as COMPARE_COLOR_A, COLOR_B as COMPARE_COLOR_B } from './components/ComparePanel';
import LayoutPicker from './components/LayoutPicker';
import Graph3D from './components/Graph3D';
import { loadGraphData, loadClusterData } from './api/client';
import FALLBACK_DATA from './data/songsseed.json';
import './index.css';

const imageCache = new Map();

function getCachedImage(src) {
  if (!src) return null;
  if (imageCache.has(src)) return imageCache.get(src);
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = src;
  imageCache.set(src, img);
  return img;
}

const linkTypeColors = {
  samples: '#E8724A',
  shared_musician: '#6BCB77',
  same_producer: '#B84AE8',
  same_songwriter: '#D44AE8',
  same_label: '#8B9FE8',
  same_studio: '#9B72CF',
  shared_instruments: '#4AE8D4',
  harmonic_bridge: '#E8C94A',
  same_key_bpm: '#E8C94A',
  same_artist: '#4A9EE8',
  same_mood: '#E84A6A',
  same_feel: '#8B9FE8',
};

// Full config for ALL link types (DB links + virtual filter links)
// Used by ConnectionHint for label/color/icon
const LINK_TYPE_CONFIG = {
  // Real DB link types
  samples:            { label: 'Samples',           color: '#E8724A', icon: '⟲' },
  shared_musician:    { label: 'Shared Musician',   color: '#6BCB77', icon: '♫' },
  same_producer:      { label: 'Same Producer',     color: '#B84AE8', icon: '◉' },
  same_songwriter:    { label: 'Same Songwriter',   color: '#D44AE8', icon: '✎' },
  same_label:         { label: 'Same Label',        color: '#8B9FE8', icon: '◎' },
  same_studio:        { label: 'Same Studio',       color: '#9B72CF', icon: '⌂' },
  shared_instruments: { label: 'Shared Instruments',color: '#4AE8D4', icon: '◈' },
  harmonic_bridge:    { label: 'Harmonic Bridge',   color: '#E8C94A', icon: '♪' },
  // Virtual filter link types
  nearby_adjacent:    { label: 'Adjacent Song',     color: 'rgba(200,210,255,0.9)', icon: '◎' },
  cluster:            { label: 'Same Cluster',      color: '#8B9FE8', icon: '◈' },
  mood:               { label: 'Shares Mood',       color: '#E84A6A', icon: '♥' },
  theme:              { label: 'Shares Theme',      color: '#E8C94A', icon: '#' },
  instrument:         { label: 'Shares Instrument', color: '#4AE8D4', icon: '◈' },
  decade:             { label: 'Same Decade',       color: '#4A9EE8', icon: '◷' },
  key:                { label: 'Same Key',          color: '#4A9EE8', icon: '♩' },
  mode:               { label: 'Same Mode',         color: '#4A9EE8', icon: '♩' },
  bpm:                { label: 'Similar BPM',       color: '#4A9EE8', icon: '♩' },
  time_signature:     { label: 'Same Time Sig',     color: '#4A9EE8', icon: '♩' },
  vocal_type:         { label: 'Same Vocal Type',   color: '#4A9EE8', icon: '♩' },
  rhythm_feel:        { label: 'Same Rhythm Feel',  color: '#4A9EE8', icon: '♩' },
  label:              { label: 'Same Label',        color: '#B84AE8', icon: '◎' },
  studio:             { label: 'Same Studio',       color: '#B84AE8', icon: '⌂' },
  producer:           { label: 'Same Producer',     color: '#B84AE8', icon: '◉' },
  songwriter:         { label: 'Same Songwriter',   color: '#B84AE8', icon: '✎' },
  mixing_engineer:    { label: 'Same Mix Engineer', color: '#B84AE8', icon: '◈' },
  artist:             { label: 'Same Artist',       color: '#4A9EE8', icon: '◎' },
};

// Color-only map for ForceGraph2D link props (extracted from LINK_TYPE_CONFIG)
const FILTER_TYPE_COLORS = Object.fromEntries(
  Object.entries(LINK_TYPE_CONFIG).map(([k, v]) => [k, v.color])
);

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getVirtualLinkReason(filter) {
  switch (filter.type) {
    case 'nearby_adjacent': return 'Adjacent songs in the music map';
    case 'cluster':         return 'Same cluster';
    case 'mood':            return `Shares mood: ${filter.value}`;
    case 'theme':           return `Shares theme: ${filter.value}`;
    case 'instrument':      return `Shares instrument: ${filter.value}`;
    case 'decade':          return `Both from the ${filter.value}`;
    case 'key':             return `Both in ${filter.value}`;
    case 'mode':            return `Both ${filter.value} mode`;
    case 'bpm':             return `Similar tempo (~${filter.value} BPM ±5)`;
    case 'time_signature':  return `Both in ${filter.value} time`;
    case 'vocal_type':      return `Both have ${filter.value} vocals`;
    case 'rhythm_feel':     return `Shares ${filter.value} rhythm`;
    case 'label':           return `Both on ${filter.value}`;
    case 'studio':          return `Both recorded at ${filter.value}`;
    case 'producer':        return `Both produced by ${filter.value}`;
    case 'songwriter':      return `Both written by ${filter.value}`;
    case 'mixing_engineer': return `Both mixed by ${filter.value}`;
    case 'artist':          return `Same artist: ${filter.value}`;
    default:                return '';
  }
}

export default function App() {
  const graphRef = useRef();
  
  const [fullGraphData, setFullGraphData] = useState(FALLBACK_DATA);
  const [graphData, setGraphData] = useState(FALLBACK_DATA);
  const [clusters, setClusters] = useState([]);
  const [allClusters, setAllClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('graph');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [playerNode, setPlayerNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeFilters, setActiveFilters] = useState(new Map());
  const [combineMode, setCombineMode] = useState('intersection');
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [hoveredVirtualLink, setHoveredVirtualLink] = useState(null);
  const [activeTab, setActiveTab] = useState('adjacent');
  const [compareMode, setCompareMode] = useState(false);
  const [compareNodes, setCompareNodes] = useState([null, null]);
  const [rePickTarget, setRePickTarget] = useState(null);
  const [activeLayout, setActiveLayout] = useState('default');
  const [graphMode, setGraphMode] = useState('2d');


  useEffect(() => {
    Promise.all([loadGraphData(), loadClusterData()])
      .then(([data, clusterData]) => {
        const processedNodes = data.nodes.map(node => {
          if (node.umap_x !== null && node.umap_y !== null) {
            return {
              ...node,
              x: node.umap_x,
              y: node.umap_y,
              _targetX: node.umap_x,
              _targetY: node.umap_y,
            };
          }
          return node;
        });
        const processed = { nodes: processedNodes, links: data.links };
        setFullGraphData(processed);
        setGraphData(processed);
        setAllClusters(clusterData.clusters || []);
        setClusters(clusterData.clusters || []);
        setLoading(false);
        console.log(`[Resonant] Graph data ready. ${clusterData.clusters?.length || 0} clusters loaded`);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!graphRef.current || loading) return;
    const fg = graphRef.current;
    const umapForce = (alpha) => {
      graphData.nodes.forEach(node => {
        if (node._targetX !== undefined && node._targetY !== undefined) {
          const strength = 0.08;
          node.vx += (node._targetX - node.x) * strength * alpha;
          node.vy += (node._targetY - node.y) * strength * alpha;
        }
      });
    };
    fg.d3Force('umap', umapForce);
    const charge = fg.d3Force('charge');
    if (charge) charge.strength(-30);
    const link = fg.d3Force('link');
    if (link) link.strength(0.02);
    fg.d3Force('center', null);
    fg.d3ReheatSimulation();
  }, [loading, graphData]);

  // Keep canvas sized to window
  useEffect(() => {
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Add/remove adjacent highlight whenever the selected node or active tab changes
  useEffect(() => {
    if (!selectedNode) return;
    setActiveFilters(prev => {
      const next = new Map(prev);
      if (activeTab === 'adjacent') {
        next.set('nearby:adjacent', { type: 'nearby_adjacent' });
      } else {
        next.delete('nearby:adjacent');
      }
      return next;
    });
  }, [selectedNode?.id, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (rePickTarget) { setRePickTarget(null); return; }
        if (compareMode) {
          setCompareMode(false);
          setCompareNodes([null, null]);
          return;
        }
        if (selectedNode) { setSelectedNode(null); }
        return;
      }
      if (!selectedNode || !graphRef.current) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const directions = {
        'ArrowUp': { x: 0, y: -1 }, 'ArrowDown': { x: 0, y: 1 },
        'ArrowLeft': { x: -1, y: 0 }, 'ArrowRight': { x: 1, y: 0 },
      };
      const dir = directions[e.key];
      let bestNode = null;
      let bestScore = -Infinity;
      graphData.nodes.forEach(node => {
        if (node.id === selectedNode.id) return;
        const dx = node.x - selectedNode.x;
        const dy = node.y - selectedNode.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 1) return;
        const alignment = (dx * dir.x + dy * dir.y) / distance;
        if (alignment < 0.3) return;
        const score = alignment - (distance / 1000);
        if (score > bestScore) { bestScore = score; bestNode = node; }
      });
      if (bestNode) {
        graphRef.current.centerAt(bestNode.x, bestNode.y, 400);
        setSelectedNode(bestNode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, graphData, compareMode, rePickTarget]);

  const handleSearchResults = useCallback((resultIds) => {
    if (!resultIds || resultIds.length === 0) {
      setGraphData(fullGraphData);
      setClusters(allClusters);
      setSearchActive(false);
      setSelectedNode(null);
      if (graphRef.current) setTimeout(() => graphRef.current.zoomToFit(800), 100);
      return;
    }
    const idSet = new Set(resultIds);
    const filteredNodes = fullGraphData.nodes.filter(n => idSet.has(n.id));
    const filteredLinks = fullGraphData.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return idSet.has(sourceId) && idSet.has(targetId);
    });
    setGraphData({ nodes: filteredNodes, links: filteredLinks });
    const filteredClusters = allClusters.filter(cluster =>
      cluster.songs?.some(s => filteredNodes.some(n => n.name === s.name && n.artist === s.artist))
    );
    setClusters(filteredClusters);
    setSearchActive(true);
    setSelectedNode(null);
    if (graphRef.current) setTimeout(() => graphRef.current.zoomToFit(800, 50), 300);
  }, [fullGraphData, allClusters]);

  
  
  const handleReset = useCallback(() => {
    setGraphData(fullGraphData);
    setClusters(allClusters);
    setSearchActive(false);
    setSelectedNode(null);
    setActiveFilter(null);
    //THIS RESETS ZOOM: if (graphRef.current) setTimeout(() => graphRef.current.zoomToFit(800), 100);
  }, [fullGraphData, allClusters]);

  const filteredNodeIds = useMemo(() => {
    if (!activeFilter) return null;
    const { type, value } = activeFilter;
    return graphData.nodes
      .filter(n => {
        if (type === 'year') return Math.floor(n.year / 10) * 10 + 's' === value;
        if (type === 'producer') return n.genetic_dna?.producer === value;
        if (type === 'artist') return n.artist === value;
        if (type === 'album') return n.album === value;
        if (type === 'instrument') return n.sonic_dna?.prominent_instruments?.includes(value);
        return false;
      })
      .map(n => n.id);
  }, [activeFilter, graphData]);

  const handleToggleFilter = useCallback((key, filter) => {
    setActiveFilters(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, filter);
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveFilters(new Map());
  }, []);

  const handleToggleCombineMode = useCallback(() => {
    setCombineMode(prev => prev === 'intersection' ? 'union' : 'intersection');
  }, []);

  // Check if layout coords are available for 2D and 3D
  const hasLayouts = useMemo(
    () => fullGraphData.nodes.some(n => n.layouts?.sonic?.x != null),
    [fullGraphData.nodes]
  );
  const hasLayouts3d = useMemo(
    () => fullGraphData.nodes.some(n => n.layouts3d?.sonic?.x != null),
    [fullGraphData.nodes]
  );

  const handleChangeLayout = useCallback((layoutId) => {
    setActiveLayout(layoutId);
    setGraphData(prev => {
      const updated = prev.nodes.map(node => {
        if (graphMode === '3d') {
          const coords = node.layouts3d?.[layoutId];
          if (coords?.x != null && coords?.y != null && coords?.z != null) {
            return { ...node, _targetX: coords.x, _targetY: coords.y, _targetZ: coords.z };
          }
          return node;
        }
        // 2D mode
        if (layoutId === 'default') {
          return { ...node, _targetX: node.umap_x, _targetY: node.umap_y };
        }
        const coords = node.layouts?.[layoutId];
        if (coords?.x != null && coords?.y != null) {
          return { ...node, _targetX: coords.x, _targetY: coords.y };
        }
        return node;
      });
      return { ...prev, nodes: updated };
    });
  }, [graphMode]);

  const handleToggleGraphMode = useCallback(() => {
    const newMode = graphMode === '2d' ? '3d' : '2d';
    setGraphMode(newMode);

    if (newMode === '3d') {
      // In 3D, "default" layout doesn't exist — switch to sonic
      const initLayout = activeLayout === 'default' ? 'sonic' : activeLayout;
      setActiveLayout(initLayout);
      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => {
          const coords = node.layouts3d?.[initLayout];
          if (coords?.x != null) {
            return { ...node, _targetX: coords.x, _targetY: coords.y, _targetZ: coords.z };
          }
          return node;
        }),
      }));
    } else {
      // Return to 2D
      const layout2d = activeLayout === 'default' ? 'default' : activeLayout;
      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => {
          if (layout2d === 'default') {
            return { ...node, _targetX: node.umap_x, _targetY: node.umap_y, _targetZ: undefined };
          }
          const coords = node.layouts?.[layout2d];
          if (coords?.x != null) {
            return { ...node, _targetX: coords.x, _targetY: coords.y, _targetZ: undefined };
          }
          return node;
        }),
      }));
    }
  }, [graphMode, activeLayout]);

  const { highlightNodes, highlightLinks, filterMatchSets } = useMemo(() => {
    const nodes = new Set();
    const links = new Set();
    const matchSets = new Map(); // filterKey -> Set<nodeId>

    if (filteredNodeIds) {
      filteredNodeIds.forEach(id => nodes.add(id));
    } else if (selectedNode) {
      nodes.add(selectedNode.id);

      // Compute matches from active filters
      if (activeFilters.size > 0) {
        const filterEntries = [...activeFilters.entries()];
        const perFilterSets = filterEntries.map(([key, filter]) => {
          const s = computeMatches(filter, selectedNode, graphData.nodes, graphData.links);
          matchSets.set(key, s);

          // For 'connection' filters, also add the actual DB link objects to highlightLinks
          if (filter.type === 'connection') {
            graphData.links.forEach(link => {
              if (link.type !== filter.value) return;
              const sId = typeof link.source === 'object' ? link.source.id : link.source;
              const tId = typeof link.target === 'object' ? link.target.id : link.target;
              if (sId === selectedNode.id || tId === selectedNode.id) links.add(link);
            });
          }

          return s;
        });
        let resultIds;
        if (combineMode === 'intersection') {
          resultIds = perFilterSets.reduce((acc, s) => {
            if (!acc) return new Set(s);
            return new Set([...acc].filter(id => s.has(id)));
          }, null) || new Set();
        } else {
          resultIds = new Set();
          perFilterSets.forEach(s => s.forEach(id => resultIds.add(id)));
        }
        resultIds.forEach(id => nodes.add(id));
      }
    }

    return { highlightNodes: nodes, highlightLinks: links, filterMatchSets: matchSets };
  }, [selectedNode, filteredNodeIds, graphData, activeFilters, combineMode]);

  // Virtual links: canvas-drawn connections for non-'connection' filters
  // One entry per matched node, carrying reason + color for ConnectionHint
  const virtualLinks = useMemo(() => {
    if (!selectedNode || filterMatchSets.size === 0) return [];
    const vlinks = [];
    graphData.nodes.forEach(node => {
      if (!highlightNodes.has(node.id) || node.id === selectedNode.id) return;
      // Collect which non-connection filters matched this node
      const matchingFilters = [];
      for (const [key, filter] of activeFilters.entries()) {
        if (filter.type === 'connection') continue;
        if (filterMatchSets.get(key)?.has(node.id)) matchingFilters.push({ key, filter });
      }
      if (matchingFilters.length === 0) return;
      // Use first filter for color/type; combine all reasons
      const primaryFilter = matchingFilters[0].filter;
      let reason;
      if (primaryFilter.type === 'nearby_adjacent') {
        const shared = getSharedAttributes(selectedNode, node);
        reason = shared.length > 0
          ? `Shares: ${shared.map(a => a.label).join(', ')}`
          : 'Adjacent songs in the music map';
      } else {
        const reasons = matchingFilters.map(({ filter }) => getVirtualLinkReason(filter)).filter(Boolean);
        reason = reasons.join(' · ');
      }
      vlinks.push({
        _virtual: true,
        _otherNode: node,
        type: primaryFilter.type,
        reason,
        color: LINK_TYPE_CONFIG[primaryFilter.type]?.color || 'rgba(255,255,255,0.4)',
      });
    });
    return vlinks;
  }, [selectedNode, activeFilters, filterMatchSets, highlightNodes, graphData.nodes]);

  const handleStartCompare = useCallback((node) => {
    setCompareMode(true);
    setCompareNodes([node, null]);
    setSelectedNode(null);
  }, []);

  const handleExitCompare = useCallback(() => {
    setCompareMode(false);
    setCompareNodes([null, null]);
    setRePickTarget(null);
  }, []);

  const handleNodeClick = useCallback((node) => {
    if (compareMode) {
      if (rePickTarget === 'A') {
        setCompareNodes(prev => [node, prev[1]]);
        setRePickTarget(null);
      } else if (rePickTarget === 'B') {
        setCompareNodes(prev => [prev[0], node]);
        setRePickTarget(null);
      } else if (!compareNodes[0]) {
        setCompareNodes([node, null]);
      } else {
        setCompareNodes(prev => [prev[0], node]);
      }
      return;
    }
    if (viewMode === 'graph' && graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 800);
      graphRef.current.zoom(4, 800);
    }
    setSelectedNode(node);
  }, [viewMode, compareMode, compareNodes, rePickTarget]);

  const handleDecadeFilter = useCallback((filter) => {
  // Fire the same filter event the sidebar uses
  window.dispatchEvent(new CustomEvent('resonant-add-filter', {
    detail: { key: filter.type, value: filter.value }
  }));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    if (compareMode) return; // overlay handles click-outside for compare
    if (hoveredVirtualLink) {
      handleNodeClick(hoveredVirtualLink._otherNode);
      return;
    }
    setSelectedNode(null);
  }, [hoveredVirtualLink, handleNodeClick, compareMode]);

  
  

  const hexToRgba = (hex, alpha) => {
    if (!hex || hex.length < 7) return `rgba(100, 100, 100, ${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100, 100, 100, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const clusterMeta = useMemo(() => {
    const map = {};
    clusters.forEach(c => { map[c.id] = c; });
    return map;
  }, [clusters]);

  return (
    <div style={{ width: '100dvw', height: '100dvh', backgroundColor: '#050505', overflow: 'hidden', position: 'relative', fontFamily: 'sans-serif' }}
    onMouseMove={(e) => {
      const pos = { x: e.clientX, y: e.clientY };
      setMousePos(pos);
      // Virtual link hover detection (screen-space line hit test)
      if (selectedNode && virtualLinks.length > 0 && graphRef.current) {
        const sel = graphData.nodes.find(n => n.id === selectedNode.id);
        if (sel?.x !== undefined) {
          const selScreen = graphRef.current.graph2ScreenCoords(sel.x, sel.y);
          let found = null;
          for (const vlink of virtualLinks) {
            const tgt = vlink._otherNode;
            if (tgt?.x === undefined) continue;
            const tScreen = graphRef.current.graph2ScreenCoords(tgt.x, tgt.y);
            if (distToSegment(pos.x, pos.y, selScreen.x, selScreen.y, tScreen.x, tScreen.y) < 7) {
              found = vlink;
              break;
            }
          }
          setHoveredVirtualLink(found);
        }
      } else if (hoveredVirtualLink) {
        setHoveredVirtualLink(null);
      }
    }}
    >

      {/* Map controls — hidden when a node is selected */}
      <div
        className="fixed top-4 left-4 right-4 z-20 flex items-start gap-4 pointer-events-none"
        style={{
          opacity: selectedNode ? 0 : 1,
          transform: selectedNode ? 'translateY(-6px)' : 'translateY(0)',
          pointerEvents: selectedNode ? 'none' : undefined,
          transition: 'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        <div className="pointer-events-auto">
          <DiscoverPanel
            graphData={fullGraphData}
            onNavigate={handleNodeClick}
            onFilter={handleDecadeFilter}
          />
        </div>
        <div className="pointer-events-auto flex-1 max-w-2xl">
          <SearchBar
            data={fullGraphData}
            onSelect={handleNodeClick}
            onSearchResults={handleSearchResults}
            onReset={handleReset}
            searchActive={searchActive}
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {/* 2D / 3D mode toggle */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 2,
              backgroundColor: 'rgba(8,8,8,0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '4px 6px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            {['2d', '3d'].map(mode => (
              <button
                key={mode}
                onClick={() => mode !== graphMode && handleToggleGraphMode()}
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em',
                  padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  backgroundColor: graphMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: graphMode === mode ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                  color: graphMode === mode ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)',
                  transition: 'all 0.15s',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
          <LayoutPicker
            activeLayout={activeLayout}
            onChangeLayout={handleChangeLayout}
            hasLayouts={hasLayouts}
            hasLayouts3d={hasLayouts3d}
            graphMode={graphMode}
          />
        </div>
      </div>
      

      <Sidebar
        node={selectedNode}
        links={graphData.links}
        onClose={handleBackgroundClick}
        onPlay={setPlayerNode}
        onNavigate={handleNodeClick}
      />

      <ExplorePanel
        selectedNode={selectedNode}
        allNodes={graphData.nodes}
        allLinks={graphData.links}
        clusters={allClusters}
        activeFilters={activeFilters}
        onToggleFilter={handleToggleFilter}
        onClearFilters={handleClearFilters}
        combineMode={combineMode}
        onToggleCombineMode={handleToggleCombineMode}
        onNavigate={handleNodeClick}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCompare={handleStartCompare}
      />

      {/* Compare mode: click-outside overlay */}
      {compareMode && !rePickTarget && compareNodes[0] && compareNodes[1] && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={handleExitCompare}
        />
      )}

      {/* ComparePanel */}
      {compareMode && compareNodes[0] && compareNodes[1] && !rePickTarget && (
        <ComparePanel
          nodeA={compareNodes[0]}
          nodeB={compareNodes[1]}
          allNodes={graphData.nodes}
          allLinks={graphData.links}
          onClose={handleExitCompare}
          onRePickA={() => setRePickTarget('A')}
          onRePickB={() => setRePickTarget('B')}
          onSelectA={(node) => setCompareNodes(prev => [node, prev[1]])}
          onSelectB={(node) => setCompareNodes(prev => [prev[0], node])}
        />
      )}

      {/* Compare mode: picking banner (shown when waiting for a node pick) */}
      {compareMode && (!compareNodes[1] || rePickTarget) && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full pointer-events-auto"
          style={{
            backgroundColor: 'rgba(8,8,8,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: rePickTarget === 'A' ? COMPARE_COLOR_A : COMPARE_COLOR_B,
              boxShadow: `0 0 6px ${rePickTarget === 'A' ? COMPARE_COLOR_A : COMPARE_COLOR_B}`,
            }}
          />
          <span className="text-[11px] text-white/60">
            {rePickTarget
              ? `Click a song to replace Song ${rePickTarget}`
              : 'Click a second song on the map to compare'
            }
          </span>
          <button
            onClick={rePickTarget ? () => setRePickTarget(null) : handleExitCompare}
            className="text-[10px] text-white/30 hover:text-white/65 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <ConnectionHint
        link={hoveredLink || hoveredVirtualLink}
        mousePos={mousePos}
        onNavigate={handleNodeClick}
        linkTypeConfig={LINK_TYPE_CONFIG}
      />

      <PlayerBar node={playerNode} onClose={() => setPlayerNode(null)} />

      {viewMode === 'timeline' ? (
        <TimelineView data={graphData} onSelect={handleNodeClick} />
      ) : graphMode === '3d' ? (
        <Graph3D
          graphData={graphData}
          selectedNode={selectedNode}
          highlightNodes={highlightNodes}
          highlightLinks={highlightLinks}
          filteredNodeIds={filteredNodeIds}
          activeFilter={activeFilter}
          compareMode={compareMode}
          compareNodes={compareNodes}
          windowSize={windowSize}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          onNodeHover={node => setHoveredNode(node)}
          onLinkHover={link => setHoveredLink(link)}
          onLinkClick={otherNode => handleNodeClick(otherNode)}
          loading={loading}
        />
      ) : (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={windowSize.width}
          height={windowSize.height}
          backgroundColor="#050505"
          nodeRelSize={12}
          nodeLabel={() => ''}
          d3AlphaDecay={0.01}
          d3AlphaMin={0.001}
          d3VelocityDecay={0.3}
          enableNodeDrag={true}
          
          linkColor={link => {
            if (highlightLinks.has(link)) {
              return linkTypeColors[link.type] || 'rgba(255,255,255,0.8)';
            }
            return 'rgba(0,0,0,0)';
          }}
          linkWidth={link => {
            if (hoveredLink === link) return 5;
            if (highlightLinks.has(link)) return 2.5;
            return 0;
          }}
          linkDirectionalParticles={link => highlightLinks.has(link) ? 3 : 0}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={link => linkTypeColors[link.type] || '#fff'}
          linkLabel={() => ''}
          onLinkHover={(link) => {
            if (link && highlightLinks.has(link)) {
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              link._otherNode = sourceId === selectedNode?.id ? link.target : link.source;
              setHoveredLink(link);
            } else {
              setHoveredLink(null);
            }
          }}
          onLinkClick={(link) => {
            if (!highlightLinks.has(link)) return;
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const otherNode = sourceId === selectedNode?.id ? link.target : link.source;
            if (typeof otherNode === 'object') {
              handleNodeClick(otherNode);
            }
          }}

          onNodeClick={handleNodeClick}
          onNodeHover={(node) => setHoveredNode(node)}
          onBackgroundClick={handleBackgroundClick}

          onNodeDragEnd={node => {
            node.fx = undefined;
            node.fy = undefined;
            if (graphRef.current) graphRef.current.d3ReheatSimulation();
          }}

          onRenderFramePre={(ctx, globalScale) => {
            if (Object.keys(clusterMeta).length === 0) return;

            const clusterGroups = {};
            graphData.nodes.forEach(node => {
              const cid = node.cluster_id;
              if (cid === null || cid === undefined || cid === -1) return;
              if (!clusterGroups[cid]) clusterGroups[cid] = [];
              clusterGroups[cid].push(node);
            });

            Object.entries(clusterGroups).forEach(([cid, nodes]) => {
              if (nodes.length < 2) return;

              const meta = clusterMeta[parseInt(cid)] || {};
              const color = meta.color || '#888888';
              const label = meta.label || '';

              let cx = 0, cy = 0;
              nodes.forEach(n => { cx += n.x; cy += n.y; });
              cx /= nodes.length;
              cy /= nodes.length;

              let maxDist = 0;
              nodes.forEach(n => {
                const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
                if (d > maxDist) maxDist = d;
              });
              const radius = maxDist + 48;

              // Soft radial fill — concentrated at center, fading out
              const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
              gradient.addColorStop(0,   hexToRgba(color, 0.10));
              gradient.addColorStop(0.55, hexToRgba(color, 0.05));
              gradient.addColorStop(1,   hexToRgba(color, 0));
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
              ctx.fillStyle = gradient;
              ctx.fill();

              // Dashed outer boundary ring
              ctx.save();
              ctx.beginPath();
              ctx.arc(cx, cy, radius - 4, 0, 2 * Math.PI);
              ctx.strokeStyle = hexToRgba(color, 0.18);
              ctx.lineWidth = 1 / globalScale;
              ctx.setLineDash([5 / globalScale, 9 / globalScale]);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();

              // Label pill — always visible, scales with zoom
              if (label) {
                const fontSize = Math.max(8, 10 / globalScale);
                ctx.font = `500 ${fontSize}px 'Courier New', monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const textW = ctx.measureText(label).width;
                const padX = 7 / globalScale;
                const padY = 3.5 / globalScale;
                const pillW = textW + padX * 2;
                const pillH = fontSize + padY * 2;
                const labelX = cx;
                const labelY = cy - radius - pillH / 2 - 6 / globalScale;
                const r = pillH / 2;

                // Pill background
                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, r);
                } else {
                  ctx.rect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH);
                }
                ctx.fillStyle = hexToRgba('#050505', 0.75);
                ctx.fill();
                ctx.strokeStyle = hexToRgba(color, 0.3);
                ctx.lineWidth = 1 / globalScale;
                ctx.stroke();

                // Color pip
                ctx.beginPath();
                ctx.arc(labelX - textW / 2 - padX / 2, labelY, 2 / globalScale, 0, 2 * Math.PI);
                ctx.fillStyle = hexToRgba(color, 0.7);
                ctx.fill();

                // Label text
                ctx.fillStyle = hexToRgba(color, 0.75);
                ctx.fillText(label, labelX + padX / 2, labelY);
              }
            });
          }}

          onRenderFramePost={(ctx, globalScale) => {
            // Draw labels ON TOP of everything for hovered/selected nodes
            const nodesToLabel = [];
            if (selectedNode) {
              const sel = graphData.nodes.find(n => n.id === selectedNode.id);
              if (sel) nodesToLabel.push(sel);
            }
            if (hoveredNode && hoveredNode.id !== selectedNode?.id) {
              nodesToLabel.push(hoveredNode);
            }
            // Draw virtual filter links — endpoints trimmed to node circle edges
            if (virtualLinks.length > 0) {
              const sel = graphData.nodes.find(n => n.id === selectedNode?.id);
              if (sel?.x !== undefined) {
                // Selected node is drawn at size=30 (r=15) + 1px ring = 16
                // Regular nodes are drawn at size=20 (r=10) + 1px ring = 11
                const SEL_R = 16;
                const TGT_R = 11;
                virtualLinks.forEach(vlink => {
                  const tgt = vlink._otherNode;
                  if (!tgt || tgt.x === undefined) return;
                  const dx = tgt.x - sel.x;
                  const dy = tgt.y - sel.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  if (len < SEL_R + TGT_R) return; // circles overlap, nothing to draw
                  const nx = dx / len;
                  const ny = dy / len;
                  const isHovered = hoveredVirtualLink === vlink;
                  ctx.strokeStyle = vlink.color;
                  ctx.globalAlpha = isHovered ? 0.85 : 0.45;
                  ctx.lineWidth = (isHovered ? 3.5 : 2.5) / globalScale;
                  ctx.beginPath();
                  ctx.moveTo(sel.x + nx * SEL_R, sel.y + ny * SEL_R);
                  ctx.lineTo(tgt.x - nx * TGT_R, tgt.y - ny * TGT_R);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                });
              }
            }

            // Draw compare gradient line between the two compared nodes
            if (compareMode && compareNodes[0] && compareNodes[1]) {
              const nA = graphData.nodes.find(n => n.id === compareNodes[0].id);
              const nB = graphData.nodes.find(n => n.id === compareNodes[1].id);
              if (nA?.x !== undefined && nB?.x !== undefined) {
                const dx = nB.x - nA.x;
                const dy = nB.y - nA.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const RA = 18, RB = 18; // compare nodes are size 28, ring at r=14+4=18
                if (len > RA + RB) {
                  const nx = dx / len, ny = dy / len;
                  const grad = ctx.createLinearGradient(nA.x, nA.y, nB.x, nB.y);
                  grad.addColorStop(0, COMPARE_COLOR_A);
                  grad.addColorStop(1, COMPARE_COLOR_B);
                  ctx.strokeStyle = grad;
                  ctx.lineWidth = 2 / globalScale;
                  ctx.globalAlpha = 0.55;
                  ctx.beginPath();
                  ctx.moveTo(nA.x + nx * RA, nA.y + ny * RA);
                  ctx.lineTo(nB.x - nx * RB, nB.y - ny * RB);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                }
              }
            }

            nodesToLabel.forEach(node => {
              if (node.x === undefined || node.y === undefined) return;

              const label = node.name || '';
              const artistLabel = node.artist || '';
              const fontSize = 13 / globalScale;
              const smallFontSize = 9 / globalScale;
              const padding = 8 / globalScale;
              const nodeSize = 20;

              ctx.font = `600 ${fontSize}px Inter, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              ctx.font = `400 ${smallFontSize}px Inter, sans-serif`;
              const artistWidth = ctx.measureText(artistLabel).width;

              const bgWidth = Math.max(textWidth, artistWidth) + padding * 2;
              const bgHeight = fontSize + smallFontSize + padding * 2 + 2;

              // Position ABOVE the node
              const bgX = node.x - bgWidth / 2;
              const bgY = node.y - nodeSize / 2 - bgHeight - 8 / globalScale;

              // Drop shadow
              ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
              ctx.shadowBlur = 12 / globalScale;
              ctx.shadowOffsetY = 2 / globalScale;

              // Background with rounded corners
              ctx.fillStyle = 'rgba(10, 10, 10, 0.96)';
              ctx.beginPath();
              const radius = 4 / globalScale;
              if (ctx.roundRect) {
                ctx.roundRect(bgX, bgY, bgWidth, bgHeight, radius);
              } else {
                ctx.rect(bgX, bgY, bgWidth, bgHeight);
              }
              ctx.fill();

              // Reset shadow for border and text
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.shadowOffsetY = 0;

              // Accent border using album color
              const accentColor = node.visual_dna?.primary_color || '#ffffff';
              ctx.strokeStyle = accentColor;
              ctx.lineWidth = 1.5 / globalScale;
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(bgX, bgY, bgWidth, bgHeight, radius);
              } else {
                ctx.rect(bgX, bgY, bgWidth, bgHeight);
              }
              ctx.stroke();

              // Small arrow pointing down to the node
              const arrowX = node.x;
              const arrowY = bgY + bgHeight;
              const arrowSize = 4 / globalScale;
              ctx.fillStyle = 'rgba(10, 10, 10, 0.96)';
              ctx.beginPath();
              ctx.moveTo(arrowX - arrowSize, arrowY);
              ctx.lineTo(arrowX + arrowSize, arrowY);
              ctx.lineTo(arrowX, arrowY + arrowSize);
              ctx.closePath();
              ctx.fill();

              // Song name
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.font = `600 ${fontSize}px Inter, sans-serif`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
              ctx.fillText(label, node.x, bgY + padding);

              // Artist name
              ctx.font = `400 ${smallFontSize}px Inter, sans-serif`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
              ctx.fillText(artistLabel, node.x, bgY + padding + fontSize + 2 / globalScale);
            });
          }}

          nodeCanvasObject={(node, ctx, globalScale) => {
            const isCompareA = compareMode && compareNodes[0]?.id === node.id;
            const isCompareB = compareMode && compareNodes[1]?.id === node.id;

            let isHighlighted;
            if (compareMode) {
              isHighlighted = isCompareA || isCompareB;
            } else {
              const isModeActive = filteredNodeIds || selectedNode;
              isHighlighted = isModeActive ? highlightNodes.has(node.id) : true;
            }

            const isSelected = !compareMode && selectedNode?.id === node.id;
            const alpha = isHighlighted ? 1 : compareMode ? 0.06 : 0.05;
            const size = isSelected ? 30 : (isCompareA || isCompareB) ? 28 : 20;

            ctx.globalAlpha = alpha;

            const img = getCachedImage(node.img);
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, size / 2, 0, 2 * Math.PI);
            ctx.clip();
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, node.x - size / 2, node.y - size / 2, size, size);
            } else {
              ctx.fillStyle = node.visual_dna?.primary_color || "#333";
              ctx.fill();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(node.x, node.y, size / 2 + 1, 0, 2 * Math.PI);
            ctx.strokeStyle = node.visual_dna?.primary_color
              ? `${node.visual_dna.primary_color}88`
              : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1.5 / globalScale;
            ctx.stroke();

            if (isCompareA || isCompareB) {
              const ringColor = isCompareA ? COMPARE_COLOR_A : COMPARE_COLOR_B;
              ctx.beginPath();
              ctx.arc(node.x, node.y, size / 2 + 4, 0, 2 * Math.PI);
              ctx.strokeStyle = ringColor;
              ctx.lineWidth = 2.5 / globalScale;
              ctx.stroke();
              // outer glow ring
              ctx.beginPath();
              ctx.arc(node.x, node.y, size / 2 + 8, 0, 2 * Math.PI);
              ctx.strokeStyle = ringColor + '44';
              ctx.lineWidth = 1.5 / globalScale;
              ctx.stroke();
            } else if (isSelected || (activeFilter && isHighlighted)) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, size / 2 + 3, 0, 2 * Math.PI);
              ctx.strokeStyle = activeFilter ? (node.visual_dna?.primary_color || '#fff') : '#fff';
              ctx.lineWidth = (activeFilter ? 4 : 2) / globalScale;
              ctx.stroke();
            }

            ctx.globalAlpha = 1;
          }}
        />
      )}
    </div>
  );
}