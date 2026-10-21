# Time Audit：公開發佈與 Google 登入設定

## 目前狀態（2026-10-15）

- 公開網站已在 `https://sywan.github.io/TimeAudit/` 上線；它不依賴發佈者的筆電開機。
- Google OAuth Web Client ID 已建立並加入 GitHub，登入按鈕已顯示。Google Testing 模式可供 Test users 試驗 Drive 同步。
- Google 的正式品牌驗證已拒絕 `sywan.github.io` 首頁的所有權；因此目前不能宣稱任何 Google 帳號都能完整授權。正式公開須使用可控制 DNS 的網域並完成驗證。

## 公開服務的運作方式

完成下列設定並測試後，任何取得公開網址的人都能在瀏覽器開啟網站，使用自己的 Google 帳號登入，授權應用程式存取它建立或開啟的 Drive 檔案。時間日誌會同步到**該使用者自己的 Google Drive**，而不是發佈者的 Drive 或筆電。使用者可在支援的瀏覽器把網站安裝到電腦或手機主畫面。網站由託管服務持續提供；發佈者不必讓筆電一直開機。

瀏覽器本機另有快取。若 Google 授權尚未完成，畫面會提示資料仍在本機；瀏覽器關閉時，現有提醒機制不會持續發送通知。

## 不買網域，先用 GitHub Pages

發佈者已有公開的 [`sywan/TimeAudit`](https://github.com/sywan/TimeAudit) 儲存庫；React app 已部署到 `https://sywan.github.io/TimeAudit/`。GitHub Pages 託管公開靜態網站，網站運作不需要發佈者筆電開機。公開儲存庫只放 app 程式碼與公開頁面，不放原始書籍文章、私人筆記、資料紀錄、金鑰或本機環境檔案。

GitHub Pages 解決的是**網站公開託管**。Google OAuth Testing 模式可讓指定測試帳號授權；Google 已對此專案的 `github.io` 首頁回報「not registered to you」。Google 的正式網域驗證要求在 Search Console 驗證 **Domain property（DNS）**；GitHub 帳號擁有權不能替代網域所有權。因此，不買網域可以繼續開發和 Testing，但正式向所有 Google 帳號開放須改用可控制 DNS 的網域。

目前 GitHub Pages 建置已使用 `/TimeAudit/` 路徑；若改用自訂網域，需把建置路徑調整為該網域上的實際路徑。

## 正式向所有人開放 Google 登入的設定

1. **準備可控制 DNS 的網域。** 建議使用自己的網域與子網域，例如 `audit.your-domain.example`。在 GitHub Pages 設定 Custom domain，依 GitHub 指示設定 DNS CNAME；在 Google Search Console 以 Google Cloud 專案 Owner 帳號建立 **Domain property**，加入 DNS TXT 並驗證。購買網域是發佈者自行決定的付費步驟；目前沒有執行。
2. **審閱網站政策頁。** 已準備 `/privacy.html` 與 `/terms.html` 草案。公開前請確認資料處理文字、發佈者身分和支援聯絡信箱，並將它們放在自有網域下。必要時更新首頁文字與圖示。
3. **建立 Google Cloud 專案。** 在 Google Auth Platform 設定品牌名稱、支援電子郵件、首頁、隱私權政策和服務條款網址；使用對外（External）受眾。尚在 Testing 階段時，先加入測試帳號。
4. **啟用 API 與權限。** 啟用 Google Drive API、Google Sheets API、Google Calendar API；在 Data Access 加入 `https://www.googleapis.com/auth/drive.file` 與行事曆匯入使用的 `https://www.googleapis.com/auth/calendar.events.readonly`。行事曆是使用者主動按匯入時另行授權，公開使用可能需要 Google 的敏感權限審查。應用程式也使用 OpenID 基本身分資訊（`openid profile email`）核對登入帳號與 Drive 授權帳號相同。不要要求完整 Drive 權限。
5. **建立 OAuth 用戶端。** 類型選 **Web application**，在 Authorized JavaScript origins 加入正式網站的完整 origin，例如 `https://audit.your-domain.example`。本機開發可另加 `http://127.0.0.1:5173`。這個前端 token flow 不使用 client secret，也不需要自訂 redirect URI。複製 `…apps.googleusercontent.com` 結尾的 **Client ID**。
6. **設定建置並發佈。** 將 Client ID 設為 `VITE_GOOGLE_CLIENT_ID`，重新建置並部署網站。Client ID 可公開在瀏覽器程式中；**不要**把 Client Secret 放到網頁或 Git。原始碼的 `app/.env.example` 提供格式。
7. **端到端驗收。** 用另一個 Google 測試帳號，在正式網域登入並授權 Drive，新增一筆紀錄，確認自己的 Drive 出現 `Time Audit` 資料夾、月份 JSON、`profile.json` 與試算表；換裝置登入同一帳號後確認紀錄。再用不同帳號確認彼此資料不互通，並測試撤銷授權、重新授權及匯出。
8. **切換公開。** 完成上述驗收與 Google 所需的品牌審核後，在 Google Auth Platform 的 Audience 發布為 In production。GitHub Pages 網站目前已公開；之後訪客只需網址、瀏覽器與自己的 Google 帳號，不需自行去 Google Cloud 建專案。

## 尚未持有自有網域時

可以繼續在公開的 GitHub Pages 網址審查 UI，並以 Google Cloud 的 Testing 模式讓 Test users 試驗 OAuth。此專案的正式品牌驗證已回報首頁網域所有權問題；要對所有人長期開放，需取得可控制 DNS 的網域，完成 Search Console Domain property 驗證，並更新網站及 Google OAuth 的網址。

## 參考文件

- [Google Identity Services：取得 Web Client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google OAuth 政策與應用程式首頁要求](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google Auth Platform：網域驗證](https://support.google.com/cloud/answer/13804266)
- [Google Drive 建議的最小權限](https://support.google.com/cloud/answer/13807380)
- [Google OAuth 驗證流程](https://support.google.com/cloud/answer/13463073)
- [Google Search Console 網站擁有權驗證](https://support.google.com/webmasters/answer/9008080)
