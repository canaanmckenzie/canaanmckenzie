#!/usr/bin/env node
// =============================================================================
// noid-contrib — Neural boid contribution graph animation
// =============================================================================
// Generates animated SVGs of boids flocking through your GitHub
// contribution graph. Two styles: flat (classic) and origami (wing beats).
//
// Usage:
//   node src/main.js --username canaanmckenzie --token ghp_xxx
//   node src/main.js --fake                    # fake data for testing
//   node src/main.js --style origami --fake    # origami style
//
// Environment variables (for GitHub Actions):
//   GITHUB_USER  — GitHub username
//   GITHUB_TOKEN — GitHub token with read:user scope
//   STYLE        — "flat" (default) or "origami"
// =============================================================================

const fs = require('fs');
const path = require('path');
const { fetchContributions, buildGrid, fakeContributions } = require('./contributions');
const { renderSVG } = require('./render');
const { renderOrigamiSVG } = require('./render-origami');

async function main() {
  const args = process.argv.slice(2);
  const argMap = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      // A flag followed by another flag (or nothing) is boolean — don't let
      // `--fake --output dist` swallow `--output` as fake's value.
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
        argMap[args[i].slice(2)] = args[i + 1];
        i++;
      } else {
        argMap[args[i].slice(2)] = true;
      }
    }
  }

  const username = argMap.username || process.env.GITHUB_USER || 'canaanmckenzie';
  const token = argMap.token || process.env.GITHUB_TOKEN;
  const outDir = argMap.output || process.env.OUTPUT_DIR || 'dist';
  const useFake = argMap.fake !== undefined;
  const frames = parseInt(argMap.frames || '600', 10);
  const style = argMap.style || process.env.STYLE || 'flat';

  const render = style === 'origami' ? renderOrigamiSVG : renderSVG;

  console.log(`noid-contrib: generating for ${username} (style: ${style})`);

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
  const lightSVG = render(cells, gridWidth, gridHeight, 'light', { frames });
  const lightPath = path.join(outDir, 'noid-contrib.svg');
  fs.writeFileSync(lightPath, lightSVG);
  console.log(`  wrote ${lightPath} (${(lightSVG.length / 1024).toFixed(0)}KB)`);

  // Render dark theme
  console.log('  rendering dark theme...');
  const darkSVG = render(cells, gridWidth, gridHeight, 'dark', { frames });
  const darkPath = path.join(outDir, 'noid-contrib-dark.svg');
  fs.writeFileSync(darkPath, darkSVG);
  console.log(`  wrote ${darkPath} (${(darkSVG.length / 1024).toFixed(0)}KB)`);

  console.log('done!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
