import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const searchTypeLabels = {
  text: 'Text Match',
  filter: 'Filter',
  semantic: 'Vibes',
  similarity: 'Similar To',
  hybrid: 'Smart Match',
};

// Map filter keys to human-readable labels
const filterLabels = {
  artist: 'Artist',
  key: 'Key',
  mode: 'Mode',
  vocal_type: 'Vocal',
  rhythm_feel: 'Rhythm',
  producer: 'Producer',
  label: 'Label',
  decade: 'Decade',
  bpm_min: 'BPM Min',
  bpm_max: 'BPM Max',
  energy_min: 'Energy Min',
  energy_max: 'Energy Max',
  year_min: 'Year From',
  year_max: 'Year To',
};

// Breadcrumb colors by category
const breadcrumbColors = {
  artist: '#4A9EE8',
  key: '#E8C94A',
  mode: '#E8C94A',
  vocal_type: '#6BCB77',
  rhythm_feel: '#6BCB77',
  producer: '#B84AE8',
  label: '#B84AE8',
  decade: '#E8724A',
  bpm_min: '#4AE8D4',
  bpm_max: '#4AE8D4',
  energy_min: '#E84A6A',
  energy_max: '#E84A6A',
  year_min: '#E8724A',
  year_max: '#E8724A',
  instruments: '#4AE88B',
  mood: '#E84A6A',
  themes: '#8B9FE8',
};

