"""اختبار شامل في متصفح حقيقي: السحب بالفأرة واللمس، التبديل، التوزيع، الحفظ، والتصدير.
التشغيل: ابنِ المشروع، شغّل خادمًا على dist (مثل: python3 -m http.server 4173 -d dist)، ثم:
python3 tests/e2e.py [مجلد_الصور]
"""
import asyncio, base64, json, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
results = []


def check(name, ok, info=''):
    results.append((name, ok))
    print(('✓' if ok else '✗'), name, info)


async def state(pg):
    return await pg.evaluate("JSON.parse(localStorage.getItem('mizan.v1'))")


async def placed(pg):
    return await pg.evaluate('window.__mizanPlaced')


async def canvas_box(pg):
    return await pg.locator('canvas.pitch-canvas').bounding_box()


async def wait_saved(pg):
    await pg.wait_for_timeout(450)


async def desktop(b):
    ctx = await b.new_context(viewport={'width': 1366, 'height': 860})
    pg = await ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(URL)
    await pg.wait_for_timeout(1800)
    await wait_saved(pg)
    s0 = await state(pg)
    check('البداية: الملعب فارغ وكل اللاعبين على الدكة',
          s0 and s0['match'] is not None and len(s0['match']['players']) == 0 and await pg.locator('.pool-chip').count() == 14)
    await pg.get_by_role('button', name='شكّل الفريقين تلقائيًا').click()
    await pg.wait_for_timeout(1500)
    await wait_saved(pg)
    s0 = await state(pg)
    check('التوزيع التلقائي يملأ الملعب ويفرغ الدكة', len(s0['match']['players']) == 14 and await pg.locator('.pool-chip').count() == 0)

    box = await canvas_box(pg)
    pl = await placed(pg)
    a = pl[len(pl) // 2]
    # سحب بالفأرة إلى مكان فارغ
    sx, sy = box['x'] + a['x'], box['y'] + a['y'] - a['h'] * 0.5
    await pg.mouse.move(sx, sy)
    await pg.mouse.down()
    for i in range(1, 11):
        await pg.mouse.move(sx + i * 6, sy + i * 4)
        await pg.wait_for_timeout(16)
    await pg.mouse.up()
    await wait_saved(pg)
    s1 = await state(pg)
    p0 = next(p for p in s0['match']['players'] if p['id'] == a['id'])
    p1 = next(p for p in s1['match']['players'] if p['id'] == a['id'])
    check('السحب بالفأرة يغيّر الموقع', abs(p0['at']['x'] - p1['at']['x']) + abs(p0['at']['z'] - p1['at']['z']) > 1,
          f"{p0['at']} → {p1['at']}")

    # إفلات لاعب فوق لاعب من الفريق الآخر = تبديل الفريقين
    await pg.wait_for_timeout(500)
    pl = await placed(pg)
    teams = {p['id']: p['team'] for p in s1['match']['players']}
    src = next(p for p in pl if teams[p['id']] == 'A')
    dst = next(p for p in pl if teams[p['id']] == 'B')
    await pg.mouse.move(box['x'] + src['x'], box['y'] + src['y'] - src['h'] * 0.5)
    await pg.mouse.down()
    tx, ty = box['x'] + dst['x'], box['y'] + dst['y'] - dst['h'] * 0.5
    for i in range(1, 16):
        await pg.mouse.move(box['x'] + src['x'] + (tx - box['x'] - src['x']) * i / 15,
                            box['y'] + src['y'] - src['h'] * 0.5 + (ty - box['y'] - src['y'] + src['h'] * 0.5) * i / 15)
        await pg.wait_for_timeout(16)
    await pg.mouse.up()
    await wait_saved(pg)
    s2 = await state(pg)
    t2 = {p['id']: p['team'] for p in s2['match']['players']}
    check('الإفلات فوق لاعب آخر يبدّل الفريقين', t2[src['id']] == 'B' and t2[dst['id']] == 'A')

    # نقرة على لاعب ثم «تثبيت» و«نقل للفريق الآخر»
    await pg.wait_for_timeout(500)
    pl = await placed(pg)
    c = pl[-1]
    await pg.mouse.click(box['x'] + c['x'], box['y'] + c['y'] - c['h'] * 0.5)
    await pg.wait_for_timeout(200)
    check('النقر يُظهر شريط خيارات اللاعب', await pg.locator('.selbar').is_visible())
    team_before = {p['id']: p['team'] for p in (await state(pg))['match']['players']}[c['id']]
    await pg.locator('.selbar button', has_text='تثبيت').click()
    await pg.locator('.selbar button', has_text='إلى ').click()
    await wait_saved(pg)
    s3 = await state(pg)
    team_after = {p['id']: p['team'] for p in s3['match']['players']}[c['id']]
    check('نقل اللاعب للفريق الآخر', team_before != team_after)
    check('التثبيت ينتقل مع اللاعب', s3['locks'].get(c['id']) == team_after)

    # إعادة التوزيع تحترم التثبيت وتعطي توزيعًا مختلفًا
    def key(m):
        a = sorted(p['id'] for p in m['players'] if p['team'] == 'A')
        return ','.join(a)
    await pg.get_by_role('button', name='شكّل الفريقين تلقائيًا').click()
    await pg.wait_for_timeout(900)
    s4 = await state(pg)
    t4 = {p['id']: p['team'] for p in s4['match']['players']}
    check('التوزيع يحترم اللاعب المثبّت', t4[c['id']] == s4['locks'][c['id']])
    keys = {key(s4['match'])}
    for _ in range(3):
        await pg.get_by_role('button', name='إعادة التوزيع').click()
        await pg.wait_for_timeout(900)
        sN = await state(pg)
        keys.add(key(sN['match']))
        tN = {p['id']: p['team'] for p in sN['match']['players']}
        assert tN[c['id']] == sN['locks'][c['id']]
    check('إعادة التوزيع تعطي بدائل مختلفة', len(keys) >= 2, f'{len(keys)} توزيعات')
    verdict = await pg.locator('.sb-verdict').inner_text()
    check('عرض الفارق بين الفريقين', '٪' in verdict, verdict)

    # إعادة المواقع الأصلية
    await pg.get_by_role('button', name='المواقع', exact=True).click()
    await wait_saved(pg)
    s5 = await state(pg)
    check('المواقع الأصلية تُستعاد', all(p['at'] == p['home'] for p in s5['match']['players']))

    # إضافة لاعب ثم إعادة تحميل الصفحة
    await pg.locator('#add-name').fill('لاعب الاختبار')
    await pg.get_by_role('radio', name='هجوم').click()
    await pg.locator('.pform button[type=submit]').first.click()
    await wait_saved(pg)
    await pg.reload()
    await pg.wait_for_timeout(1200)
    names = [p['name'] for p in (await state(pg))['players']]
    check('اللاعب الجديد يبقى بعد تحديث الصفحة', 'لاعب الاختبار' in names and await pg.get_by_text('لاعب الاختبار').count() > 0)

    # تغيير العدد والتشكيلة: 11 لكل فريق مع 4-4-2
    await pg.get_by_role('tab', name='المباراة').click()
    await pg.get_by_role('button', name='ملعب كامل').click()
    await pg.get_by_role('button', name='شكّل الفريقين تلقائيًا').click()
    await pg.wait_for_timeout(900)
    await pg.locator('#formation').select_option(label='4-4-2')
    await wait_saved(pg)
    s6 = await state(pg)
    lines = [p['line'] for p in s6['match']['players'] if p['team'] == 'A' and not p['bench']]
    check('تشكيلة 4-4-2 مطبّقة عند اكتمال العدد',
          s6['match']['teamSize'] == 11 and lines.count('ATT') <= 2, f'{len(lines)} أساسيين')

    # الحفظ والفتح
    await pg.get_by_role('tab', name='المحفوظات').click()
    await pg.locator('#save-name').fill('مباراة الجمعة')
    await pg.get_by_role('button', name='حفظ', exact=True).last.click()
    await wait_saved(pg)
    await pg.get_by_role('tab', name='المباراة').click()
    await pg.get_by_role('button', name='سباعي').click()
    await pg.get_by_role('button', name='شكّل الفريقين تلقائيًا').click()
    await pg.wait_for_timeout(900)
    await pg.get_by_role('tab', name='المحفوظات').click()
    await pg.locator('.srow-open', has_text='مباراة الجمعة').click()
    await wait_saved(pg)
    s7 = await state(pg)
    check('فتح تشكيلة محفوظة يعيدها كما هي', s7['match']['teamSize'] == 11 and key(s7['match']) == key(s6['match']))

    # التصدير
    await pg.get_by_role('button', name='صورة').click()
    await pg.wait_for_selector('.modal-img', timeout=8000)
    data = await pg.evaluate("""async () => {
      const src = document.querySelector('.modal-img').src;
      const b = await (await fetch(src)).blob();
      return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    }""")
    png = base64.b64decode(data.split(',')[1])
    open(f'{OUT}/export.png', 'wb').write(png)
    w = int.from_bytes(png[16:20], 'big')
    h = int.from_bytes(png[20:24], 'big')
    check('تصدير صورة PNG عالية الدقة', png[:4] == b'\x89PNG' and w == 2160 and h == 2700, f'{w}×{h}')
    await pg.screenshot(path=f'{OUT}/desk-final.png')
    check('لا أخطاء في الصفحة (سطح المكتب)', not errors, '; '.join(errors))
    await ctx.close()


async def touch_drag(cdp, pg, x0, y0, x1, y1, steps=14, shot=None):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
    for i in range(1, steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}]})
        await pg.wait_for_timeout(16)
    if shot:
        await pg.wait_for_timeout(120)
        await pg.screenshot(path=shot)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await wait_saved(pg)


