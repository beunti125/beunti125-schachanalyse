import asyncio, json, os
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':800})
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERR '+str(e)))
        async def route(r):
            u=r.request.url
            if 'tippfehler' in u: return await r.fulfill(status=404, content_type='application/json', body='{}')
            last=u.rsplit('/',1)[1]
            if last.lower() in ('anitabonita7777','mertabi69'): return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'username':last}))
            f='archives.json' if 'archives' in u else 'stats.json' if u.endswith('/stats') else 'games.json'
            await r.fulfill(status=200, content_type='application/json', body=open(T+f).read())
        await pg.route('**/api/cc/**', route)
        await pg.goto('http://localhost:8765/'); await pg.wait_for_timeout(2500)
        print('Rückfrage sichtbar:', await pg.is_visible('.prof-ask'), '|', (await pg.inner_text('.prof-ask')).replace('\n',' ') if await pg.is_visible('.prof-ask') else '')
        await pg.click('[data-edit] >> nth=0'); await pg.wait_for_timeout(200)
        print('Knopf:', await pg.inner_text('#userBtn'), '| Feld:', await pg.get_attribute('#user','placeholder'))
        await pg.fill('#user','tippfehlerxyz'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
        print('nach Tippfehler gespeichert:', await pg.evaluate("fetch('/api/config').then(r=>r.json()).then(c=>c.user)"))
        await pg.click('#profBtn'); await pg.click('[data-edit] >> nth=0'); await pg.fill('#user','mertAbi69'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2000)
        print('nach mertAbi69:', await pg.evaluate("fetch('/api/config').then(r=>r.json()).then(c=>JSON.stringify([c.user,c.profiles]))"), '| Anzeige:', await pg.inner_text('#profName'))
        await pg.reload(); await pg.wait_for_timeout(2500)
        print('nach Neuladen:', await pg.inner_text('#profName'), '| Rückfrage:', await pg.is_visible('.prof-ask'))
        await pg.click('#profBtn'); await pg.wait_for_timeout(200); await pg.screenshot(path=T+'23_profil.png')
        print(logs); await b.close()
asyncio.run(main())
