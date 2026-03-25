"""
Migrate local PostgreSQL data to Neon.
Handles JSONB fields properly.
"""
import psycopg
from psycopg.types.json import Jsonb

LOCAL = 'postgresql://resonant:resonant@localhost:5432/resonant'
NEON = 'postgresql://neondb_owner:npg_k4GfKvxIWAy8@ep-small-term-an0zf2vd-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

local_conn = psycopg.connect(LOCAL)
neon_conn = psycopg.connect(NEON)
local_cur = local_conn.cursor()
neon_cur = neon_conn.cursor()

# Clear Neon
neon_cur.execute('DELETE FROM links')
neon_cur.execute('DELETE FROM songs')
neon_conn.commit()
print("Cleared Neon tables")

# Get local column names
local_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'songs' ORDER BY ordinal_position")
local_columns = [r[0] for r in local_cur.fetchall()]

# Get Neon column names
neon_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'songs' ORDER BY ordinal_position")
neon_columns = set(r[0] for r in neon_cur.fetchall())

# Only use columns that exist in BOTH
shared_columns = [c for c in local_columns if c in neon_columns]
print(f"Shared columns: {len(shared_columns)}")

# Columns that are JSONB
JSONB_COLS = {'musician_credits', 'samples_from', 'charts', 'iconic_performances'}

# Fetch songs
cols_str = ', '.join(shared_columns)
local_cur.execute(f'SELECT {cols_str} FROM songs')
rows = local_cur.fetchall()
print(f"Migrating {len(rows)} songs...")

success = 0
errors = 0

for row in rows:
    values = []
    for i, val in enumerate(row):
        col = shared_columns[i]
        if col in JSONB_COLS and (isinstance(val, dict) or isinstance(val, list)):
            values.append(Jsonb(val))
        else:
            values.append(val)
    
    placeholders = ', '.join(['%s'] * len(shared_columns))
    try:
        neon_cur.execute(
            f'INSERT INTO songs ({cols_str}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING',
            values
        )
        success += 1
        if success % 50 == 0:
            neon_conn.commit()
            print(f"  ...{success} songs migrated")
    except Exception as e:
        neon_conn.rollback()
        errors += 1
        if errors <= 5:
            print(f"  Error: {str(e)[:100]}")

neon_conn.commit()
print(f"Songs done: {success} migrated, {errors} errors")

# Migrate links
local_cur.execute('SELECT id, source_id, target_id, reason, score, type, collection_id FROM links')
rows = local_cur.fetchall()
print(f"\nMigrating {len(rows)} links...")

link_success = 0
for row in rows:
    try:
        neon_cur.execute(
            'INSERT INTO links (id, source_id, target_id, reason, score, type, collection_id) VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING',
            row
        )
        link_success += 1
    except Exception as e:
        neon_conn.rollback()
        if link_success == 0:
            print(f"  Link error: {str(e)[:100]}")

neon_conn.commit()
print(f"Links done: {link_success} migrated")

# Verify
neon_cur.execute('SELECT COUNT(*) FROM songs')
print(f"\nNeon songs: {neon_cur.fetchone()[0]}")
neon_cur.execute('SELECT COUNT(*) FROM links')
print(f"Neon links: {neon_cur.fetchone()[0]}")

local_cur.close()
neon_cur.close()
local_conn.close()
neon_conn.close()
print("\nDone!")