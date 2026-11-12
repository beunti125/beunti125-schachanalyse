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
        await pg.click('.g-row >> nth=0')
        await pg.wait_for_function("!document.querySelector('#v-review').classList.contains('analysing') && document.querySelectorAll('.mv').length>5", timeout=300000)
        bb = await pg.locator('#reviewBoard').bounding_box(); s = bb['width']/8
        def c(sq): f='abcdefgh'.index(sq[0]); r=int(sq[1]); return (bb['x']+(f+.5)*s, bb['y']+(8-r+.5)*s)
        n0 = await pg.evaluate("document.querySelectorAll('.arrow-layer path').length")
        async def rdrag(a,z,mod=None):
            if mod: await pg.keyboard.down(mod)
            await pg.mouse.move(*c(a)); await pg.mouse.down(button='right'); await pg.mouse.move(*c(z), steps=4); await pg.mouse.up(button='right')
            if mod: await pg.keyboard.up(mod)
        await rdrag('e2','e4'); await rdrag('g1','f3','Shift'); await rdrag('d7','d7'); await rdrag('c8','c8','Alt')
        await pg.wait_for_timeout(200)
        print('Pfeile vorher/nachher:', n0, await pg.evaluate("document.querySelectorAll('.arrow-layer path').length"))
        print('Markierungen:', await pg.evaluate("[...document.querySelectorAll('.sq.um-o,.sq.um-r,.sq.um-b')].map(e=>e.dataset.sq+':'+e.className.split(' ').pop())"))
        await pg.screenshot(path=T+'18_rechtsklick.png')
        await pg.mouse.click(*c('h5')); await pg.wait_for_timeout(200)
        print('nach Linksklick:', await pg.evaluate("document.querySelectorAll('.arrow-layer path').length"), await pg.evaluate("document.querySelectorAll('.sq.um-o,.sq.um-r,.sq.um-b').length"))
        print(logs); await b.close()
asyncio.run(main())
