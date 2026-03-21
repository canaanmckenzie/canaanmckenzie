// =============================================================================
// SVG Renderer — Contribution squares ARE the boids
// =============================================================================
// Uses SVG <animateTransform> for position and <animate> for rotation.
// Animation is 20s (600 frames @ 30fps) to minimize loop repetition.
//
// Phase structure (softer, overlapping transitions):
//   1. Hold grid (8%)    — contribution graph sits, slight breathing
//   2. Peel off (15%)    — squares scatter in waves, not all at once
//   3. Free flock (50%)  — boid swarming with evolving parameters + wind
//   4. Regroup (20%)     — pulled back gradually, flock thins toward grid
//   5. Settle (7%)       — snap into place, brief pause before loop
// =============================================================================

const { simulate } = require('./boids');

const COLORS = {
  light: {
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  },
  dark: {
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
};

function renderSVG(cells, gridWidth, gridHeight, palette = 'light', opts = {}) {
  const {
    frames = 600,
    fps = 30,
    cellSize = 13,
    padding = 30,
  } = opts;

  const colors = COLORS[palette];
  const width = gridWidth + padding * 2;
  const height = gridHeight + padding * 2;
  const duration = frames / fps;

  // Phase boundaries (softer — percentages of total frames)
  const holdEnd = Math.floor(frames * 0.08);
  const peelEnd = Math.floor(frames * 0.23);
  const flockEnd = Math.floor(frames * 0.73);
  const regroupEnd = Math.floor(frames * 0.93);

  // Each cell with contributions is a boid
  const boids = cells.filter(c => c.level > 0).map(c => ({
    homeX: c.x + padding,
    homeY: c.y + padding,
    x: c.x + padding,
    y: c.y + padding,
    vx: 0,
    vy: 0,
    level: c.level,
    color: colors.levels[c.level],
    // Per-boid personality
    speedScale: 0.85 + Math.random() * 0.3,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderRate: 0.02 + Math.random() * 0.04,
    // Staggered peel-off: each boid has a random delay before it leaves the grid
    peelDelay: Math.random(),
  }));

  // Record positions for every frame
  const paths = boids.map(() => []);

  for (let frame = 0; frame < frames; frame++) {
    if (frame <= holdEnd) {
      // Hold — grid with subtle breathing (tiny oscillation)
      const breathe = Math.sin(frame * 0.15) * 0.3;
      for (const b of boids) {
        b.x = b.homeX + breathe;
        b.y = b.homeY + breathe * 0.5;
        b.vx = 0;
        b.vy = 0;
      }
    } else if (frame <= peelEnd) {
      // Peel off — staggered departure, not all at once
      const progress = (frame - holdEnd) / (peelEnd - holdEnd);

      for (const b of boids) {
        if (progress < b.peelDelay * 0.7) {
          // This boid hasn't peeled off yet — stay at home with breathing
          const breathe = Math.sin(frame * 0.15) * 0.3;
          b.x = b.homeX + breathe;
          b.y = b.homeY + breathe * 0.5;
          b.vx = 0;
          b.vy = 0;
        } else {
          // This boid is peeling off
          const boidProgress = (progress - b.peelDelay * 0.7) / (1 - b.peelDelay * 0.7);
          if (b.vx === 0 && b.vy === 0) {
            // Initial kick — randomized direction
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2.5;
            b.vx = Math.cos(angle) * speed;
            b.vy = Math.sin(angle) * speed;
          }

          simulate(boids.filter(ob => ob.vx !== 0 || ob.vy !== 0), [], width, height, frame, {
            maxSpeed: 2 + boidProgress * 3,
            separationRadius: 12,
            alignmentRadius: 35,
            cohesionRadius: 35,
            separationWeight: 1.0,
            alignmentWeight: 0.6,
            cohesionWeight: 0.4,
            attractionWeight: 0,
            edgeMargin: 15,
            edgeTurnForce: 0.6,
            turbulence: 0.1,
          });
          break; // simulate already moved all active boids
        }
      }
    } else if (frame <= flockEnd) {
      // Free flock — evolving parameters for organic movement
      const t = (frame - peelEnd) / (flockEnd - peelEnd);

      // Slowly shift flock behavior: tight → loose → tight
      const breatheCycle = Math.sin(t * Math.PI * 3);
      const cohesionR = 45 + breatheCycle * 15;
      const alignmentR = 35 + breatheCycle * 10;
      const sepR = 10 + Math.abs(breatheCycle) * 5;

      simulate(boids, [], width, height, frame, {
        maxSpeed: 3.5 + Math.sin(t * Math.PI * 2) * 1,
        separationRadius: sepR,
        alignmentRadius: alignmentR,
        cohesionRadius: cohesionR,
        separationWeight: 1.3 + breatheCycle * 0.3,
        alignmentWeight: 0.8 + Math.sin(t * Math.PI * 5) * 0.3,
        cohesionWeight: 0.6 + breatheCycle * 0.2,
        attractionWeight: 0,
        edgeMargin: 25,
        edgeTurnForce: 0.8,
        turbulence: 0.2 + Math.sin(t * Math.PI * 4) * 0.1,
      });
    } else if (frame <= regroupEnd) {
      // Regroup — gradual pull home, flock behavior fading
      const progress = (frame - flockEnd) / (regroupEnd - flockEnd);
      const eased = progress * progress;

      simulate(boids, [], width, height, frame, {
        maxSpeed: 4 * (1 - eased * 0.7),
        separationRadius: 10 * (1 - eased),
        alignmentRadius: 30 * (1 - eased),
        cohesionRadius: 30 * (1 - eased),
        separationWeight: 1.0 * (1 - eased),
        alignmentWeight: 0.5 * (1 - eased),
        cohesionWeight: 0.3 * (1 - eased),
        attractionWeight: 0,
        edgeMargin: 15,
        edgeTurnForce: 0.5,
        turbulence: 0.15 * (1 - eased),
      });

      // Home pull — gets stronger over time
      const homePull = 0.015 + eased * 0.1;
      const damping = 1 - eased * 0.03;
      for (const b of boids) {
        b.vx += (b.homeX - b.x) * homePull;
        b.vy += (b.homeY - b.y) * homePull;
        b.vx *= damping;
        b.vy *= damping;
      }
    } else {
      // Settle — smooth snap back to grid
      const progress = (frame - regroupEnd) / (frames - regroupEnd);
      const snap = 0.12 + progress * 0.25;
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

  // Build SVG — transparent background, no bg rect
  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  // Sample every Nth frame for keyframes
  const step = 4;
  const half = cellSize / 2;

  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const path = paths[i];

    const values = [];
    const keyTimes = [];

    for (let f = 0; f < frames; f += step) {
      const p = path[f];
      values.push(`${(p.x - half).toFixed(1)} ${(p.y - half).toFixed(1)}`);
      keyTimes.push((f / frames).toFixed(4));
    }
    // Clean loop
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
