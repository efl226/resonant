import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import NeuralFilters from './components/NeuralFilters'; 
import TimelineView from './components/TimelineView';
import PlayerBar from './components/PlayerBar';
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

  useEffect(() => {
    const handleKeyDown = (e) => {
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
  }, [selectedNode, graphData]);

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
    if (graphRef.current) setTimeout(() => graphRef.current.zoomToFit(800), 100);
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

  const { highlightNodes, highlightLinks } = useMemo(() => {
    const nodes = new Set();
    const links = new Set();
    if (filteredNodeIds) {
      filteredNodeIds.forEach(id => nodes.add(id));
    } else if (selectedNode) {
      nodes.add(selectedNode.id);
      graphData.links.forEach(link => {
        const s = link.source.id || link.source;
        const t = link.target.id || link.target;
        if (s === selectedNode.id || t === selectedNode.id) {
          links.add(link);
          nodes.add(s === selectedNode.id ? t : s);
        }
      });
    }
    return { highlightNodes: nodes, highlightLinks: links };
  }, [selectedNode, filteredNodeIds, graphData]);

  const handleNodeClick = useCallback((node) => {
    if (viewMode === 'graph' && graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 800);
      graphRef.current.zoom(4, 800);
    }
    setSelectedNode(node);
  }, [viewMode]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    if (viewMode === 'graph' && graphRef.current) graphRef.current.zoomToFit(800);
  }, [viewMode]);

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
    <div style={{ width: '100dvw', height: '100dvh', backgroundColor: '#050505', overflow: 'hidden', position: 'relative', fontFamily: 'sans-serif' }}>

      <SearchBar 
        data={fullGraphData} 
        onSelect={handleNodeClick} 
        onSearchResults={handleSearchResults}
        onReset={handleReset}
        searchActive={searchActive}
      />
      

      <Sidebar 
        node={selectedNode} links={graphData.links} onClose={handleBackgroundClick}
        onPlay={setPlayerNode} onNavigate={handleNodeClick}
      />

      <PlayerBar node={playerNode} onClose={() => setPlayerNode(null)} />

      {viewMode === 'timeline' ? (
        <TimelineView data={graphData} onSelect={handleNodeClick} />
      ) : (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
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
          linkWidth={link => highlightLinks.has(link) ? 2.5 : 0}
          linkDirectionalParticles={link => highlightLinks.has(link) ? 3 : 0}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={link => linkTypeColors[link.type] || '#fff'}
          linkLabel={() => ''}

          onNodeClick={handleNodeClick}
          onNodeHover={(node) => setHoveredNode(node)}
          onBackgroundClick={handleBackgroundClick}

          onNodeDragEnd={node => {
            node.fx = undefined;
            node.fy = undefined;
            if (graphRef.current) graphRef.current.d3ReheatSimulation();
          }}

          onRenderFramePre={(ctx, globalScale) => {
            const time = Date.now() / 3000;

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
              const color = meta.color || '#666';
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
              const radius = maxDist + 40;

              const drawBlob = (bx, by, br, opacity) => {
                const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, br);
                gradient.addColorStop(0, hexToRgba(color, opacity));
                gradient.addColorStop(0.5, hexToRgba(color, opacity * 0.5));
                gradient.addColorStop(1, hexToRgba(color, 0));
                ctx.beginPath();
                ctx.arc(bx, by, br, 0, 2 * Math.PI);
                ctx.fillStyle = gradient;
                ctx.fill();
              };

              drawBlob(cx, cy, radius, 0.08);

              const cidNum = parseInt(cid);
              for (let i = 0; i < 4; i++) {
                const angle = (cidNum * 2 + i * 1.5) + Math.sin(time + i) * 0.3;
                const dist = radius * (0.3 + Math.sin(time * 0.5 + i * 2) * 0.1);
                const bx = cx + Math.cos(angle) * dist;
                const by = cy + Math.sin(angle) * dist;
                const br = radius * (0.5 + Math.sin(time * 0.7 + i) * 0.1);
                drawBlob(bx, by, br, 0.05);
              }

              if (globalScale < 0.8 && label) {
                const labelY = cy - radius - 25 / globalScale;
                const fontSize = Math.max(10, 14 / globalScale);
                ctx.font = `500 ${fontSize}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillText(label, cx + 1, labelY + 1);
                ctx.fillStyle = hexToRgba(color, 0.45);
                ctx.fillText(label, cx, labelY);
              }
            });
          }}

          nodeCanvasObject={(node, ctx, globalScale) => {
            const isModeActive = filteredNodeIds || selectedNode;
            const isHighlighted = isModeActive ? (highlightNodes.has(node.id)) : true;
            const isSelected = selectedNode?.id === node.id;
            const alpha = isHighlighted ? 1 : 0.05;
            const size = isSelected ? 30 : 20;

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

            if (isSelected || (activeFilter && isHighlighted)) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, size / 2 + 3, 0, 2 * Math.PI);
              ctx.strokeStyle = activeFilter ? (node.visual_dna?.primary_color || '#fff') : '#fff';
              ctx.lineWidth = (activeFilter ? 4 : 2) / globalScale;
              ctx.stroke();
            }

            const isHovered = hoveredNode?.id === node.id;
            const showLabel = isSelected || isHovered;

            if (showLabel && isHighlighted) {
              const label = node.name;
              const artistLabel = node.artist;
              const fontSize = 14 / globalScale;
              const smallFontSize = 10 / globalScale;
              ctx.font = `600 ${fontSize}px Inter, sans-serif`;
              ctx.textAlign = 'center';
              const textWidth = ctx.measureText(label).width;
              const artistWidth = ctx.measureText(artistLabel).width;
              const bgWidth = Math.max(textWidth, artistWidth) + 8;

              ctx.fillStyle = 'rgba(0,0,0,0.8)';
              ctx.fillRect(node.x - bgWidth / 2, node.y + size / 2 + 2, bgWidth, fontSize + smallFontSize + 8);

              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.fillText(label, node.x, node.y + size / 2 + fontSize + 4);

              ctx.font = `400 ${smallFontSize}px Inter, sans-serif`;
              ctx.fillStyle = 'rgba(255,255,255,0.5)';
              ctx.fillText(artistLabel, node.x, node.y + size / 2 + fontSize + smallFontSize + 6);
            }

            ctx.globalAlpha = 1;
          }}
        />
      )}
    </div>
  );
}