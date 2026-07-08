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
  await page.evaluate((targetItem) => {
    const world = window.__world;
    world.giveItem(targetItem, 1);
    world.selectStructure(targetItem);
    const occupied = new Set(world.structures().items.map((entry) => entry.tile));
    const target = world.nearbyTiles(2).find((tile) => tile !== world.player.tile && !occupied.has(tile));
    if (target === undefined) throw new Error(`no snap target for ${targetItem}`);
    world.debugAimAtTile(target);
  }, item);
  await page.waitForFunction((args) => {
    const stats = window.__world?.structures?.().renderer?.snapPreview;
    return stats?.active === true
      && stats.item === args.item
      && stats.socketRole === args.socketRole
      && stats.socketCollider === args.socketCollider
      && stats.silhouette === args.silhouette
      && args.meshNames.every((name) => stats.meshNames.includes(name))
      && args.roles.every((role) => stats.visibleReadabilityRoles.includes(role));
  }, { item, ...expected }, { timeout: 10000 });
  return page.evaluate(() => window.__world.structures().renderer.snapPreview);
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
      for (const item of ['bedroll', 'roofBundle', 'roofJoin', 'wallDoorPanel', 'wallWindowPanel', 'wallCorner', 'wallPanel', 'wallHalfRail', 'floorFoundation', 'campfire', 'workbench', 'chest']) world.giveItem(item, 8);
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
    for (const key of [`${setup.stacked.tile}:center`, `${setup.stacked.tile}:edge:0`, `${setup.stacked.tile}:edge:1`, `${setup.stacked.tile}:edge:2`]) {
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
    if (collisions.doorWalk?.blocked) {
      throw new Error(`real player walk was structure-blocked by door edge: ${JSON.stringify(collisions.doorWalk)}`);
    }

    const cornerBefore = await page.evaluate((cornerId) => {
      const world = window.__world;
      const corner = world.structures().items.find((entry) => entry.id === cornerId);
      if (!corner) return { ok: false, reason: 'corner missing' };
      const targets = {
        edge0: world.geo.neighbor(corner.tile, 0),
        edge1: world.geo.neighbor(corner.tile, 1),
        edge2: world.geo.neighbor(corner.tile, 2),
      };
      return {
        ok: true,
        corner,
        targets,
        edge0: world.structureCollision(corner.tile, targets.edge0),
        edge1: world.structureCollision(corner.tile, targets.edge1),
        edge2: world.structureCollision(corner.tile, targets.edge2),
      };
    }, setup.placed.find((entry) => entry.item === 'wallCorner')?.id);
    if (!cornerBefore.ok || cornerBefore.edge0?.blocker?.item !== 'wallCorner' || cornerBefore.edge1?.blocker?.item !== 'wallCorner') {
      throw new Error(`corner did not block both owned edges before relocation: ${JSON.stringify(cornerBefore)}`);
    }
    if (cornerBefore.edge2?.blocker) {
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
    if (!readyRest.used || !readyRest.structures.lastAction.includes('shelter rest')) {
      throw new Error(`functional wall shell bedroll did not rest as a shelter: ${JSON.stringify(readyRest)}`);
    }
    if (!readyRest.after.lastAction.includes('shelter sleep')) {
      throw new Error(`survival rest action did not record shelter sleep: ${JSON.stringify(readyRest.after)}`);
    }

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
        oldEdge0: world.structureCollision(corner.corner.tile, corner.targets.edge0),
        oldEdge1: world.structureCollision(corner.corner.tile, corner.targets.edge1),
      };
    }, cornerBefore);
    if (cornerAfter.oldEdge0?.blocker || cornerAfter.oldEdge1?.blocker) {
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
        cornerEdges: [
          cornerBefore.edge0.blocker?.item,
          cornerBefore.edge1.blocker?.item,
        ],
        cornerCleared: !cornerAfter.oldEdge0.blocker && !cornerAfter.oldEdge1.blocker,
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
