from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel # 🌟 新增匯入 BaseModel
import uvicorn
from bs4 import BeautifulSoup
import traceback
import json 
import requests 
import re 
from playwright.async_api import async_playwright
import os 
from dotenv import load_dotenv

# 🌟 載入同目錄下的 .env 檔案
load_dotenv()

# 🌟 絕對安全的作法：只從環境變數讀取，不留下任何寫死的金鑰
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
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

# 定義將地址轉換為經緯度的非同步函式
async def geocode_address(address: str) -> dict:
    if not GOOGLE_API_KEY:
        print("⚠️ 警告：未設定 GOOGLE_API_KEY，將略過經緯度轉換。請檢查 .env 檔案！")
        return {"lat": None, "lng": None}
        
    try:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"address": address, "key": GOOGLE_API_KEY}
        response = requests.get(url, params=params)
        data = response.json()
        
        if data.get("status") == "OK" and len(data.get("results", [])) > 0:
            location = data["results"][0]["geometry"]["location"]
            return location
        else:
            print(f"⚠️ Geocoding 失敗：{data.get('status')} - 無法解析地址 '{address}'")
            return {"lat": None, "lng": None}
    except Exception as e:
        print(f"❌ 呼叫 Geocoding API 發生錯誤：{e}")
        return {"lat": None, "lng": None}

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
                
        # 將抓到的地址轉換為經緯度
        coordinates = await geocode_address(job_location)

        scraped_data = {
            "type": "job",
            "address": job_location,
            "lat": coordinates.get("lat"),
            "lng": coordinates.get("lng"),
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
# 🌟 路由 2：專門擷取 591 租屋網
# ==================================================
@app.post("/scrape/591")
async def scrape_591(url: str):
    try:
        print(f"🏠 準備出動 Playwright 前往 591 租屋網：{url}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = await context.new_page()
            
            await page.goto(url, wait_until="networkidle", timeout=30000)
            
            try:
                await page.wait_for_selector("h1", timeout=8000)
            except Exception:
                print("⚠️ 警告：等待 591 標題超時，強制擷取目前畫面。")
            
            html_content = await page.content()
            await browser.close()

        soup = BeautifulSoup(html_content, 'html.parser')
        text_dump = soup.get_text(separator=' ', strip=True)

        title, address, price, area, floor, cooking, contact, is_agent = "找不到租屋標題", "找不到地點", "未知租金", "未提供", "未提供", "未知", "未提供", "未知"

        h1_tag = soup.find('h1')
        if h1_tag: title = h1_tag.get_text(strip=True)

        base_price_val, extra_fee_val = 0, 0
        price_m = re.search(r'((?:[1-9]\d{0,2}(?:,\d{3})+|\d+))\s*元\s*/\s*月', text_dump)
        if price_m: base_price_val = int(price_m.group(1).replace(',', ''))
        
        extra_m = re.search(r'(?:額外費用|管理費)[^\d]*((?:[1-9]\d{0,2}(?:,\d{3})+|\d+))', text_dump)
        if extra_m: extra_fee_val = int(extra_m.group(1).replace(',', ''))
        
        if base_price_val > 0:
            price = f"月租 {base_price_val:,} 元 (總支出約 {base_price_val + extra_fee_val:,} 元/月)" if extra_fee_val > 0 else f"月租 {base_price_val:,} 元/月"
        else:
            price = "未知租金"

        nuxt_match = re.search(r'window\.__NUXT__=(.*)', html_content)
        address = "找不到地址"
        if nuxt_match:
            try:
                addr_match = re.search(r'"positionRound":{.*?,"address":"([^"]+)"', html_content)
                if addr_match: address = addr_match.group(1)
            except Exception as e:
                pass

        if address == "找不到地址":
             address_tag = soup.select_one('.load-map') or soup.select_one('.address')
             if address_tag: address = address_tag.get_text(strip=True)

        area_m = re.search(r'(\d+(?:\.\d+)?)\s*坪', text_dump)
        if area_m: area = area_m.group(1) + "坪"

        floor_m = re.search(r'(\d+F\s*/\s*\d+F|\d+樓\s*/\s*\d+樓)', text_dump, re.IGNORECASE)
        if floor_m: floor = floor_m.group(1).replace(" ", "")

        if "不可開伙" in text_dump or "不可開 伙" in text_dump: cooking = "不可開伙"
        elif "可開伙" in text_dump or "可開 伙" in text_dump: cooking = "可開伙"

        contact_m = re.search(r'(09\d{2}[- \.]?\d{3}[- \.]?\d{3})', text_dump)
        if contact_m: contact = contact_m.group(1)

        if "仲介" in text_dump or "服務費" in text_dump or "經紀人" in text_dump: is_agent = "是 (仲介/代理)"
        elif "屋主" in text_dump: is_agent = "否 (屋主自租)"

        print(f"正在將地址 '{address}' 轉換為座標...")
        coordinates = await geocode_address(address)

        scraped_data = {
            "type": "housing",
            "address": address,
            "lat": coordinates.get("lat"),
            "lng": coordinates.get("lng"),
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

        node_api_url = "http://127.0.0.1:3000/api/markers"
        try:
            node_response = requests.post(node_api_url, json=scraped_data)
            if node_response.status_code in [200, 201]:
                print("✅ 成功！Node.js 已將 591 租屋資料寫入 MongoDB！")
        except Exception as db_err:
            print(f"❌ 無法連線至 Node.js 伺服器：{db_err}")

        return {"status": "success", "message": "591 租屋資料擷取成功！", "data": scraped_data}
        
    except Exception as e:
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")


# ==================================================
# 🌟 路由 3：處理前端自訂地點並執行「資訊匯整」(Google Places API)
# ==================================================
class CustomPlaceRequest(BaseModel):
    title: str
    address: str
    memo: str = ""
    aggregate_info: bool = False

@app.post("/scrape/custom")
async def scrape_custom(request: CustomPlaceRequest):
    try:
        print(f"📍 收到自訂地點請求：{request.title}")
        lat, lng = None, None
        place_id = None
        website = None
        opening_hours = []
        photo_url = None

        if GOOGLE_API_KEY:
            # 1. 透過 Google Places Text Search 尋找該地點的 place_id 與精確座標
            search_url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
            search_params = {
                "input": f"{request.title} {request.address}",
                "inputtype": "textquery",
                "fields": "place_id,geometry",
                "key": GOOGLE_API_KEY
            }
            try:
                res = requests.get(search_url, params=search_params).json()
                if res.get("status") == "OK" and res.get("candidates"):
                    candidate = res["candidates"][0]
                    lat = candidate["geometry"]["location"]["lat"]
                    lng = candidate["geometry"]["location"]["lng"]
                    place_id = candidate.get("place_id")
                    print(f"✅ 找到地點！Place ID: {place_id}")
            except Exception as e:
                print(f"❌ Places API 搜尋失敗：{e}")

            # 2. 如果勾選了資訊匯整，就利用 place_id 抓取詳細資料 (營業時間、網站、照片)
            if request.aggregate_info and place_id:
                print(f"🔍 正在為 {request.title} 進行資訊匯整...")
                details_url = "https://maps.googleapis.com/maps/api/place/details/json"
                det_params = {
                    "place_id": place_id,
                    "fields": "website,opening_hours,photos",
                    "key": GOOGLE_API_KEY,
                    "language": "zh-TW"
                }
                try:
                    det_res = requests.get(details_url, params=det_params).json()
                    if det_res.get("status") == "OK":
                        result = det_res.get("result", {})
                        website = result.get("website")
                        if "opening_hours" in result:
                            opening_hours = result["opening_hours"].get("weekday_text", [])
                        if "photos" in result and len(result["photos"]) > 0:
                            photo_ref = result["photos"][0]["photo_reference"]
                            photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_ref}&key={GOOGLE_API_KEY}"
                        print("✅ 資訊匯整成功！")
                except Exception as e:
                    print(f"❌ Places Details API 失敗：{e}")

        # 兜底方案：如果 Places API 沒抓到經緯度，退回使用一般地址轉換
        if lat is None or lng is None:
            coords = await geocode_address(request.address)
            lat = coords.get("lat")
            lng = coords.get("lng")

        # 整理寫入資料庫的結構
        scraped_data = {
            "type": "custom",
            "address": request.address,
            "lat": lat,
            "lng": lng,
            "memo": request.memo,
            "customInfo": {
                "title": request.title,
                "website": website,
                "opening_hours": opening_hours,
                "photo_url": photo_url,
                "aggregate_info": request.aggregate_info
            }
        }

        # 🚀 寫入 Node.js 後端資料庫
        node_api_url = "http://127.0.0.1:3000/api/markers"
        try:
            node_response = requests.post(node_api_url, json=scraped_data)
            if node_response.status_code in [200, 201]:
                print("✅ 成功！自訂地點已寫入 MongoDB！")
        except Exception as db_err:
            print(f"❌ 無法連線至 Node.js 伺服器：{db_err}")

        return {"status": "success", "message": "自訂地點新增成功！", "data": scraped_data}
        
    except Exception as e:
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)