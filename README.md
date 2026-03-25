# RESONANT — System Architecture & Development Plan

## 1. Project Vision

Resonant is a music discovery platform that visualizes thousands of songs as an interactive force-directed graph. Songs are positioned in 2D space based on their sonic/semantic similarity (via Vertex AI embeddings + UMAP dimensionality reduction), with explicit connections drawn between songs that share meaningful relationships. The interface uses skeuomorphic audio controls for filtering and procedurally generated glyphs to encode song metadata visually.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Local / Vercel)                │
│  React + Vite + Tailwind + react-force-graph-2d                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Graph    │ │ Sidebar  │ │ Filters  │ │ Glyph Renderer    │  │
│  │ Canvas   │ │ Detail   │ │ (Skeuo)  │ │ (drawGlyph.js)    │  │
│  └────┬─────┘ └──────────┘ └────┬─────┘ └───────────────────┘  │
│       │                         │                                │
│       └─────────┬───────────────┘                                │
│                 ▼                                                 │
│         REST API Calls                                           │
└─────────┬───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND API (Cloud Run)                      │
│  FastAPI (Python) or Express (Node)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ /songs   │ │ /graph   │ │ /search  │ │ /filter           │  │
│  │  CRUD    │ │  nodes + │ │  full-   │ │  multi-param      │  │
│  │          │ │  links   │ │  text    │ │  query            │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────────────┘  │
│       └─────────────┴────────────┴────────────┘                  │
│                          │                                       │
│                          ▼                                       │
│              ┌──────────────────────┐                            │
│              │  Firestore / SQL DB  │                            │
│              │  (Songs + Metadata)  │                            │
│              └──────────┬───────────┘                            │
│                         │                                        │
│              ┌──────────▼───────────┐                            │
│              │  Pre-computed Cache  │                            │
│              │  (UMAP coords,      │                            │
│              │   link pairs,       │                            │
│              │   graph JSON)       │                            │
│              └──────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
          │
          │ (Offline Pipeline — not real-time)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PIPELINE (Cloud Functions / Jobs)        │
│                                                                  │
│  ┌───────────┐    ┌───────────┐    ┌───────────────┐            │
│  │ STAGE 1   │    │ STAGE 2   │    │ STAGE 3       │            │
│  │ Scrape &  │───▶│ Enrich &  │───▶│ Embed &       │            │
│  │ Ingest    │    │ Validate  │    │ Compute Graph │            │
│  └───────────┘    └───────────┘    └───────────────┘            │
│                                                                  │
│  Sources:          Vertex AI:        UMAP:                       │
│  - MusicBrainz     text-embedding-   768D → 2D coords           │
│  - Discogs API       005             Cosine similarity →         │
│  - Wikipedia       Claude/Gemini:      explicit links            │
│  - Album art         AI summary,                                 │
│    services          mood, themes                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository Structure (Fresh Start)

