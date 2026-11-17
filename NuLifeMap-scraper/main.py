from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from bs4 import BeautifulSoup
import traceback
import json
import requests
import re
from playwright.async_api import async_playwright
import os
import sys
import asyncio
from dotenv import load_dotenv

# Windows 主控台預設 cp950，遇到 emoji 的 print 會直接炸掉
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Windows + uvicorn 預設事件迴圈不支援 subprocess，Playwright 會炸 NotImplementedError
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:3000")

app = FastAPI()
app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"]
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

async def geocode_address(address: str) -> dict:
    if not GOOGLE_API_KEY:
        return {"lat": None, "lng": None}
    try:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"address": address, "key": GOOGLE_API_KEY}
        response = requests.get(url, params=params)
        data = response.json()
        if data.get("status") == "OK" and len(data.get("results", [])) > 0:
            return data["results"][0]["geometry"]["location"]
        return {"lat": None, "lng": None}
    except Exception:
        return {"lat": None, "lng": None}

# 🌟 確保定義了 ScrapeRequest 模型來接收 JSON body，並加入 user_id (解決 422 錯誤的關鍵)
class ScrapeRequest(BaseModel):
    url: str
    user_id: str = "mapper"
    memo: str = ""

def extract_job_postings(data):
    """從 LD+JSON 取出 JobPosting（支援物件、陣列、@graph）。"""
    found = []
    if isinstance(data, list):
        for item in data:
            found.extend(extract_job_postings(item))
        return found
    if isinstance(data, dict):
        if data.get("@type") == "JobPosting":
            found.append(data)
        if "@graph" in data:
            found.extend(extract_job_postings(data["@graph"]))
    return found

def parse_job_location(job_location):
    if isinstance(job_location, list) and job_location:
        job_location = job_location[0]
    if not isinstance(job_location, dict):
        return None
    address = job_location.get("address", job_location)
    if isinstance(address, list) and address:
        address = address[0]
    if isinstance(address, str):
        return address
    if not isinstance(address, dict):
        return None
    parts = [
        address.get("streetAddress"),
        address.get("addressLocality"),
        address.get("addressRegion"),
        address.get("postalCode"),
    ]
    joined = "".join([p for p in parts if p])
    return joined or address.get("name")

JOB_TYPE_MAP = {
    1: "全職",
    2: "兼職",
    3: "高階",
    4: "派遣",
    5: "接案",
    6: "家教",
}

def format_104_job_category(categories):
    if not categories:
        return "未提供"
    if isinstance(categories, list):
        names = [
            item.get("description")
            for item in categories
            if isinstance(item, dict) and item.get("description")
        ]
        return "、".join(names) if names else "未提供"
    return str(categories)

def format_104_job_nature(job_type, work_type):
    nature = JOB_TYPE_MAP.get(job_type)
    if not nature and isinstance(work_type, list) and work_type:
        nature = "、".join(str(item) for item in work_type)
    return nature or "未提供"

def format_104_work_period(period):
    if not period:
        return "未提供"
    if isinstance(period, str):
        return period or "未提供"
    if not isinstance(period, dict):
        return str(period)
    shifts = period.get("shifts") or {}
    parts = []
    if isinstance(shifts, dict):
        for name, times in shifts.items():
            if isinstance(times, list) and times:
                parts.append(f"{name} {'/'.join(str(t) for t in times)}")
            else:
                parts.append(str(name))
    text = "、".join(parts) if parts else "未提供"
    note = period.get("note") or ""
    if note:
        text = f"{text}（{note}）"
    return text

def parse_html_facts(soup: BeautifulSoup) -> dict:
    """解析 Mai Job / 一般職缺頁的 dt/dd 明細欄位。"""
    facts = {}
    for dt in soup.select("dl.facts dt, dl dt"):
        key = dt.get_text(" ", strip=True)
        dd = dt.find_next_sibling("dd")
        if not dd and dt.parent:
            dd = dt.parent.find("dd")
        if not key or not dd:
            continue
        value = dd.get_text(" ", strip=True)
        if value:
            facts[key] = value
    return facts

