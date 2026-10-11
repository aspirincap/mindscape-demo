import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { CircleNotch } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { Broadcast } from '@phosphor-icons/react/dist/csr/Broadcast';
import { CHECK_IN_QUESTIONS } from './core/journey-assessment.mjs';
import { sceneEEGReadout } from './core/eeg-readout.mjs';
import { locationById } from './core/locations.mjs';
import { actionForScene } from './core/scene-actions.mjs';
import './journey-onboarding.css';

function useHeadingFocus(key) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [key]);
  return heading;
}

export function SensorPreparation({ source, live, connection, onCopy, onContinue, onSkip, onDevice, onHome }) {
  const reading = sceneEEGReadout(source, live, connection);
  const ready = reading.attention !== null && reading.meditation !== null;
  const heading = useHeadingFocus('prepare');
  return <section className="journey-page sensor-preparation" aria-labelledby="prepare-title">
    <div className="journey-intro">
      <div className="eyebrow">00 / BEFORE WE WANDER</div>
      <h1 id="prepare-title" ref={heading} tabIndex={-1}>戴好传感器，<br/>让世界感受你。</h1>
      <p>先给自己一点准备的时间。坐得舒服一些，让传感器与皮肤轻轻贴合。</p>
      <figure className="sensor-wearing-video">
        <video autoPlay muted loop playsInline controls preload="metadata" poster="/videos/sensor-wearing-poster.jpg" aria-label="传感器佩戴示意视频，静音循环播放">
          <source src="/videos/sensor-wearing.mp4" type="video/mp4"/>
          你的浏览器暂不支持视频播放，可<a href="/videos/sensor-wearing.mp4">打开佩戴示意视频</a>查看。
        </video>
        <figcaption>传感器佩戴示意</figcaption>
      </figure>
      <p className="journey-note">设备读数用于场景中的粒子与光影反馈；目的地推荐依据接下来由你填写的答案。</p>
    </div>
    <div className="journey-content">
      <ol className="wear-steps">
        <li><span>01</span><div><h2>调整佩戴，贴合皮肤</h2><p>按设备说明固定传感器，拨开接触处的头发，让采集电极和参考电极贴稳，松紧以舒适为宜。</p></div></li>
        <li><span>02</span><div><h2>连接设备，开始发送</h2><p>打开本地 EEG Studio，连接串口。在「连接在野」粘贴本页的配对配置，再点击「开始联动」。</p><div className="wear-links"><button className="text-button" onClick={onCopy}>复制配对配置 <ArrowRight size={15}/></button><a href="http://127.0.0.1:8765" target="_blank" rel="noopener noreferrer">打开 EEG Studio <span className="sr-only">（本机服务，新标签页）</span></a></div><details><summary>还没有启动 EEG Studio？</summary><p>在运行采集设备的电脑上，进入本项目后执行 <code>npm run eeg</code>，再打开上方链接。手机需通过这台电脑连接设备。</p></details></div></li>
        <li><span>03</span><div><h2>自然静坐，检查信号</h2><p>放松面部，减少动作，等待专注与冥想读数出现。若提示接触待调整，重新贴合电极后稍等片刻。</p></div></li>
      </ol>
      <div className={`wear-signal ${ready ? 'is-ready' : ''}`}>
        <div className="wear-signal-title" role="status">{ready ? <Check size={18}/> : <Broadcast size={18}/>}<span>{ready ? '已收到有效设备读数' : reading.status}</span></div>
        <div className="wear-readings"><span>专注分 <b>{reading.attention ?? '—'}</b></span><span>冥想分 <b>{reading.meditation ?? '—'}</b></span></div>
        {source !== 'device' && <button className="text-button" onClick={onDevice}>切换到真实设备</button>}
      </div>
      <div className="journey-actions"><button className="primary" disabled={!ready} onClick={onContinue}>已准备好，了解此刻的自己 <ArrowRight size={17}/></button><button className="text-button" onClick={onSkip}>暂不连接，先回答问题</button></div>
      <button className="journey-back text-button" onClick={onHome}><ArrowLeft size={15}/> 返回首页</button>
    </div>
  </section>;
}

