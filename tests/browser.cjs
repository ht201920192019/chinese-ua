const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'styles.css', 'script.js', 'favicon.svg']);
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(name)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({html:'text/html; charset=utf-8', css:'text/css', js:'text/javascript', svg:'image/svg+xml'})[name.split('.').pop()]);
  res.end(fs.readFileSync(path.join(root, name)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    const page = await browser.newPage({reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    const broken = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).map(a=>a.href));
    assert.deepEqual(broken, []);
    for (const file of files) assert.equal((await page.request.get(`${url}/${file}`)).status(), 200);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('html').getAttribute('lang'), 'uk');
    assert.equal(await page.locator('#actionStatus').isVisible(), false);
    for (const width of [320,375,390,430,560,768,860,861,1024,1440]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      const hrefs = await page.locator('a[href^="#"]').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href')))]);
      for (const href of hrefs) {
        await page.evaluate(hash => { document.querySelector(hash).scrollIntoView(); }, href);
        const top = await page.locator(href).evaluate(el => el.getBoundingClientRect().top);
        assert.ok(top >= 0, `${href} offscreen at ${width}`);
      }
    }
    await page.setViewportSize({width:375,height:812});
    await page.locator('#menuButton').click();
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'),'true');
    await page.locator('#navLinks a[href="#pinyin"]').click();
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'),'false');
    assert.ok(await page.locator('#pinyin').evaluate(el=>el.getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom));
    await page.locator('#menuButton').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#menuButton').evaluate(el=>el===document.activeElement),true);
    await page.locator('#menuButton').click();
    await page.locator('#pinyin h2').click();
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'),'false');
    await page.locator('#menuButton').click();
    await page.setViewportSize({width:1024,height:900});
    await page.waitForFunction(()=>document.getElementById('menuButton').getAttribute('aria-expanded')==='false');
    await page.setViewportSize({width:320,height:812});
    await page.addStyleTag({content:'html {font-size: 200%}'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'enlarged text overflow');
    await page.reload();
    console.log('Native speech capability:', await page.evaluate(()=>({supported:'speechSynthesis' in window, voices:window.speechSynthesis?.getVoices().map(v=>v.lang)})));
    for (const id of ['speakNihao','speakDaily']) {
      await page.locator(`#${id}`).click();
      await page.waitForFunction(() => /завершено|Не вдалося|не відповідає|не доступний/.test(document.getElementById('actionStatus').textContent), { }, {timeout:25000});
      console.log('Native speech result',id,await page.locator('#actionStatus').textContent());
    }
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}}));
    await page.locator('#copyDaily').click();
    await page.waitForFunction(()=>document.getElementById('copyDaily').textContent.includes('✓'));
    assert.equal(await page.evaluate(()=>window.copied),'我想学中文。\nWǒ xiǎng xué Zhōngwén.\nЯ хочу вивчати китайську мову.');
    await page.waitForFunction(()=>!document.getElementById('copyDaily').disabled);
    await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied')};});
    await page.locator('#copyDaily').click();
    await page.waitForFunction(()=>document.getElementById('actionStatus').textContent.includes('Текст виділено'));
    assert.ok(await page.evaluate(()=>getSelection().toString().includes('Wǒ xiǎng')));
    assert.deepEqual(errors,[]);
    // Controlled speech engine: assert the texts, language, lifecycle and error handling.
    await page.addInitScript(()=>{
      window.voiceList=[{lang:'zh-CN',name:'Test Mandarin'}];
      window.spoken=[];
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
        getVoices:()=>window.voiceList,
        cancel:()=>{},
        speak:u=>{window.lastUtterance=u;window.spoken.push({text:u.text,lang:u.lang,rate:u.rate});u.onstart?.();}
      }});
      window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    });
    await page.reload();
    for (const [id,text] of [['speakNihao','你好'],['speakDaily','我想学中文。']]) {
      await page.locator(`#${id}`).click();
      assert.deepEqual(await page.evaluate(()=>window.spoken.at(-1)),{text,lang:'zh-CN',rate:0.8});
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>window.lastUtterance.onend());
      assert.equal(await page.locator(`#${id}`).textContent(),'▶ Прослухати');
    }
    await page.locator('#speakNihao').click();
    await page.locator('#speakNihao').click();
    assert.ok((await page.locator('#actionStatus').textContent()).includes('зупинено'));
    await page.locator('#speakNihao').click();
    await page.evaluate(()=>window.lastUtterance.onerror());
    assert.ok((await page.locator('#actionStatus').textContent()).includes('Не вдалося'));
    await page.evaluate(()=>{window.voiceList=[];});
    await page.locator('#speakDaily').click();
    assert.ok((await page.locator('#actionStatus').textContent()).includes('голос ще не доступний'));
    await page.evaluate(()=>{window.voiceList=[{lang:'zh-CN'}];});
    await page.locator('#speakDaily').click();
    assert.equal(await page.locator('#speakDaily').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>window.lastUtterance.onend());
    const unsupported = await browser.newPage();
    await unsupported.addInitScript(()=>{delete window.speechSynthesis;delete window.SpeechSynthesisUtterance;});
    await unsupported.goto(url);
    await unsupported.locator('#speakNihao').click();
    assert.ok((await unsupported.locator('#actionStatus').textContent()).includes('не підтримує'));
    const nojs = await browser.newPage({javaScriptEnabled:false,viewport:{width:320,height:812}});
    await nojs.goto(url);
    assert.equal(await nojs.locator('#navLinks').isVisible(),true);
    assert.equal(await nojs.locator('#speakNihao').isVisible(),false);
    await page.reload();
    await page.setViewportSize({width:390,height:844});
    await page.goto(url);
    await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement.blur();});
    await page.screenshot({path:path.join(require('node:os').tmpdir(),'chinese-ua-mobile.png'),fullPage:true});
    await page.screenshot({path:path.join(require('node:os').tmpdir(),'chinese-ua-mobile-top.png')});
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(require('node:os').tmpdir(),'chinese-ua-desktop.png'),fullPage:true});
    await page.screenshot({path:path.join(require('node:os').tmpdir(),'chinese-ua-desktop-top.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: assets, anchors, 10 viewport widths, enlarged text, menu, clipboard, both speech buttons, errors, delayed voices, no-JS fallback.');
    console.log('Screenshots:',require('node:os').tmpdir());
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
