// =============================================================================
// SVG Renderer — the commit graph IS the swarm
// =============================================================================
// No flock hovering over a static graph: the contribution tiles themselves
// take turns flying. A murmuration sweeps side to side across the canvas,
// and as it passes a column, tiles lift out of the grid and join it; when
// it sweeps back past their home, they drop out and land in their slot.
// At any instant roughly a third of the tiles are airborne — the graph is
// always readable, always slightly incomplete, always being reassembled.
//
// There is no intro and no reset. The whole thing is ONE seamless loop:
// every tile's flight schedule is defined in loop-phase space, the wind
// and waypoint attractors use integer harmonics of the loop period, and
// the simulation runs two full laps — the first as warm-up, the second as
// the recording. The recorded lap's final seconds are crossfaded into the
// warm-up lap's final seconds, whose continuation is by construction the
// recorded lap's own first frame: last frame == first frame, velocities
// matched, seam invisible.
//
// Flight scheduling is causal, not random: waypoint 1 sweeps the full
// width of the canvas twice per loop, crossing every column at computable
// phases. Each tile departs (with a kick toward the passing swarm) at one
// crossing of its own column and returns at a later one — so recruitment
// and drop-off both happen when the swarm is visibly overhead.
//
// Underneath everything sits a lattice of empty-level sockets, one per
// cell, so a tile that is currently flying leaves a visible hole in the
// graph — the proof that the swarm is the graph and not a decoration.
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

// Smoothstep — zero first derivative at both ends, so the seam crossfade
// starts and finishes without a velocity kick.
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Cubic Hermite from (p0, v0) to (p1, rest) over s in [0,1] — the landing
// rail. Guarantees arrival exactly at home with zero velocity, entered at
// the tile's actual flight velocity so the hand-off from flocking is smooth.
function hermite(s, p0, v0, p1) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * v0 + (-2 * s3 + 3 * s2) * p1;
}

