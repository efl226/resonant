"""
Intelligent Search Endpoint
────────────────────────────
Uses Gemini to interpret natural language queries,
then runs the appropriate search against PostgreSQL + pgvector.
"""
import json
import os
import psycopg
import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.language_models import TextEmbeddingModel
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Initialize Vertex AI once
vertexai.init(project="resonant-design", location="us-central1")
gemini = GenerativeModel("gemini-2.5-flash")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

INTERPRET_PROMPT = """You are a search query interpreter for a music discovery app. 
The app has a database of songs with these fields:
- name, artist, album, year
- bpm, key, scale, mode (major/minor/modal/atonal)
- energy (0-1), energy_shape (steady/slow_burn/builds/drops/dynamic)
- vocal_type (sung/rapped/spoken/instrumental/mixed)
- rhythm_feel (straight/swung/syncopated/polyrhythmic/freeform)
- prominent_instruments (array of instrument names)
- producer, label, studio, songwriter
- mood (array of mood tags like Melancholic, Energetic, Dreamy)
- themes (array like Love, Identity, Rebellion)
- lyrics (full text)
- samples_from (what other songs it samples)

Given this user query, classify it and extract structured parameters.

User query: "{query}"

Return ONLY a valid JSON object:
{{
    "type": "<text|filter|semantic|similarity|hybrid>",
    "text_match": "<exact name/artist to search for, or null>",
    "reference_song": "<song name to find similar songs to, or null>",
    "reference_artist": "<artist of reference song, or null>",
    "filters": {{
        "artist": "<artist name or null>",
        "year_min": <number or null>,
        "year_max": <number or null>,
        "bpm_min": <number or null>,
        "bpm_max": <number or null>,
        "energy_min": <number or null>,
        "energy_max": <number or null>,
        "key": "<musical key or null>",
        "mode": "<major/minor/modal/atonal or null>",
        "vocal_type": "<sung/rapped/spoken/instrumental/mixed or null>",
        "rhythm_feel": "<straight/swung/syncopated/polyrhythmic/freeform or null>",
        "instruments": ["<instrument names or empty>"],
        "mood": ["<mood tags or empty>"],
        "themes": ["<theme tags or empty>"],
        "has_samples": <true/false/null>,
        "decade": "<60s/70s/80s/90s/00s/10s/20s or null>"
    }},
    "semantic_query": "<natural language description for embedding search, or null>",
    "explanation": "<brief explanation of how you interpreted the query>"
}}

Rules:
- "text" = simple name/artist lookup
- "filter" = specific musical parameters mentioned
- "semantic" = mood/vibe/feeling description with no specific song or parameters
- "similarity" = find songs similar to a named song
- "hybrid" = combination (like "similar to X but more Y")
- For BPM ranges, add ±10 tolerance
- For decades, set year_min and year_max (e.g. 80s = 1980-1989)
- Be generous with interpretation — if someone says "fast" set energy_min to 0.7
- If they mention a genre, convert to likely mood/instrument/rhythm combinations
"""


def interpret_query(query):
    """Use Gemini to interpret the search query."""
    prompt = INTERPRET_PROMPT.format(query=query)
    try:
        response = gemini.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return json.loads(response.text)
    except Exception as e:
        # Fallback to text search if Gemini fails
        return {
            "type": "text",
            "text_match": query,
            "filters": {},
            "semantic_query": None,
            "explanation": f"Gemini unavailable, falling back to text search: {e}",
        }


def text_search(cur, query, limit=20):
    """Simple text search across name, artist, album."""
    pattern = f"%{query}%"
    cur.execute("""
        SELECT id, name, artist, album, year, img,
               primary_color, mood, energy, bpm, key
        FROM songs
        WHERE name ILIKE %s OR artist ILIKE %s OR album ILIKE %s
        LIMIT %s
    """, (pattern, pattern, pattern, limit))
    return cur.fetchall()


