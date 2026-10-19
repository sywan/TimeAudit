# Time Audit

**目前開發版本：V1.15版。** © 2026–2027 Shu-Yen Wan（萬書言）。[版權聲明](./app/public/copyright.html)。

A React web app for recording the full 24 hours of each day and reviewing how time is allocated. The interface uses a quiet blue palette and supports Traditional Chinese and English.

[使用手冊 · User guide](https://sywan.github.io/TimeAudit/manual.html) · [下載離線 HTML 手冊](./app/public/Time-Audit-Manual-Offline.html) · [下載全部檔案 ZIP](./app/public/Time-Audit-Downloads.zip)（另含[繁體中文 Markdown](./app/public/USER-MANUAL.md)、[English Markdown](./app/public/USER-MANUAL.en.md)、[高解析標誌 PNG](./app/public/time-audit-logo-4096.png)與[網站 QR Code](./app/public/QR-CODE_TimeAudit.png)）

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
- Install from iPhone Safari's Share → Add to Home Screen, or from Chrome/Edge's address bar or menu. The app does not show a duplicate install button when the browser controls installation.
- Drive sync shows live stage and file progress. The Today card links to the selected day’s YouVersion Verse of the Day; with an approved YouVersion App Key it displays the passage in Traditional Chinese CCBT (當代譯本) or English NASB 2020. The Time Audit logo appears in the app, home screen icon, and browser tab.
- A share button in the app displays the supplied QR code, the public URL, copy-link action, and downloadable QR image. Shared links contain no personal records.
- Optional anonymous website usage analytics can count visits and four broad actions without reading anyone's time entries or journal.
- Values and goals sync as individual Drive files by stable ID. Deletions carry a timestamp, while `profile.json` remains a backup; a newer copy of unrelated settings cannot erase the list. Local IndexedDB saves are serialized to prevent an older snapshot from finishing last.

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

## Optional YouVersion verse text setup

The app runs without YouVersion credentials. Its Today card links to the selected day’s [official Verse of the Day](https://www.bible.com/verse-of-the-day). To display the text inside Time Audit:

1. [Register an application with YouVersion Platform](https://platform.youversion.com/) and obtain an App Key. The app uses **CCBT 當代譯本** (version 1392) and **NASB2020** (version 2692); accept the required publisher agreements. The previously requested CUNP-神 is available on Bible.com but was absent from the Platform API catalog when V1.08 was prepared.
2. For local development, add `VITE_YOUVERSION_APP_KEY` to `app/.env.local`. For GitHub Pages, add a repository Actions variable named `VITE_YOUVERSION_APP_KEY`, then rerun **Publish Time Audit**. The workflow already passes this variable to the build. Browser build variables are visible to site visitors, so use only a key that YouVersion permits in a public web application; never enter a private server credential or publisher secret here.
3. Verify the Today card in both languages and on two dates. If API access or a translation license is unavailable, the card keeps the YouVersion link instead of showing a different translation.

The YouVersion API uses a **day-of-year** index rather than a year-specific date. The card uses the selected date’s day of year. It does not store scripture text in a user’s Google Drive or browser cache.

## Optional website usage statistics

GitHub Pages serves static files and does not store a server-side visitor counter. GitHub's **Insights → Traffic** counts visits to the *repository*, not usage of this web app. Time Audit therefore supports [Umami Cloud](https://umami.is/) as an optional, separate analytics service. Tracking starts only when a Website ID is configured in the Pages build.

For the current `sywan/TimeAudit` deployment, the Umami Website ID has been added as the `VITE_UMAMI_WEBSITE_ID` repository variable for V1.11. The published app can begin recording visits after the V1.11 Pages build succeeds. The `VITE_UMAMI_SHARE_URL` variable must contain a complete HTTPS `/share/…` link, not a Website ID; an invalid value is ignored by the app.

1. Create an Umami Cloud account and add a website named **Time Audit** with domain `sywan.github.io`. Copy its **Website ID** from the tracking code; it is a public identifier, not an API key.
2. In GitHub repository **Settings → Secrets and variables → Actions → Variables**, create `VITE_UMAMI_WEBSITE_ID` with that ID. Run **Actions → Publish Time Audit → Run workflow** (or push a new commit). The workflow passes this variable into the build.
3. Open the published app in a normal browser and inspect the Umami website dashboard for a page view. Your own visit will count during setup. Local development, other domains, Do Not Track, and users who disable anonymous statistics in Settings are excluded. Ad blockers can also prevent collection.
4. To let visitors see aggregate statistics, create a **Share URL** for the website in Umami, selecting only the views you want public. Add that HTTPS `/share/…` link as a second Actions variable named `VITE_UMAMI_SHARE_URL` and rerun the workflow. Time Audit then shows a **網站使用統計 / Site statistics** link on the welcome page and an expandable dashboard in Settings. If your Umami host blocks the embedded view, the adjacent link opens the same dashboard directly. Leave this variable empty to keep the dashboard private in Umami.

The dashboard can show page views, approximate unique visitors, and event counts for `entry_saved`, `journal_edited`, `insights_opened`, and `reflection_opened`. Journal edits are counted at most once per day per open app session to avoid counting every keystroke. These events have **no properties**: no Google ID, activity name, dates, ratings, or journal content. Umami's anonymous visitor and retention measures are approximate across browsers and devices; they cannot prove that an individual kept using Time Audit. The public statistics link opens Umami's read-only dashboard, while private detailed reports stay in the publisher's Umami account. Never put an Umami API key in `VITE_…` variables.

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
