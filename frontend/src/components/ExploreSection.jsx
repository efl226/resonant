// NOTE: computeMatches has been moved to ExplorePanel.jsx (new Map-based format).
// This file is kept for the ExploreSection UI component but is no longer rendered.
import { useState, useMemo } from 'react';
export { computeMatches } from './ExplorePanel';

// All connection types organized by category
const CATEGORIES = {
  spatial: {
    label: 'Spatial',
    color: '#8B9FE8',
    filters: [
      { id: 'nearby', label: 'Nearby Songs', description: 'Closest in the graph' },
      { id: 'same_cluster', label: 'Same Cluster', description: 'In the same grouping' },
    ],
  },
  curated: {
    label: 'Curated',
    color: '#B84AE8',
    filters: [
      { id: 'samples', label: 'Samples', linkType: 'samples' },
      { id: 'shared_musician', label: 'Shared Musicians', linkType: 'shared_musician' },
      { id: 'same_producer', label: 'Same Producer', linkType: 'same_producer' },
      { id: 'same_songwriter', label: 'Same Songwriter', linkType: 'same_songwriter' },
      { id: 'same_label', label: 'Same Label', linkType: 'same_label' },
      { id: 'same_studio', label: 'Same Studio', linkType: 'same_studio' },
      { id: 'shared_instruments', label: 'Shared Instruments', linkType: 'shared_instruments' },
      { id: 'harmonic_bridge', label: 'Harmonic Bridge', linkType: 'harmonic_bridge' },
    ],
  },
  attributes: {
    label: 'Attributes',
    color: '#6BCB77',
    filters: [
      { id: 'same_decade', label: 'Same Decade', field: 'decade' },
      { id: 'same_year', label: 'Same Year', field: 'year' },
      { id: 'same_key', label: 'Same Key', field: 'key' },
      { id: 'same_mode', label: 'Same Mode', field: 'mode' },
      { id: 'similar_bpm', label: 'Similar BPM (\u00b15)', field: 'bpm_range' },
      { id: 'similar_length', label: 'Similar Length', field: 'duration' },
      { id: 'shared_mood', label: 'Shares Mood', field: 'mood' },
      { id: 'shared_theme', label: 'Shares Theme', field: 'themes' },
      { id: 'shared_instrument', label: 'Shares Instrument', field: 'instruments' },
      { id: 'same_vocal_type', label: 'Same Vocal Type', field: 'vocal_type' },
      { id: 'same_rhythm_feel', label: 'Same Rhythm Feel', field: 'rhythm_feel' },
      { id: 'same_time_sig', label: 'Same Time Signature', field: 'time_signature' },
    ],
  },
};


const ExploreSection = ({ selectedNode, allNodes, allLinks, activeFilters, onToggleFilter, onNavigate, combineMode, onToggleMode, safeAccent }) => {
  const [expandedCategories, setExpandedCategories] = useState(new Set(['spatial']));

  const counts = useMemo(() => {
    const out = {};
    Object.values(CATEGORIES).forEach(cat => {
      cat.filters.forEach(f => {
        out[f.id] = computeMatches(f.id, selectedNode, allNodes, allLinks).size;
      });
    });
    return out;
  }, [selectedNode, allNodes, allLinks]);

  const matchedSongs = useMemo(() => {
    if (activeFilters.size === 0) return [];

    const sets = [...activeFilters].map(fid =>
      computeMatches(fid, selectedNode, allNodes, allLinks)
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
  }, [activeFilters, combineMode, selectedNode, allNodes, allLinks]);

  const toggleCategory = (key) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-[10px] uppercase tracking-[0.2em] font-bold"
          style={{ color: `rgba(${safeAccent}, 0.5)` }}
        >
          Explore Connections
        </h3>
        {activeFilters.size > 0 && (
          <button
            onClick={() => onToggleFilter('clear_all')}
            className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {activeFilters.size > 1 && (
        <div className="mb-3 flex items-center gap-2 text-[10px]">
          <span className="text-white/40">When multiple selected:</span>
          <button
            onClick={onToggleMode}
            className="px-2 py-0.5 rounded-full transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            {combineMode === 'intersection' ? 'Match ALL' : 'Match ANY'}
          </button>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {Object.entries(CATEGORIES).map(([catKey, cat]) => {
          const isExpanded = expandedCategories.has(catKey);
          const activeInCat = cat.filters.filter(f => activeFilters.has(f.id)).length;

          return (
            <div key={catKey} className="rounded-lg overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <button
                onClick={() => toggleCategory(catKey)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-[11px] font-semibold text-white/80">{cat.label}</span>
                  {activeInCat > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${cat.color}25`, color: cat.color }}>
                      {activeInCat}
                    </span>
                  )}
                </div>
                <span className="text-white/30 text-xs">{isExpanded ? '\u2212' : '+'}</span>
              </button>

              {isExpanded && (
                <div className="px-2 pb-2 space-y-1">
                  {cat.filters.map(f => {
                    const count = counts[f.id] || 0;
                    const isActive = activeFilters.has(f.id);
                    const isDisabled = count === 0;

                    return (
                      <button
                        key={f.id}
                        onClick={() => !isDisabled && onToggleFilter(f.id)}
                        disabled={isDisabled}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isActive ? `${cat.color}20` : 'transparent',
                          border: isActive ? `1px solid ${cat.color}40` : '1px solid transparent',
                        }}
                      >
                        <span
                          className="text-[11px]"
                          style={{ color: isActive ? cat.color : 'rgba(255,255,255,0.6)' }}
                        >
                          {f.label}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: isActive ? `${cat.color}aa` : 'rgba(255,255,255,0.25)' }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {matchedSongs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              {matchedSongs.length} matching {matchedSongs.length === 1 ? 'song' : 'songs'}
            </span>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
            {matchedSongs.map(song => (
              <button
                key={song.id}
                onClick={() => onNavigate(song)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-left"
              >
                {song.img && (
                  <img src={song.img} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-white/85 truncate">{song.name}</div>
                  <div className="text-[10px] text-white/40 truncate">{song.artist}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeFilters.size > 0 && matchedSongs.length === 0 && (
        <div className="text-[11px] text-white/30 italic text-center py-4">
          No songs match the current filters
        </div>
      )}
    </section>
  );
};

export { ExploreSection, CATEGORIES };
export default ExploreSection;