# SG Analytics Engine — Реестр технического долга

> Читается Claude в начале каждой сессии — сразу после PROJECT_STATUS.md.
> Каждый активный долг имеет маркер TODO_TEMP в коде.

---

## АКТИВНЫЕ ДОЛГИ

### TD-001 | Kimi K2.6 через gonka-openai SDK — не подключён
- **Файл:** worker/src/kimi.ts
- **Маркер в коде:** `// TODO_TEMP TD-001`
- **Текущее:** Kimi K2.5 на DeepInfra — thinking mode не отключается, итерации 2+ возвращают пустой ответ
- **Причина проблемы:** DeepInfra игнорирует параметр `thinking: {type: "disabled"}`. Модель тратит все токены (max_tokens=1500) на reasoning_content, на реальный ответ не остаётся ничего.
- **Что сделать:**
  1. Установить inferenced CLI и сгенерировать ECDSA ключевую пару
  2. Добавить GONKA_PRIVATE_KEY в Cloudflare secrets
  3. `npm install gonka-openai` в worker/
  4. Переписать kimi.ts на gonka-openai TypeScript SDK
- **Почему gonka-openai:** SDK работает с Kimi K2.6 напрямую без ограничений DeepInfra. nodejs_compat=true уже включён в wrangler.toml. Запасной путь — @noble/curves для ручной ECDSA подписи.
- **Триггер:** Получить GONKA_PRIVATE_KEY через inferenced CLI
- **Влияние:** Pipeline не работает стабильно. Только итерация 1 иногда проходит, остальные — пустой ответ.

### TD-003 | Таймауты в orchestrator.ts
- **Файл:** worker/src/orchestrator.ts, константы KIMI_TIMEOUT_MS, JUDGE0_TIMEOUT_MS
- **Маркер в коде:** `// TODO_TEMP TD-003`
- **Текущее:** KIMI_TIMEOUT_MS=30000, JUDGE0_TIMEOUT_MS=15000
- **После TD-001:** Kimi K2.6 через Gonka будет быстрее — оценить нужно ли снижать таймауты
- **Триггер:** После 3 успешных тестов подряд с gonka-openai SDK
- **Влияние:** Минимальное — таймауты с запасом, не мешают работе

---

## ЗАКРЫТЫЕ ДОЛГИ

### TD-000 | Piston API → Judge0 CE | Закрыто 2026-05-05
- Piston API закрылся 15.02.2026 → Judge0 CE (ce.judge0.com), без ключа

### TD-002 | MAX_ITERATIONS | Закрыто 2026-05-06
- Было: MAX_ITERATIONS=5 из-за DO CPU лимита при медленном Claude
- Стало: MAX_ITERATIONS=10 — алгоритм Вариант 2 с ранним выходом решает проблему
- wrangler.toml: MAX_ITERATIONS="5" (в vars) — это только переменная окружения, не используется в логике
- В коде: константа MAX_ITERATIONS=10 в orchestrator.ts

### TD-004 | btoa/atob Unicode | Закрыто 2026-05-06
- btoa падал на кириллице → TextEncoder/TextDecoder

### TD-005 | thinking mode на DeepInfra | Закрыто диагностикой 2026-05-06
- Диагностика показала: DeepInfra не поддерживает thinking:disabled для Kimi
- Решение: переход на gonka-openai SDK (TD-001)
- Не использовать DeepInfra для Kimi K2.5/K2.6
