# Time Audit

Time Audit is a Traditional Chinese and English React app for recording and reviewing how time is spent.

**Public app:** https://sywan.github.io/TimeAudit/

The hosted build currently offers a device-only preview until the publisher adds a Google OAuth Web Client ID. Preview entries remain in that browser. Once Google sign-in is configured, users can authorize the app's limited `drive.file` access and sync their own journal to their own Google Drive.

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
