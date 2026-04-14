import { useState } from 'react';

const vibes = [
  { label: 'Late Night',    icon: '🌙', query: 'mellow atmospheric late night dreamy' },
  { label: 'Workout',       icon: '💪', query: 'high energy intense driving workout' },
  { label: 'Focus',         icon: '🎯', query: 'instrumental minimal focus concentration' },
  { label: 'Road Trip',     icon: '🛣️', query: 'uplifting driving highway open road' },
  { label: 'Nostalgic',     icon: '📻', query: 'nostalgic sentimental wistful reminiscent' },
  { label: 'Upbeat',        icon: '☀️', query: 'upbeat happy cheerful bright positive' },
  { label: 'Introspective', icon: '🪞', query: 'introspective thoughtful personal reflective' },
  { label: 'Party',         icon: '🎉', query: 'danceable party energetic fun' },
  { label: 'Rainy Day',     icon: '🌧️', query: 'melancholic rainy slow somber' },
  { label: 'Morning',       icon: '☕', query: 'gentle morning awakening peaceful' },
  { label: 'Romantic',      icon: '💕', query: 'romantic love intimate tender' },
  { label: 'Dark',          icon: '🖤', query: 'dark brooding heavy intense minor' },
];

const VibeChips = ({ onVibeClick }) => {
  const [activeVibe, setActiveVibe] = useState(null);

  const handleClick = (vibe) => {
    if (activeVibe === vibe.label) {
      setActiveVibe(null);
      onVibeClick(null);
    } else {
      setActiveVibe(vibe.label);
      onVibeClick(vibe.query);
    }
  };

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
      style={{ maxWidth: 'min(90vw, 700px)' }}
    >
      <div
        className="flex gap-1.5 overflow-x-auto py-2 px-3 scrollbar-none"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <style>{`
          .vibe-chips-scroll::-webkit-scrollbar { display: none; }
        `}</style>
        {vibes.map((vibe) => {
          const isActive = activeVibe === vibe.label;
          return (
            <button
              key={vibe.label}
              onClick={() => handleClick(vibe)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: isActive ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: isActive ? '0 4px 12px rgba(255,255,255,0.08)' : 'none',
              }}
            >
              <span className="text-sm">{vibe.icon}</span>
              <span
                className="text-[11px] font-medium transition-colors"
                style={{ color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)' }}
              >
                {vibe.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VibeChips;