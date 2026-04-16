# Resonant — Project Context

## What is Resonant?

Resonant is a music discovery visualization tool built as an Eckardt Scholars capstone project at Lehigh University. It takes a user's music collection (from Spotify playlists or Apple Music) and renders it as an interactive force-directed graph where songs are visualized as nodes, spatially arranged by similarity using UMAP dimensionality reduction on AI-generated embeddings.

**Final presentation:** May 3, 2026 (Eckardt Scholars Capstone Presentation)
**Current phase:** Post-first-user-test, building improvements based on feedback

## Architecture

### Stack
- **Frontend:** React + Vite + Tailwind + react-force-graph-2d → deployed on Vercel
- **Backend:** FastAPI (Python) → deployed on Render (free tier, ~30s cold start)
- **Database:** PostgreSQL 16 with pgvector extension
  - Local dev: Docker (`pgvector/pgvector:pg16`, container `resonant-db`, port 5432, user/pass `resonant/resonant`)
  - Production: Neon.tech (AWS us-east-1)
- **AI:** Gemini 2.5 Flash + text-embedding-005 via Vertex AI (GCP project `resonant-design`, us-central1)
- **External APIs:** Spotify, MusicBrainz, Genius

### Deployment URLs
- Frontend: `https://resonant-nvgkuiceb-efl226s-projects.vercel.app`
- Backend: `https://resonant-api-51dh.onrender.com`
- Vercel auto-deploys from `dev` branch
- Render auto-deploys from `dev` branch

### Environment
- Windows with Git Bash via VS Code terminal
- Python 3.14 in `.venv` (activate: `source .venv/Scripts/activate`)
- Node for frontend (`cd frontend && npm run dev`)
- Backend: `uvicorn backend.main:app --reload` (localhost:8000)
- Frontend: localhost:5173

### `.env` keys
- `DATABASE_URL` (local Docker connection)
- `GOOGLE_APPLICATION_CREDENTIALS` (path to GCP service account JSON)
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- `GENIUS_ACCESS_TOKEN`

## Database Schema

### `songs` table (55+ columns)
Key fields:
- Identity: `id`, `name`, `artist`, `album`, `year`, `img`, `isrc`, `spotify_uri`, `musicbrainz_id`
- Sonic: `bpm`, `key`, `scale`, `mode`, `time_signature`, `key_changes`, `key_changes_detail`, `energy`, `energy_shape`, `bass_weight`, `mid_weight`, `treble_weight`, `duration`, `vocal_type`, `rhythm_feel`, `prominent_instruments[]`
- Genetic: `producer`, `mixing_engineer`, `songwriter[]`, `featuring[]`, `label`, `studio`, `country_recorded`, `conductor`, `musician_credits` (JSONB), `samples_from` (JSONB)
- Semantic: `mood[]`, `themes[]`, `ai_summary`, `fun_fact`, `sonic_fingerprint`
- Visual: `primary_color`, `palette[]`
- Lyrics: `lyrics`, `lyrics_source`
- Vectors: `embedding vector(768)`, `umap_x`, `umap_y`
- Organization: `collection_id`, `cluster_id`, `is_live`

### `links` table
- `id`, `source_id`, `target_id`, `reason`, `score`, `type`, `collection_id`

### `clusters` table
- `collection_id` (PK), `data` (JSONB) — stores cluster definitions per collection

### Link types stored
- `samples` (sampling relationships)
- `shared_musician` (same musician on different artists)
- `same_producer`, `same_songwriter`, `same_label`, `same_studio`
- `shared_instruments` (rare shared instruments only)
- `harmonic_bridge` (same key+BPM across different clusters)

## Current Collections

- `default` — 119 seed songs
- `testuser` — ~248 Spotify songs
- `zach` — ~67 songs from Apple Music "Oldie but a goodie"
- `tal` — 423 songs

Total in Neon: 840 songs, 1674 links.

## Pipeline Scripts (all in `pipeline/`)

