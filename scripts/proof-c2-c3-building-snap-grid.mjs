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
const proofSlug = process.env.PROOF_SLUG || 'c2-c3-building-snap-grid';
const proofClaim = process.env.PROOF_CLAIM || 'C2/C3 building relocation and code-owned house-kit snap socket contract';
const outDir = path.join(root, 'output', 'playwright', proofSlug);
const requestedPort = Number(process.env.PROOF_PORT || 0);
const profileFilter = (process.env.PROOF_PROFILE || '').trim().toLowerCase();
const requiredHouseKitModels = ['door-kit.glb', 'window-frame.glb', 'roof-bundle.glb'];
const snapPreviewExpectations = {
  doorKit: {
    socketRole: 'wall-opening',
    socketCollider: 'thin-wall',
    silhouette: 'door-opening-preview',
    meshNames: ['snapPreviewDoorLeftJamb', 'snapPreviewDoorRightJamb', 'snapPreviewDoorLintel'],
    roles: ['snap preview door opening', 'snap preview door lintel'],
  },
  windowFrame: {
    socketRole: 'wall-light',
    socketCollider: 'thin-wall',
    silhouette: 'window-light-preview',
    meshNames: ['snapPreviewWindowGlassPane', 'snapPreviewWindowSill', 'snapPreviewWindowCenterMullion'],
    roles: ['snap preview window light', 'snap preview window sill', 'snap preview window centered opening'],
  },
  roofBundle: {
    socketRole: 'roof-cap',
    socketCollider: 'roof-shell',
    silhouette: 'roof-cap-preview',
    meshNames: ['snapPreviewRoofRidgeBeam', 'snapPreviewRoofLeftEave', 'snapPreviewRoofCapPlane'],
    roles: ['snap preview roof cap', 'snap preview roof eave', 'snap preview roof cap coverage'],
  },
};

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
      && !!world?.debugAimAtTile
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

function assertSnapPreview(state, expected, label) {
  const preview = state?.preview;
  if (!preview || typeof preview !== 'object') throw new Error(`${label}: missing snap preview ${JSON.stringify(state)}`);
  for (const [key, value] of Object.entries(expected)) {
    if (value instanceof RegExp) {
      if (!value.test(String(preview[key] ?? ''))) throw new Error(`${label}: preview ${key} mismatch ${JSON.stringify(preview)} expected ${value}`);
    } else if (preview[key] !== value) {
      throw new Error(`${label}: preview ${key} mismatch ${JSON.stringify(preview)} expected ${JSON.stringify(value)}`);
    }
  }
  if (state.textPreview && JSON.stringify(preview) !== JSON.stringify(state.textPreview)) {
    throw new Error(`${label}: text preview diagnostics drifted ${JSON.stringify({ preview, textPreview: state.textPreview })}`);
  }
  if (!state.renderer?.active || state.renderer.ok !== preview.ok || state.renderer.item !== preview.item || state.renderer.tile !== preview.tile) {
    throw new Error(`${label}: renderer preview drifted ${JSON.stringify({ preview, renderer: state.renderer })}`);
  }
  if ((state.renderer.meshes ?? 0) < 3 || (state.renderer.readabilityRoles ?? 0) < 3) {
    throw new Error(`${label}: renderer preview not readable enough ${JSON.stringify(state.renderer)}`);
  }
  const socketRole = preview.socket?.role ?? preview.socketRole ?? null;
  if (socketRole && state.renderer.socketRole !== socketRole) {
    throw new Error(`${label}: renderer socket role drifted ${JSON.stringify({ preview, renderer: state.renderer })}`);
  }
  if (preview.socket?.collider && state.renderer.socketCollider !== preview.socket.collider) {
    throw new Error(`${label}: renderer socket collider drifted ${JSON.stringify({ preview, renderer: state.renderer })}`);
  }
  const guide = snapPreviewExpectations[preview.item];
  if (guide) {
    if (state.renderer.socketRole !== guide.socketRole || state.renderer.socketCollider !== guide.socketCollider || state.renderer.silhouette !== guide.silhouette) {
      throw new Error(`${label}: renderer socket silhouette mismatch ${JSON.stringify({ expected: guide, renderer: state.renderer })}`);
    }
    const meshNames = new Set(state.renderer.meshNames ?? []);
    const visibleRoles = new Set(state.renderer.visibleReadabilityRoles ?? []);
    for (const meshName of guide.meshNames) {
      if (!meshNames.has(meshName)) throw new Error(`${label}: missing snap-preview guide mesh ${meshName} ${JSON.stringify(state.renderer)}`);
    }
    for (const role of guide.roles) {
      if (!visibleRoles.has(role)) throw new Error(`${label}: missing visible snap-preview role ${role} ${JSON.stringify(state.renderer)}`);
    }
    if (preview.ok && visibleRoles.has('blocked snap crossbar')) {
      throw new Error(`${label}: valid preview counted hidden blocked crossbars as visible roles ${JSON.stringify(state.renderer)}`);
    }
  }
}

