import asyncio, json, sys
from playwright.async_api import async_playwright
T='/home/claude/schach/test/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'standard'
DUMP = """async () => { const r = indexedDB.open('schachanalyse', 1); const d = await new Promise(x => r.onsuccess = () => x(r.result));
  const a = await new Promise(x => { const q = d.transaction('analyses').objectStore('analyses').getAll(); q.onsuccess = () => x(q.result); });
  return a.sort((x,y)=>x.url.localeCompare(y.url)).map(an => ({url: an.url, v: an.v, acc: an.accuracy, cls: an.moves.map(m => m.cls)})); }"""
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
        await pg.select_option('#quality', Q); await pg.click('#batchBtn')
        await pg.wait_for_function("!document.querySelector('#progress').classList.contains('on') && document.querySelectorAll('.g-acc').length>=2", timeout=600000)
        full = await pg.evaluate(DUMP.replace("map(an => ({url: an.url, v: an.v, acc: an.accuracy, cls: an.moves.map(m => m.cls)}))", "slice()"))
        json.dump(full, open('/tmp/an_dump_%s.json' % (sys.argv[2] if len(sys.argv) > 2 else 'x'), 'w'))
        res = await pg.evaluate(DUMP)
        for a in res:
            print(a['url'][-1], 'v', a['v'], 'acc', a['acc'])
            print('  ', ' '.join(f"{i//2+1}{'.' if i%2==0 else '...'}{c}" for i, c in enumerate(a['cls'])))
        # Upgrade-Test: Version zurücksetzen und Klassen verfälschen, neu laden → muss neu eingestuft werden
        await pg.evaluate("""async () => { const r = indexedDB.open('schachanalyse', 1); const d = await new Promise(x => r.onsuccess = () => x(r.result));
          const a = await new Promise(x => { const q = d.transaction('analyses').objectStore('analyses').getAll(); q.onsuccess = () => x(q.result); });
          await new Promise(x => { const t = d.transaction('analyses', 'readwrite'); a.forEach(an => { an.v = 4; an.moves.forEach(m => m.cls = 'good'); t.objectStore('analyses').put(an); }); t.oncomplete = x; }); d.close(); }""")
        await pg.reload(); await pg.wait_for_selector('.g-row'); await pg.wait_for_timeout(1500)
        res2 = await pg.evaluate(DUMP)
        same = all(x['v'] == 5 and x['cls'] == y['cls'] and x['acc'] == y['acc'] for x, y in zip(res2, res))
        print('Upgrade v4→v5 identisch:', same, [x['v'] for x in res2])
        await pg.click('.g-row >> nth=0')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=T+'24_klassen.png')
        print(logs); await b.close()
asyncio.run(main())
