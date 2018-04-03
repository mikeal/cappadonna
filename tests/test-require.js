const path = require('path')
const cappadonna = require('../')

const opts = {
  ignore: ['**/node_modules/**', '**/bower_components/**', '**/*.json'],
  include: [path.join(__dirname, '..', 'index.js'), '**/tests/**'],
  defaultIgnore: false
}

const aModule = path.join(__dirname, 'module.js')
const test = cappadonna(aModule, {istanbul: opts, require: {expose: 'entry-module'}})

test('can require', async (page, t) => {
  t.plan(1)
  console.log('i planned')
  await page.evaluate(async () => {
    console.log('im in the page')
    t.equals(require('entry-module'), 'pass', 'should be able to require')
    console.log('iasserted and should be done')
  })
})
