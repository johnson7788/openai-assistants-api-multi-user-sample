//sleep多少秒
exports.wait = (delay) => {
    return new Promise((resolve) => setTimeout(resolve, delay))
}
//随机字符串
exports.getSimpleId = () => {
    return Math.random().toString(26).slice(2);
}

//从数组中随机选取3个元素的key，返回array
exports.getRandomProperties = (obj, count) => {
    const keys = Object.keys(obj);
    const shuffledKeys = keys.sort(() => Math.random() - 0.5);
    const selectedKeys = shuffledKeys.slice(0, count);
    const result = [];
    for (const key of selectedKeys) {
      result.push(obj[key]);
    }
    return result;
  }