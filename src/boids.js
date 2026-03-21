// =============================================================================
// Boid simulation — murmuration-style 2D flocking
// =============================================================================
// Reynolds' rules with limited-neighbor cohesion for natural sub-flock
// splitting, global wind, per-boid personality, and moving waypoints.
// =============================================================================

class Boid {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    // Per-boid personality
    this.speedScale = 0.85 + Math.random() * 0.3;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderRate = 0.02 + Math.random() * 0.04;
  }
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clampSpeed(boid, maxSpeed) {
  const personalMax = maxSpeed * boid.speedScale;
  const personalMin = personalMax * 0.2;
  const speed = Math.sqrt(boid.vx ** 2 + boid.vy ** 2);
  if (speed > personalMax) {
    boid.vx = (boid.vx / speed) * personalMax;
    boid.vy = (boid.vy / speed) * personalMax;
  }
  if (speed < personalMin && speed > 0) {
    boid.vx = (boid.vx / speed) * personalMin;
    boid.vy = (boid.vy / speed) * personalMin;
  }
}

function simulate(boids, cells, width, height, frame, opts = {}) {
  const {
    separationRadius = 15,
    alignmentRadius = 40,
    cohesionRadius = 40,
    separationWeight = 1.5,
    alignmentWeight = 1.0,
    cohesionWeight = 1.0,
    attractionWeight = 0.6,
    attractionRadius = 60,
    maxSpeed = 3,
    edgeMargin = 20,
    edgeTurnForce = 0.5,
    turbulence = 0.15,
    maxCohesionNeighbors = 7,    // only cohere with nearest N — creates sub-flocks
    centerPull = 0.0,            // gentle pull toward canvas center
    waypoints = null,            // array of {x,y,strength} moving attractors
  } = opts;

  // Global wind — layered sine waves for organic drift
  const windX = Math.sin(frame * 0.008) * 0.25
              + Math.sin(frame * 0.023) * 0.15
              + Math.sin(frame * 0.0037) * 0.1;
  const windY = Math.cos(frame * 0.011) * 0.2
              + Math.cos(frame * 0.019) * 0.1
              + Math.cos(frame * 0.0043) * 0.08;

  const cx = width / 2;
  const cy = height / 2;

  for (const boid of boids) {
    let sepX = 0, sepY = 0;
    let aliVx = 0, aliVy = 0, aliCount = 0;

    // For limited-neighbor cohesion: collect neighbors with distance
    const cohNeighbors = [];

    // Flocking rules
    for (const other of boids) {
      if (other === boid) continue;
      const d = distance(boid, other);

      // Separation
      if (d < separationRadius && d > 0) {
        const urgency = 1 - d / separationRadius;
        sepX += (boid.x - other.x) / d * urgency;
        sepY += (boid.y - other.y) / d * urgency;
      }

      // Alignment
      if (d < alignmentRadius) {
        aliVx += other.vx;
        aliVy += other.vy;
        aliCount++;
      }

      // Cohesion candidates
      if (d < cohesionRadius) {
        cohNeighbors.push({ other, d });
      }
    }

    // Apply separation
    boid.vx += sepX * separationWeight;
    boid.vy += sepY * separationWeight;

    // Apply alignment
    if (aliCount > 0) {
      aliVx /= aliCount;
      aliVy /= aliCount;
      boid.vx += (aliVx - boid.vx) * alignmentWeight * 0.05;
      boid.vy += (aliVy - boid.vy) * alignmentWeight * 0.05;
    }

    // Apply cohesion — LIMITED to nearest N neighbors
    // This is the key to sub-flock splitting: boids only cohere with
    // their closest few neighbors, not the entire visible group.
    if (cohNeighbors.length > 0) {
      cohNeighbors.sort((a, b) => a.d - b.d);
      const limit = Math.min(maxCohesionNeighbors, cohNeighbors.length);
      let cohX = 0, cohY = 0;
      for (let i = 0; i < limit; i++) {
        cohX += cohNeighbors[i].other.x;
        cohY += cohNeighbors[i].other.y;
      }
      cohX /= limit;
      cohY /= limit;
      boid.vx += (cohX - boid.x) * cohesionWeight * 0.005;
      boid.vy += (cohY - boid.y) * cohesionWeight * 0.005;
    }

    // Attraction to contribution cells
    let bestAttrX = 0, bestAttrY = 0, bestWeight = 0;
    for (const cell of cells) {
      if (cell.level === 0) continue;
      const d = distance(boid, cell);
      if (d < attractionRadius && d > 5) {
        const weight = cell.level / d;
        if (weight > bestWeight) {
          bestWeight = weight;
          bestAttrX = (cell.x - boid.x) / d;
          bestAttrY = (cell.y - boid.y) / d;
        }
      }
    }
    boid.vx += bestAttrX * attractionWeight;
    boid.vy += bestAttrY * attractionWeight;

    // Waypoint attraction — moving points that sweep the flock across the canvas
    if (waypoints) {
      for (const wp of waypoints) {
        const d = distance(boid, wp);
        if (d > 5) {
          boid.vx += (wp.x - boid.x) / d * wp.strength;
          boid.vy += (wp.y - boid.y) / d * wp.strength;
        }
      }
    }

    // Gentle center pull — prevents the whole flock drifting into a corner
    if (centerPull > 0) {
      boid.vx += (cx - boid.x) * centerPull;
      boid.vy += (cy - boid.y) * centerPull;
    }

    // Per-boid wander
    boid.wanderAngle += boid.wanderRate;
    boid.vx += Math.cos(boid.wanderAngle) * turbulence;
    boid.vy += Math.sin(boid.wanderAngle) * turbulence;

    // Global wind
    boid.vx += windX;
    boid.vy += windY;

    // Edge avoidance — smooth quadratic
    if (boid.x < edgeMargin) {
      const t = 1 - boid.x / edgeMargin;
      boid.vx += edgeTurnForce * t * t;
    }
    if (boid.x > width - edgeMargin) {
      const t = 1 - (width - boid.x) / edgeMargin;
      boid.vx -= edgeTurnForce * t * t;
    }
    if (boid.y < edgeMargin) {
      const t = 1 - boid.y / edgeMargin;
      boid.vy += edgeTurnForce * t * t;
    }
    if (boid.y > height - edgeMargin) {
      const t = 1 - (height - boid.y) / edgeMargin;
      boid.vy -= edgeTurnForce * t * t;
    }

    clampSpeed(boid, maxSpeed);

    boid.x += boid.vx;
    boid.y += boid.vy;

    // Soft wrap
    if (boid.x < -10) boid.x = width + 10;
    if (boid.x > width + 10) boid.x = -10;
    if (boid.y < -10) boid.y = height + 10;
    if (boid.y > height + 10) boid.y = -10;
  }
}

function createBoids(count, width, height) {
  const boids = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    boids.push(new Boid(
      Math.random() * width,
      Math.random() * height,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    ));
  }
  return boids;
}

module.exports = { Boid, simulate, createBoids };
