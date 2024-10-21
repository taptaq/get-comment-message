const parser = require('@babel/parser');
const { parse: vueParser } = require('vue-eslint-parser')
const traverse = require('@babel/traverse').default

// 各节点类型的逻辑行数值映射对象
const SYNTAX_BABYLON_LLOC_MAP: {
  [key: string]: number;
} = {
  Directive: 1, // 指令，如"use strict"
  ObjectMethod: 1, // 对象字面量中的方法，如普通方法、get方法、set方法或生成器方法
  ObjectProperty: 1, // 对象字面量中的属性
  BreakStatement: 1, // break语句
  AssignmentExpression: 1, // 赋值表达式（针对于一些多重赋值的情况进行特殊处理：若该节点的父节点为表达式语句，不额外添加1个lloc）
  CallExpression: 1, // 函数调用表达式（针对于嵌套的CallExpression节点(ExpressionStatement提供了1个lloc) 和 YieldExpression节点之后的第一个CallExpression，不额外添加1个lloc）
  CatchClause: 1, // 表示try...catch语句中的catch部分
  ContinueStatement: 1, // continue语句
  DoWhileStatement: 2, // do...while循环语句
  ExpressionStatement: 1, // 一个表达式语句（当子表达式是无效/无操作的箭头函数表达式ArrowFunctionExpression时，不额外添加1个lloc）
  ForInStatement: 1, // for...in循环语句
  ForStatement: 1, // 普通的for循环语句
  IfStatement: 1, // if语句（有else则视为2个lloc，否则视为1个）
  NewExpression: 1, // 使用 new 运算符调用构造函数的语句（new运算符后跟着的节点类型不为函数表达式FunctionExpression，不额外添加1个lloc）
  Property: 1, // 对象字面量中的一个属性（除babel/parser解析器外的语法类型）
  ReturnStatement: 1, // return语句
  SwitchCase: 1, // 每个子switch...case语句
  SwitchStatement: 1, // 一整个switch语句
  ThrowStatement: 1, // throw语句
  TryStatement: 1, // 一整个try...catch语句
  VariableDeclarator: 1, // 变量声明语句
  WhileStatement: 1, // while循环语句
  WithStatement: 1, // with语句
  AssignmentPattern: 1, // 解构赋值语句
  // ExportAllDeclaration: 1, // 从另一个模块导出所有的导出内容
  // ExportDefaultDeclaration: 1, // 默认导出
  // ExportNamedDeclaration: 1, // 具名导出
  ForOfStatement: 1, // for...of循环语句
  // ImportDeclaration: 1, // 导入语句
  TaggedTemplateExpression: 1, // ${}模版字符串语句
  YieldExpression: 1 // yield表达式语句，生成器函数（其父节点类型为表达式语句ExpressionStatement，不额外添加1个lloc）
}

// 各节点类型的逻辑行数值映射对象（针对于vue模块）
const SYNTAX_BABYLON_LLOC_MAP_VUE: {
  [key: string]: number;
} = {
  'if': 1,
  'else-if': 1,
  'else': 1,
  'for': 1,
  'show': 1
}


/**
 * 获取目标节点的逻辑行数值
 * @param node 目标节点
 * @param parentNode 目标父级节点
 */
const getSyntaxBabylonLloc = (node: any, parentNode: any) => {
  let lloc = 0
  const { type = '' } = node
  const { type: parentType = '' } = parentNode
  if (type === 'AssignmentExpression') { // 针对于一些多重赋值的情况进行特殊处理：若该节点的父节点为表达式语句，不额外添加1个lloc
    lloc = parentNode && parentType !== 'ExpressionStatement' ? 1 : 0;
  } else if (type === 'CallExpression') { // 针对于嵌套的CallExpression节点（ExpressionStatement提供了1个lloc）和 YieldExpression节点之后的第一个CallExpression，不额外添加1个lloc
    lloc = parentType !== 'ExpressionStatement' && parentType !== 'YieldExpression' ? 1 : 0;
  } else if (type === 'ExpressionStatement') { // 当子表达式是无效/无操作的 ArrowFunctionExpression 时，忽略添加 1 lloc。
    lloc = typeof node?.expression === 'object' && node?.expression?.type !== 'ArrowFunctionExpression' ? 1 : 0;
  } else if (type === 'IfStatement') { // 有else则视为2个lloc，否则视为1个
    lloc = node?.alternate ? 2 : 1;
  } else if (type === 'NewExpression') { // new运算符后跟着的节点类型不为函数表达式FunctionExpression，不额外添加1个lloc
    lloc = node?.callee?.type === 'FunctionExpression' ? 1 : 0;
  } else if (type === 'YieldExpression') { // 父节点类型为表达式语句ExpressionStatement，不额外添加1个lloc
    lloc = parentType !== 'ExpressionStatement' ? 1 : 0;
  } else {
    lloc = SYNTAX_BABYLON_LLOC_MAP[type]
  }

  return lloc || 0
}

/**
 * 获取Vue代码文件中template的逻辑行数
 * @param ast
 */
const getCodellocLineForVueTemplate = (templateChildren: any[]): number => {
  let llocSum = 0
  templateChildren?.forEach((node: any) => {
    const {
      type = '',
      startTag = {
        attributes: []
      },
      children = []
    } = node
    if (type === 'VElement') {
      const VDirectiveAttrArr = startTag?.attributes?.filter((item: any) => item.key.type === 'VDirectiveKey') || []
      VDirectiveAttrArr.forEach((attrItem: any) => {
        llocSum += SYNTAX_BABYLON_LLOC_MAP_VUE[attrItem?.key?.name?.name || ''] || 0
      })
    }
    if (children?.length) {
      llocSum += getCodellocLineForVueTemplate(node?.children);
    }
  });
  return llocSum
}

/**
 * 获取代码文件的逻辑行数
 * @param fileContent 文件内容（或目标代码ast结构）
 * @param fileType 文件类型
 */
const getCodellocline = (fileContent: any = '', fileType: 'js' | 'vue' = 'js'): number => {
  if (!fileContent) return 0
  let llocSum = 0
  if (fileType === 'js') {
    const ast = typeof fileContent === "string" ? parser.parse(fileContent, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators'],
    }) : fileContent
    traverse(ast, {
      enter(path: any) {
        const { node, parent } = path
        llocSum += getSyntaxBabylonLloc(node, parent)
      }
    })
  } else {
    const templateAst = typeof fileContent === "string" ? vueParser(fileContent, {
      sourceType: 'module',
    }) : fileContent
    llocSum = getCodellocLineForVueTemplate(templateAst?.templateBody?.children || [])
  }

  return llocSum || 0
}

export default getCodellocline
