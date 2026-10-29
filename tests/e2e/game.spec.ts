import { expect, test, type Page } from '@playwright/test';

// Any square that exists in public/puzzles works; this one has missing data in it.
const SQUARE = process.env.E2E_SQUARE ?? 'c17-r06';

async function waitForBoard(page: Page) {
  await page.locator('.stage .board, .stage svg.jigsaw').first().waitFor({ timeout: 15000 });
}

test('opens straight into a random Rotate puzzle with no blank pieces', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/#\/play\/c\d+-r\d+\/rotate\//);
  // Only squares marked complete in the catalog (c17-r05, c28-r15 in the test data).
  await expect(page).toHaveURL(/c17-r05|c28-r15/);
  await waitForBoard(page);
  await expect(page.locator('.board .tile').first()).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Rotate' })).toBeChecked();
});

test('changing settings updates the puzzle in place; New puzzle and map keep them', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/rotate/easy`);
  await waitForBoard(page);
  await page.getByRole('radio', { name: 'Jigsaw' }).check({ force: true });
  await expect(page).toHaveURL(new RegExp(`#/play/${SQUARE}/jigsaw/easy`));
  await expect(page.locator('svg.jigsaw')).toBeVisible();
  await page.getByRole('radio', { name: 'Hard' }).check({ force: true });
  await expect(page).toHaveURL(new RegExp(`#/play/${SQUARE}/jigsaw/hard`));
  await expect(page.locator('g.piece')).toHaveCount(25);

  await page.getByRole('button', { name: 'New puzzle' }).click();
  await expect(page).toHaveURL(/c17-r05|c28-r15/);
  await expect(page).toHaveURL(/#\/play\/c\d+-r\d+\/jigsaw\/hard/);
  await expect(page).not.toHaveURL(new RegExp(SQUARE));

  await page.getByRole('button', { name: 'Choose on map' }).click();
  await expect(page.locator('svg.map')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Jigsaw' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Hard' })).toBeChecked();
  await page.goBack();
  await expect(page.locator('svg.jigsaw')).toBeVisible();
});

test('map: pick a square, preview, then play', async ({ page }) => {
  await page.goto('./#/map');
  const map = page.locator('svg.map');
  await expect(map).toBeVisible();
  const cell = page.locator('.cells rect').first();
  await cell.click({ force: true });
  await expect(page.getByRole('heading', { name: /°N/ })).toBeVisible();
  await page.getByRole('button', { name: /^Play / }).click();
  await expect(page).toHaveURL(/#\/play\/c\d+-r\d+\//);
  await expect(page.getByRole('button', { name: 'Choose on map' })).toBeVisible();
  await expect(page.getByText('Florida Museum of Natural History').filter({ visible: true }).first()).toBeVisible();
});

test('slide: a legal tap counts a move', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/slide/easy`);
  await waitForBoard(page);
  const movable = page.locator('.board .tile:not([disabled])').first();
  await movable.click();
  await expect(page.locator('.stats strong').first()).toHaveText('1');
});

test('slide: every direction animates', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/slide/hard`);
  await waitForBoard(page);
  // Each tapped tile should still be mid-slide right after the tap.
  for (let k = 0; k < 6; k++) {
    const tile = page.locator('.board .tile:not([disabled])').nth(k % 2);
    const handle = (await tile.elementHandle())!;
    const before = await handle.evaluate((el) => getComputedStyle(el).transform);
    await tile.click();
    const mid = await handle.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(250);
    const after = await handle.evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);
    expect(mid).not.toBe(after);
  }
});

test('reference image opens in the left panel and never covers the puzzle', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/jigsaw/hard`);
  await waitForBoard(page);
  const toggle = page.getByRole('button', { name: 'Reference Image' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const ref = (await page.locator('.ref-body').boundingBox())!;
  const svg = (await page.locator('svg.jigsaw').boundingBox())!;
  const overlap = !(ref.x + ref.width <= svg.x || svg.x + svg.width <= ref.x || ref.y + ref.height <= svg.y || svg.y + svg.height <= ref.y);
  expect(overlap).toBe(false);
  await expect(page.locator('g.piece')).toHaveCount(25);
});

test('desktop: controls on the left, puzzle on the right, all on one screen', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones stack the controls above the puzzle');
  for (const mode of ['rotate', 'jigsaw', 'slide']) {
    await page.goto(`./#/play/${SQUARE}/${mode}/medium`);
    await waitForBoard(page);
    const side = (await page.locator('aside.side').boundingBox())!;
    const board = (await page.locator('.stage .board, .stage svg.jigsaw').first().boundingBox())!;
    expect(board.x).toBeGreaterThan(side.x + side.width - 1);
    const fits = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
    expect(fits).toBe(true);
    await expect(page.locator('aside.side').getByText('Florida Museum of Natural History')).toBeVisible();
    await expect(page.locator('aside.side').getByRole('button', { name: 'New puzzle' })).toBeVisible();
  }
});

