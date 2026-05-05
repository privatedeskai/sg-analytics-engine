# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst
**Обновлено:** 2026-05-05
**Сессия:** 2

---

## Репозиторий
- GitHub: https://github.com/privatedeskai/sg-analytics-engine
- Папка: C:\Users\dorof\Documents\sg-analytics-engine
- Ветка: main

---

## КРИТИЧНО — Команды запуска и деплоя

```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine\worker
npx wrangler deploy
cd web-app ; npx vercel --prod --yes ; cd ..
git add . ; git commit -m "checkpoint: [описание]" ; git push
```

---

## Живые URL
- Worker: https://sg-analytics-engine.dorofeevov17.workers.dev
- Web App: https://web-app-liart-gamma.vercel.app

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ✅ | github.com/privatedeskai/sg-analytics-engine |
| Worker деплой | ✅ | https://sg-analytics-engine.dorofeevov17.workers.dev |
| E2B клиент | ✅ | Piston API — работает |
| Kimi/Claude клиент | ⚠️ | kimi.ts сломан — синтаксис строки 41 |
| Оркестратор | ✅ | orchestrator.ts — использует CLAUDE_API_KEY |
| Secrets | ✅ | E2B_API_KEY, DEEPINFRA_API_KEY, CLAUDE_API_KEY |
| KV namespace | ✅ | id: 5884f641df3441deb36344e8be2e5ab6 |
| CSV загрузчик | ⬜ | |
| Output formatter | ⬜ | |
| Базовый UI | ⬜ | |
| Stripe биллинг | ⬜ | |

---

## КРИТИЧНО — Что сломано и что делать в начале сессии 3

### Проблема 1: kimi.ts строка 41 — синтаксическая ошибка
Строка выглядит так (НЕПРАВИЛЬНО):
x-api-key": this.apiKey, "anthropic-version": "2023-06-01",
Должна выглядеть так (ПРАВИЛЬНО):
"x-api-key": this.apiKey, "anthropic-version": "2023-06-01",
Починить через GitHub:
https://github.com/privatedeskai/sg-analytics-engine/blob/main/worker/src/kimi.ts

### Проблема 2: git не синхронизирован с GitHub
Выполнить в начале сессии:
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine ; git pull
```

### После починки — задеплоить:
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler deploy
```

### После деплоя — протестировать:
```powershell
$csv = Get-Content "..\test-data.csv" -Raw ; $body = @{ question = "Какая категория товаров самая прибыльная?"; csvContent = $csv; userId = "test-user"; language = "ru" } | ConvertTo-Json ; $response = Invoke-RestMethod -Uri "https://sg-analytics-engine.dorofeevov17.workers.dev/analyze" -Method POST -ContentType "application/json" -Body $body ; Write-Host $response.sessionId
```

---

## ВАЖНО — Временное решение (вернуть после отладки)
- Сейчас используется Claude API вместо Kimi K2.6
- После отладки: пополнить баланс на https://deepinfra.com → вернуть в kimi.ts baseUrl на DeepInfra и модель на Kimi-K2-Instruct

---

## История сессий

### Сессия 0 — 2026-05-04
Разработана концепция, выбран стек.

### Сессия 1 — 2026-05-04
Worker задеплоен, все secrets добавлены, файлы созданы.

### Сессия 2 — 2026-05-05
- Добавлен .gitignore для node_modules
- E2B переключён на Piston API (E2B SDK несовместим с CF Workers)
- Claude API подключён временно вместо Kimi (нет баланса DeepInfra)
- kimi.ts содержит синтаксическую ошибку в строке 41 — починить в начале сессии 3
  
