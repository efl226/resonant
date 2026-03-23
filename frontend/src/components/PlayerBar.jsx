import { useState, useEffect } from 'react';

const PlayerBar = ({ node, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (node) {
      setTimeout(() => setVisible(true), 50);
    } else {
      setVisible(false);
    }
  }, [node]);

  if (!node) return null;

  const trackId = node.spotify_uri?.split(':').pop();
  if (!trackId) return null;

  return (
    <div
      className="fixed bottom-5 left-5 z-40 transition-all duration-300"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Close button */}
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onClose(), 300);
        }}
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 text-xs z-50 transition-all hover:scale-110"
      >
        ×
      </button>

      <iframe
        key={trackId}
        src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
        width="300"
        height="80"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        style={{ borderRadius: '12px' }}
      />
    </div>
  );
};

export default PlayerBar;