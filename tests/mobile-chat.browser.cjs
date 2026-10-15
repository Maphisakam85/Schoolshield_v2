/* Browser regression test. Install Playwright outside the repo, then set
   PLAYWRIGHT_MODULE to its module directory. Uses installed Edge by default. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const appSource = fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/, '');
const server = http.createServer((request, response) => {
  if (request.url === '/styles.css') {
    response.setHeader('Content-Type','text/css'); response.end(fs.readFileSync('SchoolShield/styles.css')); return;
  }
  response.setHeader('Content-Type','text/html');
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content"><link rel="stylesheet" href="/styles.css"></head><body data-page="parent-chat"><div id="app"></div></body></html>');
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHAT_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  let count = 0;
  try {
    for (const [width,height] of [[360,800],[390,844],[412,915]]) {
      for (const chatPage of ['parent-chat','teacher-chat','sgb-chat']) {
        const context = await browser.newContext({ viewport: { width,height }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        page.on("pageerror", error => console.log("PAGE ERROR", error.message));
        await page.route('https://fonts.googleapis.com/**',route => route.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(({ chatPage,height }) => {
          document.body.dataset.page = chatPage;
          // Emulate the visual viewport shrinking/panning above a virtual keyboard.
          const vv = new EventTarget(); Object.assign(vv,{ height, offsetTop:0, scale:1 });
          Object.defineProperty(window,'visualViewport',{ value:vv, configurable:true });
          window.testViewport = vv;
          sessionStorage.setItem('schoolshieldSession',JSON.stringify({userId:'one',schoolCode:'TEST',schoolName:'Test School',role:'principal',displayName:'Publisher'}));
        },{chatPage,height});
        await page.addScriptTag({content:appSource});
        await page.addScriptTag({content:fs.readFileSync('SchoolShield/chat-mobile.js','utf8')});
        await page.evaluate(() => {
          window.testConversation = [{id:'Recipient', role:'School member',initials:'R',messages:Array.from({length:60},(_,i)=>({from:i%2?'me':'them',text:'Message '+i,date:'07 Oct 2026'}))}];
          window.testRenders = 0;
          // Keep unrelated workspace/auth setup out of the layout test.
          allowed = () => true; role = () => 'principal'; userName = () => 'Publisher'; param = () => null;
          shell = body => `<div class="app-shell"><main class="main"><header class="topbar"><h2>Chat</h2></header><section class="content">${body}</section></main></div>`;
          const content = () => chatLayout('Chat','Communication','School chat',window.testConversation,'parentChat');
          teacherChat = parentChat = sgbChat = content;
          bind = () => { window.testRenders++; const messages = document.querySelector('.messages'); messages.scrollTop = messages.scrollHeight; };
          render();
          window.originalInput = document.getElementById('chatInput');
        });
        await page.locator('#chatInput').fill('Draft text while a reply arrives');
        await page.locator('#chatInput').focus();
        await page.evaluate(() => document.getElementById('chatInput').setSelectionRange(6,10));
        await page.evaluate(height => {
          testViewport.height = height * 0.55; testViewport.dispatchEvent(new Event('resize'));
        },height);
        await page.waitForFunction(() => document.body.classList.contains('chat-keyboard-open'));
        const keyboard = await page.evaluate(() => {
          const composer = document.querySelector('.chat-compose').getBoundingClientRect();
          return { bottom:composer.bottom, height:visualViewport.height, details: Array.from(document.querySelectorAll("#app,.main,.content,.chat-layout,.chat-window,.messages,.chat-compose")).map(el=>({cls:el.className,rect:el.getBoundingClientRect().toJSON(),height:getComputedStyle(el).height,minHeight:getComputedStyle(el).minHeight,flex:getComputedStyle(el).flex})), scale:visualViewport.scale, style:document.documentElement.getAttribute("style"), cls:document.body.className, inner:innerHeight, scroll:scrollY, overflow:document.documentElement.scrollWidth > innerWidth };
        });
        assert.ok(keyboard.bottom <= keyboard.height + 1,`${chatPage} ${width}: composer above keyboard ${JSON.stringify(keyboard)}`);
        assert.equal(keyboard.scroll,0); assert.equal(keyboard.overflow,false);
        const before = await page.evaluate(() => {
          const messages = document.querySelector('.messages'); messages.scrollTop = 100;
          return messages.scrollTop;
        });
        await page.evaluate(() => {
          testConversation[0].messages.push({from:'them',text:'Incoming reply',date:'07 Oct 2026'});
          render(); render();
        });
        const after = await page.evaluate(() => {
          const input = document.getElementById('chatInput');
          return { same:input === originalInput, focused:document.activeElement === input, value:input.value, start:input.selectionStart,end:input.selectionEnd,scroll:document.querySelector('.messages').scrollTop,renders:testRenders };
        });
        assert.equal(after.same,true); assert.equal(after.focused,true);
        assert.equal(after.value,'Draft text while a reply arrives'); assert.equal(after.start,6); assert.equal(after.end,10);
        assert.equal(after.scroll,before); assert.equal(after.renders,1,'refresh must not rebind/refocus input');
        await page.keyboard.insertText('more');
        assert.equal(await page.locator('#chatInput').inputValue(),'Draft more while a reply arrives');
        // Chromium resizes-content behaviour: the layout viewport also shrinks.
        await page.setViewportSize({width,height:Math.round(height * 0.55)});
        await page.waitForFunction(() => document.querySelector('.chat-compose').getBoundingClientRect().bottom <= visualViewport.height + 1);
        assert.equal(await page.evaluate(() => scrollY),0);
        await page.evaluate(() => {
          const messages = document.querySelector('.messages'); messages.scrollTop = messages.scrollHeight;
          testConversation[0].messages.push({from:'them',text:'Latest reply',date:'07 Oct 2026'}); render();
        });
        assert.ok(await page.evaluate(() => { const p = document.querySelector('.messages'); return p.scrollHeight-p.clientHeight-p.scrollTop <= 1; }));
        await page.evaluate(height => {
          testViewport.offsetTop = 20; testViewport.dispatchEvent(new Event('scroll'));
        },height);
        await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--chat-viewport-top') === '20px');
        assert.ok(await page.evaluate(() => document.querySelector('.chat-compose').getBoundingClientRect().bottom <= visualViewport.height + visualViewport.offsetTop + 1));
        await page.evaluate(height => { testViewport.height=height; testViewport.offsetTop=0; testViewport.dispatchEvent(new Event('resize')); },height);
        await page.setViewportSize({width,height});
        await page.waitForFunction(() => !document.body.classList.contains('chat-keyboard-open'));
        assert.equal(await page.evaluate(() => document.body.classList.contains('chat-keyboard-open')),false);
        const outgoing = await page.locator('.chat-message.outgoing').first().evaluate(el => getComputedStyle(el).justifyContent);
        assert.equal(outgoing,'flex-end');
        await context.close(); count++;
        console.log(`PASS ${chatPage} ${width}x${height}: keyboard resize, draft/cursor/focus, incoming reply, history scroll`);
      }
    }
    console.log(`${count} browser cases passed. Physical Android/iOS keyboards were not exercised.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => server.close());
