#!/usr/bin/env node
// =============================================================================
// noid-contrib — Neural boid contribution graph animation
// =============================================================================
// Generates an animated SVG of boids flocking through your GitHub
// contribution graph. Designed to run as a GitHub Action or locally.
//
// Usage:
//   node src/main.js --username canaanmckenzie --token ghp_xxx
//   node src/main.js --fake   # use fake data for testing
//
// Environment variables (for GitHub Actions):
//   GITHUB_USER  — GitHub username
//   GITHUB_TOKEN — GitHub token with read:user scope
// =============================================================================

const fs = require('fs');
const path = require('path');
const { fetchContributions, buildGrid, fakeContributions } = require('./contributions');
const { renderSVG } = require('./render');

async function main() {
  const args = process.argv.slice(2);
  const argMap = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      argMap[args[i].slice(2)] = args[i + 1] || true;
      i++;
    }
  }

  const username = argMap.username || process.env.GITHUB_USER || 'canaanmckenzie';
  const token = argMap.token || process.env.GITHUB_TOKEN;
  const outDir = argMap.output || process.env.OUTPUT_DIR || 'dist';
  const useFake = argMap.fake !== undefined;
  const boidCount = parseInt(argMap.boids || '32', 10);
  const frames = parseInt(argMap.frames || '600', 10);

  console.log(`noid-contrib: generating for ${username}`);
  console.log(`  boids: ${boidCount}, frames: ${frames}`);

  // Fetch or fake contribution data
  let calendar;
  if (useFake || !token) {
    if (!useFake && !token) {
      console.log('  no token provided, using fake data');
    }
    calendar = fakeContributions();
  } else {
    console.log('  fetching contributions from GitHub...');
    calendar = await fetchContributions(username, token);
    console.log(`  total contributions: ${calendar.totalContributions}`);
  }

  // Build the grid
  const { cells, gridWidth, gridHeight } = buildGrid(calendar);
  console.log(`  grid: ${Math.ceil(gridWidth)}x${Math.ceil(gridHeight)}px, ${cells.length} cells`);

  // Ensure output directory exists
  fs.mkdirSync(outDir, { recursive: true });

  // Render light theme
  console.log('  rendering light theme...');
  const lightSVG = renderSVG(cells, gridWidth, gridHeight, 'light', { boidCount, frames });
  const lightPath = path.join(outDir, 'noid-contrib.svg');
  fs.writeFileSync(lightPath, lightSVG);
  console.log(`  wrote ${lightPath} (${(lightSVG.length / 1024).toFixed(0)}KB)`);

  // Render dark theme
  console.log('  rendering dark theme...');
  const darkSVG = renderSVG(cells, gridWidth, gridHeight, 'dark', { boidCount, frames });
  const darkPath = path.join(outDir, 'noid-contrib-dark.svg');
  fs.writeFileSync(darkPath, darkSVG);
  console.log(`  wrote ${darkPath} (${(darkSVG.length / 1024).toFixed(0)}KB)`);

  console.log('done!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
