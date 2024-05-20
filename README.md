## 计算代码注释密度以及注释长度的相关信息

### 安装
```
npm install get-comment-message --save
```


### 例子
```js
const {walk} = require('get-comment-message');

walk('目标文件夹/文件路径', [options]).then(res => {
  console.info(res)
})
```


### API
walk(path, [options])
- path：目标文件/文件夹路径
- options：配置对象
  - onlyAllowZh：是否只支持注释为中文的标识（默认为true）
  - zhPreNum：针对于注释中前几位包含中文字符来判定为中文注释（默认为3）
  - skipDir 跳过遍历的目录名称（默认为node_modules）


### 适用计算的文件类型
1. js / jsx
2. ts / tsx
3. css / scss / less / sass
4. html
5. vue