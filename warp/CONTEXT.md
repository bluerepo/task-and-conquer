# Task & Conquer: context for agents

Everything an agent needs to understand, configure and extend this app. Paths are relative to the app folder (the folder that holds `index.html`).

## 1. What the app is

Task & Conquer is a to-do list played as a strategy game. Every task is a **quest** pinned to a **province** on a procedurally generated fantasy continent. Finishing quests conquers land, earns gold and raises your character's skills. Deadlines and neglected goals send rival armies to besiege your settlements.

It is a single-page web app with no dependencies, plus a tiny local Node server that stores everything as Markdown.

### Key functionality

- **Setup first** (`src/ui.js`, "setup" section). You name the map, kingdom and castle, list your realms, skills and goals, and pick a province count. Then the map is generated, and you choose your seat (main castle) before you begin.
- **Procedural map** (`src/core.js`, `generate()`). It builds terrain, biomes, rivers, lakes, provinces, settlements and roads, plus the drawn icons: mountains, forests, an ashlands volcano region, a crater-wastes region, a wind rose, whales, serpents, waves, whirlpools and reefs. The same seed, province count and config always produce the same map.
- **Infinite zoom.** The map is redrawn at higher resolution for the visible area when you zoom in (`startDetail()` in `src/ui.js`).
- **Three map views** (layers button under the zoom controls):
  - The full painted map.
  - A political map with realm colours and realm names.
  - A quest map that shows province borders, labelled quest pins, marching armies and besieged settlements.
- **Quests.** You create them by clicking land that borders your realm, or with "+ New quest". Each has a title, notes, realm, optional goal, skills, difficulty, deadline, subquests and status (Planned, In progress or Done). Overdue is a red warning flag shown when the deadline has passed; it is not a status.
- **Goals** group quests. They have their own deadline and skills, and launch enemy campaigns (see section 2).
- **Realms and rivals.** Every realm (life area) has a rival kingdom on the map. Neglecting a realm makes its rival march on you.
- **Economy.** Provinces and settlements earn gold every day. Gold pays for raiding expeditions. Wealth and power ranks rise with gold and land.
- **Armies, sieges and looting.** Armies march along roads, are slowed by rough terrain, besiege your nearest settlement and loot provinces if you don't act in time.
- **Character card.** A full knight surrounded by a radial chart of your skills. Click a skill to rename it.
- **Quest board** (kanban, task-list icon in the top-right corner). It has Planned, In progress and Done columns, and you drag cards between them.
- **Chronicle** (bell icon) holds every notification. With `debug.time_travel` on, it also has "Skip 1 day" and "Skip 7 days" buttons for testing.
- **Hover tooltips** on provinces, quest pins, armies and settlements. Click a settlement to rename it.
- **Storage.** Each world is a Markdown checklist that a human can edit (`maps/<map name>/world.md`). The character is shared by every map (`character.md`). You can save or load worlds from the sidebar's World tab.

### Files

| Path | Role |
|---|---|
| `index.html` | The built app (generated, do not edit by hand). |
| `src/page.html` | Markup and all CSS. `<!--SCRIPT-->` marks where the JS goes. |
| `src/core.js` | YAML parser, utilities, noise, map generation, terrain shading, map icons, contour tracing. |
| `src/game.js` | Storage adapter, `world.md` and `character.md` read/write, economy, ranks, quests, goals, rivals, armies, `processTime()`. |
| `src/ui.js` | Map view and drawing, hit-testing, tooltips, sidebar, editors, date picker, kanban, setup flow, save/load, `boot()`. |
| `build.py` | Concatenates `src/` into `index.html` and embeds `config.yaml` as the built-in defaults. Run `python3 build.py` after any change in `src/` or to bake config defaults. |
| `server.js` | Node 18+ server on http://localhost:4173. Serves the app and the API: `GET/PUT /api/maps/<name>`, `GET /api/maps`, `GET/PUT /api/character`, `GET /api/config`. |
| `config.yaml` | Every tunable number and name list (see section 3). |
| `maps/<map name>/world.md` | One world (see section 4). |
| `character.md` | Your skills and their levels, shared by all maps. |
| `docs/` | Screenshots used by `README.md`. |
| `warp/` | This onboarding folder. |