function controlSource(profile) {
  if (profile.gamepad) return 'gamepad';
  if (profile.touch) return 'touch';
  return 'keyboard';
}

async function triggerRelocationControl(page, profile) {
  if (profile.touch) {
    await page.waitForSelector('#btn-move.show', { state: 'visible', timeout: 5000 });
    await page.tap('#btn-move');
  } else if (profile.gamepad) {
    await page.evaluate(() => window.__world.injectGamepad({ relocate: true }, 3));
  } else {
    await page.keyboard.press('KeyV');
  }
  await page.waitForTimeout(220);
}

async function triggerRelocationDrop(page, profile, tile) {
  await page.evaluate((targetTile) => window.__world.debugAimAtTile(targetTile), tile);
  await page.waitForTimeout(80);
  if (profile.touch) {
    await page.waitForSelector('#btn-move.show', { state: 'visible', timeout: 5000 });
    await page.tap('#btn-move');
    await page.waitForTimeout(220);
  } else if (profile.gamepad) {
    await page.evaluate(() => window.__world.injectGamepad({ place: true, placePressed: true }, 3));
    await page.waitForTimeout(220);
  } else {
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(220);
  }
}

async function readSnapPreview(page, tile, screenshotName) {
  await page.evaluate((targetTile) => window.__world.debugAimAtTile(targetTile), tile);
  await page.waitForTimeout(220);
  const state = await page.evaluate(() => {
    const structures = window.__world.structures();
    const text = JSON.parse(window.render_game_to_text()).structures;
    return {
      preview: structures.snapPreview,
      placement: structures.placement,
      relocation: structures.relocation,
      renderer: structures.renderer?.snapPreview,
      textPreview: text.snapPreview,
      textRelocation: text.relocation,
    };
  });
  const shot = screenshotName ? await screenshot(page, screenshotName) : null;
  return { ...state, screenshot: shot };
}

async function framePlacementPreviewTile(page, tile) {
  await page.evaluate((targetTile) => {
    const world = window.__world;
    const occupied = new Set(world.structures().items.map((entry) => entry.tile));
    let stand = world.player.tile;
    let bestStandScore = Infinity;
    const targetLayer = world.columns.groundLayerBelow(targetTile, world.layers.bounds[0]);
    const seen = new Set([targetTile]);
    const queue = [{ tile: targetTile, ring: 0 }];
    for (let i = 0; i < queue.length; i += 1) {
      const entry = queue[i];
      if (entry.ring >= 3) continue;
      const degree = world.geo.degreeOf(entry.tile);
      for (let edge = 0; edge < degree; edge += 1) {
        const neighbor = world.geo.neighbor(entry.tile, edge);
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        const ring = entry.ring + 1;
        queue.push({ tile: neighbor, ring });
        if (ring < 2 || occupied.has(neighbor)) continue;
        const neighborLayer = world.columns.groundLayerBelow(neighbor, world.layers.bounds[0]);
        const score = Math.abs(neighborLayer - targetLayer) + (ring === 2 ? 0 : 0.35);
        if (score < bestStandScore) {
          bestStandScore = score;
          stand = neighbor;
        }
      }
    }
    world.player.spawnAt(stand);
    const c = world.geo.centers;
    const sx = c[stand * 3], sy = c[stand * 3 + 1], sz = c[stand * 3 + 2];
    const tx = c[targetTile * 3], ty = c[targetTile * 3 + 1], tz = c[targetTile * 3 + 2];
    const upLen = Math.hypot(sx, sy, sz) || 1;
    const ux = sx / upLen, uy = sy / upLen, uz = sz / upLen;
    let dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const dot = dx * ux + dy * uy + dz * uz;
    dx -= ux * dot;
    dy -= uy * dot;
    dz -= uz * dot;
    const len = Math.hypot(dx, dy, dz) || 1;
    world.player.fwdX = dx / len;
    world.player.fwdY = dy / len;
    world.player.fwdZ = dz / len;
    world.player.pitch = -0.24;
    world.player.reorthonormalize?.();
    world.setZoom?.(0);
    world.debugAimAtTile(targetTile);
  }, tile);
  await page.waitForTimeout(420);
}

async function runHouseKitPlacementPreviews(page, name) {
  const candidates = await page.evaluate(() => {
    const world = window.__world;
    for (const item of ['doorKit', 'windowFrame', 'roofBundle']) world.giveItem(item, 3);
    const occupied = new Set(world.structures().items.map((entry) => entry.tile));
    occupied.add(world.player.tile);
    const nativeBlocked = new Set();
    for (const site of world.nativeLife?.().sites ?? []) {
      if (!Number.isFinite(site?.tile)) continue;
      nativeBlocked.add(site.tile);
      const degree = world.geo.degreeOf(site.tile);
      for (let edge = 0; edge < degree; edge += 1) nativeBlocked.add(world.geo.neighbor(site.tile, edge));
    }
    const groundLayer = (tile) => world.columns.groundLayerBelow(tile, world.layers.bounds[0]);
    const flatScore = (tile) => {
      const top = groundLayer(tile);
      const degree = world.geo.degreeOf(tile);
      let maxDelta = 0;
      for (let edge = 0; edge < degree; edge += 1) {
        const neighbor = world.geo.neighbor(tile, edge);
        maxDelta = Math.max(maxDelta, Math.abs(groundLayer(neighbor) - top));
      }
      return maxDelta;
    };
    const tiles = world.nearbyTiles(14)
      .filter((tile) => tile !== world.player.tile && !occupied.has(tile) && !nativeBlocked.has(tile))
      .map((tile) => ({ tile, flat: flatScore(tile) }))
      .sort((a, b) => a.flat - b.flat);
    return tiles.filter((entry) => entry.flat <= 1).map((entry) => entry.tile).slice(0, 32);
  });
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`${name}: no placement-preview candidate tiles`);
  }
  const inUsefulFrame = (point) => point
    && point.x >= 120
    && point.x <= 1320
    && point.y >= 90
    && point.y <= 690;
  const previews = {};
  for (const item of Object.keys(snapPreviewExpectations)) {
    await page.evaluate((selectedItem) => window.__world.selectStructure(selectedItem), item);
    await page.waitForTimeout(160);
    let accepted = null;
    for (const tile of candidates) {
      const candidate = await readSnapPreview(page, tile, null);
      if (candidate.preview?.active && candidate.preview.item === item && candidate.preview.ok && candidate.preview.tile === tile) {
        assertSnapPreview(candidate, {
          active: true,
          mode: 'place',
          ok: true,
          item,
          tile,
          blocker: null,
        }, `${name}: ${item} placement-preview socket guide`);
        await framePlacementPreviewTile(page, tile);
        const framed = await readSnapPreview(page, tile, null);
        const screenPoint = await page.evaluate((targetTile) => window.__world.screenPointForTile(targetTile), tile);
        if (!inUsefulFrame(screenPoint)) continue;
        assertSnapPreview(framed, {
          active: true,
          mode: 'place',
          ok: true,
          item,
          tile,
          blocker: null,
        }, `${name}: ${item} framed placement-preview socket guide`);
        accepted = {
          ...framed,
          screenPoint,
          screenshot: await screenshot(page, `${name}-${item}-placement-preview`),
        };
        break;
      }
    }
    if (!accepted) throw new Error(`${name}: failed to find a valid ${item} placement preview ${JSON.stringify(candidates)}`);
    previews[item] = {
      preview: accepted.preview,
      renderer: accepted.renderer,
      screenPoint: accepted.screenPoint,
      screenshot: accepted.screenshot,
    };
  }
  await page.evaluate(() => window.__world.setZoom?.(0.22));
  await page.waitForTimeout(180);
  return previews;
}

async function setupPlayerRelocationFixture(page) {
  return page.evaluate(() => {
    const world = window.__world;
    world.giveItem('windowFrame', 4);
    const existing = () => world.structures().items;
    const occupiedTiles = () => new Set(existing().map((entry) => entry.tile));
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
    const used = occupiedTiles();
    used.add(world.player.tile);
    const candidates = world.nearbyTiles(7)
      .filter((tile) => tile !== world.player.tile && !used.has(tile))
      .filter((tile) => rawNeighborsOf(tile, 1).every((near) => !used.has(near)));
    if (candidates.length < 2) throw new Error('not enough isolated relocation candidates');
    const sourceTile = candidates[0];
    const targetTile = candidates.find((tile) => tile !== sourceTile && !rawNeighborsOf(sourceTile, 1).includes(tile));
    if (targetTile === undefined) throw new Error('missing relocation target tile');
    const beforeIds = new Set(existing().map((entry) => entry.id));
    if (!world.placeStructure('windowFrame', sourceTile)) throw new Error(`failed to place relocation fixture at ${sourceTile}`);
    const prop = existing().find((entry) => !beforeIds.has(entry.id));
    if (!prop) throw new Error('missing placed relocation fixture');
    const occupied = existing().find((entry) => entry.id !== prop.id);
    if (!occupied) throw new Error('missing occupied blocker target');
    const standTile = rawNeighborsOf(sourceTile, 1).find((tile) => tile !== sourceTile && !occupiedTiles().has(tile)) ?? sourceTile;
    world.player.spawnAt(standTile);
    world.debugAimAtTile(prop.tile);
    return { prop, sourceTile, targetTile, occupiedTile: occupied.tile, standTile };
  });
}

async function standNearStructure(page, id) {
  return page.evaluate((structureId) => {
    const world = window.__world;
    const structures = world.structures().items;
    const prop = structures.find((entry) => entry.id === structureId);
    if (!prop) throw new Error(`structure ${structureId} missing for relocation stance`);
    const occupied = new Set(structures.map((entry) => entry.tile));
    const degree = world.geo.degreeOf(prop.tile);
    let stand = prop.tile;
    for (let edge = 0; edge < degree; edge += 1) {
      const neighbor = world.geo.neighbor(prop.tile, edge);
      if (!occupied.has(neighbor)) {
        stand = neighbor;
        break;
      }
    }
    world.player.spawnAt(stand);
    world.debugAimAtTile(prop.tile);
    return { standTile: stand, prop };
  }, id);
}

async function runPlayerRelocationControls(page, profile, name) {
  const source = controlSource(profile);
  const fixture = await setupPlayerRelocationFixture(page);
  await page.waitForTimeout(220);

  await triggerRelocationControl(page, profile);
  const grabbed = await page.evaluate(() => ({
    relocation: window.__world.structures().relocation,
    command: window.__world.buildCommands().last,
  }));
  assertCommand(grabbed.command, {
    source,
    verb: 'relocate',
    target: 'structure',
    ok: true,
    item: 'windowFrame',
    id: fixture.prop.id,
    action: 'windowFrame:relocate:grabbed',
  }, `${name}: ${source} relocation grab`);
  if (!grabbed.relocation.active || grabbed.relocation.cursor?.id !== fixture.prop.id) {
    throw new Error(`${name}: relocation cursor not active after ${source} grab ${JSON.stringify(grabbed)}`);
  }

  const validPreview = await readSnapPreview(page, fixture.targetTile, `${name}-valid-snap-preview`);
  assertSnapPreview(validPreview, {
    active: true,
    mode: 'relocate',
    ok: true,
    item: 'windowFrame',
    id: fixture.prop.id,
    tile: fixture.targetTile,
    blocker: null,
  }, `${name}: ${source} valid relocation preview`);

  await triggerRelocationDrop(page, profile, fixture.targetTile);
  const movedOut = await page.evaluate((id) => {
    const structures = window.__world.structures();
    return {
      structure: structures.items.find((entry) => entry.id === id),
      relocation: structures.relocation,
      command: window.__world.buildCommands().last,
      text: JSON.parse(window.render_game_to_text()).structures.relocation,
    };
  }, fixture.prop.id);
  assertCommand(movedOut.command, {
    source,
    verb: 'relocate',
    target: 'structure',
    ok: true,
    item: 'windowFrame',
    id: fixture.prop.id,
    fromTile: fixture.sourceTile,
    toTile: fixture.targetTile,
  }, `${name}: ${source} relocation drop`);
  if (movedOut.structure?.tile !== fixture.targetTile) throw new Error(`${name}: ${source} move did not reach target ${JSON.stringify(movedOut)}`);
  if (movedOut.relocation.active || movedOut.text.active) throw new Error(`${name}: relocation cursor stayed active after successful drop ${JSON.stringify(movedOut)}`);

  await standNearStructure(page, fixture.prop.id);
  await triggerRelocationControl(page, profile);
  const playerTile = await page.evaluate(() => window.__world.player.tile);
  const playerBlockedPreview = await readSnapPreview(page, playerTile, null);
  assertSnapPreview(playerBlockedPreview, {
    active: true,
    mode: 'relocate',
    ok: false,
    item: 'windowFrame',
    id: fixture.prop.id,
    tile: playerTile,
    blocker: 'player on snap target',
    message: 'step aside before moving here',
  }, `${name}: ${source} player-tile relocation preview`);

  const occupiedBlockedPreview = await readSnapPreview(page, fixture.occupiedTile, `${name}-blocked-snap-preview`);
  assertSnapPreview(occupiedBlockedPreview, {
    active: true,
    mode: 'relocate',
    ok: false,
    item: 'windowFrame',
    id: fixture.prop.id,
    tile: fixture.occupiedTile,
    blocker: 'occupied snap target',
    message: 'that hex already has a prop',
  }, `${name}: ${source} occupied relocation preview`);

  await triggerRelocationDrop(page, profile, fixture.occupiedTile);
  const blocked = await page.evaluate((id) => {
    const structures = window.__world.structures();
    return {
      structure: structures.items.find((entry) => entry.id === id),
      relocation: structures.relocation,
      command: window.__world.buildCommands().last,
    };
  }, fixture.prop.id);
  assertCommand(blocked.command, {
    source,
    verb: 'relocate',
    target: 'structure',
    ok: false,
    item: 'windowFrame',
    id: fixture.prop.id,
    toTile: fixture.occupiedTile,
    message: 'that hex already has a prop',
  }, `${name}: ${source} occupied relocation block`);
  if (!blocked.relocation.active || blocked.structure?.tile !== fixture.targetTile) {
    throw new Error(`${name}: blocked ${source} move should keep cursor and current tile ${JSON.stringify(blocked)}`);
  }
  if (occupiedBlockedPreview.preview.message !== blocked.command.message || occupiedBlockedPreview.preview.blocker !== blocked.command.blockers?.[0]) {
    throw new Error(`${name}: occupied preview did not match blocked command ${JSON.stringify({ preview: occupiedBlockedPreview.preview, command: blocked.command })}`);
  }

  await triggerRelocationDrop(page, profile, fixture.sourceTile);
  const movedBack = await page.evaluate((id) => {
    const structures = window.__world.structures();
    return {
      structure: structures.items.find((entry) => entry.id === id),
      relocation: structures.relocation,
      command: window.__world.buildCommands().last,
      text: JSON.parse(window.render_game_to_text()).structures,
    };
  }, fixture.prop.id);
  assertCommand(movedBack.command, {
    source,
    verb: 'relocate',
    target: 'structure',
    ok: true,
    item: 'windowFrame',
    id: fixture.prop.id,
    fromTile: fixture.targetTile,
    toTile: fixture.sourceTile,
  }, `${name}: ${source} relocation snap-back`);
  if (movedBack.structure?.tile !== fixture.sourceTile || movedBack.relocation.active) {
    throw new Error(`${name}: ${source} snap-back did not close cursor ${JSON.stringify(movedBack)}`);
  }
  if (!movedBack.text.commands?.last || movedBack.text.relocation.active) {
    throw new Error(`${name}: render_game_to_text relocation diagnostics missing or stale ${JSON.stringify(movedBack.text)}`);
  }

  return {
    source,
    fixture,
    grabbed: grabbed.command,
    validPreview: {
      preview: validPreview.preview,
      renderer: validPreview.renderer,
      screenshot: validPreview.screenshot,
    },
    movedOut: movedOut.command,
    playerBlockedPreview: {
      preview: playerBlockedPreview.preview,
      renderer: playerBlockedPreview.renderer,
    },
    occupiedBlockedPreview: {
      preview: occupiedBlockedPreview.preview,
      renderer: occupiedBlockedPreview.renderer,
      screenshot: occupiedBlockedPreview.screenshot,
    },
    blocked: blocked.command,
    movedBack: movedBack.command,
    finalTile: movedBack.structure.tile,
    previewClaim: 'snap and blocked preview diagnostics were read before drop; deterministic target aim uses debug proof hooks',
  };
}

async function runSnapGridContract(page, name) {
  await waitForWorld(page);
  await page.evaluate(() => window.__world.setZoom?.(0.22));

  const result = await page.evaluate(async () => {
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
    const assertHomeComfort = (label, renderer) => {
      const comfort = renderer?.homeComfort ?? {};
      if ((renderer?.homeComfortSignals ?? 0) < 4 || (renderer?.shelterReadabilityRoles ?? 0) < 3) {
        throw new Error(`${label} missing comfort renderer signals ${JSON.stringify(renderer)}`);
      }
      if ((comfort.visibleWarmthMeshes ?? 0) < 4) throw new Error(`${label} expected visible warmth meshes ${JSON.stringify(comfort)}`);
      if ((comfort.visibleLightMeshes ?? 0) < 1) throw new Error(`${label} expected visible light/home glow meshes ${JSON.stringify(comfort)}`);
      if ((comfort.visibleHomeMarkers ?? 0) < 1) throw new Error(`${label} expected visible home marker ${JSON.stringify(comfort)}`);
      if ((comfort.visibleSmokePuffs ?? 0) < 6) throw new Error(`${label} expected lit campfire smoke puffs ${JSON.stringify(comfort)}`);
      if ((comfort.litCampfires ?? 0) < 1) throw new Error(`${label} expected a lit campfire readback ${JSON.stringify(comfort)}`);
    };
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
    const windowFrame = place('windowFrame', support);
    if (!world.useStructure(campfire.id)) throw new Error('failed to light campfire');
    if (!world.useStructure(bedroll.id)) throw new Error('failed to claim home bedroll');
    await window.advanceTime(180);
    const ready = world.structures();
    if (!ready.home?.shelter?.functional) throw new Error(`setup did not create a functional shelter ${JSON.stringify(ready.home?.shelter)}`);
    if (!ready.home.shelter.enclosure?.enclosed || !ready.home.shelter.enclosure?.serviceReady) {
      throw new Error(`functional shelter did not expose enclosure/service readiness ${JSON.stringify(ready.home.shelter.enclosure)}`);
    }
    if (!['working', 'lived-in'].includes(ready.home.shelter.enclosure.comfortTier)) {
      throw new Error(`functional shelter comfort tier was weak ${JSON.stringify(ready.home.shelter.enclosure)}`);
    }
    assertHomeComfort('functional shelter', ready.renderer);

    const originalRoof = structures().find((entry) => entry.id === roofA.id);
    const outsideTile = support.find((tile) => !used.has(tile) && !ready.home.shelter.tiles.includes(tile));
    if (outsideTile === undefined) throw new Error('could not find out-of-shelter snap tile');
    const movedOutOk = world.relocateStructure(roofA.id, outsideTile);
    await window.advanceTime(180);
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
    await window.advanceTime(180);
    const movedBack = world.structures();
    const moveBackCommand = world.buildCommands().last;
    if (!movedBackOk || !movedBack.home.shelter.functional) {
      throw new Error(`shelter did not recover after snap-back ${JSON.stringify({ movedBackOk, shelter: movedBack.home.shelter })}`);
    }
    if (!movedBack.home.shelter.enclosure?.enclosed || !movedBack.home.shelter.enclosure?.serviceReady) {
      throw new Error(`shelter enclosure did not recover after snap-back ${JSON.stringify(movedBack.home.shelter.enclosure)}`);
    }
    assertHomeComfort('snap-back shelter', movedBack.renderer);

    const sockets = movedBack.sockets.houseKit;
    const text = JSON.parse(window.render_game_to_text());
    return {
      setup: { bedroll, roofA, roofB, door, windowFrame, campfire, workbench, chest },
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

  const skinHandle = await page.waitForFunction(() => {
    const text = JSON.parse(window.render_game_to_text());
    const renderer = text.structures?.renderer;
    const bySlug = renderer?.kilnSkinsBySlug ?? {};
    const fits = renderer?.kilnSkinFits ?? {};
    const expectedFit = {
      'door-kit': [1, 1.9, 0.22],
      'window-frame': [0.92, 1.45, 0.18],
      'roof-bundle': [1.12, 0.62, 1.12],
    };
    const withinFit = (slug) => {
      const fit = fits[slug];
      const target = expectedFit[slug];
      if (!fit || !Array.isArray(fit.fittedBboxSize) || fit.fittedBboxSize.length !== 3) return false;
      return fit.fittedBboxSize.every((value, index) => Math.abs(value - target[index]) <= 0.08);
    };
    const loaded =
      (bySlug['door-kit']?.loaded ?? 0) >= 1
      && (bySlug['window-frame']?.loaded ?? 0) >= 1
      && (bySlug['roof-bundle']?.loaded ?? 0) >= 1;
    const fallbacks =
      (bySlug['door-kit']?.fallback ?? 0)
      + (bySlug['window-frame']?.fallback ?? 0)
      + (bySlug['roof-bundle']?.fallback ?? 0);
    const fitReady = ['door-kit', 'window-frame', 'roof-bundle'].every((slug) => {
      const fit = fits[slug];
      return fit
        && fit.loadBearing === 'code-socket'
        && fit.glbPolicy === 'decorative-skin-after-normalization'
        && Array.isArray(fit.sourceBboxSize)
        && fit.sourceBboxSize.length === 3
        && Array.isArray(fit.runtimeSourceBboxSize)
        && fit.runtimeSourceBboxSize.length === 3
        && Array.isArray(fit.fittedBboxSize)
        && fit.fittedBboxSize.length === 3
        && withinFit(slug);
    });
    return loaded && fallbacks === 0 && fitReady ? { renderer, bySlug, fits, kilnAssets: renderer?.kilnAssets } : false;
  }, null, { timeout: 15000 });
  const houseKitSkins = await skinHandle.jsonValue();
  const modelRequests = houseKitSkins.kilnAssets?.modelRequests ?? [];
  for (const model of requiredHouseKitModels) {
    if (!modelRequests.some((url) => url.includes(`/assets/kiln/models/${model}`))) {
      throw new Error(`${name}: Kiln runtime diagnostics did not request ${model} ${JSON.stringify(modelRequests)}`);
    }
  }
  if (modelRequests.some((url) => url.includes('/assets/kiln/generated/') || url.includes('/tools/kiln/generated/'))) {
    throw new Error(`${name}: Kiln runtime diagnostics requested raw generated assets ${JSON.stringify(modelRequests)}`);
  }

  const shot = await screenshot(page, `${name}-snap-grid`);
  return {
    name,
    setup: result.setup,
    movedOut: result.movedOut,
    occupied: result.occupied.command,
    player: result.player.command,
    movedBack: result.movedBack,
    sockets: result.sockets,
    renderer: houseKitSkins.renderer,
    houseKitSkins,
    screenshot: shot,
  };
}

function assertHouseKitAssetNetwork(name, requests, responses) {
  const generatedRequests = requests.filter((url) =>
    url.includes('/assets/kiln/generated/')
    || url.includes('/tools/kiln/generated/')
    || url.includes('X-Amz-Signature')
    || url.includes('sig=')
  );
  if (generatedRequests.length > 0) {
    throw new Error(`${name}: runtime requested raw/generated or signed Kiln URLs ${JSON.stringify(generatedRequests)}`);
  }
  const modelResponses = {};
  for (const model of requiredHouseKitModels) {
    modelResponses[model] = responses.filter((asset) => asset.url.includes(`/assets/kiln/models/${model}`));
    if (!modelResponses[model].some((asset) => asset.status >= 200 && asset.status < 300)) {
      throw new Error(`${name}: missing successful ${model} response ${JSON.stringify(modelResponses[model])}`);
    }
  }
  return {
    requests,
    responses,
    modelResponses,
    generatedRequests,
    acceptanceNote: 'door/window/roof GLBs loaded only from promoted models/ and fitted as decorative skins over code-owned sockets',
  };
}

async function runProfile(browser, url, profile) {
  const consoleErrors = [];
  const pageErrors = [];
  const kilnAssetRequests = [];
  const kilnAssetResponses = [];
  const page = await browser.newPage({
    viewport: profile.viewport,
    isMobile: !!profile.touch,
    hasTouch: !!profile.touch,
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('request', (request) => {
    const requestUrl = request.url();
    if (requestUrl.includes('/assets/kiln/')) kilnAssetRequests.push(requestUrl);
  });
  page.on('response', (response) => {
    const responseUrl = response.url();
    if (responseUrl.includes('/assets/kiln/')) kilnAssetResponses.push({ url: responseUrl, status: response.status() });
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const result = await runSnapGridContract(page, profile.name);
    const placementPreviews = !profile.touch && !profile.gamepad
      ? await runHouseKitPlacementPreviews(page, profile.name)
      : null;
    const playerRelocation = await runPlayerRelocationControls(page, profile, profile.name);
    const kilnAssets = assertHouseKitAssetNetwork(profile.name, kilnAssetRequests, kilnAssetResponses);
    if (consoleErrors.length || pageErrors.length) throw new Error(`${profile.name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
    return {
      ...result,
      placementPreviews,
      playerRelocation,
      kilnAssets,
      url,
      viewport: profile.viewport,
      touch: !!profile.touch,
      gamepad: !!profile.gamepad,
      inputClaim: `${playerRelocation.source} player-facing relocation path; deterministic proof target uses debug aim only`,
      previewClaim: placementPreviews
        ? `${playerRelocation.previewClaim}; keyboard placement previews prove door/window/roof socket guide silhouettes`
        : playerRelocation.previewClaim,
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
    { name: 'desktop-keyboard-relocate', url: desktopUrl, viewport: { width: 1440, height: 900 } },
    { name: 'laptop-keyboard-relocate', url: desktopUrl, viewport: { width: 1366, height: 720 } },
    { name: 'tablet-touch-relocate', url: touchUrl, viewport: { width: 820, height: 1180 }, touch: true },
    { name: 'phone-touch-relocate', url: touchUrl, viewport: { width: 390, height: 844 }, touch: true },
    { name: 'desktop-synthetic-gamepad-relocate', url: desktopUrl, viewport: { width: 1440, height: 900 }, gamepad: true },
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
      claim: proofClaim,
      inputClaim: 'C2/C3 relocation is proven through player-facing keyboard, touch, and injected synthetic gamepad paths across desktop/laptop/tablet/phone profiles; deterministic target aiming uses debug proof hooks; real hardware gamepad validation remains unclaimed',
      previewClaim: 'C2/C3 snap-preview and blocked-preview diagnostics/screenshots are proven before player-facing relocation drops across the same profile matrix; desktop/laptop keyboard placement previews prove door/window/roof guide silhouettes',
      realHardwareGamepad: false,
      desktopUrl,
      touchUrl,
      profiles: results,
    };
    const proofFile = path.join(outDir, 'proof.json');
    await fs.writeFile(proofFile, JSON.stringify(proof, null, 2));
    console.log(`${proofClaim} proof passed: ${proofFile}`);
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