```
resonant/
├── README.md
├── .gitignore
├── .env.example                    # Template for all env vars
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── index.css
│       ├── App.jsx                 # Main graph + layout
│       ├── api/
│       │   └── client.js           # Axios/fetch wrapper for backend
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   ├── SearchBar.jsx
│       │   ├── NeuralFilters.jsx
│       │   ├── TimelineView.jsx
│       │   └── FilterControls/     # Skeuomorphic controls
│       │       ├── RotaryKnob.jsx
│       │       ├── VerticalFader.jsx
│       │       ├── CircleOfFifths.jsx
│       │       ├── LCDSearch.jsx
│       │       ├── ToggleSwitchBank.jsx
│       │       ├── MPCPads.jsx
│       │       ├── XYPad.jsx
│       │       └── ...
│       ├── utils/
│       │   └── drawGlyph.js        # Canvas glyph rendering
│       └── data/
│           └── seed.json           # Dev-only fallback data
│
├── backend/
│   ├── requirements.txt            # Python deps
│   ├── Dockerfile
│   ├── main.py                     # FastAPI entrypoint
│   ├── config.py                   # Env vars, GCP config
│   ├── routers/
│   │   ├── songs.py                # CRUD endpoints
│   │   ├── graph.py                # Graph data endpoint
│   │   ├── search.py               # Full-text + vector search
│   │   └── filters.py              # Multi-param filter queries
│   ├── models/
│   │   └── song.py                 # Pydantic schemas
│   ├── services/
│   │   ├── db.py                   # Firestore client
│   │   ├── embeddings.py           # Vertex AI embedding calls
│   │   ├── similarity.py           # Cosine sim + link generation
│   │   └── umap_service.py         # UMAP coordinate computation
│   └── tests/
│       └── ...
│
├── pipeline/
│   ├── requirements.txt
│   ├── 01_scrape_metadata.py       # MusicBrainz + Discogs ingestion
│   ├── 02_enrich_with_ai.py        # Claude/Gemini for summaries
│   ├── 03_generate_embeddings.py   # Vertex AI batch embedding
│   ├── 04_compute_umap.py          # UMAP dimensionality reduction
│   ├── 05_generate_links.py        # Cosine similarity → links
│   ├── 06_build_graph_cache.py     # Assemble final graph JSON
│   └── utils/
│       ├── musicbrainz.py
│       ├── discogs.py
│       └── image_palette.py        # Extract colors from album art
│
├── design/                         # Figma exports, prototypes
│   └── AudioControlPrototypes.jsx
│   └── AudioControlPrototypesV2.jsx
│
└── infra/                          # GCP deployment config
    ├── cloudbuild.yaml
    └── terraform/                  # Optional: IaC
```

---

## 4. Data Schema

### 4.1 Song Document (Firestore / Database)

This is the canonical schema. Every song in the database conforms to this shape.

```
Song {
  // ─── IDENTITY ───
  id:             string       // UUID or auto-generated
  name:           string       // Song title
  artist:         string       // Primary artist name
  album:          string       // Album name
  year:           number       // Release year
  img:            string       // Album art URL

  // ─── SONIC DNA ───
  sonic_dna: {
    bpm:                    number       // Beats per minute (e.g. 120)
    key:                    string       // Musical key (e.g. "C# Minor")
    energy:                 number       // 0.0 - 1.0 scale
    duration:               string       // "4:32" format
    prominent_instruments:  string[]     // ["Roland Juno-106", "Drums", "Bass"]
  }

  // ─── GENETIC DNA ───
  genetic_dna: {
    producer:           string
    mixing_engineer:    string
    studio:             string       // "Studio Name (City)"
    songwriter:         string[]     // For song-level
    featuring:          string[]     // Featured artists
    label:              string       // Record label
  }

  // ─── VISUAL DNA ───
  visual_dna: {
    primary_color:  string       // Hex color from album art
    palette:        string[]     // 5 hex colors
    texture:        string       // "Fluid Dynamics / Ball Bearing"
  }

  // ─── SEMANTIC DNA ───
  semantic_dna: {
    mood:           string       // "Introspective / Psychedelic"
    themes:         string[]     // ["Change", "Memory", "Youth"]
    ai_summary:     string       // 2-3 sentence production analysis
  }

  // ─── COMPUTED (by pipeline) ───
  embedding:        number[]     // 768-dimensional vector (Vertex AI)
  umap_x:           number       // 2D x-coordinate (UMAP output)
  umap_y:           number       // 2D y-coordinate (UMAP output)

  // ─── METADATA ───
  created_at:       timestamp
  updated_at:       timestamp
  source:           string       // "musicbrainz" | "manual" | "discogs"
  musicbrainz_id:   string       // External ID for dedup
}
```

### 4.2 Link Document

