# Time Audit

Time Audit is a Traditional Chinese and English React app for recording and reviewing how time is spent.

**Public app:** https://sywan.github.io/TimeAudit/

The hosted build supports Google sign-in when the publisher configures its OAuth Web Client ID. After authorization, users can sync their journal to their own Google Drive with the limited `drive.file` scope. A device-only preview is also available; its entries remain in that browser.

**Current version:** v0.99 · The copyright notice opens inside Settings without leaving the signed-in app. Completed questionnaire answers merge across devices in each user’s Drive `Time Audit/profile.json`. [Copyright notice](https://sywan.github.io/TimeAudit/copyright.html) · © 2026–2027 Shu-Yen Wan（萬書言）.

## Publisher setup

1. In **Settings → Pages**, choose **GitHub Actions** as the source.
2. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_GOOGLE_CLIENT_ID` with the OAuth **Web application Client ID**. This is a public identifier, not a client secret.
3. In **Actions**, run **Publish Time Audit** again. The build reads that variable and publishes the app.

The OAuth client's Authorized JavaScript origin for this site is `https://sywan.github.io` (without `/TimeAudit/`). Google Drive API and Google Sheets API must be enabled in that Google Cloud project. Use a Google account listed as a test user while the OAuth app is in Testing mode.

## Development

```sh
cd app
npm ci
npm run dev
```

The `app` folder contains only app code and public site assets. No journal data, book excerpts, credentials, or client secret are stored in this repository.

## 同步本機程式與 GitHub / Sync a local checkout

這些指令同步的是**程式碼**，不會下載任何使用者的時間紀錄。已在 Codex 的 `TimeAudit` 工作資料夾中時，公開網站對應的 Git checkout 是 **`.github-pages-source`**。先在終端機進入它：

```sh
cd .github-pages-source
git status -sb
git switch main
git fetch origin
git pull --ff-only origin main
git log -1 --oneline
```

若是在另一台電腦第一次取得程式，先執行 `git clone https://github.com/sywan/TimeAudit.git`、`cd TimeAudit`，再從 `git status -sb` 開始。`fetch` 取得 GitHub 的最新提交資訊；`pull --ff-only` 只在可以安全地快轉時更新本機 `main`。日後在本機修改並提交後，才用 `git push origin main` 發佈；推送成功後，GitHub Actions 會重新部署 Pages。

執行 `pull` 前先看 `git status -sb`：若有未提交的檔案，先提交或暫存；若顯示本機與 GitHub 已分叉，`--ff-only` 會停止，此時應先檢查差異並處理提交，不要用 `reset --hard` 強制覆蓋。Codex 工作資料夾的**外層** `TimeAudit` 是另一個 checkout，可能有獨立提交及未提交變更；不要把上述指令直接套到外層，以免混淆兩份歷史。
