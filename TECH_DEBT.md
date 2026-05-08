# SG Analytics Engine — Реестр технического долга

> Читается Claude в начале каждой сессии — сразу после PROJECT_STATUS.md.
> Каждый активный долг имеет маркер TODO_TEMP в коде.

---

## АКТИВНЫЕ ДОЛГИ

### TD-003 | Таймауты в orchestrator.ts
- **Файл:** worker/src/orchestrator.ts, константы KIMI_TIMEOUT_MS, JUDGE0_TIMEOUT_MS
- **Маркер в коде:** `// TODO_TEMP TD-003`
- **Текущее:** KIMI_TIMEOUT_MS=30000, JUDGE0_TIMEOUT_MS=15000
- **После TD-001:** Kimi K2.6 через Gonka будет быстрее — оценить нужно ли снижать таймауты
- **Триггер:** После 3 успешных тестов подряд с gonka-openai SDK
- **Влияние:** Минимальное — таймауты с запасом, не мешают работе

### TD-006 | @cosmjs/crypto security warning в gonka-openai SDK
- **Файл:** web-app/package.json
- **Текущее:** gonka-openai@0.2.6 зависит от @cosmjs/crypto@0.32.4 который содержит security bugs в elliptic библиотеке
- **Что сделать:** При выходе gonka-openai@0.3.x+ проверить changelog — они обещали перейти на @cosmjs/crypto@0.34.0+
- **Триггер:** Выход новой версии gonka-openai SDK
- **Влияние:** Потенциальный риск утечки приватного ключа — низкий при текущем использовании (сервер-сайд only)

### TD-007 | worker/src/kimi.ts — всё ещё использует Claude API вместо Gonka
- **Файл:** worker/src/kimi.ts
- **Маркер в коде:** `// TODO_TEMP TD-001`
- **Текущее:** Worker вызывает Claude API для итерационного агента. Vercel прокси /api/gonka готов и работает.
- **Что сделать:** Переписать kimi.ts — вместо Claude API вызывать Vercel прокси /api/gonka с моделью moonshotai/Kimi-K2.6
- **Триггер:** После подтверждения что /api/gonka возвращает корректные ответы (pipeline end-to-end тест)
- **Влияние:** Итерационный агент работает на Claude API — дороже и медленнее чем Kimi K2.6

---

## ЗАКРЫТЫЕ ДОЛГИ

### TD-000 | Piston API → Judge0 CE | Закрыто 2026-05-05
- Piston API закрылся 15.02.2026 → Judge0 CE (ce.judge0.com), без ключа

### TD-001 | Kimi K2.6 через gonka-openai SDK — Vercel прокси | Закрыто 2026-05-07
- Реализован Vercel прокси /api/gonka с правильной ECDSA подписью через gonka-openai SDK
- SDK устанавливается локально, совместим с Vercel Node.js runtime
- Подпись реализована через gonkaSignature() из SDK — двойное sha256 + low-S нормализация

### TD-002 | MAX_ITERATIONS | Закрыто 2026-05-06
- Было: MAX_ITERATIONS=5 из-за DO CPU лимита при медленном Claude
- Стало: MAX_ITERATIONS=10 — алгоритм Вариант 2 с ранним выходом решает проблему

### TD-004 | btoa/atob Unicode | Закрыто 2026-05-06
- btoa падал на кириллице → TextEncoder/TextDecoder

### TD-005 | thinking mode на DeepInfra | Закрыто диагностикой 2026-05-06
- Диагностика показала: DeepInfra не поддерживает thinking:disabled для Kimi
- Решение: переход на gonka-openai SDK
