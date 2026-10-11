import { LOCATIONS } from './locations.mjs';

// A preference check-in, not a clinical scale. Only these volunteered choices go to AI.
export const CHECK_IN_VERSION = 1;
// Demo requirement: keep Plitvice available alongside two personalized choices.
export const DEMO_REQUIRED_WORLD = 'scene-04';
export const CHECK_IN_QUESTIONS = [
  { id: 'feeling', label: '此刻的心情，更接近哪一种？', hint: '不必斟酌，选最贴近现在的感受。', options: [
    { id: 'busy', label: '有些紧绷', detail: '事情很多，想给自己留一点空隙', tags: ['安静', '舒缓', '宁静'] },
    { id: 'tired', label: '有点疲惫', detail: '想暂时放下事情，慢慢歇一会儿', tags: ['恢复', '舒缓', '放松'] },
    { id: 'steady', label: '平静自在', detail: '状态还不错，想延续这份安定', tags: ['安静', '静谧', '独处'] },
    { id: 'curious', label: '期待新鲜', detail: '想换个视角，看一点不一样的风景', tags: ['探索', '缤纷', '辽阔'] },
  ] },
  { id: 'energy', label: '你现在的精力怎么样？', hint: '跟着自己的节奏，无需勉强。', options: [
    { id: 'low', label: '想安静地歇一会儿', detail: '更喜欢柔和、缓慢的体验', tags: ['安静', '宁静', '舒缓', '静谧'] },
    { id: 'balanced', label: '可以慢慢走走看看', detail: '愿意花一点心思探索细节', tags: ['恢复', '溪流', '轻盈', '放松'] },
    { id: 'high', label: '想来一场小小冒险', detail: '喜欢有层次、有变化的风景', tags: ['探索', '开阔', '缤纷', '辽阔'] },
  ] },
  { id: 'attention', label: '此刻，你的思绪停在哪里？', hint: '只描述自己的感觉，不需要参考设备分数。', options: [
    { id: 'scattered', label: '在很多事情之间跳转', detail: '想让目光有一个轻松的落点', tags: ['安静', '静谧', '宁静', '湖泊'] },
    { id: 'occupied', label: '有一件事一直挂在心上', detail: '想暂时把目光放远一点', tags: ['开阔', '释放', '辽阔', '舒展'] },
    { id: 'present', label: '能留意眼前的细节', detail: '想顺着光影，发现更多小小的变化', tags: ['探索', '萤光', '珊瑚', '苔藓'] },
  ] },
  { id: 'wish', label: '接下来的这段时间，你最想要什么？', hint: '这趟旅程，只需照顾当下的自己。', options: [
    { id: 'rest', label: '安静休息', detail: '留一段不被打扰的时间', tags: ['安静', '宁静', '独处', '静谧'] },
    { id: 'release', label: '松一口气', detail: '让视线和思绪一起舒展开', tags: ['释放', '舒展', '开阔', '辽阔'] },
    { id: 'restore', label: '找回一点活力', detail: '靠近绿意、流水和明亮的颜色', tags: ['恢复', '暖光', '愉悦', '轻盈'] },
    { id: 'discover', label: '遇见一点惊喜', detail: '看见日常之外的纹理与光', tags: ['探索', '缤纷', '荧光', '极光'] },
  ] },
  { id: 'landscape', label: '哪一种风景，最让你想靠近？', hint: '选一种向往，或把下一站交给灵感。', options: [
    { id: 'forest', label: '森林与溪流', detail: '叶影、苔石，还有缓缓流动的水', tags: ['森林', '雨林', '秋林', '溪流', '苔藓'] },
    { id: 'ocean', label: '海洋与水下', detail: '深蓝、鱼群，还有透过水面的光', tags: ['海底', '浅海', '珊瑚', '水母', '光束', '海峡'] },
    { id: 'mountain', label: '山川与大地', detail: '雪峰、岩层，还有开阔的远方', tags: ['雪山', '峡谷', '岩层', '冰川', '冰洞'] },
    { id: 'night', label: '夜色与微光', detail: '星空、萤光，还有轻轻浮动的光点', tags: ['星空', '极光', '萤光', '荧光', '夜海'] },
    { id: 'surprise', label: '让风景给我一点惊喜', detail: '没有特别偏好，愿意试试新的地方', tags: [] },
  ] },
];

export function validateAssessment(value) {
  if (!value || value.version !== CHECK_IN_VERSION || Object.keys(value).some(k => !['version', 'answers'].includes(k))) throw new Error('请使用当前版本的状态引导');
  const answers = value.answers;
  if (!answers || Array.isArray(answers) || typeof answers !== 'object' || Object.keys(answers).length !== CHECK_IN_QUESTIONS.length) throw new Error('请完成全部 5 道问题');
  const clean = {};
  for (const q of CHECK_IN_QUESTIONS) {
    if (!q.options.some(o => o.id === answers[q.id])) throw new Error('请从每道问题的选项中选择');
    clean[q.id] = answers[q.id];
  }
  return { version: CHECK_IN_VERSION, answers: clean };
}

