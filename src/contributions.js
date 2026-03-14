// =============================================================================
// GitHub Contribution Graph Fetcher
// =============================================================================
// Fetches contribution data via GitHub's GraphQL API and returns it as a
// grid of cells with x/y positions and contribution levels (0-4).
// =============================================================================

async function fetchContributions(username, token) {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  return data.data.user.contributionsCollection.contributionCalendar;
}

// Convert GitHub contribution levels to numeric values (0-4)
function levelToNumber(level) {
  const map = {
    'NONE': 0,
    'FIRST_QUARTILE': 1,
    'SECOND_QUARTILE': 2,
    'THIRD_QUARTILE': 3,
    'FOURTH_QUARTILE': 4,
  };
  return map[level] || 0;
}

// Build a grid of cells from the contribution calendar.
// Each cell has: x, y (pixel position), level (0-4), date, count.
// Layout matches GitHub's contribution graph: 52 weeks × 7 days.
function buildGrid(calendar, cellSize = 13, gap = 2) {
  const cells = [];
  const weeks = calendar.weeks;

  for (let w = 0; w < weeks.length; w++) {
    const days = weeks[w].contributionDays;
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      cells.push({
        x: w * (cellSize + gap) + cellSize / 2,
        y: d * (cellSize + gap) + cellSize / 2,
        level: levelToNumber(day.contributionLevel),
        count: day.contributionCount,
        date: day.date,
        week: w,
        day: d,
        size: cellSize,
      });
    }
  }

  const gridWidth = weeks.length * (cellSize + gap);
  const gridHeight = 7 * (cellSize + gap);

  return { cells, gridWidth, gridHeight };
}

// Generate fake contribution data for testing without a GitHub token
function fakeContributions() {
  const weeks = [];
  for (let w = 0; w < 52; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const rand = Math.random();
      let level = 'NONE';
      if (rand > 0.4) level = 'FIRST_QUARTILE';
      if (rand > 0.6) level = 'SECOND_QUARTILE';
      if (rand > 0.8) level = 'THIRD_QUARTILE';
      if (rand > 0.92) level = 'FOURTH_QUARTILE';
      days.push({
        contributionCount: Math.floor(rand * 15),
        date: '2025-01-01',
        contributionLevel: level,
      });
    }
    weeks.push({ contributionDays: days });
  }
  return { totalContributions: 1234, weeks };
}

module.exports = { fetchContributions, buildGrid, fakeContributions };
