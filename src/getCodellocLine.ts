const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default

// 各节点类型的逻辑行数值映射对象
const SYNTAX_BABYLON_LLOC_MAP: {
  [key: string]: number;
} = {
  Directive: 1,
  ObjectMethod: 1,
  ObjectProperty: 1,
  BreakStatement: 1,
  AssignmentExpression: 1, // parent && parent.type !== 'ExpressionStatement' ? 1 : 0;
  CallExpression: 1, // parent.type !== 'ExpressionStatement' && parent.type !== 'YieldExpression' ? 1 : 0;
  CatchClause: 1,
  ContinueStatement: 1,
  DoWhileStatement: 2,
  ExpressionStatement: 1, // typeof node.expression === 'object' && node.expression.type !== 'ArrowFunctionExpression' ? 1 : 0;
  ForInStatement: 1,
  ForStatement: 1,
  IfStatement: 1, // node.alternate ? 2 : 1;
  NewExpression: 1, // node.callee.type === 'FunctionExpression' ? 1 : 0;
  Property: 1,
  ReturnStatement: 1,
  SwitchCase: 1,
  SwitchStatement: 1,
  ThrowStatement: 1,
  TryStatement: 1,
  VariableDeclarator: 1,
  WhileStatement: 1,
  WithStatement: 1,
  AssignmentPattern: 1,
  // ExportAllDeclaration: 1, // 可选择是否当作一个逻辑行数
  // ExportDefaultDeclaration: 1, // 可选择是否当作一个逻辑行数
  // ExportNamedDeclaration: 1, // 可选择是否当作一个逻辑行数
  ForOfStatement: 1,
  // ImportDeclaration: 1, // 可选择是否当作一个逻辑行数
  TaggedTemplateExpression: 1, // ${}模版字符串
  YieldExpression: 1 // parent.type !== 'ExpressionStatement' ? 1 : 0;
}

/**
 * 获取目标节点的逻辑行数值
 * @param node 目标节点
 * @param parentNode 目标父级节点
 */
const getSyntaxBabylonLloc = (node: any, parentNode: any) => {
  // const exportConfigurationNode = ['ExportAllDeclaration', 'ExportDefaultDeclaration', 'ExportNamedDeclaration', 'ImportDeclaration']
  // const { esmImportExport = false, templateExpression = false } = options || {}
  let lloc = 0
  const { type = '' } = node
  const { type: parentType = '' } = parentNode
  if (type === 'AssignmentExpression') {
    lloc = parentNode && parentType !== 'ExpressionStatement' ? 1 : 0;
  } else if (type === 'CallExpression') {
    lloc = parentType !== 'ExpressionStatement' && parentType !== 'YieldExpression' ? 1 : 0;
  } else if (type === 'ExpressionStatement') {
    lloc = typeof node?.expression === 'object' && node?.expression?.type !== 'ArrowFunctionExpression' ? 1 : 0;
  } else if (type === 'IfStatement') {
    lloc = node?.alternate ? 2 : 1;
  } else if (type === 'NewExpression') {
    lloc = node?.callee?.type === 'FunctionExpression' ? 1 : 0;
  } else if (type === 'YieldExpression') {
    lloc = parentType !== 'ExpressionStatement' ? 1 : 0;
  } else {
    lloc = SYNTAX_BABYLON_LLOC_MAP[type]
  }

  return lloc || 0
}

/**
 * 获取代码文件的逻辑行数
 * @param fileContent 文件内容
 */
const getCodellocline = (fileContent: string): number => {
  const ast = parser.parse(fileContent, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  })
  let llocSum = 0
  traverse(ast, {
    enter(path: any) {
      const { node, parent } = path
      llocSum += getSyntaxBabylonLloc(node, parent)
    }
  })
  return llocSum
}

export default getCodellocline