```
Link {
  id:         string
  source:     string       // Song ID
  target:     string       // Song ID
  reason:     string       // Human-readable connection reason
  score:      number       // Cosine similarity score (0-1)
  type:       string       // "embedding_similarity" | "shared_producer" |
                           // "same_studio" | "genre_bridge" | "ai_generated"
}
```

### 4.3 How the Schema Gets Populated

| Field | Source | Method |
|-------|--------|--------|
| name, artist, album, year | MusicBrainz API | Automated scrape |
| bpm, key, duration | MusicBrainz + AcousticBrainz (or Spotify features) | API call |
| energy | Spotify Audio Features API or AI estimation | API / AI |
| prominent_instruments | Discogs credits + AI analysis | Hybrid |
| producer, mixing_engineer, studio | Discogs API (release credits) | Automated scrape |
| songwriter, featuring | MusicBrainz relationships | API call |
| label | MusicBrainz release group | API call |
| primary_color, palette | Album art image → color extraction | Python script (colorthief) |
| texture | AI description of album art | Claude/Gemini vision |
| mood, themes | AI analysis of lyrics + sonic data | Claude/Gemini |
| ai_summary | AI production analysis | Claude/Gemini |
| embedding | All DNA fields → text → Vertex AI | Pipeline Stage 3 |
| umap_x, umap_y | All embeddings → UMAP | Pipeline Stage 4 |
| links + reasons | Cosine similarity + AI explanation | Pipeline Stage 5 |

---

## 5. Data Pipeline (Offline, Batch)

The pipeline runs as a batch job, NOT on every request. It's a sequential process that builds the full graph from raw data.

### Stage 1: Scrape & Ingest

**Input:** A seed list of song IDs (MusicBrainz recording IDs) or artist names.

**Sources:**
- **MusicBrainz API** (musicbrainz.org) — canonical metadata: song title, artist, album, year, key, BPM, duration, songwriter credits, label. Free, rate-limited (1 req/sec with user-agent).
- **Discogs API** (discogs.com) — rich production credits: producer, engineer, studio, instruments. Free tier: 60 req/min.
- **Album art** — Cover Art Archive (via MusicBrainz) or Discogs images.

**Output:** Raw song documents in Firestore with identity + sonic_dna + genetic_dna fields populated.

**Key decisions:**
- Start with a curated seed list (e.g., "top 2000 albums across genres") rather than trying to scrape everything
- MusicBrainz is the primary key — deduplicate on `musicbrainz_id`
- Store raw API responses in a `raw/` collection for debugging

### Stage 2: Enrich with AI

**Input:** Song documents with basic metadata.

**Process:**
- For each song, construct a prompt that includes all known metadata
- Call Claude or Gemini to generate: mood, themes, ai_summary, texture description
- Call a vision model on album art to extract texture/aesthetic descriptions
- Run `colorthief` on album art to extract primary_color + palette

**Output:** Song documents now have visual_dna + semantic_dna fully populated.

**API choice:** Gemini (via Vertex AI) keeps everything in GCP. Claude via Anthropic API is better for nuanced music analysis. Could use both.

**Cost estimate at 5,000 songs:**
- Gemini 1.5 Flash: ~$0.002/song = ~$10 total
- Claude Haiku: ~$0.003/song = ~$15 total
- Very affordable at this scale

### Stage 3: Generate Embeddings

**Input:** Fully enriched song documents.

**Process:**
- For each song, compose an "embedding text" string that combines all DNA fields:
  ```
  "{name} by {artist}. {album} ({year}). BPM: {bpm}, Key: {key},
   Energy: {energy}. Instruments: {instruments}. Producer: {producer}.
   Mood: {mood}. Themes: {themes}. {ai_summary}"
  ```
- Send to Vertex AI `text-embedding-005` model
- Returns a 768-dimensional vector per song

**Output:** Each song document now has an `embedding` field (768 floats).

