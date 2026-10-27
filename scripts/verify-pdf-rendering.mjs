import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from '@playwright/test';
import { build } from 'vite';

// Exercise the real component, worker, runtime assets, and Hosting CSP with
// local fixtures. No PDFs or test harness are included in the deployed site.
const repo = fileURLToPath(new URL('../', import.meta.url));
const fixtures = process.argv.slice(2).map(file => path.resolve(file));
assert.ok(fixtures.length, 'Pass one or more PDF fixture paths.');
const output = await mkdtemp(path.join(tmpdir(), 'pdf-render-regression-'));
await build({
  root: path.join(repo, 'app'),
  configFile: path.join(repo, 'app/vite.config.ts'),
  logLevel: 'warn',
  build: {
    outDir: path.join(output, 'dist'),
    rolldownOptions: { input: path.join(repo, 'app/tests/pdf-rendering/index.html') },
  },
});
const firebaseConfig = JSON.parse(await readFile(path.join(repo, 'firebase.json'), 'utf8'));
const csp = firebaseConfig.hosting.headers.find(rule => rule.source === '**'
  && rule.headers.some(header => header.key === 'Content-Security-Policy'))
  .headers.find(header => header.key === 'Content-Security-Policy').value;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const requested = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(output, 'dist', `.${requested}`);
  if (!file.startsWith(`${path.join(output, 'dist')}${path.sep}`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const browserName = process.env.PDF_TEST_BROWSER || 'chromium';
  assert.ok(['chromium', 'firefox'].includes(browserName), 'Unknown PDF test browser');
  const deviceScaleFactor = Number(process.env.PDF_TEST_DPR || 1);
  browser = await (browserName === 'firefox' ? firefox : chromium).launch();
  console.log(`PDF renderer: ${browserName}, device scale ${deviceScaleFactor}`);
  for (const [index, fixture] of fixtures.entries()) {
    const page = await browser.newPage({ viewport: { width: 800, height: 1100 }, deviceScaleFactor });
    const errors = [];
    const assets = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/Unable to decode|Cannot load|Ensure that|Dependent image|Refused to|violates.*policy|Could not render/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    page.on('response', response => {
      if (response.url().includes('/pdfjs/')) {
        assets.add(new URL(response.url()).pathname);
        if (!response.ok()) errors.push(`Asset ${response.status()}: ${response.url()}`);
      }
    });
    await page.route('**/*', route => route.request().url().startsWith(origin)
      ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/pdf-rendering/index.html`);
    await page.getByLabel('PDF fixture').setInputFiles(fixture);
    const document = page.getByRole('document');
    const hashes = new Map();
    let renderedPages = 0;
    const verifyPage = async () => {
      await page.waitForFunction(() => document.querySelector('[role="document"]')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.getByRole('alert').count(), 0, 'PDF render reported an error');
      const canvas = document.getByRole('img');
      const softwareCanvas = await canvas.evaluate(node => node.getContext('2d').getContextAttributes().willReadFrequently);
      assert.equal(softwareCanvas, true, 'PDF canvas must retain the PDF.js software-rendering preference');
      const label = `${page.viewportSize().width}px-${await canvas.getAttribute('aria-label')}`;
      const pixels = await canvas.evaluate(node => node.toDataURL());
      if (hashes.has(label)) assert.ok(pixels === hashes.get(label), `${label} changed on revisit`);
      else {
        hashes.set(label, pixels);
        await writeFile(path.join(output, `fixture-${index + 1}-page-${hashes.size}.png`),
          Buffer.from(pixels.split(',')[1], 'base64'));
      }
      renderedPages++;
    };
    for (const width of [800, 1440, 1920, 800, 1920]) {
      await page.setViewportSize({ width, height: 1100 });
      // Allow ResizeObserver and React to commit before waiting for rendering.
      await page.waitForTimeout(200);
      await verifyPage();
      for (let cycle = 0; cycle < 2; cycle++) {
        while (await page.getByRole('button', { name: 'Next PDF page' }).isEnabled()) {
          await page.getByRole('button', { name: 'Next PDF page' }).click();
          await verifyPage();
        }
        while (await page.getByRole('button', { name: 'Previous PDF page' }).isEnabled()) {
          await page.getByRole('button', { name: 'Previous PDF page' }).click();
          await verifyPage();
        }
      }
    }
    assert.deepEqual(errors, [], 'PDF runtime errors');
    console.log(`${path.basename(fixture)}: ${hashes.size} page/size combinations, ${renderedPages} renders, identical pixels on revisits; ${assets.size} runtime assets loaded.`);
    console.log([...assets].join('\n'));
    await page.close();
  }
  console.log(`PDF screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
