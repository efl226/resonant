import React, { useState, useEffect, useRef } from 'react';
import { saveEdits as apiSaveEdits } from '../api/client';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255';
};

const linkTypeConfig = {
  samples: { label: 'SAMPLES', color: '#E8724A', icon: '⟲' },
  shared_musician: { label: 'SHARED MUSICIAN', color: '#6BCB77', icon: '♫' },
  same_producer: { label: 'SAME PRODUCER', color: '#B84AE8', icon: '◉' },
  same_songwriter: { label: 'SAME SONGWRITER', color: '#D44AE8', icon: '✎' },
  same_label: { label: 'SAME LABEL', color: '#8B9FE8', icon: '◎' },
  same_studio: { label: 'SAME STUDIO', color: '#9B72CF', icon: '⌂' },
  shared_instruments: { label: 'SHARED INSTRUMENTS', color: '#4AE8D4', icon: '◈' },
  harmonic_bridge: { label: 'HARMONIC BRIDGE', color: '#E8C94A', icon: '♪' },
  same_key_bpm: { label: 'HARMONIC MATCH', color: '#E8C94A', icon: '♪' },
  same_artist: { label: 'SAME ARTIST', color: '#4A9EE8', icon: '●' },
  same_mood: { label: 'MOOD', color: '#E84A6A', icon: '◐' },
  same_feel: { label: 'FEEL', color: '#8B9FE8', icon: '∿' },
};

const addFilter = (key, value) => {
  window.dispatchEvent(new CustomEvent('resonant-add-filter', {
    detail: { key, value }
  }));
};

const FilterPill = ({ value, filterKey, accentRgb }) => {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        addFilter(filterKey, value);
      }}
      className="px-2 py-0.5 rounded text-[11px] cursor-pointer transition-all hover:scale-105"
      style={{
        backgroundColor: `rgba(${accentRgb}, 0.08)`,
        color: `rgba(${accentRgb}, 0.65)`,
        border: `1px solid rgba(${accentRgb}, 0.12)`,
      }}
      title={`Filter by ${filterKey}: ${value}`}
    >
      {value}
    </span>
  );
};

