import { writeFile } from 'node:fs/promises';
import { AUDIO_TRACKS } from '../src/core/audio-tracks.mjs';

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const tracks = Object.values(AUDIO_TRACKS).map(track => `<article id="${track.id}"><h2>${escape(track.name)}</h2><p>${escape(track.title)}<br>by ${escape(track.author)}</p><p><a href="${track.source}">Freesound 原始作品</a> · <a href="${track.licenseUrl}">${track.license}</a></p></article>`).join('\n');
await writeFile(new URL('../public/audio/credits.html', import.meta.url), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>声音来源 · 在野 Go Wild</title><style>
*{box-sizing:border-box}body{margin:0;background:#081516;color:#eef1ea;font-family:system-ui,"PingFang SC",sans-serif;line-height:1.8}main{max-width:840px;margin:auto;padding:56px 24px}a{color:#88decc;text-underline-offset:4px}h1{font-size:clamp(30px,6vw,48px);font-weight:400;line-height:1.3;margin:28px 0}h2{font-size:20px;font-weight:500;margin:0 0 8px}p{color:#b4cac4}article{border-top:1px solid #315352;padding:24px 0}article p{margin:8px 0;overflow-wrap:anywhere}.note{margin:24px 0 40px;padding:16px 20px;background:#122b2a;border-radius:12px}
</style></head><body><main><a href="/">在野 · Go Wild</a><h1>让风景，有自己的声音。</h1><p>以下素材来自用户提供的两个音频包，包内附有 Freesound 来源和许可信息。</p><div class="note"><p>使用 MP3 试听版；原文件保持不变。应用播放时进行音量补偿、首尾柔化及场景切换淡入淡出，没有更改音高或语速。声音是主题配乐，不表示在画面中的地点录制。</p><p>「深海氛围」和「极地合成风」为合成素材；「帐篷听风」包含帐篷布料声音。CC BY 作品署名、来源与许可如下。</p></div>${tracks}</main></body></html>\n`);
console.log('Audio attribution → public/audio/credits.html');
