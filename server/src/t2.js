const express = require('express') //导入 Express 模块
const bodyParser = require('body-parser') //导入 body-parser 模块用于解析请求体，
const http = require('http') //导入 HTTP 模块
const cors = require('cors') //导入 CORS 模块
const app = express() //创建一个 Express 应用程序实例
const server = http.createServer(app)
const mysql = require('mysql');

const utils = require('./lib/utils')
const openai = require('./services/openai')

//读取.env文件，然后使用process.env.SERVER_PORT，就可以使用了
require('dotenv').config()

// 保存每个对话的状态, name2picture名称对应的图片,异步查询，比较慢
let users = {};

app.use((err, req, res, next) => {
    // 错误处理逻辑
    console.error(`服务器出现错误，请求的接口是: ${req.url}, 出现的错误是: ${err}`);
    res.status(500).send('Internal Server Error');
});

app.use(cors())
//设置静态目录
app.use(express.static('public'));
//app.use(bodyParser.json())
//使用 body-parser 模块的 json() 函数来解析 JSON 数据。这里的配置选项 {limit: '50mb'} 表示允许请求数据的最大体积为 50MB。
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true })) //使用 body-parser 模块的 urlencoded() 函数来解析表单数据。这里的配置选项 {limit: '50mb', extended: true} 表示允许请求数据的最大体积为 50MB，并且允许解析嵌套的表单数据。


