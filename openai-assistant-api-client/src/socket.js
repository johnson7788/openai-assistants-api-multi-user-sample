import { reactive } from 'vue'
import { io } from 'socket.io-client'
/*messageEvents: 中的内容, name分为system, user的名字和Chatgpt
[{
    "user_id": "",
    "name": "system",
    "content": "Welcome Johnson",
    "role": "system",
    "id": "17025193754441d4bd49ika3jc",
    "created_at": 1702519375444
}
{
    "user_id": "1702519334146cbhcghge75j",
    "name": "Johnson",
    "content": "hello",
    "role": "user",
    "id": "1702519396728ojph6dkfolch",
    "created_at": 1702519396728
}]
systemTrigger: [{
    "type": "welcome",
    "iat": 1702519358249
}]
*/
export const state = reactive({
    id: '',
    connected: false,
    messageEvents: [],
    messageTrigger: [],
    connectTrigger: [],
    systemTrigger: [],
})

const url = `http://${import.meta.env.VITE_SERVER_IPADDRESS}:${import.meta.env.VITE_SERVER_PORT}`

//初始化socket,需要socket.connect() //打开socket, 显示调用
export const socket = io(url, { autoConnect: false })
//监听来自服务器的消息
socket.on('connect', () => {

    state.id = socket.id

    console.log('connect', socket.id, (new Date()).toLocaleTimeString())

    state.connected = true
    //记录当前的连接时间
    state.connectTrigger[0] = Date.now()

})

socket.on('welcome', () => {

    console.log('welcome', (new Date()).toLocaleTimeString())

    state.systemTrigger[0] = { type: 'welcome', iat: Date.now() }

})

socket.on('message-list', (data) => {

    console.log('message-list', data, (new Date()).toLocaleTimeString())

    state.messageEvents.push(...data)

    state.messageTrigger[0] = Date.now()

})

socket.on('join', (data) => {

    console.log('join', data, (new Date()).toLocaleTimeString())

    state.systemTrigger[0] = { type: 'join', data, iat: Date.now() }

})

socket.on('leave', (data) => {

    console.log('leave', data, (new Date()).toLocaleTimeString())

    state.systemTrigger[0] = { type: 'leave', data, iat: Date.now() }

})

socket.on('disconnect', () => {

    console.log('disconnect', (new Date()).toLocaleTimeString())

    state.connected = false

    state.systemTrigger[0] = { type: 'disconnect', iat: Date.now() }

})

socket.on('message', (data) => {

    console.log('message', data, (new Date()).toLocaleTimeString())

    state.messageEvents.push(data)

    state.messageTrigger[0] = Date.now()

})

socket.on('ai-start', () => {

    console.log('ai-start', (new Date()).toLocaleTimeString())

    state.systemTrigger[0] = { type: 'ai-start', iat: Date.now() }

})

socket.on('ai-end', () => {

    console.log('ai-end', (new Date()).toLocaleTimeString())

    state.systemTrigger[0] = { type: 'ai-end', iat: Date.now() }

})