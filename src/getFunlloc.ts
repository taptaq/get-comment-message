const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const getCodellocLine = require('./getCodellocLine').default

declare interface FunllocItemType {
  name?: string;
  lloc?: number;
  line?: {
    start: number;
    end: number;
  };
  code?: string;
}

/**
 * 获取各函数的逻辑函数
 * @param code 目标代码
 * @param fnLineThreshold 函数逻辑行数的阈值
 * @returns 函数逻辑行数的结构数组（函数名，逻辑行数，位置）
 */
const getFunlloc = (code: string, fnLineThreshold = 15): Promise<FunllocItemType[]> => {
  return new Promise((resolve, reject) => {
    try {
      const funllocArr: FunllocItemType[] = []
      // 使用 Babel 解析代码为 AST
      const ast = parser.parse(code, {
        sourceType: "module",
        attachComment: true,
        plugins: ["jsx", "typescript", "decorators"]
      });
      // 遍历 AST 提取函数信息
      traverse(ast, {
        // 匹配函数声明
        FunctionDeclaration(path: any) {
          const {loc: {
            start: { line: startLine = 0 } = {},
            end: { line: endLine = 0 } = {}
          } = {}} = path?.node || {}
          const newProgramAst = t.program([
            path?.node
          ]);
          const targetCode = generate(newProgramAst).code;
          const lloc = getCodellocLine(targetCode);
          if (lloc >= fnLineThreshold) {
            funllocArr.push({
              name: path?.node?.id?.name || 'Anonymous',
              lloc,
              line: {
                start: startLine,
                end: endLine
              },
              code: targetCode
            })
          }
        },
    
        // 匹配函数表达式（包括立即执行函数）
        FunctionExpression(path: any) {
          let fnName = "Anonymous"
    
          const {loc: {
            start: { line: startLine = 0 } = {},
            end: { line: endLine = 0 } = {}
          } = {}} = path?.node || {}
    
          const { leadingComments = [] } = path?.parentPath?.parentPath?.node || {}
    
          // 如果函数有名字 (具名函数表达式)
          if (path?.node?.id) {
            fnName = path?.node?.id?.name;
          }
          // 匿名函数表达式，通过变量名获取函数名
          else {
            if (t.isVariableDeclarator(path?.parent)) {
              fnName = path?.parent?.id?.name;
            } else if (t.isObjectProperty(path.parent)) {
              fnName = path?.parent?.key?.name;
            }
          }
    
          // 包装成完整可解析的ast
          const variableDeclaration = t.variableDeclaration("const", [
            t.variableDeclarator(t.identifier(fnName || "Anonymous"), path?.node)
          ]);
          const newProgramAst = t.program([
            variableDeclaration
          ]);
          newProgramAst.leadingComments = leadingComments
          const targetCode = generate(newProgramAst, {}, '').code
          const lloc = getCodellocLine(targetCode);
          if (lloc >= fnLineThreshold) {
            funllocArr.push({
              name: fnName,
              lloc: lloc - 1, // 函数表达式在计算逻辑行数时会把自身方法定义时的变量语句也加入计算，因此要减1
              line: {
                start: startLine,
                end: endLine
              },
              code: targetCode
            })
          }
        },
    
        // 匹配箭头函数表达式
        ArrowFunctionExpression(path: any) {
          let fnName = "Anonymous";
    
          const {loc: {
            start: { line: startLine = 0 } = {},
            end: { line: endLine = 0 } = {}
          } = {}} = path?.node || {}
    
          const { leadingComments = [] } = path?.parentPath?.parentPath?.node || {}
    
          if (!t.isBlockStatement(path?.node?.body)) {
            // 创建一个新的 ReturnStatement，包含原来的表达式
            const returnStatement = t.returnStatement(path?.node?.body);
            // 将箭头函数的 body 替换为 BlockStatement，并加入 return 语句
            path.node.body = t.blockStatement([returnStatement]);
          }
    
          // 处理箭头函数赋值给变量的情况
          if (t.isVariableDeclarator(path?.parent)) {
            fnName = path?.parent?.id?.name; // 变量名
          }
    
          // 处理箭头函数作为对象属性的情况
          if (t.isObjectProperty(path?.parent)) {
            fnName = path?.parent?.key?.name; // 对象属性名
          }
          const lloc = getCodellocLine(path.toString());
          const variableDeclaration = t.variableDeclaration("const", [
            t.variableDeclarator(t.identifier(fnName || "Anonymous"), path?.node)
          ]);
          const newProgramAst = t.program([
            variableDeclaration
          ]);
          newProgramAst.leadingComments = leadingComments
          if (lloc >= fnLineThreshold) {
            funllocArr.push({
              name: fnName,
              lloc,
              line: {
                start: startLine,
                end: endLine
              },
              code: generate(newProgramAst).code
            })
          }
        },
    
        // 匹配类中的方法
        ClassMethod(path: any) {
          const {loc: {
            start: { line: startLine = 0 } = {},
            end: { line: endLine = 0 } = {}
          } = {}} = path?.node || {}
    
          // 包装成完整可解析的ast
          const classBody = t.classBody([path?.node]);
          const classDeclaration = t.classDeclaration(
            t.identifier("MyClass"),
            null,
            classBody
          );
          const newProgramAst = t.program([classDeclaration]);
          const targetCode = generate(newProgramAst, {}, '').code
          const lloc = getCodellocLine(targetCode);
          if (lloc >= fnLineThreshold) {
            funllocArr.push({
              name: path?.node?.key?.name || 'Anonymous',
              lloc,
              line: {
                start: startLine,
                end: endLine
              },
              code: targetCode
            })
          }
        }
      });
      resolve(funllocArr || [])
    } catch (error) {
      reject(error)
    }
  })
}

exports.default = getFunlloc
