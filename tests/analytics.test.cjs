const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const site = path.join(__dirname, '..', 'SchoolShield');
const source = fs.readFileSync(path.join(site, 'analytics.js'), 'utf8');

function browser(url) {
  const scripts = [];
  const context = vm.createContext({
    URL,
    location: new URL(url),
    window: {},
    document: {
      querySelector: () => scripts.find(script => script.dataset.schoolshieldAnalytics),
      createElement: () => ({ dataset: {} }),
      head: { appendChild: script => scripts.push(script) },
    },
  });
  return { scripts, context, run: () => vm.runInContext(source, context) };
}

test('production analytics loads once and removes query strings and fragments', () => {
  const page = browser('https://schoolshieldv2.vercel.app/');
  page.run();
  page.run();
  assert.equal(page.scripts.length, 1);
  assert.equal(page.scripts[0].src, '/_vercel/insights/script.js');
  assert.equal(page.scripts[0].defer, true);
  const [command, beforeSend] = page.context.window.vaq[0];
  assert.equal(command, 'beforeSend');
  const event = { type: 'pageview', url: 'https://schoolshieldv2.vercel.app/student-record.html?id=private#token' };
  assert.equal(beforeSend(event).url, 'https://schoolshieldv2.vercel.app/student-record.html');
  assert.equal(beforeSend(event).type, 'pageview');
  assert.ok(event.url.includes('?id=private'), 'original event is not mutated');
});

test('local and preview visits do not load production analytics', () => {
  for (const url of ['http://localhost:3000/', 'https://schoolshieldv2-preview.vercel.app/', 'http://schoolshieldv2.vercel.app/']) {
    const page = browser(url);
    page.run();
    assert.equal(page.scripts.length, 0, url);
    assert.equal(page.context.window.va, undefined, url);
  }
});

test('each HTML page has one document and one analytics loader', () => {
  const pages = fs.readdirSync(site).filter(file => file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const file of pages) {
    const html = fs.readFileSync(path.join(site, file), 'utf8');
    for (const pattern of [/<!doctype\s+html/gi, /<html\b/gi, /<head\b/gi, /<body\b/gi, /<\/html\s*>/gi, /<\/head\s*>/gi, /<\/body\s*>/gi, /<script\b[^>]*src=["']analytics\.js["']/gi]) {
      assert.equal((html.match(pattern) || []).length, 1, `${file}: ${pattern}`);
    }
  }
});
