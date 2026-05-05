# SG Analytics Engine — Реестр технического долга

> Читается Claude в начале каждой сессии — сразу после PROJECT_STATUS.md.
> Каждый активный долг имеет маркер TODO_TEMP в коде.

---

## АКТИВНЫЕ ДОЛГИ

### TD-001 | Claude API вместо Kimi K2.6
- **Файл:** worker/src/kimi.ts, строки с baseUrl и model
- **Маркер в коде:** `// TODO_TEMP TD-001`
- **Текущее:** claude-sonnet-4-5 через Anthropic API
- **Вернуть:** baseUrl = 'https://api.deepinfra.com/v1/openai', model = 'moonshotai/Kimi-K2-Instruct'
- **Триггер возврата:** Пополнить баланс DeepInfra (~$10) на deepinfra.com → проверить DEEPINFRA_API_KEY в Cloudflare secrets
- **Влияние:** Стоимость в 20 раз выше при масштабе

### TD-002 | MAX_ITERATIONS = 3 вместо 10
- **Файлы:** worker/wrangler.toml (MAX_ITERATIONS), worker/src/orchestrator.ts (Math.min cap)
- **Маркер в коде:** `// TODO_TEMP TD-002`
- **Текущее:** Жёсткий cap на 3 итерации
- **Вернуть:** wrangler.toml → MAX_ITERATIONS = "10"; orchestrator.ts → убрать Math.min, вернуть `req.maxIterations || 10`
- **Триггер возврата:** После подтверждения стабильной работы pipeline (3 успешных теста подряд)
- **Влияние:** Качество анализа снижено — 3 итерации вместо 10

### TD-003 | Таймауты в orchestrator.ts
- **Файл:** worker/src/orchestrator.ts, метод withTimeout
- **Маркер в коде:** `// TODO_TEMP TD-003`
- **Текущее:** Kimi 20 сек, Judge0 15 сек, summary 25 сек
- **Вернуть:** Оценить после стабилизации — возможно оставить как есть (хорошая практика)
- **Триггер возврата:** После 3 успешных тестов — решить увеличить ли лимиты
- **Влияние:** При медленном Judge0 или Claude API анализ может обрываться

---

## ЗАКРЫТЫЕ ДОЛГИ

### TD-000 | Piston API → Judge0 CE | Закрыто 2026-05-05
- **Было:** Piston API (emkc.org) — закрылся 15.02.2026
- **Стало:** Judge0 CE (ce.judge0.com) — без ключа, без карты, финальное решение

---

## ФОРМАТ ДОБАВЛЕНИЯ НОВОГО ДОЛГА

```
### TD-XXX | [название]
- **Файл:** [путь и строки]
- **Маркер в коде:** `// TODO_TEMP TD-XXX`
- **Текущее:** [что сейчас]
- **Вернуть:** [точные изменения]
- **Триггер возврата:** [когда/при каком условии]
- **Влияние:** [что страдает пока не исправлено]
```
