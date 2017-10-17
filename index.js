/* globals cappadonna_proxy_t */
const fs = require('fs')
const browserify = require('browserify')
const istanbul = require('browserify-istanbul')
const puppeteer = require('puppeteer')
const bl = require('bl')
const path = require('path')
const {test} = require('tap')

const COVERAGE_FOLDER = path.join(process.cwd(), '.nyc_output')

/* istanbul ignore if */
if (global.__coverage__ && !fs.existsSync(COVERAGE_FOLDER)) {
  throw new Error('Coverage is enabled by {cwd}/.nyc_output does not exist')
}

const outputCoverage = (page) => {
  return new Promise(async (resolve, reject) => {
    const dumpCoverage = (payload) => {
      const cov = JSON.parse(payload)
      fs.writeFileSync(
        path.resolve(COVERAGE_FOLDER, `${Date.now()}.json`),
        JSON.stringify(cov, null, 2),
        'utf8'
      )
      return resolve()
    }
    await page.exposeFunction('dumpCoverage', (payload) => {
      dumpCoverage(payload)
    })
    await page.evaluate(async () => {
      dumpCoverage(JSON.stringify(window.__coverage__))
    })
  })
}

const index = `
<!DOCTYPE html>
  <head>
    <meta charset="UTF-8">
  </head>
  <body>
  </body>
</html>
`

/* istanbul ignore next */
module.exports = (entryPoint, opts = {}) => {
  const browser = puppeteer.launch()

  const bundle = new Promise((resolve, reject) => {
    var b = browserify()
    /* istanbul ignore else */
    if (global.__coverage__) {
      b.transform(istanbul, opts.istanbul)
    }
    b.add(entryPoint)
    b.bundle().pipe(bl((err, buff) => {
      /* istanbul ignore next */
      if (err) return reject(err)
      resolve(buff.toString())
    }))
  })

  let testCounter = 0

  let _test = (name, fn) => {
    testCounter++
    return test(name, async t => {
      const _browser = await browser
      const page = await _browser.newPage()
      await page.setContent(index)

      /* istanbul ignore next */
      page.on('console', msg => console.log(msg.text))
      /* istanbul ignore next */
      page.on('error', err => { throw err })
      /* istanbul ignore next */
      page.on('pageerror', msg => { throw new Error(`Page Error: ${msg}`) })

      await page.addScriptTag({content: await bundle})

      /* istanbul ignore else */
      if (global.__coverage__) {
        await page.evaluate(() => {
          /* istanbul ignore if */
          if (!window.__coverage__) {
            let msg = 'Coverage is enabled but is missing from your bundle.'
            throw new Error(msg)
          }
        })
      }

      await page.exposeFunction('cappadonna_proxy_t', async args => {
        args = JSON.parse(args)
        let key = args.shift()
        return t[key](...args)
      })
      await page.evaluate(() => {
        window._t_promises = []
        let handler = {
          get: (target, prop) => {
            return (...args) => {
              args = [prop].concat(args)
              let p = cappadonna_proxy_t(JSON.stringify(args))
              window._t_promises.push(p)
              return p
            }
          }
        }
        window.t = new Proxy({}, handler)
      })

      page.appendAndWait = async (inner, selector) => {
        await page.evaluate(inner => {
          document.body.innerHTML += inner
        }, inner)
        await page.waitFor(selector)
        return true
      }

      await fn(page, t, _browser)

      await page.evaluate(async () => {
        await Promise.all(window._t_promises)
      })

      /* istanbul ignore else */
      if (global.__coverage__) {
        await outputCoverage(page)
      }

      await page.close()
      testCounter--
      if (testCounter === 0) {
        _browser.close()
      }
    })
  }

  return _test
}