test('rotate: turning every tile upright wins', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/rotate/easy`);
  await waitForBoard(page);
  const tiles = page.locator('.board .tile');
  const count = await tiles.count();
  for (let i = 0; i < count; i++) {
    const t = tiles.nth(i);
    for (let k = 0; k < 4; k++) {
      const label = (await t.getAttribute('aria-label')) ?? '';
      if (/fixed|turned 0 degrees/.test(label) || (await page.getByRole('dialog').isVisible())) break;
      await t.click();
    }
  }
  await expect(page.getByRole('dialog', { name: 'Puzzle solved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Solved!' })).toBeVisible();
});

/** Browser-side: where a piece's own cell center is drawn now, and where its home cell is, in screen px. */
const PIECE_GEOMETRY = String.raw`
  window.__piece = (g) => {
    const svg = document.querySelector('svg.jigsaw');
    const n = Math.round(Math.sqrt(document.querySelectorAll('g.piece').length));
    const cell = 1000 / n;
    const [x0, y0] = g.querySelector('path').getAttribute('d').match(/-?[\d.]+/g).map(Number);
    const toScreenFromPiece = (x, y) => new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
    const toScreenFromBoard = (x, y) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    const toBoard = (pt) => pt.matrixTransform(svg.getScreenCTM().inverse());
    const now = toScreenFromPiece(x0 + cell / 2, y0 + cell / 2);
    const home = toScreenFromBoard(x0 + cell / 2, y0 + cell / 2);
    const corner = toBoard(toScreenFromPiece(x0, y0));
    return { n, cell, x0, y0, now: [now.x, now.y], home: [home.x, home.y], corner: [Math.round(corner.x), Math.round(corner.y)], toScreenFromBoard };
  };
`;

async function drag(page: Page, from: number[], to: number[]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 5 });
  await page.mouse.up();
}

test('jigsaw: dragging every piece home wins', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/jigsaw/easy`);
  await waitForBoard(page);
  await page.waitForSelector('g.piece');
  await page.evaluate(() => document.querySelector('svg.jigsaw')!.scrollIntoView({ block: 'end' }));
  await page.addScriptTag({ content: PIECE_GEOMETRY });
  for (let guard = 0; guard < 40; guard++) {
    const move = await page.evaluate(() => {
      const g = [...document.querySelectorAll<SVGGElement>('g.piece')].reverse().find((e) => !e.classList.contains('placed'));
      if (!g) return null;
      const p = (window as any).__piece(g);
      return { from: p.now, to: [p.home[0] + 3, p.home[1] - 2] };
    });
    if (!move) break;
    await drag(page, move.from, move.to);
  }
  await expect(page.getByRole('dialog', { name: 'Puzzle solved' })).toBeVisible();
});

