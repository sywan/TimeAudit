# Time Audit：Google 登入設定（GitHub Pages 版）

網站：`https://sywan.github.io/TimeAudit/`  
GitHub 儲存庫：`https://github.com/sywan/TimeAudit`

以下是**發佈者做一次**的設定。訪客之後只需按「使用 Google 繼續」，再授權自己的 Drive。請先用自己的帳號測試；Google 的 Testing 模式只開放列入測試名單的帳號。

**2026-10-15 更新：**Google 已對 `https://sywan.github.io/TimeAudit/` 的正式品牌驗證回報「home page URL is not registered to you」。這不是 GitHub 儲存庫擁有權問題，而是 Google 要求驗證網站網域的 DNS 所有權。Google 的正式網域驗證說明要求在 Search Console 驗證 **Domain property（DNS TXT）**；`github.io` 的 DNS 由 GitHub 控制，無法由此儲存庫證明。**Testing 可以繼續用來試驗；若要正式開放所有 Google 帳號，請改用可控制 DNS 的自有網域。**不要在未解決前選「I have fixed the issues」，也不需要建立 GitHub Issue。

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，登入你要作為發佈者的 Google 帳號。畫面上方選擇專案 → **New Project／新增專案**，名稱可填 `Time Audit`，建立後選取它。
2. 左上選單進入 **Google Auth Platform → Branding**。若顯示 **Get started**，按下並建立品牌。App name 填 `Time Audit`；User support email 選你的電子郵件。在 **Authorized domains** 先嘗試加入 `sywan.github.io`（不要填整個網址）。首頁填 `https://sywan.github.io/TimeAudit/`，隱私政策填 `https://sywan.github.io/TimeAudit/privacy.html`，服務條款填 `https://sywan.github.io/TimeAudit/terms.html`。Developer contact information 填你用來收 Google 通知的信箱。依畫面完成必要欄位；若 Google 拒絕 `sywan.github.io`，請停在該頁，不要改填你不擁有的 `github.io`。
3. 到 **Google Auth Platform → Audience**，選 **External**。初期保持 **Testing**，在 **Test users** 加入你自己的 Google 電子郵件；要一起試用的人也在這裡加入。
4. 在 **Google Auth Platform → Data Access** 加入 `https://www.googleapis.com/auth/drive.file`；V1.20 的行事曆匯入另需 `https://www.googleapis.com/auth/calendar.events.readonly`。登入所需的 `openid`、`email`、`profile` 是基本身分權限。接著到 **APIs & Services → Library**，分別啟用 **Google Drive API**、**Google Sheets API** 和 **Google Calendar API**。
5. 到 **Google Auth Platform → Clients → Create client**，Application type 選 **Web application**，名稱可填 `Time Audit Web`。在 **Authorized JavaScript origins** 只填 `https://sywan.github.io`：**不要**加 `/TimeAudit/` 路徑，也不要加結尾斜線。這個 App 使用瀏覽器彈窗 token flow，**Authorized redirect URIs 留空**。按 Create，複製以 `.apps.googleusercontent.com` 結尾的 **Client ID**。**Client Secret 不要貼到 GitHub、App 或訊息中。**
6. 到 [TimeAudit 的 GitHub Actions Variables](https://github.com/sywan/TimeAudit/settings/variables/actions)，選 **New repository variable**：Name 填 `VITE_GOOGLE_CLIENT_ID`，Value 貼剛才的 **Client ID**，按 **Add variable**。Client ID 是公開的瀏覽器識別碼，可以用 Variable；不要建立 Secret 或貼 Client Secret。
7. 到 [Publish Time Audit 工作流程](https://github.com/sywan/TimeAudit/actions/workflows/pages.yml)，按 **Run workflow → Run workflow**。等工作流程成功後，重新整理 [Time Audit 網站](https://sywan.github.io/TimeAudit/)，應會出現 Google 登入按鈕。用測試帳號登入，按 App 內的 **授權使用我的 Drive**，新增一筆紀錄，確認該帳號自己的 Google Drive 有 `Time Audit` 資料夾和檔案。
8. 正式公開前，先審閱網站目前標示為草案的隱私說明與使用條款，補齊支援聯絡方式。取得可控制 DNS 的網域後，例如 `example.com`，可將 `audit.example.com` 連到現有 GitHub Pages；無須自行架伺服器。用 Google Cloud 專案 Owner 帳號在 Search Console 建立 **Domain property**，依指示加入 DNS TXT 並驗證。接著把 Google Branding 的首頁、隱私、條款、Authorized domains，以及 Web Client 的 JavaScript origin 改為新網域；網站的 GitHub Pages custom domain 與 Vite 路徑也需同步調整。確認新網址可以登入與同步後，再重新申請品牌驗證、等待 Google 檢查，並到 Audience 發布為 In production。網域未就緒前可維持 Testing。

**目前狀態：**GitHub Pages 網站已公開，Client ID 已加入 GitHub，Google 登入按鈕已出現。Google 的正式品牌驗證拒絕 `sywan.github.io` 首頁所有權；因此目前應以 Testing 模式試用，只有列入 Test users 的帳號可以完整授權 Drive。使用者的正式資料在完成 Google 授權後寫入各自的 Drive。

官方參考：[Google 首頁所有權問題](https://support.google.com/cloud/answer/13807376)、[Google 網域驗證：Domain property 與 DNS TXT](https://support.google.com/cloud/answer/13804266)、[Google OAuth Audience／Testing](https://support.google.com/cloud/answer/15549945)、[GitHub Pages 自訂網域](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。

## V1.20 行事曆匯入與備份

行事曆匯入在 App 的「日曆 → 從 Google 匯入」中由使用者額外授權，權限與登入及 Drive 同步分開。若目前 OAuth 應用程式尚未完成 Google 的敏感權限審查，非測試帳號可能無法授權 Calendar；不要把失敗當作 Time Audit 紀錄被刪除。Google Drive 備份與還原使用既有 `drive.file` 權限，不需要另外建立 OAuth Client ID。
