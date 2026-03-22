const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Read collection from URL: ?collection=alex
function getCollectionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('collection') || 'default';
}

export async function loadGraphData() {
  const collection = getCollectionId();
  try {
    console.log(`[Resonant] Loading collection: ${collection}`);
    const response = await fetch(`${API_BASE}/api/graph?collection=${collection}`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    console.log(`[Resonant] Loaded ${data.nodes.length} nodes, ${data.links.length} links`);
    return data;
  } catch (error) {
    console.warn('[Resonant] API unavailable, falling back to seed data:', error.message);
    const seedData = await import('../data/songsseed.json');
    return seedData.default || seedData;
  }
}

export async function loadClusterData() {
  const collection = getCollectionId();
  try {
    const response = await fetch(`${API_BASE}/api/clusters?collection=${collection}`);
    if (!response.ok) throw new Error('No cluster data');
    return await response.json();
  } catch {
    return { clusters: [] };
  }
}

export function getCollection() {
  return getCollectionId();
}