const path = require('path');
const { spawnSync } = require('child_process');

const targetPlatform = process.argv[2] || process.platform;
const supportedTargets = new Set(['darwin', 'win32']);

if (!supportedTargets.has(targetPlatform)) {
  console.error(`Unsupported package target: ${targetPlatform}.`);
  process.exit(1);
}

if (targetPlatform !== process.platform) {
  const requiredHost = targetPlatform === 'win32' ? 'Windows' : 'macOS';
  console.error(`Build the ${targetPlatform} installer on ${requiredHost} so the bundled Playwright Chromium binary matches the staff computer.`);
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const browserPath = path.join(projectRoot, 'build-resources', targetPlatform, 'ms-playwright');
const playwrightPackage = require.resolve('playwright/package.json');
const playwrightCli = path.join(path.dirname(playwrightPackage), 'cli.js');

console.log(`Installing bundled Chromium for ${targetPlatform} into ${browserPath}`);

const result = spawnSync(process.execPath, [playwrightCli, 'install', 'chromium'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browserPath,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
