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
        await pg.click('#startBtn'); await pg.click('.mv[data-ply="9"]'); await pg.wait_for_timeout(300)
        print('Trainer bei Nxf7:', await pg.get_attribute('.avatar img','src'))
        await pg.click('.mv[data-ply="10"]'); await pg.wait_for_timeout(300); print('Text Qxg2:', await pg.inner_text('#steps .step-text')); await pg.screenshot(path=T+'16_badge.png')
        print('Trainer bei Qxg2:', await pg.get_attribute('.avatar img','src'), await pg.get_attribute('.avatar','class'))
        await pg.click('.mv[data-ply="6"]'); await pg.wait_for_timeout(300)
        bb = await pg.locator('#reviewBoard').bounding_box(); s = bb['width']/8
        def c(sq): f='abcdefgh'.index(sq[0]); r=int(sq[1]); return (bb['x']+(f+.5)*s, bb['y']+(8-r+.5)*s)
        for a,z in [('f3','d4'),('e5','d4'),('c4','f7')]:
            await pg.mouse.click(*c(a)); await pg.wait_for_timeout(150); await pg.mouse.click(*c(z)); await pg.wait_for_timeout(2500); print('  ', a+z, '→', await pg.inner_text('#steps .step-text'))
        print('Variante:', await pg.inner_text('#varLine'))
        print('Trainer:', await pg.inner_text('.coach-txt'), '|', await pg.inner_text('#steps'), '|', await pg.get_attribute('.avatar img','src'))
        await pg.screenshot(path=T+'10_variante.png')
        await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(800)
        print('nach ←:', await pg.inner_text('.coach-txt'))
        await pg.click('#varBack'); await pg.wait_for_timeout(300)
        print('zurück, Variante sichtbar:', await pg.is_visible('#varLine'), 'ply', await pg.evaluate("document.querySelector('.mv.cur')?.dataset.ply"))
        print(logs); await b.close()
asyncio.run(main())
