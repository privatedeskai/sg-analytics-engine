## 0. СТАРТ СЕССИИ — ОБЯЗАТЕЛЬНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ

Claude выполняет ЭТО в начале каждой сессии до любой работы:

1. Прочитать PROJECT_STATUS.md с диска через MCP filesystem
2. Прочитать TECH_DEBT.md с диска через MCP filesystem
3. Сообщить Олегу: текущий статус + список активных долгов (TD-XXX)
4. Только после этого — приступать к задачам

### Олег выполняет ЭТИ команды в начале каждой сессии:

**Шаг 1 — проверить аккаунт и secrets:**
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler whoami ; npx wrangler secret list
```

**Если secret list вернул `[]` (пустой)** — восстановить secrets из файла на OneDrive:
```powershell
npx wrangler secret put GONKA_PRIVATE_KEY
```
```powershell
npx wrangler secret put GONKA_ADDRESS
```
```powershell
npx wrangler secret put CLAUDE_API_KEY
```

**Шаг 2 — синхронизировать код и пакеты:**
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine ; git pull ; cd worker ; npm ci ; cd ..\web-app ; npm ci ; cd ..
```

**Шаг 3 — только после этого начинать работу.**