test('jigsaw: pieces click into any square and stay movable until solved', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/jigsaw/easy`);
  await waitForBoard(page);
  await page.waitForSelector('g.piece');
  await page.evaluate(() => document.querySelector('svg.jigsaw')!.scrollIntoView({ block: 'end' }));
  await page.addScriptTag({ content: PIECE_GEOMETRY });
  const placedBefore = await page.locator('g.piece.placed').count();

  // 1. Drop the top loose piece on a square that isn't its own and isn't a fixed blank.
  const move = await page.evaluate(() => {
    const pieces = [...document.querySelectorAll<SVGGElement>('g.piece')];
    const g = pieces.reverse().find((e) => !e.classList.contains('placed'))!;
    g.setAttribute('data-test', 'me');
    const p = (window as any).__piece(g);
    const fixed = pieces.filter((e) => e.classList.contains('locked')).map((e) => (window as any).__piece(e).corner.join(','));
    let target = [0, 0];
    for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
      const key = `${Math.round(c * p.cell)},${Math.round(r * p.cell)}`;
      if (Math.abs(c * p.cell - p.x0) + Math.abs(r * p.cell - p.y0) > 1 && !fixed.includes(key)) target = [c * p.cell, r * p.cell];
    }
    const to = p.toScreenFromBoard(target[0] + p.cell / 2 + 15, target[1] + p.cell / 2 + 10);
    return { from: p.now, to: [to.x, to.y], target: target.map(Math.round) };
  });
  await drag(page, move.from, move.to);
  await expect(page.locator('g.piece.placed')).toHaveCount(placedBefore);
  const corner = await page.evaluate(() => (window as any).__piece(document.querySelector('[data-test="me"]')).corner);
  expect(corner).toEqual(move.target); // clicked exactly into that square

  // 2. Put it in its own square: counted as placed...
  const home = await page.evaluate(() => { const p = (window as any).__piece(document.querySelector('[data-test="me"]')); return { from: p.now, to: p.home }; });
  await drag(page, home.from, home.to);
  await expect(page.locator('g.piece.placed')).toHaveCount(placedBefore + 1);

  // 3. ...but not locked: it can be picked up and moved off again.
  const off = await page.evaluate(() => {
    const svg = document.querySelector('svg.jigsaw')!.getBoundingClientRect();
    const p = (window as any).__piece(document.querySelector('[data-test="me"]'));
    return { from: p.now, to: [svg.right - 30, svg.bottom - 30] };
  });
  await drag(page, off.from, off.to);
  await expect(page.locator('g.piece.placed')).toHaveCount(placedBefore);
});

test('jigsaw: a piece dropped outside the board goes back to the tray', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/jigsaw/medium`);
  await waitForBoard(page);
  await page.waitForSelector('g.piece');
  await page.evaluate(() => document.querySelector('svg.jigsaw')!.scrollIntoView({ block: 'end' }));
  const piece = page.locator('g.piece:not(.locked)').last();
  const start = (await piece.boundingBox())!;
  const board = (await page.locator('rect.board-bg').boundingBox())!;
  // Drag it above the board (outside both the board and the tray) and let go.
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width / 2, Math.max(board.y - 60, 2), { steps: 6 });
  await page.mouse.up();
  const tray = (await page.locator('rect.tray').boundingBox())!;
  const end = (await piece.boundingBox())!;
  const cx = end.x + end.width / 2, cy = end.y + end.height / 2;
  expect(cx).toBeGreaterThan(tray.x);
  expect(cx).toBeLessThan(tray.x + tray.width);
  expect(cy).toBeGreaterThan(tray.y);
  expect(cy).toBeLessThan(tray.y + tray.height);
});

test('clicking a fixed missing-data tile explains why it does not move', async ({ page }) => {
  // c23-r21 has whole cells of missing data.
  await page.goto('./#/play/c23-r21/rotate/medium');
  await waitForBoard(page);
  const fixed = page.locator('.board .tile.locked').first();
  const before = await fixed.getAttribute('style');
  await fixed.click({ force: true }); // aria-disabled, but still clickable for the explanation
  await expect(page.getByRole('status').filter({ hasText: /fixed in place/ })).toBeVisible();
  expect(await fixed.getAttribute('style')).toBe(before);

  await page.goto('./#/play/c23-r21/jigsaw/medium');
  await waitForBoard(page);
  await page.evaluate(() => document.querySelector('svg.jigsaw')!.scrollIntoView({ block: 'end' }));
  const piece = page.locator('g.piece.locked').first();
  const box = (await piece.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('status').filter({ hasText: 'missing from the historical map' })).toBeVisible();
});

