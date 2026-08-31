import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function jsonBlock(html, id) {
  const expression = new RegExp(`<script[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`);
  const match = html.match(expression);
  assert.ok(match, `missing JSON block ${id}`);
  return JSON.parse(match[1]);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function checklistVisibleData(template) {
  return {
    title: template.title,
    coverImage: template.coverImage,
    quotas: template.quotas.map(quota => [quota.label, quota.unit]),
    categories: template.categories.map(category => [
      category.name,
      category.desc,
      category.tasks.map(task => task.text),
    ]),
  };
}

function faqVisibleData(template) {
  return {
    title: template.title,
    items: template.items.map(item => [item.q, item.a]),
  };
}

const checklistHtml = read('checklist.html');
const faqHtml = read('index.html');
const checklistJs = read('checklist.js');
const faqJs = read('faq.js');
const receiverJs = read('google-apps-script/Code.gs');
const manifest = JSON.parse(read('google-apps-script/appsscript.json'));
const checklistTemplate = jsonBlock(checklistHtml, 'templateData');
const faqTemplate = jsonBlock(faqHtml, 'faqTemplate');
const appConfig = jsonBlock(checklistHtml, 'appConfig');

assert.equal(checklistTemplate.quotas.length, 8, 'quota count changed');
assert.equal(checklistTemplate.categories.length, 21, 'category count changed');
const tasks = checklistTemplate.categories.flatMap(category => category.tasks);
assert.equal(tasks.length, 289, 'task count changed');
assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length, 'task ids must be unique');
assert.equal(new Set(checklistTemplate.categories.map(category => category.id)).size, checklistTemplate.categories.length, 'category ids must be unique');
assert.equal(new Set(checklistTemplate.quotas.map(quota => quota.id)).size, checklistTemplate.quotas.length, 'quota ids must be unique');
assert.ok(tasks.some(task => task.id === 'tsgby0gy'), 'legacy shared task id must remain on the first task');
assert.ok(tasks.some(task => task.id === 'tch0tarj'), 'split task id is missing');

assert.equal(
  sha256(JSON.stringify(checklistVisibleData(checklistTemplate))),
  'b65dac90a8e17ee48b085871b36516e57a0975c0bd9a787a415931bd618c883e',
  'checklist visible template copy/order/link data changed',
);
assert.equal(
  sha256(JSON.stringify(faqVisibleData(faqTemplate))),
  '431bec28630a26c250a0fa14dac68467b912a3a5c273fe3390e98b56b0305da2',
  'FAQ visible template copy/order/link data changed',
);

assert.equal(appConfig.templateVersion, '2026-11-22');
assert.equal(appConfig.finalStatsEnabled, false, 'final collection must be owner-activated');
assert.equal(appConfig.finalStatsUrl, '', 'repository must not ship a stale deployment URL');
assert.equal(manifest.runtimeVersion, 'V8');
assert.deepEqual(manifest.dependencies, {});

for (const [name, source] of [['checklist.js', checklistJs], ['faq.js', faqJs]]) {
  assert.doesNotMatch(source, /\.(?:innerHTML|outerHTML)\s*=/, `${name} contains an HTML parsing sink`);
  assert.doesNotMatch(source, /insertAdjacentHTML\s*\(/, `${name} contains an HTML parsing sink`);
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(/, `${name} contains dynamic code execution`);
  new vm.Script(source, { filename: name });
}

for (const [name, html] of [['checklist.html', checklistHtml], ['index.html', faqHtml]]) {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${name} contains an inline event handler`);
  for (const match of html.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/gi)) {
    assert.match(match[1], /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i, `${name} has an unprotected new-tab link`);
  }
}

const receiverContext = vm.createContext({ console });
vm.runInContext(receiverJs, receiverContext, { filename: 'Code.gs' });
const receiverTestResult = JSON.parse(vm.runInContext('JSON.stringify(runSelfTests())', receiverContext));
assert.equal(receiverTestResult.ok, true);
assert.equal(receiverTestResult.tests, 12);

console.log(JSON.stringify({
  ok: true,
  quotas: checklistTemplate.quotas.length,
  categories: checklistTemplate.categories.length,
  tasks: tasks.length,
  checklistVisibleHash: sha256(JSON.stringify(checklistVisibleData(checklistTemplate))),
  faqVisibleHash: sha256(JSON.stringify(faqVisibleData(faqTemplate))),
  receiverSelfTests: receiverTestResult.tests,
}, null, 2));
