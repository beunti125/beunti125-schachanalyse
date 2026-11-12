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
        await pg.click('.g-row >> nth=1'); await pg.wait_for_timeout(4000); await pg.screenshot(path=T+'8_analysing.png')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing')", timeout=300000)
        await pg.click('#clsTable .c.jump[data-side="w"] >> nth=-1'); await pg.wait_for_timeout(400)
        print('sprung zu ply', await pg.evaluate("document.querySelector('.mv.cur')?.dataset.ply"), await pg.inner_text('.coach-txt'))
        await pg.screenshot(path=T+'9_bubble.png'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); print('nach Esc:', await pg.evaluate('document.body.className'), await pg.evaluate('document.querySelector(".view.on").id')); print(logs)
        await b.close()
asyncio.run(main())
