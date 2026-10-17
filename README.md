# Time Audit

**目前開發版本：V1.06版。** © 2026–2027 Shu-Yen Wan（萬書言）。[版權聲明](./app/public/copyright.html)。

A React web app for recording the full 24 hours of each day and reviewing how time is allocated. The interface uses a quiet blue palette and supports Traditional Chinese and English.

## Current features

- Editable start and end times, 5-minute adjustment buttons, activity chips, custom descriptions, three optional 1–7 ratings, and an optional 1–7 activity feeling rating.
- Sleep and rest entries, month calendar, day timeline, and backfilling gaps.
- Local, explainable keyword suggestions for free text; the user confirms the category and keeps the original description.
- Duration-weighted category, rating, importance × urgency, and goal charts, including separate unrecorded and unrated time. Data quality, a 7×24 weekly rhythm with category-coloured hour segments, and work recorded outside user-selected hours are also shown.
- An optional daily mood rating in the journal and exploratory mood comparisons with data sufficiency checks.
- Weekly evidence cards with source links and usefulness feedback, plus saved if–then experiments with baseline and review snapshots.
- Optional public-domain IPIP-50 questionnaire with scores only when all items are answered.
- Google sign-in and user-authorized `drive.file` sync; local IndexedDB cache, JSON/CSV export, and JSON import also work in device-only preview mode.
- Browser-open reminders, quiet hours, installable PWA shell, and responsive mobile layout.

The [product specification](./TimeAudit-Specification.md) and [reviewable HTML version](./TimeAudit-Specification.html) are in the repository root.

The [publisher launch guide](./GOOGLE-LAUNCH-GUIDE.md) explains Google OAuth, public access, and testing steps. The GitHub Pages app does not depend on the publisher's computer being on.

For the public GitHub Pages deployment, use the shorter [Google sign-in setup steps](./GOOGLE-GITHUB-STEPS.md). The Pages site is `https://sywan.github.io/TimeAudit/` and the in-app header lets users switch between Traditional Chinese and English at any time.

## Run locally

```sh
cd app
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Without a Google OAuth client ID, the landing page offers a **device-only preview** with sample entries. Preview data is not synced to Drive.

## Enable Google sign-in for everyone

The app publisher performs this setup once. End users only click the Google sign-in button and grant Drive access in Google's consent window. A browser-only app cannot create its own Google OAuth registration at runtime.

1. In Google Cloud, create or select a project and configure the OAuth consent screen. Add any test users while the app is in testing mode.
2. Enable **Google Drive API** and **Google Sheets API**.
3. Create an **OAuth 2.0 Web application** client. Add the local and deployed site origins under Authorized JavaScript origins, for example `http://127.0.0.1:5173` and the final `https://…` site origin.
4. Copy `app/.env.example` to `app/.env.local` and set `VITE_GOOGLE_CLIENT_ID`. For deployment, provide that build variable in the hosting build environment and rebuild.

The ID is a public browser client identifier, not a secret. Do not put a client secret in the web app. The app requests only `https://www.googleapis.com/auth/drive.file`. It creates a `Time Audit` folder, monthly JSON files, `profile.json`, and a Sheet mirror in **each user's own Drive**. The publisher's Site stores no journal entries. The user's browser keeps an IndexedDB cache for offline use.

## Current limits

- Google authentication and Drive sync depend on the publisher's OAuth configuration and each user's authorization. Device-only preview entries stay in that browser.
- Reminders work while the web app is open. Notifications after the browser is closed require a push subscription, scheduler, and server service; these are not yet part of this static deployment.
- Reflections describe observed patterns and do not diagnose psychological traits. IPIP scores are raw scores, not clinical assessments or population percentiles.
- Cross-device edits to the same entry at the same revision require conflict resolution in Settings.

## Build

```sh
cd app
npm run build
```

The production files are written to `app/dist`.

## 將公開版同步到本機

在這個 Codex 工作資料夾中，`.github-pages-source` 是 GitHub Pages 對應的獨立 checkout；外層 `TimeAudit` 可能另有尚未提交的修改。要取得 GitHub 公開版的最新**程式碼**，在工作資料夾根目錄執行：

```sh
cd .github-pages-source
git status -sb
git switch main
git fetch origin
git pull --ff-only origin main
git log -1 --oneline
```

首次在另一台電腦使用，先執行 `git clone https://github.com/sywan/TimeAudit.git` 並 `cd TimeAudit`，再從 `git status -sb` 開始。執行前若有未提交的修改，先提交或暫存；若本機與遠端已分叉，`pull --ff-only` 會停止，請先檢查差異，勿用 `reset --hard` 覆蓋。`fetch` 取得遠端最新資訊，`pull --ff-only` 將安全的最新提交帶到本機。只有在本機修改並提交後，才需要 `git push origin main` 發佈到 GitHub。這些指令處理程式碼，與 App 內使用者的時間紀錄同步無關。
