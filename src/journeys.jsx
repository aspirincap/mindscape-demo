import React from 'react';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { LOCATIONS, locationForWorld } from './core/locations.mjs';
import { Brand } from './Brand';
import { JOURNEYS, journeyForWorld, journeyHref, journeyCover, journeyImage, resonanceHref, transportActivities } from './core/travel.mjs';
import { productPrice, moneyRange, durationLabel, experienceLabel } from './core/product.mjs';

function JourneyDetail({ scene, journey, place }) {
  const image = journeyImage(scene);
  return <article className="detail-layout" aria-labelledby="detail-title" data-scene={scene}>
    <a className="modal-close" href={resonanceHref(scene)} aria-label={`关闭行程，返回${place.name}共鸣`}><X size={20}/></a>
    <div className="detail-visual"><div className="detail-art"><img src={journeyCover(scene)} alt={image?.src ? image.alt : `${place.name}主题意象`} style={image ? {objectPosition:image.object_position || 'center'} : undefined} width={image?.width || 600} height={image?.height || 400}/><span className="cover-overlay"/><span className="cover-title"><strong>{place.name}</strong><small>{place.country}</small></span><p className="visual-note">{image?.src ? image.caption : '主题意象图 · 非目的地实拍'}</p></div></div>
    <div className="detail-copy">
      <p className="eyebrow">{journey.sku} / {journey.name} / {durationLabel(journey)}</p>
      <h1 id="detail-title">{journey.title}</h1>
      <p className="detail-description">{journey.intro}</p>
      <p className="journey-base">集合地 <strong>{journey.meeting_point || journey.base}</strong></p>
      {experienceLabel(journey) && <p className="journey-experiences">体验安排：{experienceLabel(journey)}</p>}
      {journey.target_audience && <p className="journey-audience">适合人群：{journey.target_audience}</p>}
      {journey.availability_caveat && <p className="availability-note">开放提醒：{journey.availability_caveat}</p>}
      <section aria-labelledby="highlights-title"><h2 className="detail-label" id="highlights-title">旅程亮点</h2><ol className="highlights">{journey.highlights.map((text,i)=><li key={text}><b>{String(i+1).padStart(2,'0')}</b><span>{text}</span></li>)}</ol></section>
      <section aria-labelledby="days-title"><h2 className="detail-label" id="days-title">每日行程</h2><p className="planning-note">{journey.planning_note}</p><ol className="journey-days">{journey.days.map(day=><li key={day.day}><div className="day-heading"><span>DAY {String(day.day).padStart(2,'0')}</span><h3>{day.title}</h3></div><ul>{day.activities.map(activity=><li key={activity}>{activity}</li>)}</ul><dl className="day-logistics"><div><dt>住宿</dt><dd>{day.accommodation}</dd></div><div><dt>交通</dt><dd>{day.transport}</dd></div></dl></li>)}</ol></section>
      <section aria-labelledby="cost-title"><h2 className="detail-label" id="cost-title">费用说明</h2><p className="moment">{journey.cost_note}</p></section>
      <section aria-labelledby="season-title"><h2 className="detail-label" id="season-title">季节与出行时间</h2><p className="moment">{journey.season_note}</p></section>
      <section aria-labelledby="transport-title"><h2 className="detail-label" id="transport-title">交通衔接建议</h2><p className="moment">以{journey.base}为出发基地。出发前按每日安排确认抵达、活动接送和离开的交通，留出衔接时间。</p>{transportActivities(journey).length>0&&<ul className="transport-notes">{transportActivities(journey).map(text=><li key={text}>{text}</li>)}</ul>}<p className="transport-caption">具体班次、接送范围与当天运行情况，请向住宿方或活动运营方确认。</p></section>
      <section aria-labelledby="safety-title"><h2 className="detail-label" id="safety-title">出发前确认</h2><p className="notice">{journey.safety_note}</p></section>
      <div className="journey-order"><p className="journey-price">售价 <strong>{moneyRange(productPrice(journey))} / 人</strong></p><details className="booking-action"><summary className="primary">立即下单 <ArrowUpRight size={16}/></summary><p className="order-caption" role="status">在线支付暂未接入。</p></details></div>
      <div className="detail-footer"><a className="secondary" href={resonanceHref(scene)}><ArrowLeft size={16}/>返回{place.name}共鸣</a><a className="secondary" href="/journeys.html">全部旅行行程</a></div>
      {image?.src && <p className="photo-credit">照片：{image.author} · <a href={image.source_url} target="_blank" rel="noopener noreferrer">图片来源</a> · <a href={image.license_url} target="_blank" rel="noopener noreferrer">{image.license}</a> · {image.modification?.startsWith('Resized') ? '已缩放、转为 WebP 及响应裁切；改编沿用原许可。' : image.modification}</p>}
    </div>
  </article>;
}

function JourneyDirectory({ scene }) {
  return <section className="journey-directory" aria-labelledby="directory-title">
    <p className="eyebrow">PLACES TO GO</p><h1 id="directory-title">从一处风景，开始一段旅程。</h1>
    <p className="directory-intro">{JOURNEYS.length} 个目的地的建议行程。按自己的时间与节奏，选择想去的那一处。</p>
    {scene && <p className="route-error" role="alert">没有找到这个场景的行程。请从下方选择目的地。</p>}
    <div className="journey-grid">{LOCATIONS.map(l=>{const j=journeyForWorld(l.worldId),image=journeyImage(l.worldId);if(!j)return null;return <a className="journey-tile" key={l.worldId} href={journeyHref(l.worldId)} data-scene={l.worldId}><div className="tile-cover"><img src={journeyCover(l.worldId)} alt={image?.src ? image.alt : `${l.name}主题意象`} style={image ? {objectPosition:image.object_position || 'center'} : undefined} loading="lazy" width={image?.width || 600} height={image?.height || 400}/><span>{l.name}</span></div><div className="tile-copy"><p>{l.country} / {durationLabel(j)}</p><span className="directory-place">{l.name}</span><h2>{j.title}</h2><small>集合地：{j.meeting_point || j.base}</small><small className="directory-price">{moneyRange(productPrice(j))} / 人</small><span className="tile-action">查看活动 <ArrowUpRight size={16}/></span>{image?.src ? <small className="tile-credit">照片：{image.author} · {image.license} · 已响应裁切；详情页保留来源、许可与处理说明。</small> : <small className="tile-credit">主题意象图 · 非目的地实拍</small>}</div></a>;})}</div>
    <p className="directory-note">完整行程、价格及出行条件均在各商品页面中展示。配图包含实景照片与主题意象图，署名与说明见详情。</p>
  </section>;
}

export default function Journeys({ scene = null }) {
  const journey = journeyForWorld(scene), place = locationForWorld(scene);
  return <><a className="skip" href="#journey-main">跳到旅行行程</a><header className="journey-header"><Brand className="journey-brand"/><a className="header-return" href={resonanceHref(scene)}><ArrowLeft size={16}/>{journey?`返回${place.name}共鸣`:'返回在野'}</a></header><main id="journey-main">{journey && place ? <JourneyDetail scene={scene} journey={journey} place={place}/> : <JourneyDirectory scene={scene}/>}</main></>;
}
