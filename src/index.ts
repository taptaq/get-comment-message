const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default
const { parse: vueParser } = require('vue-eslint-parser')
const postcssNested = require('postcss-nested')
const postcssComment = require('postcss-comment')
// const cssNext = require('postcss-cssnext')
const postcss = require('postcss')
const { parse: htmlParser } = require('parse5')
const fs = require('fs')
const path = require('path')
const generateCodeWithComment = require('./generateCodeWithComment').default
const getCodellocLine = require('./getCodellocLine').default

enum CommentType {
  'line' = 'line',
  'block' = 'block'
}

interface CommentItemType {
  startIndex: number;
  endIndex: number;
  lineCount: number;
  commentFlag: CommentType;
  value: string;
  loc?: {
    start: {
      line: number
    },
    end: {
      line: number
    }
  }
}

enum CommentLanguageType {
  'zh' = 'zh',
  'en' = 'en',
  'zhen' = 'zhen'
}

interface CommentMsgType {
  filePath: string;
  density: string;
  lenMsg: {
    languageFlag: CommentLanguageType;
    len: number;
    startIndex: number;
    endIndex: number;
    commentFlag: CommentType,
    value: string;
  }[];
  totalCodeLine: number;
}

interface OptionsType {
  onlyAllowZh?: boolean;
  zhPreNum?: number;
  skipDir?: string[];
  showError?: boolean;
  fileLineThreshold?: number;
}

// 计算不同文件类型相关注释密度的映射对象
const COUNT_COMMENT_DENSITY_MAP: {
  [key: string]: any
} = {
  '.vue': countCommentForVue,
  '.scss': countCommentForPreCss,
  '.sass': countCommentForPreCss,
  '.less': countCommentForPreCss,
  '.js': countCommentForJs,
  '.jsx': countCommentForJs,
  '.ts': countCommentForJs,
  '.tsx': countCommentForJs,
  '.html': countCommentForHtml
}

// 记录错误信息对象
const errorObj: string[] = []

/**
 * 计算文件行数（去掉空行）
 * @param fileContent 目标文件内容
 * @returns 文件长度
 */
function countCodeLine(fileContent: string) {
  return fileContent.split('\n').filter(item => item).length
}

/**
 * 过滤多行注释的空行
 * @param blockCommentStr 多行注释文本
 * @returns 过滤后的多行注释文本
 */
function handleFilterBlockComment(blockCommentStr: string) {
  return blockCommentStr.split('\n').filter(item => {
    const itemTemp = item.trim()
    return itemTemp && itemTemp !== '*'
  })
}

/**
 * 针对于js/jsx文件计算注释密度
 * @param fileContent 目标文件内容
 * @returns js/jsx文件的注释数据
 */
