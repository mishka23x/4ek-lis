# Curated upstream reconciliation / Выборочное согласование с upstream

Source reviewed / Проверенный источник:

```text
365grain/4ek-lis
commit 188d246aad8740bfa18387b56eeafc7e4aa5da5a
Update TEMPLATE_VERSION and task descriptions
```

This document records which upstream changes were accepted into the hardened fork and which were intentionally rejected.

Этот документ фиксирует, какие изменения из upstream были приняты в усиленный форк, а какие были намеренно отклонены.

---

## English

### Accepted

1. **Category spelling correction**

```text
Георгафические (с привязкой к городам и странам):
→
Географические (с привязкой к городам и странам):
```

Reason: this is an unambiguous Russian spelling correction. It does not change category ID, task structure, analytics identity or user state compatibility.

2. **Clearer `#10фильмов` task description**

```text
— аналогично вышесказанному.
→
— отзывы, рецензии.
```

Reason: the new wording is self-contained and clearer. The task ID and LiveJournal hashtag/search link remain unchanged.

### Rejected

1. **Template version rollback**

```text
2026-11-22 → 2026-11-21
```

Reason: the change moves the release identifier backward. The two accepted edits are non-structural copy corrections: task/category IDs, counts, quota IDs and analytics schema remain unchanged. The hardened fork therefore keeps the current `2026-11-22` template version instead of creating version churn or accepting a backward identifier.

2. **`#10шоу` → `#10видео&аудио` rename as submitted upstream**

Reason: the upstream change changes the visible hashtag to `#10видео&аудио` but leaves its LiveJournal search URL targeting the encoded `#10шоу` tag. That creates a user-visible label/destination mismatch and makes historical/tag analytics less coherent. The hardened fork keeps the existing `#10шоу` task until the owner provides a consistent intended hashtag + matching URL.

### Integration mechanism

The accepted edits are applied by `template-corrections.js` before `checklist-core.js` and `analytics.js` start.

The correction layer:

- targets exact trusted category/task IDs;
- requires the exact reviewed old text before changing anything;
- records accepted/skipped/rejected decisions in `FOUR_FOX_UPSTREAM_RECONCILIATION` for debugging;
- does not change IDs, analytics counts, user progress keys or template version;
- is optional at runtime: if the correction file cannot load, the hardened baseline checklist still starts normally;
- is covered by `tests/check-upstream-reconciliation.mjs`.

This approach prevents a future upstream edit from silently applying a stale textual patch to the wrong content.

---

## Русский

### Принято

1. **Исправление опечатки в названии категории**

```text
Георгафические (с привязкой к городам и странам):
→
Географические (с привязкой к городам и странам):
```

Причина: это однозначное исправление русской орфографии. ID категории, структура заданий, аналитические идентификаторы и совместимость сохранённого прогресса не меняются.

2. **Более понятное описание задания `#10фильмов`**

```text
— аналогично вышесказанному.
→
— отзывы, рецензии.
```

Причина: новое описание самостоятельно понятно пользователю и не зависит от предыдущего пункта. ID задания и ссылка/хештег LiveJournal остаются прежними.

### Отклонено

1. **Откат версии шаблона**

```text
2026-11-22 → 2026-11-21
```

Причина: номер/идентификатор релиза движется назад. Два принятых изменения являются только исправлениями текста: ID заданий/категорий, количество элементов, quota ID и analytics schema не меняются. Поэтому форк сохраняет текущую версию `2026-11-22`, а не принимает обратное изменение версии.

2. **Переименование `#10шоу` → `#10видео&аудио` в текущем upstream-виде**

Причина: upstream меняет видимый хештег на `#10видео&аудио`, но сама ссылка LiveJournal продолжает вести на поиск по закодированному тегу `#10шоу`. Это создаёт несоответствие между подписью и фактическим назначением ссылки и ухудшает целостность исторической статистики по тегам. Форк сохраняет `#10шоу`, пока владелец не предоставит согласованную новую пару: хештег + соответствующий URL.

### Как выполнена интеграция

Принятые исправления применяются файлом `template-corrections.js` до запуска `checklist-core.js` и `analytics.js`.

Слой исправлений:

- работает только по точным доверенным ID категории/задания;
- меняет текст только если найдено именно то старое значение, которое было проверено;
- сохраняет audit-информацию о принятых/пропущенных/отклонённых изменениях в `FOUR_FOX_UPSTREAM_RECONCILIATION`;
- не меняет ID, analytics counts, ключи пользовательского прогресса или версию шаблона;
- является необязательным для запуска: если файл исправлений не загрузится, усиленный базовый чек-лист всё равно продолжит работать;
- проверяется тестом `tests/check-upstream-reconciliation.mjs`.

Такой подход не позволяет будущему изменению upstream случайно применить старую текстовую замену к уже другому контенту.