Without the server (for example the claude.ai preview), the app falls back to browser storage under the localStorage keys `tc-maps`, `tc-character` and `tc-last-map`, and uses the config embedded at build time.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Map / World** | One saved game: a generated continent plus its kingdom, realms, goals, quests, gold, armies and chronicle. Identified by its **map name**, which is also its folder name in `maps/`. You can have many; switch with World → Load world. |
| **Seed** | The random number a map is generated from. Stored in `world.md`'s state block; with the same province count and the same `map`/`settlements` config it always rebuilds the identical continent. |
| **Province** | A territory cell of the map (60–400 per map). Owned by you, by one rival, or by nobody. Has a **province type** that sets its gold: farmland, forest, hills, mountains, marsh, desert, tundra, ashlands, wastes (crater wastes). Coastal provinces earn a bonus. |
| **Terra incognita** | Provinces nobody owns. At the start it lies beyond the rivals; your starting land borders only rivals. |
| **Kingdom** | You. Your provinces are gold on the map. |
| **Seat / main castle** | Your home castle, chosen at setup and marked with a crown. Its province can never be lost. If it is looted you also lose all your gold. |
| **Settlement** | A village, town, fort or castle in a province (at least 30% of provinces have one). It adds gold and determines how long a siege lasts and how many provinces a loot costs. Each has a generated name you can change by clicking it. |
| **Realm** | An area of your life (Health, Money, Business, Relationships, Education…). Every quest and goal belongs to one realm. Shown as filter chips and in `world.md` as `## Realm:` sections. |
| **Rival** | The enemy kingdom tied to a realm, named from `rivals.name_patterns` (e.g. "Khanate of Health"). It holds territory proportional to 1 + the number of goals in its realm. Its armies punish overdue quests and neglected goals of that realm. |
| **Capital** | A rival's castle. It can only be attacked (a quest planted there) once it is that rival's last province. Taking it destroys the rival. |
| **Quest** | A task. Pinned to a province. Fields: title, notes, realm, goal (optional), skills, difficulty, deadline, subquests, status. |
| **Status** | Planned (`open` internally), In progress (`progress`) or Done. |
| **Overdue** | A warning, not a status: an unfinished quest past its deadline. Shown in red with a "!" icon. |
| **Subquest** | A checklist step inside a quest. No rewards of its own. |
| **Difficulty** | Squire, Knight, Lord or Legend (names and rewards from `quests.difficulties`). It sets the skill points and gold a quest gives. Every quest conquers 1 province. |
| **Goal** | A group of quests in one realm, with an optional deadline and skills. Quests in a goal train the goal's skills unless they pick their own. Completing a goal gives bonus gold and skill points. |
| **Skill** | A character stat (integer). Defined by you, shared across all maps, stored in `character.md`. Each finished quest adds its difficulty's `skill_points` to each of its skills. |
| **Character** | Your knight and skills (`character.md`). Only skills carry between maps. |
| **Gold** | Currency. It accrues continuously from owned provinces and settlements, plus quest rewards and army bounties. It is spent on raiding expeditions and lost entirely when your seat is looted. |
| **Raiding expedition** | Planting a quest in a province that does not border your realm. It costs gold: `base_cost + cost_per_hop × (hops−1)^hop_exponent`. |
| **Conquer** | Completing a quest takes its province. If you already own it, you take the nearest unowned province beside your border instead. |
| **Army** | An enemy force walking along roads from a rival capital to your nearest settlement. Each mountain, ashlands or crater-wastes province on its road adds `armies.mountain_delay_days`. |
| **Campaign** | An army launched by a goal: 7 days before the goal's deadline, or after 7 days with no finished quest in the goal. It marches for 7 days. All three numbers are in config. |
| **Siege** | What an army does when it arrives. It lasts `siege_days` for the settlement type. Fixing the cause (finishing the quest, completing the goal, or finishing any quest in the neglected goal) destroys the army: "Enemy was defeated!" plus a gold bounty. |
| **Loot** | If the siege ends first, the rival takes `loot_provinces` provinces nearest that settlement. If it was your seat, you also lose all your gold. |
| **Ranks** | Wealth rank (by gold) and power rank (by provinces), both cosmetic, from `ranks` in config. |
| **Chronicle** | The notification log (bell icon). It records quests, provinces won and lost, ranks, skills, campaigns, sieges and loot. |
| **Time travel** | Testing buttons that move a world's clock forward (`timeOffset` in the state block). |

## 3. Configuration (`config.yaml`)

