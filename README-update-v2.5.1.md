# FitWeek v2.5.1｜無文字動作圖片更新

本更新已包含完整網站與 15 張 PNG 圖片，解壓後即可上傳至原本的網站。

## 更新內容

- 所有動作圖移除圖片內的文字，保留人物、器材與方向箭頭。
- 動作名稱、左右圖說與完整要領以繁體中文網頁文字呈現。
- 補齊胸靠斜椅划船、胸靠斜椅反向飛鳥兩張圖片。
- Cindy 徒手深蹲使用獨立圖片；輔助引體向上與 Day B 共用圖片。
- 圖片預先下載並快取，下載成功後可離線查看；個別圖片失敗仍保留完整文字要領。
- 程式與載入版本統一為 2.5.1。課表、組數、紀錄與進度判定沿用原版。

## 上傳方法

1. 將 ZIP 解壓縮。
2. 把全部檔案與 images 資料夾一起上傳至原 GitHub 儲存庫的網站根目錄。index.html 應保持在原本的位置。
3. 等網站發布完成，再重新整理網頁，展開「動作示意與完整要領」。

更新不需要清除網站資料。使用同一網址與同一瀏覽器，可繼續讀取原本保存在瀏覽器的訓練紀錄。
第一次載入圖片需連線，完整圖片約 24 MB；下載完成後即可使用快取。

## 圖片位置

全部圖片放在 images/exercises/。

| 動作 | 檔名 |
|---|---|
| 中立握啞鈴肩推 | neutral-db-shoulder-press.png |
| 低上斜中立握啞鈴胸推 | incline-db-press.png |
| 啞鈴側平舉 | lateral-raise.png |
| 啞鈴過頭三頭屈伸 | db-overhead-triceps-extension.png |
| 彈力帶輔助引體向上 | band-assisted-pull-up.png |
| 胸靠斜椅啞鈴划船 | chest-supported-row.png |
| 胸靠斜椅反向飛鳥 | chest-supported-reverse-fly.png |
| 啞鈴槌式彎舉 | hammer-curl.png |
| 死蟲式 | dead-bug.png |
| 箱式高腳杯深蹲 | goblet-squat.png |
| 啞鈴羅馬尼亞硬舉 | db-rdl.png |
| 啞鈴臀推 | db-hip-thrust.png |
| 站姿提踵 | standing-calf-raise.png |
| 上斜伏地挺身 | cindy-push-up.png |
| 徒手深蹲 | cindy-air-squat.png |

## 已完成的檢查

- 15 張 PNG 檔案皆可解碼，尺寸均為 1448 × 1086。
- 16 個課表項目對應正確，包含 Cindy 共用引體向上及獨立徒手深蹲圖片。
- 原課表、組數與訓練判定程式維持原版，節拍器程式碼完整保留。
- 原有訓練紀錄、飲食照片、歷史修正、備份還原、連續次數、每週重量檢視與 Cindy 檢查通過。
- 使用實際 HTTP 圖片資料及模擬 Service Worker API，確認快取讀取、離線回退、舊版查詢參數、圖片失敗與快取空間不足的處理。
- 尚未使用實體 iPhone 或實際瀏覽器驗證畫面與背景播放。

## 兩張補圖的生成紀錄

生成方式：內建 imagegen 圖片工具，依既有圖片參考編修，非 CLI 模式。
成品檔名：chest-supported-row.png、chest-supported-reverse-fly.png。

### 共用提示詞原文

Use case: precise-object-edit. Asset type: standalone PNG exercise illustration for a mobile workout website. Use the specified reference illustration as the edit target. Preserve its two side-by-side panels, same adult man in gray sleeveless shirt and sage green shorts, black incline bench and black dumbbells, warm off-white background, realistic polished 3D illustration style, thin rounded panel borders, soft shadows and gold movement arrows. Reproduce the target as one clean landscape 4:3 image. Absolutely ZERO text, letters, numbers, labels, logos or watermarks, and no empty title pills or caption ribbons. Preserve correct anatomy, two arms with two hands, two legs, and one dumbbell securely held by each hand. Do not combine different exercises in the output.

### 划船提示詞原文

Of the references, use ONLY the CHEST-SUPPORTED DUMBBELL ROW: the man faces downward with chest against the incline bench, weights hanging below shoulders in the left panel, elbows bending and pulling dumbbells toward waist in the right panel. Keep chest supported, neck neutral and elbows close to the torso. Maintain the front three-quarter camera view.

### 反向飛鳥提示詞原文

Use ONLY the CHEST-SUPPORTED REVERSE FLY reference: rear three-quarter view, chest supported on incline bench throughout, arms hanging down in the left panel, arms opening out to both sides with a small fixed elbow bend in the right panel. Keep both dumbbells visible and maintain a fly rather than a bent-elbow row.
