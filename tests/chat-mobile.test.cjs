const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('SchoolShield/chat-mobile.js','utf8');
function viewportHarness(chatPage = 'parent-chat', withViewport = true) {
  const events = {}, frames = [], css = {}, classes = {};
  const vv = { height:800, offsetTop:0, scale:1, addEventListener: (event,fn) => events['viewport:'+event] = fn };
  const window = { innerHeight:800, innerWidth:360, visualViewport:withViewport ? vv : null, addEventListener: (event,fn) => events[event] = fn };
  const document = { body: { dataset: { page:chatPage }, classList: { toggle: (name,value) => classes[name] = value } }, documentElement: { style: { setProperty: (name,value) => css[name] = value } } };
  vm.runInNewContext(code,{window,document,requestAnimationFrame: fn => { frames.push(fn); return frames.length; }});
  return {window,vv,events,frames,css,classes,flush: () => frames.shift()?.()};
}
test('all chat pages size to visual viewport and coalesce keyboard events', () => {
  for (const page of ['parent-chat','teacher-chat','sgb-chat']) {
    const h = viewportHarness(page);
    h.vv.height=440; h.vv.offsetTop=15;
    h.events['viewport:resize'](); h.events['viewport:scroll'](); h.events.resize();
    assert.equal(h.frames.length,1); h.flush();
    assert.equal(h.css['--chat-viewport-height'],'440px'); assert.equal(h.css['--chat-viewport-top'],'15px');
    assert.equal(h.classes['chat-keyboard-open'],true);
    h.vv.height=800; h.events['viewport:resize'](); h.flush(); assert.equal(h.classes['chat-keyboard-open'],false);
  }
});
test('Android layout resize fallback and orientation update without fixed device heights', () => {
  const h = viewportHarness('parent-chat',false);
  h.window.innerHeight=420; h.events.resize(); h.flush();
  assert.equal(h.css['--chat-viewport-height'],'420px'); assert.equal(h.classes['chat-keyboard-open'],true);
  h.window.innerHeight=360; h.window.innerWidth=800; h.events.resize(); h.flush();
  assert.equal(h.classes['chat-keyboard-open'],false);
});
test('pinch zoom is not interpreted as a keyboard and unrelated pages are untouched', () => {
  const h=viewportHarness(); h.vv.scale=2; h.vv.height=400; h.events['viewport:resize'](); h.flush();
  assert.equal(h.css['--chat-viewport-height'],'800px');
  const other=viewportHarness('dashboard'); assert.deepEqual(other.css,{}); assert.deepEqual(other.events,{});
});