test('present view: switching mid-solve keeps the puzzle exactly as it was', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/rotate/medium`);
  await waitForBoard(page);
  const tile = page.locator('.board .tile:not(.locked)').first();
  await tile.click();
  const before = await page.locator('.board .tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  await page.getByRole('radio', { name: 'Present' }).check({ force: true });
  await expect(page).toHaveURL(/\/present$/);
  const bg = await tile.evaluate((e) => (e as HTMLElement).style.backgroundImage);
  expect(bg).toContain('present/');
  const after = await page.locator('.board .tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  expect(after).toEqual(before);
  await expect(page.locator('.stats strong').first()).toHaveText('1');

  // Jigsaw: positions unchanged, picture swapped.
  await page.getByRole('radio', { name: 'Historical' }).check({ force: true });
  await page.getByRole('radio', { name: 'Jigsaw' }).check({ force: true });
  await waitForBoard(page);
  const tf = () => page.locator('g.piece').evaluateAll((els) => els.map((e) => e.getAttribute('transform')));
  const t0 = await tf();
  await page.getByRole('radio', { name: 'Present' }).check({ force: true });
  expect(await tf()).toEqual(t0);
  expect(await page.locator('svg.jigsaw pattern image').first().getAttribute('href')).toContain('present/');
  await expect(page.getByText('Copernicus Sentinel').filter({ visible: true }).first()).toBeVisible();
});

test('mixed view: about half the pieces are present-day in every mode, and switching keeps progress', async ({ page }) => {
  const count = (urls: string[]) => ({ pres: urls.filter((u) => u.includes('present/')).length, hist: urls.filter((u) => u.includes('puzzles/')).length });
  // `hidden` = pieces not drawn (Slide's empty space), which may have been either kind.
  const half = (c: { pres: number; hist: number }, hidden = 0) => {
    const total = c.pres + c.hist + hidden;
    expect(c.pres).toBeGreaterThanOrEqual(Math.floor(total / 2) - hidden);
    expect(c.pres).toBeLessThanOrEqual(Math.ceil(total / 2));
  };
  const cssUrls = () => page.locator('.board .tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.backgroundImage));
  const svgUrls = () => page.locator('g.piece path.face').evaluateAll((els) => els.map((e) => {
    const id = e.getAttribute('fill')!.match(/#([^)]+)/)![1];
    return document.getElementById(id)!.querySelector('image')!.getAttribute('href')!;
  }));

  // Rotate (medium, 4x4): switch mid-solve, nothing moves.
  await page.goto(`./#/play/${SQUARE}/rotate/medium`);
  await waitForBoard(page);
  await page.locator('.board .tile:not(.locked)').first().click();
  const before = await page.locator('.board .tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  await page.getByRole('radio', { name: 'Mixed' }).check({ force: true });
  await expect(page).toHaveURL(/\/mixed$/);
  const rot = await cssUrls();
  expect(rot).toHaveLength(16);
  half(count(rot));
  expect(await page.locator('.board .tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform))).toEqual(before);
  await expect(page.locator('.stats strong').first()).toHaveText('1');
  // The mix stays the same when switching away and back.
  await page.getByRole('radio', { name: 'Present' }).check({ force: true });
  await page.getByRole('radio', { name: 'Mixed' }).check({ force: true });
  expect(await cssUrls()).toEqual(rot);

  // Slide, Jigsaw and Survey, hard.
  await page.getByRole('radio', { name: 'Hard' }).check({ force: true });
  await page.getByRole('radio', { name: 'Slide' }).check({ force: true });
  await waitForBoard(page);
  half(count(await cssUrls()), 1);
  for (const mode of ['Jigsaw', 'Survey']) {
    await page.getByRole('radio', { name: mode }).check({ force: true });
    await expect(page.locator('g.piece').first()).toBeVisible();
    const urls = await svgUrls();
    expect(urls.length).toBeGreaterThan(4);
    half(count(urls));
  }
  await expect(page).toHaveURL(/\/survey\/hard\/mixed$/);
});

test('mixed view: reference image starts halfway; unavailable imagery falls back', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/rotate/easy/mixed`);
  await waitForBoard(page);
  await page.getByRole('button', { name: 'Reference Image' }).click();
  await expect(page.locator('.ref-body input[type=range]')).toHaveValue('50');
  await page.goto('./#/play/c23-r21/rotate/easy/mixed');
  await page.reload();
  await waitForBoard(page);
  await expect(page.getByRole('radio', { name: 'Historical' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Mixed' })).toBeDisabled();
});

test('present view: reference image compares historical and present', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/slide/easy/present`);
  await waitForBoard(page);
  await page.getByRole('button', { name: 'Reference Image' }).click();
  const range = page.locator('.ref-body input[type=range]');
  await expect(range).toHaveValue('0'); // present view: divider starts at the left
  await range.fill('60');
  const clip = await page.locator('.ref-body img.historical').evaluate((e) => getComputedStyle(e).clipPath);
  expect(clip).toContain('40%');
});

