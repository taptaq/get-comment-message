## 计算代码注释密度以及注释长度的相关信息

### 1.安装
```shell
npm install get-comment-message --save
```
<br>

### 2.例子
```js
const {walk} = require('get-comment-message');

walk('目标文件夹/文件路径', [options]).then(res => {
  console.info(res)
})
```
<br>

### 3.API
walk(path, [options])
- path: 目标文件/文件夹路径
- options: 配置对象
  - onlyAllowZh: 是否只支持注释为中文的标识（默认为true）
  - zhPreNum: 针对于注释中前几位包含中文字符来判定为中文注释（默认为3）
  - skipDir: 跳过遍历的目录名称（默认为node_modules）
  - showError: 是否显示错误信息（默认为false）
  - fileLineThreshold: 文件行数阈值（默认为500，计算注释密度时，大于该阈值以代码行数为基数，小于等于该阈值以逻辑行数为基数）
  - ignoreCSS: 是否忽略css相关文件的密度注释计算（默认为true）
  - filterFileByCodeLineMsg: 代码行数过滤对象
    - codeLineType: 判断这个过滤是以实际代码行数(totalCodeLine)为条件还是以逻辑行数(logicalLine)为条件（目标文件一旦超过下面设置的行数阈值将过滤不计算，逻辑行数只针对于js/ts/jsx/tsx/vue文件）
    - codeLineThreshold: 行数阈值
  - ignoreNodeModules: 是否忽略node_modules
  - fnLineThreshold: 函数逻辑行数的阈值（默认为15，超过此阈值的函数才会被统计函数的注释密度）

<br>

### 4.返回的数据结构
```js
// 不展示错误信息时
{
  projectCommentMsg: {
    filePath: 检测的文件路径,
    density: 注释密度,
    lenMsg: {
      languageFlag: 注释语言类型：zh | en | zhen,
      len: 注释长度,
      startIndex: 注释开始位置,
      endIndex: 注释结束位置,
      commentFlag: 注释类型：line | block,
      value: 注释内容,
    },
    totalCodeLine: 总代码行数,
    logicalLine: 逻辑行数,
    totalCommentLine: 总注释行数,
    funLLocMsg: [ 记录各函数的信息
      {
        name: 函数名,
        lloc: 逻辑行数,
        line: 函数起始位置,
        code: 函数方法体,
        comments: 注释信息,
        commentDensity: 注释密度
      }
    ]
  }[]
}

// 展示错误信息时
{
  projectCommentMsg: {
    filePath: 检测的文件路径,
    density: 注释密度,
    lenMsg: {
      languageFlag: 注释语言类型：zh | en | zhen,
      len: 注释长度,
      startIndex: 注释开始位置,
      endIndex: 注释结束位置,
      commentFlag: 注释类型：line | block,
      value: 注释内容,
    },
    totalCodeLine: 总代码行数
    logicalLine: 逻辑行数
    totalCommentLine: 总注释行数,
    funLLocMsg: [ 记录各函数的信息
      {
        name: 函数名,
        lloc: 逻辑行数,
        line: 函数起始位置,
        code: 函数方法体,
        comments: 注释信息,
        commentDensity: 注释密度
      }
    ]
  }[],
  errorMsg: []
}
```
<br>

### 5.代码注释密度的计算规则
1. 文件代码行数小于设置的文件行数阈值时：注释密度 = 注释行数 / 逻辑行数（针对于js/jsx/ts/tsx/vue类型的文件，其中vue文件的逻辑行数是template+script的逻辑行数之和）
2. 文件代码行数大于设置的文件行数阈值时：注释密度 = 注释行数 / 实际代码行数
<br>

### 6.代码注释长度的计算规则
英语单词，汉字，数字，符号各为一个词长度
<br>

### 7.适用计算的文件类型
1. js / jsx
2. ts / tsx
3. css / scss / less / sass
4. html
5. vue