// Defined outside Sidebar so React gets a stable component type reference (avoids remount on each render)
const ArrayTag = ({ item, idx, field, aiArr, filterKey, filterValue, editMode, onRemove, tagStyle, textStyle }) => (
  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs" style={tagStyle}>
    <span
      className={editMode ? '' : 'cursor-pointer hover:opacity-80'}
      onClick={editMode ? undefined : () => addFilter(filterKey, filterValue ?? item)}
      title={editMode ? undefined : `Filter by ${filterKey}: ${filterValue ?? item}`}
      style={textStyle}
    >{item}</span>
    {editMode && (
      <button
        onClick={() => onRemove(field, aiArr, idx)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
      >×</button>
    )}
  </span>
);

const AddTagInput = ({ value, onChangeVal, onAdd, placeholder }) => (
  <input
    value={value || ''}
    onChange={e => onChangeVal(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
    placeholder={placeholder || '+ add'}
    style={addTagInputStyle}
  />
);

const SIDEBAR_WIDTH = 420;
const COLLAPSED_WIDTH = 48;

const editInputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  color: 'rgba(255,255,255,0.8)',
  fontSize: 12,
  padding: '3px 7px',
  outline: 'none',
  width: '100%',
  fontFamily: 'Inter, system-ui, sans-serif',
};

const addTagInputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px dashed rgba(255,255,255,0.15)',
  borderRadius: 20,
  color: 'rgba(255,255,255,0.5)',
  fontSize: 11,
  padding: '3px 10px',
  outline: 'none',
  width: 80,
  fontFamily: 'Inter, system-ui, sans-serif',
};

const Sidebar = ({ node, links, onClose, onPlay, onNavigate }) => {
  const [showLyrics, setShowLyrics] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [localEdits, setLocalEdits] = useState({});
  const [localNotes, setLocalNotes] = useState('');
  const [addingValues, setAddingValues] = useState({});
  const saveTimerRef = useRef(null);
  const editsCacheRef = useRef({});

  useEffect(() => {
    setCollapsed(false);
    setShowLyrics(false);
    setEditMode(false);
    setAddingValues({});
    const cached = editsCacheRef.current[node?.id];
    if (cached) {
      setLocalEdits(cached.edits);
      setLocalNotes(cached.notes);
    } else {
      setLocalEdits(node?.user_edits || {});
      setLocalNotes(node?.user_notes || '');
    }
  }, [node?.id]);

  if (!node) return null;

  const accent = node.visual_dna?.primary_color || '#ffffff';
  const accentRgb = hexToRgb(accent);
  const palette = node.visual_dna?.palette || [];
  const musicianCredits = node.genetic_dna?.musician_credits || {};
  const samplesFrom = node.genetic_dna?.samples_from || [];

  // Derived values: user_edits take precedence over AI values
  const ed = localEdits;
  const mood = ed.mood ?? (node.semantic_dna?.mood || []);
  const themes = ed.themes ?? (node.semantic_dna?.themes || []);
  const instruments = ed.prominent_instruments ?? (node.sonic_dna?.prominent_instruments || []);
  const songwriterList = ed.songwriter ?? (node.genetic_dna?.songwriter || []);
  const aiSummary = 'ai_summary' in ed ? ed.ai_summary : node.semantic_dna?.ai_summary;
  const funFact = 'fun_fact' in ed ? ed.fun_fact : node.semantic_dna?.fun_fact;
  const producer = 'producer' in ed ? ed.producer : node.genetic_dna?.producer;
  const mixEngineer = 'mixing_engineer' in ed ? ed.mixing_engineer : node.genetic_dna?.mixing_engineer;
  const labelVal = 'label' in ed ? ed.label : node.genetic_dna?.label;
  const studioVal = 'studio' in ed ? ed.studio : node.genetic_dna?.studio;

  const debounceSave = (edits, notes) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      apiSaveEdits(node.id, { edits, notes }).catch(console.warn);
    }, 600);
  };

  const setField = (field, value) => {
    const next = { ...localEdits, [field]: value };
    setLocalEdits(next);
    editsCacheRef.current[node.id] = { edits: next, notes: localNotes };
    debounceSave(next, localNotes);
  };

  const setNotes = (val) => {
    setLocalNotes(val);
    editsCacheRef.current[node.id] = { edits: localEdits, notes: val };
    debounceSave(localEdits, val);
  };

  const removeArrayItem = (field, aiArr, idx) => {
    const current = (field in localEdits ? localEdits[field] : aiArr) || [];
    setField(field, current.filter((_, i) => i !== idx));
  };

  const addArrayItem = (field, aiArr) => {
    const val = (addingValues[field] || '').trim();
    if (!val) return;
    const current = (field in localEdits ? localEdits[field] : aiArr) || [];
    setField(field, [...current, val]);
    setAddingValues(prev => ({ ...prev, [field]: '' }));
  };

  const shellStyle = {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100%',
    zIndex: 50,
    backgroundColor: 'rgba(10,10,10,0.97)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderLeft: `1px solid rgba(${accentRgb}, 0.18)`,
    boxShadow: `-20px 0 60px rgba(${accentRgb}, 0.06), -4px 0 24px rgba(0,0,0,0.8)`,
    width: collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH,
    transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  };

  // ── Collapsed strip ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={shellStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', paddingTop: 12, gap: 12 }}>
          <button
            onClick={() => setCollapsed(false)}
            style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
            title="Expand sidebar"
          >‹</button>

          {node.img && (
            <img
              src={node.img}
              alt=""
              onClick={() => setCollapsed(false)}
              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0, cursor: 'pointer', boxShadow: `0 0 0 1px rgba(${accentRgb}, 0.3)` }}
            />
          )}

          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: accent, boxShadow: `0 0 8px ${accent}88`, flexShrink: 0 }} />

          <div
            onClick={() => setCollapsed(false)}
            style={{
              writingMode: 'vertical-rl', transform: 'rotate(180deg)',
              fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
              cursor: 'pointer', overflow: 'hidden', maxHeight: 200,
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: '0.02em', userSelect: 'none',
            }}
            title={node.name}
          >{node.name}</div>

          <button
            onClick={onClose}
            style={{
              marginTop: 'auto', marginBottom: 16,
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 16,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
            title="Close"
          >×</button>
        </div>
      </div>
    );
  }

  // ── Expanded sidebar ───────────────────────────────────────────────────────
  return (
    <div style={{ ...shellStyle, overflowY: 'auto' }}>

      {/* Top controls */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        display: 'flex', alignItems: 'center', gap: 6, zIndex: 10,
        backgroundColor: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 24,
        padding: '5px 8px',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {/* Edit toggle */}
        <button
          onClick={() => setEditMode(m => !m)}
          style={{
            width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: editMode ? `rgba(${accentRgb}, 0.25)` : 'transparent',
            border: editMode ? `1px solid rgba(${accentRgb}, 0.5)` : '1px solid transparent',
            color: editMode ? `rgba(${accentRgb}, 1)` : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: 13,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!editMode) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,1)'; } }}
          onMouseLeave={e => { if (!editMode) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; } }}
          title={editMode ? 'Done editing' : 'Edit this song\'s info'}
        >{editMode ? '✓' : '✎'}</button>

        {/* Collapse */}
        <button
          onClick={() => setCollapsed(true)}
          style={{
            width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: '1px solid transparent',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          title="Collapse sidebar"
        >›</button>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: '1px solid transparent',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 18,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = `rgba(${accentRgb}, 1)`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          title="Close"
        >×</button>
      </div>

      {/* HERO */}
      <div className="relative">
        <img src={node.img} alt="cover" className="w-full" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, transparent 30%, rgba(${accentRgb}, 0.15) 60%, rgb(10, 10, 10) 100%)` }}
        />
      </div>

      <div className="px-8 pb-8 -mt-12 relative z-10">

        {/* HEADER */}
        <h1 className="text-3xl font-bold tracking-tight mb-1">{node.name}</h1>
        <h2
          className="text-lg mb-1 cursor-pointer hover:opacity-80 transition-opacity"
          style={{ color: `rgba(${accentRgb}, 0.7)` }}
          onClick={() => addFilter('artist', node.artist)}
          title={`Filter by artist: ${node.artist}`}
        >{node.artist}</h2>
        <div className="text-sm text-white/25 mb-2">
          {node.album && <span className="italic">{node.album}</span>}
          {node.album && node.year && <span> • </span>}
          {node.year && (
            <span
              className="cursor-pointer hover:text-white/50 transition-colors"
              onClick={() => addFilter('decade', `${Math.floor(node.year / 10) * 10}s`)}
              title="Filter by decade"
            >{node.year}</span>
          )}
          {labelVal && (
            <>
              <span> • </span>
              <span
                className={editMode ? '' : 'cursor-pointer hover:text-white/50 transition-colors'}
                onClick={editMode ? undefined : () => addFilter('label', labelVal)}
                title={editMode ? undefined : `Filter by label: ${labelVal}`}
              >{labelVal}</span>
            </>
          )}
        </div>

        {/* Quick stats row */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {node.sonic_dna?.bpm && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50">{node.sonic_dna.bpm} BPM</span>
          )}
          {node.sonic_dna?.key && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => addFilter('key', node.sonic_dna.key)}>{node.sonic_dna.key}</span>
          )}
          {node.sonic_dna?.time_signature && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50">{node.sonic_dna.time_signature}</span>
          )}
          {node.sonic_dna?.duration && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50">{node.sonic_dna.duration}</span>
          )}
          {node.sonic_dna?.vocal_type && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => addFilter('vocal_type', node.sonic_dna.vocal_type)}>{node.sonic_dna.vocal_type}</span>
          )}
          {node.sonic_dna?.mode && (
            <span className="px-2 py-1 rounded text-[11px] bg-white/5 text-white/50 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => addFilter('mode', node.sonic_dna.mode)}>{node.sonic_dna.mode}</span>
          )}
        </div>

        {/* Play button */}
        {node.spotify_uri && onPlay && (
          <button
            onClick={() => onPlay(node)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4 transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: '#1DB954', color: 'white' }}
          >▶ Play this song</button>
        )}

        <div className="space-y-6">

          {/* PALETTE */}
          {palette.length > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden w-full">
              {palette.map((color, i) => (
                <div key={i} style={{ backgroundColor: color }} className="flex-1" />
              ))}
            </div>
          )}

          {/* FUN FACT */}
          {(funFact || editMode) && (
            <div
              className="p-4 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: `rgba(${accentRgb}, 0.06)`, borderLeft: `3px solid rgba(${accentRgb}, 0.4)` }}
            >
              <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-2">Did you know?</span>
              {editMode ? (
                <textarea
                  value={funFact || ''}
                  onChange={e => setField('fun_fact', e.target.value)}
                  placeholder="Add a fun fact..."
                  rows={3}
                  style={{ ...editInputStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
              ) : (
                <span className="text-white/70">{funFact}</span>
              )}
            </div>
          )}

          {/* MOOD & THEMES */}
          <section>
            <div className="flex flex-wrap gap-2 mb-3">
              {mood.map((m, i) => (
                <ArrayTag
                  key={i} item={m} idx={i}
                  field="mood" aiArr={node.semantic_dna?.mood || []}
                  filterKey="mood" editMode={editMode} onRemove={removeArrayItem}
                  tagStyle={{ backgroundColor: `rgba(${accentRgb}, 0.12)`, border: `1px solid rgba(${accentRgb}, 0.2)` }}
                  textStyle={{ color: `rgba(${accentRgb}, 0.8)`, fontWeight: 500 }}
                />
              ))}
              {themes.map((tag, i) => (
                <ArrayTag
                  key={`t-${i}`} item={`#${tag}`} idx={i}
                  field="themes" aiArr={node.semantic_dna?.themes || []}
                  filterKey="themes" filterValue={tag}
                  editMode={editMode} onRemove={removeArrayItem}
                  tagStyle={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  textStyle={{ color: 'rgba(255,255,255,0.5)' }}
                />
              ))}
              {editMode && (
                <>
                  <AddTagInput
                    value={addingValues.mood}
                    onChangeVal={v => setAddingValues(prev => ({ ...prev, mood: v }))}
                    onAdd={() => addArrayItem('mood', node.semantic_dna?.mood || [])}
                    placeholder="+ mood"
                  />
                  <AddTagInput
                    value={addingValues.themes}
                    onChangeVal={v => setAddingValues(prev => ({ ...prev, themes: v }))}
                    onAdd={() => addArrayItem('themes', node.semantic_dna?.themes || [])}
                    placeholder="+ theme"
                  />
                </>
              )}
            </div>
          </section>

          {/* AI SUMMARY */}
          {(aiSummary || editMode) && (
            editMode ? (
              <textarea
                value={aiSummary || ''}
                onChange={e => setField('ai_summary', e.target.value)}
                placeholder="Add a description..."
                rows={3}
                className="text-sm text-white/45 leading-relaxed italic"
                style={{ ...editInputStyle, resize: 'vertical', lineHeight: 1.65, fontStyle: 'normal' }}
              />
            ) : (
              <p className="text-sm text-white/45 leading-relaxed italic">"{aiSummary}"</p>
            )
          )}

          {/* SAMPLING */}
          {samplesFrom.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3" style={{ color: '#E8724A' }}>Samples</h3>
              <div className="space-y-2">
                {samplesFrom.map((sample, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg text-xs"
                    style={{ backgroundColor: 'rgba(232, 114, 74, 0.08)', border: '1px solid rgba(232, 114, 74, 0.15)' }}
                  >
                    <span className="text-white/80 font-medium">{sample.sampled_song}</span>
                    <span className="text-white/40 cursor-pointer hover:text-white/60 transition-colors" onClick={() => addFilter('artist', sample.sampled_artist)}> by {sample.sampled_artist}</span>
                    {sample.element && <span className="text-white/30 block mt-1">{sample.element}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* INSTRUMENTS */}
          {(instruments.length > 0 || editMode) && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Instruments</h3>
              <div className="flex flex-wrap gap-1.5">
                {instruments.map((inst, i) => (
                  editMode ? (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                      style={{ backgroundColor: `rgba(${accentRgb}, 0.08)`, color: `rgba(${accentRgb}, 0.65)`, border: `1px solid rgba(${accentRgb}, 0.12)` }}
                    >
                      <span>{inst}</span>
                      <button
                        onClick={() => removeArrayItem('prominent_instruments', node.sonic_dna?.prominent_instruments || [], i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: 0, lineHeight: 1 }}
                        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                      >×</button>
                    </span>
                  ) : (
                    <FilterPill key={i} value={inst} filterKey="instruments" accentRgb={accentRgb} />
                  )
                ))}
                {editMode && (
                  <AddTagInput
                    value={addingValues.prominent_instruments}
                    onChangeVal={v => setAddingValues(prev => ({ ...prev, prominent_instruments: v }))}
                    onAdd={() => addArrayItem('prominent_instruments', node.sonic_dna?.prominent_instruments || [])}
                    placeholder="+ instrument"
                  />
                )}
              </div>
            </section>
          )}

          {/* GEAR */}
          {(node.sonic_dna?.instrument_credits || []).some(c => c.make || c.model) && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Gear</h3>
              <div className="grid grid-cols-1 gap-0">
                {(node.sonic_dna.instrument_credits).filter(c => c.make || c.model).map((credit, i, arr) => {
                  const gearVal = [credit.make, credit.model].filter(Boolean).join(' ');
                  return (
                    <div
                      key={i}
                      className="flex items-baseline gap-3 py-1.5 text-xs"
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    >
                      <span className="text-white/30 text-[10px] uppercase tracking-wider flex-shrink-0 w-20 leading-snug">{credit.instrument}</span>
                      <span
                        className="text-white/75 font-medium cursor-pointer hover:text-white transition-colors flex-1"
                        onClick={() => addFilter('gear', gearVal)}
                        title={`Filter: ${gearVal}`}
                      >{gearVal}</span>
                      {credit.player && <span className="text-white/30 italic text-[10px] flex-shrink-0">{credit.player}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* MUSICIAN CREDITS */}
          {Object.keys(musicianCredits).length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Musicians</h3>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(musicianCredits).map(([name, role], i) => (
                  <div key={i} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-white/70">{name}</span>
                    <span className="text-white/30 italic cursor-pointer hover:text-white/50 transition-colors" onClick={() => addFilter('instruments', role)}>{role}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PRODUCTION */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Production</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {(producer || editMode) && (
                <div>
                  <div className="text-white/30 mb-0.5">PRODUCER</div>
                  {editMode ? (
                    <input
                      value={producer || ''}
                      onChange={e => setField('producer', e.target.value)}
                      style={editInputStyle}
                      placeholder="Producer"
                    />
                  ) : (
                    <div className="text-white/80 cursor-pointer hover:text-white transition-colors" onClick={() => addFilter('producer', producer)}>{producer}</div>
                  )}
                </div>
              )}
              {(mixEngineer || editMode) && (
                <div>
                  <div className="text-white/30 mb-0.5">MIX ENGINEER</div>
                  {editMode ? (
                    <input
                      value={mixEngineer || ''}
                      onChange={e => setField('mixing_engineer', e.target.value)}
                      style={editInputStyle}
                      placeholder="Mix engineer"
                    />
                  ) : (
                    <div className="text-white/80">{mixEngineer}</div>
                  )}
                </div>
              )}
              {(songwriterList.length > 0 || editMode) && (
                <div className="col-span-2">
                  <div className="text-white/30 mb-0.5">SONGWRITERS</div>
                  {editMode ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {songwriterList.map((sw, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                          <span>{sw}</span>
                          <button onClick={() => removeArrayItem('songwriter', node.genetic_dna?.songwriter || [], i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: 0, lineHeight: 1 }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>×</button>
                        </span>
                      ))}
                      <AddTagInput
                        value={addingValues.songwriter}
                        onChangeVal={v => setAddingValues(prev => ({ ...prev, songwriter: v }))}
                        onAdd={() => addArrayItem('songwriter', node.genetic_dna?.songwriter || [])}
                        placeholder="+ name"
                      />
                    </div>
                  ) : (
                    <div className="text-white/80">
                      {songwriterList.map((sw, i) => (
                        <span key={i}>{i > 0 && ', '}<span className="cursor-pointer hover:text-white transition-colors" onClick={() => addFilter('artist', sw)}>{sw}</span></span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(labelVal || editMode) && (
                <div>
                  <div className="text-white/30 mb-0.5">LABEL</div>
                  {editMode ? (
                    <input
                      value={labelVal || ''}
                      onChange={e => setField('label', e.target.value)}
                      style={editInputStyle}
                      placeholder="Label"
                    />
                  ) : (
                    <div className="text-white/80 cursor-pointer hover:text-white transition-colors" onClick={() => addFilter('label', labelVal)}>{labelVal}</div>
                  )}
                </div>
              )}
              {(studioVal || editMode) && (
                <div className="col-span-2">
                  <div className="text-white/30 mb-0.5">STUDIO</div>
                  {editMode ? (
                    <input
                      value={studioVal || ''}
                      onChange={e => setField('studio', e.target.value)}
                      style={editInputStyle}
                      placeholder="Studio"
                    />
                  ) : (
                    <div className="text-white/80 font-mono text-[10px]">{studioVal}</div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* SONIC CHARACTER */}
          {(node.sonic_dna?.energy !== null || node.sonic_dna?.rhythm_feel) && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Sonic Character</h3>
              <div className="space-y-2">
                {node.sonic_dna?.energy !== null && (
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/30">Energy</span>
                      <span className="text-white/50">{node.sonic_dna.energy_shape || ''}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(node.sonic_dna.energy || 0) * 100}%`, backgroundColor: `rgba(${accentRgb}, 0.6)` }}
                      />
                    </div>
                  </div>
                )}
                {node.sonic_dna?.bass_weight !== null && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Bass', value: node.sonic_dna?.bass_weight },
                      { label: 'Mid', value: node.sonic_dna?.mid_weight },
                      { label: 'Treble', value: node.sonic_dna?.treble_weight },
                    ].map((band, i) => band.value !== null && band.value !== undefined && (
                      <div key={i}>
                        <div className="text-[10px] text-white/25 mb-1">{band.label}</div>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(band.value || 0) * 100}%`, backgroundColor: `rgba(${accentRgb}, 0.4)` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {node.sonic_dna?.rhythm_feel && node.sonic_dna.rhythm_feel !== 'straight' && (
                  <div className="text-xs text-white/40 cursor-pointer hover:text-white/60 transition-colors" onClick={() => addFilter('rhythm_feel', node.sonic_dna.rhythm_feel)}>
                    Rhythm: <span className="text-white/60">{node.sonic_dna.rhythm_feel}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* MUSICBRAINZ CREDITS */}
          {node.mb_credits && node.mb_credits.credits && node.mb_credits.credits.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Recording Credits</h3>

              {/* Recording info line */}
              {(node.mb_credits.location || node.mb_credits.begin) && (
                <div className="text-[11px] text-white/35 italic mb-3 flex flex-wrap gap-1 items-center">
                  {node.mb_credits.location && (
                    <span
                      className="cursor-pointer hover:text-white/70 transition-colors"
                      onClick={() => addFilter('mb_location', node.mb_credits.location)}
                      title={`Filter: recorded at ${node.mb_credits.location}`}
                    >{node.mb_credits.location}</span>
                  )}
                  {node.mb_credits.location && (node.mb_credits.begin || node.mb_credits.end) && <span>·</span>}
                  {(node.mb_credits.begin || node.mb_credits.end) && (
                    <span>
                      {node.mb_credits.begin && node.mb_credits.end && node.mb_credits.begin !== node.mb_credits.end
                        ? `${node.mb_credits.begin} – ${node.mb_credits.end}`
                        : node.mb_credits.begin || node.mb_credits.end}
                    </span>
                  )}
                </div>
              )}

              {/* Credits list grouped by role */}
              {(() => {
                const grouped = {};
                node.mb_credits.credits.forEach(c => {
                  const roleLabel = c.attr_str
                    ? `${c.role} (${c.attr_str})`
                    : c.role;
                  if (!grouped[roleLabel]) grouped[roleLabel] = [];
                  if (!grouped[roleLabel].includes(c.name)) grouped[roleLabel].push(c.name);
                });
                return (
                  <div className="grid grid-cols-1 gap-0">
                    {Object.entries(grouped).map(([role, names], i, arr) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 py-1.5 text-xs"
                        style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                      >
                        <span className="text-white/30 text-[10px] uppercase tracking-wider flex-shrink-0 w-28 leading-snug">{role}</span>
                        <span className="text-white/75 flex-1 break-words">
                          {names.map((name, ni) => (
                            <span key={ni}>
                              {ni > 0 && ', '}
                              <span
                                className="cursor-pointer hover:text-white transition-colors"
                                onClick={() => addFilter('mb_credit', name)}
                                title={`Filter by: ${name}`}
                              >{name}</span>
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
          )}

          {/* LYRICS */}
          {node.has_lyrics && (
            <section>
              <button
                onClick={() => setShowLyrics(!showLyrics)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10,
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: `rgba(${accentRgb}, 0.5)`,
                }}>Lyrics</span>
                <span style={{
                  color: `rgba(${accentRgb}, 0.4)`, fontSize: 13,
                  transition: 'transform 0.2s ease',
                  transform: showLyrics ? 'rotate(180deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}>▾</span>
              </button>

              {showLyrics && (
                <div style={{
                  borderRadius: 10,
                  border: `1px solid rgba(${accentRgb}, 0.1)`,
                  backgroundColor: `rgba(${accentRgb}, 0.03)`,
                  maxHeight: 440,
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                  scrollbarColor: `rgba(${accentRgb}, 0.2) transparent`,
                  padding: '14px 16px',
                }}>
                  {(node.lyrics || node.lyrics_preview).split('\n').map((line, i) => {
                    const isHeader = /^\[.+\]$/.test(line.trim());
                    const isEmpty = line.trim() === '';

                    if (isHeader) return (
                      <div key={i} style={{
                        color: `rgba(${accentRgb}, 0.8)`,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        marginTop: i > 0 ? 22 : 0,
                        marginBottom: 8,
                        paddingBottom: 5,
                        borderBottom: `1px solid rgba(${accentRgb}, 0.15)`,
                      }}>
                        {line.trim().replace(/[\[\]]/g, '')}
                      </div>
                    );

                    if (isEmpty) return <div key={i} style={{ height: 5 }} />;

                    return (
                      <div key={i} style={{
                        color: 'rgba(255,255,255,0.58)',
                        fontSize: 12,
                        lineHeight: 1.8,
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}>
                        {line}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* NOTES */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-2">Notes</h3>
            <textarea
              value={localNotes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add personal notes about this song..."
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.65)',
                fontSize: 12,
                lineHeight: 1.6,
                padding: '8px 10px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'Inter, system-ui, sans-serif',
                minHeight: 72,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = `rgba(${accentRgb}, 0.3)`; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)'; }}
            />
          </section>

        </div>
      </div>
    </div>
  );
};

export default Sidebar;
