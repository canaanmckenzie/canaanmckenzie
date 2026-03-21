// =============================================================================
// Boid simulation — organic 2D flocking for SVG animation
// =============================================================================
// Implements Reynolds' three rules plus turbulence, per-boid personality,
// and dynamic wind to produce natural, birdlike motion.
// =============================================================================

class Boid {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    // Per-boid personality — slight parameter variation
    this.speedScale = 0.85 + Math.random() * 0.3;   // 0.85-1.15x speed
    this.wanderAngle = Math.random() * Math.PI * 2;  // wander phase offset
    this.wanderRate = 0.02 + Math.random() * 0.04;   // how fast wander evolves
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
  } = opts;

  // Global wind — slow sine-wave drift that shifts the whole flock
  const windX = Math.sin(frame * 0.008) * 0.3 + Math.sin(frame * 0.023) * 0.15;
  const windY = Math.cos(frame * 0.011) * 0.2 + Math.cos(frame * 0.019) * 0.1;

  for (const boid of boids) {
    let sepX = 0, sepY = 0;
    let aliVx = 0, aliVy = 0, aliCount = 0;
    let cohX = 0, cohY = 0, cohCount = 0;

    // Flocking rules
    for (const other of boids) {
      if (other === boid) continue;
      const d = distance(boid, other);

      if (d < separationRadius && d > 0) {
        const urgency = 1 - d / separationRadius; // stronger when closer
        sepX += (boid.x - other.x) / d * urgency;
        sepY += (boid.y - other.y) / d * urgency;
      }

      if (d < alignmentRadius) {
        aliVx += other.vx;
        aliVy += other.vy;
        aliCount++;
      }

      if (d < cohesionRadius) {
        cohX += other.x;
        cohY += other.y;
        cohCount++;
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

    // Apply cohesion
    if (cohCount > 0) {
      cohX /= cohCount;
      cohY /= cohCount;
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

    // Per-boid wander — gentle oscillating force perpendicular to heading
    boid.wanderAngle += boid.wanderRate;
    boid.vx += Math.cos(boid.wanderAngle) * turbulence;
    boid.vy += Math.sin(boid.wanderAngle) * turbulence;

    // Global wind
    boid.vx += windX;
    boid.vy += windY;

    // Edge avoidance — smooth quadratic force instead of constant
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

    // Update position
    boid.x += boid.vx;
    boid.y += boid.vy;

    // Wrap around edges (soft)
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