function countCommentForJs(fileContent: string): Promise<CommentItemType[]> {
  return new Promise((resolve: any, reject: any) => {
    try {
      const ast = parser.parse(fileContent, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      })
      let lineCommentArr: CommentItemType[] = []
      let blockCommentArr: CommentItemType[] = []
      traverse(ast, {
        enter(path: any) {
          const commentsArr = path?.container?.comments || []
          commentsArr.forEach((item: any) => {
            // 对单行注释的数据结构进行处理
            if (item.type === 'CommentLine') {
              const { loc: { start, end } } = item
              const itemTemp: CommentItemType = {
                ...item,
                startIndex: start.line,
                endIndex: end.line,
                lineCount: end.line - start.line + 1,
                commentFlag: CommentType.line
              }
              lineCommentArr.push(itemTemp)
            }
            // 对多行(块级)注释的数据结构进行处理
            else if (item.type === 'CommentBlock') {
              const { value, loc: { start, end } } = item
              // 过滤掉空注释
              const noEmptyCommentArr = handleFilterBlockComment(value)
              const line = noEmptyCommentArr.length
              const itemTemp: CommentItemType = {
                ...item,
                value: noEmptyCommentArr.join('\n'),
                startIndex: start.line,
                endIndex: end.line,
                lineCount: line,
                commentFlag: CommentType.block
              }
              blockCommentArr.push(itemTemp)
            }
          })
        },
      })

      const totalComment = [...lineCommentArr, ...blockCommentArr]
      // 重新生成一个带注释和代码是否在同一行的标识的注释信息数组
      const newTotalComment = generateCodeWithComment(ast?.program, totalComment, 'js')
      resolve(newTotalComment)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 针对于scss/sass/less文件计算注释密度
 * @param fileContent 目标文件内容
 * @returns scss/sass/less文件的注释数据
 */
function countCommentForPreCss(fileContent: string): Promise<CommentItemType[]> {
  return new Promise(async (resolve: any, reject: any) => {
    try {
      // 解析不了#{}插值语法，将对应插值内容置为空，不影响
      const newFileContent = fileContent.replace(/#{.*?}/g, '')
      // 将样式代码转为css格式
      const finalCssCode = await postcss([postcssNested]).process(newFileContent, { parser: postcssComment }).css || ''
      // console.info(finalCssCode, '--finalCssCode')
      const cssAst = postcss.parse(finalCssCode)
      let cssCommentArr = cssAst.nodes.filter((item: any) => item.type === 'comment')
      const cssOtherNodesArr = cssAst.nodes.filter((item: any) => item.type !== 'comment')
      cssOtherNodesArr.forEach((item: any) => {
        if (item.nodes) {
          item.nodes.forEach((nodeItem: any) => {
            if (nodeItem.type === 'comment') {
              cssCommentArr.push(nodeItem)
            }
          })
        }
      })
      // 处理多行注释的数据结构
      cssCommentArr = cssCommentArr.map((item: any) => {
        const { text, source: { start, end } } = item
        // 过滤掉空注释
        const noEmptyCommentArr = handleFilterBlockComment(text)
        const line = noEmptyCommentArr.length
        return {
          value: noEmptyCommentArr.join('\n'),
          loc: item.source,
          startIndex: start.line,
          endIndex: end.line,
          lineCount: line,
          commentFlag: CommentType.block
        }
      })
      // 重新生成一个带注释和代码是否在同一行的标识的注释信息数组
      const newTotalComment = generateCodeWithComment(cssOtherNodesArr, cssCommentArr, 'css')
      resolve(newTotalComment)
    } catch (error) {
      reject(error)
    }
  })
}

// 获取html节点中的注释
function getHtmlComments(nodes: any = []) {
  let comments: any[] = [];
  nodes.forEach((node: any) => {
    // 注释节点类型
    if (node.nodeName === '#comment') {
      comments.push(node);
    }
    if (node?.childNodes?.length) {
      comments = comments.concat(getHtmlComments(node?.childNodes));
    }
  });

  return comments;
}

/**
 * 针对于html文件计算注释密度
 * @param fileContent 目标文件内容
 * @returns html文件的注释数据
 */
function countCommentForHtml(fileContent: string): Promise<CommentItemType[]> {
  return new Promise((resolve, reject) => {
    try {
      const htmlAst = htmlParser(fileContent, {
        sourceCodeLocationInfo: true,
      })
      const htmlEle = htmlAst.childNodes.find((item: any) => item.nodeName === 'html') || {}
      const childNodes = htmlEle?.childNodes.filter((item: any) => item.nodeName === 'body' || item.nodeName === 'head')
      const comments = getHtmlComments(childNodes) || []
      const lineCommentArr: CommentItemType[] = []
      const blockCommentArr: CommentItemType[] = []
      comments.forEach((item => {
        const { data, sourceCodeLocation: {
          startLine = 0,
          endLine = 0
        }} = item
        if (data.indexOf('\n') > -1) {
          const noEmptyCommentArr = data.split('\n').filter((textItem: string) => textItem.trim())
          blockCommentArr.push({
            value: noEmptyCommentArr.join('\n'),
            lineCount: noEmptyCommentArr.length,
            commentFlag: CommentType.block,
            startIndex: startLine,
            endIndex: endLine,
          })
        } else {
          lineCommentArr.push({
            value: data,
            lineCount: 1,
            commentFlag: CommentType.line,
            startIndex: startLine,
            endIndex: endLine,
          })
        }
      }))
      const totalComments = [...lineCommentArr, ...blockCommentArr]
      // 重新生成一个带注释和代码是否在同一行的标识的注释信息数组
      const newTotalComments = generateCodeWithComment(htmlEle, totalComments, 'html')
      resolve(newTotalComments)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 针对于vue文件计算注释密度
 * @param fileContent 目标文件内容
 * @returns vue文件的注释数据
 */
function countCommentForVue(fileContent: string): Promise<CommentItemType[]> {
  return new Promise(async (resolve, reject) => {
    try {
      // 处理template部分的代码注释
      const fileContentArr = fileContent.split('\n') || []
      const scriptBabelIndex = fileContentArr.findIndex(item => item.indexOf('<script') > -1)
      fileContentArr.splice(scriptBabelIndex, fileContentArr.length - scriptBabelIndex - 1)
      const templateContent = fileContentArr.join('\n')
      const ast = vueParser(templateContent, {
        sourceType: 'module',
      })
      let lineCommentArr: CommentItemType[] = []
      let blockCommentArr: CommentItemType[] = []
      const templateComments = ast.templateBody?.comments || []
       // 重新生成一个带注释和代码是否在同一行的标识的注释信息数组
       const newTemplateComments = generateCodeWithComment(ast?.templateBody?.children || '', templateComments, 'template')
       newTemplateComments.forEach((item: any) => {
        // 多行注释
        if (item?.value?.indexOf('\n') > -1) {
          blockCommentArr.push(item)
        } else { // 单行注释
          lineCommentArr.push(item)
        }
      })

      // 处理script部分的代码注释
      // 提取script标签里面的代码
      const scriptRegex = /<script.*>([\s\S]*?)<\/script>/gmi;
      let scriptMatch;
      let scriptCode = ''
      while ((scriptMatch = scriptRegex.exec(fileContent)) !== null) {
        scriptCode = scriptMatch[1] || '';
      }
      // console.info(scriptCode, '--scriptCode')
      const scriptComments = (await countCommentForJs(scriptCode)) || []
      scriptComments.forEach(item => {
        if (item.commentFlag === CommentType.line) {
          lineCommentArr.push(item)
        } else {
          blockCommentArr.push(item)
        }
      })

      // 处理style部分的代码注释
      // 提取style标签里面的代码
      const styleRegex = /<style.*>((\n|.*)+)<\/style>/gmi;
      let styleMatch;
      let styleCode = ''
      while ((styleMatch = styleRegex.exec(fileContent)) !== null) {
        styleCode = styleMatch[1] || '';
      }
      const styleCodeTemp = styleCode.replace(/<(\/)*style.*>/g, '') // 有可能会存在多个style，所以把style标签置为空
      const finalStyleCode = styleCodeTemp.replace(/<script>([\s\S]*?)<\/script>/g, '')
      // console.info(finalStyleCode, '--finalStyleCode')
      const cssCommentMsg = (await countCommentForPreCss(finalStyleCode)) || []
      blockCommentArr = [...blockCommentArr, ...(cssCommentMsg || [])]
      // 处理单行注释的数据结构
      lineCommentArr = lineCommentArr.map(item => {
        const { loc: { start = {
          line: 0
        }, end = {
          line: 0
        } } = {} } = item
        return {
          ...item,
          startIndex: start.line,
          endIndex: end.line,
          lineCount: end.line - start.line + 1,
          commentFlag: CommentType.line
        }
      })
      // 处理多行注释的数据结构
      blockCommentArr = blockCommentArr.map(item => {
        const { value, loc: { start = {
          line: 0
        }, end = {
          line: 0
        } } = {} } = item
        // 过滤掉空注释
        const noEmptyCommentArr = handleFilterBlockComment(value)
        const line = noEmptyCommentArr.length
        return {
          ...item,
          value: noEmptyCommentArr.join('\n'),
          startIndex: start.line,
          endIndex: end.line,
          lineCount: line,
          commentFlag: CommentType.block
        }
      })
      const totalComments = [...lineCommentArr, ...blockCommentArr]
      resolve(totalComments)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 计算注释密度
 * @param filePath 处理的目标文件路径
 * @param options  配置项
 * @returns 文件注释密度/注释值的相关信息
 */
function countCommentDensity(filePath: string, options?: OptionsType): Promise<{
  commentDensity: string;
  comments: CommentItemType[];
  totalCodeLine: number;
}> {
  const { onlyAllowZh = true, zhPreNum = 3, fileLineThreshold = 500 } = options || {}
  const computedLLocArr = ['.js', '.ts', 'jsx', 'tsx']
  return new Promise(async (resolve) => {
    try {
      const pathExtName = path.extname(filePath)
      const fileContent = fs.readFileSync(filePath, 'utf-8') || ''
      const comments = await COUNT_COMMENT_DENSITY_MAP[pathExtName](fileContent)
      const finalComments = onlyAllowZh ? comments?.filter((item: any) => {
        // 判断对应注释的前x个字符是否包含中文，判定为中文注释
        return /[\u4e00-\u9fa5]/.test(item.value.trim().substring(0, zhPreNum))
      }) : comments
      const totalCommentLine = finalComments.reduce((pre: any, next: any) => {
        return pre + next.lineCount
      }, 0)
      // 把和代码同一行的注释提取成新的一行，避免有注释密度计算的歧义
      const codeWithCommentsNum = finalComments.filter((item: any) => item.codeWithCommentFlag).length || 0
      const totalCodeLine = countCodeLine(fileContent)
      // 最终的计算总行数基数（符合指定类型的文件且小于文件行数阈值的使用逻辑行数作为基数，大于文件行数阈值的使用文件行数作为基数）
      const computedTotalCodeLine = computedLLocArr.includes(pathExtName) && totalCodeLine < fileLineThreshold ? getCodellocLine(fileContent) : totalCodeLine
      const commentDensity = computedTotalCodeLine ? (totalCommentLine / (computedTotalCodeLine + codeWithCommentsNum)) * 100 : 0
      resolve({
        commentDensity: `${Math.min(+commentDensity, 100).toFixed(2)}%`, // 保证在100%的范围内
        comments: !commentDensity ? [] : finalComments,
        totalCodeLine
      })
    } catch (error: any) {
      errorObj.push(`${filePath}：${error?.message || ''}`)
      resolve({
        commentDensity: '0.00%',
        comments: [],
        totalCodeLine: 0
      })
    }
  })
}

/**
 * 计算注释长度
 * @param str 目标注释内容
 * @returns 注释长度相关信息
 */
function getCommentLen(str: string): {
  languageFlag: CommentLanguageType;
  len: number
} {
  const strTemp = str.trim()
  let languageFlag = CommentLanguageType.zh
  let len = 0
  const chRegex = /^[\u4e00-\u9fa51-9\.\\\(\（\)\）=\:\：\{\}\[\]\，\,\。\_\+\*\-\?\!\！\、\<\>\"\“\'\‘\<\>]+$/; // 匹配中文/数字/标点字符
  const enRegex = /^[a-zA-Z\s]+$/; // 匹配英文单词
  const isAllChinese = chRegex.test(strTemp);
  const isAllEnglish = enRegex.test(strTemp);

  // 针对于纯中文，直接计算字符串长度
  if (isAllChinese) {
    languageFlag = CommentLanguageType.zh
    len = strTemp.length;
  } else if (isAllEnglish) { // 针对于纯英文，直接计算单词长长度
    languageFlag = CommentLanguageType.en
    len = strTemp.split(' ').filter(item => item).length
  } else {
    // 针对于中英文夹杂，分别计算中文汉字/数字长度和英文单词词长长度(不含空格)
    const chMatchRegex = /[\u4e00-\u9fa51-9\.\\\(\（\)\）=\:\：\{\}\[\]\，\,\。\_\+\*\-\?\!\！\、\<\>\"\“\'\‘\<\>]+/g
    const enMatchRegex = /[a-zA-Z]+/g
    const chLen = strTemp.match(chMatchRegex)?.reduce((pre, next) => {
      return pre + next.length
    }, 0) || 0
    const enLen = strTemp.match(enMatchRegex)?.length || 0
    len = chLen + enLen
    languageFlag = CommentLanguageType.zhen
  }


  return {
    languageFlag,
    len
  }
}

/**
 * 递归遍历文件夹的文件
 * @param dirPath 目标文件夹/文件路径
 * @param skipDir 跳过遍历的目录名称
 * @returns 目标文件夹下的所有文件
 */
function recursiveTraversalFiles(
  dirPath: string,
  skipDir?: string[]
): string[] {
  const pathExtArr = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.scss', '.sass', '.less', '.html']
  const outPutFileArr: string[] = []
  try {
    const targetPathDirFlag = fs.statSync(dirPath).isDirectory()

    // 若为文件夹类型，读取目录中的所有文件和文件夹
    if (targetPathDirFlag) {
      const files = fs.readdirSync(dirPath)
      files.forEach((file: string) => {
        // 若是要跳过处理的文件夹，则直接返回，不进行递归或文件处理
        if ((skipDir || []).findIndex(item => file.indexOf(item) > -1) > -1) {
          return;
        }

        // 获取当前文件或文件夹的完整路径
        const filePath = path.join(dirPath, file);

        // 使用fs.stat来检查当前项是文件还是目录
        const stats = fs.statSync(filePath);

        // 如果是目录，则递归调用recursiveTraversalFiles方法
        if (stats.isDirectory()) {
          outPutFileArr.push(...(recursiveTraversalFiles(filePath, skipDir)));
        } else if (pathExtArr.includes(path.extname(filePath))) {  // 如果是符合处理后缀的文件，则执行回调函数处理文件路径
          outPutFileArr.push(filePath)
        }
      });
    } else {
      // 直接处理目标文件
      outPutFileArr.push(dirPath)
    }
    return outPutFileArr
  } catch (error) {
    console.error(`Unable to scan file/directory：${error}`)
    return []
  }
}

/**
 * 处理成最后输出的注释信息展示格式
 * @param filePath 目标文件路径
 * @param options  配置项
 * @returns 项目中每个文件的注释信息
 */
async function handleToProjectCommentMsg(filePath: string, options?: OptionsType): Promise<CommentMsgType> {
  const densityMsg = await countCommentDensity(filePath, options)
  const commentMsg: CommentMsgType = {
    filePath,
    density: densityMsg.commentDensity || '0.00%',
    lenMsg: [],
    totalCodeLine: densityMsg.totalCodeLine || 0
  }
  const comments = densityMsg.comments
  comments.forEach(item => {
    const { value, commentFlag, startIndex, endIndex } = item
    if (commentFlag === CommentType.block) {
      value.split('\n').forEach(item => {
        const itemTemp = item.replace(/\* | \s*/g, '')
        const commentLen = getCommentLen(itemTemp)
        commentMsg.lenMsg.push({
          ...commentLen,
          startIndex,
          endIndex,
          commentFlag,
          value: itemTemp
        })
      })
    } else {
      const commentLen = getCommentLen(value)
      commentMsg.lenMsg.push({
        ...commentLen,
        startIndex,
        endIndex,
        commentFlag,
        value
      })
    }
  })

  return commentMsg
}

/**
 * 运行入口
 * @param dirPath 目标文件夹路径
 * @param options 配置项
 * @param options.onlyAllowZh 是否只支持注释为中文的标识（默认为true）
 * @param options.zhPreNum 针对于注释中前几位包含中文字符来判定为中文注释（默认为3）
 * @param options.skipDir 跳过遍历的目录名称（默认为node_modules）
 * @param options.showError 展示错误信息（默认为false）
 * @param options.fileLineThreshold 文件行数的阈值（计算注释密度时，大于文件阈值以代码行数为基数，小于文件阈值以逻辑行数为基数）（默认为500）
 * @returns
 */
export async function walk(dirPath: string, options?: OptionsType) {
  const { showError = false } = options || {}
  const ignorePath = path.join(dirPath, '.gitignore')
  const exitsIgnoreFileFlag = fs.existsSync(ignorePath)
  // console.info(exitsIgnoreFileFlag, '---exitsIgnoreFileFlag')
  const ignoreContent = exitsIgnoreFileFlag ? fs.readFileSync(ignorePath)?.toString() : 'node_modules'
  // 过滤掉ignore文件中的注释内容以及把*替换成空字符
  const ignoreContentArr = (ignoreContent.split('\n') || []).filter((item: string) => item && item.indexOf('#') === -1).map((item: string) => item.replace(/\*/ig, ''))

  const outPutFileArr = recursiveTraversalFiles(dirPath, [...ignoreContentArr, ...(options?.skipDir || [])]);
  let projectCommentMsg: CommentMsgType[] = []
  for (const filePath of outPutFileArr) {
    const fileCommentMsg = await handleToProjectCommentMsg(filePath, options);
    projectCommentMsg.push(fileCommentMsg)
  }
  projectCommentMsg = projectCommentMsg.sort((a, b) => +(b.density.slice(0, -1)) - +(a.density.slice(0, -1)))

  return showError ? {
    projectCommentMsg,
    errorMsg: errorObj
  } : {
    projectCommentMsg
  }
}
