import asyncio, time
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900})
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e))); pg.on('console', lambda m: m.type=='error' and logs.append(m.text))
        async def route(r):
            u=r.request.url; f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_function("document.querySelector('#engineLabel').textContent.includes('Stockfish')", timeout=60000)
        await pg.click('#profBtn'); await pg.fill('#user','testuser'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.g-row')
        await pg.select_option('#quality','standard')
        await pg.click('#batchBtn'); await pg.wait_for_function("!document.querySelector('#progress').classList.contains('on') && document.querySelectorAll('.g-acc').length>=2", timeout=300000)
        await pg.click('.g-row >> nth=0'); await pg.wait_for_selector('.mv', timeout=120000); await pg.wait_for_timeout(300)
        print('START', await pg.inner_text('.coach-txt'))
        for ply,name in [(9,"nxf7")]:
            await pg.click(f'.mv[data-ply="{ply}"]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=T+f'5_{name}_s1.png')
            print(name, await pg.inner_text('#steps'))
            n = await pg.locator('#steps .step').count()
            if n>1:
                await pg.click(f'#steps .step >> nth={n-1}'); await pg.wait_for_timeout(300); await pg.screenshot(path=T+f'5_{name}_last.png')
        print(logs)
        await b.close()
asyncio.run(main())
