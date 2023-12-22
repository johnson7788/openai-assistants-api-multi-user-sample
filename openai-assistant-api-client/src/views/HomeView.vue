<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import IconOpenAI from '../components/icons/IconOpenAI.vue'
import IconPerson from '../components/icons/IconPerson.vue'

import { getSimpleId } from '../lib/utils.js'
import { hostURL } from '../config.js'
import LoadingText from '../components/LoadingText.vue'
import axios from 'axios'

import { useAppDataStore } from '../stores/appdata'

const store = useAppDataStore()

const welcome_message = {
  role: 'system',
  user_id: null,
  content: "你好，欢迎使用香氛问答机器人，有任何问题都请问我吧!",
  created_at: Date.now()
}
const display_question = ref('') //显示可能的问题
const messageList = ref([welcome_message])  //历史对话信息
const messageRef = ref(null)  //历史对话组件
const inputRef = ref(null)  //对话框输入组件
const userId = ref('')  //oumount时，getSimpleId自动生成 id
const message = ref('')  //用户输入的内容
const isAIProcessing = ref(false) //是否等待AI回复中
const buttonColors = ['primary', 'success', 'warning'];


async function sendToChat(user_message) {
  console.log(new Date().toLocaleString(), "发送消息到Chat接口", user_message)
  //首先将 isAIProcessing.value 设置为 true，表示 AI 正在处理中。
  isAIProcessing.value = true
  //然后将用户消息 user_message 添加到 state.messageEvents 中，
  messageList.value.push(user_message)
  //并将 message.value 置空，然后重置滚动条。
  message.value = ''
  resetScroll()

  try {
    //使用 fetch 函数向指定的 URL 发送 POST 请求，请求的内容为 user_message。如果请求成功，会得到一个响应 response。
    const data = {
      user_id: user_message.user_id,
      content: user_message.content,
    };
    const response = await axios.post(`${hostURL}/simulate_json`, data);
    //如果响应不成功（即 !response.ok），会在控制台打印出错误信息。
    const content = response.data.data.content;
    let images = response.data.data.picture;
    //对images进行修改,每个img链接都加上hostURL
    images = images.map((item) => {
      item.img = `${hostURL}/${item.img}`;
      return item;
    })
    const more_question = response.data.data.more_question;
    //更新要显示的问题
    display_question.value = more_question;
    //创建一个 assistant_message 对象
    let assistant_message = {
      role: 'assistant',
      images: images,
      user_id: null,
      content: content,
      created_at: Date.now()
    }
    //将openai返回的消息加到列表
    messageList.value.push(assistant_message)
    console.log(new Date().toLocaleString(), "AI回复消息", content)
  } catch (error) {

    console.log(error.name, error.message)

  } finally {

    isAIProcessing.value = false

  }

}

function handleSend() {
  //来发送用户消息，如果AI正在思考中，那么就直接返回
  if (isAIProcessing.value) {
    return
  }
  console.log(new Date().toLocaleString(), "用户开始发送消息")
  //content是用户输入的内容， name： 用户名
  const user_message = {
    role: "user",
    user_id: userId.value,
    content: message.value,
    created_at: Date.now(),
  }
  sendToChat(user_message)

  message.value = ''
  //发送完成后滚动下屏幕
  resetScroll()

}

function resetScroll() {
  console.log(new Date().toLocaleString(), "滚动屏幕")
  //函数来滚动消息列表, setTimeout() 方法将消息列表滚动到底部
  setTimeout(() => {
    messageRef.value.scrollTop = messageRef.value.scrollHeight
  }, 300)

}

function getBackgroundClass(role, user_id) {
  console.log(new Date().toLocaleString(), "获取背景样式")
  //函数根据用户/AI 设置消息的背景颜色
  if (role === 'system') {
    return 'system'
  } if (role === 'assistant') {
    return 'bot'
  } else {
    return user_id !== userId.value ? 'other' : 'user'
  }
}

// 当state.messageEvents有变化时，更新messages，即更新消息列表，返回排序后的messages，state.messageEvents来自socket.js
const messages = computed(() => {
  console.log(new Date().toLocaleString(), "计算messages")
  return messageList.value.sort((a, b) => {
    if (a.created_at > b.created_at) return 1
    if (a.created_at < b.created_at) return -1
    return 0
  })
})

function handleQuestionClick(question) {
  //每个点击的按钮对应的处理，更新message.value 为question的内容，然后触发handleSend
  message.value = question
  handleSend()
}

onMounted(() => {
  userId.value = getSimpleId()
});

</script>

<template>
  <div class="container">
    <div class="messages" ref="messageRef">
      <div class="message-item" v-for="(msg) in messages" :key="msg.id">
        <div :class="{ rowReverse: msg.user_id !== userId }">
          <!-- 显示在左侧还是在右侧，跟msg.user_id有关 -->
          <div class="message-contents"
            :class="{ marginLeft: msg.user_id !== userId, marginRight: msg.user_id === userId }">
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
        <div class="image-gallery">
          <div v-for="image in msg.images" :key="image.title" class="image-item">
            <img :src="image.img" :alt="image.title" class="image" href="image.url" />
            <div class="image-title">{{ image.title }}</div>
            <div class="image-price">价格：{{ image.price }}</div>
          </div>
        </div>
      </div>
      <div v-if="isAIProcessing" class="loading-text">
        <LoadingText />
      </div>
      <div class="more-question">
        <el-button v-for="(content, index) in display_question" :key="index" :type="buttonColors[index]"
          @click="handleQuestionClick(content)">
          {{ content }}
        </el-button>
      </div>
    </div>
    <div class="input">
      <input ref="inputRef" @keyup.enter="handleSend" placeholder="Send message" class="input-text" type="text"
        v-model="message" />
      <button :disabled="!message || isAIProcessing" @click="handleSend" class="button">Send</button>
    </div>
    <div class="footer">
    </div>
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
  flex-direction: column;
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

.image-gallery {
  display: flex;
}

.image-item {
  flex: 1;
  text-align: center;
  margin: 10px;
}

.image {
  width: 100%;
  max-width: 200px;
  height: 200px;
  /* 设置固定高度 */
  object-fit: cover;
  /* 自动裁剪以适应容器 */
}

.image-title {
  margin-top: 10px;
}

.image-price {
  margin-top: 5px;
  font-size: 14px;
}

.more-question {
  float: right;
  font-size: 14px;
  margin-top: 10px;
  margin-bottom: 10px;
}
</style>