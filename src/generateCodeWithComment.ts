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
    const line = node?.source?.start?.line
    if ((node.type === 'decl' || node.type === 'rule') && line !== undefined) {
      lines.push(line);
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
  let lines: number[] = [nodes?.sourceCodeLocation?.startLine];
  nodes?.childNodes?.forEach((node: any) => {
    const { sourceCodeLocation: {
      startLine = 0
    } = {}, value = '' } = node;
    const noEmptyValueFlag = !!(node.nodeName === '#text' && value?.trim().split('\n').filter((item: string) => item).length)
    const line = noEmptyValueFlag && value.startsWith('\n') ? startLine + 1 : startLine
    if (node.nodeName !== '#comment' && (noEmptyValueFlag || node.nodeName !== '#text') && (line !== undefined || !isNaN(line))) {
      lines.push(line);
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
          line = 0
        } = {}
      } = {}
    } = node
    const noEmptyValueFlag = !!(type === 'VText' && value?.trim().split('\n').filter((item: string) => item).length)
    const lineTemp = noEmptyValueFlag && value.startsWith('\n') ? line + 1 : line
    if ((noEmptyValueFlag || type !== 'VText') && (lineTemp !== undefined || !isNaN(lineTemp))) {
      lines.push(lineTemp);
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
