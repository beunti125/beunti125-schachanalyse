import asyncio
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900})
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e)))
        async def route(r):
            u=r.request.url; f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/?game=last')
        await pg.wait_for_selector('#v-review.on .mv', timeout=120000); await pg.wait_for_timeout(500)
        print('url:', pg.url, '| user:', await pg.input_value('#user'), '| coach:', await pg.inner_text('.coach-txt'))
        print('autoOpen:', await pg.is_checked('#autoOpen'), 'autostart:', await pg.is_checked('#autostart'))
        await pg.screenshot(path=T+'7_auto.png')
        href = await pg.get_attribute('#bmLink','href'); print('bm:', href)
        # Bookmarklet-Logik gegen eine chess.com-URL prüfen
        js = href[len('javascript:'):].replace("window.open(","(window.__o=").replace(",'_blank')",")")
        print('bm-ergebnis:', await pg.evaluate("(()=>{const location={href:'https://www.chess.com/game/live/1?move=12'};"+js.replace('(()=>{','(()=>{',1)+";return window.__o})()"))
        print(logs)
        await b.close()
asyncio.run(main())
