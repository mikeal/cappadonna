/* globals capaTest */
const path = require('path')
const cappadonna = require('../')

const opts = {
  ignore: ['**/node_modules/**', '**/bower_components/**', '**/*.json'],
  include: [path.join(__dirname, '..', 'index.js'), '**/tests/**'],
  defaultIgnore: false
}
const components = path.join(__dirname, 'components.js')
const test = cappadonna(components, {istanbul: opts})

test('basics', async (page, t) => {
  t.plan(4)
  t.ok(true)
  t.same('pass', 'pass')
  await page.evaluate(async () => {
    t.ok(true)
    t.same('pass', capaTest())
  })
})

test('appendAndWait', async (page, t) => {
  t.plan(1)
  await page.appendAndWait('<test-me>pass</test-me>', 'test-me')
  await page.evaluate(async () => {
    t.same('pass', document.querySelector('test-me').textContent)
  })
})
