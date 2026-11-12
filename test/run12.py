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
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_function("document.querySelector('#engineLabel').textContent.includes('Stockfish')", timeout=60000)
        await pg.click('#profBtn'); await pg.fill('#user','testuser'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.g-row')
        await pg.select_option('#quality','schnell'); await pg.click('#batchBtn')
        await pg.wait_for_function("!document.querySelector('#progress').classList.contains('on') && document.querySelectorAll('.g-acc').length>=2", timeout=300000)
        await pg.click('nav button[data-view=errors]'); await pg.wait_for_timeout(500)
        print('Restzeit:', await pg.evaluate("[...document.querySelectorAll('.hbar')].map(e=>e.innerText.replace(/\\n/g,' ')).filter(t=>/ s /.test(t)).join(' | ')"))
        await pg.screenshot(path=T+'22_fehler.png', full_page=True)
        await pg.click('nav button[data-view=games]'); await pg.click('.g-row >> nth=1')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing') && document.querySelectorAll('.mv').length>60", timeout=300000)
        print('Züge mit ⏱:', await pg.locator('.mv .tp').count())
        print(logs); await b.close()
asyncio.run(main())