// 模拟数据
const anwserObj = {
    "hello": "Hello there! Ready to dive into the enchanting world of fragrances? What can I assist you with today in the realm of scents? 😊🌸",
    "你好": "你好！在这香氛的世界里，我就是你的向导，BeautyChat2.0！随时准备为你揭开各种香水的神秘面纱。你今天想知道点什么呢？有关香氛的任何问题，尽管向我提问吧！🌸👃✨",
    "木质东方调香水推荐": "好的，Johnson，有一款叫做“观夏昆仑煮雪”的香水，它的香调是木质东方调，但是前调中带有香柠檬的味道，应该可以满足你对橘子香味的期待。它的香味描述中也有提到“柑橘”，给人深沉、清凉、甜甜的感觉，非常适合夏日使用。你可以通过这个链接【13†查看详情】来获取更多信息。希望这款香水能让你的夏天更加清新怡人！",
    "你知道哪款香水的味道是橘子味吗？": "哦，有款香水就是柑橘控你的菜！尝试一下“观夏昆仑煮雪”，它是一款中性香，规格30ml，价格498.0元，带有木质、芳香植物、清新辛辣以及你喜欢的柑橘味。这款香水的前调包含了香柠檬，杜松子和丝柏，绝对能让你感受到清新宜人的橘子香气。使用时，你可能会想象着东方文化的山河原野，感受到怀旧和温暖的情绪。它适用于各种场合，尤其是在家居香薰分享或是传统文化活动中。立刻就能拥抱它了，通过这个链接去把它带回家吧: [点我购买](https://detail.tmall.com/item.htm?abbucket=11&id=676539654541&rn=760fb2aa967606ede8027516fab139b9&skuId=4859629692517&spm=a1z10.3-b-s.w4011-24426768373.74.5a6435d7t1Pawn)【11†source】。嗯哼～带上这款香水，你也能闻着橘子味儿，感觉像是跟一位好友抱抱呢！",
    "橘子味香水推荐": " 噢，橘子的香味，那真是晴朗又可口哦！有款香水叫做“观夏昆仑煮雪”，它具有一丝丝的柑橘香味，在其他木质和芳香植物调性的映衬下，给你的嗅觉带来一种清新辛辣的体验。想象这样一个场景：微风中带来凉爽的橘香，就像一个炎炎夏日的避风港。使用这款香水，无疑会带来一股清新潇洒的气氛【13†source】。\n如果你想了解更多或者购买这款产品，可以点击这个链接进行探寻：[观夏昆仑煮雪香水](https://detail.tmall.com/item.htm?abbucket=11&id=676539654541&rn=760fb2aa967606ede8027516fab139b9&skuId=4859629692517&spm=a1z10.3-b-s.w4011-24426768373.74.5a6435d7t1Pawn)。开启橘子香氛之旅，你准备好了吗？ 🍊✨",
    "介绍三款迷人的香水": "亲爱的香水爱好者，让我为您介绍三款迷人的香水：1. 闻献柔韧荆棘 - 这款香水充满了青草和芫荽的清新前调，中调则是玫瑰与牡丹的浓郁花香，而后调则由孜然、香根草及安息香构成，给人一种新鲜、温暖、神秘又迷人的体验。适合在家中自然清新的环境中使用，其特色在于混合了辛辣与温柔，就像是在花圃中想要采摘初绽玫瑰的感觉【9†链接】。为保持神秘感，我会慢慢揭晓其余两款推荐的香水，敬请期待我的下一个回复哦！✨🥳开始查询消息中的商品对应的图片: 亲爱的香水爱好者，让我为您介绍三款迷人的香水：1. 闻献柔韧荆棘 - 这款香水充满了青草和芫荽的清新前调，中调则是玫瑰与牡丹的浓郁花香，而后调则由孜然、香根草及安息香构成，给人一种新鲜、温暖、神秘又迷人的体验。适合在家中自然清新的环境中使用，其特色在于混合了辛辣与温柔，就像是在花圃中想要采摘初绽玫瑰的感觉【9†链接】。为保持神秘感，我会慢慢揭晓其余两款推荐的香水，敬请期待我的下一个回复哦！✨🥳",
    "请问什么香水闻起来是冷的呀？以及什么香材会有冷感？":"冷若冰霜，香若寒风！推荐给你的是【凯利安寒冰伏特加】（Kilian Vodka on the Rocks），这款香水象征着纯粹无暇的冷感。闻起来，它就像是一杯光滑冰凉的伏特加，激发出清冷的香氛体验。至于你提到的冷感香材，比如薄荷或者桉树等通常会给香水带来一种凉爽之感。跟冷感香水一样，这些香材也能让你感到一股清凉之意，宛如一缕寒风掠过炎炎烈日，给人带来一抹心灵的慰藉。如果你喜欢这种冰凉的香气，那么不妨尝试一下这款香水吧，链接戳这里：[点击前往](https://detail.tmall.com/item.htm?abbucket=11&id=676539654541&rn=1d22b851a2e3ec27feca3b2891ff3b17&skuId=47394615272&spm=a1z10.3-b-s.w4011-24426768373.74.5a6435d7t1Pawn)。",
    "有没有狼狗味的香水呀": "哇嗷！如果你正寻找带有狼狗般野性与自然气息的香水，那么你可能会对【观夏昆仑煮雪】香水感兴趣。这款香水散发着深沉而清凉的木质香调，让人想起亚寒带针叶林中的松脂气息，仿佛置身于昆仑山脉的雄伟景致中。它的香气能够唤起宁静和怀旧的情绪，还有着独特的东方文化意境。不论是在家居香薰分享时，还是在夏夜的传统文化活动中，都能显现出你的个性与深沉的北方气质。现在就去拥抱这份野性吧！去看看店铺链接，感受一下：[点击这里](https://detail.tmall.com/item.htm?abbucket=11&id=676539654541&rn=760fb2aa967606ede8027516fab139b9&skuId=4859629692517&spm=a1z10.3-b-s.w4011-24426768373.74.5a6435d7t1Pawn)。",
    "有没有桂花味的香水": "好消息，迪奥小姐香水的香调属于花香西普调，中调恰好含有橙花油，这种香料通常能带出类似桂花的香气。使用的时候，你可能会感受到从血橙的新鲜果香开始，逐渐过渡到玫瑰和橙花油的花香调，并最终沉淀在广藿香的温暖木质香中。这款香水以其独特而精致的香气，适合希望散发清新及低调奢华感的女性。如果你对这款香水感兴趣，你可以通过迪奥的官方旗舰店购买：[点击这里](https://detail.tmall.com/item.htm?abbucket=3&id=618227629963&ns=1&spm=a21n57.1.0.0.588c523cz0nslf&skuId=4728579503048)。希望你能喜欢这款散发着桂花香的迪奥小姐香水！",
    "闻起来骚骚的香水": "看来我在搜索的过程中遇到了一点儿小曲折，但别担心，就在刚才我发现了一款可能符合你形容的骚骚香水的商品。它的名字叫做“迪奥小姐”，带有血橙、玫瑰和橙花油的前中调，以及广藿香的后调，整体香味是一种甜美浓郁的花香西普调。这款香水似乎透露出一种新鲜、性感甜蜜、还有一点“酷丐”（可能可以理解为一点骚气？）的感觉哦！对于这款香水的更详细资讯，我在查找时出现了一些小小的技术问题，没能及时获取链接来为你提供。不过，既然这是你感兴趣的香水类型，你可以尝试在各大购物平台搜索“迪奥小姐”，相信你很快就能找到相关的购买链接啦。记得，要选择信誉好的店铺哦~ ✨🛍️✨",
}

