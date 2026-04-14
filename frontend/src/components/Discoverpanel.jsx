import { useState, useMemo } from 'react';

const DiscoverPanel = ({ graphData, onNavigate, onFilter }) => {
  const [open, setOpen] = useState(false);

  // Compute discoveries from graph data
  const discoveries = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return null;

    // Most connected song
    const linkCounts = {};
    (graphData.links || []).forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      linkCounts[sourceId] = (linkCounts[sourceId] || 0) + 1;
      linkCounts[targetId] = (linkCounts[targetId] || 0) + 1;
    });
    let mostConnected = null;
    let maxLinks = 0;
    graphData.nodes.forEach(node => {
      const count = linkCounts[node.id] || 0;
      if (count > maxLinks) {
        maxLinks = count;
        mostConnected = node;
      }
    });

    // Rarest track — song with most unique attributes
    const producerCounts = {};
    const keyCounts = {};
    const studioCounts = {};
    const labelCounts = {};
    graphData.nodes.forEach(n => {
      const p = n.genetic_dna?.producer;
      const k = n.sonic_dna?.key;
      const s = n.genetic_dna?.studio;
      const l = n.genetic_dna?.label;
      if (p) producerCounts[p] = (producerCounts[p] || 0) + 1;
      if (k) keyCounts[k] = (keyCounts[k] || 0) + 1;
      if (s) studioCounts[s] = (studioCounts[s] || 0) + 1;
      if (l) labelCounts[l] = (labelCounts[l] || 0) + 1;
    });
    let rarest = null;
    let maxRarity = 0;
    graphData.nodes.forEach(n => {
      let score = 0;
      const p = n.genetic_dna?.producer;
      const k = n.sonic_dna?.key;
      const s = n.genetic_dna?.studio;
      const l = n.genetic_dna?.label;
      if (p && producerCounts[p] === 1) score += 2;
      if (k && keyCounts[k] === 1) score += 1;
      if (s && studioCounts[s] === 1) score += 2;
      if (l && labelCounts[l] === 1) score += 1;
      if (score > maxRarity) {
        maxRarity = score;
        rarest = n;
      }
    });

    // Decades
    const decadeCounts = {};
    graphData.nodes.forEach(n => {
      if (n.year) {
        const decade = `${Math.floor(n.year / 10) * 10}s`;
        decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
      }
    });
    const decades = Object.entries(decadeCounts)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    // Random interesting song (one with at least one connection)
    const connectedNodes = graphData.nodes.filter(n => (linkCounts[n.id] || 0) > 0);
    const random = connectedNodes[Math.floor(Math.random() * connectedNodes.length)] || graphData.nodes[0];

    return { mostConnected, rarest, decades, random, maxLinks, maxRarity };
  }, [graphData]);

  if (!discoveries) return null;

  const handleRandom = () => {
    const connectedNodes = graphData.nodes.filter(n => {
      const count = (graphData.links || []).filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return s === n.id || t === n.id;
      }).length;
      return count > 0;
    });
    const random = connectedNodes[Math.floor(Math.random() * connectedNodes.length)];
    if (random) {
      onNavigate(random);
      setOpen(false);
    }
  };

  const cards = [
    {
      title: 'Most Connected',
      description: `${discoveries.mostConnected?.name || 'Unknown'} has ${discoveries.maxLinks} connections — the most in your collection`,
      icon: '⟡',
      color: '#6BCB77',
      action: () => {
        if (discoveries.mostConnected) {
          onNavigate(discoveries.mostConnected);
          setOpen(false);
        }
      },
      available: !!discoveries.mostConnected,
    },
    {
      title: 'Your Rarest Track',
      description: discoveries.rarest 
        ? `${discoveries.rarest.name} stands out with uncommon attributes` 
        : 'Not enough data to find a rare track',
      icon: '✦',
      color: '#E8C94A',
      action: () => {
        if (discoveries.rarest) {
          onNavigate(discoveries.rarest);
          setOpen(false);
        }
      },
      available: !!discoveries.rarest,
    },
    {
      title: 'Decade Hop',
      description: `Explore ${discoveries.decades.length} decades spanning your collection`,
      icon: '◷',
      color: '#8B9FE8',
      decades: discoveries.decades,
      isDecade: true,
      available: discoveries.decades.length > 0,
    },
    {
      title: 'Surprise Me',
      description: 'Jump to a random song you might not have explored yet',
      icon: '✧',
      color: '#E84A6A',
      action: handleRandom,
      available: true,
    },
  ];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-5 py-3 rounded-full backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-2xl"
        style={{
          backgroundColor: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: open ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
          <circle cx="12" cy="12" r="10"/>
          <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>
        </svg>
        <span className="text-sm text-white/70 font-medium">Discover</span>
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          
          {/* Panel */}
          <div 
            className="fixed top-20 left-6 z-40 w-[380px] max-h-[75vh] overflow-y-auto bg-neutral-950/95 backdrop-blur-xl rounded-2xl p-5 shadow-2xl"
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              scrollbarWidth: 'thin',
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-white/90 tracking-wide">Discover</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white/80 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-[11px] text-white/40 mb-4 leading-relaxed">
              Explore your collection through different lenses
            </p>

            <div className="space-y-2">
              {cards.map((card, i) => (
                <div key={i}>
                  {card.isDecade ? (
                    <div
                      className="p-4 rounded-xl transition-all"
                      style={{
                        backgroundColor: `${card.color}08`,
                        border: `1px solid ${card.color}20`,
                      }}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-lg" style={{ color: card.color }}>{card.icon}</span>
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-white/90 mb-1">{card.title}</div>
                          <div className="text-[11px] text-white/50 leading-relaxed">{card.description}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {card.decades.map(([decade, count]) => (
                          <button
                            key={decade}
                            onClick={() => {
                              onFilter && onFilter({ type: 'decade', value: decade });
                              setOpen(false);
                            }}
                            className="px-2.5 py-1 rounded-full text-[10px] transition-all hover:scale-105"
                            style={{
                              backgroundColor: `${card.color}18`,
                              color: card.color,
                              border: `1px solid ${card.color}30`,
                            }}
                          >
                            {decade} <span className="opacity-60">· {count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={card.action}
                      disabled={!card.available}
                      className="w-full text-left p-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: `${card.color}08`,
                        border: `1px solid ${card.color}20`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg flex-shrink-0" style={{ color: card.color }}>{card.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white/90 mb-1">{card.title}</div>
                          <div className="text-[11px] text-white/50 leading-relaxed">{card.description}</div>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default DiscoverPanel;