const {walk} = require('../dist/index');

walk('./test_react/src', {
  onlyAllowZh: true,
  zhPreNum: 3,
}).then(res => {
  console.info(res)
})
