"""
Generate multiple UMAP layouts from structured song features.
Each layout emphasizes different dimensions, giving users axis control on the frontend.

Layouts:
  sonic  — BPM, energy, key, mode, time sig, vocal type, rhythm, bass/mid/treble weights
  vibe   — mood (one-hot) + themes (one-hot)
  decade — decade + year (era-based proximity)
  dna    — producer, label, studio, songwriter (production lineage)

Run:
  python pipeline/run_umap_layouts.py [--collection default] [--dry-run]
"""

import argparse
import json
import os
import sys

import numpy as np
import psycopg
from dotenv import load_dotenv
from sklearn.preprocessing import LabelEncoder, MinMaxScaler

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")


# ── helpers ──────────────────────────────────────────────────────────────────

def normalize_coords(coords):
    """Scale both axes to [-500, 500]."""
    out = coords.copy().astype(float)
    for dim in range(out.shape[1]):
        col = out[:, dim]
        lo, hi = col.min(), col.max()
        if hi - lo > 0:
            out[:, dim] = ((col - lo) / (hi - lo) * 2 - 1) * 500
    return out


def run_umap(features, n_neighbors=None, min_dist=0.1, metric="euclidean", label=""):
    """Run UMAP on a 2D numpy feature matrix, return normalized (N,2) coords."""
    import umap as umap_lib

    n = features.shape[0]
    if n < 4:
        print(f"  ✗ {label}: not enough songs ({n}), skipping")
        return None

    k = n_neighbors if n_neighbors else min(15, n - 1)
    print(f"  Running UMAP [{label}]: {n} songs, {features.shape[1]} features, k={k}")

    reducer = umap_lib.UMAP(
        n_components=2,
        n_neighbors=k,
        min_dist=min_dist,
        metric=metric,
        random_state=42,
        low_memory=False,
    )
    coords = reducer.fit_transform(features)
    return normalize_coords(coords)


def encode_categorical(values, fallback="unknown"):
    """Label-encode a list of strings (None → fallback). Returns int array."""
    cleaned = [v if v else fallback for v in values]
    le = LabelEncoder()
    return le.fit_transform(cleaned).reshape(-1, 1).astype(float)


def one_hot_pool(tag_lists, top_n=40):
    """
    One-hot encode a list of tag arrays (e.g. mood lists).
    Returns (N, top_n) matrix using the top_n most frequent tags.
    """
    from collections import Counter
    counter = Counter()
    for tags in tag_lists:
        if tags:
            counter.update(tags)
    vocab = [tag for tag, _ in counter.most_common(top_n)]
    vocab_index = {t: i for i, t in enumerate(vocab)}
    mat = np.zeros((len(tag_lists), len(vocab)), dtype=float)
    for row, tags in enumerate(tag_lists):
        if tags:
            for t in tags:
                if t in vocab_index:
                    mat[row, vocab_index[t]] = 1.0
    return mat, vocab


# ── feature builders ─────────────────────────────────────────────────────────

def build_sonic_features(songs):
    """
    Continuous + categorical sonic attributes:
      bpm, energy, bass_weight, mid_weight, treble_weight,
      key (encoded), mode (encoded), time_sig (encoded),
      vocal_type (encoded), rhythm_feel (encoded)
    """
    rows = []
    for s in songs:
        row = [
            (s["bpm"] or 120) / 200.0,
            s["energy"] if s["energy"] is not None else 0.5,
            s["bass_weight"] if s["bass_weight"] is not None else 0.5,
            s["mid_weight"] if s["mid_weight"] is not None else 0.5,
            s["treble_weight"] if s["treble_weight"] is not None else 0.5,
        ]
        rows.append(row)

    mat = np.array(rows, dtype=float)

    # Categorical columns appended
    mat = np.hstack([
        mat,
        encode_categorical([s["key"] for s in songs]),
        encode_categorical([s["mode"] for s in songs]),
        encode_categorical([s["time_signature"] for s in songs]),
        encode_categorical([s["vocal_type"] for s in songs]),
        encode_categorical([s["rhythm_feel"] for s in songs]),
    ])

    # Normalise continuous columns to [0,1]
    scaler = MinMaxScaler()
    return scaler.fit_transform(mat)


def build_vibe_features(songs, top_moods=30, top_themes=30):
    """
    One-hot mood + one-hot themes, concatenated.
    Falls back to all-zeros row if a song has neither.
    """
    mood_mat, mood_vocab = one_hot_pool([s["mood"] for s in songs], top_n=top_moods)
    theme_mat, theme_vocab = one_hot_pool([s["themes"] for s in songs], top_n=top_themes)

    mat = np.hstack([mood_mat, theme_mat])

    print(f"    Vibe vocab: {len(mood_vocab)} moods, {len(theme_vocab)} themes")

    # If nearly all rows are zero (sparse data), pad with energy/bpm to give UMAP signal
    nonzero_rows = np.count_nonzero(mat.sum(axis=1))
    if nonzero_rows < len(songs) * 0.3:
        print(f"    Vibe: only {nonzero_rows}/{len(songs)} rows have mood/theme data — adding sonic fallback")
        sonic_fallback = np.array([
            [(s["bpm"] or 120) / 200.0,
             s["energy"] if s["energy"] is not None else 0.5]
            for s in songs
        ], dtype=float)
        mat = np.hstack([mat, sonic_fallback])

    return mat


