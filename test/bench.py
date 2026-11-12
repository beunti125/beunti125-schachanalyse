import asyncio, time
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
        print('engine:', await pg.text_content('#engineLabel'))
        await pg.fill('#user','testuser'); await pg.click('#userForm .btn'); await pg.wait_for_selector('.g-row')
        await pg.select_option('#quality','standard')
        t=time.time(); await pg.click('.g-row >> nth=1')
        await pg.wait_for_function("document.querySelectorAll('.mv').length>70 && !document.querySelector('#progress').classList.contains('on')", timeout=300000)
        print('Partie 81 Halbzüge, Standard:', round(time.time()-t,1),'s')
        print('acc:', await pg.inner_text('#accRow')); print(logs)
        await b.close()
asyncio.run(main())
