# GitHub Push Studio v1.0.1

A desktop application for publishing local project folders to GitHub without memorizing Git commands.

**Stack:** Electron, React 19, JavaScript, HTML, CSS, Node.js, Vite 8, plus a small optional Python 3 diagnostics script. The main Git workflow runs through locally installed `git` and the official `gh` GitHub CLI. No GitHub token is stored by this application.

## v1.0.1 repair notes

- Fixes the first-launch npm `ETARGET` failure by pinning Electron to npm-published `45.3.1` (instead of the unpublished `^45.3.2` range).
- Pins Vite to a previously published `8.3.5` release to avoid fresh-release registry propagation delays.
- Improves the launch script so it does not mistake a partially installed dependency directory for a completed installation.

## Start it on Windows

1. Install **Node.js LTS (22 or newer recommended)** from https://nodejs.org/en/download. This is required **before** the app can start; the rest of the setup is inside the app.
2. Extract the **entire ZIP** to a folder such as `C:\Apps\GitHub-Push-Studio`. Do not try to run it from inside the compressed ZIP.
3. Double-click **`START_WINDOWS.bat`**. On first launch, the script installs the necessary Electron/React/Vite packages using npm. **Internet is required for the first installation.**
4. Once the desktop window opens, go to **Setup & account** and follow the four on-screen steps:
   - Install Git (inside the app via Windows Package Manager where available, or through the official download link).
   - Install GitHub CLI (same process).
   - Choose **Sign in with GitHub**, approve in your browser. GitHub CLI may copy a temporary verification code to your clipboard. The app also offers a link to the GitHub device verification page.
   - Set your name and your Git commit email. This uses global Git configuration. GitHub provides a `noreply` email if you want to hide your personal email.
5. Open **Overview → Open project**, choose the local folder that contains your code.
6. If the folder is not a Git repository, choose **Initialize repository**. This also creates a protective `.gitignore` if it does not exist.
7. Choose **Create new** (creates a private or public GitHub repository) or **Connect existing** (paste a GitHub repository HTTPS URL). If your origin is already set, a **Change origin destination** link is provided with confirmation.
8. Enter a meaningful commit message, then choose **Commit & push to GitHub**. Alternatively, commit locally and push later.

> Your source is not uploaded merely by selecting a folder or connecting a remote. Uploads happen when you explicitly press **Push** or **Commit & push**.

### First-launch troubleshooting

- **"Node is not recognized"**: install Node.js LTS, close the old command window, and restart `START_WINDOWS.bat`.
- **`npm install` fails**: verify internet connectivity and that npm can access the npm registry. Try `npm install` from a Command Prompt in the extracted folder, then launch again. If you previously attempted an install with v1.0.0, extract v1.0.1 into a new folder; old `node_modules` and/or a partial `package-lock.json` should not be reused.
- **Git or GitHub CLI still reads "missing" after installation**: close and relaunch Push Studio (this reloads Windows PATH). Their official download links are on the Setup screen.
- **GitHub sign-in does not finish**: open a Command Prompt and run `gh auth login --web`, complete the GitHub browser login, then run `gh auth setup-git` and click **Refresh** in the app. This is the documented fallback for environments that restrict interactive CLI browser login.
- **Push rejected (`fetch first` or `non-fast-forward`)**: the remote has commits not present locally. Use normal Git operations (e.g. fetch/pull in an IDE or terminal), review and resolve any conflicts, then retry. This app never force-pushes.
- **Remote repo is empty but app says no commits**: create or update a file and use **Commit & push**.
- **An organization remote is needed**: create the destination repository within the organization on GitHub, then use **Connect existing** and its GitHub URL. You must have permission to push to that organization.
- **A private remote asks for credentials**: sign in on the Setup page, which calls `gh auth setup-git` to configure HTTPS Git authentication. If you've authenticated outside the app, run `gh auth setup-git` from a terminal.

## Developer commands