export function assessmentSummary(assessment) {
  const { answers } = validateAssessment(assessment);
  return CHECK_IN_QUESTIONS.map(q => ({ question: q.label, answer: q.options.find(o => o.id === answers[q.id]).label }));
}

export function normalizeChoices(choices) {
  if (!Array.isArray(choices) || choices.length !== 3) throw new Error('需要 3 个目的地推荐');
  const seen = new Set();
  return choices.map(item => {
    const location = LOCATIONS.find(l => l.worldId === item?.world);
    const reason = typeof item?.reason === 'string' ? item.reason.trim() : '';
    const length = [...reason].length;
    if (!location || seen.has(location.id) || length < 24 || length > 40 || /[\r\n<>]/.test(reason)) throw new Error('推荐地点或理由不符合要求');
    seen.add(location.id);
    return { worldId: location.worldId, locationId: location.id, reason };
  });
}

export function assessmentResult(choices, mode = 'local-rules', assessment) {
  const selected = normalizeChoices(choices);
  if (!selected.some(choice => choice.worldId === DEMO_REQUIRED_WORLD)) {
    const place = LOCATIONS.find(l => l.worldId === DEMO_REQUIRED_WORLD);
    selected[2] = { worldId: place.worldId, locationId: place.id, reason: localReason(place.worldId, assessment) };
  }
  return {
    kind: 'assessment', mode, world: selected[0].worldId,
    reason: '按你此刻的感受，选出三个方向。喜欢哪一处，就从那里出发。',
    choices: selected,
    recommendedWorlds: [...selected, ...LOCATIONS.filter(l => !selected.some(c => c.locationId === l.id)).map(l => ({ worldId: l.worldId, locationId: l.id, reason: l.description }))],
  };
}

const REASON_DETAILS = {
  fuji: '在雪峰与湖水之间远眺，把目光轻轻交给远方。',
  'grand-canyon': '沿岩层与蜿蜒河流远眺，让辽阔慢慢铺满视野。',
  'scene-01': '跟随银色鱼群缓缓游动，看思绪在深蓝里舒展。',
  'scene-02': '沿层层叶影慢慢探索，让林间微光陪你停留。',
  'scene-03': '凝望洞顶轻柔的蓝色星点，留意细小光芒流动。',
  'scene-04': '循着溪水与瀑布的层次，让目光随着水光展开。',
  'scene-05': '在安静的雪林间稍作停留，看微光柔和地变化。',
  'scene-06': '顺着金色叶影慢慢走走，让暖光充满眼前。',
  'scene-07': '沿幽蓝洞水轻轻探望，在水色之间安静地停留。',
  'scene-08': '在苔石与溪流间寻找晨光，靠近细腻的绿意。',
  'scene-09': '看蓝色微粒在夜海边涌起，随光点慢慢地游移。',
  'scene-10': '沿冰壁的蓝色纹理探索，寻找尽头的一束光。',
  'scene-11': '凝望穿过水下的光束，让目光停在微粒之间。',
  'scene-12': '在海藻起伏的层次之间，寻找缓慢变化的光影。',
  'scene-13': '跟随金色水母轻轻浮动，感受明亮轻盈的色彩。',
  'scene-14': '从明亮浅湾望向珊瑚，慢慢发现水下的色彩。',
  'scene-15': '看暖色珊瑚与蓝色海水交织，收集缤纷的细节。',
  'scene-16': '在海底岩壁之间移动目光，追随落向深处的光。',
  'scene-17': '在冰川与倒影前远眺，给宽阔的冰蓝一点时间。',
  'scene-18': '顺着砂岩的曲线轻移，看暖光沿着岩壁铺开。',
  'scene-19': '凝望青绿微光掠过夜空，留一段属于夜色的时间。',
  'scene-20': '停留在山野与星空之间，让目光慢慢走向远处。',
};
const REASON_PREFIX = { rest: '想安静一会儿，', release: '想松一口气，', restore: '想找回活力，', discover: '想遇见惊喜，' };
function localReason(worldId, assessment) {
  return (REASON_PREFIX[assessment?.answers?.wish] || '换一种风景，') + REASON_DETAILS[worldId];
}

export function localAssessment(assessment, fallback = 'local-development') {
  const { answers } = validateAssessment(assessment);
  const weights = { feeling: 4, energy: 3, attention: 3, wish: 6, landscape: 18 };
  const ranked = LOCATIONS.map((l, index) => ({ location: l, index, score: CHECK_IN_QUESTIONS.reduce((sum, q) => {
    const option = q.options.find(o => o.id === answers[q.id]);
    return sum + (l.theme.some(t => option.tags.includes(t)) ? weights[q.id] : 0);
  }, 0) })).sort((a, b) => b.score - a.score || a.index - b.index);
  const choices = ranked.slice(0, 3).map(({ location: l }) => ({ world: l.worldId, reason: localReason(l.worldId, assessment) }));
  return { ...assessmentResult(choices, 'local-rules', assessment), fallback };
}
