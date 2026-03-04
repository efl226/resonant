const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function loadGraphData() {
  try {
    console.log('[Resonant] Loading graph from API...');
    const response = await fetch(`${API_BASE}/api/graph`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[Resonant] Loaded ${data.nodes.length} nodes, ${data.links.length} links from API`);
    return data;
    
  } catch (error) {
    console.warn('[Resonant] API unavailable, falling back to seed data:', error.message);
    const seedData = await import('../data/songsseed.json');
    return seedData.default || seedData;
  }
}