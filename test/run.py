import asyncio, json, sys, time
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--enable-features=SharedArrayBuffer'])
        pg = await b.new_page(viewport={'width':1440,'height':900})
        logs=[]; pg.on('console', lambda m: logs.append(m.type+': '+m.text)); pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e)))
        async def route(r):
            u=r.request.url
            f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_function("document.querySelector('#engineLabel').textContent.includes('Stockfish')", timeout=60000)
        print('engine:', await pg.text_content('#engineLabel'), 'isolated:', await pg.evaluate('crossOriginIsolated'))
        await pg.click('#profBtn'); await pg.fill('#user','testuser'); await pg.keyboard.press('Enter')
        await pg.wait_for_selector('.g-row'); await pg.screenshot(path=T+'1_games.png')
        await pg.select_option('#quality','schnell')
        t=time.time(); await pg.click('.g-row >> nth=0')
        await pg.wait_for_selector('.mv', timeout=120000); print('analyse g1', round(time.time()-t,1),'s')
        for k in range(8): await pg.keyboard.press('ArrowRight')
        await pg.wait_for_timeout(400); await pg.screenshot(path=T+'2_review.png')
        print('coach:', await pg.text_content('.coach-txt'))
        print('classes:', await pg.evaluate("[...document.querySelectorAll('.mv')].map(m=>m.textContent+':'+m.querySelector('svg')?.getAttribute('aria-label')).join(' ')"))
        await pg.click('nav button[data-view=games]'); t=time.time()
        await pg.click('#batchBtn')
        await pg.wait_for_function("!document.querySelector('#progress').classList.contains('on') && document.querySelectorAll('.g-acc').length>=2", timeout=300000)
        print('batch', round(time.time()-t,1),'s')
        await pg.click('nav button[data-view=errors]'); await pg.wait_for_timeout(500); await pg.screenshot(path=T+'3_errors.png', full_page=True)
        await pg.click('nav button[data-view=puzzles]'); await pg.wait_for_timeout(800); await pg.screenshot(path=T+'4_puzzle.png')
        print('Restzeit:', await pg.evaluate("[...document.querySelectorAll('.hbar')].slice(-4).map(e=>e.innerText.replace(/\\n/g,' ')).join(' | ')"))
        print('\n'.join(logs[-15:]))
        await b.close()
asyncio.run(main())
