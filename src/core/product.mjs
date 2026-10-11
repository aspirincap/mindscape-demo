export function productPrice(journey) {
  const min = journey?.price_min_cny, max = journey?.price_max_cny;
  return Number.isSafeInteger(min) && min > 0 && Number.isSafeInteger(max) && max >= min ? { min, max } : null;
}
export const moneyRange = price => price ? `¥${price.min.toLocaleString('zh-CN')}–${price.max.toLocaleString('zh-CN')}` : '未配置';
export const durationLabel = journey => `${journey.duration_days}天${Number.isInteger(journey.nights) ? `${journey.nights}晚` : ''}`;
const activityNames = {guided_snorkel_sessions:['向导浮潜','次'],guided_park_day_trips:['向导公园日游','次'],coastal_night_walks:['海岸夜行','次'],daytime_snorkel_sessions:['白天浮潜','次'],guided_ice_cave_experiences:['向导冰洞体验','次'],distinct_open_cenotes:['开放天坑','处'],guided_scuba_dives:['向导水肺潜水','潜'],boat_excursion_days:['出海','天'],outer_reef_day_trips:['外堡礁日游','次'],photography_reviews:['影像复盘','次'],guided_shore_dives:['向导岸潜','潜'],guided_short_glacier_treks:['向导短程冰川徒步','次'],authorized_upper_antelope_tours:['上羚羊谷授权导览','次'],guided_aurora_outings:['向导追光','次'],day_hikes:['日徒步','次'],official_campsite_nights:['正式营地住宿','晚'],hotel_nights:['酒店住宿','晚']};
export function experienceLabel(journey) {
  return Object.entries(journey.planned_activity_counts || {}).flatMap(([key,value]) => activityNames[key] && Number.isInteger(value) ? [`${activityNames[key][0]} ${value} ${activityNames[key][1]}`] : []).join(' · ');
}
