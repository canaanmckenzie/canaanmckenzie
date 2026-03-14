// =============================================================================
// SVG Renderer — Contribution squares ARE the boids
// =============================================================================
// The contribution graph squares themselves flock:
//   Phase 1: Grid formation (hold position)
//   Phase 2: Disband (scatter into flocking behavior)
//   Phase 3: Flock freely (swirl around the canvas)
//   Phase 4: Regroup (attracted back to grid positions)
//   Phase 5: Grid formation (settle back into place)
//   Loop.
//
// Each square maintains its contribution color throughout — the graph
// dissolves into colored particles and reassembles.
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

  // Phase timing (as frame ranges)
  const holdStart = 0;
  const holdEnd = Math.floor(frames * 0.12);       // 12% hold grid
  const disbandEnd = Math.floor(frames * 0.30);     // 18% scatter
  const flockEnd = Math.floor(frames * 0.70);       // 40% free flock
  const regroupEnd = Math.floor(frames * 0.88);     // 18% regroup
  // remaining 12% = settled back in grid

  // Each cell is a boid. Store home positions (grid) and sim positions.
  const boids = cells.map(c => ({
    // Home position (where they belong in the grid)
    homeX: c.x + padding,
    homeY: c.y + padding,
    // Current sim position (starts at home)
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
      // Phase 1: Hold grid — stay at home positions
      for (let i = 0; i < boids.length; i++) {
        boids[i].x = boids[i].homeX;
        boids[i].y = boids[i].homeY;
        boids[i].vx = 0;
        boids[i].vy = 0;
      }
    } else if (frame <= disbandEnd) {
      // Phase 2: Disband — add random velocity, weaken home attraction
      const progress = (frame - holdEnd) / (disbandEnd - holdEnd); // 0→1

      if (frame === holdEnd + 1) {
        // Kick: give each boid a random initial velocity
        for (const b of boids) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 3;
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
        }
      }

      // Simulate flocking but with a fading home-pull
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

      // Fading pull toward home
      const homePull = 0.05 * (1 - progress);
      for (const b of boids) {
        b.vx += (b.homeX - b.x) * homePull;
        b.vy += (b.homeY - b.y) * homePull;
      }
    } else if (frame <= flockEnd) {
      // Phase 3: Free flock — pure boid behavior, no home pull
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
      // Phase 4: Regroup — increasing pull back to home positions
      const progress = (frame - flockEnd) / (regroupEnd - flockEnd); // 0→1
      const eased = progress * progress; // ease-in for smooth deceleration

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

      // Growing pull toward home
      const homePull = 0.02 + eased * 0.12;
      for (const b of boids) {
        b.vx += (b.homeX - b.x) * homePull;
        b.vy += (b.homeY - b.y) * homePull;
        // Dampen velocity as we approach home
        b.vx *= (1 - eased * 0.03);
        b.vy *= (1 - eased * 0.03);
      }
    } else {
      // Phase 5: Settle — snap toward home, dampen heavily
      const progress = (frame - regroupEnd) / (frames - regroupEnd);
      const snap = 0.15 + progress * 0.2;
      for (const b of boids) {
        b.vx = (b.homeX - b.x) * snap;
        b.vy = (b.homeY - b.y) * snap;
        b.x += b.vx;
        b.y += b.vy;
      }
    }

    // Record positions
    for (let i = 0; i < boids.length; i++) {
      paths[i].push({ x: boids[i].x, y: boids[i].y });
    }
  }

  // Build SVG
  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svg += `<rect width="${width}" height="${height}" fill="${colors.bg}"/>\n`;

  // CSS keyframes for each square
  svg += `<style>\n`;

  // Sample keyframes — every 4th frame to keep file size sane
  const step = 4;
  for (let i = 0; i < boids.length; i++) {
    const path = paths[i];
    const keyframes = [];

    for (let f = 0; f < frames; f += step) {
      const pct = ((f / frames) * 100).toFixed(1);
      const p = path[f];
      keyframes.push(`${pct}%{transform:translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)}`);
    }
    // Ensure we end at 100%
    const last = path[frames - 1];
    keyframes.push(`100%{transform:translate(${last.x.toFixed(1)}px,${last.y.toFixed(1)}px)}`);

    svg += `@keyframes s${i}{${keyframes.join('')}}\n`;
  }

  // Shared animation properties
  svg += `.sq{animation-duration:${duration}s;animation-timing-function:linear;animation-iteration-count:infinite;}\n`;
  for (let i = 0; i < boids.length; i++) {
    svg += `.s${i}{animation-name:s${i};}\n`;
  }
  svg += `</style>\n`;

  // Render each contribution square as an animated rect
  // Position is set to 0,0 and controlled entirely by CSS transform
  const half = cellSize / 2;
  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    svg += `<rect class="sq s${i}" x="${-half}" y="${-half}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${b.color}"/>\n`;
  }

  svg += `</svg>\n`;
  return svg;
}

module.exports = { renderSVG };