const SearchBar = ({ data, onSelect, onSearchResults, onReset, searchActive }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [interpretation, setInterpretation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState({}); // Active filter breadcrumbs
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const localSearch = useCallback((q) => {
    if (!q || !data?.nodes) return [];
    const lower = q.toLowerCase();
    return data.nodes
      .filter(node =>
        node.name.toLowerCase().includes(lower) ||
        node.artist.toLowerCase().includes(lower) ||
        (node.album && node.album.toLowerCase().includes(lower))
      )
      .slice(0, 5);
  }, [data]);

  // Extract breadcrumbs from Gemini's interpretation
  const extractBreadcrumbs = (filters) => {
    const crumbs = {};
    if (!filters) return crumbs;

    // Simple string/number filters
    const simpleKeys = ['artist', 'key', 'mode', 'vocal_type', 'rhythm_feel', 'producer', 'label', 'decade',
                        'bpm_min', 'bpm_max', 'energy_min', 'energy_max', 'year_min', 'year_max'];
    for (const key of simpleKeys) {
      if (filters[key] !== null && filters[key] !== undefined) {
        crumbs[key] = filters[key];
      }
    }

    // Array filters — each item becomes its own breadcrumb
    if (filters.instruments?.length > 0) {
      crumbs.instruments = filters.instruments;
    }
    if (filters.mood?.length > 0) {
      crumbs.mood = filters.mood;
    }
    if (filters.themes?.length > 0) {
      crumbs.themes = filters.themes;
    }

    return crumbs;
  };

  // Build combined filters from all active breadcrumbs
  const buildFiltersFromBreadcrumbs = (crumbs) => {
    const filters = {};
    for (const [key, value] of Object.entries(crumbs)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length === 0) continue;
        filters[key] = value;
      }
    }
    return filters;
  };

  // Run filter query directly (no Gemini)
  const runDirectFilter = useCallback(async (filters) => {
    if (Object.keys(filters).length === 0) {
      if (onSearchResults) onSearchResults(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/filter-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      const data = await response.json();
      setResults(data.results || []);

      if (onSearchResults && data.results?.length > 0) {
        onSearchResults(data.results.map(r => r.id));
      } else if (onSearchResults) {
        onSearchResults(null);
      }
    } catch (e) {
      console.warn('[Search] Filter error:', e);
    }
    setLoading(false);
  }, [onSearchResults]);

  // API search with Gemini interpretation
  const apiSearch = useCallback(async (q) => {
    if (!q || q.length < 2) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&limit=20`);
      const searchData = await response.json();
      setResults(searchData.results || []);
      setInterpretation(searchData.interpretation || null);

      const interp = searchData.interpretation;
      const type = interp?.type;

      if (type === 'semantic' || type === 'similarity') {
        // Semantic/similarity — no breadcrumbs, just filter the graph
        setIsSemanticSearch(true);
        setBreadcrumbs({});
        if (onSearchResults && searchData.results?.length > 0) {
          onSearchResults(searchData.results.map(r => r.id));
        }
      } else if (type === 'filter' || type === 'hybrid' || type === 'text') {
        // Extract structured filters as breadcrumbs
        const newCrumbs = extractBreadcrumbs(interp?.filters);
        
        // Stack with existing breadcrumbs
        const merged = { ...breadcrumbs };
        for (const [key, value] of Object.entries(newCrumbs)) {
          if (Array.isArray(value) && Array.isArray(merged[key])) {
            // Merge arrays and deduplicate
            const combined = [...new Set([...merged[key], ...value])];
            merged[key] = combined;
          } else {
            merged[key] = value;
          }
        }
        
        setBreadcrumbs(merged);
        setIsSemanticSearch(false);

        // Filter using combined breadcrumbs
        if (onSearchResults && searchData.results?.length > 0) {
          onSearchResults(searchData.results.map(r => r.id));
        }
      }
    } catch (e) {
      console.warn('[Search] API error:', e);
    }
    setLoading(false);
  }, [onSearchResults, breadcrumbs]);

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setShowResults(true);

    if (value.length > 0) {
      const local = localSearch(value);
      setResults(local.map(n => ({
        id: n.id,
        name: n.name,
        artist: n.artist,
        album: n.album,
        img: n.img,
        primary_color: n.visual_dna?.primary_color,
        _isLocal: true,
      })));
      setInterpretation(null);
    } else {
      setResults([]);
      setInterpretation(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => apiSearch(value), 600);
    }
  };

  const handleSelect = (result) => {
    const node = data.nodes.find(n => n.id === result.id);
    if (node) {
      onSelect(node);
    }
    setShowResults(false);
  };

  // Remove a single breadcrumb and re-filter
  const removeBreadcrumb = (key, arrayValue = null) => {
    const updated = { ...breadcrumbs };

    if (arrayValue && Array.isArray(updated[key])) {
      updated[key] = updated[key].filter(v => v !== arrayValue);
      if (updated[key].length === 0) {
        delete updated[key];
      }
    } else {
      delete updated[key];
    }

    setBreadcrumbs(updated);

    if (Object.keys(updated).length === 0) {
      // No more breadcrumbs — reset to full graph
      if (onReset) onReset();
      setIsSemanticSearch(false);
    } else {
      // Re-run filter with remaining breadcrumbs
      const filters = buildFiltersFromBreadcrumbs(updated);
      runDirectFilter(filters);
    }
  };

  const handleReset = () => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    setInterpretation(null);
    setBreadcrumbs({});
    setIsSemanticSearch(false);
    if (onReset) onReset();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (searchActive || Object.keys(breadcrumbs).length > 0) {
        handleReset();
      } else {
        setQuery("");
        setResults([]);
        setShowResults(false);
        inputRef.current?.blur();
      }
    }
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      const container = document.getElementById('search-container');
      if (container && !container.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen for filter events from Sidebar
  useEffect(() => {
    const handleAddFilter = (e) => {
      const { key, value } = e.detail;
      
      const updated = { ...breadcrumbs };
      
      // Array-type filters: instruments, mood, themes
      if (['instruments', 'mood', 'themes'].includes(key)) {
        if (!updated[key]) {
          updated[key] = [value];
        } else if (!updated[key].includes(value)) {
          updated[key] = [...updated[key], value];
        } else {
          return; // Already exists
        }
      } else {
        updated[key] = value;
      }

      setBreadcrumbs(updated);
      setIsSemanticSearch(false);
      
      // Run the filter
      const filters = buildFiltersFromBreadcrumbs(updated);
      runDirectFilter(filters);
    };

    window.addEventListener('resonant-add-filter', handleAddFilter);
    return () => window.removeEventListener('resonant-add-filter', handleAddFilter);
  }, [breadcrumbs, runDirectFilter]);

  const searchType = interpretation?.type;
  const explanation = interpretation?.explanation;
  const hasBreadcrumbs = Object.keys(breadcrumbs).length > 0;
  const isFiltered = searchActive || hasBreadcrumbs;

  // Build flat list of breadcrumb pills
  const breadcrumbPills = [];
  for (const [key, value] of Object.entries(breadcrumbs)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        breadcrumbPills.push({ key, value: item, isArray: true });
      }
    } else {
      // Combine bpm_min/bpm_max into one pill
      if (key === 'bpm_min' && breadcrumbs.bpm_max) {
        breadcrumbPills.push({ key: 'bpm_range', value: `${value}–${breadcrumbs.bpm_max} BPM`, isArray: false, removeKeys: ['bpm_min', 'bpm_max'] });
      } else if (key === 'bpm_max' && breadcrumbs.bpm_min) {
        continue; // Already handled by bpm_min
      } else if (key === 'energy_min' && breadcrumbs.energy_max) {
        breadcrumbPills.push({ key: 'energy_range', value: `Energy ${value}–${breadcrumbs.energy_max}`, isArray: false, removeKeys: ['energy_min', 'energy_max'] });
      } else if (key === 'energy_max' && breadcrumbs.energy_min) {
        continue;
      } else if (key === 'year_min' && breadcrumbs.year_max) {
        breadcrumbPills.push({ key: 'year_range', value: `${value}–${breadcrumbs.year_max}`, isArray: false, removeKeys: ['year_min', 'year_max'] });
      } else if (key === 'year_max' && breadcrumbs.year_min) {
        continue;
      } else {
        breadcrumbPills.push({ key, value: String(value), isArray: false });
      }
    }
  }

  return (
    <div id="search-container" className="absolute top-5 left-5 z-10 w-[420px]">
      {/* Search input + reset */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            placeholder={hasBreadcrumbs ? "Add another filter..." : "Search songs, moods, vibes, or ask anything..."}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="w-full bg-black/80 border border-white/10 text-white px-5 py-3 rounded-full backdrop-blur-md outline-none focus:border-white/30 shadow-2xl transition-all text-sm"
            style={isFiltered ? { borderColor: 'rgba(74, 158, 232, 0.4)' } : {}}
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {isFiltered && (
          <button
            onClick={handleReset}
            className="bg-white/10 hover:bg-white/20 text-white/60 hover:text-white px-4 py-3 rounded-full transition-all text-sm flex-shrink-0 backdrop-blur-md border border-white/10"
            title="Reset to full graph (Esc)"
          >
            ✕ Reset
          </button>
        )}
      </div>

      {/* Breadcrumb pills */}
      {breadcrumbPills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {breadcrumbPills.map((pill, i) => {
            const color = breadcrumbColors[pill.key] || breadcrumbColors[pill.key.replace('_range', '_min')] || '#888';
            const label = filterLabels[pill.key] || pill.key.replace(/_/g, ' ');

            return (
              <button
                key={`${pill.key}-${pill.value}-${i}`}
                onClick={() => {
                  if (pill.removeKeys) {
                    // Remove multiple keys (like bpm_min + bpm_max)
                    const updated = { ...breadcrumbs };
                    pill.removeKeys.forEach(k => delete updated[k]);
                    setBreadcrumbs(updated);
                    if (Object.keys(updated).length === 0) {
                      if (onReset) onReset();
                    } else {
                      runDirectFilter(buildFiltersFromBreadcrumbs(updated));
                    }
                  } else if (pill.isArray) {
                    removeBreadcrumb(pill.key, pill.value);
                  } else {
                    removeBreadcrumb(pill.key);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all hover:opacity-70 cursor-pointer"
                style={{
                  backgroundColor: `${color}18`,
                  border: `1px solid ${color}35`,
                  color: color,
                }}
              >
                <span className="text-[10px] opacity-60 uppercase">{label}:</span>
                <span className="font-medium">{pill.value}</span>
                <span className="ml-1 opacity-50 hover:opacity-100">✕</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Semantic search indicator (no breadcrumbs for vibes) */}
      {isSemanticSearch && searchActive && !hasBreadcrumbs && !showResults && (
        <div className="mt-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 uppercase tracking-wider">
            Vibes
          </span>
          <span className="text-xs text-white/40 truncate">
            {query || 'Semantic search active'}
          </span>
        </div>
      )}

      {/* Results dropdown */}
      {showResults && results.length > 0 && (
        <div className="mt-2 bg-black/95 border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl shadow-2xl">
          
          {searchType && searchType !== 'text' && (
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 uppercase tracking-wider">
                {searchTypeLabels[searchType] || searchType}
              </span>
              {explanation && (
                <span className="text-[11px] text-white/25 truncate">{explanation}</span>
              )}
            </div>
          )}

          <ul className="max-h-[350px] overflow-y-auto">
            {results.map((result, i) => (
              <li
                key={result.id || i}
                onClick={() => handleSelect(result)}
                className="px-4 py-3 hover:bg-white/8 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0 transition-colors"
              >
                {result.img ? (
                  <img src={result.img} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div
                    className="w-9 h-9 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: result.primary_color || '#333' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{result.name}</div>
                  <div className="text-white/40 text-xs truncate">
                    {result.artist}
                    {result.album && ` · ${result.album}`}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {result.similarity && (
                    <span className="text-[10px] text-white/30">
                      {Math.round(result.similarity * 100)}%
                    </span>
                  )}
                  {result.mood && result.mood.length > 0 && !result._isLocal && (
                    <span className="text-[10px] text-white/20 truncate max-w-[80px]">
                      {result.mood[0]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchBar;