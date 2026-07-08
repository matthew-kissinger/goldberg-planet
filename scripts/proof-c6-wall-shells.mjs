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
const outDir = path.join(root, 'output', 'playwright', 'c6-wall-shells');
const requestedPort = Number(process.env.PROOF_PORT || 0);

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

function proofUrl(port) {
  const base = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const url = new URL(base);
  url.searchParams.set('nosave', '1');
  url.searchParams.set('resetSave', '1');
  url.searchParams.set('creative', '1');
  url.searchParams.set('mute', '1');
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
      colorType = data[9];
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || !channels) return { ok: false, reason: `unsupported png color ${colorType}`, samples: 0, unique: 0 };
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let rawOffset = 0;
  const colors = new Set();
  const stepX = Math.max(1, Math.floor(width / 16));
  const stepY = Math.max(1, Math.floor(height / 12));
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      const value = raw[rawOffset++];
      current[x] = filter === 0 ? value
        : filter === 1 ? (value + left) & 255
        : filter === 2 ? (value + up) & 255
        : filter === 3 ? (value + Math.floor((left + up) / 2)) & 255
        : (value + paeth(left, up, upLeft)) & 255;
    }
    if (y % stepY === 0) {
      for (let x = 0; x < width; x += stepX) {
        const i = x * channels;
        colors.add(`${current[i]},${current[i + 1]},${current[i + 2]}`);
      }
    }
    previous.set(current);
  }
  return { ok: colors.size > 20, reason: colors.size > 20 ? 'nonblank' : 'low color variance', samples: colors.size, unique: colors.size };
}

async function assertSnapPreview(page, item, expected) {
  const target = await page.evaluate((targetItem) => {
    const world = window.__world;
    world.giveItem(targetItem, 1);
    world.selectStructure(targetItem);
    const occupied = new Set(world.structures().items.map((entry) => entry.tile));
    const target = world.nearbyTiles(2).find((tile) => tile !== world.player.tile && !occupied.has(tile));
    if (target === undefined) throw new Error(`no snap target for ${targetItem}`);
    world.debugAimAtTile(target);
    return target;
  }, item);
  await page.waitForFunction((args) => {
    const stats = window.__world?.structures?.().renderer?.snapPreview;
    return stats?.active === true
      && stats.ok === true
      && stats.blocker === null
      && stats.mode === 'place'
      && stats.item === args.item
      && stats.tile === args.target
      && stats.socketRole === args.socketRole
      && stats.socketCollider === args.socketCollider
      && stats.silhouette === args.silhouette
      && args.meshNames.every((name) => stats.meshNames.includes(name))
      && args.roles.every((role) => stats.visibleReadabilityRoles.includes(role));
  }, { item, target, ...expected }, { timeout: 10000 });
  const preview = await page.evaluate(() => window.__world.structures().renderer.snapPreview);
  if (!preview?.ok || preview.blocker !== null || preview.mode !== 'place' || preview.tile !== target) {
    throw new Error(`snap preview was not a valid placement: ${JSON.stringify({ item, target, preview })}`);
  }
  return preview;
}

async function main() {
  const { chromium } = loadPlaywright();
  await fs.mkdir(outDir, { recursive: true });
  const port = await getFreePort();
  const server = startServer(port);
  const target = proofUrl(port);
  let browser;
  try {
    await waitForServer(target);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const world = window.__world;
      return !!world?.placeStructure
        && !!world?.relocateStructure
        && !!world?.useStructure
        && !!world?.structures
        && !!world?.nearbyTiles
        && !!world?.debugAimAtTile
        && typeof window.render_game_to_text === 'function';
    }, null, { timeout: 45000 });
    await page.evaluate(() => window.__world.setZoom?.(0.18));

    const previews = {
      floorFoundation: await assertSnapPreview(page, 'floorFoundation', {
        socketRole: 'foundation',
        socketCollider: 'hex-cell',
        silhouette: 'foundation-pad-preview',
        meshNames: ['snapPreviewFoundationPad', 'snapPreviewFoundationLevelBand'],
        roles: ['snap preview floor foundation', 'snap preview leveled floor socket'],
      }),
      wallPanel: await assertSnapPreview(page, 'wallPanel', {
        socketRole: 'wall-panel',
        socketCollider: 'thin-wall',
        silhouette: 'wall-panel-preview',
        meshNames: ['snapPreviewWallPanelFace', 'snapPreviewWallPanelTopCap'],
        roles: ['snap preview full wall boundary', 'snap preview wall top cap'],
      }),
      wallDoorPanel: await assertSnapPreview(page, 'wallDoorPanel', {
        socketRole: 'wall-opening',
        socketCollider: 'thin-wall',
        silhouette: 'wall-door-panel-preview',
        meshNames: ['snapPreviewWallDoorLeftWall', 'snapPreviewWallDoorLeftJamb', 'snapPreviewWallDoorLintel'],
        roles: ['snap preview wall door shelter boundary', 'snap preview integrated door opening', 'snap preview wall door lintel'],
      }),
      wallWindowPanel: await assertSnapPreview(page, 'wallWindowPanel', {
        socketRole: 'wall-light',
        socketCollider: 'thin-wall',
        silhouette: 'wall-window-panel-preview',
        meshNames: ['snapPreviewWallWindowFace', 'snapPreviewWallWindowPane', 'snapPreviewWallWindowMullion'],
        roles: ['snap preview wall window shelter boundary', 'snap preview wall window light opening', 'snap preview wall window centered opening'],
      }),
      wallCorner: await assertSnapPreview(page, 'wallCorner', {
        socketRole: 'wall-corner',
        socketCollider: 'thin-wall',
        silhouette: 'wall-corner-preview',
        meshNames: ['snapPreviewWallCornerPost', 'snapPreviewWallCornerLeftWing', 'snapPreviewWallCornerCap'],
        roles: ['snap preview wall corner shelter boundary', 'snap preview wall corner wing', 'snap preview wall shell corner cap'],
      }),
      wallHalfRail: await assertSnapPreview(page, 'wallHalfRail', {
        socketRole: 'half-rail',
        socketCollider: 'thin-wall',
        silhouette: 'half-rail-preview',
        meshNames: ['snapPreviewHalfRailRun', 'snapPreviewHalfRailOpenGap'],
        roles: ['snap preview porch rail', 'snap preview open weather gap'],
      }),
      roofJoin: await assertSnapPreview(page, 'roofJoin', {
        socketRole: 'roof-join',
        socketCollider: 'roof-shell',
        silhouette: 'roof-join-preview',
        meshNames: ['snapPreviewRoofJoinRidge', 'snapPreviewRoofJoinLeftBracket', 'snapPreviewRoofJoinCoverage'],
        roles: ['snap preview roof join ridge', 'snap preview roof join bracket', 'snap preview roof join coverage'],
      }),
    };

    let setup = await page.evaluate(() => {
      const world = window.__world;
      for (const item of ['bedroll', 'roofBundle', 'roofJoin', 'wallDoorPanel', 'wallWindowPanel', 'wallCorner', 'wallPanel', 'wallHalfRail', 'floorFoundation', 'campfire', 'workbench', 'chest']) world.giveItem(item, 40);
      const baseline = world.save.export();
      const occupied = () => new Set(world.structures().items.map((entry) => entry.tile));
      const failures = [];
      const place = (item, tile) => {
        const before = new Set(world.structures().items.map((entry) => entry.id));
        if (!world.placeStructure(item, tile)) {
          failures.push({
            item,
            tile,
            lastAction: world.structures().lastAction,
            commands: world.buildCommands?.(),
          });
          return null;
        }
        const placed = world.structures().items.find((entry) => !before.has(entry.id)) ?? null;
        if (!placed) {
          failures.push({
            item,
            tile,
            reason: 'placement reported success but no new structure appeared',
            lastAction: world.structures().lastAction,
            commands: world.buildCommands?.(),
          });
        }
        return placed;
      };
      const candidateTiles = (rings, exclude = []) => {
        const excluded = new Set([world.player.tile, ...exclude]);
        return world.nearbyTiles(rings).filter((tile) => !excluded.has(tile) && !occupied().has(tile));
      };
      const placeFirst = (item, rings, exclude = []) => {
        for (const tile of candidateTiles(rings, exclude)) {
          const placed = place(item, tile);
          if (placed) return placed;
        }
        return null;
      };
      const relocate = (entry, tile, yaw, expectOk = true) => {
        if (!entry) return { ok: false, reason: 'missing source', tile, yaw };
        const ok = world.relocateStructure(entry.id, tile, undefined, yaw);
        const after = world.structures().items.find((candidate) => candidate.id === entry.id) ?? null;
        const result = {
          ok,
          tile,
          yaw,
          after,
          lastAction: world.structures().lastAction,
          commands: world.buildCommands?.(),
        };
        if (ok !== expectOk) failures.push({ item: entry.item, expectedRelocateOk: expectOk, result });
        return result;
      };
      const inwardYaw = (tile, centerTile) => {
        const degree = world.geo.degreeOf(tile);
        for (let edge = 0; edge < degree; edge++) {
          if (world.geo.neighbor(tile, edge) === centerTile) return edge * Math.PI / 3;
        }
        return 0;
      };
      const centers = world.nearbyTiles(3).filter((tile) => tile !== world.player.tile);
      for (const center of centers) {
        if (occupied().has(center)) continue;
        const boundary = Array.from({ length: world.geo.degreeOf(center) }, (_, edge) => world.geo.neighbor(center, edge))
          .filter((tile) => tile >= 0 && tile !== center && tile !== world.player.tile && !occupied().has(tile));
        if (boundary.length < 6) continue;
        const bedroll = place('bedroll', center);
        if (!bedroll) continue;
        world.useStructure(bedroll.id);
        const pieces = [
          ['roofJoin', boundary[0]],
          ['roofBundle', boundary[1]],
          ['wallDoorPanel', boundary[2]],
          ['wallWindowPanel', boundary[3]],
          ['wallCorner', boundary[4]],
          ['campfire', boundary[5]],
        ];
        const placed = [];
        let failed = false;
        for (const [item, tile] of pieces) {
          const next = place(item, tile);
          if (!next) {
            failed = true;
            break;
          }
          placed.push(next);
        }
        if (failed) {
          world.save.import(baseline);
          continue;
        }
        const fire = placed.find((entry) => entry.item === 'campfire');
        if (fire) world.useStructure(fire.id);
        const edgeAlignments = placed
          .filter((entry) => ['wallDoorPanel', 'wallWindowPanel', 'wallCorner'].includes(entry.item))
          .map((entry) => relocate(entry, entry.tile, inwardYaw(entry.tile, center), true));
        if (edgeAlignments.some((result) => !result.ok)) {
          world.save.import(baseline);
          continue;
        }
        const workbench = place('workbench', boundary[3]);
        const chest = place('chest', boundary[4]);
        if (!workbench || !chest) {
          world.save.import(baseline);
          continue;
        }
        placed.push(workbench, chest);
        const halfRail = placeFirst('wallHalfRail', 5);
        const foundation = placeFirst('floorFoundation', 7, halfRail ? [halfRail.tile] : []);
        const looseWall = placeFirst('wallPanel', 7, [halfRail?.tile, foundation?.tile].filter((tile) => tile !== undefined));
        const looseWindow = placeFirst('wallWindowPanel', 7, [halfRail?.tile, foundation?.tile, looseWall?.tile].filter((tile) => tile !== undefined));
        const looseDoor = placeFirst('wallDoorPanel', 7, [halfRail?.tile, foundation?.tile, looseWall?.tile, looseWindow?.tile].filter((tile) => tile !== undefined));
        if (!halfRail || !foundation) {
          world.save.import(baseline);
          continue;
        }
        const stackedWall = relocate(looseWall, foundation.tile, 0, true);
        const stackedWindow = relocate(looseWindow, foundation.tile, Math.PI / 3, true);
        const duplicateDoor = relocate(looseDoor, foundation.tile, 0, false);
        const passDoor = relocate(looseDoor, foundation.tile, Math.PI * 2 / 3, true);
        if (!looseWall || !looseWindow || !looseDoor || !stackedWall.ok || !stackedWindow.ok || duplicateDoor.ok || !passDoor.ok) {
          world.save.import(baseline);
          continue;
        }
        return {
          ok: true,
          center,
          boundary,
          bedroll,
          placed,
          edgeAlignments,
          halfRail,
          foundation,
          stacked: {
            wall: stackedWall,
            window: stackedWindow,
            duplicateDoor,
            door: passDoor,
            tile: foundation.tile,
          },
          structures: world.structures(),
          text: JSON.parse(window.render_game_to_text()),
        };
      }
      return { ok: false, reason: 'no valid center', playerTile: world.player.tile, nearby: centers, failures };
    });
    if (!setup.ok) throw new Error(`C6 setup failed: ${JSON.stringify(setup)}`);
    await page.waitForFunction((tile) => {
      const wallShell = window.__world?.structures?.().renderer?.wallShell;
      return wallShell?.sameTileEdgeStacks >= 1
        && wallShell.edgeSockets?.includes(`${tile}:edge:0`)
        && wallShell.edgeSockets?.includes(`${tile}:edge:1`);
    }, setup.stacked.tile, { timeout: 10000 });
    setup = { ...setup, structures: await page.evaluate(() => window.__world.structures()) };
    if (setup.structures.sockets.houseKit.map((entry) => entry.item).join(',') !== 'doorKit,windowFrame,roofBundle') {
      throw new Error(`houseKit catalog changed unexpectedly: ${JSON.stringify(setup.structures.sockets.houseKit)}`);
    }
    if (setup.structures.sockets.wallShell.map((entry) => entry.item).join(',') !== 'floorFoundation,wallPanel,wallDoorPanel,wallWindowPanel,wallCorner,wallHalfRail,roofJoin') {
      throw new Error(`wallShell catalog missing: ${JSON.stringify(setup.structures.sockets.wallShell)}`);
    }
    const readyHome = setup.structures.home;
    if (!readyHome.shelter.protected || !readyHome.functional || readyHome.label !== 'shelter alive') {
      throw new Error(`serviced wall shell room should be functional: ${JSON.stringify(readyHome)}`);
    }
    if (
      !readyHome.shelter.hasWarmth
      || !readyHome.shelter.hasStation
      || !readyHome.shelter.hasStorage
      || !readyHome.shelter.enclosure.serviceReady
      || readyHome.shelter.enclosure.comfortTier !== 'lived-in'
    ) {
      throw new Error(`functional wall shell services did not register: ${JSON.stringify(readyHome.shelter)}`);
    }
    if (!readyHome.shelter.hasWindow || readyHome.shelter.enclosure.openingTiles.length < 2) {
      throw new Error(`integrated window/door panels did not register openings: ${JSON.stringify(readyHome.shelter)}`);
    }
    if (readyHome.shelter.enclosure.boundaryCoverage < 0.75 || readyHome.shelter.enclosure.wallTiles.length < 3 || readyHome.shelter.enclosure.cornerTiles.length < 1 || readyHome.shelter.enclosure.roofJoinTiles.length < 1) {
      throw new Error(`wall shell boundary did not register: ${JSON.stringify(readyHome.shelter.enclosure)}`);
    }
    if (
      readyHome.shelter.enclosure.boundaryCoverageMode !== 'edge'
      || readyHome.shelter.enclosure.boundaryCoverageNeed !== 4
      || readyHome.shelter.enclosure.boundaryEdgeCount < 5
      || readyHome.shelter.enclosure.perimeterCoverage <= 0
      || readyHome.shelter.enclosure.coveredBoundaryEdges.length < 3
      || readyHome.shelter.enclosure.wallBoundaryEdges.length < 3
      || readyHome.shelter.enclosure.doorBoundaryEdges.length < 1
      || readyHome.shelter.enclosure.windowBoundaryEdges.length < 1
      || !readyHome.shelter.enclosure.doorOnBoundary
    ) {
      throw new Error(`wall shell shelter coverage is not edge-based: ${JSON.stringify(readyHome.shelter.enclosure)}`);
    }
    if (
      (setup.structures.renderer.wallShell?.doorPanels ?? 0) < 1
      || (setup.structures.renderer.wallShell?.windowPanels ?? 0) < 1
      || (setup.structures.renderer.wallShell?.corners ?? 0) < 1
      || (setup.structures.renderer.wallShell?.roofJoins ?? 0) < 1
      || (setup.structures.renderer.wallShell?.halfRails ?? 0) < 1
      || (setup.structures.renderer.wallShell?.foundations ?? 0) < 1
    ) {
      throw new Error(`renderer wall shell diagnostics missing: ${JSON.stringify(setup.structures.renderer.wallShell)}`);
    }
    const stackedKeys = setup.structures.items
      .filter((entry) => entry.tile === setup.stacked.tile)
      .flatMap((entry) => entry.socket?.occupancyKeys ?? []);
    for (const key of [`${setup.stacked.tile}:floor`, `${setup.stacked.tile}:edge:0`, `${setup.stacked.tile}:edge:1`, `${setup.stacked.tile}:edge:2`]) {
      if (!stackedKeys.includes(key)) {
        throw new Error(`same-tile edge stack missing ${key}: ${JSON.stringify({ stacked: setup.stacked, stackedKeys, items: setup.structures.items.filter((entry) => entry.tile === setup.stacked.tile) })}`);
      }
    }
    if (setup.stacked.duplicateDoor.ok || setup.stacked.duplicateDoor?.commands?.last?.blockers?.[0] !== 'occupied edge socket') {
      throw new Error(`duplicate wall edge was not blocked: ${JSON.stringify(setup.stacked.duplicateDoor)}`);
    }
    if ((setup.structures.renderer.wallShell?.sameTileEdgeStacks ?? 0) < 1) {
      throw new Error(`renderer did not report same-tile edge stack: ${JSON.stringify(setup.structures.renderer.wallShell)}`);
    }
    for (const key of [`${setup.stacked.tile}:edge:0`, `${setup.stacked.tile}:edge:1`, `${setup.stacked.tile}:edge:2`]) {
      if (!setup.structures.renderer.wallShell?.edgeSockets?.includes(key)) {
        throw new Error(`renderer edge socket missing ${key}: ${JSON.stringify(setup.structures.renderer.wallShell)}`);
      }
    }

    const collisions = await page.evaluate((tile) => {
      const world = window.__world;
      const targets = {
        wall: world.geo.neighbor(tile, 0),
        window: world.geo.neighbor(tile, 1),
        door: world.geo.neighbor(tile, 2),
      };
      world.debugSetPlayerTile(tile);
      const wallWalk = world.debugWalkTowardTile(targets.wall, 1.55);
      world.debugSetPlayerTile(tile);
      const doorWalk = world.debugWalkTowardTile(targets.door, 1.55);
      return {
        targets,
        wall: world.structureCollision(tile, targets.wall),
        wallReverse: world.structureCollision(targets.wall, tile),
        window: world.structureCollision(tile, targets.window),
        door: world.structureCollision(tile, targets.door),
        wallWalk,
        doorWalk,
        text: JSON.parse(window.render_game_to_text()).structures.collision,
      };
    }, setup.stacked.tile);
    if (collisions.wall?.blocker?.item !== 'wallPanel' || collisions.wallReverse?.blocker?.item !== 'wallPanel') {
      throw new Error(`wall traversal collision missing: ${JSON.stringify(collisions)}`);
    }
    if (collisions.window?.blocker?.item !== 'wallWindowPanel') {
      throw new Error(`window-wall traversal collision missing: ${JSON.stringify(collisions)}`);
    }
    if (collisions.door?.blocker) {
      throw new Error(`door edge should stay passable: ${JSON.stringify(collisions)}`);
    }
    if (!collisions.wallWalk?.blocked || collisions.wallWalk?.collision?.last?.item !== 'wallPanel') {
      throw new Error(`real player walk did not hit wall-shell blocker: ${JSON.stringify(collisions.wallWalk)}`);
    }
    if (collisions.wallWalk?.crossed || collisions.wallWalk?.endTile !== setup.stacked.tile) {
      throw new Error(`wall blocker did not keep player on the source tile: ${JSON.stringify(collisions.wallWalk)}`);
    }
    if (collisions.doorWalk?.blocked) {
      throw new Error(`real player walk was structure-blocked by door edge: ${JSON.stringify(collisions.doorWalk)}`);
    }
    if (!collisions.doorWalk?.crossed || collisions.doorWalk?.endTile !== collisions.targets.door) {
      throw new Error(`real player walk did not cross the passable door edge: ${JSON.stringify(collisions.doorWalk)}`);
    }

    const cornerBefore = await page.evaluate((cornerId) => {
      const world = window.__world;
      const corner = world.structures().items.find((entry) => entry.id === cornerId);
      if (!corner) return { ok: false, reason: 'corner missing' };
      const ownedEdges = (corner.socket?.occupancyKeys ?? [])
        .map((key) => /:edge:(\d+)$/.exec(key)?.[1])
        .filter((edge) => edge !== undefined)
        .map((edge) => Number(edge));
      const openEdge = Array.from({ length: world.geo.degreeOf(corner.tile) }, (_, edge) => edge)
        .find((edge) => !ownedEdges.includes(edge));
      const owned = ownedEdges.map((edge) => {
        const target = world.geo.neighbor(corner.tile, edge);
        return { edge, target, collision: world.structureCollision(corner.tile, target) };
      });
      const openTarget = openEdge === undefined ? -1 : world.geo.neighbor(corner.tile, openEdge);
      return {
        ok: true,
        corner,
        ownedEdges,
        owned,
        open: {
          edge: openEdge,
          target: openTarget,
          collision: openEdge === undefined ? null : world.structureCollision(corner.tile, openTarget),
        },
      };
    }, setup.placed.find((entry) => entry.item === 'wallCorner')?.id);
    if (!cornerBefore.ok || cornerBefore.owned?.length !== 2 || cornerBefore.owned.some((entry) => entry.collision?.blocker?.item !== 'wallCorner')) {
      throw new Error(`corner did not block both owned edges before relocation: ${JSON.stringify(cornerBefore)}`);
    }
    if (cornerBefore.open?.collision?.blocker) {
      throw new Error(`corner blocked an unowned edge before relocation: ${JSON.stringify(cornerBefore)}`);
    }

    await page.waitForTimeout(300);
    const readyScreenshot = path.join(outDir, 'wall-shells-ready.png');
    await page.screenshot({ path: readyScreenshot, fullPage: false });
    const readyPixelProbe = pngPixelProbe(await fs.readFile(readyScreenshot));
    if (!readyPixelProbe.ok) throw new Error(`Ready screenshot pixel probe failed: ${JSON.stringify(readyPixelProbe)}`);

    const readyRest = await page.evaluate((bedrollId) => {
      const world = window.__world;
      const before = world.survival();
      const used = world.useStructure(bedrollId);
      return {
        used,
        before,
        after: world.survival(),
        structures: world.structures(),
        text: JSON.parse(window.render_game_to_text()),
      };
    }, setup.bedroll.id);
    const restCommand = readyRest.structures.commands?.last ?? null;
    if (
      !readyRest.used
      || restCommand?.action?.includes('shelter rest') !== true
      || restCommand?.message?.includes('shelter rest') !== true
    ) {
      throw new Error(`functional wall shell bedroll did not rest as a shelter: ${JSON.stringify(readyRest)}`);
    }
    if (!readyRest.after.lastAction.includes('shelter sleep')) {
      throw new Error(`survival rest action did not record shelter sleep: ${JSON.stringify(readyRest.after)}`);
    }

    const sixEdge = await page.evaluate((input) => {
      const world = window.__world;
      const restoreSave = world.save.export();
      const failures = [];
      const placeAndFace = (item, tile, yaw) => {
        const beforeIds = new Set(world.structures().items.map((entry) => entry.id));
        if (!world.placeStructure(item, tile)) {
          failures.push({ item, tile, yaw, phase: 'place', action: world.structures().lastAction, commands: world.buildCommands?.() });
          return null;
        }
        const placed = world.structures().items.find((entry) => !beforeIds.has(entry.id)) ?? null;
        if (!placed) {
          failures.push({ item, tile, yaw, phase: 'find', action: world.structures().lastAction, commands: world.buildCommands?.() });
          return null;
        }
        if (!world.relocateStructure(placed.id, tile, undefined, yaw)) {
          const commands = world.buildCommands?.();
          if (commands?.last?.blockers?.includes('same snap target')) {
            return world.structures().items.find((entry) => entry.id === placed.id) ?? placed;
          }
          failures.push({ item, tile, yaw, phase: 'face', action: world.structures().lastAction, commands });
          return null;
        }
        return world.structures().items.find((entry) => entry.id === placed.id) ?? placed;
      };
      const inwardYaw = (tile, centerTile) => {
        const degree = world.geo.degreeOf(tile);
        for (let edge = 0; edge < degree; edge++) {
          if (world.geo.neighbor(tile, edge) === centerTile) return edge * Math.PI / 3;
        }
        return 0;
      };
      const additions = [
        placeAndFace('wallPanel', input.center, 0),
        placeAndFace('wallPanel', input.boundary[1], inwardYaw(input.boundary[1], input.center)),
        placeAndFace('wallPanel', input.boundary[5], inwardYaw(input.boundary[5], input.center)),
      ].filter(Boolean);
      const structures = world.structures();
      const home = structures.home;
      const text = JSON.parse(window.render_game_to_text());
      const result = {
        ok: failures.length === 0,
        additions,
        failures,
        structures,
        home,
        text,
        expectedEdges: Array.from({ length: 6 }, (_, edge) => `${input.center}:edge:${edge}`),
        restoreSave,
      };
      return result;
    }, { center: setup.center, boundary: setup.boundary });
    if (!sixEdge.ok) {
      throw new Error(`full six-edge wall shell setup failed: ${JSON.stringify(sixEdge.failures)}`);
    }
    if (
      !sixEdge.home.shelter.protected
      || !sixEdge.home.functional
      || sixEdge.home.shelter.enclosure.boundaryCoverage !== 1
      || sixEdge.home.shelter.enclosure.perimeterCoverage !== 1
      || sixEdge.home.shelter.enclosure.coveredBoundaryEdges.length !== sixEdge.home.shelter.enclosure.boundaryEdgeCount
      || sixEdge.expectedEdges.some((edge) => !sixEdge.home.shelter.enclosure.coveredBoundaryEdges.includes(edge))
    ) {
      throw new Error(`full six-edge room did not report complete coverage: ${JSON.stringify(sixEdge.home)}`);
    }
    await page.evaluate((input) => {
      const world = window.__world;
      const occupied = new Set(world.structures().items.map((entry) => entry.tile));
      const blocked = new Set([input.center, ...input.boundary]);
      const viewTile = world.nearbyTiles(3).find((tile) => !blocked.has(tile) && !occupied.has(tile));
      if (viewTile !== undefined) world.debugSetPlayerTile(viewTile);
      world.debugAimAtTile(input.center);
      world.setZoom?.(0.22);
    }, { center: setup.center, boundary: setup.boundary });
    await page.waitForTimeout(300);
    const sixEdgeScreenshot = path.join(outDir, 'wall-shells-six-edge.png');
    await page.screenshot({ path: sixEdgeScreenshot, fullPage: false });
    const sixEdgePixelProbe = pngPixelProbe(await fs.readFile(sixEdgeScreenshot));
    if (!sixEdgePixelProbe.ok) throw new Error(`Six-edge screenshot pixel probe failed: ${JSON.stringify(sixEdgePixelProbe)}`);
    await page.evaluate((save) => {
      window.__world.save.import(save);
    }, sixEdge.restoreSave);
    delete sixEdge.restoreSave;

    const multiRoom = await page.evaluate(() => {
      const world = window.__world;
      const restoreSave = world.save.export();
      const failures = [];
      const edgeYaw = (edge) => edge * Math.PI / 3;
      const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value));
      const placedById = (id) => world.structures().items.find((entry) => entry.id === id) ?? null;
      const beforeIds = () => new Set(world.structures().items.map((entry) => entry.id));
      const occupiedTiles = () => new Set(world.structures().items.map((entry) => entry.tile));
      const sharedEdge = (from, to) => {
        const degree = world.geo.degreeOf(from);
        for (let edge = 0; edge < degree; edge++) {
          if (world.geo.neighbor(from, edge) === to) return edge;
        }
        return null;
      };
      const place = (item, tile, recordFailure = true) => {
        const before = beforeIds();
        if (!world.placeStructure(item, tile)) {
          if (recordFailure) failures.push({ item, tile, phase: 'place', action: world.structures().lastAction, commands: world.buildCommands?.() });
          return null;
        }
        const placed = world.structures().items.find((entry) => !before.has(entry.id)) ?? null;
        if (!placed) failures.push({ item, tile, phase: 'find', action: world.structures().lastAction, commands: world.buildCommands?.() });
        return placed;
      };
      const face = (entry, tile, yaw, recordFailure = true) => {
        if (!entry) return null;
        if (!world.relocateStructure(entry.id, tile, undefined, yaw)) {
          const commands = world.buildCommands?.();
          if (commands?.last?.blockers?.includes('same snap target')) return placedById(entry.id) ?? entry;
          if (recordFailure) failures.push({ item: entry.item, tile, yaw, phase: 'face', action: world.structures().lastAction, commands });
          return null;
        }
        return placedById(entry.id) ?? entry;
      };
      const placeFacing = (item, tile, edge) => {
        const direct = place(item, tile, false);
        if (direct) return face(direct, tile, edgeYaw(edge));
        for (const stagingTile of freeTiles([tile])) {
          const staged = place(item, stagingTile, false);
          if (staged) return face(staged, tile, edgeYaw(edge));
        }
        failures.push({ item, tile, edge, phase: 'stage', action: world.structures().lastAction, commands: world.buildCommands?.() });
        return null;
      };
      const outerEdgesFor = (roomTiles) => {
        const room = new Set(roomTiles);
        const edges = [];
        for (const tile of roomTiles) {
          const degree = world.geo.degreeOf(tile);
          for (let edge = 0; edge < degree; edge++) {
            const neighbor = world.geo.neighbor(tile, edge);
            if (neighbor === tile || room.has(neighbor)) continue;
            edges.push({
              key: `${tile}:edge:${edge}`,
              tile,
              edge,
              neighbor,
              neighborEdge: sharedEdge(neighbor, tile),
            });
          }
        }
        return edges.sort((a, b) => a.tile - b.tile || a.edge - b.edge);
      };
      const freeTiles = (blocked = []) => {
        const blockedSet = new Set([world.player.tile, ...blocked]);
        const occupied = occupiedTiles();
        return world.nearbyTiles(8).filter((tile) => !blockedSet.has(tile) && !occupied.has(tile));
      };
      const moveAway = (entry, blocked = []) => {
        for (const tile of freeTiles(blocked)) {
          const moved = face(entry, tile, 0, false);
          if (moved) return moved;
        }
        return null;
      };
      const candidateCenters = world.nearbyTiles(7).filter((tile) => tile !== world.player.tile && world.geo.degreeOf(tile) >= 6);
      for (const center of candidateCenters) {
        const occupied = occupiedTiles();
        if (occupied.has(center)) continue;
        const branchEdges = [0, 2, 3];
        const branches = branchEdges.map((edge) => world.geo.neighbor(center, edge));
        const roomTiles = [center, ...branches];
        if (new Set(roomTiles).size !== roomTiles.length) continue;
        if (roomTiles.some((tile) => tile === world.player.tile || occupied.has(tile) || world.geo.degreeOf(tile) < 6)) continue;
        const perimeter = outerEdgesFor(roomTiles);
        if (perimeter.length < 12 || perimeter.some((edge) => edge.neighborEdge === null)) continue;
        const baseline = world.save.export();
        failures.length = 0;

        const bedroll = place('bedroll', center);
        if (!bedroll) {
          world.save.import(baseline);
          continue;
        }
        world.useStructure(bedroll.id);
        const foundations = [];
        const roofs = [];
        for (const tile of branches) {
          const foundation = place('floorFoundation', tile);
          const inward = sharedEdge(tile, center);
          const roof = inward === null ? null : placeFacing('roofJoin', tile, inward);
          if (!foundation || !roof) break;
          foundations.push(foundation);
          roofs.push(roof);
        }
        if (foundations.length !== branches.length || roofs.length !== branches.length) {
          world.save.import(baseline);
          continue;
        }
        const fire = place('campfire', branches[0]);
        const workbench = place('workbench', branches[1]);
        const chest = place('chest', branches[2]);
        if (!fire || !workbench || !chest) {
          world.save.import(baseline);
          continue;
        }
        world.useStructure(fire.id);

        const seamDoor = placeFacing('wallDoorPanel', center, branchEdges[0]);
        if (!seamDoor) {
          world.save.import(baseline);
          continue;
        }
        const perimeterWalls = [];
        for (const [index, edge] of perimeter.entries()) {
          const item = index === 0 ? 'wallDoorPanel' : index === 1 ? 'wallWindowPanel' : 'wallPanel';
          const wall = placeFacing(item, edge.tile, edge.edge);
          if (!wall) break;
          perimeterWalls.push({ ...wall, expectedKey: edge.key });
        }
        if (perimeterWalls.length !== perimeter.length || failures.length > 0) {
          world.save.import(baseline);
          continue;
        }

        const home = world.structures().home;
        const expectedEdges = perimeter.map((edge) => edge.key);
        const boundaryEdges = home.shelter.enclosure.boundaryEdges;
        const coveredEdges = home.shelter.enclosure.coveredBoundaryEdges;
        const seamKeys = branchEdges.flatMap((edge, index) => {
          const branch = branches[index];
          const back = sharedEdge(branch, center);
          return back === null ? [`${center}:edge:${edge}`] : [`${center}:edge:${edge}`, `${branch}:edge:${back}`];
        });
        const complete = home.shelter.protected
          && home.functional
          && home.shelter.enclosure.boundaryCoverage === 1
          && home.shelter.enclosure.perimeterCoverage === 1
          && home.shelter.enclosure.boundaryEdgeCount === expectedEdges.length
          && sameSet(boundaryEdges, expectedEdges)
          && sameSet(coveredEdges, expectedEdges)
          && seamKeys.every((key) => !boundaryEdges.includes(key) && !coveredEdges.includes(key))
          && home.shelter.enclosure.doorBoundaryEdges.length === 1
          && home.shelter.enclosure.windowBoundaryEdges.length === 1
          && !home.shelter.enclosure.doorBoundaryEdges.includes(`${center}:edge:${branchEdges[0]}`);
        if (!complete) {
          failures.push({ phase: 'assert-complete', home, expectedEdges, seamKeys });
          world.save.import(baseline);
          continue;
        }

        const fullSave = world.save.export();
        const exteriorWall = perimeterWalls[perimeterWalls.length - 1];
        const exteriorMoved = moveAway(exteriorWall, roomTiles);
        const weakened = world.structures().home;
        const exteriorWeakens = !!exteriorMoved
          && !weakened.shelter.protected
          && !weakened.functional
          && weakened.shelter.missing.includes('room boundary');

        world.save.import(fullSave);
        const restoredSeamDoor = world.structures().items.find((entry) => entry.tile === center && entry.item === 'wallDoorPanel' && entry.turn === branchEdges[0]);
        const seamMoved = restoredSeamDoor ? moveAway(restoredSeamDoor, roomTiles) : null;
        const withoutInteriorSeam = world.structures().home;
        const interiorSeamNotRequired = !!seamMoved
          && withoutInteriorSeam.shelter.protected
          && withoutInteriorSeam.functional
          && sameSet(withoutInteriorSeam.shelter.enclosure.coveredBoundaryEdges, expectedEdges);

        if (!exteriorWeakens || !interiorSeamNotRequired) {
          failures.push({ phase: 'assert-mutations', exteriorWeakens, interiorSeamNotRequired, weakened, withoutInteriorSeam });
          world.save.import(baseline);
          continue;
        }

        world.save.import(fullSave);
        return {
          ok: true,
          center,
          roomTiles,
          foundationTiles: foundations.map((entry) => entry.tile),
          expectedEdges,
          seamKeys,
          home: world.structures().home,
          exteriorWeakens,
          interiorSeamNotRequired,
          restoreSave,
        };
      }
      world.save.import(restoreSave);
      return { ok: false, failures, restoreSave };
    });
    if (!multiRoom.ok) {
      throw new Error(`connected multi-room wall shell setup failed: ${JSON.stringify(multiRoom)}`);
    }
    await page.evaluate((input) => {
      const world = window.__world;
      const occupied = new Set(world.structures().items.map((entry) => entry.tile));
      const blocked = new Set([...input.roomTiles]);
      const viewTile = world.nearbyTiles(4).find((tile) => !blocked.has(tile) && !occupied.has(tile));
      if (viewTile !== undefined) world.debugSetPlayerTile(viewTile);
      world.debugAimAtTile(input.center);
      world.setZoom?.(0.18);
    }, { center: multiRoom.center, roomTiles: multiRoom.roomTiles });
    await page.waitForTimeout(300);
    const multiRoomScreenshot = path.join(outDir, 'wall-shells-multi-room.png');
    await page.screenshot({ path: multiRoomScreenshot, fullPage: false });
    const multiRoomPixelProbe = pngPixelProbe(await fs.readFile(multiRoomScreenshot));
    if (!multiRoomPixelProbe.ok) throw new Error(`Multi-room screenshot pixel probe failed: ${JSON.stringify(multiRoomPixelProbe)}`);
    await page.evaluate((save) => {
      window.__world.save.import(save);
    }, multiRoom.restoreSave);
    delete multiRoom.restoreSave;

    const weakened = await page.evaluate((wallId) => {
      const world = window.__world;
      const failures = [];
      for (const target of world.nearbyTiles(7)) {
        const occupied = new Set(world.structures().items.map((entry) => entry.tile));
        if (target === world.player.tile || occupied.has(target)) continue;
        const moved = world.relocateStructure(wallId, target);
        if (moved) {
          return { ok: true, target, structures: world.structures(), text: JSON.parse(window.render_game_to_text()) };
        }
        failures.push({
          target,
          lastAction: world.structures().lastAction,
          commands: world.buildCommands?.(),
        });
      }
      return { ok: false, reason: 'no relocation target', failures, structures: world.structures(), text: JSON.parse(window.render_game_to_text()) };
    }, setup.placed.find((entry) => entry.item === 'wallCorner')?.id);
    if (!weakened.ok) throw new Error(`wall relocate failed: ${JSON.stringify(weakened)}`);
    if (weakened.structures.home.shelter.protected || !weakened.structures.home.shelter.missing.includes('room boundary')) {
      throw new Error(`moving one wall should weaken shelter: ${JSON.stringify(weakened.structures.home)}`);
    }
    const cornerAfter = await page.evaluate((corner) => {
      const world = window.__world;
      return {
        oldOwned: corner.owned.map((entry) => ({
          edge: entry.edge,
          target: entry.target,
          collision: world.structureCollision(corner.corner.tile, entry.target),
        })),
      };
    }, cornerBefore);
    if (cornerAfter.oldOwned.some((entry) => entry.collision?.blocker)) {
      throw new Error(`corner relocation left stale collision on old edges: ${JSON.stringify({ cornerBefore, cornerAfter, weakened })}`);
    }

    await page.waitForTimeout(500);
    const screenshot = path.join(outDir, 'wall-shells.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    const pixelProbe = pngPixelProbe(await fs.readFile(screenshot));
    if (!pixelProbe.ok) throw new Error(`Screenshot pixel probe failed: ${JSON.stringify(pixelProbe)}`);
    if (consoleErrors.length || pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);

    const proof = {
      ok: true,
      readyScreenshot,
      screenshot,
      readyPixelProbe,
      pixelProbe,
      sixEdge,
      sixEdgeScreenshot,
      sixEdgePixelProbe,
      multiRoom,
      multiRoomScreenshot,
      multiRoomPixelProbe,
      previews,
      collisions,
      cornerBefore,
      cornerAfter,
      readyRest,
      setup,
      weakened,
      consoleErrors,
      pageErrors,
    };
    await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({
      ok: true,
      readyScreenshot,
      screenshot,
      readyPixelProbe,
      pixelProbe,
      ready: {
        protected: readyHome.shelter.protected,
        functional: readyHome.functional,
        label: readyHome.label,
        comfortTier: readyHome.shelter.enclosure.comfortTier,
        boundaryCoverage: readyHome.shelter.enclosure.boundaryCoverage,
        boundaryCoverageMode: readyHome.shelter.enclosure.boundaryCoverageMode,
        boundaryCoverageNeed: readyHome.shelter.enclosure.boundaryCoverageNeed,
        boundaryEdgeCount: readyHome.shelter.enclosure.boundaryEdgeCount,
        perimeterCoverage: readyHome.shelter.enclosure.perimeterCoverage,
        coveredBoundaryEdges: readyHome.shelter.enclosure.coveredBoundaryEdges,
        wallTiles: readyHome.shelter.enclosure.wallTiles,
        services: {
          warmth: readyHome.shelter.hasWarmth,
          workbench: readyHome.shelter.hasStation,
          storage: readyHome.shelter.hasStorage,
        },
        restAction: readyRest.after.lastAction,
      },
      sixEdge: {
        screenshot: sixEdgeScreenshot,
        pixelProbe: sixEdgePixelProbe,
        boundaryCoverage: sixEdge.home.shelter.enclosure.boundaryCoverage,
        perimeterCoverage: sixEdge.home.shelter.enclosure.perimeterCoverage,
        coveredBoundaryEdges: sixEdge.home.shelter.enclosure.coveredBoundaryEdges,
        additions: sixEdge.additions.map((entry) => ({ item: entry.item, tile: entry.tile, turn: entry.turn })),
      },
      multiRoom: {
        screenshot: multiRoomScreenshot,
        pixelProbe: multiRoomPixelProbe,
        center: multiRoom.center,
        roomTiles: multiRoom.roomTiles,
        foundationTiles: multiRoom.foundationTiles,
        boundaryCoverage: multiRoom.home.shelter.enclosure.boundaryCoverage,
        perimeterCoverage: multiRoom.home.shelter.enclosure.perimeterCoverage,
        boundaryEdgeCount: multiRoom.home.shelter.enclosure.boundaryEdgeCount,
        expectedEdges: multiRoom.expectedEdges,
        coveredBoundaryEdges: multiRoom.home.shelter.enclosure.coveredBoundaryEdges,
        seamKeys: multiRoom.seamKeys,
        exteriorWeakens: multiRoom.exteriorWeakens,
        interiorSeamNotRequired: multiRoom.interiorSeamNotRequired,
      },
      weakened: {
        protected: weakened.structures.home.shelter.protected,
        missing: weakened.structures.home.shelter.missing,
      },
      wallShell: setup.structures.renderer.wallShell,
      collisions: {
        wall: collisions.wall.blocker?.item,
        window: collisions.window.blocker?.item,
        doorBlocked: !!collisions.door.blocker,
        playerBlocked: collisions.wallWalk.blocked,
        cornerEdges: cornerBefore.owned.map((entry) => ({
          edge: entry.edge,
          blocker: entry.collision?.blocker?.item ?? null,
        })),
        cornerCleared: cornerAfter.oldOwned.every((entry) => !entry.collision?.blocker),
      },
    }, null, 2));
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
