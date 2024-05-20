const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default
const { parse: vueParser } = require('vue-eslint-parser')
const postcssNested = require('postcss-nested')
const postcssComment = require('postcss-comment')
const cssNext = require('postcss-cssnext')
const postcss = require('postcss')
var htmlParser = require('node-html-parser');
const fs = require('fs')
const path = require('path')

interface CommentItemType {
  startIndex: number;
  endIndex: number;
  lineCount: number;
  commentFlag: 'line' | 'block'
  loc?: {
    start: {
      line: number;
    };
    end: {
      line: number;
    };
  },
  value: string;
}

enum CommentLanguageType {
  'zh',
  'en',
  'zhen'
}

interface CommentMsgType {
  filePath: string;
  density: string;
  lenMsg: {
    languageFlag: CommentLanguageType;
    len: number;
    startIndex: number;
    endIndex: number;
    commentFlag: 'line' | 'block'
  }[]
}

interface OptionsType {
  onlyAllowZh?: boolean;
  zhPreNum?: number;
  skipDir?: string[];
  pathExtArr?: string[];
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
                commentFlag: 'line'
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
                commentFlag: 'block'
              }
              blockCommentArr.push(itemTemp)
            }
          })
        },
      })

      const totalCommentLine = [...lineCommentArr, ...blockCommentArr]
      resolve(totalCommentLine)
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
      const finalCssCode = await postcss([postcssNested, cssNext]).process(newFileContent, { parser: postcssComment }).css || ''
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
          commentFlag: 'block'
        }
      })
      resolve(cssCommentArr)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 针对于html文件计算注释密度
 * @param fileContent 目标文件内容
 * @returns html文件的注释数据
 */
