import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3031/login'); await p.fill('input[name=email]','admin@ringo.local'); await p.fill('input[name=password]','ringo1234!'); await p.click('button[type=submit]'); await p.waitForURL(u=>!u.pathname.startsWith('/login'));
for (const u of process.argv.slice(2)) { await p.goto('http://127.0.0.1:3031'+u); const h=await p.content(); for (const re of [/Unhandled Runtime Error/, /Application error/, /Internal Server Error/, /This page could not be found/]) { const i=h.search(re); if(i>=0) console.log(u, re, JSON.stringify(h.slice(Math.max(0,i-150), i+80))); } const txt = await p.innerText('main').catch(()=>''); console.log('MAIN:', txt.slice(0,200).replace(/\n/g,' | ')); }
await b.close();
