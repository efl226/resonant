"""
Generate 3D UMAP layouts (n_components=3) from structured song features.
Runs the same layout types as run_umap_layouts.py but outputs x/y/z.
Writes to umap_sonic_x3/y3/z3, umap_vibe_x3/y3/z3, umap_decade_x3/y3/z3, umap_dna_x3/y3/z3.

Run:
  python pipeline/run_umap_layouts_3d.py [--collection default] [--dry-run]
"""

import argparse
import os
import sys

import numpy as np
import psycopg
from dotenv import load_dotenv

# Reuse all feature builders from the 2D pipeline
from run_umap_layouts import (
    build_sonic_features,
    build_vibe_features,
    build_decade_features,
    build_dna_features,
    normalize_coords,
)

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")


def run_umap_3d(features, n_neighbors=None, min_dist=0.1, metric="euclidean", label=""):
    """Run UMAP with n_components=3, return normalized (N, 3) coords."""
    import umap as umap_lib

    n = features.shape[0]
    if n < 4:
        print(f"  ✗ {label}: not enough songs ({n}), skipping")
        return None

    k = n_neighbors if n_neighbors else min(15, n - 1)
    print(f"  Running 3D UMAP [{label}]: {n} songs, {features.shape[1]} features, k={k}")

    reducer = umap_lib.UMAP(
        n_components=3,
        n_neighbors=k,
        min_dist=min_dist,
        metric=metric,
        random_state=42,
        low_memory=False,
    )
    coords = reducer.fit_transform(features)
    return normalize_coords(coords)


def run(collection_id="default", dry_run=False):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

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

    # ── Sonic 3D ───────────────────────────────────────────────────────────
    print("\n[1/3] Building SONIC 3D layout...")
    try:
        sonic_feat = build_sonic_features(songs)
        sonic_coords = run_umap_3d(sonic_feat, label="sonic-3d", min_dist=0.6, n_neighbors=40)
        if sonic_coords is not None:
            layouts["sonic"] = sonic_coords
    except Exception as e:
        print(f"  ✗ Sonic 3D layout failed: {e}")

    # ── Vibe 3D ────────────────────────────────────────────────────────────
    print("\n[2/4] Building VIBE 3D layout...")
    try:
        vibe_feat = build_vibe_features(songs)
        vibe_coords = run_umap_3d(vibe_feat, label="vibe-3d", min_dist=0.6, n_neighbors=40, metric="jaccard")
        if vibe_coords is not None:
            layouts["vibe"] = vibe_coords
    except Exception as e:
        print(f"  ✗ Vibe 3D layout failed (retrying with euclidean): {e}")
        try:
            vibe_coords2 = run_umap_3d(build_vibe_features(songs), label="vibe-3d-fallback", min_dist=0.6, n_neighbors=40)
            if vibe_coords2 is not None:
                layouts["vibe"] = vibe_coords2
        except Exception as e2:
            print(f"  ✗ Vibe 3D fallback also failed: {e2}")

    # ── Decade 3D ──────────────────────────────────────────────────────────
    print("\n[3/4] Building DECADE 3D layout...")
    try:
        decade_feat = build_decade_features(songs)
        decade_coords = run_umap_3d(decade_feat, label="decade-3d", min_dist=0.4, n_neighbors=30)
        if decade_coords is not None:
            layouts["decade"] = decade_coords
    except Exception as e:
        print(f"  ✗ Decade 3D layout failed: {e}")

    # ── DNA 3D ─────────────────────────────────────────────────────────────
    print("\n[4/4] Building DNA 3D layout...")
    try:
        dna_feat = build_dna_features(songs)
        dna_coords = run_umap_3d(dna_feat, label="dna-3d", min_dist=0.08)
        if dna_coords is not None:
            layouts["dna"] = dna_coords
    except Exception as e:
        print(f"  ✗ DNA 3D layout failed: {e}")

    # ── Write to DB ────────────────────────────────────────────────────────
    if dry_run:
        print("\n[dry-run] Skipping DB writes.")
        for name, coords in layouts.items():
            x_range = (coords[:, 0].min(), coords[:, 0].max())
            y_range = (coords[:, 1].min(), coords[:, 1].max())
            z_range = (coords[:, 2].min(), coords[:, 2].max())
            print(f"  {name}: {coords.shape}  X{x_range}  Y{y_range}  Z{z_range}")
        cur.close()
        conn.close()
        return

    print(f"\nWriting {len(layouts)} 3D layout(s) to DB...")
    for layout_name, coords in layouts.items():
        x_col = f"umap_{layout_name}_x3"
        y_col = f"umap_{layout_name}_y3"
        z_col = f"umap_{layout_name}_z3"
        updated = 0
        for i, song_id in enumerate(ids):
            cur.execute(
                f"UPDATE songs SET {x_col} = %s, {y_col} = %s, {z_col} = %s WHERE id = %s",
                (float(coords[i, 0]), float(coords[i, 1]), float(coords[i, 2]), song_id)
            )
            updated += 1
        conn.commit()
        x_range = (coords[:, 0].min(), coords[:, 0].max())
        y_range = (coords[:, 1].min(), coords[:, 1].max())
        z_range = (coords[:, 2].min(), coords[:, 2].max())
        print(f"  ✓ {layout_name}: {updated} songs  X{x_range}  Y{y_range}  Z{z_range}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default="default")
    parser.add_argument("--dry-run", action="store_true", help="Compute but don't write to DB")
    args = parser.parse_args()
    run(args.collection, args.dry_run)
