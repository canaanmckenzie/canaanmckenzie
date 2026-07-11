// =============================================================================
// SVG Renderer — endless murmuration over a ghost grid
// =============================================================================
// The contribution squares ARE the boids, but unlike the classic version they
// never come home. The animation is built from two SMIL animations per boid:
//
//   1. INTRO (plays once, then freezes) — the grid holds for a breath, then
//      squares peel off in staggered waves and settle into free flight.
//      `repeatCount="1" fill="freeze"` means this story is told exactly once.
//
//   2. LOOP (repeats forever) — a long free-flight murmuration whose final
//      frame lands exactly on its first frame, mid-flight. Because the seam
//      is closed in the middle of flocking motion — not at a grid reset —
//      there is no visual landmark for the eye to catch. The loop starts the
//      instant the intro freezes, and SMIL gives the later-starting animation
//      priority, so the handoff is seamless too.
//
// How the seam is closed: before the loop we simulate a short PRE-ROLL of
// free flight ending at state S0. The loop simulation then starts from S0
// and runs freely; over its final seconds each boid's simulated path is
// crossfaded (smoothstep) into the recorded pre-roll path, which by
// construction arrives at S0 with matching velocity. Last frame == first
// frame, incoming velocity == outgoing velocity. The wind and waypoint
// attractors use integer harmonics of the loop period for the same reason:
// every force field is periodic, so nothing kicks at the boundary.
//
// Underneath the flock sits a static ghost of the contribution graph —
// empty cells at full strength, contributing cells dimmed — so the graph
// stays readable while its bright squares live in the air above it.
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

// Opacity of a contributing cell's home square in the ghost grid.
const GHOST_OPACITY = 0.22;