### Ingestion
- `seed_from_json.py` — seeds default collection
- `ingest_spotify.py` — Spotify metadata lookup
- `batch_analyze.py` — Gemini analysis for multiple songs
- `test_analyze_one.py` — single-song test
- `convert_spotify_paste.py` — handles Spotify URLs, tab-paste, plain text
- `scrape_apple_music.py` — limited (static HTML scraping; usually requires browser console)
- `create_collection.py` — **ALL-IN-ONE** pipeline: Spotify → Gemini → embeddings → colors → UMAP → clusters → links. **IMPORTANT:** file must be opened with `encoding='utf-8'`
- `migrate_to_neon.py` — migrates local Docker data to Neon (handles JSONB via `Jsonb()` wrapper)

### Enrichment
- `embed_seed_songs.py`, `rebuild_embeddings.py`
- `enrich_musicbrainz.py`, `fetch_lyrics.py`, `extract_colors.py`
- `enrich_musician_credits.py`, `detect_samples.py`

### Computation
- `detect_clusters.py` — DBSCAN with adaptive eps (k-NN based), auto-retry if <3 or >20 clusters, Gemini-named in batched call
- `generate_structural_links.py` — tier-based link generation:
  - **Tier 1 (0.9+):** sampling, shared musician cross-artist (skip if musician is main artist or on >15% of songs), same producer/songwriter cross-artist
  - **Tier 2 (0.7–0.9):** rare label (rarity>0.4), rare studio, rare shared instruments, harmonic_bridge
  - Max 5 per node cap (to be removed post-refactor)
- `run_umap.py` — n_neighbors=15, min_dist=0.1, metric=cosine, range [-500,500]

## Backend (`backend/main.py`)

### Endpoints
- `GET /` — root
- `GET /health` — health check
- `GET /api/graph?collection=X` — full graph with cluster_id on nodes
- `GET /api/songs/{id}` — single song with full lyrics
- `GET /api/clusters?collection=X` — reads from DB, falls back to default
- `GET /api/search?q=X` — Gemini-interpreted search (text/filter/semantic/similarity/hybrid) — **CURRENTLY BROKEN ON RENDER** (see pending issues)
- `POST /api/filter-direct` — direct SQL filtering for breadcrumb removal
- `GET /api/stats`

### CORS
`allow_origins=["*"]` for deployment.

### Search (`backend/search.py`)
Uses Gemini to interpret natural language queries, then executes via SQL or pgvector. Handles:
- Text matching
- Filter-based queries ("90s hip hop")
- Semantic (pgvector cosine similarity on embeddings)
- Similarity to specific song
- Hybrid (similarity + filter)

## Frontend Components

### Core structure
- `App.jsx` — main state container
- `components/SearchBar.jsx` — search + breadcrumb filters
- `components/Sidebar.jsx` — song details panel (right side)
- `components/DiscoverPanel.jsx` — "Discover" floating panel (top-left, next to search)
- `components/PlayerBar.jsx` — Spotify embed floating bottom-left
- `components/ConnectionHint.jsx` — tooltip when hovering links
- `components/ExploreSection.jsx` — connection filters (currently in sidebar, will move)
- `components/TimelineView.jsx` — alternate timeline view
- `api/client.js` — API calls, handles `?collection=X` URL param
- `data/songsseed.json` — fallback data

### Current App.jsx features
- Image caching to prevent flickering
- UMAP gravity wells (d3 force strength 0.08)
- Dynamic cluster blob rendering from live node positions
- Cluster labels visible at `globalScale < 0.8` with drop shadow
- Arrow key navigation between nearby nodes
- Escape key closes sidebar
- Search filtering creates subset graphs
- Colored links by type via `linkTypeColors` object
- `hexToRgba` has NaN safety check
- `try-catch` around `onRenderFramePre` to prevent crashes
- `100dvw`/`100dvh` for full viewport
- `cluster_id` included on each node from API
- Node labels drawn in `onRenderFramePost` so they render on top
- Link tooltip (`ConnectionHint`) on hover
- Link click navigates to other node

### Link type color scheme
```
samples: #E8724A          (orange)
shared_musician: #6BCB77  (green)
same_producer: #B84AE8    (purple)
same_songwriter: #D44AE8  (magenta)
same_label: #8B9FE8       (blue-grey)
same_studio: #9B72CF      (lavender)
shared_instruments: #4AE8D4 (cyan)
harmonic_bridge: #E8C94A  (gold)
same_key_bpm: #E8C94A     (gold)
same_artist: #4A9EE8      (blue)
same_mood: #E84A6A        (pink)
same_feel: #8B9FE8        (blue-grey)
```

