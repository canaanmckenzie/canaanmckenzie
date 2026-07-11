// =============================================================================
// Origami Renderer — Contribution squares fold and beat their wings
// =============================================================================
// Each contribution square is split diagonally into two triangles (wings).
// During flight, the triangles morph via <animate attributeName="points">
// to simulate a diagonal crease folding open and closed — like a little
// piece of paper beating its wings.
//
// Wing beat frequency scales with speed and has per-boid variation.
// During hold/settle phases, wings are flat (full squares).
// =============================================================================

const { simulate } = require('./boids');

const COLORS = {
  light: {
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    // Slightly darker shade for the "underside" wing
    shadow: ['#dfe1e4', '#8bd898', '#36b358', '#278e44', '#1b5e30'],
  },
  dark: {
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    shadow: ['#12161c', '#0b3721', '#005528', '#1f8534', '#2fb845'],
  },
};

function renderOrigamiSVG(cells, gridWidth, gridHeight, palette = 'light', opts = {}) {
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

  // Phase boundaries
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
    shadowColor: colors.shadow[c.level],
    speedScale: 0.85 + Math.random() * 0.3,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderRate: 0.02 + Math.random() * 0.04,
    peelDelay: Math.random(),
    // Wing beat personality
    wingFreq: 0.3 + Math.random() * 0.2,   // base beat frequency
    wingPhase: Math.random() * Math.PI * 2, // phase offset so wings aren't synced
  }));

  // Record positions AND wing fold amount for every frame
  const paths = boids.map(() => []);

  for (let frame = 0; frame < frames; frame++) {
    let wingIntensity = 0; // 0 = flat square, 1 = full wing beat

    if (frame <= holdEnd) {
      // Hold — grid, no wing beat
      const breathe = Math.sin(frame * 0.15) * 0.3;
      for (const b of boids) {
        b.x = b.homeX + breathe;
        b.y = b.homeY + breathe * 0.5;
        b.vx = 0;
        b.vy = 0;
      }
      wingIntensity = 0;
    } else if (frame <= peelEnd) {
      const progress = (frame - holdEnd) / (peelEnd - holdEnd);
      wingIntensity = progress; // wings ramp up as boids peel off

      for (const b of boids) {
        if (progress < b.peelDelay * 0.7) {
          const breathe = Math.sin(frame * 0.15) * 0.3;
          b.x = b.homeX + breathe;
          b.y = b.homeY + breathe * 0.5;
          b.vx = 0;
          b.vy = 0;
        } else {
          if (b.vx === 0 && b.vy === 0) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2.5;
            b.vx = Math.cos(angle) * speed;
            b.vy = Math.sin(angle) * speed;
          }
          simulate(boids.filter(ob => ob.vx !== 0 || ob.vy !== 0), [], width, height, frame, {
            maxSpeed: 2 + progress * 3,
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
          });
          break;
        }
      }
    } else if (frame <= flockEnd) {
      const t = (frame - peelEnd) / (flockEnd - peelEnd);
      wingIntensity = 1; // full wing beats during flight

      const breatheCycle = Math.sin(t * Math.PI * 3);
      const wp1 = {
        x: width * 0.5 + Math.sin(t * Math.PI * 2.3 + 0.5) * width * 0.35,
        y: height * 0.5 + Math.cos(t * Math.PI * 1.7) * height * 0.3,
        strength: 0.15 + Math.sin(t * Math.PI * 4) * 0.05,
      };
      const wp2 = {
        x: width * 0.5 + Math.cos(t * Math.PI * 1.9 + 2.0) * width * 0.3,
        y: height * 0.5 + Math.sin(t * Math.PI * 2.6 + 1.0) * height * 0.25,
        strength: 0.1 + Math.cos(t * Math.PI * 3) * 0.05,
      };

      simulate(boids, [], width, height, frame, {
        maxSpeed: 3.5 + Math.sin(t * Math.PI * 2) * 1,
        separationRadius: 12 + Math.abs(breatheCycle) * 5,
        alignmentRadius: 40 + breatheCycle * 10,
        cohesionRadius: 50 + breatheCycle * 15,
        separationWeight: 1.3 + breatheCycle * 0.3,
        alignmentWeight: 0.8 + Math.sin(t * Math.PI * 5) * 0.3,
        cohesionWeight: 0.6 + breatheCycle * 0.2,
        attractionWeight: 0,
        edgeMargin: 25,
        edgeTurnForce: 0.8,
        turbulence: 0.2 + Math.sin(t * Math.PI * 4) * 0.1,
        maxCohesionNeighbors: 6 + Math.floor(breatheCycle * 2),
        centerPull: 0.0003,
        waypoints: [wp1, wp2],
      });
    } else if (frame <= regroupEnd) {
      const progress = (frame - flockEnd) / (regroupEnd - flockEnd);
      const eased = progress * progress;
      wingIntensity = 1 - eased; // wings calm down as boids return

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
        maxCohesionNeighbors: 7,
      });

      const homePull = 0.015 + eased * 0.1;
      const damping = 1 - eased * 0.03;
      for (const b of boids) {
        b.vx += (b.homeX - b.x) * homePull;
        b.vy += (b.homeY - b.y) * homePull;
        b.vx *= damping;
        b.vy *= damping;
      }
    } else {
      // Settle
      wingIntensity = 0;
      const progress = (frame - regroupEnd) / (frames - regroupEnd);
      const snap = 0.12 + progress * 0.25;
      for (const b of boids) {
        b.vx = (b.homeX - b.x) * snap;
        b.vy = (b.homeY - b.y) * snap;
        b.x += b.vx;
        b.y += b.vy;
      }
    }

    // Record position + wing fold per boid
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      // Wing fold: sine wave with per-boid frequency and phase
      // Ranges from -1 (wings down) through 0 (flat) to 1 (wings up)
      const wingBeat = Math.sin(frame * b.wingFreq + b.wingPhase);
      // Scale by intensity (0 during hold, 1 during flight)
      const fold = wingBeat * wingIntensity;
      paths[i].push({ x: b.x, y: b.y, fold });
    }
  }

  // Build SVG
  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  const step = 4; // sample every 4th frame
  const cs = cellSize;
  const half = cs / 2;

  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const path = paths[i];

    // Build keyframe data
    const translateValues = [];
    const upperWingValues = [];
    const lowerWingValues = [];
    const keyTimes = [];

    for (let f = 0; f < frames; f += step) {
      const p = path[f];
      const ox = p.x - half;
      const oy = p.y - half;

      translateValues.push(`${ox.toFixed(1)} ${oy.toFixed(1)}`);

      // Wing geometry relative to (0,0) of the cellSize square:
      //
      // Full square:  (0,0) (cs,0) (cs,cs) (0,cs)
      // Crease:       diagonal from (0,0) to (cs,cs)
      // Upper wing:   (0,0), (cs,0), (cs,cs)  — top-right triangle
      // Lower wing:   (0,0), (cs,cs), (0,cs)  — bottom-left triangle
      //
      // Wing beat: the non-crease vertex pulls toward/away from the crease.
      // Upper wing's free vertex is (cs,0). Its projection onto the crease
      // is (cs/2, cs/2). We interpolate between (cs,0) and beyond.
      //
      // fold = 0 → flat square
      // fold = 1 → upper wing folds down (vertex moves toward crease)
      // fold = -1 → upper wing folds up (vertex moves away from crease)

      const foldAmount = p.fold * 0.4; // max 40% fold

      // Upper wing: (0,0), (free vertex), (cs,cs)
      // Free vertex interpolates from (cs, 0) toward crease midpoint (cs/2, cs/2)
      const upperFreeX = cs - foldAmount * (cs / 2);
      const upperFreeY = 0 + foldAmount * (cs / 2);

      // Lower wing: (0,0), (cs,cs), (free vertex)
      // Free vertex interpolates from (0, cs) toward crease midpoint
      const lowerFreeX = 0 + foldAmount * (cs / 2);
      const lowerFreeY = cs - foldAmount * (cs / 2);

      upperWingValues.push(
        `0,0 ${upperFreeX.toFixed(1)},${upperFreeY.toFixed(1)} ${cs},${cs}`
      );
      lowerWingValues.push(
        `0,0 ${cs},${cs} ${lowerFreeX.toFixed(1)},${lowerFreeY.toFixed(1)}`
      );

      keyTimes.push((f / frames).toFixed(4));
    }

    // Clean loop
    const first = path[0];
    translateValues.push(`${(first.x - half).toFixed(1)} ${(first.y - half).toFixed(1)}`);
    upperWingValues.push(upperWingValues[0]);
    lowerWingValues.push(lowerWingValues[0]);
    keyTimes.push('1');

    const ktStr = keyTimes.join(';');
    const durStr = `${duration}s`;

    // Group with position animation, containing two wing polygons
    svg += `<g>\n`;
    svg += `  <animateTransform attributeName="transform" type="translate" `;
    svg += `dur="${durStr}" repeatCount="indefinite" `;
    svg += `values="${translateValues.join(';')}" keyTimes="${ktStr}"/>\n`;

    // Upper wing (top-right triangle)
    svg += `  <polygon points="0,0 ${cs},0 ${cs},${cs}" fill="${b.color}">\n`;
    svg += `    <animate attributeName="points" `;
    svg += `dur="${durStr}" repeatCount="indefinite" `;
    svg += `values="${upperWingValues.join(';')}" keyTimes="${ktStr}"/>\n`;
    svg += `  </polygon>\n`;

    // Lower wing (bottom-left triangle) — slightly darker for depth
    svg += `  <polygon points="0,0 ${cs},${cs} 0,${cs}" fill="${b.shadowColor}">\n`;
    svg += `    <animate attributeName="points" `;
    svg += `dur="${durStr}" repeatCount="indefinite" `;
    svg += `values="${lowerWingValues.join(';')}" keyTimes="${ktStr}"/>\n`;
    svg += `  </polygon>\n`;

    svg += `</g>\n`;
  }

  svg += `</svg>\n`;
  return svg;
}

module.exports = { renderOrigamiSVG };