def filter_search(cur, filters, limit=20):
    """Search with specific musical parameters."""
    conditions = []
    params = []

    if filters.get("artist"):
        conditions.append("artist ILIKE %s")
        params.append(f"%{filters['artist']}%")
    if filters.get("year_min"):
        conditions.append("year >= %s")
        params.append(filters["year_min"])
    if filters.get("year_max"):
        conditions.append("year <= %s")
        params.append(filters["year_max"])
    if filters.get("bpm_min"):
        conditions.append("bpm >= %s")
        params.append(filters["bpm_min"])
    if filters.get("bpm_max"):
        conditions.append("bpm <= %s")
        params.append(filters["bpm_max"])
    if filters.get("energy_min"):
        conditions.append("energy >= %s")
        params.append(filters["energy_min"])
    if filters.get("energy_max"):
        conditions.append("energy <= %s")
        params.append(filters["energy_max"])
    if filters.get("key"):
        conditions.append("key ILIKE %s")
        params.append(f"%{filters['key']}%")
    if filters.get("mode"):
        conditions.append("mode = %s")
        params.append(filters["mode"])
    if filters.get("vocal_type"):
        conditions.append("vocal_type = %s")
        params.append(filters["vocal_type"])
    if filters.get("rhythm_feel"):
        conditions.append("rhythm_feel = %s")
        params.append(filters["rhythm_feel"])
    if filters.get("instruments"):
        for inst in filters["instruments"]:
            conditions.append("EXISTS (SELECT 1 FROM unnest(prominent_instruments) AS i WHERE i ILIKE %s)")
            params.append(f"%{inst}%")
    if filters.get("mood"):
        for m in filters["mood"]:
            conditions.append("EXISTS (SELECT 1 FROM unnest(mood) AS mo WHERE mo ILIKE %s)")
            params.append(f"%{m}%")
    if filters.get("themes"):
        for t in filters["themes"]:
            conditions.append("EXISTS (SELECT 1 FROM unnest(themes) AS th WHERE th ILIKE %s)")
            params.append(f"%{t}%")
    if filters.get("has_samples"):
        conditions.append("samples_from IS NOT NULL AND samples_from != '[]' AND samples_from != 'null'")
    if filters.get("decade"):
        decade_map = {
            "60s": (1960, 1969), "70s": (1970, 1979), "80s": (1980, 1989),
            "90s": (1990, 1999), "00s": (2000, 2009), "10s": (2010, 2019),
            "20s": (2020, 2029),
        }
        if filters["decade"] in decade_map:
            y_min, y_max = decade_map[filters["decade"]]
            conditions.append("year >= %s AND year <= %s")
            params.extend([y_min, y_max])

    if not conditions:
        return []

    where_clause = " AND ".join(conditions)
    params.append(limit)

    cur.execute(f"""
        SELECT id, name, artist, album, year, img,
               primary_color, mood, energy, bpm, key
        FROM songs
        WHERE {where_clause}
        ORDER BY energy DESC
        LIMIT %s
    """, params)
    return cur.fetchall()


def semantic_search(cur, query_text, limit=20):
    """Embed the query and find closest songs by cosine similarity."""
    embeddings = embed_model.get_embeddings([query_text])
    query_vector = embeddings[0].values

    cur.execute("""
        SELECT id, name, artist, album, year, img,
               primary_color, mood, energy, bpm, key,
               embedding <=> %s::vector AS distance
        FROM songs
        WHERE embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT %s
    """, (str(query_vector), limit))
    return cur.fetchall()


def similarity_search(cur, song_name, song_artist=None, limit=20):
    """Find songs similar to a reference song."""
    # First find the reference song
    if song_artist:
        cur.execute(
            "SELECT id, embedding FROM songs WHERE name ILIKE %s AND artist ILIKE %s LIMIT 1",
            (f"%{song_name}%", f"%{song_artist}%")
        )
    else:
        cur.execute(
            "SELECT id, embedding FROM songs WHERE name ILIKE %s LIMIT 1",
            (f"%{song_name}%",)
        )

    ref = cur.fetchone()
    if not ref:
        return [], None

    ref_id = ref[0]
    ref_embedding = ref[1]

    cur.execute("""
        SELECT id, name, artist, album, year, img,
               primary_color, mood, energy, bpm, key,
               embedding <=> %s::vector AS distance
        FROM songs
        WHERE id != %s AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT %s
    """, (ref_embedding, ref_id, limit))
    return cur.fetchall(), ref_id


