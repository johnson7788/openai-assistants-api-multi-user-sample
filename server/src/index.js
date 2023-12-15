const express = require('express') //导入 Express 模块
const bodyParser = require('body-parser') //导入 body-parser 模块用于解析请求体，
const http = require('http') //导入 HTTP 模块
const { Server } = require('socket.io') //导入 Socket.IO 模块的 Server 类，
const cors = require('cors') //导入 CORS 模块
const app = express() //创建一个 Express 应用程序实例
const server = http.createServer(app)

const utils = require('./lib/utils')
const openai = require('./services/openai')

//读取.env文件，然后使用process.env.SERVER_PORT，就可以使用了
require('dotenv').config()

const io = new Server(server, {
    maxHttpBufferSize: 1e8, /* 100MB */
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
})
//初始化4个变量，助手指令：assistant_instructions， 助手名字：assistant_name， assistant线程id： thread_id， 使用的用户：users
let assistant_instructions = ''
let assistant_name = ''
let thread_id = ''
let users = []

app.use(cors())
//app.use(bodyParser.json())
//使用 body-parser 模块的 json() 函数来解析 JSON 数据。这里的配置选项 {limit: '50mb'} 表示允许请求数据的最大体积为 50MB。
app.use(bodyParser.json({limit: '50mb'}))
app.use(bodyParser.urlencoded({limit: '50mb', extended: true})) //使用 body-parser 模块的 urlencoded() 函数来解析表单数据。这里的配置选项 {limit: '50mb', extended: true} 表示允许请求数据的最大体积为 50MB，并且允许解析嵌套的表单数据。

//定义个测试用例
app.get('/ping', (req, res) => {

    res.status(200).json({ message: 'Pong!' })

})

