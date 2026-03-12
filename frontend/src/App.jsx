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
        setGraphData({ nodes: processedNodes, links: data.links });
        setLoading(false);
        console.log('[Resonant] Graph data ready');
      })
      .catch(() => setLoading(false));
  }, []);

  // Apply UMAP gravity force once graph is loaded
  useEffect(() => {
    if (!graphRef.current || loading) return;

    const fg = graphRef.current;

    // Custom force that pulls nodes toward their UMAP coordinates
    const umapForce = (alpha) => {
      graphData.nodes.forEach(node => {
        if (node._targetX !== undefined && node._targetY !== undefined) {
          const strength = 0.000005; // How strongly nodes are pulled to UMAP position
          node.vx += (node._targetX - node.x) * strength * alpha;
          node.vy += (node._targetY - node.y) * strength * alpha;
        }
      });
    };

    fg.d3Force('umap', umapForce);

    // Weaken the default forces so UMAP gravity dominates
    const charge = fg.d3Force('charge');
    if (charge) charge.strength(-30);

    const link = fg.d3Force('link');
    if (link) link.strength(0.02);

    // Remove the centering force so UMAP positions aren't pulled to origin
    fg.d3Force('center', null);

    // Reheat the simulation
    fg.d3ReheatSimulation();
  }, [loading, graphData]);

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
          
          d3AlphaDecay={0.01}
          d3AlphaMin={0.001}
          d3VelocityDecay={0.3}
          enableNodeDrag={true}
          
          linkColor={link => highlightLinks.has(link) ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0)'}
          linkWidth={link => highlightLinks.has(link) ? 2 : 0}
          linkDirectionalParticles={link => highlightLinks.has(link) ? 4 : 0}
          linkDirectionalParticleSpeed={0.005}

          onNodeClick={handleNodeClick}
          onNodeHover={setHoveredNode}
          onBackgroundClick={handleBackgroundClick}

          onNodeDragEnd={node => {
            // After dragging, let the UMAP gravity pull it back
            node.fx = undefined;
            node.fy = undefined;
            if (graphRef.current) {
              graphRef.current.d3ReheatSimulation();
            }
          }}

          nodeCanvasObject={(node, ctx, globalScale) => {
            const isModeActive = filteredNodeIds || selectedNode;
            const isHighlighted = isModeActive ? (highlightNodes.has(node.id)) : true;
            const isSelected = selectedNode?.id === node.id;
            
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
              ctx.fillStyle = "#333";
              ctx.fill();
            }
            ctx.restore();
            // Subtle ring around all nodes
            ctx.beginPath();
            ctx.arc(node.x, node.y, size/2 + 1, 0, 2 * Math.PI);
            ctx.strokeStyle = node.visual_dna?.primary_color 
              ? `${node.visual_dna.primary_color}88` 
              : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1.5 / globalScale;
            ctx.stroke();

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