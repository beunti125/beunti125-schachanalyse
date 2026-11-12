import asyncio, json
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':800})
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e)))
        async def route(r):
            u=r.request.url
            if u.endswith('/player/testuser') or u.endswith('/player/gegner2'):
                n=u.rsplit('/',1)[1]; return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'username':n,'avatar':'https://images.chesscomfiles.com/x.png'}))
            f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_function("document.querySelector('#engineLabel').textContent.includes('Stockfish')", timeout=60000)
        print('Start:', await pg.inner_text('#profName'))
        await pg.click('#profBtn'); await pg.fill('#user','testuser'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.g-row')
        await pg.click('#profBtn'); await pg.fill('#user','gegner2'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
        print('aktiv:', await pg.inner_text('#profName'))
        await pg.click('#profBtn'); await pg.wait_for_timeout(200); await pg.screenshot(path=T+'19_profile.png')
        await pg.click('.prof-item >> nth=0'); await pg.wait_for_timeout(800)
        print('gewechselt zu:', await pg.inner_text('#profName'), '| Partien:', await pg.locator('.g-row').count())
        print('gespeichert:', await pg.evaluate("fetch('/api/config').then(r=>r.json()).then(c=>JSON.stringify([c.user,c.profiles]))"))
        await pg.reload(); await pg.wait_for_timeout(1500)
        print('nach Neuladen:', await pg.inner_text('#profName'))
        print(logs); await b.close()
asyncio.run(main())
