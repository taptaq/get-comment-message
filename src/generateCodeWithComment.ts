const traverse = require('@babel/traverse').default

/**
 * 找到js代码中包含不同注释类型的节点对应行数值
 * @param node 目标遍历节点的ast
 */
const findJsCodeLineNums = (nodes: any): number[] => {
  if (!nodes) return []

  let lines: any[] = []
  traverse(nodes, {
    enter(path: any) {
      const node = path.node;
      if (node.leadingComments || node.innerComments || node.trailingComments || (node.type !== 'CommentLine' && node.type !== 'CommentBlock')) {
        lines.push(node?.loc?.start?.line || 0);
        lines.push(node?.loc?.end?.line || 0);
      }
    }
  });
  return lines
}

/**
 * 找到css代码中代码节点的对应行数值
 * @param nodes 目标遍历节点的ast
 */
const findCssCodeLineNums = (nodes: any[]): number[] => {
  if (!nodes) return [];
  
  let lines: number[] = [];
  nodes.forEach(node => {
    const startLine = node?.source?.start?.line
    const endLine = node?.source?.end?.line
    if ((node.type === 'decl' || node.type === 'rule') && startLine !== undefined && endLine !== undefined) {
      lines.push(startLine);
      lines.push(endLine);
    }
    if (node?.nodes?.length) {
      lines = lines.concat(findCssCodeLineNums(node.nodes));
    }
  });

  return lines;
}

/**
 * 找到html代码中代码节点的对应行数值
 * @param nodes 目标遍历节点的ast
 */
const findHtmlCodeLineNums = (nodes: any): number[] => {
  if (!nodes) return []
  let lines: number[] = [nodes?.sourceCodeLocation?.startLine, nodes?.sourceCodeLocation?.endLine];
  nodes?.childNodes?.forEach((node: any) => {
    const { sourceCodeLocation: {
      startLine = 0,
      endLine = 0
    } = {}, value = '', nodeName = '' } = node;
    const noEmptyValueFlag = !!(nodeName === '#text' && value?.trim().split('\n').filter((item: string) => item).length)
    const startLineTemp = noEmptyValueFlag && value.startsWith('\n') ? startLine + 1 : startLine
    if (nodeName !== '#comment' && (noEmptyValueFlag || nodeName !== '#text') && (startLineTemp !== undefined || !isNaN(startLineTemp)) && endLine !== undefined) {
      lines.push(startLineTemp);
      // 不是文本节点的才把endLine添加进来，以防被该节点后续的空内容扰乱
      nodeName !== '#text' && lines.push(endLine);
    }
    if (node?.childNodes?.length) {
      lines = lines.concat(findHtmlCodeLineNums(node));
    }
  });

  return lines;
}

/**
 * 找到vue的template代码中代码节点的对应行数值
 * @param nodes 目标遍历节点的ast
 */
const findTemplateCodeLineNums = (nodes: any): number[] => {
  if (!nodes) return []
  let lines: number[] = [];
  nodes?.forEach((node: any) => {
    const {
      value = '',
      type = '',
      loc: {
        start: {
          line: startLine = 0,
        } = {},
        end: {
          line: endLine = 0,
        } = {}
      } = {}
    } = node
    const noEmptyValueFlag = !!(type === 'VText' && value?.trim().split('\n').filter((item: string) => item).length)
    const startLineTemp = noEmptyValueFlag && value.startsWith('\n') ? startLine + 1 : startLine
    if ((noEmptyValueFlag || type !== 'VText') && (startLineTemp !== undefined || !isNaN(startLineTemp)) && endLine !== undefined) {
      lines.push(startLineTemp);
      // 不是文本节点的才把endLine添加进来，以防被该节点后续的空内容扰乱
      type !== 'VText' && lines.push(endLine);
    }
    if (node?.children?.length) {
      lines = lines.concat(findTemplateCodeLineNums(node?.children));
    }
  });

  return lines;
}

const GET_CODE_LINE_NUMS_MAP: {
  [key: string]: any
} = {
  js: findJsCodeLineNums,
  css: findCssCodeLineNums,
  html: findHtmlCodeLineNums,
  template: findTemplateCodeLineNums
}

/**
 * 判断代码和注释是否为同一行
 * @param codeAst 目标节点ast
 * @param commentMsg 要处理的注释信息
 * @param type 处理的代码类型
 * @returns 
 */
const generateCodeWithComment = (codeAst: any, commentMsg: any, type: string) => {
  let commentMsgTemp: any = [...commentMsg]
  const nodesWithCommentsMsg: number[] = [...new Set(GET_CODE_LINE_NUMS_MAP[type](codeAst))] as number[];

  // console.info(nodesWithCommentsMsg, '---nodesWithCommentsMsg')

  commentMsgTemp = commentMsg.map((item: any) => ({
    ...item,
    codeWithCommentFlag: nodesWithCommentsMsg.includes(item?.startIndex || item?.loc?.start?.line)
  }))
  return commentMsgTemp
}

export default generateCodeWithComment
