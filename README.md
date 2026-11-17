# NuLifeMap — 新生活藍圖

規劃新生活時用的地圖工作台：把租屋、職缺與自訂地點標在同一張乾淨地圖上，再用範圍與測距評估通勤與生活圈。

**Demo：** [https://nu-life-map-frontend.vercel.app](https://nu-life-map-frontend.vercel.app/)

![NuLifeMap 登入頁](docs/hero.png)

---

## 解決了什麼痛點

當初離開南投要到台中時，新環境人生地不熟，因此想要先把工作職缺、租屋地點、周遭機能做個彙整，可惜現有的地圖工具並無法提供乾淨簡潔的頁面，讓地點分布一目了然，去進行後續的評估，因此這成為了我的第一個 side project。

---

## 技術棧（Tech Stack）

| 層級 | 技術 |
| --- | --- |
| 前端 | React 19、Vite、Tailwind CSS 4、`@react-google-maps/api`、Lucide |
| 後端 | Node.js、Express 5、Mongoose |
| 爬蟲微服務 | Python、FastAPI、Playwright（含 stealth）、BeautifulSoup、uvicorn |
| 資料庫 | MongoDB Atlas |
| 外部 API | Google Maps／Geocoding、Dicebear（頭像） |
| 部署 | 前端 Vercel；後端 Render；爬蟲可獨立服務部署 |

---

## 核心功能與技術亮點

- **三面向標記**  
  居住（租屋）、工作（職缺）、生活（自訂地點）分色標示；地圖樣式刻意精簡，減少商家雜訊。

- **104 職缺解析**  
  職缺頁常被反爬導錯，改走 104 官方 ajax content API，再寫入後端並標到地圖座標。

- **591 租屋爬取**  
  Python 微服務專責擷取 591 物件資訊，回傳結構化資料供前端標註。

- **Google Maps 互動**  
  自訂標記與資訊卡、範圍畫圈（找附近租屋／職缺）、測距／路徑時間，協助判斷通勤成本。

- **帳號與雲端資料**  
  登入後依使用者存取標記與個人資料；前後端分離，前端讀環境變數連接 API。

- **部署分工**  
  靜態前端在 Vercel，API 在 Render，MongoDB 存持久資料，爬蟲服務可獨立擴充。
