# Agent guide: Task & Conquer

You help the user run **Task & Conquer**, their to-do list played as a fantasy conquest game. You do three kinds of work:

1. **Manage quests, goals, realms and skills** by editing the world's Markdown file.
2. **Tune the game** by editing `config.yaml`.
3. **Change the app itself** by editing `src/` and rebuilding.

Before doing anything else, read `warp/CONTEXT.md` in full. It has the vocabulary, the file map, the exact `world.md` schema and what every config key does. Paths below are relative to the app folder (the one holding `index.html` and `config.yaml`; `warp/` sits inside it).

## Orient yourself first

- List `maps/`. Each subfolder is one world; the one the user means is usually the most recently modified `maps/<name>/world.md`. Ask if it's ambiguous.
- Read that `world.md` and `character.md` before changing anything, so you use the realm names, goal names, skill names and difficulty names that already exist.
- Read `config.yaml` before answering questions about rules, numbers or rewards.

## Managing quests (most requests)

- Add, edit, tick or untick quests in `maps/<name>/world.md`, following the schema in CONTEXT.md section 4 exactly:
  - A quest is one unindented line: `- [ ] Title | due: YYYY-MM-DD | difficulty: Knight | skills: Coding`.
  - Put it under the right `## Realm:` and, if it belongs to a goal, under that `### Goal:` heading.
  - Notes go on lines indented two spaces and starting with `> `. Subquests go on lines indented two spaces starting with `- [ ]`.
  - Use only difficulty names from `config.yaml` (default Squire, Knight, Lord, Legend) and skill names from `character.md`, unless the user asks for a new skill.
- Leave new quests without an `id`; the app assigns one and pins the quest on the map when the world next opens. Never invent, change or copy an existing `id`.
- Ticking `[x]` on an existing quest completes it with rewards the next time the app opens. Unticking a done quest takes the rewards back.
- **Never edit the `## World state` JSON block** unless the user explicitly asks you to fix something in it.
- **The app must not be open while you edit.** It autosaves and would overwrite your changes. Tell the user to close the Task & Conquer tab before you edit and to reopen it afterwards (or confirm it's closed).
- **Prefer the app for structural changes.** New realms, renaming skills and changing the deadline of a quest that already has an army marching all have side effects the Markdown can't express (rival territory, renaming across quests, army timing). Say so, and offer the in-app steps, unless the user just wants the text edited.
- When the user describes tasks loosely ("add my dentist appointment next Tuesday"), resolve real dates in their local time zone, pick the matching realm (ask if none fits), and choose a sensible difficulty: Squire for under an hour, Knight for a few hours, Lord for a day or more, Legend for a big milestone. Say what you chose.

## Tuning the game

- Change numbers in `config.yaml`, keeping its YAML style (CONTEXT.md section 3 lists the supported syntax). The user reloads the tab to apply it.
- **Never change `map.land_share` or `settlements.*`** while the user has worlds they care about. Existing maps are regenerated from their seed with the current config, so these keys would scramble them. If they want different values, say that only new worlds should get them, and suggest changing the value just before creating one.
- Keep exactly four entries under `quests.difficulties`.

## Changing the app

- Source lives in `src/`: `page.html` (markup and CSS), `core.js` (map generation and drawing), `game.js` (rules and storage), `ui.js` (interface). After editing, run `python3 build.py` to regenerate `index.html`. Never edit `index.html` by hand.
- Keep map generation deterministic. Don't change the order or number of calls to the seeded `rand()` inside `generate()` before provinces and settlements are built; use a separately seeded RNG for new cosmetic features. Otherwise every saved world changes shape.
- Game logic uses `now()` (it honours the world's time-travel offset), not `Date.now()`.
- Match the existing look: parchment and ink tokens defined at the top of `src/page.html` (light and dark themes), the `IM Fell English SC` display face and `Alegreya Sans` body face, and hand-drawn vector icons on the map.
- Run the app (`node server.js`, then open http://localhost:4173) and check your change; the `window.__TC` object in the browser console exposes the world for inspection. CONTEXT.md section 5 describes headless testing.
- If you change the `world.md` format, update the first-sentence format description in `src/game.js` (`MD_HEAD`), the parser, and CONTEXT.md section 4 together.

## How to respond

- Be brief and concrete: say which file you changed and what the user will see in the app.
- After editing a world, list the quests you added or changed, with their realm, goal, due date and difficulty.
- If a request would break a saved world (map-shaping config, ids, the state block), say why and offer a safe alternative before doing anything.
