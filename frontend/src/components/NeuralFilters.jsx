import React, { useState, useMemo } from 'react';

const NeuralFilters = ({ data, activeFilter, onFilterChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // 1. Analyze the data to find unique traits
  const traits = useMemo(() => {
    return {
      years: [...new Set(data.nodes.map(n => Math.floor(n.year / 10) * 10 + 's'))].sort(),
      producers: [...new Set(data.nodes.map(n => n.genetic_dna.producer))].filter(Boolean).sort(),
      labels: [...new Set(data.nodes.map(n => n.genetic_dna.label))].filter(Boolean).sort(),
      instruments: [...new Set(data.nodes.flatMap(n => n.sonic_dna.prominent_instruments))].filter(Boolean).sort()
    };
  }, [data]);

  // Helper for rendering a section of buttons
  const FilterSection = ({ title, items, type }) => (
    <div className="mb-8">
      <h4 className="text-[10px] uppercase tracking-widest text-white/40 mb-3 font-bold">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <button
            key={item}
            onClick={() => onFilterChange(activeFilter?.value === item ? null : { type, value: item })}
            className={`px-3 py-1.5 rounded-full text-[11px] border transition-all duration-300 ${
              activeFilter?.value === item 
                ? 'bg-white text-black border-white font-bold shadow-[0_0_15px_rgba(255,255,255,0.4)]' 
                : 'bg-white/5 text-white/60 border-white/10 hover:border-white/40 hover:bg-white/10'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Floating Trigger Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 left-8 z-[100] bg-white text-black px-6 py-4 rounded-full font-bold text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 hover:scale-105 transition-transform hover:bg-neutral-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
        Neural Filters 
        {activeFilter && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
      </button>

      {/* The Slide-out Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-stretch">
          {/* Backdrop (Click to close) */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar Content */}
          <div className="relative w-[450px] bg-neutral-900 border-r border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            
            {/* Header */}
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
              <h2 className="text-2xl font-bold italic tracking-tighter text-white">Filter Latent Space</h2>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-white/40 hover:text-white transition-colors text-xl"
              >
                ✕
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <FilterSection title="Time Period" items={traits.years} type="year" />
              <FilterSection title="Genetic Lineage (Producers)" items={traits.producers} type="producer" />
              <FilterSection title="Institutional DNA (Labels)" items={traits.labels} type="label" />
              <FilterSection title="Sonic Architecture (Instruments)" items={traits.instruments} type="instrument" />
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-white/10 bg-neutral-900">
              <button 
                onClick={() => { onFilterChange(null); setIsOpen(false); }}
                className="w-full py-4 rounded-xl border border-white/10 text-xs uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                Reset Neural Path
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NeuralFilters;