// Smoothstep — zero first derivative at both ends, so the crossfade into
// the pre-roll path starts and finishes without a velocity kick.
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function renderSVG(cells, gridWidth, gridHeight, palette = 'light', opts = {}) {
  const {
    fps = 30,
    cellSize = 13,
    padding = 30,
    introSeconds = 12,
    loopSeconds = 60,
    // Sample every Nth simulation frame as an SVG keyframe. Values are
    // uniformly spaced in time, which lets us omit keyTimes entirely —
    // roughly halving the file size.
    step = 5,
  } = opts;

  const colors = COLORS[palette];
  const width = gridWidth + padding * 2;
  const height = gridHeight + padding * 2;

  // Timeline, all in simulation frames.
  const HOLD = 2 * fps;                          // grid sits, breathing
  const PREROLL = 4 * fps;                       // free flight ending at S0
  const INTRO = introSeconds * fps;              // hold + peel + pre-roll
  const PEEL_END = INTRO - PREROLL;              // staggered departures finish here
  const LOOP = loopSeconds * fps;
  const BLEND = PREROLL;                         // seam crossfade window

  // Each cell with contributions is a boid.
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
    // Staggered peel-off: random departure time within the peel window
    peelDelay: Math.random(),
    departed: false,
    // Waypoint affinity — where this boid sits on the wp1..wp2 spectrum.
    // The spread of biases is what elongates the flock between attractors.
    wpBias: Math.random(),
  }));

  // The murmuration parameter set — evolving flock behavior driven by a
  // phase t in [0,1]. Only full-cycle harmonics (sin/cos of 2*pi*k*t) are
  // used, so every parameter and waypoint returns to its exact starting
  // value at t=1: the force field is strictly periodic over the loop.
  function flockOpts(t, loopT) {
    const breathe = Math.sin(t * Math.PI * 2 * 3);
    return {
      maxSpeed: 3.5 + Math.sin(t * Math.PI * 2) * 1,
      separationRadius: 17 + Math.abs(breathe) * 6,
      alignmentRadius: 40 + breathe * 10,
      cohesionRadius: 50 + breathe * 15,
      separationWeight: 1.6 + breathe * 0.3,
      alignmentWeight: 0.8 + Math.sin(t * Math.PI * 2 * 5) * 0.3,
      cohesionWeight: 0.6 + breathe * 0.2,
      attractionWeight: 0,
      edgeMargin: 25,
      edgeTurnForce: 0.8,
      turbulence: 0.2 + Math.sin(t * Math.PI * 2 * 4) * 0.1,
      maxCohesionNeighbors: 6 + Math.floor(breathe * 2), // 4-8 — drives sub-flock splitting
      centerPull: 0.0003,
      wrap: false,
      loopT,
      // Two waypoints sweeping slow closed Lissajous curves — they pull the
      // flock through the whole canvas instead of letting it glob up.
      waypoints: [
        {
          x: width * 0.5 + Math.sin(t * Math.PI * 2 * 2 + 0.5) * width * 0.38,
          y: height * 0.5 + Math.cos(t * Math.PI * 2 * 3) * height * 0.3,
          strength: 0.12 + Math.sin(t * Math.PI * 2 * 4) * 0.04,
          channel: 0,
        },
        {
          x: width * 0.5 + Math.cos(t * Math.PI * 2 * 3 + 2.0) * width * 0.38,
          y: height * 0.5 + Math.sin(t * Math.PI * 2 * 2 + 1.0) * height * 0.25,
          strength: 0.1 + Math.cos(t * Math.PI * 2 * 3) * 0.04,
          channel: 1,
        },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Intro simulation: hold, staggered peel-off, pre-roll.
  // introPaths records every frame; prePaths keeps the pre-roll separately
  // because it doubles as the seam crossfade target for the loop.
  // ---------------------------------------------------------------------------
  const introPaths = boids.map(() => []);
  const prePaths = boids.map(() => []);

  for (let frame = 0; frame < INTRO; frame++) {
    if (frame < HOLD) {
      // Hold — grid with subtle breathing
      const breathe = Math.sin(frame * 0.15) * 0.3;
      for (const b of boids) {
        b.x = b.homeX + breathe;
        b.y = b.homeY + breathe * 0.5;
      }
    } else if (frame < PEEL_END) {
      // Peel off — each boid departs at its own moment within the window
      const progress = (frame - HOLD) / (PEEL_END - HOLD);
      const active = [];
      for (const b of boids) {
        if (!b.departed && progress >= b.peelDelay * 0.85) {
          // Departure kick — randomized direction, decisive speed
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 2.5;
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
          b.departed = true;
        }
        if (b.departed) {
          active.push(b);
        } else {
          const breathe = Math.sin(frame * 0.15) * 0.3;
          b.x = b.homeX + breathe;
          b.y = b.homeY + breathe * 0.5;
        }
      }
      if (active.length > 0) {
        simulate(active, [], width, height, frame, {
          maxSpeed: 2 + progress * 2.5,
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
          maxCohesionNeighbors: 7,
          centerPull: 0.0002,
          wrap: false,
        });
      }
    } else {
      // Pre-roll — everyone airborne, full murmuration behavior. Recorded
      // both as the tail of the intro and as the loop's crossfade target.
      // Its phase runs up to t=0 (mod 1) so the flock parameters flow
      // continuously into the start of the loop.
      const k = frame - PEEL_END;
      const t = 1 - (PREROLL - k) / LOOP;
      simulate(boids, [], width, height, frame, flockOpts(t, t));
      for (let i = 0; i < boids.length; i++) {
        prePaths[i].push({ x: boids[i].x, y: boids[i].y });
      }
    }

    for (let i = 0; i < boids.length; i++) {
      introPaths[i].push({ x: boids[i].x, y: boids[i].y });
    }
  }

  // State S0 — end of pre-roll, start (and end) of the loop.
  const s0 = boids.map(b => ({ x: b.x, y: b.y }));

  // ---------------------------------------------------------------------------
  // Loop simulation: LOOP frames of free flight from S0, then close the seam.
  // ---------------------------------------------------------------------------
  const loopPaths = boids.map(() => []);
  for (let i = 0; i < boids.length; i++) {
    loopPaths[i].push({ x: s0[i].x, y: s0[i].y });
  }

  for (let frame = 1; frame <= LOOP; frame++) {
    const t = frame / LOOP;
    simulate(boids, [], width, height, INTRO + frame, flockOpts(t, t));
    for (let i = 0; i < boids.length; i++) {
      loopPaths[i].push({ x: boids[i].x, y: boids[i].y });
    }
  }

  // Close the seam: crossfade the final BLEND frames into the pre-roll path.
  // prePaths[i][k] runs from just-after-peel to exactly S0, so after this
  // blend loopPaths[i][LOOP] == loopPaths[i][0] with matching velocity.
  for (let i = 0; i < boids.length; i++) {
    for (let k = 1; k <= BLEND; k++) {
      const frame = LOOP - BLEND + k;
      const w = smoothstep(k / BLEND);
      const sim = loopPaths[i][frame];
      const target = prePaths[i][k - 1];
      sim.x = sim.x * (1 - w) + target.x * w;
      sim.y = sim.y * (1 - w) + target.y * w;
    }
    // Land exactly on the first frame — no floating-point residue at the seam.
    loopPaths[i][LOOP].x = loopPaths[i][0].x;
    loopPaths[i][LOOP].y = loopPaths[i][0].y;
  }

  // ---------------------------------------------------------------------------
  // Emit SVG
  // ---------------------------------------------------------------------------
  const half = cellSize / 2;

  // Sample a recorded path into an SMIL values list. Uniform sampling means
  // no keyTimes attribute is needed. The final frame is always included so
  // the intro freezes exactly at S0 and the loop closes exactly on itself.
  function sampleValues(path, lastFrame) {
    const values = [];
    for (let f = 0; f < lastFrame; f += step) {
      const p = path[f];
      values.push(`${Math.round(p.x - half)} ${Math.round(p.y - half)}`);
    }
    const last = path[lastFrame];
    values.push(`${Math.round(last.x - half)} ${Math.round(last.y - half)}`);
    return values;
  }

  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  // Ghost grid — the contribution graph stays readable underneath the flock.
  // Empty cells draw at full strength (they are already faint by design);
  // contributing cells leave a dimmed echo at their home position.
  svg += `<g>\n`;
  for (const c of cells) {
    const gx = (c.x + padding - half).toFixed(1);
    const gy = (c.y + padding - half).toFixed(1);
    const opacity = c.level > 0 ? ` opacity="${GHOST_OPACITY}"` : '';
    svg += `<rect x="${gx}" y="${gy}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${colors.levels[c.level]}"${opacity}/>\n`;
  }
  svg += `</g>\n`;

  // The flock — one rect per contributing cell, intro then endless loop.
  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const introValues = sampleValues(introPaths[i].concat([s0[i]]), INTRO);
    const loopValues = sampleValues(loopPaths[i], LOOP);

    svg += `<rect width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${b.color}">\n`;
    svg += `  <animateTransform attributeName="transform" type="translate" `;
    svg += `begin="0s" dur="${introSeconds}s" repeatCount="1" fill="freeze" `;
    svg += `values="${introValues.join(';')}"/>\n`;
    svg += `  <animateTransform attributeName="transform" type="translate" `;
    svg += `begin="${introSeconds}s" dur="${loopSeconds}s" repeatCount="indefinite" `;
    svg += `values="${loopValues.join(';')}"/>\n`;
    svg += `</rect>\n`;
  }

  svg += `</svg>\n`;

  // Sanity: a seam that does not close is a bug, not a style choice.
  for (let i = 0; i < boids.length; i++) {
    const a = loopPaths[i][0];
    const z = loopPaths[i][LOOP];
    if (a.x !== z.x || a.y !== z.y || !isFinite(a.x) || !isFinite(a.y)) {
      throw new Error(`loop seam open for boid ${i}: (${a.x},${a.y}) vs (${z.x},${z.y})`);
    }
  }

  return svg;
}

module.exports = { renderSVG };
