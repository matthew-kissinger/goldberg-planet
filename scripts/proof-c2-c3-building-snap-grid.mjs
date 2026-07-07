import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to resolve Playwright. Install it or set NODE_PATH to a local node_modules containing playwright. ${message}`);
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'output', 'playwright', 'c2-c3-building-snap-grid');
const requestedPort = Number(process.env.PROOF_PORT || 0);
const profileFilter = (process.env.PROOF_PROFILE || '').trim().toLowerCase();

async function getFreePort() {
  if (requestedPort > 0) return requestedPort;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(targetUrl, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(targetUrl, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

function proofUrl(port, touch = false) {
  const base = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const url = new URL(base);
  url.searchParams.set('nosave', '1');
  url.searchParams.set('resetSave', '1');
  url.searchParams.set('mute', '1');
  if (touch) url.searchParams.set('touch', '1');
  return url.toString();
}

function startServer(port) {
  if (process.env.PROOF_URL) return null;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function stopServer(child) {
  if (!child) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('error', () => {
        child.kill();
        resolve();
      });
      killer.on('close', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function pngPixelProbe(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { ok: false, reason: 'not a png', samples: 0, unique: 0 };
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return { ok: false, reason: `unsupported png ${bitDepth}/${colorType}`, samples: 0, unique: 0 };
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  const colors = new Set();
  let samples = 0;
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      const value = raw[src++];
      row[x] = (value + (
        filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2)
        : paeth(left, up, upLeft)
      )) & 255;
    }
    if (y % Math.max(1, Math.floor(height / 24)) === 0) {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 32))) {
        const i = x * channels;
        const a = channels === 4 ? row[i + 3] : 255;
        if (a > 8) {
          colors.add(`${row[i]},${row[i + 1]},${row[i + 2]}`);
          samples++;
        }
      }
    }
    prev.set(row);
  }
  return { ok: colors.size >= 12 && samples > 40, samples, unique: colors.size, width, height };
}

async function screenshot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  const buffer = await page.screenshot({ path: file, fullPage: true });
  const probe = pngPixelProbe(buffer);
  if (!probe.ok) throw new Error(`${name}: screenshot pixel probe failed ${JSON.stringify(probe)}`);
  return { file, probe };
}

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    const world = window.__world;
    return !!world?.placeStructure
      && !!world?.relocateStructure
      && !!world?.useStructure
      && !!world?.buildCommands
      && Array.isArray(world?.structures?.().sockets?.houseKit);
  }, null, { timeout: 45000 });
  await page.waitForTimeout(350);
}

function assertCommand(record, expected, label) {
  if (!record || typeof record !== 'object') throw new Error(`${label}: missing build command record`);
  for (const [key, value] of Object.entries(expected)) {
    if (value instanceof RegExp) {
      if (!value.test(String(record[key] ?? ''))) throw new Error(`${label}: command ${key} mismatch ${JSON.stringify(record)} expected ${value}`);
    } else if (record[key] !== value) {
      throw new Error(`${label}: command ${key} mismatch ${JSON.stringify(record)} expected ${JSON.stringify(value)}`);
    }
  }
}

async function runSnapGridContract(page, name) {
  await waitForWorld(page);
  await page.evaluate(() => window.__world.setZoom?.(0.22));

  const result = await page.evaluate(() => {
    const world = window.__world;
    for (const item of ['doorKit', 'windowFrame', 'roofBundle', 'bedroll', 'campfire', 'workbench', 'chest']) world.giveItem(item, 4);
    const playerTile = world.player.tile;
    const used = new Set([playerTile]);
    const rawNeighborsOf = (tile, rings = 1) => {
      const seen = new Set([tile]);
      const queue = [{ tile, ring: 0 }];
      for (let i = 0; i < queue.length; i += 1) {
        const entry = queue[i];
        if (entry.ring >= rings) continue;
        const degree = world.geo.degreeOf(entry.tile);
        for (let k = 0; k < degree; k += 1) {
          const next = world.geo.neighbor(entry.tile, k);
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push({ tile: next, ring: entry.ring + 1 });
        }
      }
      return [...seen];
    };
    const neighborsOf = (tile, rings = 1) => rawNeighborsOf(tile, rings).filter((candidate) => candidate !== playerTile);
    const structures = () => world.structures().items;
    const place = (item, candidates) => {
      for (const tile of candidates) {
        if (used.has(tile)) continue;
        const before = new Set(structures().map((entry) => entry.id));
        if (!world.placeStructure(item, tile)) continue;
        const placed = structures().find((entry) => !before.has(entry.id));
        if (!placed) throw new Error(`placed ${item} but could not read it back`);
        used.add(tile);
        return placed;
      }
      throw new Error(`could not place ${item}`);
    };
    const bedrollCandidates = world.nearbyTiles(2).filter((tile) => tile !== playerTile);
    const bedrollTile = bedrollCandidates.find((tile) => world.geo.degreeOf(tile) >= 6 && !rawNeighborsOf(tile, 1).includes(playerTile))
      ?? bedrollCandidates.find((tile) => !rawNeighborsOf(tile, 1).includes(playerTile))
      ?? bedrollCandidates.find((tile) => world.geo.degreeOf(tile) >= 6)
      ?? bedrollCandidates[0];
    const bedroll = place('bedroll', [bedrollTile, ...bedrollCandidates].filter((tile, index, all) => tile !== undefined && all.indexOf(tile) === index));
    const local = neighborsOf(bedroll.tile, 1);
    const support = neighborsOf(bedroll.tile, 3);
    const roofA = place('roofBundle', local);
    const roofB = place('roofBundle', local);
    const door = place('doorKit', local);
    const campfire = place('campfire', local);
    const workbench = place('workbench', local);
    const chest = place('chest', local);
    if (!world.useStructure(campfire.id)) throw new Error('failed to light campfire');
    if (!world.useStructure(bedroll.id)) throw new Error('failed to claim home bedroll');
    const ready = world.structures();
    if (!ready.home?.shelter?.functional) throw new Error(`setup did not create a functional shelter ${JSON.stringify(ready.home?.shelter)}`);

    const originalRoof = structures().find((entry) => entry.id === roofA.id);
    const outsideTile = support.find((tile) => !used.has(tile) && !ready.home.shelter.tiles.includes(tile));
    if (outsideTile === undefined) throw new Error('could not find out-of-shelter snap tile');
    const movedOutOk = world.relocateStructure(roofA.id, outsideTile);
    const movedOut = world.structures();
    const moveOutCommand = world.buildCommands().last;
    const movedRoof = movedOut.items.find((entry) => entry.id === roofA.id);
    if (!movedOutOk || movedRoof.tile !== outsideTile) throw new Error(`roof did not relocate out ${JSON.stringify({ movedOutOk, movedRoof, outsideTile })}`);
    if (movedOut.home.shelter.functional || movedOut.home.shelter.roofPieces >= ready.home.shelter.roofPieces) {
      throw new Error(`shelter did not weaken after roof relocation ${JSON.stringify(movedOut.home.shelter)}`);
    }

    const occupiedOk = world.relocateStructure(roofA.id, door.tile);
    const occupiedCommand = world.buildCommands().last;
    const playerOk = world.relocateStructure(roofA.id, playerTile);
    const playerCommand = world.buildCommands().last;
    const movedBackOk = world.relocateStructure(roofA.id, originalRoof.tile);
    const movedBack = world.structures();
    const moveBackCommand = world.buildCommands().last;
    if (!movedBackOk || !movedBack.home.shelter.functional) {
      throw new Error(`shelter did not recover after snap-back ${JSON.stringify({ movedBackOk, shelter: movedBack.home.shelter })}`);
    }

    const sockets = movedBack.sockets.houseKit;
    const text = JSON.parse(window.render_game_to_text());
    return {
      setup: { bedroll, roofA, roofB, door, campfire, workbench, chest },
      readyHome: ready.home,
      movedOut: {
        ok: movedOutOk,
        roof: movedRoof,
        home: movedOut.home,
        command: moveOutCommand,
      },
      occupied: { ok: occupiedOk, command: occupiedCommand },
      player: { ok: playerOk, command: playerCommand },
      movedBack: {
        ok: movedBackOk,
        roof: movedBack.items.find((entry) => entry.id === roofA.id),
        home: movedBack.home,
        command: moveBackCommand,
      },
      sockets,
      textSockets: text.structures.sockets.houseKit,
      renderer: movedBack.renderer,
      commands: world.buildCommands().log,
    };
  });

  assertCommand(result.movedOut.command, {
    source: 'debug',
    verb: 'relocate',
    target: 'structure',
    ok: true,
    item: 'roofBundle',
    id: result.setup.roofA.id,
    fromTile: result.setup.roofA.tile,
    toTile: result.movedOut.roof.tile,
  }, `${name}: move-out command`);
  assertCommand(result.occupied.command, {
    source: 'debug',
    verb: 'relocate',
    target: 'structure',
    ok: false,
    item: 'roofBundle',
    id: result.setup.roofA.id,
    toTile: result.setup.door.tile,
    message: 'that hex already has a prop',
  }, `${name}: occupied relocation command`);
  assertCommand(result.player.command, {
    source: 'debug',
    verb: 'relocate',
    target: 'structure',
    ok: false,
    item: 'roofBundle',
    id: result.setup.roofA.id,
    message: 'step aside before moving here',
  }, `${name}: player relocation command`);
  assertCommand(result.movedBack.command, {
    source: 'debug',
    verb: 'relocate',
    target: 'structure',
    ok: true,
    item: 'roofBundle',
    id: result.setup.roofA.id,
    fromTile: result.movedOut.roof.tile,
    toTile: result.setup.roofA.tile,
  }, `${name}: snap-back command`);
  const socketItems = result.sockets.map((entry) => entry.item).sort().join(',');
  if (socketItems !== 'doorKit,roofBundle,windowFrame') throw new Error(`${name}: house-kit sockets missing ${JSON.stringify(result.sockets)}`);
  for (const spec of result.sockets) {
    if (!spec.modularKit || spec.loadBearing !== 'code-socket' || spec.glbPolicy !== 'decorative-skin-after-normalization') {
      throw new Error(`${name}: weak socket spec ${JSON.stringify(spec)}`);
    }
  }
  if (JSON.stringify(result.sockets) !== JSON.stringify(result.textSockets)) throw new Error(`${name}: text socket diagnostics drifted`);

  const shot = await screenshot(page, `${name}-snap-grid`);
  return {
    name,
    setup: result.setup,
    movedOut: result.movedOut,
    occupied: result.occupied.command,
    player: result.player.command,
    movedBack: result.movedBack,
    sockets: result.sockets,
    renderer: result.renderer,
    screenshot: shot,
  };
}

async function runProfile(browser, url, profile) {
  const consoleErrors = [];
  const pageErrors = [];
  const page = await browser.newPage({
    viewport: profile.viewport,
    isMobile: !!profile.touch,
    hasTouch: !!profile.touch,
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const result = await runSnapGridContract(page, profile.name);
    if (consoleErrors.length || pageErrors.length) throw new Error(`${profile.name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
    return {
      ...result,
      url,
      viewport: profile.viewport,
      touch: !!profile.touch,
      inputClaim: 'debug runtime hook; no touch relocation UI or hardware gamepad claim',
      consoleErrors,
      pageErrors,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const { chromium } = loadPlaywright();
  await fs.mkdir(outDir, { recursive: true });
  const port = await getFreePort();
  const server = startServer(port);
  const desktopUrl = proofUrl(port, false);
  const touchUrl = proofUrl(port, true);
  const profiles = [
    { name: 'desktop-debug', url: desktopUrl, viewport: { width: 1440, height: 900 } },
    { name: 'laptop-debug', url: desktopUrl, viewport: { width: 1366, height: 720 } },
    { name: 'tablet-touch-debug', url: touchUrl, viewport: { width: 820, height: 1180 }, touch: true },
    { name: 'phone-touch-debug', url: touchUrl, viewport: { width: 390, height: 844 }, touch: true },
    { name: 'desktop-gamepad-sized-debug', url: desktopUrl, viewport: { width: 1440, height: 900 } },
  ].filter((profile) => !profileFilter || profile.name.toLowerCase().includes(profileFilter));
  if (profiles.length === 0) throw new Error(`No proof profiles matched PROOF_PROFILE=${profileFilter}`);

  try {
    await waitForServer(desktopUrl);
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
      for (const profile of profiles) {
        results.push(await runProfile(browser, profile.url, profile));
      }
    } finally {
      await browser.close();
    }
    const proof = {
      ok: true,
      generatedAt: new Date().toISOString(),
      claim: 'C2/C3 building relocation and code-owned house-kit snap socket contract',
      inputClaim: 'relocation is proven through runtime/debug hooks across device-sized profiles; touch relocation UI and real hardware gamepad support remain unclaimed',
      desktopUrl,
      touchUrl,
      profiles: results,
    };
    const proofFile = path.join(outDir, 'proof.json');
    await fs.writeFile(proofFile, JSON.stringify(proof, null, 2));
    console.log(`C2/C3 building snap-grid proof passed: ${proofFile}`);
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
