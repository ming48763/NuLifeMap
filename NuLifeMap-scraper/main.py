from fastapi import FastAPI, HTTPException
import uvicorn
from bs4 import BeautifulSoup
import traceback
import json 
import requests 
import re  # 🌟 新增：引入正則表達式模組，用來處理更強大的字串搜尋
from playwright.async_api import async_playwright

app = FastAPI()

# 🌟 建立你的專屬「技術字典清單」 (你可以隨時自由擴充！)
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

@app.post("/scrape/url")
async def scrape_url(url: str):
    try:
        print(f"準備出動 Playwright 裝甲前往：{url}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            print("等待網頁基本框架載入中...")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            print("狙擊手就位，等待 H1 標籤出現...")
            try:
                await page.wait_for_selector("h1", timeout=10000)
            except Exception:
                print("⚠️ 警告：等待超時，強制擷取目前畫面。")
            
            html_content = await page.content()
            await browser.close()

        soup = BeautifulSoup(html_content, 'html.parser')

        # === 🌟 終極解剖邏輯開始 ===
        job_name = "找不到職缺"
        company_name = "找不到公司"
        job_location = "找不到地點"
        salary_text = "面議或未提供"
        job_description = "無詳細內容"  # 新增：工作內容
        found_skills = []             # 新增：萃取出的技能標籤陣列

        # 1. 傳統抓法 (當作備案)
        h1_tag = soup.find('h1')
        if h1_tag: job_name = h1_tag.get_text(strip=True)

        # 2. 🌟 智慧 JSON-LD 挖掘法 
        ld_json_scripts = soup.find_all('script', type='application/ld+json')
        for script in ld_json_scripts:
            if not script.string: continue
            try:
                data = json.loads(script.string)
                # 處理 104 的清單格式
                if isinstance(data, list):
                    for item in data:
                        if item.get('@type') == 'JobPosting':
                            if item.get('title'): job_name = item['title']
                            
                            if item.get('hiringOrganization'):
                                company_name = item['hiringOrganization'].get('name', company_name)
                                
                            if item.get('jobLocation'):
                                address_info = item['jobLocation'].get('address', {})
                                job_location = address_info.get('streetAddress', job_location)
                                
                            if item.get('baseSalary'):
                                val = item['baseSalary'].get('value', {})
                                min_s = val.get('minValue')
                                max_s = val.get('maxValue')
                                if min_s and max_s:
                                    salary_text = f"{min_s} ~ {max_s} TWD"
                                    
                            # 🌟 新增：抓取工作內容，並清洗 HTML 標籤
                            if item.get('description'):
                                raw_html_desc = item['description']
                                # 利用 BeautifulSoup 把 <br> 轉成換行，還原乾淨文字
                                job_description = BeautifulSoup(raw_html_desc, "html.parser").get_text(separator="\n", strip=True)

                # 處理單一字典格式 (防呆)
                elif isinstance(data, dict) and data.get('@type') == 'JobPosting':
                     if data.get('title'): job_name = data['title']
                     if data.get('hiringOrganization'): company_name = data['hiringOrganization'].get('name', company_name)
                     if data.get('jobLocation'): job_location = data['jobLocation'].get('address', {}).get('streetAddress', job_location)
                     if data.get('description'): 
                         job_description = BeautifulSoup(data['description'], "html.parser").get_text(separator="\n", strip=True)
            except json.JSONDecodeError:
                continue

        # 3. 🌟 關鍵字萃取演算法 (正則表達式法)
        search_text = job_description + " " + job_name
        
        for tech in TECH_DICTIONARY:
            # 使用正則表達式 (re) 進行「忽略大小寫 (IGNORECASE)」的搜尋
            # re.escape 可以安全處理包含特殊符號的技術名稱 (如 C++, Node.js)
            if re.search(re.escape(tech), search_text, re.IGNORECASE):
                # 避免重複，例如 Vue 跟 VueJS
                if tech not in found_skills:
                    found_skills.append(tech)

        # === 整理回傳資料 ===
        scraped_data = {
            "type": "job",
            "address": job_location,
            "memo": f"薪資：{salary_text}",
            "jobInfo": {
                "jobTitle": job_name,
                "companyName": company_name,
                "sourceUrl": url,
                "description": job_description, # 🌟 新增寫入工作內容
                "skills": found_skills          # 🌟 新增寫入技能陣列
            }
        }

        print(f"🎉 成功解剖！公司：{company_name} | 職缺：{job_name}")
        print(f"🎯 成功萃取技能：{found_skills}")

        # === 🚀 呼叫 Node.js 後端 API 存入資料庫 ===
        node_api_url = "http://127.0.0.1:3000/api/markers"
        try:
            print("正在將資料傳送給 Node.js 主伺服器...")
            node_response = requests.post(node_api_url, json=scraped_data)
            
            if node_response.status_code == 200 or node_response.status_code == 201:
                print("✅ 成功！Node.js 已將資料寫入 MongoDB 資料庫！")
            else:
                print(f"⚠️ 傳送給 Node.js 失敗，狀態碼：{node_response.status_code}")
                
        except Exception as db_err:
            print(f"❌ 無法連線至 Node.js 伺服器 (請確認 Node 的 server.js 是否有開啟)。錯誤：{db_err}")

        return {
            "status": "success",
            "message": "資料萃取完美成功！並且已自動發送至 Node.js 存檔",
            "data": scraped_data
        }
        
    except Exception as e:
        print("❌ 發生未知的內部錯誤：")
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)