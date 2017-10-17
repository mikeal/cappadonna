# Cappadonna

Headless browser testing for tap with coverage reporting.

Cappadonna merges several tools together for integrated testing.

* [tap](http://www.node-tap.org/): as the base test framework.
* [puppetter](https://github.com/GoogleChrome/puppeteer): for headless browser access (Chrome).
* [browserify](http://browserify.org/): for bundling.
* [nyc/istanbul](https://istanbul.js.org/): for test coverage.

Example:

```javascript
const path = require('path')
const cappadonna = require('cappadonna')
const test = cappadonna(path.join(__dirname, 'bundle-entry-point.js'))

test('basic test', async (page, t) => {
  /* we get a new webpage object with our bundle loaded for every test */
  
  t.plan(1)
  let str = '<test-element>pass</test-element>'
  
  /* append string to document.body and wait for the selector to succeed */
  await page.appendAndWait(str, 'test-element')
  
  /* execute the given function in the browser */
  await page.evaluate(() => {
    t.same('pass', document.querySelector('test-element').textContent)
  })
})
```
```
$ tap tests/test-*.js --coverage
```

When coverage is enabled all code, including what gets bundled and sent to the browser, will be instrumented and included in coverage.

The `test` function and `t` variable are part of [tap](http://www.node-tap.org) and document [here](http://www.node-tap.org/asserts/).

The `page` object is part of [puppeteer](https://github.com/GoogleChrome/puppeteer) and documented [here](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page).

## page.appendAndWait(htmlString, selector)

Appends the htmlString to the page's body and waits for the selector to
return true.
