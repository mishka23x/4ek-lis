async page => {
  await page.setViewportSize({ width: 320, height: 700 });

  const linkedTask = page.locator('.task-card:has(.task-text a)').first();
  const linkedCheckbox = linkedTask.locator('input[type=checkbox]');
  const beforeLinkClick = await linkedCheckbox.isChecked();
  const taskLink = linkedTask.locator('.task-text a').first();
  await taskLink.evaluate(anchor => {
    anchor.addEventListener('click', event => event.preventDefault(), { once: true });
  });
  await taskLink.click();
  const afterLinkClick = await linkedCheckbox.isChecked();

  const task = page.locator('.task-card').first();
  const taskCheckbox = task.locator('input[type=checkbox]');
  if (!await taskCheckbox.isChecked()) await taskCheckbox.check();

  for (let index = 0; index < 20; index += 1) {
    const inputs = task.locator('input[type=url]');
    await inputs.last().fill(`https://example.com/${index}/${'very-long-segment-'.repeat(20)}`);
  }

  const focusedInput = task.locator('input[type=url]').nth(10);
  await focusedInput.focus();
  const category = task.locator('xpath=ancestor::section[contains(@class,"category-card")]');
  const toggle = category.locator('.cat-toggle');
  await toggle.click();
  const collapsedHidden = await category.locator('.cat-body').getAttribute('hidden') !== null;
  await toggle.click();
  await page.waitForTimeout(450);

  return page.evaluate(({ beforeLinkClick, afterLinkClick, collapsedHidden }) => {
    const firstUrl = document.querySelector('input[type=url]');
    return {
      linkClickDidNotToggle: beforeLinkClick === afterLinkClick,
      collapsedHidden,
      taskLinkInputs: document.querySelectorAll('.task-card input[type=url]').length,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      urlInputFontSize: firstUrl ? getComputedStyle(firstUrl).fontSize : null,
      footerHeight: document.querySelector('footer.progress').getBoundingClientRect().height,
      bodyPaddingBottom: getComputedStyle(document.body).paddingBottom
    };
  }, { beforeLinkClick, afterLinkClick, collapsedHidden });
}
