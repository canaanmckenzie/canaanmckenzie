// =============================================================================
// Boid simulation — simplified 2D flocking for SVG animation
// =============================================================================
// Implements Reynolds' three rules:
//   1. Separation — avoid crowding nearby boids
//   2. Alignment  — steer toward average heading of neighbors
//   3. Cohesion   — steer toward average position of neighbors
//
// Plus an extra rule: attraction to contribution cells (the green squares).
// Boids are drawn toward cells with more contributions, creating a visual
// effect of the flock feeding on the contribution graph.
// =============================================================================

class Boid {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clampSpeed(boid, maxSpeed) {
  const speed = Math.sqrt(boid.vx ** 2 + boid.vy ** 2);
  if (speed > maxSpeed) {
    boid.vx = (boid.vx / speed) * maxSpeed;
    boid.vy = (boid.vy / speed) * maxSpeed;
  }
  if (speed < maxSpeed * 0.3) {
    boid.vx = (boid.vx / (speed || 1)) * maxSpeed * 0.3;
    boid.vy = (boid.vy / (speed || 1)) * maxSpeed * 0.3;
  }
}

function simulate(boids, cells, width, height, opts = {}) {
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
  } = opts;

  for (const boid of boids) {
    let sepX = 0, sepY = 0;
    let aliVx = 0, aliVy = 0, aliCount = 0;
    let cohX = 0, cohY = 0, cohCount = 0;

    // Flocking rules — interact with other boids
    for (const other of boids) {
      if (other === boid) continue;
      const d = distance(boid, other);

      // Separation: push away from nearby boids
      if (d < separationRadius && d > 0) {
        sepX += (boid.x - other.x) / d;
        sepY += (boid.y - other.y) / d;
      }

      // Alignment: match velocity of neighbors
      if (d < alignmentRadius) {
        aliVx += other.vx;
        aliVy += other.vy;
        aliCount++;
      }

      // Cohesion: steer toward center of nearby flock
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

    // Attraction to contribution cells — boids are drawn to green squares
    let bestAttrX = 0, bestAttrY = 0, bestWeight = 0;
    for (const cell of cells) {
      if (cell.level === 0) continue; // skip empty cells
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

    // Edge avoidance — steer away from boundaries
    if (boid.x < edgeMargin) boid.vx += edgeTurnForce;
    if (boid.x > width - edgeMargin) boid.vx -= edgeTurnForce;
    if (boid.y < edgeMargin) boid.vy += edgeTurnForce;
    if (boid.y > height - edgeMargin) boid.vy -= edgeTurnForce;

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
