import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const corrections = read('template-corrections.js');
const loader = read('checklist.js');

new vm.Script(corrections, { filename: 'template-corrections.js' });
new vm.Script(loader, { filename: 'checklist.js' });
assert.match(loader, /template-corrections\.js/);
assert.match(loader, /checklist-core\.js/);
assert.match(loader, /analytics\.js/);

const block = {
  textContent: JSON.stringify({
    categories: [
      {
        id: 'tuje38v7',
        name: 'Георгафические (с привязкой к городам и странам):',
        tasks: []
      },
      {
        id: 'media',
        name: 'media',
        tasks: [
          {
            id: 'tnliu5g9',
            text: '[#10фильмов](https://www.livejournal.com/rsearch/?tags=%2310%D1%84%D0%B8%D0%BB%D1%8C%D0%BC%D0%BE%D0%B2&searchArea=post)  — аналогично вышесказанному.'
          },
          {
            id: 't3qxw63q',
            text: '[#10шоу](https://www.livejournal.com/rsearch/?tags=%2310%D1%88%D0%BE%D1%83&searchArea=post) — о теле- или сетевых каналах, передачах, шоу, которые вы смотрите.'
          }
        ]
      }
    ]
  })
};

const context = vm.createContext({
  console,
  document: {
    getElementById(id) {
      return id === 'templateData' ? block : null;
    }
  }
});
vm.runInContext(corrections, context, { filename: 'template-corrections.js' });

const result = JSON.parse(block.textContent);
const category = result.categories.find(item => item.id === 'tuje38v7');
const tasks = result.categories.flatMap(item => item.tasks || []);
const films = tasks.find(item => item.id === 'tnliu5g9');
const shows = tasks.find(item => item.id === 't3qxw63q');

assert.equal(category.name, 'Географические (с привязкой к городам и странам):');
assert.match(films.text, /отзывы, рецензии\.$/);
assert.match(shows.text, /^\[#10шоу\]/, 'established #10шоу label/link must remain aligned');
assert.doesNotMatch(shows.text, /#10видео&аудио/);

const audit = context.FOUR_FOX_UPSTREAM_RECONCILIATION;
assert.equal(audit.sourceCommit, '188d246aad8740bfa18387b56eeafc7e4aa5da5a');
assert.equal(audit.accepted.length, 2);
assert.equal(audit.rejected.length, 2);
assert.ok(audit.rejected.some(item => item.change.includes('2026-11-21')));
assert.ok(audit.rejected.some(item => item.change.includes('#10видео&аудио')));

console.log('Curated upstream reconciliation checks passed.');
