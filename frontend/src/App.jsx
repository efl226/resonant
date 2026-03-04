import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import NeuralFilters from './components/NeuralFilters'; 
import TimelineView from './components/TimelineView';
import { loadGraphData } from './api/client';
import FALLBACK_DATA from './data/songsseed.json';
import './index.css';

export default function App() {
  const graphRef = useRef();
  
  const [graphData, setGraphData] = useState(FALLBACK_DATA);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('graph');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);

  useEffect(() => {
    loadGraphData()
      .then(data => {
        // Pin nodes that have UMAP coordinates to their positions
        const processedNodes = data.nodes.map(node => {
          if (node.umap_x !== null && node.umap_y !== null) {
            return {
              ...node,
              fx: node.umap_x,
              fy: node.umap_y,
            };
          }
          return node;
        });
        setGraphData({ nodes: processedNodes, links: data.links });
        setLoading(false);
        console.log('[Resonant] Graph data ready');
        
        const umapCount = processedNodes.filter(n => n.fx !== undefined).length;
        console.log(`[Resonant] ${umapCount} nodes pinned to UMAP positions, ${processedNodes.length - umapCount} floating`);
      })
      .catch(() => setLoading(false));
  }, []);

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
    if (viewMode === 'graph' && graphRef.current) {
        graphRef.current.zoomToFit(800);
    }
  }, [viewMode]);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#050505', overflow: 'hidden', position: 'relative', fontFamily: 'sans-serif' }}>

      <SearchBar data={graphData} onSelect={handleNodeClick} />
      
      <NeuralFilters 
        data={graphData}                      
        activeFilter={activeFilter} 
        onFilterChange={setActiveFilter} 
      />

      <Sidebar 
        node={selectedNode} 
        links={graphData.links}               
        onClose={handleBackgroundClick} 
      />

      {viewMode === 'timeline' ? (
        <TimelineView data={graphData} onSelect={handleNodeClick} />
      ) : (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}                
          backgroundColor="#050505"
          nodeRelSize={12}
          
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.3}
          warmupTicks={100}
          
          linkColor={link => highlightLinks.has(link) ? '#fff' : 'rgba(255,255,255,0.05)'}
          linkWidth={link => highlightLinks.has(link) ? 2 : 1}
          linkDirectionalParticles={link => highlightLinks.has(link) ? 4 : 0}
          linkDirectionalParticleSpeed={0.005}

          onNodeClick={handleNodeClick}
          onNodeHover={setHoveredNode}
          onBackgroundClick={handleBackgroundClick}

          nodeCanvasObject={(node, ctx, globalScale) => {
            const isModeActive = filteredNodeIds || selectedNode;
            const isHighlighted = isModeActive ? (highlightNodes.has(node.id)) : true;
            const isSelected = selectedNode?.id === node.id;
            const hasUmap = node.umap_x !== null && node.umap_y !== null;
            
            const alpha = isHighlighted ? 1 : 0.05; 
            const size = isSelected ? 30 : 20;

            ctx.globalAlpha = alpha;

            const img = new Image();
            img.src = node.img;
            img.crossOrigin = "Anonymous";
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, size/2, 0, 2 * Math.PI);
            ctx.clip();
            try {
              ctx.drawImage(img, node.x - size/2, node.y - size/2, size, size);
            } catch(e) {
              // Fallback: colored circle based on whether it has UMAP data
              ctx.fillStyle = hasUmap ? "#1a6b3a" : "#333";
              ctx.fill();
            }
            ctx.restore();

            // Ring around UMAP-positioned nodes so you can tell them apart
            if (!isSelected && hasUmap && !activeFilter) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, size/2 + 2, 0, 2 * Math.PI);
              ctx.strokeStyle = 'rgba(0, 255, 100, 0.3)';
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
            }

            if (isSelected || (activeFilter && isHighlighted)) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, size/2 + 3, 0, 2 * Math.PI);
              ctx.strokeStyle = activeFilter ? (node.visual_dna?.primary_color || '#fff') : '#fff';
              ctx.lineWidth = (activeFilter ? 4 : 2) / globalScale;
              ctx.stroke();
            }

            if (isHighlighted && globalScale > 1.2) {
              const label = node.name;
              const artistLabel = node.artist;
              const fontSize = 14 / globalScale;
              const smallFontSize = 10 / globalScale;
              ctx.font = `600 ${fontSize}px Inter, sans-serif`;
              ctx.textAlign = 'center';
              
              const textWidth = ctx.measureText(label).width;
              const artistWidth = ctx.measureText(artistLabel).width;
              const bgWidth = Math.max(textWidth, artistWidth) + 8;
              
              ctx.fillStyle = 'rgba(0,0,0,0.7)';
              ctx.fillRect(node.x - bgWidth/2, node.y + size/2 + 2, bgWidth, fontSize + smallFontSize + 8);
              
              ctx.fillStyle = 'rgba(255,255,255,0.9)';
              ctx.fillText(label, node.x, node.y + size/2 + fontSize + 4);
              
              ctx.font = `400 ${smallFontSize}px Inter, sans-serif`;
              ctx.fillStyle = 'rgba(255,255,255,0.5)';
              ctx.fillText(artistLabel, node.x, node.y + size/2 + fontSize + smallFontSize + 6);
            }
            
            ctx.globalAlpha = 1;
          }}
        />
      )}
    </div>
  );
}