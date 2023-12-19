const express = require('express');

// 创建 Express 应用程序
const app = express();

// 定义要检测的对象
let myObject = { value: new Date().toLocaleString(), changed: false };

// 创建定时线程，每隔一定时间检测对象是否改变
setInterval(() => {
  // 检查对象是否改变
  if (myObject.changed) {
    console.log("对象已改变");
    myObject.changed = false; // 将 changed 标志重置为 false
    // 在这里执行你需要的操作
  }
}, 1000); // 每隔1秒检测一次

// 检查对象是否改变的函数
function isObjectChanged(currentObject) {
  // 在这里实现你的对象比较逻辑
  // 返回 true 表示对象已改变，返回 false 表示对象未改变
  // 这里简单比较对象的 value 属性是否发生变化
  return currentObject.value !== myObject.value;
}

// 处理 POST 请求
app.post('/', (req, res) => {
  // 在这里处理用户响应
  // 这部分不会受到定时线程的影响
  res.send('POST 请求已处理');
});

// 处理 GET 请求
app.get('/', (req, res) => {
  console.log("收到GET请求")
  // 在这里处理用户响应
  // 这部分不会受到定时线程的影响
  myObject.value = new Date().toLocaleString();
  myObject.changed = true; // 将 changed 标志设置为 true 表示对象已改变
  res.send('GET 请求已处理');
});

// 启动 Express 应用程序，监听端口
app.listen(3000, () => {
  console.log('应用程序已启动，监听端口 3000');
});
