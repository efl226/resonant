# Resonant — Pending Features

## Active Next Task: Relocate & Deepen Explore Panel

### Goal

Move connection exploration OUT of the sidebar into a dedicated floating panel in the bottom-left. Sidebar shrinks to just song details. The new panel becomes the hub for deep relational exploration of any selected song.

### Why

- Sidebar is too cluttered with song details AND connection filters
- Users want surgical filtering (specific mood, specific instrument) not just "any shared mood"
- The database has rich attribute data that's underutilized — every field should be filterable
- First user test revealed people want different connection types (themes, labels, decades, length, etc.) — can't pre-compute all of them

### Design

**Location:** Floating panel, bottom-left of screen. Appears when a song is selected. Disappears when no song selected.

**Dimensions:** ~380-420px wide, max-height 70vh, scrollable internally.

**Visual style:** Match the translucent `bg-white/[0.06]` + `backdrop-blur-md` treatment used by the Discover button and search bar. Rounded corners. Subtle border.

**Collapsible:** Header bar with toggle arrow so users can hide without losing filter state.

### Panel Structure

```
┌───────────────────────────────────────────┐
│ EXPLORE CONNECTIONS                   [−] │
├───────────────────────────────────────────┤
│                                           │
│ ▸ NEARBY SONGS (10)                       │
│   Spatially closest in your music map     │
│                                           │
│ ▸ SAME CLUSTER: "Late Night Drive" (12)   │
│   Mellow, atmospheric tracks for solo     │
│   nighttime listening                     │
│                                           │
│ ▸ DIRECT CONNECTIONS (4)                  │
│   1 sample, 2 shared musicians,           │
│   1 same producer                         │
│                                           │
│ ▾ FILTER BY ATTRIBUTE                     │
│                                           │
│   DECADE     [1990s (47)]                 │
│   KEY        [G minor (12)]               │
│   MODE       [Minor (89)]                 │
│   BPM        [~98 (±5) (23)]              │
│   TIME SIG   [4/4 (200)]                  │
│   VOCAL      [Male lead (87)]             │
│   RHYTHM     [Swung (15)]                 │
│                                           │
│   MOODS:                                  │
│   [Melancholic (23)] [Introspective (15)] │
│   [Atmospheric (31)]                      │
│                                           │
│   THEMES:                                 │
│   [Loss (8)] [Memory (12)] [Solitude (6)] │
│                                           │
│   INSTRUMENTS:                            │
│   [Acoustic Guitar (45)] [Hammond (4)]    │
│   [Pedal Steel (2)]                       │
│                                           │
│   LABEL      [Warp Records (7)]           │
│   STUDIO     [Abbey Road Studio 2 (3)]    │
│   PRODUCER   [Brian Eno (7)]              │
│   SONGWRITERS [Thom Yorke (12)]           │
│              [Jonny Greenwood (12)]       │
│                                           │
├───────────────────────────────────────────┤
│ ACTIVE FILTERS (3)     [Match ALL ▼] [×]  │ ← sticky
│ [× Melancholic] [× Hammond] [× 1990s]     │
│                                           │
│ 12 SONGS MATCH                            │
│ [thumb] Song Name — Artist                │
│ [thumb] Song Name — Artist                │
│ ...                                       │
└───────────────────────────────────────────┘
```

### Section Details

#### Section 1: Nearby Songs (expandable)

Top 10 spatially-closest songs by UMAP distance. Each entry shows the selected song's thumbnail and — importantly — what attributes it shares with the selected song.

```
[thumb] Idioteque — Radiohead
        Shares: Electronic textures, Minor key, 
        Melancholic mood, 2000s, Glitchy production

[thumb] Talk Show Host — Radiohead
        Shares: Same artist, Minor key, 
        Melancholic mood, Brooding atmosphere
```

Each shared-attribute label is itself clickable — clicking "Minor key" adds that as a filter.

Click the song card to navigate to that song.

#### Section 2: Same Cluster (expandable)

Shows cluster name and description at the top.

```
SAME CLUSTER: "Late Night Drive"
A collection of mellow, atmospheric tracks for solo nighttime listening.
12 songs

[thumb] song name — artist
[thumb] song name — artist
...
```

If cluster descriptions aren't stored yet, either:
- Show just the name
- Generate on-the-fly from attributes: "12 songs sharing melancholic moods, minor keys, mostly 1990s"
- Add backend pipeline to Gemini-generate a one-sentence description per cluster (1-2 days effort)

#### Section 3: Direct Connections (expandable)

The curated links from the database. Each link expanded with its actual reason:

```
⟲ Samples "Funky Drummer" by James Brown
   The drum break is sampled in the second verse.

♫ Shared musician: John Bonham (drums)
   Plays drums on 4 other songs in your collection.
   [Show those 4 songs →]

◉ Same producer: Rick Rubin
   Produced 7 other songs in your collection.
   [Show those 7 →]
```

"Show those X" buttons activate that specific filter.

#### Section 4: Filter by Attribute (expandable)

Every attribute the song has, shown as chips with match counts. Click a chip to filter.

Categories:
- **Sonic:** Decade, Key, Mode, BPM (±5), Time Signature, Vocal Type, Rhythm Feel
- **Moods:** each mood as separate chip
- **Themes:** each theme as separate chip
- **Instruments:** each instrument as separate chip
- **People & Places:** Label, Studio, Producer, Songwriters (each separate), Mixing Engineer

Each chip shows count: `[Hammond Organ (4)]`. If 0 matches, disabled (greyed).

#### Section 5: Active Filters (sticky bottom)

Always visible while scrolling. Shows:
- Active filter chips with × to remove each
- Combine mode toggle: "Match ALL" (intersection) vs "Match ANY" (union)
- Clear all button
- Count of matching songs
- List of matching songs (scrollable, click to navigate)