def build_decade_features(songs):
    """
    Era-based proximity: decade + exact year, heavily weighted toward era grouping.
    """
    decade_norm = np.array([
        (float(s["year"]) // 10 * 10 - 1950) / 80.0 if s["year"] else 0.5
        for s in songs
    ]).reshape(-1, 1)

    year_norm = np.array([
        (float(s["year"]) - 1950) / 80.0 if s["year"] else 0.5
        for s in songs
    ]).reshape(-1, 1)

    # Weight decade more heavily so songs cluster by era first
    mat = np.hstack([decade_norm * 3.0, year_norm])

    scaler = MinMaxScaler()
    return scaler.fit_transform(mat)


def build_dna_features(songs):
    """
    Production lineage: producer, label, studio, songwriter.
    No time component — purely about who made it and where.
    """
    # Songwriter: use first songwriter if it's a list
    def first_songwriter(s):
        sw = s.get("songwriter")
        if isinstance(sw, list) and sw:
            return sw[0]
        return sw if sw else None

    mat = np.hstack([
        encode_categorical([s["producer"] for s in songs]),
        encode_categorical([s["label"] for s in songs]),
        encode_categorical([s["studio"] for s in songs]),
        encode_categorical([first_songwriter(s) for s in songs]),
        encode_categorical([s.get("mixing_engineer") for s in songs]),
    ])

    scaler = MinMaxScaler()
    return scaler.fit_transform(mat)


# ── main ─────────────────────────────────────────────────────────────────────

def run(collection_id="default", dry_run=False):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    # Fetch all songs for this collection (no embedding filter needed)
    cur.execute("""
        SELECT id, name, artist, year,
               bpm, energy, key, mode, time_signature,
               vocal_type, rhythm_feel,
               bass_weight, mid_weight, treble_weight,
               mood, themes,
               producer, label, studio,
               songwriter, mixing_engineer
        FROM songs
        WHERE collection_id = %s
    """, (collection_id,))

    rows = cur.fetchall()
    cols = [
        "id", "name", "artist", "year",
        "bpm", "energy", "key", "mode", "time_signature",
        "vocal_type", "rhythm_feel",
        "bass_weight", "mid_weight", "treble_weight",
        "mood", "themes",
        "producer", "label", "studio",
        "songwriter", "mixing_engineer",
    ]
    songs = [dict(zip(cols, r)) for r in rows]
    print(f"\nLoaded {len(songs)} songs from collection '{collection_id}'")

    if len(songs) < 4:
        print("Need at least 4 songs. Exiting.")
        sys.exit(1)

    ids = [s["id"] for s in songs]

    layouts = {}

    # ── Sonic ──────────────────────────────────────────────────────────────
    print("\n[1/3] Building SONIC layout...")
    try:
        sonic_feat = build_sonic_features(songs)
        sonic_coords = run_umap(sonic_feat, label="sonic", min_dist=0.6, n_neighbors=40)
        if sonic_coords is not None:
            layouts["sonic"] = sonic_coords
    except Exception as e:
        print(f"  ✗ Sonic layout failed: {e}")

    # ── Vibe ───────────────────────────────────────────────────────────────
    print("\n[2/4] Building VIBE layout...")
    try:
        vibe_feat = build_vibe_features(songs)
        vibe_coords = run_umap(vibe_feat, label="vibe", min_dist=0.6, n_neighbors=40, metric="jaccard")
        if vibe_coords is not None:
            layouts["vibe"] = vibe_coords
    except Exception as e:
        print(f"  ✗ Vibe layout failed (retrying with euclidean): {e}")
        try:
            vibe_feat2 = build_vibe_features(songs)
            vibe_coords2 = run_umap(vibe_feat2, label="vibe-fallback", min_dist=0.6, n_neighbors=40)
            if vibe_coords2 is not None:
                layouts["vibe"] = vibe_coords2
        except Exception as e2:
            print(f"  ✗ Vibe fallback also failed: {e2}")

    # ── Decade ─────────────────────────────────────────────────────────────
    print("\n[3/4] Building DECADE layout...")
    try:
        decade_feat = build_decade_features(songs)
        decade_coords = run_umap(decade_feat, label="decade", min_dist=0.4, n_neighbors=30)
        if decade_coords is not None:
            layouts["decade"] = decade_coords
    except Exception as e:
        print(f"  ✗ Decade layout failed: {e}")

    # ── DNA ────────────────────────────────────────────────────────────────
    print("\n[4/4] Building DNA layout...")
    try:
        dna_feat = build_dna_features(songs)
        dna_coords = run_umap(dna_feat, label="dna", min_dist=0.4, n_neighbors=30)
        if dna_coords is not None:
            layouts["dna"] = dna_coords
    except Exception as e:
        print(f"  ✗ DNA layout failed: {e}")

    # ── Write to DB ────────────────────────────────────────────────────────
    if dry_run:
        print("\n[dry-run] Skipping DB writes.")
        for name, coords in layouts.items():
            print(f"  {name}: {coords.shape} coords computed OK")
        cur.close()
        conn.close()
        return

    print(f"\nWriting {len(layouts)} layout(s) to DB...")
    for layout_name, coords in layouts.items():
        x_col = f"umap_{layout_name}_x"
        y_col = f"umap_{layout_name}_y"
        updated = 0
        for i, song_id in enumerate(ids):
            cur.execute(
                f"UPDATE songs SET {x_col} = %s, {y_col} = %s WHERE id = %s",
                (float(coords[i, 0]), float(coords[i, 1]), song_id)
            )
            updated += 1
        conn.commit()
        x_range = (coords[:, 0].min(), coords[:, 0].max())
        y_range = (coords[:, 1].min(), coords[:, 1].max())
        print(f"  ✓ {layout_name}: {updated} songs  X{x_range}  Y{y_range}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default="default")
    parser.add_argument("--dry-run", action="store_true", help="Compute but don't write to DB")
    args = parser.parse_args()
    run(args.collection, args.dry_run)
