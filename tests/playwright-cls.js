async page => {
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifts = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__cls += entry.value;
          window.__shifts.push({
            value: entry.value,
            startTime: entry.startTime,
            sources: entry.sources.map(source => ({
              node: source.node ? `${source.node.tagName.toLowerCase()}${source.node.id ? `#${source.node.id}` : ''}${source.node.className ? `.${String(source.node.className).trim().replace(/\s+/g, '.')}` : ''}` : null,
              previousRect: source.previousRect.toJSON(),
              currentRect: source.currentRect.toJSON()
            }))
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route('https://ic.pics.livejournal.com/**', async route => {
    await page.waitForTimeout(1500);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2459" height="432"></svg>'
    });
  });
  await page.goto('http://127.0.0.1:4174/checklist.html?v=cls', { waitUntil: 'domcontentloaded' });
  const before = await page.locator('#coverImageWrap').boundingBox();
  await page.waitForTimeout(1800);
  const after = await page.locator('#coverImageWrap').boundingBox();
  return page.evaluate(({ before, after }) => {
    const image = document.querySelector('#coverImageImg');
    return {
      before,
      after,
      cls: window.__cls,
      shifts: window.__shifts,
      complete: image.complete,
      naturalWidth: image.naturalWidth
    };
  }, { before, after });
}
