# Threads GIF Downloader

貼上 Threads 貼文網址，把該貼文內嵌的所有 GIF 一次抓到本機。

Threads 貼文裡的 GIF 多半是 Giphy 貼圖，而且一篇可能內嵌上百個。
這個工具會讀出貼文（**不含留言**）裡的所有 Giphy GIF，依貼文順序編號存檔，
並順便打包 zip、產生一張總覽圖。

## 畫面

```
┌─ Threads GIF 下載器 ──────────────┐
│  [https://www.threads.com/…] [下載]│
│  尺寸: (●)原圖 ( )200px ( )100px   │
│  ███████████░░░░  下載中 87/135    │
│  [gif][gif][gif]…                  │
│  ✓ 完成 135/135 · 11.0 MB          │
│  [開資料夾] [下載 zip] [總覽圖]     │
└────────────────────────────────────┘
```

## 需求

- [Node.js](https://nodejs.org) 18 以上
- Windows（圖形介面的啟動程式是 Windows 專用；CLI 跨平台）

## 安裝

```bash
cd app
npm install
npx playwright install chromium
```

## 使用方式

### 圖形介面

```bash
cd app
npm start
```

瀏覽器會自動開啟 `http://127.0.0.1:5123`。貼上網址、選尺寸、按下載。

Windows 使用者也可以到 [Releases](../../releases) 下載啟動程式（`.exe`），
放在 `app/` 資料夾的**上一層**（也就是和 `app/` 並排），雙擊即可。
exe 的檔名可以自己改，程式只認旁邊有沒有 `app/` 資料夾：

```
你的資料夾/
├── 任意檔名.exe   ← 從 Release 下載的啟動程式
├── app/           ← 從本 repo clone 下來、並已 npm install
└── downloads/     ← 執行後自動建立
```

程式會常駐在系統列（右下角），右鍵可開啟介面、開啟下載資料夾或結束。

> 這個 exe 沒有程式碼簽章，Windows SmartScreen 會攔一次
> （「其他資訊」→「仍要執行」）。想自己編譯的話，用 Windows 內建的編譯器即可：
>
> ```
> C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe -nologo -target:winexe ^
>   -optimize+ -r:System.Drawing.dll -r:System.Windows.Forms.dll ^
>   -out:"Threads GIF 下載器.exe" app\launcher\Launcher.cs
> ```

### 命令列

```bash
node app/get-thread-gif.js "https://www.threads.com/@USERNAME/post/POSTCODE" [輸出資料夾] [--size=orig|200|100]
```

## 輸出

```
downloads/<貼文代碼>/
├── 001_xxxxxxxx.gif      # 依貼文中的順序編號
├── ...
├── <貼文代碼>.zip          # 全部打包
└── <貼文代碼>_overview.png # 每張第一格拼成的總覽圖
```

尺寸選項：`orig`（原圖，約 0.8 MB/張）、`200`（200px）、`100`（100px）。

## 運作方式

Threads 的貼文內容是前端動態載入的，匿名 `curl` 只會拿到登入頁，
所以這裡用 Playwright 開無頭 Chromium 讀渲染後的 DOM。

定位主貼文的方式：找到指向該貼文的時間戳連結，往上取「還沒包含其他貼文連結」
的最大祖先節點 —— 這樣就能精準圈出主貼文而排除所有留言。
取得 Giphy ID 後，直接從 Giphy CDN 下載（6 條併發，失敗自動重試 3 次）。

## 專案結構

```
Threads GIF 下載器.exe   # 系統列啟動程式（Release 下載，或自行編譯）
app/
├── server.js            # 本機伺服器 + SSE 進度推播（僅綁定 127.0.0.1）
├── lib.js               # 擷取 + 併發下載核心
├── postprocess.js       # zip 打包 / 總覽圖
├── get-thread-gif.js    # CLI
├── public/index.html    # 網頁介面
└── launcher/Launcher.cs # 啟動程式原始碼
downloads/               # 輸出（已 gitignore）
```

## 免責聲明

- Threads 的服務條款禁止未經許可的自動化存取。使用本工具可能違反該條款，
  相關風險（例如帳號被限制）由使用者自行承擔。
- 下載的 GIF 版權屬於原創作者與 Giphy。請僅供個人使用，不要再散布。
- 本專案不包含任何 GIF 內容，只有程式碼。

## 授權

[MIT](LICENSE)
