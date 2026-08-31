async page => {
  const endpoint = 'https://script.google.com/macros/s/test-deployment/exec';
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(attempt === 1 ? { ok: false, reason: 'temporary_test_failure' } : { ok: true, duplicate: false })
    });
  });

  await page.goto('http://127.0.0.1:4174/checklist.html');
  await page.locator('#nickInput').fill('Тестовый ник');
  const firstTask = page.locator('.task-card').first();
  await firstTask.locator('input[type=checkbox]').check();
  await firstTask.locator('input[type=url]').first().fill('https://example.com/final');
  await firstTask.locator('input[type=url]').first().blur();
  await page.waitForTimeout(350);

  const wrapperHidden = await page.locator('#finalSendWrap').getAttribute('hidden') !== null;
  await page.locator('#sendFinalBtn').click();
  await page.waitForFunction(() => document.querySelector('#finalSendStatus').textContent.startsWith('✗'));
  const rejectedStatus = await page.locator('#finalSendStatus').textContent();
  const pendingAfterFailure = await page.evaluate(() => JSON.parse(localStorage.getItem('ljMarathonState_v1')).progress.finalPending);

  await page.locator('#sendFinalBtn').click();
  await page.waitForFunction(() => document.querySelector('#finalSendStatus').textContent.startsWith('✓'));
  const successStatus = await page.locator('#finalSendStatus').textContent();
  const savedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('ljMarathonState_v1')).progress);

  return {
    wrapperVisible: !wrapperHidden,
    attempts: payloads.length,
    sameSubmissionId: payloads.length === 2 && payloads[0].submissionId === payloads[1].submissionId,
    payloadKeys: payloads.map(payload => Object.keys(payload).sort()),
    containsDetailedUserData: payloads.some(payload => 'links' in payload || 'tasks' in payload || 'rows' in payload || 'token' in payload),
    checkedCount: payloads[0] && payloads[0].checkedCount,
    pendingMatchesFirstPayload: pendingAfterFailure && pendingAfterFailure.submissionId === payloads[0].submissionId,
    pendingClearedAfterSuccess: !savedProgress.finalPending,
    sentIdMatchesPayload: savedProgress.finalSent && savedProgress.finalSent.submissionId === payloads[0].submissionId,
    rejectedStatus,
    successStatus
  };
}
