<script setup>
import { computed, toRefs } from 'vue'
//接收父组件传入的参数
const props = defineProps({
    checked: {
        type: Boolean,
        default: false,
    },
})
//使用 defineEmits 定义了组件的事件，其中包含了一个名为 change 的事件。change事件会被emit触发，然后将信息传递给父组件。
const emit = defineEmits(['change'])
//使用 toRefs 将 props 转换为普通对象，并解构出其中的 checked 属性。checked是响应式的
const { checked } = toRefs(props)

//这里面的value是True或false, checkbox点击后，是true
const isChecked = computed({
      get: () => checked.value,
      set: value => emit('change', value)
    })
// 显示的字幕，是stream还是socket
const caption = computed(() => checked.value ? 'stream' : 'socket')

</script>

<template>
    <label class="switch">
        <input type="checkbox" v-model="isChecked">
        <div class="slider round"><span :class="caption">{{ caption }}</span></div>
    </label>
</template>

<style scoped>
.switch {
  position: relative;
  display: inline-block;
  width: 70px;
  height: 22px;
}
.switch input { 
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  -webkit-transition: .4s;
  transition: .4s;
  display: flex;
  justify-content: center;
  align-items: center;
}
.slider span.socket {
    font-size: .7rem;
    padding-left: 16px;
}
.slider span.stream {
    font-size: .7rem;
    padding-right: 16px;
    color: #fff;
}
.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  -webkit-transition: .4s;
  transition: .4s;
}
input:checked + .slider {
  background-color: #00DC82;
}
input:focus + .slider {
  box-shadow: 0 0 1px #00DC82;
}
input:checked + .slider:before {
  -webkit-transform: translateX(48px);
  -ms-transform: translateX(48px);
  transform: translateX(48px);
}
.slider.round {
  border-radius: 22px;
}
.slider.round:before {
  border-radius: 50%;
}
</style>