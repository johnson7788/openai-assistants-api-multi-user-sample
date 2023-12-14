<script setup>
import { onMounted, ref, computed, watch } from 'vue'

import { socket, state } from '@/socket'

import ToggleButton from '../components/ToggleButton.vue'
import DialogName from '../components/DialogName.vue'
import IconOpenAI from '../components/icons/IconOpenAI.vue'
import IconPerson from '../components/icons/IconPerson.vue'

import { getSimpleId } from '../lib/utils.js'
import LoadingText from '../components/LoadingText.vue'

import { useAppDataStore } from '../stores/appdata'

const store = useAppDataStore()

const messageRef = ref(null)
const inputRef = ref(null)
const userName = ref('')   //保存用户名
const userId = ref('')
const message = ref('')  //用户输入的内容
const isDialogShown = ref(false)
const isAIProcessing = ref(false) //是否等待AI回复中
const isConnecting = ref(false)  //控制当前是否是连接状态，即打开socket

const isStreaming = ref(false) //判断是不是流式处理
//接收子组件的事件
function handleToggle(flag) {
  console.log("是否是流式处理", flag)
  isStreaming.value = flag
}

function sendToSocket(user_message) {
  //先把用户消息放入消息事件，然后发送socket请求
  state.messageEvents.push(user_message)
  //发送用户消息到server，事件名称是message
  socket.emit('message', user_message)
  //重制用户的输入
  message.value = ''
  //滚动屏幕
  resetScroll()

}

