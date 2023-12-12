//sleep多少秒
exports.wait = (delay) => {
    return new Promise((resolve) => setTimeout(resolve, delay))
}
//随机字符串
exports.getSimpleId = () => {
    return Math.random().toString(26).slice(2);
}
