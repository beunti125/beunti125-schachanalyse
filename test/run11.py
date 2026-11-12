import asyncio, json
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':800})
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e)))
        async def route(r):
            u=r.request.url
            if u.rsplit('/',1)[1] in ('testuser','gegner2'):
                return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'username':u.rsplit('/',1)[1]}))
            f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_function("document.querySelector('#engineLabel').textContent.includes('Stockfish')", timeout=60000)
        await pg.wait_for_selector('#profMenu.on'); await pg.fill('#user','testuser'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.g-row')
        await pg.click('#profBtn'); await pg.fill('#user','gegner2'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1200)
        print('angesehen:', await pg.inner_text('#profName'), '| gespeichert:', await pg.evaluate("fetch('/api/config').then(r=>r.json()).then(c=>c.user)"))
        await pg.click('#profBtn'); await pg.wait_for_timeout(200); await pg.screenshot(path=T+'20_profil.png')
        await pg.click('[data-me]'); await pg.wait_for_timeout(800)
        print('zurück:', await pg.inner_text('#profName'))
        # Autoplay beim Patzer
        await pg.click('.g-row >> nth=0')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing') && document.querySelectorAll('.mv').length>5", timeout=300000)
        await pg.click('#startBtn'); await pg.click('.mv[data-ply="9"]')
        print('kurz:', await pg.inner_text('#steps'))
        await pg.click('.st-toggle'); await pg.wait_for_timeout(200)
        seen=set()
        for _ in range(3):
            seen.add(await pg.evaluate("document.querySelector('#steps .st-line.on')?.dataset.k")); await pg.wait_for_timeout(1500)
        print('ohne Klick bleibt Schritt:', seen)
        await pg.click('.st-nav [data-s=\"1\"]'); seen.add(await pg.evaluate("document.querySelector('#steps .st-line.on')?.dataset.k"))
        print('Schritte gesamt:', await pg.locator('#steps .st-line').count(), '| automatisch gezeigt:', sorted(x for x in seen if x))
        print(await pg.inner_text('#steps'))
        await pg.screenshot(path=T+'21_auto.png')
        print(logs); await b.close()
asyncio.run(main())
