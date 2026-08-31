async page => {
  const template = await page.evaluate(() => JSON.parse(document.querySelector('#templateData').textContent));
  const tasks = {};
  for (const category of template.categories) {
    for (const task of category.tasks) {
      tasks[task.id] = {
        checked: true,
        links: Array.from({ length: 10 }, (_, index) => `https://example.com/${task.id}/${index}`),
        marks: { liked: false }
      };
    }
  }
  const state = JSON.stringify({
    schemaVersion: 2,
    templateVersion: '2026-11-22',
    progress: {
      quotaTargets: {},
      tasks,
      collapsed: {},
      milestones: { global: 2890, cats: {}, tasks: {} }
    },
    settings: { nick: 'large-state' }
  });
  await page.context().addInitScript(raw => localStorage.setItem('ljMarathonState_v1', raw), state);

  const navigationStart = Date.now();
  await page.goto('http://127.0.0.1:4174/checklist.html?v=large-state', { waitUntil: 'domcontentloaded' });
  const navigationMs = Date.now() - navigationStart;
  await page.waitForTimeout(250);

  const timings = await page.evaluate(() => {
    const measure = callback => {
      const start = performance.now();
      callback();
      return performance.now() - start;
    };
    const checkbox = document.querySelector('input[type=checkbox]');
    const input = document.querySelector('input[data-link]');
    const toggle = document.querySelector('.cat-toggle');
    const inputMs = measure(() => {
      input.value = 'https://example.com/large-state-updated';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const focusoutMs = measure(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    const checkboxMs = measure(() => checkbox.click());
    const toggleMs = measure(() => toggle.click());
    return {
      checkboxMs,
      inputMs,
      focusoutMs,
      toggleMs,
      elements: document.querySelectorAll('*').length,
      urlInputs: document.querySelectorAll('input[type=url]').length,
      storageChars: localStorage.getItem('ljMarathonState_v1').length,
      progress: document.querySelector('#progressLabel').textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  return { navigationMs, ...timings };
}