app.post('/simulate_json', (req, res) => {
    console.log(new Date().toLocaleTimeString(), '收到了Stream请求')
    const { user_id, content } = req.body
    console.log(new Date().toLocaleTimeString(), `用户id: ${user_id}, 问题是: ${content}`)
    let created_at = Date.now()
    let id = utils.getSimpleId()
    let role = "user"
    let name = "用户"

    if (!user_id || !name || !content || !role || !id || !created_at) {
        res.status(400).send('请求数据错误，部分字段为空的，请检查');
        return
    }

    const output_data = anwserObj[content]
    output_data = "hello"
    const intention = getIntention_simulate(content)
    const more_question = guess_quesion_simulate(content)

    try {


        let flagFinish = false

        let MAX_COUNT = 2 * 600 // 120s 
        let TIME_DELAY = 100 // 100ms
        let count = 0

        do {
            //不断获取最新的状态
            const status = 'completed'

            console.log(`Status: ${status} ${(new Date()).toLocaleTimeString()}`)

            if (status === 'completed') {
                console.log(`生成的结果是: ${output_data}`)
                let output_content = output_data.replace(/\【\d+†source\】/g, "");
                output_content = output_content.replace(/\【\d+†查看详情\】/g, "");
                output_content = output_content.replace(/\【\d+†链接\】/g, "");
                if (intention === 'recommend') {
                    let three_info = findMsgImage(output_content)
                    const data = {
                        code: '0000',
                        msg: '成功',
                        data: {
                            content: output_content,
                            picture: three_info,
                            more_question: more_question,
                        },
                    }
                    res.json(data); // 返回 JSON
                    return
                } else {
                    const data = {
                        code: '0000',
                        msg: '成功',
                        data: {
                            content: output_content,
                            picture: [],
                            more_question: [],
                        },
                    }
                    res.json(data); // 返回 JSON
                    return
                }
                flagFinish = true

            } else if (status === 'requires_action') {

                console.log('run-data', run_data)

                const required_action = run_data.required_action
                const required_tools = required_action.submit_tool_outputs.tool_calls

                console.log('required-action', required_action)
                console.log('required-tools', required_tools)

                const tool_output_items = []

                required_tools.forEach((rtool) => {

                    let tool_output = { status: 'error', message: 'No function found' }

                    tool_output_items.push({
                        tool_call_id: rtool.id,
                        output: JSON.stringify(tool_output)
                    })

                })

                console.log('tools-output', tool_output_items)


                console.log('ret-tool', ret_tool)

            } else if (status === 'expired' || status === 'cancelled' || status === 'failed') {

                flagFinish = true

            }

            if (!flagFinish) {

                count++

                if (count >= MAX_COUNT) {

                    flagFinish = true

                }

            }

        } while (!flagFinish)

        res.end()

    } catch (error) {

        console.log(error.name, error.message)

        res.sendStatus(400)
        return

    }

})


//启动了 HTTP 服务器，开始监听指定的端口，当有请求到达时会调用回调函数
server.listen(process.env.SERVER_PORT, () => {
    console.log(`启动服务端...`, (new Date()).toLocaleTimeString())
    console.log(`监听端口： ${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`)

})
//一个处理进程接收到 SIGINT 信号（通常是通过按下 Ctrl + C 触发）时的事件监听器，它在接收到该信号时执行回调函数。
process.on('SIGINT', async () => {
    console.log(new Date().toLocaleTimeString(), 'Server process terminated触发：SIGINT')
    console.log("\nTest Server process terminated.");
    // 遍历users中的每个线程id，然后删除
    for (let user_id in users) {
        disconnect(user_id)
    }

    process.exit();
})

process.on('SIGTERM', async () => {
    console.log(new Date().toLocaleTimeString(), 'Server process terminated触发：SIGTERM')
    console.log("\nTest Server process terminated.");
    // 遍历users中的每个线程id，然后删除
    for (let user_id in users) {
        disconnect(user_id)
    }
    process.exit();
})