app.post('/stream', async (req, res) => {

    const { user_id, name, content, role, id, created_at } = req.body

    if(!user_id || !name || !content || !role || !id || !created_at) {
        res.sendStatus(400)
        return
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
            "Content-Type": "text/event-stream",
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

//这是 Socket.IO 服务器端代码，它监听客户端的连接事件，并在有新的客户端连接时执行回调函数。
io.on('connection', (socket) => {
    //当用户输入用户名后，这里开接收，eg: qZkNVy9bev3IxnR_AAAB
    console.log('用户的id是', socket.id)

    let socket_id = socket.id
    let socket_user_id = ''
    let socket_user_name = ''
    //类似python append, 追加到列表
    users.push({ id: socket_id, user_id: '', name: '' })

    socket.on('disconnect', async () => {
        //当用户断开连接时，并且一个用户也没有的时候，才删掉线程
        console.log('disconnect被触发', socket_id)
        //"170235151130941am2acj1i7j","Johnson"
        const { user_id, name } = users.find((user) => user.id === socket_id)
        // 通知除自己之外的所有连接的客户端发送消息，告诉已经离开
        // socket.broadcast.emit('leave', { user_id, name })
        
        users = users.filter(user => user.id !== socket_id)
        
        if(users.length === 0 && thread_id) {
            // 如果不存在用户了，并且还存在openAI的线程，那么就删掉线程
            console.log('已经没有用户连接了，删掉线程')

            try {
                const ret = await openai.deleteThread({ threadId: thread_id })
                console.log(ret)
            } catch(error) {
                console.log(error.name, error.message)
            } finally {
                thread_id = ''
            }

        }

    })
    //异步，监听register事件，当用户首次输入用户名的时候
    socket.on('register', async (params) => {
        //params :{user_id: "170235151130941am2acj1i7j",name: "Johnson",}
        console.log('用户注册', params)

        const { user_id, name } = params
        //更新user值, 更新user_id和name, ...user可以保留原有id
        users = users.map(user => ({
            ...user,
            user_id: user.id === socket_id ? user_id : user.user_id,
            name: user.id === socket_id ? name : user.name,
        }))
        //如果线程id为空，那么，就创建线程
        if(!thread_id) {

            try {
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

            } catch(error) {
                console.log(error.name, error.message)
            }

        } else {
            //获取openAI返回的信息，并发送给前端用户
            try {

                const message_list = await openai.getMessages({ threadId: thread_id })

                console.log("OpenAI返回的messages是", message_list)

                let new_messages = []

                for(let i = 0; i < message_list.length; i++) {
                    const msg = message_list[i]

                    new_messages.push({
                        user_id: msg.metadata ? msg.metadata.user_id : null,
                        name: msg.metadata ? msg.metadata.name : assistant_name,
                        id: msg.id,
                        created_at: msg.created_at.toString().padEnd(13, 0),
                        role: msg.role,
                        content: msg.content[0].text.value
                    })

                }

                if(new_messages.length > 0) {
                    socket.emit('message-list', new_messages)
                }

            } catch(error) {
                console.log(error.name, error.message)
            }

        }

        socket_user_id = user_id
        socket_user_name = name
        //广播某用户加入
        // socket.broadcast.emit('join', { user_id, name })
        // 发送欢迎
        socket.emit('welcome')

    })

    socket.on('message', async (message) => {
        //收到前端传入过来的问题
        console.log('收到消息', message)
        // 广播消息？？为啥广播
        // socket.broadcast.emit('message', message)

        socket.emit('ai-start')
        // socket.broadcast.emit('ai-start')

        try {

            const message_id = message.id
            //把用户的消息发送到openAI的线程上，等待
            const ret_message = await openai.addMessage({ threadId: thread_id, message: message.content, messageId: message_id, userId: message.user_id, name: message.name })

            console.log('openAI返回到接收到传送消息的确认状态', ret_message)
            //  开启一个openAI的runner
            const run = await openai.startRun({ 
                threadId: thread_id,
                instructions: assistant_instructions + `\nPlease address the user as ${socket_user_name}.\nToday is ${new Date()}.`
             })

            console.log('openAI的runner已开启，状态是', run)

            const run_id = run.id

            let messages_items = []
            let flagFinish = false

            let MAX_COUNT = 2 * 600 // 120s 
            let TIME_DELAY = 100 // 100ms
            let count = 0

            do {

                console.log(`开始循环获取runner是否已经完成，循环次数: ${count}`)
    
                const run_data = await openai.getRun({ threadId: thread_id, runId: run_id })
    
                const status = run_data.status
                
                console.log(`当前的状态Status: ${status} ${(new Date()).toLocaleTimeString()}`)
    
                if(status === 'completed') {
    
                    const messages = await openai.getMessages({ threadId: thread_id })
    
                    console.log('openAI已经完成推理，最新的消息是：', messages)

                    let new_messages = []

                    for(let i = 0; i < messages.length; i++) {
                        const msg = messages[i]

                        //console.log(JSON.stringify(msg, null, 2))
                        
                        if (Object.prototype.hasOwnProperty.call(msg.metadata, 'id'))  {
                            if(msg.metadata.id === message_id) {
                                break
                            }
                        } else {
                            
                            new_messages.push({
                                user_id: null,
                                name: assistant_name,
                                id: msg.id,
                                created_at: msg.created_at.toString().padEnd(13, 0),
                                role: msg.role,
                                content: msg.content[0].text.value
                            })
                        }

                    }

                    messages_items = new_messages
    
                    flagFinish = true
                
                } else if(status === 'requires_action'){
                    //还没有完成推理
                    console.log('run-data', run_data)
    
                    const required_action = run_data.required_action
                    const required_tools = required_action.submit_tool_outputs.tool_calls
    
                    console.log('required-action', required_action)
                    console.log('required-tools', required_tools)
                    
                    const tool_output_items = []
    
                    required_tools.forEach((rtool) => {
                        
                        // We will not handle function calling
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

            // socket.broadcast.emit('message-list', messages_items)
            socket.emit('message-list', messages_items)

        } catch(error) {

            console.log(error.name, error.message)

            const error_message = {
                user_id: '',
                name: 'system',
                content: error.message,
                role: 'system',
                id: utils.getSimpleId(),
                created_at: Date.now()
            }

            // socket.broadcast.emit('message', error_message)
            socket.emit('message', error_message)

        } finally {

            socket.emit('ai-end')
            // socket.broadcast.emit('ai-end')

        }

    })


})
//启动了 HTTP 服务器，开始监听指定的端口，当有请求到达时会调用回调函数
server.listen(process.env.SERVER_PORT, () => {
    console.log(`启动服务端...`, (new Date()).toLocaleTimeString())
    console.log(`监听端口： ${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`)

})
//一个处理进程接收到 SIGINT 信号（通常是通过按下 Ctrl + C 触发）时的事件监听器，它在接收到该信号时执行回调函数。
process.on('SIGINT', async () => {
    console.log("\nTest Server process terminated.");

    // cleanup
    if(thread_id) {

        try {
            const ret = await openai.deleteThread({ threadId: thread_id })
            console.log(ret)
        } catch(error) {
            console.log(error.name, error.message)
        }

    }

    process.exit();
})

process.on('SIGTERM', async () => {
    console.log("\nTest Server process terminated.");

    // cleanup
    if(thread_id) {

        try {
            const ret = await openai.deleteThread({ threadId: thread_id })
            console.log(ret)
        } catch(error) {
            console.log(error.name, error.message)
        }

    }
    
    process.exit();
})