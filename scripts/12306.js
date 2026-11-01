/***********************************************
> 墨鱼自用12306去广告脚本（优化版）
> 说明：功能逻辑与原版完全一致，主要增强健壮性——
>       1) 请求体解析增加 try/catch 保护，解析失败时兜底返回"无广告"，
>          避免脚本崩溃导致拦截失效；
>       2) 所有分支统一返回 code:"00"，保证前端不会渲染广告。
***********************************************/

// 兜底返回结构：解析失败或未知广告位时使用
const FALLBACK = { code: "00", message: "无广告返回" };

// 1. 安全解析请求体
let obj = null;
try {
    obj = JSON.parse($request && $request.body ? $request.body : "{}");
} catch (e) {
    obj = null;
}

// 2. 根据请求参数中的 placementNo（广告位 ID）进行不同处理
let result = FALLBACK;

if (obj && obj.placementNo) {
    switch (obj.placementNo) {
        case "0007":
            // "0007" 广告位（通常是开屏广告）：伪造跳过时间为 1 秒的空素材
            result = {
                code: "00",
                materialsList: [
                    {
                        billMaterialsId: "6491",
                        filePath: "ddgksf2013", // 占位符
                        creativeType: 1
                    }
                ],
                advertParam: { skipTime: 1 } // 设置广告跳过时间
            };
            break;

        case "G0054":
            // "G0054" 广告位（通常是首页信息流/横幅广告）：返回空素材列表
            result = { code: "00", materialsList: [{}] }; // 空对象，前端不会渲染广告
            break;

        default:
            // 其他广告位：沿用兜底的无广告结构
            break;
    }
}

const body = JSON.stringify(result);

// 3. 兼容不同的代理软件环境，返回伪造的数据
if (typeof $task !== "undefined") {
    // Quantumult X 环境
    $done({ body });
} else {
    // Surge / Loon / Shadowrocket 等其他环境
    $done({ response: { body } });
}