export function StateCheckIn({ answers, onAnswer, onSubmit, routing, onBack, onExplore, cloud }) {
  const [index, setIndex] = useState(() => {
    const next = CHECK_IN_QUESTIONS.findIndex(q => !answers[q.id]);
    return next < 0 ? 4 : next;
  });
  const question = CHECK_IN_QUESTIONS[index];
  const heading = useHeadingFocus(index);
  const complete = CHECK_IN_QUESTIONS.every(q => answers[q.id]);
  const cover = actionForScene('scene-08');
  function previous() { if (index === 0) onBack(); else setIndex(index - 1); }
  function submit(event) {
    event.preventDefault();
    if (routing || !answers[question.id]) return;
    if (index < 4) setIndex(index + 1);
    else if (complete) onSubmit();
  }
  return <section className="journey-page state-check-in" aria-labelledby="check-in-title">
    <div className="journey-intro">
      <div className="eyebrow">01 / A MOMENT FOR YOURSELF</div>
      <h1>出发之前，<br/>先听听自己。</h1>
      <p>5 个小问题，找到更贴近此刻的风景。没有标准答案，按你的感受来就好。</p>
      <div className="check-in-landscape"><img src={cover.image} alt="林间溪流的主题风景"/><span>慢一点，也是一种抵达。</span></div>
    </div>
    <form className="journey-content" onSubmit={submit} aria-busy={routing}>
      <div className="question-progress"><span>问题 {String(index + 1).padStart(2, '0')} <small>/ 05</small></span><div aria-label="答题进度">{CHECK_IN_QUESTIONS.map((q, i) => <button type="button" key={q.id} aria-label={`第 ${i + 1} 题${answers[q.id] ? '，已回答' : ''}`} aria-current={i === index ? 'step' : undefined} disabled={routing || (i > index && !answers[q.id])} className={i === index ? 'current' : answers[q.id] ? 'done' : ''} onClick={() => setIndex(i)}/>)}</div></div>
      <fieldset disabled={routing} className="question-fieldset" key={question.id}>
        <legend id="check-in-title" ref={heading} tabIndex={-1}>{question.label}</legend>
        <p className="question-hint">{question.hint}</p>
        <div className="question-options">{question.options.map((option, i) => <label key={option.id} className={`question-option ${answers[question.id] === option.id ? 'selected' : ''}`}>
          <input type="radio" name={question.id} value={option.id} checked={answers[question.id] === option.id} onChange={() => onAnswer(question.id, option.id)}/>
          <span className="option-letter" aria-hidden="true">{answers[question.id] === option.id ? <Check size={15}/> : String.fromCharCode(65 + i)}</span>
          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
        </label>)}</div>
      </fieldset>
      <div className="question-navigation"><button className="text-button" type="button" disabled={routing} onClick={previous}><ArrowLeft size={16}/>{index === 0 ? '佩戴检查' : '上一题'}</button><button className="primary" disabled={routing || !answers[question.id] || (index === 4 && !complete)}>{routing ? <><CircleNotch size={18} className="spin"/>正在寻找三个目的地</> : <>{index === 4 ? '查看我的三个目的地' : '下一题'}<ArrowRight size={17}/></>}</button></div>
      <p className="journey-note" role={routing ? 'status' : undefined}>{routing ? '正在根据这 5 个答案挑选风景，请稍候…' : cloud ? '提交后，AI 仅根据这 5 个答案推荐风景，不发送脑电数据。' : '当前使用本地规则推荐；答案只用于这次风景探索，不发送脑电数据。'}</p>
      <button className="text-button question-explore" type="button" onClick={onExplore}>{routing ? '取消等待，自己探索' : '想随心走走？直接探索全部目的地'}<ArrowRight size={14}/></button>
    </form>
  </section>;
}

export function DestinationRecommendations({ recommendations, onChoose, onRevise, onExplore }) {
  const heading = useHeadingFocus('recommend');
  const ai = recommendations.mode === 'ai-gateway';
  const local = recommendations.fallback === 'local-development';
  return <section className="journey-recommendations" aria-labelledby="recommended-title">
    <div className="eyebrow">02 / THREE PLACES, YOUR CHOICE</div>
    <div className="recommendation-heading"><h1 id="recommended-title" ref={heading} tabIndex={-1}>让此刻的你，<br/>遇见一片风景。</h1><div><p>根据你的 5 个答案，选出了这三个方向。<br/>不必选“最合适”的，选你想靠近的。</p><span className="recommendation-source">{ai ? 'AI 推荐' : local ? '本地规则推荐' : 'AI 暂不可用 · 本地规则推荐'}</span></div></div>
    <div className="recommendation-cards">{recommendations.choices.map((choice, index) => {
      const place = locationById(choice.locationId), cover = actionForScene(place.id);
      return <article className="recommendation-card" key={place.id}>
        <div className="recommendation-image"><img src={cover.image} alt={`${place.name}主题风景`} style={{ objectPosition: cover.imagePosition }}/><span>0{index + 1} / {place.country}</span></div>
        <div className="recommendation-card-body"><span className="eyebrow">{place.english}</span><h2>{place.name}</h2><p>{choice.reason}</p><button className="primary" onClick={() => onChoose(place.id)}>进入这里 <ArrowRight size={17}/><span className="sr-only">，{place.name}</span></button></div>
      </article>;
    })}</div>
    <div className="recommendation-more"><button className="text-button" onClick={onRevise}><ArrowLeft size={15}/> 调整我的答案</button><button className="text-button" onClick={onExplore}>探索全部 22 个目的地 <ArrowRight size={16}/></button></div>
    <p className="journey-note">选择后直接进入场景，开启导览。图片为主题示意；除富士山与大峡谷外，场景地点为策划的灵感坐标。</p>
  </section>;
}
