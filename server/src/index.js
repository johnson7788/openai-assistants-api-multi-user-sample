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
let name2picture = {};
// 图片对应着所有返回信息，包括价格，店铺链接，还有商品名称
let picture2info = {};

app.use(cors())
//设置静态目录
app.use(express.static('public'));
//app.use(bodyParser.json())
//使用 body-parser 模块的 json() 函数来解析 JSON 数据。这里的配置选项 {limit: '50mb'} 表示允许请求数据的最大体积为 50MB。
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true })) //使用 body-parser 模块的 urlencoded() 函数来解析表单数据。这里的配置选项 {limit: '50mb', extended: true} 表示允许请求数据的最大体积为 50MB，并且允许解析嵌套的表单数据。

app.use((err, req, res, next) => {
    // 错误处理逻辑
    console.error(err);
    res.status(500).send('Internal Server Error');
});

const connection = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS,
    port: 3306,
    database: process.env.MYSQL_DB
});
connection.connect();

connection.query('SELECT * FROM Product WHERE shop_url != ""', function (error, results, fields) {
    if (error) {
        console.log(`查询时发生了错误${error}`);
    } else {
        results.forEach(element => {
            let name = element.name
            let alias = element.alias
            let picture = element.image
            let price = element.price
            let shop_url = element.shop_url
            name2picture[name] = picture
            name2picture[alias] = picture
            let split_name = name.split(" ")
            if (split_name.length > 1) {
                last_word = split_name[split_name.length - 1]
                var isNumeric = /^\d+$/.test(last_word);
                //如果最后1个词是数组，那么去掉
                if (isNumeric) {
                    split_name.pop()
                    name = split_name.join(" ").trim()
                    name2picture[name] = picture
                    name2picture[split_name.join("").trim()] = picture
                }
            }
            //name去掉品牌名
            let brand = element.brand
            let pure_name = name.replace(brand, "")
            name2picture[pure_name] = picture
            let english_name = element.english
            if (english_name != "") {
                pure_name = pure_name.replace(english_name, "").trim()
            }
            //去掉首尾的空格
            name2picture[pure_name] = picture
            //如果brand包含括号
            if (brand.includes("（") && brand.includes("）")) {
                //使用括号前面的中文
                let brand_cn = brand.split("（")
                brand_cn = brand_cn[0]
                pure_name = pure_name.replace(brand_cn, "")
                name2picture[pure_name] = picture
            }
            //添加picture2info
            picture2info[picture] = {
                "title": name,
                "img": picture,
                "url": shop_url,
                "price":price
            }
        });
        //去掉name是1个字的
        let keys = Object.keys(name2picture);
        keys.forEach(key => {
            if (key.length == 1) {
                delete name2picture[key]
            }
        })
    }
});

connection.end();

function findMsgImage(msg) {
    //根据消息查找对应的图片
    let image_path = []
    console.log("开始查询消息中的商品对应的图片:", msg)
    var keys = Object.keys(name2picture);
    console.log(`共收集到${keys.length} 条数据`)
    //遍历name2picture所有key，查看key是否在msg中，如果存在，打印图片
    keys.forEach(key => {
        if (msg.includes(key)) {
            console.log(`${key}的图片是${name2picture[key]}`)
            image_path.push(name2picture[key])
        }
    })
    let three_info = []
    if (image_path.length === 0){
        console.log(`未找到消息对应的图片, 随机选取3张图片消息是: ${msg}`)
        three_info = utils.getRandomProperties(picture2info,3)
    }else if (image_path.length <3){
        console.log(`找到图片小于3个，补全到3个图片消息是: ${msg}`)
        three_info = image_path.map(path => picture2info[path])
        three_info = three_info.concat(utils.getRandomProperties(picture2info,3-image_path.length))
    }else{
        console.log(`找到图片大于或等于个，直接截取3个即可: ${msg}`)
        let three_path = image_path.slice(0,3)
        //获取path对应的数据信息, name2picture
        three_info = three_path.map(path => picture2info[path])
    }
    return three_info
}

// 创建定时线程，每隔一定时间检测对象是否改变
setInterval(() => {
    // 检查对象是否改变
    let change_usersid = usersChangedCheck()
    if (change_usersid.length !== 0) {
        console.log(`长时间没有任何新消息的用户有：${change_usersid}`);
        for (let userid of change_usersid) {
            disconnect(userid)
        }
    }
}, 600000); // 每隔10分钟检测一次，10*60*1000