Edit the file, save, and reload the browser tab. The server reads `config.yaml` on every page load. The built-in defaults (used by the claude.ai preview or if a key is missing) come from the copy embedded by `build.py`, so run `python3 build.py` if you want the preview to match.

**Safe to change at any time** (gameplay numbers, read on every load):

| Key | Effect |
|---|---|
| `siege_days.*` | Days a besieged village / town / fort / castle / main_castle holds out (X). |
| `loot_provinces.*`, `main_castle_loot_takes_all_gold` | What a successful loot costs you. |
| `gold.start` | Starting gold of new worlds. |
| `gold.province_per_day.*`, `gold.coastal_bonus_per_day`, `gold.settlement_per_day.*` | Daily income (Y) by province type and settlement type. |
| `gold.army_defeat_bounty` | Gold for routing an army. |
| `quests.difficulties` | List of difficulties, easiest first: `name`, `skill_points`, `lands` (provinces conquered; currently 1 for all), `gold`. Keep exactly four entries, or the quest editor's 4-column selector looks wrong. Renaming a difficulty breaks matching for existing `world.md` lines that use the old name (they fall back to Knight). |
| `quests.goal_complete_gold`, `quests.goal_complete_skill_points` | Goal completion rewards. |
| `raid.*` | Raiding expedition price curve and maximum distance. |
| `armies.*` | Campaign timing and the rough-terrain delay. Already-launched armies keep their arrival time. |
| `rivals.new_realm_provinces`, `rivals.new_goal_provinces`, `rivals.steal_provinces` | Land rivals gain when you add realms or goals mid-game. |
| `rivals.name_patterns`, `rivals.colors` | Used when a rival is created; existing rivals keep their name and colour. |
| `ranks.wealth`, `ranks.power` | Thresholds and fun titles, each `{ at: N, name: "..." }`, ascending. |
| `defaults.realms`, `defaults.skills` | Pre-filled lists on the setup screen. |
| `debug.time_travel` | Shows the Skip-day buttons. Set `false` for real play. |
| `map.provinces_min`, `map.provinces_max`, `map.provinces_default` | The setup slider's bounds and default. |

**Map-shaping: change only when you have no saved worlds you care about.** Existing worlds are regenerated from their seed at load time using the current config. Changing these alters the terrain or the settlement list, so the province numbers and settlement IDs stored in a `world.md` no longer match, and ownership and armies become nonsense.

| Key | Effect |
|---|---|
| `map.land_share` | Share of the map that is land. |
| `map.starting_ring` | Rings of provinces you own at the start (new worlds only, safe for old ones). |
| `settlements.min_share`, `settlements.mix.*` | How many provinces have settlements and the type mix. |
| `rivals.start_share`, `rivals.terra_incognita_min`, `rivals.base_weight` | Starting territory sizes (new worlds only, safe for old ones). |

YAML subset supported by the parser (`parseYAML` in `src/core.js`): nested maps by indentation, `- item` lists, lists of maps (`- name: X` followed by keys indented two more spaces), flow lists `[a, b]`, flow maps `{ at: 0, name: "X" }`, quoted strings, numbers, `true`/`false`, `#` comments. Anchors, multi-line strings and tabs are not supported. If the file fails to parse, the app shows a toast and uses the built-in defaults.

## 4. Editing quests by hand (`maps/<map name>/world.md`)

**Close the app's browser tab first.** The app autosaves about a second after every change and would overwrite your edits. Reopen it after saving the file; the world is read on load.

### Schema

~~~markdown
This file follows the Task & Conquer world format v1: … (one sentence describing the format; keep it as the first line)

# The Year of Deeds

Kingdom: Highmarch
Seat: Dawnkeep

## Realm: Health | id: health
Rival: Duchy of Health

- [ ] Book a dental checkup | due: 2026-11-05 | difficulty: Squire | skills: Conditioning | id: q65js0645v

### Goal: Run a half marathon | due: 2027-04-01 | skills: Conditioning | status: open | id: g9p2ed4zb8
- [x] Morning run, 5 km | difficulty: Squire | done: 2026-10-25 | id: qaowq5945u
- [ ] Long run, 12 km | due: 2026-11-06 | difficulty: Lord | status: in progress | id: q9dpp3w462
  > Route: river loop, two laps.
  - [x] Buy new shoes
  - [ ] Plan the route

## Realm: Money | id: money
Rival: Khanate of Money

## World state

```json
{ …managed by the app… }
```
~~~

### Rules