### State Model Changes

Current:
```javascript
const [activeFilters, setActiveFilters] = useState(new Set());
// e.g., Set('shared_mood', 'same_decade')
```

New:
```javascript
const [activeFilters, setActiveFilters] = useState(new Map());
// e.g., Map {
//   'mood:melancholic' => { type: 'mood', value: 'melancholic' },
//   'instrument:hammond organ' => { type: 'instrument', value: 'hammond organ' },
//   'decade:1990s' => { type: 'decade', value: '1990s' }
// }
```

Key format: `${type}:${value}` for uniqueness.

`computeMatches` needs updating to handle specific value matching:

```javascript
function computeMatches(filter, selectedNode, allNodes) {
  const matches = new Set();
  const { type, value } = filter;
  
  allNodes.forEach(n => {
    if (n.id === selectedNode.id) return;
    
    switch (type) {
      case 'mood':
        if ((n.semantic_dna?.mood || []).includes(value)) matches.add(n.id);
        break;
      case 'instrument':
        if ((n.sonic_dna?.prominent_instruments || []).includes(value)) matches.add(n.id);
        break;
      case 'decade':
        if (n.year && `${Math.floor(n.year / 10) * 10}s` === value) matches.add(n.id);
        break;
      case 'key':
        if (n.sonic_dna?.key === value) matches.add(n.id);
        break;
      case 'producer':
        if (n.genetic_dna?.producer === value) matches.add(n.id);
        break;
      // etc...
    }
  });
  
  return matches;
}
```

### Graph Visual Changes

When filters are active:
- Matched nodes fully visible
- Unmatched nodes dimmed to 5% opacity (already implemented)
- Draw lines from selected node to each matched node
- Line color: consider using a single neutral color since stacking multiple filter types makes per-category colors confusing
- Selected node stays at center with zoom (already implemented)

### Implementation Order

1. **Create `ExplorePanel.jsx`** — floating bottom-left, collapsible, empty shell
2. **Move filter state** from Sidebar to App — convert Set to Map
3. **Build Section 1** (Nearby Songs with shared attributes)
   - Compute shared attributes function: `getSharedAttributes(songA, songB)`
   - Render each nearby song card with attribute chips
4. **Build Section 2** (Same Cluster with description)
   - Need to decide cluster description approach (name only / generated / Gemini)
5. **Build Section 3** (Direct Connections with details)
   - Show each curated link with reason text from link data
6. **Build Section 4** (Filter by Attribute)
   - Render all song attributes as clickable chips
   - Compute counts for each chip value
   - Disable chips with 0 matches
7. **Build Section 5** (Active Filters + Results)
   - Sticky at bottom of panel
   - Match mode toggle
   - Results list
8. **Remove explore section from Sidebar.jsx**
9. **Update `computeMatches` in App.jsx** for new Map-based filters
10. **Graph rendering updates** — lines from selected to matched nodes

### Decisions Still Needed

1. Keep filters when navigating to new song, or clear them automatically?
   - Recommendation: clear them. User context shifts when they change the selected song.
2. Cluster descriptions — store or generate?
   - Recommendation: Add a Gemini pipeline step. One batched call for all clusters. Store in `clusters.data` JSONB.
3. Line color on graph when filters active — single color or per-filter-type?
   - Recommendation: single neutral color (e.g., `rgba(255,255,255,0.15)`) since multi-filter stacking gets visually chaotic.

### Estimated Effort

~1-2 days of focused work.

---

## Other Pending Items

### High Priority

**Fix Render Gemini search**
- Add `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var to Render with service account JSON
- Update `backend/search.py` to read from env var if file doesn't exist
- Or add text-search fallback when Vertex AI is unavailable

**Regenerate links without per-node cap**
- Remove max-5 cap in `pipeline/generate_structural_links.py`
- Filtering happens in UI, not at link generation time

**Specific instruments**
- Update Gemini analysis prompt in `create_collection.py` to request exact models
- "Roland Juno-106" instead of "synthesizer"
- "Fender Precision Bass" instead of "bass"

### Medium Priority

**Musical Identity / Stats page**
- Spotify Wrapped-style panel
- Sections: generated title, mood landscape, key/mode distribution (circle of fifths), era timeline, energy profile, instrument DNA, AI summary, fun stats
- Slide-in panel from right
- ~4-6 hours

**Cluster AI reasoning**
- Gemini-generated paragraph per cluster explaining the grouping
- Show when user clicks a cluster label
- Pipeline script: `generate_cluster_descriptions.py`
- ~1-2 hours

**Axis control (Option C: sort by attribute)**
- Let users arrange graph by BPM, year, energy, etc.
- Click "arrange by BPM" and songs slide into position along a BPM axis
- ~2-3 days

### Lower Priority

**3D graph toggle**
- `react-force-graph-3d` exists with similar API
- Toggle between 2D and 3D views
- ~2-3 days

**Cluster visual redesign**
- More meaningful colors/shapes tied to musical characteristics
- Warm colors for high-energy, cool for mellow
- Denser blobs for tight clusters, looser for diverse
- ~2-3 days

**Vercel deployment protection**
- Disable protection so testers don't need to sign in
- Settings → Deployment Protection → off

**Auth flow**
- So multiple testers don't share same collection
- Each user signs in, gets their own collection page

---

## Nice-to-Haves / Future

- 3D axis-based view where users can assign any attribute to X/Y/Z axes
- Multiple pre-computed UMAP layouts (sonic-weighted, semantic-weighted, genetic-weighted)
- Time-based playback synchronization (play a cluster's songs in sequence)
- Export playlist to Spotify
- Mobile responsive design (currently desktop-only)