function usersChangedCheck() {
    // 监控users中的每个用户的最后一条消息，查看是否已超过5分钟，如果已超过，那么返回用户的user_id
    let usersChanged = []
    for (let user in users) {
        const messages = users[user].messages
        const last_msg = messages[messages.length - 1]
        const last_msg_time = last_msg.created_at
        const thread_id = users[user].thread_id
        if (last_msg_time < Date.now() - 1000 && thread_id !== '') {
            usersChanged.push(user)
        }
    }
    return usersChanged
}

//定义个测试用例
app.get('/ping', (req, res) => {

    res.status(200).json({ message: 'Pong，你好!' })

})

app.post('/stream', async (req, res) => {
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
    const one_message = {
        content,
        id,
        created_at
    }
    let thread_id, assistant_name, assistant_instructions;
    // 如果用户的配置信息不在users中，那么就注册用户
    if (!users[user_id]) {
        let result = await create_thread()
        thread_id = result.thread_id
        assistant_name = result.assistant_name
        assistant_instructions = result.assistant_instructions
        // thread_id = "thread_1KpXgM1Djd4gdzQzUr2JggAe"
        const messages = [one_message]
        users[user_id] = {
            name,
            thread_id,
            role,
            messages,
            assistant_name,
            assistant_instructions
        }
    } else if (users[user_id].thread_id === "") {
        let result = await create_thread()
        thread_id = result.thread_id
        assistant_name = users[user_id].assistant_name
        assistant_instructions = users[user_id].assistant_instructions
        users[user_id].messages.push(one_message)
    } else {
        // 如果已经存在，那么就获取线程id,  添加更多messages
        thread_id = users[user_id].thread_id
        assistant_name = users[user_id].assistant_name
        assistant_instructions = users[user_id].assistant_instructions
        users[user_id].messages.push(one_message)
    }

    // Note: 
    // For simplicity or laziness, I will not be checking if assistant or thread is alive.

    try {

        const message_id = id
        //添加消息到线程
        const ret_message = await openai.addMessage({
            threadId: thread_id,
            message: content,
            messageId: message_id,
            userId: user_id,
            name: name
        })
        //openai返回的消息
        console.log('Openai 返回的消息message: ', ret_message)
        //如果添加了用户，那么
        let instructions = assistant_instructions
        if (name !== "用户") {
            instructions = assistant_instructions + `\nPlease address the user as ${name}.`
        }
        const run = await openai.startRun({
            threadId: thread_id,
            instructions: instructions
        })
        //真正开始推理
        console.log('调用Openai的Run', run)

        const run_id = run.id

        res.writeHead(200, {
            "Content-Type": "text/event-stream;charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        })

        let flagFinish = false

        let MAX_COUNT = 2 * 600 // 120s 
        let TIME_DELAY = 100 // 100ms
        let count = 0

        do {

            console.log(`循环获取最新的消息，循环次数: ${count}`)

            const run_data = await openai.getRun({ threadId: thread_id, runId: run_id })
            //不断获取最新的状态
            const status = run_data.status

            console.log(`Status: ${status} ${(new Date()).toLocaleTimeString()}`)

            if (status === 'completed') {
                //完成状态
                const messages = await openai.getMessages({ threadId: thread_id })

                console.log('messages-show', messages)

                //let new_messages = []

                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i]

                    if (Object.prototype.hasOwnProperty.call(msg.metadata, 'id')) {
                        if (msg.metadata.id === message_id) {
                            break
                        }
                    } else {
                        const output_data = msg.content[0].text.value
                        console.log(`生成的结果是: ${output_data}`)
                        let output_content = output_data.replace(/\【\d+†source\】/g, "");
                        output_content = output_content.replace(/\【\d+†查看详情\】/g, "");
                        const split_words = output_content.split(' ')

                        //模拟的流式生成。。。
                        for (let word of split_words) {
                            res.write(`data: ${word} \n\n`)
                            await utils.wait(TIME_DELAY)
                        }
                        //查找和返回图片
                        const image_path = findMsgImage(output_content)
                        if (image_path) {
                            res.write(`data: [DONE]:${image_path}\n\n`)
                        } else {
                            res.write(`data: [DONE]:\n\n`)
                        }
                    }

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

                const ret_tool = await submitOutputs({
                    threadId: thread_id,
                    runId: run_id,
                    tool_outputs: tool_output_items
                })

                console.log('ret-tool', ret_tool)

            } else if (status === 'expired' || status === 'cancelled' || status === 'failed') {

                flagFinish = true

            }

            if (!flagFinish) {

                count++

                if (count >= MAX_COUNT) {

                    flagFinish = true

                } else {

                    await utils.wait(TIME_DELAY)

                }

            }

        } while (!flagFinish)

        res.end()

    } catch (error) {

        console.log("报错信息是:", error.name, error.message)

        res.sendStatus(400)
        return

    }

})

function getIntention_simulate(question) {
    const responses = {
        'hello': 'welcome',
        'hi': 'welcome',
        '你好': 'welcome',
    };
    const response = responses[question.toLowerCase()];
    return response ? response : 'recommend';
}

function guess_quesion_sumulate(question) {
    const responses = {
        '木质东方调香水推荐': ['什么是木质调香水?', '木质调香水的品种有哪些？', '木质调的香味类似什么？'],
        '你知道哪款香水的味道是橘子味吗？': ['橘子味的香水还有哪些?', '橘子味香水效果如何？', '橘子味香水刺激吗?'],
        '橘子味香水推荐': ['什么是橘子味香水?', '再推荐几款橘子味香水?', '橘子味香水价格怎么样？'],
        '介绍三款迷人的香水': ['迷人的香水味道是什么？', '什么是迷人香水', '迷人香水品牌有哪些？'],
    }
    const response = responses[question];
    return response;
}

app.post('/simulate', async (req, res) => {
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

    anwserObj = {
        "hello": "Hello there! Ready to dive into the enchanting world of fragrances? What can I assist you with today in the realm of scents? 😊🌸",
        "你好": "你好！在这香氛的世界里，我就是你的向导，BeautyChat2.0！随时准备为你揭开各种香水的神秘面纱。你今天想知道点什么呢？有关香氛的任何问题，尽管向我提问吧！🌸👃✨",
        "木质东方调香水推荐": "好的，Johnson，有一款叫做“观夏昆仑煮雪”的香水，它的香调是木质东方调，但是前调中带有香柠檬的味道，应该可以满足你对橘子香味的期待。它的香味描述中也有提到“柑橘”，给人深沉、清凉、甜甜的感觉，非常适合夏日使用。你可以通过这个链接【13†查看详情】来获取更多信息。希望这款香水能让你的夏天更加清新怡人！",
        "你知道哪款香水的味道是橘子味吗？": "哦，有款香水就是柑橘控你的菜！尝试一下“观夏昆仑煮雪”，它是一款中性香，规格30ml，价格498.0元，带有木质、芳香植物、清新辛辣以及你喜欢的柑橘味。这款香水的前调包含了香柠檬，杜松子和丝柏，绝对能让你感受到清新宜人的橘子香气。使用时，你可能会想象着东方文化的山河原野，感受到怀旧和温暖的情绪。它适用于各种场合，尤其是在家居香薰分享或是传统文化活动中。立刻就能拥抱它了，通过这个链接去把它带回家吧: [点我购买](https://detail.tmall.com/item.htm?abbucket=11&id=676539654541&rn=760fb2aa967606ede8027516fab139b9&skuId=4859629692517&spm=a1z10.3-b-s.w4011-24426768373.74.5a6435d7t1Pawn)【11†source】。嗯哼～带上这款香水，你也能闻着橘子味儿，感觉像是跟一位好友抱抱呢！",
        "橘子味香水推荐": " 噢，橘子的香味，那真是晴朗又可口哦！有款香水叫做“观夏昆仑煮雪”，它具有一丝丝的柑橘香味，在其他木质和芳香植物调性的映衬下，给你的嗅觉带来一种清新辛辣的体验。想象这样一个场景：微风中带来凉爽的橘香，就像一个炎炎夏日的避风港。使用这款香水，无疑会带来一股清新潇洒的气氛【13†source】。\n如果你想了解更多或者购买这款产品，可以点击这个链接进行探寻：[观夏昆仑煮雪香水](https://detail.tmall.com/item.htm?abbucket=11&id=676539654541&rn=760fb2aa967606ede8027516fab139b9&skuId=4859629692517&spm=a1z10.3-b-s.w4011-24426768373.74.5a6435d7t1Pawn)。开启橘子香氛之旅，你准备好了吗？ 🍊✨",
        "介绍三款迷人的香水": "亲爱的香水爱好者，让我为您介绍三款迷人的香水：1. 闻献柔韧荆棘 - 这款香水充满了青草和芫荽的清新前调，中调则是玫瑰与牡丹的浓郁花香，而后调则由孜然、香根草及安息香构成，给人一种新鲜、温暖、神秘又迷人的体验。适合在家中自然清新的环境中使用，其特色在于混合了辛辣与温柔，就像是在花圃中想要采摘初绽玫瑰的感觉【9†链接】。为保持神秘感，我会慢慢揭晓其余两款推荐的香水，敬请期待我的下一个回复哦！✨🥳开始查询消息中的商品对应的图片: 亲爱的香水爱好者，让我为您介绍三款迷人的香水：1. 闻献柔韧荆棘 - 这款香水充满了青草和芫荽的清新前调，中调则是玫瑰与牡丹的浓郁花香，而后调则由孜然、香根草及安息香构成，给人一种新鲜、温暖、神秘又迷人的体验。适合在家中自然清新的环境中使用，其特色在于混合了辛辣与温柔，就像是在花圃中想要采摘初绽玫瑰的感觉【9†链接】。为保持神秘感，我会慢慢揭晓其余两款推荐的香水，敬请期待我的下一个回复哦！✨🥳"
    }
    const output_data = anwserObj[content]
    const intention = getIntention_simulate(content)
    const more_question = guess_quesion_sumulate(content)

    res.writeHead(200, {
        "Content-Type": "text/event-stream;charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
    })

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
                const split_words = output_content.split(' ')

                //模拟的流式生成。。。
                for (let word of split_words) {
                    res.write(`data: ${word} \n\n`)
                    await utils.wait(TIME_DELAY)
                }
                //如果是推荐，那么查找图片和返回猜你想问
                if (intention === 'recommend') {
                    //查找和返回图片
                    let three_info = findMsgImage(output_content)
                    res.write(`data: [IMG]:${JSON.stringify(three_info)}\n\n`)
                    res.write(`data: [DONE]:${JSON.stringify(more_question)}\n\n`)
                } else {
                    res.write(`data: [DONE]:\n\n`)
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

                const ret_tool = await submitOutputs({
                    threadId: thread_id,
                    runId: run_id,
                    tool_outputs: tool_output_items
                })

                console.log('ret-tool', ret_tool)

            } else if (status === 'expired' || status === 'cancelled' || status === 'failed') {

                flagFinish = true

            }

            if (!flagFinish) {

                count++

                if (count >= MAX_COUNT) {

                    flagFinish = true

                } else {

                    await utils.wait(TIME_DELAY)

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

app.post('/guess', async (req, res) => {
    console.log(new Date().toLocaleTimeString(), '猜你想问')
    let { question, anwser } = req.body
    //检查，如果没有传入对应参数，那么返回需要传参数
    if (!question || !anwser) {
        res.status(401).send('请求的参数中没有quesion或anwser字段');
        return
    }
    question = question.replace("\n", ".").trim()
    anwser = anwser.replace("\n", ".").trim()
    const messages = [
        { role: 'system', content: '你是一个可以根据给定内容生成问题的机器人，下面是一对用户提问和回答内容，请根据用户提问和回答，请写出用户可能还想问的3个相关问题。返回的格式类似这样，每个问题是1行，开头用Q加上序号表示。Q1:xxx\nQ2:yyyy\Q3:zzzz。现在开始:' },
        { role: 'user', content: `用户提问: ${question}\n回答: ${anwser}` }
    ]
    const response = await openai.chatCompletion({ messages })
    const content = response["message"]["content"]
    //content变成列表
    const contentList = content.split("\n")
    const data = {
        code: '0000',
        msg: '成功',
        data: contentList,
    }
    res.json(data); // 返回 JSON
})

async function create_thread() {
    console.log(new Date().toLocaleTimeString(), 'register')
    //异步调用getAssistant
    const assistant = await openai.getAssistant()
    //获取助手的名称 "BeautyChat"
    assistant_name = assistant.name
    //助手的指令："Now your name is xxx,You are an expert inx. Your answering style tends to be humorous and professional."
    assistant_instructions = assistant.instructions
    //创建一个assistant线程
    const thread = await openai.createThread()
    //线程id： "thread_EIIapaXfLe3jZ3hsoBMXqWX4"
    thread_id = thread.id
    console.log('创建了openai的thread: ', thread_id)
    return { thread_id, assistant_name, assistant_instructions }
}

async function disconnect(user_id) {
    //当用户断开连接时，并且一个用户也没有的时候，才删掉线程
    console.log(new Date().toLocaleTimeString(), 'disconnect触发')
    thread_id = users[user_id].thread_id
    try {
        const ret = await openai.deleteThread({ threadId: thread_id })
        console.log(`线程删除结果: ${ret}`)
    } catch (error) {
        console.log(error.name, error.message)
    } finally {
        users[user_id].thread_id = ''
    }
}

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