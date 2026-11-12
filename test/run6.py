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
        await pg.click('.g-row >> nth=0')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing') && document.querySelectorAll('.mv').length>5", timeout=300000)
        await pg.click('#pickBtn'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=T+'11_picker.png')
        await pg.type('#pickQ','gegner2'); await pg.wait_for_timeout(200)
        print('Treffer:', await pg.locator('.pk-row').count())
        await pg.keyboard.press('Enter')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing') && document.querySelectorAll('.mv').length>60", timeout=300000)
        print('geöffnet:', await pg.inner_text('.top-p .pname'), '| Picker offen:', await pg.is_visible('#gamePicker'))
        print(logs); await b.close()
asyncio.run(main())
