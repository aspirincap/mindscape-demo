import {chromium} from 'playwright';
import {existsSync,readdirSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const cache=join(homedir(),'Library/Caches/ms-playwright');const fallback=existsSync(cache)?readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort().reverse().map(n=>join(cache,n,`chrome-headless-shell-mac-${process.arch==='arm64'?'arm64':'x64'}`,'chrome-headless-shell')).find(existsSync):undefined;
const browser=await chromium.launch({headless:true,proxy:process.env.GEO_TEST_PROXY?{server:process.env.GEO_TEST_PROXY}:undefined,executablePath:existsSync(chromium.executablePath())?undefined:fallback});
const base=process.env.GEO_TEST_URL||'http://127.0.0.1:5174';const errors=[],report=[];await mkdir('artifacts/geospatial/verification',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/\/assets\/fonts\/rv-(display|brand|text)\.woff2$/.test(m.location().url))errors.push(m.text());});
 await page.goto(base);await page.getByRole('link',{name:'直接探索 22 个世界',exact:true}).click();await page.getByRole('button',{name:'选择目的地：富士山',exact:true}).click();await page.getByRole('button',{name:'进入富士山',exact:true}).click();await page.getByRole('region',{name:'空中导览',exact:true}).waitFor({timeout:60000});await page.getByText('地图与导览设置',{exact:true}).click();await page.waitForTimeout(3500);await page.screenshot({path:'artifacts/geospatial/verification/fuji-ui.png'});

 assert.match(await page.locator('.visual-trigger').innerText(),/导览光影/);await page.locator('.visual-trigger').click();
 for(const preset of ['清晰','流光','梦境']){const button=page.getByRole('group',{name:'视觉预设'}).getByRole('button',{name:new RegExp(preset)});await button.click();await page.waitForFunction(()=>!document.querySelector('.geo-tour p').textContent.includes('光影随行'));assert.equal(await button.getAttribute('aria-pressed'),'true');}
 await page.getByRole('button',{name:'原始点云',exact:true}).click();assert.ok(await page.getByRole('slider',{name:'聚散程度',exact:true}).isDisabled());
 await page.getByRole('button',{name:'粒子流动',exact:true}).click();assert.ok(await page.getByRole('slider',{name:'光晕强度',exact:true}).isDisabled());assert.ok(await page.getByRole('slider',{name:'聚散程度',exact:true}).isEnabled());
 await page.getByRole('button',{name:'完整光影',exact:true}).click();assert.ok(await page.getByRole('slider',{name:'余辉时长',exact:true}).isEnabled());
 for(const [label,max]of [['聚散程度','1'],['粒子尺寸','2'],['画面亮度','2']]){const slider=page.getByRole('slider',{name:label,exact:true});await slider.focus();await slider.press('End');assert.equal(await slider.inputValue(),max);}
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();assert.equal(await page.getByRole('slider',{name:'聚散程度',exact:true}).inputValue(),'0');await page.getByRole('button',{name:'关闭视觉调节',exact:true}).click();assert.ok(await page.getByRole('button',{name:/开启手势/}).isEnabled());
 await page.getByRole('button',{name:'打开探索地图与数据来源',exact:true}).click();await page.getByRole('dialog',{name:'富士山探索地图与来源'}).waitFor();await page.screenshot({path:'artifacts/geospatial/verification/map-ui.png'});await page.getByRole('button',{name:'关闭探索地图',exact:true}).click();

 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000);await page.screenshot({path:'artifacts/geospatial/verification/mobile-fuji.png'});

 await page.locator('.visual-trigger').click();const visualBounds=await page.locator('.visual-panel').boundingBox();assert.ok(visualBounds.x>=0&&visualBounds.x+visualBounds.width<=391&&visualBounds.y>=0&&visualBounds.y+visualBounds.height<=845);await page.screenshot({path:'artifacts/geospatial/verification/mobile-visual-panel.png'});await page.getByRole('button',{name:'关闭视觉调节',exact:true}).click();
 const bounds=await page.locator('.geo-controls').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.y>=0&&bounds.y+bounds.height<=844);
 await page.getByRole('button',{name:'打开探索地图与数据来源',exact:true}).click();await page.screenshot({path:'artifacts/geospatial/verification/mobile-map.png'});await page.getByRole('button',{name:'关闭探索地图',exact:true}).click();
 await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'返回地球',exact:true}).click();await page.getByRole('button',{name:'选择目的地：大峡谷',exact:true}).click();await page.getByRole('button',{name:'进入大峡谷',exact:true}).click();await page.getByRole('region',{name:'空中导览',exact:true}).waitFor({timeout:60000});await page.getByText('地图与导览设置',{exact:true}).click();await page.getByLabel('跳转地理地标').selectOption('phantom');await page.waitForTimeout(5000);await page.screenshot({path:'artifacts/geospatial/verification/canyon-ui.png'});
 await page.getByRole('button',{name:'返回地球',exact:true}).click();await page.getByRole('button',{name:'选择目的地：墨宝',exact:true}).click();await page.getByRole('button',{name:'进入墨宝',exact:true}).click();await page.waitForTimeout(6000);assert.equal(await page.locator('.geo-controls:not(.scene-tour-controls)').count(),0);await page.screenshot({path:'artifacts/geospatial/verification/legacy-after-geo.png'});
 assert.deepEqual(errors,[]);console.log('PASS presets, three comparison modes, live sliders, hand-control availability, mobile panel, map, Fuji → Canyon → legacy transitions');
}catch(error){console.error(errors);throw error;}finally{await browser.close();}
