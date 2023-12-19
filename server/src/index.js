const express = require('express') //导入 Express 模块
const bodyParser = require('body-parser') //导入 body-parser 模块用于解析请求体，
const http = require('http') //导入 HTTP 模块
const cors = require('cors') //导入 CORS 模块
const app = express() //创建一个 Express 应用程序实例
const server = http.createServer(app)

const utils = require('./lib/utils')
const openai = require('./services/openai')

//读取.env文件，然后使用process.env.SERVER_PORT，就可以使用了
require('dotenv').config()

// 保存每个对话的状态
let users = {}  

app.use(cors())
//app.use(bodyParser.json())
//使用 body-parser 模块的 json() 函数来解析 JSON 数据。这里的配置选项 {limit: '50mb'} 表示允许请求数据的最大体积为 50MB。
app.use(bodyParser.json({limit: '50mb'}))
app.use(bodyParser.urlencoded({limit: '50mb', extended: true})) //使用 body-parser 模块的 urlencoded() 函数来解析表单数据。这里的配置选项 {limit: '50mb', extended: true} 表示允许请求数据的最大体积为 50MB，并且允许解析嵌套的表单数据。


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
  }, 1000); // 每隔1秒检测一次
  

function usersChangedCheck() {
    // 监控users中的每个用户的最后一条消息，查看是否已超过5分钟，如果已超过，那么返回用户的user_id
    let usersChanged = []
    for (let user in users) {
        if (users[user].messages.created_at < Date.now() - 300000) {
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
    console.log(new Date().toLocaleTimeString(),'收到了Stream请求')
    const { user_id, name, content, role, id, created_at } = req.body

    if(!user_id || !name || !content || !role || !id || !created_at) {
        res.status(400).send('请求数据错误，部分字段为空的，请检查');
        return
    }
    const one_message = {
            content,
            id,
            created_at
        }
    let thread_id,assistant_name,assistant_instructions;
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
    }else {
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

        const run = await openai.startRun({ 
            threadId: thread_id,
            instructions: assistant_instructions + `\nPlease address the user as ${name}.`
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

            if(status === 'completed') {
                //完成状态
                const messages = await openai.getMessages({ threadId: thread_id })

                console.log('messages-show', messages)

                //let new_messages = []

                for(let i = 0; i < messages.length; i++) {
                    const msg = messages[i]

                    if (Object.prototype.hasOwnProperty.call(msg.metadata, 'id'))  {
                        if(msg.metadata.id === message_id) {
                            break
                        }
                    } else {
                        
                        const output_data = msg.content[0].text.value
                        console.log(`生成的结果是: ${output_data}`)
                        const split_words = output_data.split(' ')

                        //模拟的流式生成。。。
                        for(let word of split_words) {
                            res.write(`${word} `)
                            await utils.wait(TIME_DELAY)
                        }
                        
                    }

                }

                flagFinish = true
            
            } else if(status === 'requires_action'){
                
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

            } else if(status === 'expired' || status === 'cancelled' || status === 'failed') {
                
                flagFinish = true

            }
            
            if(!flagFinish) {

                count++
                
                if(count >= MAX_COUNT) {

                    flagFinish = true

                } else {

                    await utils.wait(TIME_DELAY)

                }

            }

        } while(!flagFinish)

        res.end()

    } catch(error) {

        console.log(error.name, error.message)

        res.sendStatus(400)
        return

    }

})

async function create_thread(){
    console.log(new Date().toLocaleTimeString(),'register')
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
    return {thread_id, assistant_name, assistant_instructions}
}

async function disconnect(user_id){
    //当用户断开连接时，并且一个用户也没有的时候，才删掉线程
    console.log(new Date().toLocaleTimeString(),'disconnect触发')
    thread_id = users[user_id].thread_id
    try {
        const ret = await openai.deleteThread({ threadId: thread_id })
        console.log(`线程删除结果: ${ret}`)
    } catch(error) {
        console.log(error.name, error.message)
    } finally {
        thread_id = ''
    }
}

//启动了 HTTP 服务器，开始监听指定的端口，当有请求到达时会调用回调函数
server.listen(process.env.SERVER_PORT, () => {
    console.log(`启动服务端...`, (new Date()).toLocaleTimeString())
    console.log(`监听端口： ${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`)

})
//一个处理进程接收到 SIGINT 信号（通常是通过按下 Ctrl + C 触发）时的事件监听器，它在接收到该信号时执行回调函数。
process.on('SIGINT', async () => {
    console.log(new Date().toLocaleTimeString(),'Server process terminated触发：SIGINT')
    console.log("\nTest Server process terminated.");
    // 遍历users中的每个线程id，然后删除
    for(let user_id in users){
        disconnect(user_id)
    }

    process.exit();
})

process.on('SIGTERM', async () => {
    console.log(new Date().toLocaleTimeString(),'Server process terminated触发：SIGTERM')
    console.log("\nTest Server process terminated.");
    // 遍历users中的每个线程id，然后删除
    for(let user_id in users){
        disconnect(user_id)
    }
    process.exit();
})