function renderSVG(cells, gridWidth, gridHeight, palette = 'light', opts = {}) {
  const {
    fps = 30,
    cellSize = 13,
    padding = 30,
    loopSeconds = 60,
    // Sample every Nth simulation frame as an SVG keyframe. Uniform spacing
    // lets us omit keyTimes entirely — roughly half the file size.
    step = 5,
  } = opts;

  const colors = COLORS[palette];
  const width = gridWidth + padding * 2;
  const height = gridHeight + padding * 2;

  const LOOP = loopSeconds * fps;       // frames per lap
  const BLEND = 4 * fps;                // seam crossfade window
  const LAND_MAX = 3 * fps;             // longest landing rail, frames
  const landPhase = LAND_MAX / LOOP;

  // Waypoint 1's x-sweep: x(t) = mid + sin(2*pi*2*t + 0.5) * amp.
  // Solved below for the phases at which it crosses a given column.
  const WP_PHASE0 = 0.5;
  const WP_AMP = 0.38;

  // The phases t in [0,1) at which the sweeping waypoint crosses x = homeX.
  // sin has two crossings per cycle and the sweep runs two cycles per loop,
  // so every column is visited four times. Edge columns the sweep never
  // quite reaches are clamped to its nearest approach.
  function crossingPhases(homeX) {
    const c = Math.max(-0.98, Math.min(0.98, (homeX - width * 0.5) / (width * WP_AMP)));
    const a = Math.asin(c);
    const phases = [];
    for (const theta of [a, Math.PI - a, a + 2 * Math.PI, 3 * Math.PI - a]) {
      phases.push((((theta - WP_PHASE0) / (4 * Math.PI)) % 1 + 1) % 1);
    }
    return phases.sort((p, q) => p - q);
  }

  // Each cell with contributions is a tile that will take flights.
  const boids = cells.filter(c => c.level > 0).map(c => {
    const homeX = c.x + padding;
    const homeY = c.y + padding;
    const phases = crossingPhases(homeX);
    // Depart at one crossing of our column, return at a later one — one or
    // two visits downstream, so flights last roughly a quarter to half a
    // lap. Jitter keeps columns from lifting off as a rigid sheet.
    const j = Math.floor(Math.random() * 4);
    const hops = 1 + Math.floor(Math.random() * 2);
    const depart = (phases[j] + (Math.random() - 0.5) * 0.03 + 1) % 1;
    let dur = (phases[(j + hops) % 4] - phases[j] + 1) % 1;
    if (dur < landPhase * 3) dur += (phases[(j + hops + 1) % 4] - phases[(j + hops) % 4] + 1) % 1;
    dur = Math.min(dur + (Math.random() - 0.5) * 0.02, 0.6);
    return {
      homeX, homeY,
      x: homeX, y: homeY, vx: 0, vy: 0,
      level: c.level,
      color: colors.levels[c.level],
      depart, dur,
      state: 'home', homing: false,
      landP0: null, landV0: null, landFrame: 0, landDur: LAND_MAX,
      // Per-boid personality
      speedScale: 0.85 + Math.random() * 0.3,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderRate: 0.02 + Math.random() * 0.04,
      // Waypoint affinity — spread between the two attractors is what
      // stretches the flock into crossing sub-flocks instead of one ball.
      wpBias: Math.random(),
    };
  });

  // The murmuration force field. Only full-cycle harmonics of t, so every
  // parameter and waypoint returns to its exact starting value at t=1.
  function flockOpts(t) {
    const breathe = Math.sin(t * Math.PI * 2 * 3);
    return {
      maxSpeed: 3.5 + Math.sin(t * Math.PI * 2) * 1,
      // Radii sized for a sparse flock — with only as many tiles as there
      // are contribution days, neighbors sit far apart; small radii read
      // as scattered individuals instead of one flowing body.
      separationRadius: 15 + Math.abs(breathe) * 5,
      alignmentRadius: 55 + breathe * 10,
      cohesionRadius: 70 + breathe * 15,
      separationWeight: 1.2 + breathe * 0.2,
      alignmentWeight: 1.0 + Math.sin(t * Math.PI * 2 * 5) * 0.3,
      cohesionWeight: 0.7 + breathe * 0.2,
      attractionWeight: 0,
      edgeMargin: 25,
      edgeTurnForce: 0.8,
      turbulence: 0.15 + Math.sin(t * Math.PI * 2 * 4) * 0.05,
      maxCohesionNeighbors: 7 + Math.floor(breathe * 2),
      centerPull: 0.0003,
      wrap: false,
      loopT: t,
      waypoints: [
        {
          x: width * 0.5 + Math.sin(t * Math.PI * 2 * 2 + WP_PHASE0) * width * WP_AMP,
          y: height * 0.5 + Math.cos(t * Math.PI * 2 * 3) * height * 0.3,
          strength: 0.12 + Math.sin(t * Math.PI * 2 * 4) * 0.04,
          channel: 0,
        },
        {
          x: width * 0.5 + Math.cos(t * Math.PI * 2 * 3 + 2.0) * width * WP_AMP,
          y: height * 0.5 + Math.sin(t * Math.PI * 2 * 2 + 1.0) * height * 0.25,
          strength: 0.1 + Math.cos(t * Math.PI * 2 * 3) * 0.04,
          channel: 1,
        },
      ],
    };
  }

  // Advance the whole system one frame at loop phase t. Tiles move between
  // three states: sitting at home, flying with the flock, and riding the
  // landing rail. Only flying tiles participate in the flocking forces.
  function tick(t, frame, opsForFrame) {
    const flying = [];
    for (const b of boids) {
      const w = ((t - b.depart) % 1 + 1) % 1;   // phase within this tile's cycle
      const airborne = w < b.dur;

      if (b.state === 'home') {
        if (airborne && w < b.dur - landPhase) {
          // The swarm is overhead — kick off toward the sweeping waypoint.
          const wp = flockOpts(t).waypoints[0];
          const dx = wp.x - b.x, dy = wp.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const kick = 2.5 + Math.random() * 1.5;
          b.vx = (dx / d) * kick + (Math.random() - 0.5);
          b.vy = (dy / d) * kick + (Math.random() - 0.5);
          b.state = 'fly';
        }
      }

      if (b.state === 'fly') {
        // The return phase only OPENS the landing window — a tile never
        // abandons the swarm to travel home alone. It keeps flocking with
        // a gentle homeward drift, and detaches only when the flock
        // actually carries it over its own slot.
        b.homing = !airborne || w >= b.dur - landPhase;
        if (b.homing) {
          const dist = Math.hypot(b.x - b.homeX, b.y - b.homeY);
          if (dist < 60) {
            b.landDur = Math.max(Math.round(fps * 0.7), Math.min(LAND_MAX, Math.round(dist / 4.5)));
            b.state = 'land';
            b.landP0 = { x: b.x, y: b.y };
            b.landV0 = { x: b.vx * b.landDur, y: b.vy * b.landDur };
            b.landFrame = 0;
          }
        }
      }

      if (b.state === 'fly') {
        flying.push(b);
      } else if (b.state === 'land') {
        b.landFrame++;
        const s = Math.min(b.landFrame / b.landDur, 1);
        b.x = hermite(s, b.landP0.x, b.landV0.x, b.homeX);
        b.y = hermite(s, b.landP0.y, b.landV0.y, b.homeY);
        b.vx = 0;
        b.vy = 0;
        if (s >= 1) {
          b.x = b.homeX;
          b.y = b.homeY;
          b.state = 'home';
        }
      } else if (b.state === 'home') {
        b.x = b.homeX;
        b.y = b.homeY;
      }
    }
    if (flying.length > 0) {
      simulate(flying, [], width, height, frame, opsForFrame);
      // Homeward drift for tiles whose landing window is open — a steer on
      // the order of the waypoint pull, so they lean toward home while
      // staying inside the flock rather than being yanked out of it.
      for (const b of flying) {
        if (b.homing) {
          const dx = b.homeX - b.x, dy = b.homeY - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.vx += (dx / d) * 0.25;
          b.vy += (dy / d) * 0.25;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lap 1 — warm-up from the complete grid. Its tail doubles as the seam
  // crossfade target: lap 2's first frame is the literal continuation of
  // lap 1's last, so bending lap 2's tail onto lap 1's tail closes the loop.
  // ---------------------------------------------------------------------------
  const tailPaths = boids.map(() => []);
  for (let frame = 0; frame < LOOP; frame++) {
    const t = frame / LOOP;
    tick(t, frame, flockOpts(t));
    if (frame >= LOOP - BLEND) {
      for (let i = 0; i < boids.length; i++) {
        tailPaths[i].push({ x: boids[i].x, y: boids[i].y });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lap 2 — the recording.
  // ---------------------------------------------------------------------------
  const loopPaths = boids.map(b => [{ x: b.x, y: b.y }]);
  for (let frame = 1; frame <= LOOP; frame++) {
    const t = (frame % LOOP) / LOOP;
    tick(t, LOOP + frame, flockOpts(t));
    for (let i = 0; i < boids.length; i++) {
      loopPaths[i].push({ x: boids[i].x, y: boids[i].y });
    }
  }

  // Close the seam: crossfade the final BLEND frames onto lap 1's tail,
  // which ends exactly at lap 2's frame 0.
  for (let i = 0; i < boids.length; i++) {
    for (let k = 1; k <= BLEND; k++) {
      const w = smoothstep(k / BLEND);
      const p = loopPaths[i][LOOP - BLEND + k];
      const target = tailPaths[i][k - 1];
      p.x = p.x * (1 - w) + target.x * w;
      p.y = p.y * (1 - w) + target.y * w;
    }
    loopPaths[i][LOOP].x = loopPaths[i][0].x;
    loopPaths[i][LOOP].y = loopPaths[i][0].y;
  }

  // ---------------------------------------------------------------------------
  // Emit SVG
  // ---------------------------------------------------------------------------
  const half = cellSize / 2;

  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  // No background, no lattice — the animation is nothing but the real
  // contribution tiles themselves, on transparency. The graph exists
  // wherever tiles are currently seated.

  // The tiles — one endlessly looping rect per contributing cell.
  const duration = loopSeconds;
  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const values = [];
    for (let f = 0; f < LOOP; f += step) {
      const p = loopPaths[i][f];
      values.push(`${Math.round(p.x - half)} ${Math.round(p.y - half)}`);
    }
    values.push(values[0]);

    svg += `<rect width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${b.color}">\n`;
    svg += `  <animateTransform attributeName="transform" type="translate" `;
    svg += `begin="0s" dur="${duration}s" repeatCount="indefinite" `;
    svg += `values="${values.join(';')}"/>\n`;
    svg += `</rect>\n`;
  }

  svg += `</svg>\n`;

  // Sanity: an open seam or a runaway tile is a bug, not a style choice.
  for (let i = 0; i < boids.length; i++) {
    const a = loopPaths[i][0];
    const z = loopPaths[i][LOOP];
    if (a.x !== z.x || a.y !== z.y || !isFinite(a.x) || !isFinite(a.y)) {
      throw new Error(`loop seam open for tile ${i}: (${a.x},${a.y}) vs (${z.x},${z.y})`);
    }
  }

  return svg;
}

module.exports = { renderSVG };