```bash
npm install
npm run dev       # Vite dev server + Electron desktop (hot-reload frontend)
npm run build     # Production frontend -> dist/
npm run desktop   # Start the built desktop app
npm start         # Build, then start Electron
npm test          # Node unit + local Git integration tests
python scripts/doctor.py --repo PATH_TO_PROJECT  # Optional checks
```

You can also double-click **`DEV_WINDOWS.bat`** for development on Windows, or run `./START_MAC_LINUX.sh` on Linux/macOS if Node/npm are installed (system Git and GitHub CLI must be installed separately there).

## Key features

- Local project chooser, recent project list, current branch, latest commit, and file-change preview.
- Initialize a repository with a `main` branch; create safe default `.gitignore` only if none exists.
- Configure global Git author name/email through the interface.
- GitHub CLI browser authentication and HTTPS credential helper configuration.
- Create new **private** or **public** GitHub repos with GitHub CLI, or attach an existing GitHub remote.
- Standard Git add/commit/push; upstream configured with `git push -u origin BRANCH`.
- Protection against accidental force-pushes, obvious private filenames, and individual changed files larger than 95 MiB.
- Action feedback, error messages, activity log, and optional Python diagnostics.
- Responsive Electron UI with minimum **950×640**, default **1420×900**; content areas scroll at compact heights.

## Safety and behavior

- **Review files before publishing.** This app uses `git add -A` when committing: it stages all changes that are not ignored, including deletions. It does not support per-file selective commits in this version.
- A `.gitignore` only prevents files that are not already tracked from being newly added. To remove a tracked secret from Git, clean it from the Git history as appropriate; simply ignoring it is not enough. Rotate any exposed credentials.
- The preflight protection is **heuristic**, not a complete secrets scanner. Do not assume a successful scan proves the code is free of secrets.
- The app will not automatically pull, rebase, resolve merges, delete GitHub repositories, or overwrite remote history.
- The app accepts remotes on **github.com** in HTTPS (`https://github.com/owner/repo.git`) and SSH (`git@github.com:owner/repo.git`) forms. Authentication setup is optimized for HTTPS; existing SSH URLs require a separate working SSH key.
- The app keeps only the paths of your recent project folders in Electron's per-user application data. GitHub credentials are handled by GitHub CLI and your system credential store or CLI configuration.
- The sign-in process uses GitHub CLI's supported `--web --clipboard` options. Browser/device-code interaction can differ by OS and CLI version; use the documented terminal fallback if necessary.
- The local activity log is session-only and is not sent anywhere.
- Keep Node.js, Electron, Vite, Git and GitHub CLI updated; review dependencies before production distribution.

## Architecture and secure defaults

- `electron/main.cjs`: sandboxed BrowserWindow, restricted window navigation, input-checked IPC, file dialog, scoped external links, state and event handling.
- `electron/preload.cjs`: allowlisted commands exposed through Electron's context bridge.
- `electron/git-service.cjs`: Git/CLI subprocesses launched with argument arrays and without a shell to reduce injection risk.
- `electron/utils.cjs`: parsing, validation, and ignore rules.
- `src/App.jsx`, `src/styles.css`: responsive React interface, forms, status UI, accessibility labels and keyboard focus.
- `scripts/doctor.py`: optional read-only local environment checks.
- `tests/`: format validation and real local Git lifecycle test.

Security and workflow reference documentation:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/context-isolation
- https://cli.github.com/manual/gh_auth_login
- https://cli.github.com/manual/gh_repo_create
- https://docs.github.com/en/github-cli/github-cli/authenticating-with-github-cli
- https://git-scm.com/docs/git-push
- https://www.w3.org/TR/WCAG22/

## Known limitations

This ZIP contains **source code plus launch scripts**, not a prebuilt/signed Windows `.exe`. It installs npm dependencies on the user's Windows computer. The core local Git operations and JS/JSX syntax were verified during development; a full Windows/Electron UI run and authenticated push against a live GitHub account were not performed in the build environment.
