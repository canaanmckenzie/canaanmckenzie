// =============================================================================
// SVG Renderer — Contribution squares ARE the boids
// =============================================================================
// Uses SVG <animateTransform> instead of CSS keyframes so the animation
// survives GitHub's SVG sanitizer (which strips <style> tags).
//
// Animation phases:
//   1. Hold grid (12%) — contribution graph sits normally
//   2. Disband (18%) — squares scatter with random kicks
//   3. Free flock (40%) — pure boid swirling
//   4. Regroup (18%) — pulled back to grid positions
//   5. Settle (12%) — snap back into place, loop
// =============================================================================

const { simulate } = require('./boids');

const COLORS = {
  light: {
    bg: '#ffffff',
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  },
  dark: {
    bg: '#0d1117',
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
};

function renderSVG(cells, gridWidth, gridHeight, palette = 'light', opts = {}) {
  const {
    frames = 400,
    fps = 30,
    cellSize = 13,
    padding = 30,
  } = opts;

  const colors = COLORS[palette];
  const width = gridWidth + padding * 2;
  const height = gridHeight + padding * 2;
  const duration = frames / fps;

  // Phase timing
  const holdEnd = Math.floor(frames * 0.12);
  const disbandEnd = Math.floor(frames * 0.30);
  const flockEnd = Math.floor(frames * 0.70);
  const regroupEnd = Math.floor(frames * 0.88);

  // Each cell with contributions is a boid — skip level 0 (no commits) for transparent bg
  const boids = cells.filter(c => c.level > 0).map(c => ({
    homeX: c.x + padding,
    homeY: c.y + padding,
    x: c.x + padding,
    y: c.y + padding,
    vx: 0,
    vy: 0,
    level: c.level,
    color: colors.levels[c.level],
  }));

  // Record positions for every frame
  const paths = boids.map(() => []);

  for (let frame = 0; frame < frames; frame++) {
    if (frame <= holdEnd) {
      for (const b of boids) {
        b.x = b.homeX;
        b.y = b.homeY;
        b.vx = 0;
        b.vy = 0;
      }
    } else if (frame <= disbandEnd) {
      const progress = (frame - holdEnd) / (disbandEnd - holdEnd);

      if (frame === holdEnd + 1) {
        for (const b of boids) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 3;
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
        }
      }

      simulate(boids, [], width, height, {
        maxSpeed: 3 + progress * 2,
        separationRadius: 10,
        alignmentRadius: 30,
        cohesionRadius: 30,
        separationWeight: 1.2,
        alignmentWeight: 0.8,
        cohesionWeight: 0.5,
        attractionWeight: 0,
        edgeMargin: 15,
        edgeTurnForce: 0.8,
      });

      const homePull = 0.05 * (1 - progress);
      for (const b of boids) {
        b.vx += (b.homeX - b.x) * homePull;
        b.vy += (b.homeY - b.y) * homePull;
      }
    } else if (frame <= flockEnd) {
      simulate(boids, [], width, height, {
        maxSpeed: 4,
        separationRadius: 12,
        alignmentRadius: 40,
        cohesionRadius: 50,
        separationWeight: 1.5,
        alignmentWeight: 1.0,
        cohesionWeight: 0.8,
        attractionWeight: 0,
        edgeMargin: 20,
        edgeTurnForce: 1.0,
      });
    } else if (frame <= regroupEnd) {
      const progress = (frame - flockEnd) / (regroupEnd - flockEnd);
      const eased = progress * progress;

      simulate(boids, [], width, height, {
        maxSpeed: 4 * (1 - eased * 0.7),
        separationRadius: 8 * (1 - eased),
        alignmentRadius: 30 * (1 - eased),
        cohesionRadius: 30 * (1 - eased),
        separationWeight: 1.0 * (1 - eased),
        alignmentWeight: 0.5 * (1 - eased),
        cohesionWeight: 0.3 * (1 - eased),
        attractionWeight: 0,
        edgeMargin: 15,
        edgeTurnForce: 0.5,
      });

      const homePull = 0.02 + eased * 0.12;
      for (const b of boids) {
        b.vx += (b.homeX - b.x) * homePull;
        b.vy += (b.homeY - b.y) * homePull;
        b.vx *= (1 - eased * 0.03);
        b.vy *= (1 - eased * 0.03);
      }
    } else {
      const progress = (frame - regroupEnd) / (frames - regroupEnd);
      const snap = 0.15 + progress * 0.2;
      for (const b of boids) {
        b.vx = (b.homeX - b.x) * snap;
        b.vy = (b.homeY - b.y) * snap;
        b.x += b.vx;
        b.y += b.vy;
      }
    }

    for (let i = 0; i < boids.length; i++) {
      paths[i].push({ x: boids[i].x, y: boids[i].y });
    }
  }

  // Build SVG with <animateTransform> instead of CSS
  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  // Sample every Nth frame to build the values/keyTimes lists
  const step = 4;
  const half = cellSize / 2;

  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const path = paths[i];

    // Build semicolon-separated values for animateTransform
    const values = [];
    const keyTimes = [];

    for (let f = 0; f < frames; f += step) {
      const p = path[f];
      values.push(`${(p.x - half).toFixed(1)} ${(p.y - half).toFixed(1)}`);
      keyTimes.push((f / frames).toFixed(4));
    }
    // Ensure clean loop — last keyframe = first keyframe position
    const first = path[0];
    values.push(`${(first.x - half).toFixed(1)} ${(first.y - half).toFixed(1)}`);
    keyTimes.push('1');

    svg += `<rect width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${b.color}">\n`;
    svg += `  <animateTransform attributeName="transform" type="translate" `;
    svg += `dur="${duration}s" repeatCount="indefinite" `;
    svg += `values="${values.join(';')}" `;
    svg += `keyTimes="${keyTimes.join(';')}"/>\n`;
    svg += `</rect>\n`;
  }

  svg += `</svg>\n`;
  return svg;
}

module.exports = { renderSVG };
