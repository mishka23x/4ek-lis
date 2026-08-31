'use strict';

(() => {
  const block = document.getElementById('faqTemplate');
  if (!block) throw new Error('Missing FAQ template');
  const template = JSON.parse(block.textContent);
  if (!template || typeof template !== 'object' || !Array.isArray(template.items)) {
    throw new Error('Invalid FAQ template');
  }

  function parseHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch (_) {
      return null;
    }
  }

  function richTextTokens(value) {
    const source = String(value || '');
    const expression = /(\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    const tokens = [];
    let cursor = 0;
    let match;
    while ((match = expression.exec(source)) !== null) {
      if (match.index > cursor) tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
      if (match[2] !== undefined) tokens.push({ type: 'bold', value: match[2] });
      else tokens.push({ type: 'link', value: match[3], url: match[4], raw: match[0] });
      cursor = expression.lastIndex;
    }
    if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
    return tokens;
  }

  function appendRichText(container, value) {
    for (const token of richTextTokens(value)) {
      if (token.type === 'link') {
        const url = parseHttpUrl(token.url);
        if (!url) {
          container.appendChild(document.createTextNode(token.raw));
          continue;
        }
        const anchor = document.createElement('a');
        anchor.href = url.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = token.value;
        if (token.value.trim().startsWith('#')) anchor.className = 'tag-link';
        container.appendChild(anchor);
      } else if (token.type === 'bold') {
        const strong = document.createElement('b');
        strong.textContent = token.value;
        container.appendChild(strong);
      } else {
        container.appendChild(document.createTextNode(token.value));
      }
    }
  }

  document.getElementById('faqTitle').textContent = `🦊 ${template.title || 'ЧАВО'}`;
  const list = document.getElementById('faqList');
  const fragment = document.createDocumentFragment();
  template.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.q !== 'string' || typeof item.a !== 'string') {
      throw new Error('Invalid FAQ item');
    }
    const details = document.createElement('details');
    details.className = 'faq-item';
    details.open = index === 0;
    const summary = document.createElement('summary');
    appendRichText(summary, item.q);
    const answer = document.createElement('div');
    answer.className = 'faq-answer';
    appendRichText(answer, item.a);
    details.append(summary, answer);
    fragment.appendChild(details);
  });
  if (!template.items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'вопросов пока нет';
    fragment.appendChild(empty);
  }
  list.replaceChildren(fragment);
})();