def pick_fact(facts: dict, keys, fallback="未提供"):
    for key in keys:
        value = facts.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return fallback

def employment_type_to_nature(employment_type):
    if employment_type == "PART_TIME":
        return "兼職"
    if employment_type == "FULL_TIME":
        return "全職"
    return ""

async def scrape_104_job(url: str, user_id: str, memo: str = ""):
    """104 職缺頁常被反爬導到錯誤頁，改走官方 ajax content API。"""
    match = re.search(r"104\.com\.tw/job/([a-zA-Z0-9]+)", url)
    if not match:
        raise HTTPException(status_code=400, detail="無法從網址解析 104 職缺編號")
    job_id = match.group(1)
    print(f"[104] 改走 ajax API，job_id={job_id}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            locale="zh-TW",
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            extra_http_headers={"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"},
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = await context.new_page()
        # 先暖身首頁，讓後續 ajax 帶上可用 cookie
        await page.goto("https://www.104.com.tw/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(800)
        api = await context.request.get(
            f"https://www.104.com.tw/job/ajax/content/{job_id}",
            headers={
                "Referer": url,
                "Accept": "application/json, text/plain, */*",
            },
        )
        if not api.ok:
            status = api.status
            await browser.close()
            raise HTTPException(status_code=502, detail=f"104 職缺 API 回應失敗 ({status})")

        payload = await api.json()
        await browser.close()

    data = payload.get("data") or {}
    header = data.get("header") or {}
    detail = data.get("jobDetail") or {}

    job_name = header.get("jobName") or "找不到職缺"
    company_name = header.get("custName") or "找不到公司"
    region = detail.get("addressRegion") or ""
    detail_addr = detail.get("addressDetail") or ""
    job_location = f"{region}{detail_addr}".strip() or "找不到地點"
    salary_text = detail.get("salary") or "面議或未提供"
    job_description = detail.get("jobDescription") or "無詳細內容"
    job_category = format_104_job_category(detail.get("jobCategory"))
    job_nature = format_104_job_nature(detail.get("jobType"), detail.get("workType"))
    work_period = format_104_work_period(detail.get("workPeriod"))
    manage_resp = detail.get("manageResp") or "未提供"
    business_trip = detail.get("businessTrip") or "未提供"
    vacation_policy = detail.get("vacationPolicy") or "未提供"
    start_working_day = detail.get("startWorkingDay") or "未提供"
    need_emp = detail.get("needEmp") or "未提供"

    lat = detail.get("latitude")
    lng = detail.get("longitude")
    try:
        lat = float(lat) if lat not in (None, "") else None
        lng = float(lng) if lng not in (None, "") else None
    except (TypeError, ValueError):
        lat, lng = None, None

    if not lat or not lng:
        coordinates = await geocode_address(job_location)
        lat = coordinates.get("lat")
        lng = coordinates.get("lng")

    if job_name == "找不到職缺" or not lat or not lng:
        raise HTTPException(status_code=422, detail="104 職缺資料不完整，無法標註到地圖")

    found_skills = []
    search_text = f"{job_description} {job_name}"
    for tech in TECH_DICTIONARY:
        if re.search(re.escape(tech), search_text, re.IGNORECASE) and tech not in found_skills:
            found_skills.append(tech)

    scraped_data = {
        "userId": user_id,
        "type": "job",
        "address": job_location,
        "lat": lat,
        "lng": lng,
        "memo": f"薪資：{salary_text}",
        "jobInfo": {
            "jobTitle": job_name,
            "companyName": company_name,
            "sourceUrl": url,
            "description": job_description,
            "jobCategory": job_category,
            "salary": salary_text,
            "jobNature": job_nature,
            "workLocation": job_location,
            "manageResp": manage_resp,
            "businessTrip": business_trip,
            "workPeriod": work_period,
            "vacationPolicy": vacation_policy,
            "startWorkingDay": start_working_day,
            "needEmp": need_emp,
            "notes": memo or "",
            "skills": found_skills
        }
    }

    try:
        requests.post(f"{BACKEND_URL}/api/markers", json=scraped_data)
        print("[OK] 成功將資料回傳給 Node.js")
    except Exception as e:
        print(f"[FAIL] 傳回 Node.js 失敗: {e}")

    return {"status": "success", "message": "職缺資料萃取成功！", "data": scraped_data}

# ==================================================
# 📌 路由 1：擷取職缺 (104/1111等)
# ==================================================
@app.post("/scrape/url")
async def scrape_url(req: ScrapeRequest):
    print(f"[SCRAPE] 收到 Node.js 傳來的網址: {req.url}")
    try:
        if "104.com.tw/job/" in req.url:
            return await scrape_104_job(req.url, req.user_id, req.memo)

        print(f"準備出動 Playwright 前往：{req.url} (User: {req.user_id})")
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            page = await context.new_page()
            await page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
            try: 
                await page.wait_for_selector("h1", timeout=10000)
            except Exception: 
                pass
            html_content = await page.content()
            await browser.close()

        soup = BeautifulSoup(html_content, 'html.parser')
        job_name, company_name, job_location, salary_text = "找不到職缺", "找不到公司", "找不到地點", "面議或未提供"
        job_description, found_skills = "無詳細內容", []
        job_nature_from_ld = ""
        geo_lat, geo_lng = None, None

        ld_json_scripts = soup.find_all('script', type='application/ld+json')
        for script in ld_json_scripts:
            if not script.string: continue
            try:
                data = json.loads(script.string)
                for item in extract_job_postings(data):
                    if item.get('title'): job_name = item['title']
                    if item.get('hiringOrganization'):
                        org = item['hiringOrganization']
                        if isinstance(org, dict):
                            company_name = org.get('name', company_name)
                    parsed_location = parse_job_location(item.get('jobLocation'))
                    if parsed_location:
                        job_location = parsed_location
                    if item.get('baseSalary'):
                        val = item['baseSalary'].get('value', {})
                        if isinstance(val, dict) and val.get('minValue') is not None and val.get('maxValue') is not None:
                            unit = "時薪" if val.get("unitText") == "HOUR" else "月薪"
                            salary_text = f"{unit} {val.get('minValue')} ~ {val.get('maxValue')} TWD"
                    nature = employment_type_to_nature(item.get("employmentType"))
                    if nature:
                        job_nature_from_ld = nature
                    geo = ((item.get("jobLocation") or {}) if isinstance(item.get("jobLocation"), dict) else {}).get("geo") or {}
                    if isinstance(geo, dict):
                        try:
                            if geo.get("latitude") is not None:
                                geo_lat = float(geo.get("latitude"))
                            if geo.get("longitude") is not None:
                                geo_lng = float(geo.get("longitude"))
                        except (TypeError, ValueError):
                            pass
                    if item.get('description'):
                        raw_desc = item['description']
                        if isinstance(raw_desc, str):
                            # 先把常見區塊標籤轉成換行，再擷取文字
                            raw_desc = re.sub(r'<br\s*/?>', '\n', raw_desc, flags=re.I)
                            raw_desc = re.sub(r'</(?:p|div|li|h[1-6])>', '\n', raw_desc, flags=re.I)
                        job_description = BeautifulSoup(str(raw_desc), "html.parser").get_text(separator="\n", strip=True)
                        job_description = re.sub(r'\n{3,}', '\n\n', job_description).strip()
            except json.JSONDecodeError: 
                continue

        facts = parse_html_facts(soup)
        job_location = pick_fact(facts, ["上班地點"], job_location)
        salary_text = pick_fact(facts, ["薪資待遇", "工作待遇"], salary_text)
        job_category = pick_fact(facts, ["職務類別"])
        job_nature = pick_fact(facts, ["工作性質"], job_nature_from_ld or "未提供")
        manage_resp = pick_fact(facts, ["管理責任"])
        business_trip = pick_fact(facts, ["出差外派", "出差"])
        work_period = pick_fact(facts, ["上班時段", "上班"])
        vacation_policy = pick_fact(facts, ["休假制度", "休假"])
        start_working_day = pick_fact(facts, ["可上班日"])
        need_emp = pick_fact(facts, ["需求人數"])

        search_text = job_description + " " + job_name
        for tech in TECH_DICTIONARY:
            if re.search(re.escape(tech), search_text, re.IGNORECASE) and tech not in found_skills:
                found_skills.append(tech)

        if geo_lat and geo_lng:
            coordinates = {"lat": geo_lat, "lng": geo_lng}
        else:
            coordinates = await geocode_address(job_location)

        scraped_data = {
            "userId": req.user_id, # 🌟 掛上使用者標籤
            "type": "job",
            "address": job_location,
            "lat": coordinates.get("lat"),
            "lng": coordinates.get("lng"),
            "memo": f"薪資：{salary_text}",
            "jobInfo": {
                "jobTitle": job_name,
                "companyName": company_name,
                "sourceUrl": req.url,
                "description": job_description,
                "jobCategory": job_category,
                "salary": salary_text,
                "jobNature": job_nature,
                "workLocation": job_location,
                "manageResp": manage_resp,
                "businessTrip": business_trip,
                "workPeriod": work_period,
                "vacationPolicy": vacation_policy,
                "startWorkingDay": start_working_day,
                "needEmp": need_emp,
                "notes": req.memo or "",
                "skills": found_skills
            }
        }

        if job_name == "找不到職缺" or not scraped_data["lat"] or not scraped_data["lng"]:
            raise HTTPException(status_code=422, detail="職缺資料不完整，無法標註到地圖")

        try:
            requests.post(f"{BACKEND_URL}/api/markers", json=scraped_data)
            print("[OK] 成功將資料回傳給 Node.js")
        except Exception as e:
            print(f"[FAIL] 傳回 Node.js 失敗: {e}")
            
        return {"status": "success", "message": "職缺資料萃取成功！", "data": scraped_data}

    except HTTPException:
        raise
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")

# ==================================================
# 🌟 路由 2：專門擷取 591 租屋網
# ==================================================
@app.post("/scrape/591")
async def scrape_591(req: ScrapeRequest):
    print(f"[SCRAPE] 收到 Node.js 傳來的網址: {req.url}")
    try:
        print(f"[591] 準備出動前往 591：{req.url} (User: {req.user_id})")
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", 
                viewport={"width": 1920, "height": 1080}
            )
            page = await context.new_page()
            await page.goto(req.url, wait_until="networkidle", timeout=30000)
            try: 
                await page.wait_for_selector("h1", timeout=8000)
            except Exception: 
                pass
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
            except Exception: 
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

        coordinates = await geocode_address(address)

        memo_text = f"租金：{price} | {area} | {floor}"
        if req.memo:
            memo_text = f"{memo_text}\n備註：{req.memo}"

        scraped_data = {
            "userId": req.user_id, # 🌟 掛上使用者標籤
            "type": "housing",
            "address": address,
            "lat": coordinates.get("lat"),
            "lng": coordinates.get("lng"),
            "memo": memo_text,
            "houseInfo": {
                "title": title, "price": price, "area": area, "floor": floor, "cooking": cooking,
                "contact": contact, "is_agent": is_agent, "sourceUrl": req.url
            }
        }

        # 將爬取好的資料傳回 Node.js 進行資料庫存檔
        try:
            requests.post(f"{BACKEND_URL}/api/markers", json=scraped_data)
            print("[OK] 成功將資料回傳給 Node.js")
        except Exception as e:
            print(f"[FAIL] 傳回 Node.js 失敗: {e}")
            
        return {"status": "success", "message": "591 租屋資料擷取成功！", "data": scraped_data}
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"內部伺服器錯誤: {str(e)}")


if __name__ == "__main__":
    # Windows 上 reload 會換成不支援 subprocess 的事件迴圈，導致 Playwright 無法啟動
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=(sys.platform != "win32"),
        loop="asyncio",
    )