import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork';
import { Leaf } from '@phosphor-icons/react/dist/csr/Leaf';
import { WechatLogo } from '@phosphor-icons/react/dist/csr/WechatLogo';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { WECHAT_GROUP } from './core/community.mjs';
import { journeyForWorld, journeyHref } from './core/travel.mjs';
import { durationLabel } from './core/product.mjs';
import { actionForScene, shouldOpenSceneAction } from './core/scene-actions.mjs';
import './scene-action.css';

export function SceneAction({ place, open, onOpen, onClose, tour, canAutoOpen }) {
  const dialog = useRef(null), trigger = useRef(null);
  const notified = useRef(false);
  const [notice, setNotice] = useState('');
  const [manualLink, setManualLink] = useState('');
  const action = actionForScene(place.id);
  const journey = journeyForWorld(place.worldId);
  const group = WECHAT_GROUP;
  const url = new URL(`/?scene=${encodeURIComponent(place.id)}`, window.location.origin).href;

  useEffect(() => {
    if (open) {
      notified.current = true;
      dialog.current?.showModal();
    }
    else if (dialog.current?.open) { dialog.current.close(); trigger.current?.focus({ preventScroll: true }); }
  }, [open]);
  useEffect(() => {
    if (shouldOpenSceneAction(tour, {
      shown: notified.current || open,
      available: canAutoOpen && !document.hidden && !document.querySelector('dialog[open]'),
    })) {
      notified.current = true;
      onOpen();
    }
  }, [tour, canAutoOpen, open, onOpen]);

  async function share() {
    setManualLink(url);
    setNotice('风景链接已准备好，可复制后发给朋友。');
    try { await navigator.clipboard.writeText(url); setNotice('风景链接已复制，发给想邀请的人吧。'); }
    catch { setManualLink(url); setNotice('可以长按或选中下方链接复制。'); }
  }

  return <>
    <button ref={trigger} className="outing-trigger" onClick={onOpen} aria-haspopup="dialog">
      <Leaf size={17}/><span>去现实里走走</span>
    </button>
    <dialog ref={dialog} className="outing-dialog" aria-labelledby="outing-title" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
      <button className="outing-close" aria-label="关闭风景行动卡" onClick={onClose}><X size={21}/></button>
        <div className="outing-image"><img src={action.image} alt={`${place.name} · ${place.title}主题示意`} style={{ objectPosition: action.imagePosition }} loading="lazy" decoding="async"/><span>一起在野 / GO TOGETHER</span></div>
        <div className="outing-body"><div className="outing-kicker">{place.country} / {place.name}</div><h2 id="outing-title">{action.headline.map(line => <span key={line}>{line}</span>)}</h2>
          <p className="outing-lede">{action.description}</p>
          <div className="outing-inspiration"><span className="outing-inspiration-label">旅行行程</span><strong>{journey?.title || action.activity}</strong><span>{journey ? `${durationLabel(journey)} · ${journey.meeting_point || journey.base}集合` : action.moments.join(' · ')}</span></div>
          {group && <section className="outing-group" aria-labelledby="outing-group-title">
            <a className="outing-group-qr" href={group.qrImage} target="_blank" rel="noopener noreferrer" aria-label="查看放大的群二维码（新标签页）">
              <img src={group.qrImage} alt={`${group.name}${group.isDemo ? '演示' : ''}二维码`} width="128" height="128" loading="lazy" decoding="async"/>
            </a>
            <div className="outing-group-info">
              <span className="outing-group-label"><WechatLogo size={18}/> 微信同行群</span>
              <h3 id="outing-group-title">{group.name}</h3>
              <p>{group.description}</p>
              {group.isDemo && <span className="outing-group-demo">DEMO · 非真实入群邀请</span>}
            </div>
          </section>}
          {journey && <a className="outing-primary" href={journeyHref(place.worldId)} target="_blank" rel="noopener noreferrer">查看行程与价格 <ArrowUpRight size={19}/><span className="sr-only">（新标签页）</span></a>}
          <button className="outing-share" onClick={share}><ShareNetwork size={17}/> 分享这片风景给朋友</button>
          <p className="outing-disclosure">封面为主题意象。每日安排、费用与出行条件详见{place.name}行程页。</p>
        </div>
      <div className="outing-feedback" role="status">{notice}</div>
      {manualLink && <label className="outing-copy">风景链接<input readOnly value={manualLink} onFocus={e => e.target.select()}/></label>}
    </dialog>
  </>;
}