async function sendToStream(user_message) {
  //首先将 isAIProcessing.value 设置为 true，表示 AI 正在处理中。
  isAIProcessing.value = true
  //然后将用户消息 user_message 添加到 state.messageEvents 中，
  state.messageEvents.push(user_message)
  //并将 message.value 置空，然后重置滚动条。
  message.value = ''

  resetScroll()

  try {
    //使用 fetch 函数向指定的 URL 发送 POST 请求，请求的内容为 user_message。如果请求成功，会得到一个响应 response。
    const response = await fetch(`http://${import.meta.env.VITE_SERVER_IPADDRESS}:${import.meta.env.VITE_SERVER_PORT}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(user_message)
    })
    //如果响应不成功（即 !response.ok），会在控制台打印出错误信息。
    if(!response.ok) {
      console.log('Oops, an error occurred', response.status)
    }
    //生成一个 msg_id，
    const msg_id = getSimpleId()
    //创建一个 assistant_message 对象
    let assistant_message = { 
      user_id: null,
      name: 'ChatGPT', 
      content: '', 
      role: 'assistant', 
      id: msg_id, 
      created_at: Date.now() 
    }
    state.messageEvents.push(assistant_message)

    const reader = response.body.getReader()

    let flag = true
    // 不停读取新的数据
    while(flag) {
      //直到都读取完成
      const { done, value } = await reader.read()

      if(done) {
        flag = false
        break
      }
      //解码成文本
      const text = new TextDecoder().decode(value)
      //更新messageEvents
      state.messageEvents = state.messageEvents.map((item) => {
        return {
          ...item,
          content: item.id === msg_id ? item.content + text : item.content
        }
      })

      resetScroll()

    }

  } catch(error) {

    console.log(error.name, error.message)

  } finally {

    isAIProcessing.value = false

  }

}

function handleSend() {
  //来发送用户消息，如果AI正在思考中，那么就直接返回
  if(isAIProcessing.value) {
    return
  }

  console.log("用户开始发送消息，当前时间是: ",Date.now())
  //content是用户输入的内容， name： 用户名
  const user_message = { 
    user_id: userId.value, 
    name: userName.value, 
    content: message.value, 
    role: 'user', 
    id: getSimpleId(), 
    created_at: Date.now() 
  }
  //流式传输还是其它方式
  if(isStreaming.value) {

    sendToStream(user_message)

  } else [

    sendToSocket(user_message)

  ]

  /*
  state.messageEvents.push(user_message)
  //将消息发送到服务器
  socket.emit('message', user_message)

  message.value = ''
  //发送完成后滚动下屏幕
  resetScroll()
  */

}

function handleSubmitName(value) {
  //处理用户名提交并注册用户，value是用户输入的用户名
  isConnecting.value = true
  //更新ref中的userName
  userName.value = value
  store.setName(value)
  // 如果已经是连接的状态，那么就注册用户，否则就进行连接
  if(state.connected) {
    socket.emit('register', { user_id: userId.value, name: userName.value })
    isConnecting.value = false
  } else {
    socket.connect() //打开socket
  }

}

function resetScroll() {
  //函数来滚动消息列表, setTimeout() 方法将消息列表滚动到底部
  setTimeout(() => {
    messageRef.value.scrollTop = messageRef.value.scrollHeight
  }, 300)

}

function showSystemMessage(name, stype) {
  //函数来显示系统消息,将系统消息添加到消息列表
  const message_text = stype === 'welcome' ? `Welcome ${name}` : stype === 'disconnect' ? `You are disconnected from the server` : `${name} has ${stype === 'join' ? 'joined' : 'left'} the discussion`

  const system_message = { 
    user_id: '', 
    name: 'system', 
    content: message_text, 
    role: 'system', 
    id: getSimpleId(),  //创建一个用户id，eg："170236891260777ojnb41fmc3"
    created_at: Date.now() 
  }
  //socket.js中定义了state，这里是把系统消息放入messageEvents数组中，这会触发下面的compute方法
  state.messageEvents.push(system_message)
  //滚动屏幕
  resetScroll()

}

function getBackgroundClass(role, user_id) {
  //函数根据用户/AI 设置消息的背景颜色
  if(role === 'system') {
    return 'system'
  } if(role === 'assistant') {
    return 'bot'
  } else {
    return user_id !== userId.value ? 'other' : 'user'
  }
}
//实现处理 AI 处理开始/结束事件的函数
function handleAIOnStart() {
  isAIProcessing.value = true
}
function handleAIOnEnd() {
  isAIProcessing.value = false
}
// 当state.messageEvents有变化时，更新messages，即更新消息列表，返回排序后的messages，state.messageEvents来自socket.js
const messages = computed(() => {
  return state.messageEvents.sort((a, b) => {
    if(a.created_at > b.created_at) return 1
    if(a.created_at < b.created_at) return -1
    return 0
  })
})

//监控用户消息state.connectTrigger状态是否改变，如果是连接状态，那么注册用户
watch(state.connectTrigger, () => {
    
  socket.emit('register', { user_id: userId.value, name: userName.value })
  isConnecting.value = false

})
//监控消息是否改变，消息改变的话，就滚动聊天窗口
watch(state.messageTrigger, () => {
  
  resetScroll()
  
})
//监控系统消息state.systemTrigger是否改变， eg state.systemTrigger中的内容： {
    // "type": "welcome",
    // "iat": 1702517965736
// }，如果发生改变，把新的值传入，传入的新值被取数组的第1个元素作为值，传入，因为state.systemTrigger是1个列表，我们只需取最新的消息即可
watch(state.systemTrigger, ([ newval ]) => {
    
  console.log("system-trigger",  newval.type, newval.data)

  switch(newval.type) {
    case 'welcome':
      isDialogShown.value = false
      inputRef.value.focus()
      showSystemMessage(userName.value, newval.type)
      break
    case 'disconnect':
      showSystemMessage(userName.value, newval.type)
      break
    case 'leave':
    case 'join':
      showSystemMessage(newval.data.name, newval.type)
      break
    case 'ai-start':
      handleAIOnStart()  //更改显示状态
      break
    case 'ai-end':
      handleAIOnEnd()
      break
    default:
      //
  }
  
})
//钩子设置初始值并检查连接状态
onMounted(() => {
  
  if(state.connected) {

    userId.value = store.id
    userName.value = store.name

  } else {

    const new_id = getSimpleId()
    userId.value = new_id
    store.setId(new_id)

    isDialogShown.value = true

  }

})
</script>

<template>
  <div class="container">
    <div class="messages" ref="messageRef">
      <div class="message-item" :class="{ rowReverse: msg.user_id !== userId }" v-for="(msg) in messages" :key="msg.id">
        <!-- 显示在左侧还是在右侧，跟msg.user_id有关 -->
        <div class="message-contents" :class="{ marginLeft: msg.user_id !== userId, marginRight: msg.user_id === userId }">
          <!-- getBackgroundClass设置不同的用户不同的颜色 -->
          <div class="message-text" :class="getBackgroundClass(msg.role, msg.user_id)">{{ msg.content }}</div>
        </div>
        <div class="sender" v-if="msg.role !== 'system'">
          <div v-if="msg.role === 'user'" class="avatar">
            <IconPerson />
          </div>
          <div v-else class="avatar">
            <IconOpenAI />
          </div>
          <div class="sender-name">
            <span>{{ msg.name }}</span>
          </div>
        </div>
      </div>
      <div v-if="isAIProcessing" class="loading-text">
        <LoadingText />
      </div>
    </div>
    <div class="input">
      <input ref="inputRef" @keyup.enter="handleSend" placeholder="Send message" class="input-text" type="text" v-model="message" />
      <button :disabled="!message || isAIProcessing" @click="handleSend" class="button">Send</button>
    </div>
    <div class="footer">
      <div class="toggle">
        <ToggleButton :checked="isStreaming" @change="handleToggle" />
      </div>
    </div>
    <Teleport to="body">
      <DialogName :show="isDialogShown" :disabled="isConnecting" @submit="handleSubmitName" />
    </Teleport>
  </div>
</template>

<style scoped>
.toggle {
  position: relative;
}
.loading-text {
  position: relative;
  padding: 6px 0;
}
.sender {
  position: relative;
  width: 80px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
.avatar {
  width: 24px;
  height: 24px;
  margin-top: 4px;
}
.sender-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;
  overflow: hidden;
  width: 100%;
  text-align: center;
  line-height: 100%;
}
.sender-name span {
  font-size: .7rem;
  line-height: 100%;
}
.message-item {
  padding: 1rem 1rem 0 1rem;
  box-sizing: border-box;
  display: flex;
}
.message-item:last-child {
  padding-bottom: 1rem;
}
.avatar * {
  fill: #232;
}
.message-contents {
  flex-grow: 1;
}
.message-text {
  background-color: #fff;
  border-radius: 6px;
  padding: .6rem;
  white-space: pre-wrap;
}
.container {
  position: relative;
  height: 100vh;
}
.messages::-webkit-scrollbar {
  display: none;
}
.messages {
  scroll-behavior: smooth;
  background-color: aliceblue;
  position: relative;
  height: calc(100% - 100px);
  overflow: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.input {
  position: relative;
  display: flex;
  padding: 1rem;
}
.button {
  appearance: none;
  background-color: #00DC82;
  border-width: 0;
  font-size: 1rem;
  color: #fff;
  width: 100px;
  height: 36px;
  cursor: pointer;
}
.button:active {
  background-color: #00DC8299;
}
.button:disabled {
  background-color: #999;
}
.input-text {
  background-color: #efefef;
  appearance: none;
  border-width: 0;
  font-size: 1rem;
  box-sizing: border-box;
  padding: 0 1rem;
  flex-grow: 1;
}
.footer {
  text-align: center;
}
.footer span {
  font-size: .6rem;
  font-style: italic;
}

.marginRight {
  margin-right: 8px;
}
.marginLeft {
  margin-left: 8px;
}
.rowReverse {
  flex-direction: row-reverse;
}
.user {
  background-color: #fff;
}
.other {
  background-color: #efefef;
}
.bot {
  background-color: #ccddff;
}
.system {
  background-color: transparent;
  text-align: center;
  font-size: .8rem;
  padding: 4px 0;
  color: #555;
}
</style>