# The Mac app

Mock Draft 2027 also runs as a Mac app. It is the same web app in `app/`, inside a small native window built with [Tauri 2](https://v2.tauri.app). The download should be about 10 to 15 MB (estimated: a Linux test build of the same app is 7 MB for one chip, and the Mac file holds both chips; check the first CI build). It works on macOS 11 (Big Sur) or newer, on Apple silicon and Intel Macs.

## How it works

- **The page.** The window shows `app/index.html`, the same files `npm start` serves. `app/js/platform.js` tells the two apart (`isApp` is true inside the app) and picks the right way to load data, show images and save files.
- **Data, offline first.** The app ships with the data set that was in `app/data/` when it was built. When it opens, it also checks GitHub for newer data (`app/data/meta.json` on the `main` branch of cnbville/mock-draft2027). If the `built` date there is newer and the `schema` number matches, it downloads every data file and saves them in the app's data folder. `meta.json` is saved last, so a half-done download is never used. The top bar then says "New data ready, reload". Next time, the app uses the newest copy it has. Offline, it keeps working with the last copy.
- **Data folder.** `~/Library/Application Support/com.cnbville.mockdraft2027/data/`. Delete that folder to drop the downloaded data; the app then starts from the data it shipped with and checks GitHub again.
- **Standings.** Each time the app opens it also fetches this season's games from nflverse (`raw.githubusercontent.com/nflverse/nfldata`) and re-projects the draft order. Offline, it uses the games it fetched last time, or the ones built into the data. The Standings screen (Teams > Edit standings) takes your own records. Entries are kept with your board.
- **Photos and logos.** Player photos and college logos come from ESPN (and a few other hosts). The app loads each one once, saves it in `~/Library/Caches/com.cnbville.mockdraft2027/img/`, and shows the saved copy after that, also offline. An image that was never loaded can't show offline: the page shows a silhouette or a monogram instead. NFL logos ship inside the app. Only https images from `a.espncdn.com`, `raw.githubusercontent.com`, `github.com`, `objects.githubusercontent.com` and `upload.wikimedia.org` are fetched.
- **Your photos.** Photos you import for a player are kept in the page's own storage (IndexedDB), like in the browser. They stay on your Mac.
- **Your board.** Saved in the page's own storage, under the same key as in the browser (`mockdraft2027.v1`). The browser and the app keep separate copies: use Export and Import on My Board to move a board between them.
- **Saving files.** "Save image" (your class card) and board export open the normal Mac Save panel.

The native side is in `src-tauri/`:

| File | What it does |
|---|---|
| `src/store.rs` | `store_read` and `store_write`: text files in the data folder (only plain relative paths, no `..`). `save_file`: the Save panel, then writes the file. |
| `src/img.rs` | The `img://` address the page uses for remote images: checks the host, serves the saved copy or downloads and saves it, 404 when offline and not saved. |
| `tauri.conf.json` | Window (1440 x 900, smallest 1100 x 720, title bar blended into the page), app name and id, the .dmg settings. |
| `capabilities/default.json` | What the page may call. |
| `icons/` | The app icon. `icons/source/icon.html` is the editable source (Archivo, from `app/fonts/`); the note at its top says how to rebuild the set. |

## Opening it the first time

The app is not signed with an Apple developer certificate (published price: $99 a year, Apple Developer Program), so macOS stops it the first time.

1. Open the `.dmg` and drag **Mock Draft 2027** into **Applications**.
2. Open the app. macOS says Apple could not check it for malware. Click **Done** (not "Move to Trash").
3. Open **System Settings > Privacy & Security**. Scroll down to Security. Next to "Mock Draft 2027 was blocked", click **Open Anyway**.
4. Confirm with **Open Anyway** and your password or Touch ID. The app opens. From now on it opens normally.

If macOS says the app "is damaged", run this once in Terminal, then open it again:

```
xattr -dr com.apple.quarantine "/Applications/Mock Draft 2027.app"
```

## Getting the .dmg from GitHub

The workflow `.github/workflows/mac.yml` builds the app on a Mac runner on every push that changes `app/`, `src-tauri/`, `package.json`, `package-lock.json` or the workflow, and when started by hand (Actions > mac app > Run workflow).

1. Open the repo on GitHub, then **Actions > mac app**, and click the newest green run.
2. Under **Artifacts**, download **Mock-Draft-2027-mac**. GitHub keeps it for 30 days.
3. Unzip it. Inside is `Mock Draft 2027_0.2.0_universal.dmg`.

## Building it on a Mac

You need [Node 22](https://nodejs.org), [Rust](https://rustup.rs) and the Xcode command line tools (`xcode-select --install`).

```
npm ci
npm run app:build
```

The app lands in `src-tauri/target/release/bundle/macos/` and the .dmg in `src-tauri/target/release/bundle/dmg/`. That build is for your own Mac's chip. For one file that runs on both chips, like CI:

```
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npx tauri build --target universal-apple-darwin --bundles dmg
```

`npm run app:dev` opens the app straight from `app/` for quick checks. If a change doesn't show, reload the window (Cmd+R).

## Version

The app version is in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (now 0.2.0). Change both together.
