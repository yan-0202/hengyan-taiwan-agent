# 衡研｜台股多主理人研究工作台

需要 Windows、Node.js 24。首次在本目錄執行 npm install，之後雙擊 start.cmd，開啟 http://127.0.0.1:8787 。後端必須持續運作。

## 介面

採用共用的淺色紫色研究工作台介面；五個頁面共用側欄與手機導覽。首頁走勢使用櫃買中心實際收盤觀測資料，不補造缺漏的歷史點位；團隊「已分配」僅表示配置存在，不代表服務連線成功。

## 使用順序

1. /ai：保存連線，為五位主理人分配模型、輸出上限與 Skill。
2. /data：更新官方資料，核對觀測日、下載時間與來源錯誤。
3. /workspace：選公司代號，預覽證據；需要時匯入 PDF、XLSX、TXT 或 Markdown，先試搜尋再開始研究。
4. 查看總管分工、獨立初稿、互評、風險審查及裁決，匯出 JSON 或可列印 HTML。
5. /research：免費規則式計畫、計算工具、研究偏好與實際能力地圖。

## 已實作

- 官方收盤行情、全部可取得指數、同日市值前十大；央行匯率、政策利率、貨幣總計數；上市月營收、各產業 EPS、一般業損益及資產負債表。
- 市值依同日收盤價乘股數，排除 ETF／特別股；上市有收盤價普通股須全部完成比對，且上櫃同日才產生合併排名。市值不是投資評等。
- Gemini、Anthropic、Chat Completions 相容 API，各主理人可配置不同連線、模型及 Skill，彼此不共用對話。
- 總管先分工，再由市場、總經、財報獨立初稿。完整模式加入三角色互評，風險評分後總管裁決。完整模式最多 9 次、精簡模式最多 6 次生成；分工格式不符時保留原文並退回既定職責。
- RAG：文件分段、內容雜湊、去重、關鍵字檢索、來源／期間／頁碼或工作表列號；凍結研究證據。XLSX 使用限時限記憶體 worker，只讀儲存值，不重算公式。
- 財務與月營收指標由程式按實際欄位重算，保存公式、來源及輸入，缺少欄位不補造。
- 保存初稿、互評、模型、Skill bundle SHA-256、用量、耗時及錯誤，失敗可續跑未完成步驟；補齊初稿後會重做受影響的互評及裁決，舊版本另存，不自動重試。
- 主動同意保存及清除研究偏好，每次研究另勾選才送給模型。
- 本機定時觀測預設關閉，可設指數門檻與利率生效日變動事件，去重保存；需要後端運作，不呼叫 AI、不下單。
- 金鑰以 Windows DPAPI 加密於 private/connections.json，舊明文設定首次讀取自動原子遷移。須原 Windows 帳號／電腦，不回傳前端；不能防止同帳號惡意程式。

## Skill 實裝

原文來自 [Anthropic Financial Services](https://github.com/anthropics/financial-services)：總管 ic-memo、市場 morning-note、總經 macro-rates-monitor、財報 earnings-analysis、風險 thesis-tracker，保留根 LICENSE。

財報 Skill 三份 references 已補齊；版本來源及雜湊見 skills/references-manifest.json。啟用後實際注入 Skill、財報參考文件與 skills/ADAPTER.md，記錄整個 bundle 雜湊。上游的 DOCX、Bloomberg 共識及 LSEG MCP 要求受實際工具限制，不會宣稱已完成；Skill 不是金融資格認證。

## 實際限制

- 官方自動下載目前是結構化資料，尚非完整歷史財報 PDF／附註庫，也不涵蓋所有金融業；端點缺少公司不能推論數值為零或沒有申報。
- RAG 為關鍵字檢索，無語意向量庫或 OCR。原始上傳檔案沒有另存，請保留原件；複雜表格需人工核對。
- 尚無圖像／影音分析、Gemini CLI／Antigravity 執行器；API 模式可獨立使用。CLI 的官方 headless 介面需另做權限隔離、登入與驗收。
- 尚無盤中即時報價、手機推播、回測／實盤交易、自動調倉、信貸核准或認證 KYC／AML。
- 引用檢查只確認編號，不能證明來源支持主張。模型互評不是正確機率，所有研究需人工核對，不承諾零幻覺。
- 僅監聽 127.0.0.1:8787，設 Host／Origin 檢查；無多人認證及公開部署完整防護，請勿直接映射上網。
- 不可公開 private/ 或 data/。文件節錄會傳往所配置的 AI 服務商。刪除文件不會刪除既有報告證據快照。

## 驗證

型別：node_modules/.bin/tsc -p tsconfig.json。

核心測試：node --test workspace.test.mjs datahub.test.mjs monitor.test.mjs。
AI 協定：node --test ai.test.mjs。文件及匯出：node --test xlsx.test.mjs reports.test.mjs。
整合：node verify.mjs、node workspace-integration.mjs、node ai-integration.mjs（AI 使用模擬）。
examples/synthetic-financial.xlsx 是合成測試數據，不是投資依據。
Computer Use 初始化失敗，API／解析測試不等於瀏覽器視覺驗收。