def format_results(rows, has_distance=False):
    """Format database rows into API response."""
    results = []
    for row in rows:
        result = {
            "id": row[0],
            "name": row[1],
            "artist": row[2],
            "album": row[3],
            "year": row[4],
            "img": row[5],
            "primary_color": row[6],
            "mood": row[7] or [],
            "energy": row[8],
            "bpm": row[9],
            "key": row[10],
        }
        if has_distance and len(row) > 11:
            result["similarity"] = round(1 - row[11], 4)
        results.append(result)
    return results


def search(query, limit=20):
    """Main search function — interprets and executes."""
    # Step 1: Gemini interprets the query
    interpretation = interpret_query(query)

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    search_type = interpretation.get("type", "text")
    results = []
    reference_id = None

    # Step 2: Execute the appropriate search
    if search_type == "text":
        text = interpretation.get("text_match") or query
        rows = text_search(cur, text, limit)
        results = format_results(rows)

    elif search_type == "filter":
        filters = interpretation.get("filters", {})
        rows = filter_search(cur, filters, limit)
        results = format_results(rows)

    elif search_type == "semantic":
        semantic_q = interpretation.get("semantic_query") or query
        rows = semantic_search(cur, semantic_q, limit)
        results = format_results(rows, has_distance=True)

    elif search_type == "similarity":
        ref_name = interpretation.get("reference_song") or interpretation.get("text_match") or query
        ref_artist = interpretation.get("reference_artist")
        rows, reference_id = similarity_search(cur, ref_name, ref_artist, limit)
        results = format_results(rows, has_distance=True)

    elif search_type == "hybrid":
        # Run similarity + filter
        ref_name = interpretation.get("reference_song")
        ref_artist = interpretation.get("reference_artist")
        filters = interpretation.get("filters", {})
        semantic_q = interpretation.get("semantic_query")

        if ref_name:
            rows, reference_id = similarity_search(cur, ref_name, ref_artist, limit * 2)
            candidates = format_results(rows, has_distance=True)
        elif semantic_q:
            rows = semantic_search(cur, semantic_q, limit * 2)
            candidates = format_results(rows, has_distance=True)
        else:
            candidates = []

        # Apply filters to narrow down
        if filters and candidates:
            filtered = []
            for c in candidates:
                match = True
                if filters.get("energy_min") and (c.get("energy") or 0) < filters["energy_min"]:
                    match = False
                if filters.get("energy_max") and (c.get("energy") or 1) > filters["energy_max"]:
                    match = False
                if filters.get("bpm_min") and (c.get("bpm") or 0) < filters["bpm_min"]:
                    match = False
                if filters.get("bpm_max") and (c.get("bpm") or 999) > filters["bpm_max"]:
                    match = False
                if filters.get("mood"):
                    song_moods = set(m.lower() for m in (c.get("mood") or []))
                    filter_moods = set(m.lower() for m in filters["mood"])
                    if not song_moods & filter_moods:
                        match = False
                if filters.get("key") and c.get("key") and filters["key"].lower() not in c["key"].lower():
                    match = False
                if match:
                    filtered.append(c)
            results = filtered[:limit]
        else:
            results = candidates[:limit]

    # Also run a quick text search as fallback to ensure we catch exact matches
    if search_type != "text" and len(results) < 3:
        text_rows = text_search(cur, query, 5)
        text_results = format_results(text_rows)
        # Prepend text matches that aren't already in results
        existing_ids = {r["id"] for r in results}
        for tr in text_results:
            if tr["id"] not in existing_ids:
                results.insert(0, tr)

    cur.close()
    conn.close()

    return {
        "query": query,
        "interpretation": interpretation,
        "results": results[:limit],
        "total": len(results),
        "reference_id": reference_id,
    }