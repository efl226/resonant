import { useRef, useEffect, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

// Texture cache — reuse across renders
const textureCache = new Map();
function getTexture(url) {
  if (!url) return null;
  if (textureCache.has(url)) return textureCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  textureCache.set(url, tex);
  return tex;
}

// Ring sprite texture cache (per color)
const ringTextureCache = new Map();
function getRingTexture(hexColor) {
  if (ringTextureCache.has(hexColor)) return ringTextureCache.get(hexColor);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  ringTextureCache.set(hexColor, tex);
  return tex;
}

const LINK_TYPE_COLORS = {
  samples: '#E8724A',
  shared_musician: '#6BCB77',
  same_producer: '#B84AE8',
  same_songwriter: '#D44AE8',
  same_label: '#8B9FE8',
  same_studio: '#9B72CF',
  shared_instruments: '#4AE8D4',
  harmonic_bridge: '#E8C94A',
};

export default function Graph3D({
  graphData,
  selectedNode,
  highlightNodes,
  highlightLinks,
  filteredNodeIds,
  activeFilter,
  compareMode,
  compareNodes,
  windowSize,
  onNodeClick,
  onBackgroundClick,
  onNodeHover,
  onLinkHover,
  onLinkClick,
  loading,
}) {
  const graphRef = useRef();

  // Set up forces after mount — defer so the simulation is fully initialized
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const fg = graphRef.current;
      if (!fg) return;

      const umapForce = (alpha) => {
        graphData.nodes.forEach(node => {
          if (node._targetX === undefined) return;
          const s = 0.08;
          node.vx = (node.vx || 0) + (node._targetX - (node.x || 0)) * s * alpha;
          node.vy = (node.vy || 0) + (node._targetY - (node.y || 0)) * s * alpha;
          if (node._targetZ !== undefined) {
            node.vz = (node.vz || 0) + (node._targetZ - (node.z || 0)) * s * alpha;
          }
        });
      };

      try {
        fg.d3Force('umap', umapForce);
        fg.d3Force('charge')?.strength(-120);
        fg.d3Force('link')?.strength(0.02);
        // Do NOT null the center force in 3D — it causes layoutTick to crash
        fg.d3ReheatSimulation();
      } catch (e) {
        console.warn('[Graph3D] Force setup error:', e);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [loading, graphData]);

  // Refresh Three.js node objects whenever highlight state changes
  useEffect(() => {
    graphRef.current?.refresh();
  }, [selectedNode?.id, compareNodes?.[0]?.id, compareNodes?.[1]?.id, highlightNodes]);

  const nodeThreeObject = useCallback((node) => {
    const isCompareA = compareMode && compareNodes?.[0]?.id === node.id;
    const isCompareB = compareMode && compareNodes?.[1]?.id === node.id;
    const isSelected = !compareMode && selectedNode?.id === node.id;

    const hasModeActive = filteredNodeIds || selectedNode || compareMode;
    const isHighlighted = hasModeActive
      ? (highlightNodes.has(node.id) || isCompareA || isCompareB)
      : true;

    const alpha = isHighlighted ? 1 : 0.05;
    const size = isSelected ? 20 : (isCompareA || isCompareB) ? 18 : 13;

    const group = new THREE.Group();

    // Album art sprite (always faces camera)
    const tex = getTexture(node.img);
    if (tex) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: alpha });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(size, size, 1);
      group.add(sprite);
    } else {
      const color = node.visual_dna?.primary_color || '#444444';
      const geo = new THREE.SphereGeometry(size / 2, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: alpha,
      });
      group.add(new THREE.Mesh(geo, mat));
    }

    // Ring sprite for selected / compare (always faces camera, no flat-plane issue)
    if (isSelected || isCompareA || isCompareB) {
      const ringColor = isCompareA ? '#4A9EE8' : isCompareB ? '#E8724A' : '#ffffff';
      const ringTex = getRingTexture(ringColor);
      const ringMat = new THREE.SpriteMaterial({ map: ringTex, transparent: true, opacity: 0.9 });
      const ringSprite = new THREE.Sprite(ringMat);
      const ringSize = size + 8;
      ringSprite.scale.set(ringSize, ringSize, 1);
      group.add(ringSprite);
    }

    return group;
  }, [selectedNode, compareMode, compareNodes, highlightNodes, filteredNodeIds]);

  return (
    <ForceGraph3D
      ref={graphRef}
      graphData={graphData}
      width={windowSize.width}
      height={windowSize.height}
      backgroundColor="#050505"
      nodeLabel={node => `${node.name} — ${node.artist}`}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      enableNodeDrag={true}
      onNodeClick={onNodeClick}
      onNodeHover={onNodeHover}
      onBackgroundClick={onBackgroundClick}
      onNodeDragEnd={node => {
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
        graphRef.current?.d3ReheatSimulation();
      }}
      linkColor={link => {
        if (highlightLinks.has(link)) return LINK_TYPE_COLORS[link.type] || 'rgba(255,255,255,0.8)';
        return 'rgba(0,0,0,0)';
      }}
      linkWidth={link => highlightLinks.has(link) ? 2 : 0}
      linkOpacity={0.8}
      linkDirectionalParticles={link => highlightLinks.has(link) ? 3 : 0}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={link => LINK_TYPE_COLORS[link.type] || '#fff'}
      onLinkHover={(link) => {
        if (link && highlightLinks.has(link)) {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          link._otherNode = sourceId === selectedNode?.id ? link.target : link.source;
          onLinkHover?.(link);
        } else {
          onLinkHover?.(null);
        }
      }}
      onLinkClick={(link) => {
        if (!highlightLinks.has(link)) return;
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const otherNode = sourceId === selectedNode?.id ? link.target : link.source;
        if (typeof otherNode === 'object') onLinkClick?.(otherNode);
      }}
    />
  );
}
