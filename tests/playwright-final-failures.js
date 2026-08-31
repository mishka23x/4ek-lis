async page => {
  const endpoint = 'https://script.google.com/macros/s/test-failure-deployment/exec';
  const payloads = [];
  let attempt = 0;

  await page.route('**/checklist.html', async route => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original
      .replace('"finalStatsEnabled": false', '"finalStatsEnabled": true')
      .replace('"finalStatsUrl": ""', `"finalStatsUrl": "${endpoint}"`);
    await route.fulfill({ response, body });
  });
  await page.route(endpoint, async route => {
    attempt += 1;
    payloads.push(JSON.parse(route.request().postData()));
    if (attempt === 1) {
      await route.fulfill({ status: 503, contentType: 'text/html', body: 'temporary failure' });
      return;
    }
    await page.waitForTimeout(20000);
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    } catch (_) {
      // The client should have aborted the request at 15 seconds.
    }
  });

  await page.goto('http://127.0.0.1:4174/checklist.html');
  const task = page.locator('.task-card').first();
  await task.locator('input[type=checkbox]').check();
  await task.locator('input[type=url]').first().fill('https://example.com/failure-test');
  await task.locator('input[type=url]').first().blur();
  await page.waitForTimeout(350);

  await page.locator('#sendFinalBtn').click();
  await page.waitForFunction(() => document.querySelector('#finalSendStatus').textContent.startsWith('✗'));
  const invalidResponseStatus = await page.locator('#finalSendStatus').textContent();

  await page.locator('#sendFinalBtn').click();
  await page.waitForFunction(
    () => document.querySelector('#finalSendStatus').textContent.startsWith('✗'),
    null,
    { timeout: 18000 }
  );
  const timeoutStatus = await page.locator('#finalSendStatus').textContent();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('ljMarathonState_v1')).progress.finalPending);

  return {
    attempts: payloads.length,
    sameSubmissionId: payloads.length === 2 && payloads[0].submissionId === payloads[1].submissionId,
    pendingRetained: pending && pending.submissionId === payloads[0].submissionId,
    invalidResponseStatus,
    timeoutStatus
  };
}
