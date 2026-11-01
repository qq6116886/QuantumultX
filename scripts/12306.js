// 1. 解析请求体中的数据
let obj = JSON.parse($request.body);
let ddgksf2013 = {}; // 作者习惯将变量命名为自己的网名

// 2. 根据请求参数中的 placementNo (广告位ID) 进行不同的处理
if (obj.placementNo === "0007") {
    // 针对 "0007" 广告位（通常是开屏广告）：伪造一个跳过时间为 1 秒的空素材
    ddgksf2013.materialsList = [
        {
            billMaterialsId: "6491",
            filePath: "ddgksf2013", // 占位符
            creativeType: 1
        }
    ];
    ddgksf2013.advertParam = {
        skipTime: 1 // 设置广告跳过时间
    };
    ddgksf2013.code = "00";
    
} else if (obj.placementNo === "G0054") {
    // 针对 "G0054" 广告位（通常是首页信息流/横幅广告）：返回空的素材列表
    ddgksf2013 = {
        code: "00",
        materialsList: [{}] // 传入空对象，前端不会渲染广告
    };
    
} else {
    // 其他所有类型的广告位：直接返回无广告提示
    ddgksf2013 = {
        code: "00",
        message: "无广告返回"
    };
}

// 3. 兼容不同的代理软件环境，返回伪造的数据
if (typeof $task !== "undefined") {
    // Quantumult X 环境
    $done({ body: JSON.stringify(ddgksf2013) });
} else {
    // Surge, Loon, Shadowrocket 等其他环境
    $done({ response: { body: JSON.stringify(ddgksf2013) } });
}