**Vertex AI Embedding Pricing:**
- text-embedding-005: $0.00002 per 1,000 characters
- Average song text: ~300 chars = ~$0.000006/song
- 5,000 songs ≈ $0.03 total (essentially free)

**Batch strategy:** Vertex AI supports batch prediction for embeddings — send all 5,000 in one job rather than individual API calls.

### Stage 4: UMAP Dimensionality Reduction

**Input:** All 768D embedding vectors.

**Process:**
- Load all embeddings into a numpy array
- Run UMAP: `umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.1)`
- Normalize output coordinates to a reasonable range for the graph (e.g., -500 to 500)

**Output:** Each song gets `umap_x` and `umap_y` coordinates.

**Important:** UMAP must be run on ALL songs at once. Adding new songs requires re-running UMAP on the full dataset (or using UMAP's `transform()` for incremental additions).

**Tuning:**
- `n_neighbors`: Higher = more global structure, lower = tighter local clusters
- `min_dist`: Lower = tighter clusters, higher = more spread
- Start with defaults, tune visually

### Stage 5: Generate Links

**Input:** All songs with embeddings.

**Process:**
1. Compute pairwise cosine similarity matrix
2. For each song, find top-K most similar songs (K=5-8)
3. Apply a similarity threshold (e.g., > 0.82) to avoid weak connections
4. Generate link reasons via AI: "Given these two songs share [high similarity], explain in one sentence why they're connected"
5. Also generate "structural" links: same producer, same studio, same label, shared instruments

**Output:** Link documents with source, target, reason, score, type.

**Link budget:** At 5,000 songs with K=5, that's ~25,000 potential links. After thresholding and dedup, expect ~10,000-15,000 links.

### Stage 6: Build Graph Cache

**Input:** All songs + all links.

**Process:**
- Assemble the final graph JSON that the frontend consumes
- Structure: `{ nodes: [...], links: [...] }`
- Strip the 768D embedding vectors (frontend doesn't need them)
- Store as a single JSON file in Cloud Storage (for static serving) AND in Firestore (for API queries)

**Output:** A single `graph.json` file (~5-15MB for 5,000 songs) that the frontend loads.

---

## 6. API Design (Backend)

### Technology: FastAPI (Python)

Python because: UMAP and numpy are Python-native, Vertex AI has first-class Python SDK, Firestore has excellent Python client.

### Endpoints

```
GET  /api/graph
     Returns the full graph JSON (nodes + links).
     Cached aggressively. This is the primary data load.
     Query params: ?limit=500&offset=0 (for pagination if needed)

GET  /api/songs/{id}
     Returns a single song with full metadata.

GET  /api/songs
     List/search songs.
     Query params: ?q=radiohead&artist=&album=&year_min=&year_max=

POST /api/filter
     Complex multi-parameter filter.
     Body: {
       bpm: { min: 80, max: 140 },
       energy: { min: 0.4, max: 1.0 },
       keys: ["Am", "Em", "Cm"],
       mode: "minor",
       instruments: ["Synth", "Drums"],
       mood: ["Ethereal", "Dark"],
       themes: ["Love", "Isolation"],
       producer: "Brian Eno",
       year: { min: 1990, max: 2010 },
       decade: ["90s", "00s"]
     }
     Returns: filtered node IDs + their connections

GET  /api/similar/{id}?k=10
     Returns K most similar songs to a given song
     (Uses stored embeddings for cosine similarity)

GET  /api/stats
     Database-level stats: total songs, genre distribution, etc.

POST /api/pipeline/trigger
     (Admin) Triggers a pipeline re-run.
```

### CORS & Auth

- CORS: Allow `localhost:5173` (Vite dev) and your production domain
- Auth: None for read endpoints initially. API key for admin/pipeline endpoints.

---

## 7. External APIs & Services

| Service | Purpose | Auth | Cost | Rate Limit |
|---------|---------|------|------|------------|
| **MusicBrainz API** | Song metadata, credits | User-Agent header | Free | 1 req/sec |
| **Discogs API** | Production credits, instruments | OAuth token | Free (60/min) | 60 req/min |
| **Cover Art Archive** | Album artwork | None | Free | Polite use |
| **Vertex AI Embeddings** | text-embedding-005 | GCP service account | ~$0.03 per 5K songs | 600 req/min |
| **Vertex AI Gemini** | AI enrichment (mood, themes) | GCP service account | ~$10-15 per 5K songs | Varies |
| **Anthropic Claude API** | AI enrichment (alt/better) | API key | ~$15 per 5K songs | Varies |
| **Firestore** | Primary database | GCP service account | Free tier covers this | 10K writes/day free |
| **Cloud Storage** | Graph JSON cache, album art | GCP service account | ~$0.02/GB/month | N/A |
| **Cloud Run** | Backend hosting | GCP | Free tier: 2M req/month | N/A |

**Total estimated cost for 5,000 songs:** ~$25-30 one-time pipeline + negligible monthly hosting.

---

## 8. GCP Project Setup Checklist

1. **Create GCP Project** — e.g., `resonant-music`
2. **Enable APIs:**
   - Vertex AI API
   - Cloud Firestore API
   - Cloud Run API
   - Cloud Storage API
   - Cloud Build API (for CI/CD)
3. **Create Service Account** — `resonant-backend@resonant-music.iam.gserviceaccount.com`
   - Roles: Vertex AI User, Firestore User, Storage Object Admin
4. **Create Firestore Database** — Native mode, `us-central1`
5. **Create Cloud Storage Bucket** — `resonant-music-assets` (album art, graph cache)
6. **Download Service Account Key** — for local development (NEVER commit to git)

---

## 9. Git Strategy

### Fresh Start Steps

```bash
# 1. Create new repo on GitHub: resonant (or your preferred name)

# 2. Local setup
mkdir resonant && cd resonant
git init
git remote add origin git@github.com:YOUR_USERNAME/resonant.git

# 3. Create .gitignore FIRST
# (See below)

# 4. Initial commit with structure
git add .
git commit -m "Initial project structure"
git push -u origin main

# 5. Create dev branch for active work
git checkout -b dev
```

### .gitignore

```
# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# Environment
.env
.env.local
*.key.json          # GCP service account keys

# Build
frontend/dist/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Pipeline artifacts
pipeline/raw/
pipeline/output/
*.npy                # Numpy embedding caches

# Large files
*.json.bak
graph_cache/
```

### Branch Strategy

- `main` — stable, deployable code only
- `dev` — active development, merge features here
- `feature/xxx` — individual features (e.g., `feature/filter-controls`, `feature/pipeline-stage-1`)

---

## 10. Development Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Clean repo with working frontend + stubbed backend.

- [ ] Create fresh GitHub repo with the structure above
- [ ] Move existing frontend code into `frontend/`
- [ ] Get frontend running locally with seed.json data
- [ ] Set up FastAPI backend with a single `GET /api/graph` endpoint that serves seed.json
- [ ] Connect frontend to backend (replace static import with API call)
- [ ] Set up GCP project, enable APIs, create service account

### Phase 2: Data Pipeline - Ingestion (Week 3-4)

**Goal:** Automated scraping that populates the database with real song data.

- [ ] Build MusicBrainz scraper (Stage 1)
- [ ] Build Discogs enrichment (Stage 1)
- [ ] Design and create Firestore collections
- [ ] Ingest first batch of 200-500 songs
- [ ] Build album art color extraction script
- [ ] Validate data quality — spot-check 20 songs manually

### Phase 3: AI Enrichment (Week 5-6)

**Goal:** Every song has mood, themes, and AI summary.

- [ ] Build AI enrichment pipeline (Stage 2)
- [ ] Test with 50 songs, review quality
- [ ] Tune prompts for mood/theme consistency
- [ ] Run full enrichment on all songs
- [ ] Build visual_dna texture descriptions (vision model on album art)

### Phase 4: Embeddings & Graph (Week 7-8)

**Goal:** Working force graph with real data, real positions, real links.

- [ ] Build embedding pipeline (Stage 3)
- [ ] Run UMAP (Stage 4)
- [ ] Generate similarity links (Stage 5)
- [ ] Build graph cache (Stage 6)
- [ ] Deploy backend to Cloud Run
- [ ] Frontend loads real graph data from API

### Phase 5: Filtering & Polish (Week 9-10)

**Goal:** Skeuomorphic filter controls wired to real backend queries.

- [ ] Wire filter controls to POST /api/filter
- [ ] Implement multi-parameter Firestore queries
- [ ] Glyph system rendering real data
- [ ] Performance optimization (lazy loading, viewport culling)
- [ ] Search indexing

### Phase 6: Scale & Ship (Week 11-12)

**Goal:** 2,000+ songs, production-ready.

- [ ] Scale pipeline to full dataset
- [ ] Re-run UMAP on full dataset
- [ ] Performance testing with 5,000 nodes
- [ ] Consider graph tiling / level-of-detail for large datasets
- [ ] CI/CD: Cloud Build → Cloud Run on push to main

---

## 11. Key Technical Decisions to Make

**1. Database: Firestore vs. PostgreSQL (Cloud SQL)?**
- Firestore: Simpler, serverless, great for document-shaped data like songs. Weak at complex joins and range queries across multiple fields simultaneously.
- PostgreSQL: Better for complex multi-parameter filtering (which your skeuomorphic controls need). Supports vector extensions (pgvector) for similarity search.
- **Recommendation:** PostgreSQL with pgvector. Your filter controls demand multi-dimensional range queries that Firestore handles poorly. pgvector also lets you do similarity search in SQL.

**2. Graph loading strategy: Full JSON vs. paginated tiles?**
- Under 5,000 songs: Load the entire graph JSON on page load (~5-15MB). Simple, fast after initial load.
- Over 10,000: Need viewport-based loading (only load nodes visible in the current zoom level).
- **Recommendation:** Start with full JSON. Optimize later if needed.

**3. Embedding text composition: What goes in?**
- Everything in the DNA fields. The embedding captures the "total identity" of a song.
- Experiment with weighting (e.g., repeat the mood field twice to make it more influential).
- **Recommendation:** Start with equal weight, tune based on how the graph clusters look.

**4. Link generation: Pure similarity vs. hybrid?**
- Pure cosine similarity tends to over-connect songs by the same artist
- Hybrid (cosine + structural rules like "same producer" or "same studio") creates more interesting, explainable connections
- **Recommendation:** Hybrid. Use cosine for the primary links, then add structural links as a second layer with different visual treatment.

---

## 12. Environment Variables

```env
# .env.example (NEVER commit actual .env)

# GCP
GCP_PROJECT_ID=resonant-music
GCP_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# Database (if PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/resonant

# APIs
DISCOGS_TOKEN=your_discogs_token
ANTHROPIC_API_KEY=sk-ant-...       # For Claude enrichment
MUSICBRAINZ_USER_AGENT=Resonant/1.0 (your@email.com)

# Frontend
VITE_API_URL=http://localhost:8000  # Local dev
```

---

## 13. What to Commit First

Your very first commit to the fresh repo should be:

1. `README.md` — Project name, one-line description, setup instructions
2. `.gitignore` — The one above
3. `.env.example` — Template with no real values
4. `frontend/` — Your existing working frontend code (cleaned up)
5. `backend/main.py` — Minimal FastAPI that serves seed.json
6. `backend/requirements.txt` — `fastapi, uvicorn, google-cloud-firestore`
7. `pipeline/` — Empty directory with a README explaining what goes here

This gives you a clean, working, properly structured repo from day one.

uvicorn backend.main:app --reload