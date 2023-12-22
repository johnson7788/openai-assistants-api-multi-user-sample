import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppDataStore = defineStore('appData', () => {
    
    const store_key = 'openai-assistant-appdata'

    let def_name = ''
    let def_id = ''

    const raw = localStorage.getItem(store_key)
    if(raw) {
        const obj = JSON.parse(raw)
        def_name = obj.name
        def_id = obj.id
    }
    const welcome_message = {
        role: 'system',
        user_id: null,
        content: "你好，欢迎使用香氛问答机器人，有任何问题都请问我吧!",
        created_at: Date.now()
      }
    const name = ref(def_name)
    const id = ref(def_id)
    let messageList = ref([welcome_message]) //历史对话信息

    function AppendMessage(message) {
        // 添加一条消息到messageList
        messageList.value.push(message)
    }
    // 保存用户名到本地， 不是session存储，是本地存储，保存成json格式
    function setName(sname) {
        name.value = sname
        localStorage.setItem(store_key, JSON.stringify({ name: sname, id: id.value }))
    }

    function setId(sid) {
        id.value = sid
        localStorage.setItem(store_key, JSON.stringify({ name: name.value, id: sid }))
    }

    return { name, id, messageList, setName, setId, AppendMessage }
})
