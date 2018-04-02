/* globals cappadonna_proxy_t, cv_proxy_add */
const fs = require('fs')
const browserify = require('browserify')
const istanbul = require('browserify-istanbul')
const puppeteer = require('puppeteer')
const bl = require('bl')
const path = require('path')
const tap = require('tap')
const {createHash} = require('crypto')
const test = tap.test

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

const index = path.join(__dirname, 'index.html')

/* istanbul ignore next */
module.exports = (entryPoint, opts = {}) => {
  const browser = puppeteer.launch({args: ['--no-sandbox']})

  const bundle = new Promise((resolve, reject) => {
    var b = browserify()
    /* istanbul ignore else */
    if (global.__coverage__) {
      b.transform(istanbul, opts.istanbul)
    }

    if (opts.require) {
      b.require(entryPoint, opts.require)
    } else {
      b.add(entryPoint)
    }

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

      // we use a file url here so that the default page gets loaded in a secure context.
      // required to test apis like https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
      // http://www.chromium.org/Home/chromium-security/security-faq#TOC-Which-origins-are-secure-

      await page.goto(opts.location || 'file://' + index)

      /* istanbul ignore next */
      page.on('console', msg => console.log(msg.text()))
      /* istanbul ignore next */
      page.on('error', err => { throw err })
      /* istanbul ignore next */
      page.on('pageerror', msg => { throw new Error(`Page Error: ${msg}`) })

      await page.evaluate(() => {
        window.addEventListener('unhandledrejection', event => {
          /* istanbul ignore next */
          let msg = event.reason.stack || event.reason.message
          /* istanbul ignore next */
          console.error('[unhandledrejection]', msg)
        })
      })

      const code = await bundle
      await page.addScriptTag({content: code})

      /* istanbul ignore else */
      if (global.__coverage__) {
        if (!opts.require) {
          await page.evaluate(() => {
            /* istanbul ignore if */
            if (!window.__coverage__) {
              let msg = 'Coverage is enabled but is missing from your bundle.'
              throw new Error(msg)
            }
          })
        } else if (code.indexOf('__coverage__') === -1) {
          throw new Error('Coverage is enabled but is missing from your bundle.')
        }

        const cvobjects = {}
        Object.keys(global.__coverage__).forEach(filename => {
          const hash = createHash('sha1')
          hash.update(filename)
          const key = parseInt(hash.digest('hex').substr(0, 12), 16).toString(36)
          cvobjects[key] = global.__coverage__[filename]
        })
        await page.exposeFunction('cv_proxy_add', async arr => {
          arr = JSON.parse(arr)
          let obj = cvobjects
          while (arr.length > 1) {
            obj = obj[arr.shift()]
          }
          obj[arr.shift()]++
        })
        await page.evaluate(keys => {
          const createProxy = parents => {
            return new Proxy({}, {
              get: (target, name) => 0,
              set: (obj, prop, value) => {
                const arr = parents.concat([prop])
                cv_proxy_add(JSON.stringify(arr))
                return true
              }
            })
          }
          keys.forEach(key => {
            window[`cov_${key}`] = {
              f: createProxy([key, 'f']),
              s: createProxy([key, 's']),
              b: createProxy([key, 'b'])
            }
          })
        }, Object.keys(cvobjects))
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

  _test.tap = tap
  _test.bundle = bundle

  return _test
}
