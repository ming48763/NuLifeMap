from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware # 🌟 1. 新增這行匯入 CORS 工具
import uvicorn
from bs4 import BeautifulSoup
import traceback
import json 
import requests 
import re 
from playwright.async_api import async_playwright

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 允許所有前端來源發送請求
    allow_credentials=True,
    allow_methods=["*"], # 允許 POST, GET, 以及預檢的 OPTIONS
    allow_headers=["*"],
)

TECH_DICTIONARY = [
    "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "PHP", "Ruby", "Go",
    "Vue", "VueJS", "React", "Angular", "Node.js", "Express", "Django", "Flask",
    "Git", "Docker", "Kubernetes", "AWS", "GCP", "Azure", 
    "MySQL", "PostgreSQL", "MongoDB", "Redis",
    "HTML", "CSS", "Sass", "Tailwind"
]

@app.get("/")
def read_root():
    return {"message": "👋 歡迎來到 NuLifeMap 的 Python 爬蟲微服務！"}

# ==================================================
# 📌 路由 1：擷取職缺 (104/1111等)
# ==================================================
@app.post("/scrape/url")
async def scrape_url(url: str):
    try:
        print(f"準備出動 Playwright 裝甲前往職缺網：{url}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            try:
                await page.wait_for_selector("h1", timeout=10000)
            except Exception:
                pass
            html_content = await page.content()
            await browser.close()

        soup = BeautifulSoup(html_content, 'html.parser')

        job_name, company_name, job_location, salary_text = "找不到職缺", "找不到公司", "找不到地點", "面議或未提供"
        job_description, found_skills = "無詳細內容", []

        # 智慧 JSON-LD 挖掘法
        ld_json_scripts = soup.find_all('script', type='application/ld+json')
        for script in ld_json_scripts:
            if not script.string: continue
            try:
                data = json.loads(script.string)
                if isinstance(data, list):
                    for item in data:
                        if item.get('@type') == 'JobPosting':
                            if item.get('title'): job_name = item['title']
                            if item.get('hiringOrganization'): company_name = item['hiringOrganization'].get('name', company_name)
                            if item.get('jobLocation'): job_location = item['jobLocation'].get('address', {}).get('streetAddress', job_location)
                            if item.get('baseSalary'):
                                val = item['baseSalary'].get('value', {})
                                if val.get('minValue') and val.get('maxValue'):
                                    salary_text = f"{val.get('minValue')} ~ {val.get('maxValue')} TWD"
                            if item.get('description'):
                                job_description = BeautifulSoup(item['description'], "html.parser").get_text(separator="\n", strip=True)
            except json.JSONDecodeError:
                continue

        # 關鍵字萃取演算法
        search_text = job_description + " " + job_name
        for tech in TECH_DICTIONARY:
            if re.search(re.escape(tech), search_text, re.IGNORECASE) and tech not in found_skills:
                found_skills.append(tech)

        scraped_data = {
            "type": "job",
            "address": job_location,
            "memo": f"薪資：{salary_text}",
            "jobInfo": {
                "jobTitle": job_name,
                "companyName": company_name,
                "sourceUrl": url,
                "description": job_description, 
                "skills": found_skills          
            }
        }

        node_api_url = "http://127.0.0.1:3000/api/markers"
        requests.post(node_api_url, json=scraped_data)

        return {"status": "success", "message": "職缺資料萃取成功！", "data": scraped_data}
        
    except Exception as e:
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")

# ==================================================
# 🌟 新增路由 2：專門擷取 591 租屋網
# ==================================================
@app.post("/scrape/591")
async def scrape_591(url: str):
    try:
        print(f"🏠 準備出動 Playwright 前往 591 租屋網：{url}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            # 591 對反爬蟲較敏感，需設定逼真的 User-Agent 與視窗大小
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = await context.new_page()
            
            # 載入網頁並稍微等待 JavaScript 渲染
            await page.goto(url, wait_until="networkidle", timeout=30000)
            
            try:
                # 嘗試等待 591 標題出現 (通常是 h1 或帶有特定 class)
                await page.wait_for_selector("h1", timeout=8000)
            except Exception:
                print("⚠️ 警告：等待 591 標題超時，強制擷取目前畫面。")
            
            html_content = await page.content()
            await browser.close()

        soup = BeautifulSoup(html_content, 'html.parser')

        # 🌟 為了對抗 591 經常變動的標籤，將整頁文字抽出用正規表達式 (Regex) 精準比對
        text_dump = soup.get_text(separator=' ', strip=True)

        # 初始化預設值
        title = "找不到租屋標題"
        address = "找不到地點"
        price = "未知租金"
        area = "未提供"
        floor = "未提供"
        cooking = "未知"
        contact = "未提供"
        is_agent = "未知"

        # 1. 抓取標題
        h1_tag = soup.find('h1')
        if h1_tag: title = h1_tag.get_text(strip=True)

        # 🌟 2. 升級版：抓取價格 (精準計算 月租 與 額外費用總和)
        base_price_val = 0
        extra_fee_val = 0

        # 2-1: 找尋主租金 (尋找網頁中第一個出現的 "X,XXX 元/月")
        price_m = re.search(r'((?:[1-9]\d{0,2}(?:,\d{3})+|\d+))\s*元\s*/\s*月', text_dump)
        if price_m:
            base_price_str = price_m.group(1)
            base_price_val = int(base_price_str.replace(',', ''))
        
        # 2-2: 找尋額外費用 (尋找 "額外費用 500" 或 "管理費 500" 的數字)
        extra_m = re.search(r'(?:額外費用|管理費)[^\d]*((?:[1-9]\d{0,2}(?:,\d{3})+|\d+))', text_dump)
        if extra_m:
            extra_fee_str = extra_m.group(1)
            extra_fee_val = int(extra_fee_str.replace(',', ''))
        
        # 2-3: 整合與計算總價
        if base_price_val > 0:
            if extra_fee_val > 0:
                total_val = base_price_val + extra_fee_val
                # 組合出：月租 7,499 元 (含額外費用總計 7,999 元/月)
                price = f"月租 {base_price_val:,} 元 (總支出約 {total_val:,} 元/月)"
            else:
                price = f"月租 {base_price_val:,} 元/月"
        else:
            price = "未知租金"

        # 🌟 升級版：直接從 HTML 中的 __NUXT__ 變數提取 JSON 資料
        nuxt_match = re.search(r'window\.__NUXT__=(.*)', html_content)
        address = "找不到地址"
        
        if nuxt_match:
            try:
                # 這裡使用了比較複雜的處理，因為 __NUXT__ 是個 JS 格式，需要轉成 JSON
                # 為了簡單起見，我們利用 BeautifulSoup 加上 Regex 搜尋 address 欄位
                # 在您的 HTML 中，地址明確在 positionRound 下面
                addr_match = re.search(r'"positionRound":{.*?,"address":"([^"]+)"', html_content)
                if addr_match:
                    address = addr_match.group(1)
            except Exception as e:
                print(f"解析 Nuxt 資料失敗: {e}")

        # 如果上面抓不到，保留原有的兜底抓取邏輯
        if address == "找不到地址":
             address_tag = soup.select_one('.load-map') or soup.select_one('.address')
             if address_tag: address = address_tag.get_text(strip=True)

        # 4. 抓取坪數
        area_m = re.search(r'(\d+(?:\.\d+)?)\s*坪', text_dump)
        if area_m: area = area_m.group(1) + "坪"

        # 5. 抓取樓層
        floor_m = re.search(r'(\d+F\s*/\s*\d+F|\d+樓\s*/\s*\d+樓)', text_dump, re.IGNORECASE)
        if floor_m: floor = floor_m.group(1).replace(" ", "")

        # 6. 抓取可否開伙
        if "不可開伙" in text_dump or "不可開 伙" in text_dump:
            cooking = "不可開伙"
        elif "可開伙" in text_dump or "可開 伙" in text_dump:
            cooking = "可開伙"

        # 🌟 7. 抓取聯絡方式 (尋找台灣手機號碼格式 09XX-XXX-XXX)
        contact_m = re.search(r'(09\d{2}[- \.]?\d{3}[- \.]?\d{3})', text_dump)
        if contact_m: contact = contact_m.group(1)

        # 🌟 8. 判斷是否為仲介
        if "仲介" in text_dump or "服務費" in text_dump or "經紀人" in text_dump:
            is_agent = "是 (仲介/代理)"
        elif "屋主" in text_dump:
            is_agent = "否 (屋主自租)"

        # 🌟 整理回傳給 Node.js 的資料，加入 contact 與 is_agent
        scraped_data = {
            "type": "housing",
            "address": address,
            "memo": f"租金：{price} | {area} | {floor}",
            "houseInfo": {
                "title": title,
                "price": price,
                "area": area,
                "floor": floor,
                "cooking": cooking,
                "contact": contact,
                "is_agent": is_agent,
                "sourceUrl": url
            }
        }

        print(f"🎉 成功解剖 591！標題：{title} | 聯絡：{contact} | 仲介：{is_agent}")

        # 🚀 呼叫 Node.js 後端 API 存入資料庫
        node_api_url = "http://127.0.0.1:3000/api/markers"
        try:
            node_response = requests.post(node_api_url, json=scraped_data)
            if node_response.status_code in [200, 201]:
                print("✅ 成功！Node.js 已將 591 租屋資料寫入 MongoDB！")
            else:
                print(f"⚠️ 傳送失敗，狀態碼：{node_response.status_code}")
        except Exception as db_err:
            print(f"❌ 無法連線至 Node.js 伺服器：{db_err}")

        return {
            "status": "success",
            "message": "591 租屋資料擷取成功！",
            "data": scraped_data
        }
        
    except Exception as e:
        print("❌ 發生未知的內部錯誤：")
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)