async def team_of(pg, pid):
    m = (await state(pg))['match']
    p = next((p for p in m['players'] if p['id'] == pid), None)
    return p and p['team']


async def mobile(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(URL)
    await pg.wait_for_timeout(1800)
    await wait_saved(pg)
    await pg.screenshot(path=f'{OUT}/mob-start.png', full_page=True)
    cdp = await ctx.new_cdp_session(pg)
    box = await canvas_box(pg)
    players = (await state(pg))['players']
    by_name = {p['name']: p['id'] for p in players}

    async def chip(i):
        c = pg.locator('.pool-chip').nth(i)
        await c.scroll_into_view_if_needed()
        bb = await c.bounding_box()
        name = (await c.locator('.pool-name').inner_text()).strip()
        return bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2, by_name[name]

    await pg.evaluate('window.scrollTo(0, 0)')
    box = await canvas_box(pg)
    # لاعب إلى النصف العلوي ← البرتقالي (الفريق ب)
    x0, y0, id1 = await chip(0)
    box = await canvas_box(pg)
    await touch_drag(cdp, pg, x0, y0, box['x'] + box['width'] * 0.4, box['y'] + box['height'] * 0.32, shot=f'{OUT}/mob-drag-top.png')
    check('لاعب من الدكة إلى النصف العلوي يصبح برتقاليًا', await team_of(pg, id1) == 'B')
    # لاعب إلى النصف السفلي ← الأصفر (الفريق أ)
    x0, y0, id2 = await chip(0)
    box = await canvas_box(pg)
    await touch_drag(cdp, pg, x0, y0, box['x'] + box['width'] * 0.6, box['y'] + box['height'] * 0.72)
    check('لاعب من الدكة إلى النصف السفلي يصبح أصفر', await team_of(pg, id2) == 'A')
    # نقر على لاعب في الدكة ثم نقر على الملعب
    c = pg.locator('.pool-chip').first
    name3 = (await c.locator('.pool-name').inner_text()).strip()
    await c.tap()
    box = await canvas_box(pg)
    await pg.touchscreen.tap(box['x'] + box['width'] * 0.25, box['y'] + box['height'] * 0.66)
    await wait_saved(pg)
    check('النقر على لاعب ثم على الملعب يضعه هناك', await team_of(pg, by_name[name3]) == 'A')
    # نقل اللاعب الأول من النصف العلوي إلى السفلي
    pl = {p['id']: p for p in await placed(pg)}
    a = pl[id1]
    await touch_drag(cdp, pg, box['x'] + a['x'], box['y'] + a['y'] - a['h'] * 0.5,
                     box['x'] + box['width'] * 0.75, box['y'] + box['height'] * 0.6, steps=20, shot=f'{OUT}/mob-cross.png')
    check('عبور خط المنتصف يغيّر لون اللاعب تلقائيًا', await team_of(pg, id1) == 'A')
    # إرجاع لاعب إلى الدكة
    pl = {p['id']: p for p in await placed(pg)}
    a = pl[id2]
    tray = await pg.locator('.touchline').bounding_box()
    await touch_drag(cdp, pg, box['x'] + a['x'], box['y'] + a['y'] - a['h'] * 0.5, tray['x'] + tray['width'] / 2, tray['y'] + tray['height'] / 2, steps=20)
    check('السحب إلى الدكة يعيد اللاعب محايدًا', await team_of(pg, id2) is None and await pg.locator('.pool-chip').count() == 12)
    await pg.screenshot(path=f'{OUT}/mob-manual.png')
    sw = await pg.evaluate('document.documentElement.scrollWidth')
    check('لا تمرير أفقي على الهاتف', sw <= 390, f'scrollWidth={sw}')
    check('لا أخطاء في الصفحة (الهاتف)', not errors, '; '.join(errors))
    await ctx.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await desktop(b)
        await mobile(b)
        await b.close()
    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} نجح')
    sys.exit(1 if failed else 0)


asyncio.run(main())