function countCommentForHtml(fileContent: string): Promise<CommentItemType[]> {
  return new Promise((resolve, reject) => {
    try {
      const fileContentArr = fileContent.split('\n')
      const htmlAst = htmlParser.parse(fileContent, {
        comment: true
      })
      const htmlEle = htmlAst.childNodes.find((item: any) => +item.nodeType === 1) || {}
      const headComments = htmlEle?.childNodes?.find((item: any) => item.rawTagName === 'head')?.childNodes?.filter((item: any) => +item.nodeType === 8) || []
      const bodyComments = htmlEle?.childNodes?.find((item: any) => item.rawTagName === 'body')?.childNodes?.filter((item: any) => +item.nodeType === 8) || []
      const comments = [...headComments, ...bodyComments]
      const lineCommentArr: CommentItemType[] = []
      const blockCommentArr: CommentItemType[] = []
      comments.forEach((item => {
        const { rawText } = item
        if (rawText.indexOf('\n') > -1) {
          const noEmptyCommentArr = rawText.split('\n').filter((textItem: string) => textItem.trim())
          const startIndex = fileContentArr.findIndex(item => item.indexOf(noEmptyCommentArr[0]) > -1) + 1
          const endIndex = fileContentArr.findIndex(item => item.indexOf(noEmptyCommentArr[noEmptyCommentArr.length - 1]) > -1) + 1
          blockCommentArr.push({
            value: noEmptyCommentArr.join('\n'),
            lineCount: noEmptyCommentArr.length,
            startIndex,
            endIndex,
            commentFlag: 'block'
          })
        } else {
          const startIndex = fileContentArr.findIndex(item => item.indexOf(rawText) > -1) + 1

          lineCommentArr.push({
            value: rawText,
            lineCount: 1,
            startIndex,
            endIndex: startIndex,
            commentFlag: 'line'
          })
        }
      }))
      const totalComments = [...lineCommentArr, ...blockCommentArr]
      resolve(totalComments)
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
      templateComments.forEach((item: any) => {
        // 多行注释
        if (item?.value?.indexOf('\n') > -1) {
          blockCommentArr.push(item)
        } else { // 单行注释
          lineCommentArr.push(item)
        }
      })

      // 处理script部分的代码注释
      // 提取script标签里面的代码
      const scriptRegex = /<script>([\s\S]*?)<\/script>/gmi;
      let scriptMatch;
      let scriptCode = ''
      while ((scriptMatch = scriptRegex.exec(fileContent)) !== null) {
        scriptCode = scriptMatch[1] || '';
      }
      const scriptComments = (await countCommentForJs(scriptCode)) || []
      scriptComments.forEach(item => {
        if (item.commentFlag === 'line') {
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
          commentFlag: 'line'
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
          commentFlag: 'block'
        }
      })
      const totalCommentLine = [...lineCommentArr, ...blockCommentArr]
      resolve(totalCommentLine)
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
  comments: CommentItemType[]
}> {
  const { onlyAllowZh = true, zhPreNum = 3 } = options || {}
  return new Promise(async (resolve) => {
    try {
      const pathExtName = path.extname(filePath)
      const fileContent = fs.readFileSync(filePath, 'utf-8') || ''
      const comments = await COUNT_COMMENT_DENSITY_MAP[pathExtName](fileContent)
      const totalCommentLine = comments?.filter((item: any) => {
        // 判断对应注释的前x个字符是否包含中文，判定为中文注释
        return onlyAllowZh ? /[\u4e00-\u9fa5]/.test(item.value.trim().substring(0, zhPreNum)) : true
      }).reduce((pre: any, next: any) => {
        return pre + next.lineCount
      }, 0)
      const totalCodeLine = countCodeLine(fileContent)
      const commentDensity = totalCodeLine ? `${((totalCommentLine / totalCodeLine) * 100).toFixed(2)}%` : '0.00%'
      resolve({
        commentDensity,
        comments: commentDensity === '0.00%' ? [] : comments
      })
    } catch (error: any) {
      errorObj.push(`${filePath}：${error?.message || ''}`)
      resolve({
        commentDensity: '0',
        comments: []
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
  // console.info(isAllChinese, '--isAllCh')
  // console.info(isAllEnglish, '--isAllEn')

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
 * @param skipDir 跳过遍历的目录名称（默认为node_modules）
 * @returns 目标文件夹下的所有文件
 */
function recursiveTraversalFiles(
  dirPath: string,
  skipDir?: string[]
): string[] {
  const skipDirTemp = ['node_modules', ...(skipDir || [])]
  const pathExtArr = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.scss', '.sass', '.less', '.html']
  const outPutFileArr: string[] = []
  try {
    const targetPathDirFlag = fs.statSync(dirPath).isDirectory()

    // 若为文件夹类型，读取目录中的所有文件和文件夹
    if (targetPathDirFlag) {
      const files = fs.readdirSync(dirPath)
      files.forEach((file: string) => {
        // 若是要跳过处理的文件夹，则直接返回，不进行递归或文件处理
        if (skipDirTemp.findIndex(item => file.indexOf(item) > -1) > -1) {
          return;
        }

        // 获取当前文件或文件夹的完整路径
        const filePath = path.join(dirPath, file);

        // 使用fs.stat来检查当前项是文件还是目录
        const stats = fs.statSync(filePath);

        // 如果是目录，则递归调用recursiveTraversalFiles方法
        if (stats.isDirectory()) {
          outPutFileArr.push(...(recursiveTraversalFiles(filePath, skipDir) || []));
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
  const commentMsg: CommentMsgType = {
    filePath,
    density: '0',
    lenMsg: []
  }
  const density = await countCommentDensity(filePath, options)
  const comments = density.comments
  comments.forEach(item => {
    const { value, commentFlag, startIndex, endIndex } = item
    if (commentFlag === 'block') {
      value.split('\n').forEach(item => {
        const itemTemp = item.replace(/\* | \s*/g, '')
        const commentLen = getCommentLen(itemTemp)
        commentMsg.lenMsg.push({
          ...commentLen,
          startIndex,
          endIndex,
          commentFlag
        })
      })
    } else {
      const commentLen = getCommentLen(value)
      commentMsg.lenMsg.push({
        ...commentLen,
        startIndex,
        endIndex,
        commentFlag
      })
    }
  })

  commentMsg.density = density.commentDensity
  return commentMsg
}

/**
 * 运行入口
 * @param dirPath 目标文件夹路径
 * @param options 配置项
 * @param options.onlyAllowZh 是否只支持注释为中文的标识（默认为true）
 * @param options.zhPreNum 针对于注释中前几位包含中文字符来判定为中文注释（默认为3）
 * @param options.skipDir 跳过遍历的目录名称（默认为node_modules）
 * @returns
 */
export async function walk(dirPath: string, options?: OptionsType) {
  const outPutFileArr = recursiveTraversalFiles(dirPath, options?.skipDir);
  let projectCommentMsg: CommentMsgType[] = []
  for (const filePath of outPutFileArr) {
    const fileCommentMsg = await handleToProjectCommentMsg(filePath, options);
    projectCommentMsg.push(fileCommentMsg)
  }
  projectCommentMsg = projectCommentMsg.sort((a, b) => +(b.density.slice(0, -1)) - +(a.density.slice(0, -1)))

  return projectCommentMsg
}
