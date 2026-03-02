/**
 * drawGlyph.js — Music Glyph Renderer
 * 
 * Translates a song's sonic_dna into a unique visual glyph:
 *   - Shape (polygon sides): driven by BPM / tempo
 *   - Hue: driven by musical key (chromatic wheel) + mode (warm/cool shift)
 *   - Saturation & opacity: driven by energy
 */

// ============================================================
// 1. KEY → HUE MAPPING
// Maps the 12 chromatic notes to positions on the color wheel.
// Major keys shift warmer (+15°), minor keys shift cooler (-15°).
// ============================================================

const KEY_HUE_MAP = {
  'C':  0,    // Red
  'C#': 30,   'Db': 30,
  'D':  55,   // Orange
  'D#': 80,   'Eb': 80,
  'E':  110,  // Yellow-Green
  'F':  140,  // Green
  'F#': 170,  'Gb': 170,
  'G':  200,  // Cyan
  'G#': 225,  'Ab': 225,
  'A':  255,  // Blue
  'A#': 280,  'Bb': 280,
  'B':  310,  // Violet
};

/**
 * Parse a key string like "C# Minor", "F Major", "Eb Major", "Db Major", "B Flat Major"
 * Returns { note, isMinor }
 */
function parseKey(keyStr) {
  if (!keyStr || keyStr === 'Variable' || keyStr === 'Variable / Chromatic') {
    return { note: null, isMinor: false };
  }

  // Normalize "Flat" → "b" and "Sharp" → "#"
  let normalized = keyStr
    .replace(/\bFlat\b/gi, 'b')
    .replace(/\bSharp\b/gi, '#')
    .trim();

  const isMinor = /minor/i.test(normalized);

  // Extract the note (first 1-2 characters before space or end)
  const noteMatch = normalized.match(/^([A-Ga-g][#b]?)/);
  const note = noteMatch ? noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1) : null;

  return { note, isMinor };
}

/**
 * Get the hue for a given key string.
 * Major → warmer (+15°), Minor → cooler (-15°)
 */
function getHueFromKey(keyStr) {
  const { note, isMinor } = parseKey(keyStr);
  if (!note) return 220; // Default: blue-ish for unknown keys

  const baseHue = KEY_HUE_MAP[note] ?? 220;
  const modeShift = isMinor ? -15 : 15;

  return (baseHue + modeShift + 360) % 360;
}


// ============================================================
// 2. BPM → SHAPE (polygon sides)
// Slow → circle/triangle, Mid → pentagon/hexagon, Fast → complex
// ============================================================

function getSidesFromBPM(bpm) {
  if (!bpm || bpm <= 0) return 0; // circle fallback
  if (bpm < 80)  return 0;  // Circle — very slow, ambient
  if (bpm < 95)  return 3;  // Triangle — slow grooves
  if (bpm < 110) return 4;  // Diamond/Square — mid-slow
  if (bpm < 120) return 5;  // Pentagon — mid-tempo
  if (bpm < 130) return 6;  // Hexagon — driving
  if (bpm < 140) return 7;  // Heptagon — fast
  return 8;                  // Octagon — very fast
}


// ============================================================
// 3. ENERGY → SATURATION + GLOW
// High energy = vivid, saturated, glowing
// Low energy = desaturated, pastel, faded
// ============================================================

function getEnergyVisuals(energy) {
  const e = Math.max(0, Math.min(1, energy || 0.5));
  return {
    saturation: 30 + e * 60,        // 30% → 90%
    lightness: 45 + (1 - e) * 15,   // 45% → 60% (low energy = lighter/pastel)
    glowRadius: e * 12,             // 0 → 12px glow
    fillOpacity: 0.15 + e * 0.35,   // 0.15 → 0.50 fill opacity
    strokeOpacity: 0.4 + e * 0.5,   // 0.4 → 0.9 stroke opacity
  };
}


// ============================================================
// 4. POLYGON PATH DRAWING
// Draws a regular polygon with N sides, or a circle if sides=0
// ============================================================

function drawPolygonPath(ctx, x, y, radius, sides) {
  if (sides < 3) {
    // Circle
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }

  const angleOffset = -Math.PI / 2; // Start from top

  for (let i = 0; i <= sides; i++) {
    const angle = angleOffset + (i * 2 * Math.PI) / sides;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.closePath();
}


// ============================================================
// 5. MAIN DRAW FUNCTION
// ============================================================

/**
 * drawGlyph(ctx, node, size, options)
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} node - Graph node with sonic_dna
 * @param {number} size - Diameter of the glyph
 * @param {Object} options
 * @param {boolean} options.isSelected - Whether this node is currently selected
 * @param {boolean} options.isHighlighted - Whether this node is in the highlight set
 * @param {number} options.globalScale - Current zoom level of the graph
 */
export function drawGlyph(ctx, node, size, { isSelected, isHighlighted, globalScale }) {
  const bpm = node.sonic_dna?.bpm || 100;
  const key = node.sonic_dna?.key || 'C Major';
  const energy = node.sonic_dna?.energy || 0.5;

  const sides = getSidesFromBPM(bpm);
  const hue = getHueFromKey(key);
  const ev = getEnergyVisuals(energy);

  const radius = size / 2;
  const color = `hsl(${hue}, ${ev.saturation}%, ${ev.lightness}%)`;

  // --- Outer glow (energy-driven) ---
  if (ev.glowRadius > 2) {
    ctx.save();
    ctx.beginPath();
    drawPolygonPath(ctx, node.x, node.y, radius + ev.glowRadius, sides);
    ctx.shadowColor = color;
    ctx.shadowBlur = ev.glowRadius * 2;
    ctx.fillStyle = `hsla(${hue}, ${ev.saturation}%, ${ev.lightness}%, 0.08)`;
    ctx.fill();
    ctx.restore();
  }

  // --- Fill ---
  ctx.beginPath();
  drawPolygonPath(ctx, node.x, node.y, radius, sides);
  ctx.fillStyle = `hsla(${hue}, ${ev.saturation}%, ${ev.lightness}%, ${ev.fillOpacity})`;
  ctx.fill();

  // --- Stroke ---
  ctx.beginPath();
  drawPolygonPath(ctx, node.x, node.y, radius, sides);
  ctx.strokeStyle = `hsla(${hue}, ${ev.saturation}%, ${ev.lightness}%, ${ev.strokeOpacity})`;
  ctx.lineWidth = (isSelected ? 3 : 1.5) / globalScale;
  ctx.stroke();

  // --- Inner highlight ring on selection ---
  if (isSelected) {
    ctx.beginPath();
    drawPolygonPath(ctx, node.x, node.y, radius + 4 / globalScale, sides);
    ctx.strokeStyle = `hsla(${hue}, 90%, 70%, 0.8)`;
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();
  }

  // --- Small center dot (like a star's core) ---
  ctx.beginPath();
  ctx.arc(node.x, node.y, Math.max(2, radius * 0.15), 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${hue}, ${ev.saturation}%, ${Math.min(ev.lightness + 20, 90)}%, ${ev.strokeOpacity})`;
  ctx.fill();
}


// ============================================================
// 6. LABEL DRAWING (reusable)
// ============================================================

export function drawLabel(ctx, node, size, { isHighlighted, globalScale }) {
  if (!isHighlighted || globalScale <= 1.2) return;

  const label = node.name;
  const artistLabel = node.artist;
  const fontSize = 14 / globalScale;
  const smallFontSize = 10 / globalScale;

  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';

  const textWidth = ctx.measureText(label).width;
  ctx.font = `400 ${smallFontSize}px Inter, sans-serif`;
  const artistWidth = ctx.measureText(artistLabel).width;
  const bgWidth = Math.max(textWidth, artistWidth) + 10;
  const bgHeight = fontSize + smallFontSize + 10;
  const bgY = node.y + size / 2 + 4;

  // Background pill
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  const bgRadius = 4 / globalScale;
  const bgX = node.x - bgWidth / 2;
  ctx.beginPath();
  ctx.moveTo(bgX + bgRadius, bgY);
  ctx.lineTo(bgX + bgWidth - bgRadius, bgY);
  ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + bgRadius);
  ctx.lineTo(bgX + bgWidth, bgY + bgHeight - bgRadius);
  ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - bgRadius, bgY + bgHeight);
  ctx.lineTo(bgX + bgRadius, bgY + bgHeight);
  ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - bgRadius);
  ctx.lineTo(bgX, bgY + bgRadius);
  ctx.quadraticCurveTo(bgX, bgY, bgX + bgRadius, bgY);
  ctx.closePath();
  ctx.fill();

  // Song title
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText(label, node.x, bgY + fontSize + 2);

  // Artist name
  ctx.font = `400 ${smallFontSize}px Inter, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText(artistLabel, node.x, bgY + fontSize + smallFontSize + 4);
}