- **Heading levels matter.** `# ` is the map name. `## Realm: <name> | id: <id>` starts a realm, and the next line `Rival: <name>` names its rival. `### Goal: <name> | …` starts a goal inside the realm above it. `## World state` must be the last section.
- **Quests** are top-level checklist lines (`- [ ] ` open or `- [x] ` done) with no indentation. Quests directly under a realm heading (before any goal) have no goal. Quests under a `### Goal:` belong to that goal.
- **Attributes** follow the title, each written as ` | key: value` (space, pipe, space). Recognised keys: `due`, `difficulty`, `skills`, `status`, `done`, `id`. Any other ` | text` is kept as part of the title.
  - `due: YYYY-MM-DD`. Any other format is ignored. The deadline is the end of that day.
  - `difficulty:` one of the names in `quests.difficulties` (case-insensitive). Unknown or missing means Knight.
  - `skills: A, B`, comma-separated skill names. Unknown names are created on the character at level 0. If omitted in a goal quest, the goal's skills are used.
  - `status: in progress` marks an unfinished quest as In progress. Omit it for Planned. Done is expressed by `[x]`, not by status.
  - `done: YYYY-MM-DD` is written by the app and is informational.
  - `id:` is written by the app. **Never change or duplicate an existing id**: the id links the line to its map position, army and history in the state block.
- **Notes**: lines indented by two or more spaces starting with `> `, directly under the quest.
- **Subquests**: lines indented by two or more spaces, `- [ ] text` or `- [x] text`, directly under the quest.
- **Goals**: `### Goal: <name> | due: YYYY-MM-DD | skills: A, B | status: open|done | id: <id>`. `due` and `skills` are optional.
- **Dates and times** use the computer's local time.

### What happens when the app opens an edited file

| You did | Result |
|---|---|
| Added a new quest line without `id` | Gets a new id. It is pinned to a free province on your border (never a paid raid). If it has a future `due` date, its realm's rival launches an army. A new `- [x]` line is recorded as done with no rewards. |
| Ticked `[x]` on an existing open quest | Completed on load, with rewards (gold, skill points, a conquered province), and any army it caused is destroyed. |
| Unticked an existing done quest | Reopened: its gold and skill points are taken back; the land stays yours. |
| Added or removed `status: in progress` | The status changes accordingly. |
| Changed title, notes, subquests, difficulty or skills | Updated, no side effects. |
| Changed the `due` date of an existing quest | The date changes, but an army already marching keeps its old arrival time. Change deadlines in the app's quest editor when you want the army to follow the new date. |
| Deleted a quest line | The quest is gone, and any army it caused is disbanded when the world opens. |
| Added a goal | Gets an id and starts its 7-day neglect clock from the time you open the app. Rivals do **not** gain land (they do when a goal is added in the app). |
| Added a realm | It is created, but its rival gets no territory or capital; its armies come from the nearest other rival. **Add realms in the app** (Realms & skills tab) so the rival is placed properly. |

**Do not edit the `## World state` JSON** unless you are fixing a bug. It holds the seed, province ownership, positions, armies, gold and the chronicle. Its quest entries are keyed by quest id.

### `character.md`

~~~markdown
This file follows the Task & Conquer character format v1: each "- Name: number" line under "## Skills" is one skill and its level, and every map shares these skills.

# Character

## Skills
- Conditioning: 4
- Coding: 2
~~~

Levels are integers. Renaming a skill here does not rename it in existing quests; rename it in the app (click it on the character chart) instead.

## 5. Working on the code

- Edit files in `src/`, then run `python3 build.py`. Never edit `index.html` directly.
- `window.__TC` exposes internals for debugging in the browser console: `WD` (the current world), `CH` (character), `CFG`, `processTime()`, `skipTime(days)` and others.
- **Determinism:** `generate()` must consume its seeded RNG in the same order, or existing worlds will regenerate differently. New random cosmetic features should use a separately seeded RNG (see the ashlands/crater regions) or be appended after everything that affects provinces and settlements.
- **Time:** all game logic uses `now()` (real time plus the world's `timeOffset`), never `Date.now()` directly. Events (sieges, loots, campaigns, overdue notices) are replayed in time order by `processTime()`.
- **Headless testing** works with `jsdom` plus `@napi-rs/canvas`. Load `index.html` with `window.__TC_TEST__=true` set before the script, patch `HTMLCanvasElement.prototype.getContext` to return napi canvases, and drive the UI through `window.__TC` and DOM clicks.
