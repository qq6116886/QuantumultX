/*
 * 淘宝去广告脚本 (QuantumultX)
 * 目标：过滤推荐流 / 搜索流中的广告条目
 * 接口特征：h5api.m.taobao.com 下的 recommend / search 接口
 */

const AD_KEYS = [
  "ad", "ads", "adItem", "adList", "adData",
  "promotion", "promotions", "spmAd", "trackAd"
];

function removeAdsFromObj(obj) {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.filter(item => !isAdItem(item)).map(removeAdsFromObj);
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    if (AD_KEYS.includes(key)) continue; // 直接丢弃广告容器键
    cleaned[key] = removeAdsFromObj(obj[key]);
  }
  return cleaned;
}

function isAdItem(item) {
  if (!item || typeof item !== "object") return false;
  // 淘宝广告条目常见标记：trackInfo 中含 ad，或 item 自带 adFlag / isAd
  const s = JSON.stringify(item).toLowerCase();
  return (
    s.includes('"adflag":true') ||
    s.includes('"isad":true') ||
    s.includes('"trackinfo"') && s.includes('"ad"')
  );
}

let body = $response.body;

try {
  let json = JSON.parse(body);
  json = removeAdsFromObj(json);
  $done({ body: JSON.stringify(json) });
} catch (e) {
  // JSON 解析失败时原样返回，避免破坏页面
  $done({ body });
}