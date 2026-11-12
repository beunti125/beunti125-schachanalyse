import asyncio
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':800})
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e)))
        async def route(r):
            u=r.request.url; f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_function("document.querySelector('#engineLabel').textContent.includes('Stockfish')", timeout=60000)
        await pg.click('#profBtn'); await pg.fill('#user','testuser'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.g-row')
        await pg.click('.g-row >> nth=1')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing') && document.querySelectorAll('.mv').length>60", timeout=300000)
        await pg.click('#startBtn'); await pg.click('.mv[data-ply="18"]'); await pg.wait_for_timeout(300)
        await pg.click('#steps [data-s="1"]'); await pg.wait_for_timeout(300)
        print('Schritt 2:', await pg.inner_text('#steps .step-text'))
        print('Pfeile:', await pg.evaluate("document.querySelectorAll('.arrow-layer path').length"))
        await pg.screenshot(path=T+'14_eroeffnung.png')
        await pg.click('#steps [data-s="-1"]'); await pg.click('#hintBtn'); await pg.wait_for_timeout(200)
        print('Tipp 1:', await pg.inner_text('#hintBtn'), await pg.evaluate("[...document.querySelectorAll('.sq.hint')].map(e=>e.dataset.sq)"))
        await pg.click('#hintBtn'); await pg.wait_for_timeout(200)
        print('Tipp 2:', await pg.inner_text('#hintBtn'), await pg.evaluate("document.querySelectorAll('.arrow-layer path').length"))
        await pg.screenshot(path=T+'15_tipp.png')
        print(logs); await b.close()
asyncio.run(main())