## Git Strategy

- `main` — stable, for releases
- `dev` — active development (auto-deploys to Vercel + Render)
- `feature/*` — feature branches

Current feature branches:
- `feature/backend-db`
- `feature/spotify-pipeline`
- `feature/collections-deploy`
- `feature/connection-controls` (most recent, connection controls work)

## Completed Features

- [x] PostgreSQL + pgvector database, full schema
- [x] FastAPI backend with all endpoints
- [x] Spotify + Gemini ingestion pipeline
- [x] MusicBrainz credit enrichment
- [x] Genius lyrics integration
- [x] Album art color extraction (ColorThief)
- [x] Musician credit enrichment via Gemini
- [x] Sampling detection via Gemini (batches of 10)
- [x] UMAP dimensionality reduction
- [x] Adaptive DBSCAN clustering with Gemini naming
- [x] Tier-based structural link generation
- [x] Intelligent search (Gemini interpreter + pgvector + SQL)
- [x] Breadcrumb filter system (stacking, color-coded, SQL removal)
- [x] Clickable sidebar items → filter events (dispatched via `resonant-add-filter` custom event)
- [x] Dynamic cluster rendering from live positions
- [x] Image caching
- [x] Arrow key navigation
- [x] Escape key + smart reset (no zoom-out)
- [x] Spotify player bar (bottom-left, persistent)
- [x] Collection system with URL params (`?collection=X`)
- [x] Apple Music converter (limited)
- [x] Spotify paste converter
- [x] Full deployment: Vercel + Render + Neon
- [x] Clusters table in DB (production-friendly)
- [x] Node hover labels in `onRenderFramePost` (render on top with shadow + colored border + arrow)
- [x] Sidebar text contrast fix (`safeAccent` — switches to white when album accent is too dark)
- [x] Discover Panel (top-left, next to search) with activity cards: Most Connected, Rarest Track, Decade Hop, Surprise Me
- [x] ConnectionHint tooltip on link hover
- [x] VibeChips component (built but not in use)
- [x] ExploreSection (connections filter UI, currently in sidebar)
- [x] Link click navigation
- [x] Link hover thickening
- [x] Testing procedure document
- [x] First user test with Zach completed

## Known Issues

