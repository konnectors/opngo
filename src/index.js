process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://92fd2130293f4da18f32443c0e01873a@sentry.cozycloud.cc/94'

const {
  BaseKonnector,
  requestFactory,
  log,
  saveBills,
  errors
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: false,
  json: true,
  // this allows request-promise to keep cookies between requests
  jar: true
})
const format = require('date-fns/format')

module.exports = new BaseKonnector(start)

async function start(fields) {
  await request('https://www.opngo.com')
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  const result = await request(
    'https://now.opngo.com/?page=history&start=01/01/2000&fmt=ajax&language=fr'
  )

  const bills = result.data
    .filter(
      doc => doc.rowType === 'sessionRow' && parseFloat(doc.totalCharge) !== 0
    )
    .map(doc => {
      const date = new Date(Number(doc.stopTime) * 1000)
      const amount = parseFloat(doc.totalCharge)
      return {
        date,
        amount,
        currency: 'EUR',
        vendor: 'OPnGO',
        info: doc.info,
        vehicle: doc.carNo,
        startTime: new Date(Number(doc.startTime) * 1000),
        stopTime: new Date(Number(doc.stopTime) * 1000),
        zoneID: doc.zoneID,
        txID: doc.txID,
        fileurl: 'https://now.opngo.com/AppHTTP.php',
        filename: `OPnGO-${format(date, 'YYYY-MM')}-${String(amount).replace(
          '.',
          ','
        )}€.pdf`,
        requestOptions: {
          method: 'POST',
          form: {
            data: Number(doc.txID),
            format: 'json',
            initWith: 'session',
            language: 'fr',
            operation: 'invoice_check',
            usageMethod: 'Web',
            version: 2.7
          }
        },
        metadata: {
          accountId: this.accountId,
          dateImport: new Date(),
          version: 1
        }
      }
    })

  return saveBills(bills, fields, {
    identifiers: ['opngo']
  })
}

async function authenticate(username, password) {
  const result = await request.post('https://now.opngo.com/AppHTTP.php', {
    form: {
      authToken: password,
      format: 'json',
      language: 'fr',
      operation: 'login_session_begin',
      time: Math.round(Date.now() / 1000),
      usageMethod: 'Web',
      userID: username,
      version: 2.7
    }
  })

  if (result.status !== 1) {
    log('error', result.response.errorInfo)
    throw new Error(errors.LOGIN_FAILED)
  }
}
