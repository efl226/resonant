import { useEffect, useState } from 'react';

const ConnectionHint = ({ link, mousePos, onNavigate, linkTypeConfig }) => {
  if (!link) return null;

  const otherNode = link._otherNode;
  if (!otherNode) return null;

  const config = linkTypeConfig[link.type] || { label: link.type, color: '#888', icon: '·' };

  return (
    <div
      className="fixed z-50 pointer-events-auto"
      style={{
        left: mousePos.x + 15,
        top: mousePos.y + 15,
        maxWidth: '280px',
      }}
    >
      <div 
        className="p-3 rounded-lg backdrop-blur-xl cursor-pointer transition-all hover:scale-105"
        style={{
          backgroundColor: `${config.color}15`,
          border: `1px solid ${config.color}40`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.6)`,
        }}
        onClick={() => onNavigate(otherNode)}
      >
        <div className="flex items-center gap-2">
          {otherNode.img && (
            <img src={otherNode.img} className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{otherNode.name}</div>
            <div className="text-[10px] text-white/50 truncate">{otherNode.artist}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
            style={{ backgroundColor: `${config.color}30`, color: config.color }}
          >
            {config.icon} {config.label}
          </span>
        </div>
        {link.reason && (
          <div className="mt-1.5 text-[10px] text-white/50 leading-relaxed">{link.reason}</div>
        )}
      </div>
    </div>
  );
};

export default ConnectionHint;