### Search broken on Render
The `/api/search` endpoint fails on Render because Vertex AI credentials (`GOOGLE_APPLICATION_CREDENTIALS`) are not configured. Either:
1. Add `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var to Render with the service account JSON contents, then update `backend/search.py` to read from env
2. Wrap Vertex AI imports in try/except with text-search fallback

### Rendering issues occasionally
- Some cluster colors can be undefined; `hexToRgba` has a safety check but cluster rendering is wrapped in try-catch as defense

## Pending Features (Priority Order)

### 1. Relocate & deepen Explore Panel (NEXT — active planning)
Move the connection exploration OUT of the sidebar into a dedicated floating panel in the bottom-left. Sidebar shrinks back to just song details.

**The new panel has 3 layers:**

**Layer 1: Song's attribute values as filterable chips**
For every attribute the selected song has, display as clickable chips. Click filters the graph.
- Decade, Key, Mode, BPM (±5), Time signature, Vocal type, Rhythm feel
- All moods (individual chips)
- All themes (individual chips)
- All instruments (individual chips)
- Label, Studio, Producer, Songwriters (each one individually clickable)

**Layer 2: Curated connections with details**
Each curated link expanded with reason:
- `⟲ Samples "Funky Drummer" by James Brown`
- `♫ Shared musician: John Bonham (drums) — Plays on 4 other songs [Show those →]`
- `◉ Same producer: Rick Rubin — 7 other songs [Show those →]`

**Spatial / AI-derived section:**
- Nearby Songs (10): each entry shows what attributes it shares with the selected song
- Same Cluster: shows cluster name + description + full song list

**Layer 3: Active filter stack**
Sticky section showing all active filters, combine mode (Match ALL / Match ANY), matched songs list.

**State change:** `activeFilters` goes from `Set('shared_mood')` to `Map` keyed by `type:value` so we can filter by specific mood ("melancholic") not just "any shared mood."

**Data model:**
Every attribute needed already exists in the song record:
- `year` → decade
- `sonic_dna.{key, mode, bpm, time_signature, vocal_type, rhythm_feel, prominent_instruments[]}`
- `semantic_dna.{mood[], themes[]}`
- `genetic_dna.{label, studio, producer, songwriter[], musician_credits{}}`
- `cluster_id`

No backend changes needed.

### 2. Fix Render Gemini search
Add service account credentials to Render or add text-search fallback.

### 3. Regenerate links without per-node cap
Remove the max-5 cap in `generate_structural_links.py`. Store ALL interesting connections. Filtering happens in UI.

### 4. Specific instruments
Update Gemini prompt to request exact models (e.g., "Roland Juno-106" not just "synthesizer"). Low effort, high value.

### 5. Musical Identity / Stats page
"Spotify Wrapped" style panel. Sections: generated title, mood landscape, key/mode distribution (circle of fifths), era timeline, energy profile, instrument DNA, AI summary, fun stats. Slide-in panel.

### 6. Cluster AI reasoning
Gemini-generated paragraph per cluster explaining why songs are grouped. Show on click.

### 7. Axis control (Option C — sort by attribute)
Let users arrange graph by single attribute (BPM, year, energy).

### 8. 3D graph toggle
`react-force-graph-3d` — medium effort.

### 9. Cluster visual redesign
More meaningful colors/shapes tied to musical characteristics.

### 10. Vercel deployment protection
Currently testers may need to sign into Vercel. Disable deployment protection for the testing URL.

## Testing Plan

Testing methodology in `TESTING_PROCEDURE.md`. Hybrid approach:
- Task-based usability testing
- Think-aloud protocol
- Post-session survey

Target: 5-10 testers, 20-30 min sessions. Based on Nielsen Norman Group research (5 users = 85% of issues, 10 = 95%).

Collections ready for testers: `testuser`, `zach`, `tal`.

## Key Technical Decisions (Log)

- **Neon over Cloud SQL** — GCP Cloud SQL Enterprise was ~$800/mo; Neon free tier sufficient
- **Render over Cloud Run** — simpler, no gcloud CLI needed, free tier fine
- **Clusters in DB** — not JSON files, production-friendly
- **Max 5 links/node** — to be removed for ConnectionControls (pending)
- **Search: Gemini interpret → SQL/pgvector execute** — cheaper than Vertex AI Search
- **Text format for playlists** — Spotify client credentials can't access user playlists
- **Start with no global links visible** — clean default, user toggles connection types on
- **Explore section in sidebar** — TO BE MOVED to dedicated panel (see pending #1)

## Business Purpose Justifications (for grant expenses)

- **Vercel subscription:** "Web hosting for Resonant capstone project — frontend deployment for user testing of music discovery visualization tool."
- **Monitor Audio Radius 90 speakers:** "Reference speakers for evaluating audio analysis accuracy in Resonant music visualization capstone project."
- **Turntable:** "Turntable required for vinyl ingestion workflow — capturing physical album metadata and audio for integration into the unified digital music collection." (Project's original scope included vinyl/CD/digital unified collection.)

## Common Commands

```bash
# Activate venv
source .venv/Scripts/activate

# Start Docker database
docker start resonant-db

# Start backend
uvicorn backend.main:app --reload

# Start frontend
cd frontend && npm run dev

# Create a new collection
python pipeline/create_collection.py --file pipeline/NAME_songs.txt --name "Display Name" --id collection_id

# Run clusters + links for an existing collection
python pipeline/detect_clusters.py --collection NAME
python pipeline/generate_structural_links.py --collection NAME

# Migrate everything to Neon
python pipeline/migrate_to_neon.py

# Git workflow
git checkout -b feature/new-thing
# ...work...
git add -A
git commit -m "..."
git checkout dev
git merge feature/new-thing
git push origin dev
```

## GCP Notes

- Vertex AI SDK is deprecated as of June 24, 2025 — removed June 24, 2026. Migration to `google-genai` SDK pending.
- Service account: `rd-serviceaccount@resonant-design.iam.gserviceaccount.com`