test('present view: unavailable imagery falls back to historical with a notice', async ({ page }) => {
  // The test catalog has no present-day image for c23-r21.
  await page.goto('./#/play/c23-r21/rotate/easy/present');
  await waitForBoard(page);
  await expect(page.getByRole('status').filter({ hasText: "isn't available" })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Historical' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Present' })).toBeDisabled();
});

test('map page: Historical/Present toggle swaps the overview', async ({ page }) => {
  await page.goto('./#/map');
  const img = page.locator('svg.map image').first();
  await expect(img).toHaveAttribute('href', /overview\.webp/);
  await page.getByRole('radio', { name: 'Present' }).check({ force: true });
  await expect(img).toHaveAttribute('href', /overview-present\.webp/);
  await expect(page).toHaveURL(/#\/map\/present$/);
});

test('survey: pieces follow the survey lines, wrong spots bounce back, and solving wins', async ({ page }) => {
  await page.goto(`./#/play/${SQUARE}/survey/easy`);
  await page.locator('svg.survey g.piece').first().waitFor({ timeout: 15000 });
  await page.evaluate(() => document.querySelector('svg.survey')!.scrollIntoView({ block: 'end' }));
  await expect(page.locator('aside.side')).toContainText('townships');
  // Browser-side helper: a point inside a piece as drawn now, and the same point at home.
  await page.addScriptTag({ content: String.raw`
    window.__survey = (g) => {
      const svg = document.querySelector('svg.survey');
      const path = g.querySelector('path.face');
      const b = path.getBBox();
      let p = null;
      for (let i = 1; i < 12 && !p; i++) for (let j = 1; j < 12 && !p; j++) {
        const q = new DOMPoint(b.x + (b.width * i) / 12, b.y + (b.height * j) / 12);
        if (path.isPointInFill(q)) p = q;
      }
      const now = p.matrixTransform(g.getScreenCTM());
      const home = p.matrixTransform(svg.getScreenCTM());
      return { label: g.getAttribute('aria-label'), now: [now.x, now.y], home: [home.x, home.y] };
    };
  ` });
  const loose = () => page.evaluate(() => [...document.querySelectorAll('svg.survey g.piece')].reverse()
    .filter((e) => !e.classList.contains('placed')).map((e) => (window as any).__survey(e)));

  // Wrong place: drop the top loose piece far from its home, on another piece's place →
  // it goes back to its spot in the tray and nothing is placed.
  const all = await loose();
  if (all.length >= 2) {
    const placedBefore = await page.locator('svg.survey g.piece.placed').count();
    const far = all.slice(1).sort((a: any, b: any) =>
      Math.hypot(b.home[0] - all[0].home[0], b.home[1] - all[0].home[1]) - Math.hypot(a.home[0] - all[0].home[0], a.home[1] - all[0].home[1]))[0];
    await drag(page, all[0].now, far.home);
    await expect(page.locator('svg.survey g.piece.placed')).toHaveCount(placedBefore);
    const back = (await loose()).find((p: any) => p.label === all[0].label);
    expect(Math.hypot(back.now[0] - all[0].now[0], back.now[1] - all[0].now[1])).toBeLessThan(3);
  }
  for (let guard = 0; guard < 30; guard++) {
    const left = await loose();
    if (!left.length) break;
    await drag(page, left[0].now, [left[0].home[0] + 2, left[0].home[1] - 2]);
  }
  await expect(page.getByRole('dialog', { name: 'Puzzle solved' })).toBeVisible();
});

test('about dialog shows the credit', async ({ page }) => {
  await page.goto('./#/map');
  await page.getByRole('button', { name: 'About' }).click();
  await expect(page.getByRole('dialog').getByText('Florida Museum of Natural History')).toBeVisible();
  const glo = page.getByRole('dialog').getByRole('link', { name: 'General Land Office survey plats' });
  await expect(glo).toHaveAttribute('href', 'https://www.labins.org/survey_data/landrecords/landrecords.cfm');
  await expect(page.getByRole('dialog')).toContainText('AI for Human Ecology Lab');
});
