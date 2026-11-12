# 免費多人測試站部署

使用 Render Free Node.js web service 與 Supabase Free Auth／私有 Storage。程式保留原本 Windows 個人模式；雲端模式不會匯入原電腦的金鑰、文件或研究紀錄。

## Supabase

1. 在自己的 Free 組織建立專案。資料庫密碼只留在自己手上。
2. SQL Editor 執行 `supabase-setup.sql`，建立私有 `hengyan-private` bucket 與每個 UID 的讀／寫／刪除 RLS。請使用新專案，避免與既有寬鬆政策疊加。
3. 從 Connect／API Keys 取得 Project URL 與 Publishable key。這不是 `service_role`、Secret key 或資料庫密碼；後端刻意不需要管理密鑰。
4. 在 Auth URL Configuration 設定正式網站 Site URL，Redirect URLs 加入 `https://正式網址/login`。
5. 保持 Email confirmation 開啟。公開 Email 註冊需要另外設定 SMTP；Supabase 預設寄信只接受專案團隊信箱，不能當成對公眾開放的寄信服務。未設定前只測試自己的帳號，不能宣稱一般人可完成註冊。
6. 建議在 Supabase 設定密碼政策、寄信速率與 CAPTCHA，並先用兩個測試帳號實測隔離，再對外邀請使用者。

## Render

建立單一 Web Service：

| 設定 | 值 |
| --- | --- |
| Repository | https://github.com/yan-0202/hengyan-taiwan-agent |
| Branch | main |
| Runtime | Node |
| Plan | **Free** |
| Region | Singapore |
| Build | npm ci --include=dev && npm run typecheck |
| Start | node server.mjs |
| Health check | /healthz |

Environment 設定 `.env.example` 列出的必要變數；`NODE_VERSION=24.19.0`。`AGENT_MASTER_KEY` 應以密碼學亂數產生 32 bytes，編碼成 64 位十六進位，直接存到 Render，另做離線安全備份。遺失或任意更換後，使用者已保存的 API 金鑰將無法解密，需重新輸入；目前沒有線上輪替工具。

不要填入真實 AI 金鑰作為全站預設。每位使用者登入後自行於 AI 團隊配置輸入自己的金鑰。它們以 AES-256-GCM 加密並綁定使用者 UID，Supabase 僅保存密文。解密只在後端進行。

## 必須通過的上線驗收

- 部署狀態 live、`/healthz` 回 200；匿名開首頁轉登入，匿名 API 回 401。
- 註冊、信箱驗證、登入、登出實際成功；Cookie 為 HttpOnly／Secure／SameSite=Lax。
- A 匯入測試文件／設定連線／保存偏好；B 的清單、搜尋、報告、AI 設定與偏好均不能看到 A 的資料。
- 使用 B 的登入 JWT 直接對 Storage 讀取／覆寫／刪除 A 路徑應被 RLS 拒絕。
- 重啟／重新部署後 A 的文件與設定仍存在；執行中的研究可能中斷，需手動續跑。
- 網站與紀錄中沒有明文金鑰；跨來源 POST 被拒絕。

## 免費版本邊界

Render 會休眠，沒有保證持續運行的排程；雲端版拒絕開啟背景排程，手動檢查仍可用。官方資料快取在 Render 暫存空間，重新部署後需重新下載；私人資料在 Supabase。研究仍使用關鍵字 RAG，不是語意向量檢索。

每帳號最多 25 份文件，單份擷取文字限 1 MB，最多兩份團隊研究同時執行；公開站只允許既定 AI 官方服務端點。登入有效期最多一小時，過期需重新登入，沒有保存 refresh token。尚未提供自助密碼重設、帳號刪除、完整備份還原與安全稽核；不宜存放無備份的唯一原件。AI 使用仍依各服務商額度及費率計算。

Supabase Free 可能因低活動暫停，也有專案容量／流量限制。沒有設定任何付費備援或自動升級。不要以保活流量規避免費服務限制。超出免費額度時應停止或縮小使用範圍。

參考：
- https://render.com/docs/free
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/auth/auth-smtp
