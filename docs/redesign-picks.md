# Mac app redesign: Claude's picks to confirm

The redesign follows mockup C, and the Mac app follows the plan Raichel chose on 2026-10-17. Everything below was picked by Claude during the build. It is **proposed, not confirmed**. Say which to change.

## Mac app
- The window opens at 1440x900. The smallest it can get is 1100x720. It has a dark title bar with the window buttons over the top bar.
- On opening, the app checks GitHub (`main`) for newer data. When it finds some, it downloads it and shows "New data ready, reload". It only uses data with the same `schema` number as the app.
- Photos and college logos are saved the first time they load and are kept forever. There is no expiry and no "clear cache" button.
- NFL logos are bundled. They were made from vector files in two npm packages, because ESPN and Wikipedia are blocked in the build sandbox. Running `python3 pipeline/art.py --fresh` on a Mac swaps in ESPN's official files.
- College colours are the published College Football Data values. Some differ from the schools' own brand guides: Ohio State is #DE3121, and Missouri is black on black.
- The app is ad-hoc signed only. macOS asks you once to allow it (see `docs/mac-app.md`).

## Draft room
- When the team on the clock calls you, the call waits 5 seconds on Calm or 2.5 seconds on Fast. If you don't open it, that team picks. Calls at your own pick wait until you answer.
- Your pick has a real 2:00 clock in every round (Raichel asked for exactly 2 minutes). At 0:00 the draft AI makes your pick. The AI teams' picks have no countdown.
- Each trade offer you make uses its share of your 2:00: one engine minute is 2:00 divided by the round's clock (10 minutes in round 1, so 12 seconds an offer). Teams buying your pick see your time run down.
- Pause sits on the clock card at all times. It freezes everything: AI picks, calls waiting for your answer, and your clock. You can still make your pick while paused.
- Pace is Calm, Fast or Instant, and the app remembers it.
- "Sim to the end" and "New draft" ask first. "Sim to the end" turns down any open calls, and the AI then picks for your team too, as before.
- The pick reveal shows a letter grade labelled "Quick read". It is Claude's own formula: class rank value against pick value, one step up for a top-3 need, one step down for a need under 0.2. The text below it uses the hit rates.
- The player cards show the top 30 players still on the board. Search reaches the rest.
- "Run it back" starts a new draft at once, with the same teams and a new seed.
- The class card saves as a 1080x1920 PNG (story size).

## Player page and My Board
- New flags you can set on a player: Watch more film, Check the medicals, Check character, Sleeper, Would not draft.
- There is a new "Drafted in 2027" tile. It is the chance he declares times the chance he is drafted if he declares (computed).
- "Chance he declares" is labelled estimated. The model numbers are labelled computed.
- Question: the athletic score averages only the tests you entered, as before. The real RAS also counts height and weight. Should it?
- My Board is lit in your No. 1 player's school colours.

## Home and Big Board
- The Big Board sorts by Board rank by default. That rank blends all three boards, and it is where the AI teams start. Consensus is one tap away. It covers only 209 of the 700 players.
- Home has three extra shelves: best at each position, underclassmen who may stay in school, and the model's sleepers.
- The Big Board no longer runs simulations by itself when it opens.

## Teams, Simulations, Model and data
- The Teams screen has a Tiles / Table switch, so the old table's columns are still there.
- Simulations run in the background, so the app stays usable. On macOS 11 they run on the page instead.
- The Simulations screen uses a neutral slate-blue room.

## Draft AI behaviour seen while testing (not changed)
- In round 1, almost every team on the clock calls you to move back. The cause is the engine's `callRate` (0.6 in round 1, estimated).
- The known test failure is still there: a kicker goes in round 1 in 1 of 40 simulations.
