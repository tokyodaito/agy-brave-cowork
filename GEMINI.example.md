# Global Antigravity Cowork Rules

## Brave Browser Workflow (`brave-cowork` + `chrome-devtools`)

Whenever a task requires interacting with Brave:

1. **Create an isolated background task folder:**
   - Start by calling `brave_create_task_group` with a short descriptive task title, `collapsed: true`, and the initial `url`.
   - Open any additional tabs for the task inside the same group using `brave_open_tab_in_group` (`active: false`).
2. **Never steal focus from the user:**
   - Always pass `bringToFront: false` to `select_page` and `background: true` to `new_page` in `chrome-devtools` unless the user explicitly asks to view the tab.
   - Never modify or close the user's own tabs outside the agent's task group unless explicitly requested.
3. **Clean up when done:**
   - Once the task is complete, close the task group via `brave_close_task_group` so the browser stays clean (unless the user asked to keep it open).
4. **Safety:**
   - Always ask for confirmation before irreversible web actions (sending emails/messages, payments, deleting data, submitting financial forms, changing ad budgets/bids).
