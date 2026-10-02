import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchXirsysIceServers } from './xirsys.js'

test('requests temporary Xirsys ICE servers with server-side Basic auth', async () => {
  const iceServers = [{ urls: ['turn:relay.example.test'], username: 'temporary', credential: 'temporary' }]
  let requestedUrl
  let requestedOptions

  const result = await fetchXirsysIceServers({
    ident: 'test-ident',
    secret: 'test-secret',
    channel: 'rajmeet',
  }, async (url, options) => {
    requestedUrl = url.toString()
    requestedOptions = options
    return { ok: true, json: async () => ({ v: { iceServers } }) }
  })

  assert.equal(requestedUrl, 'https://global.xirsys.net/_turn/rajmeet?webrtc=1&expire=60')
  assert.equal(requestedOptions.method, 'PUT')
  assert.equal(requestedOptions.headers.Authorization, `Basic ${Buffer.from('test-ident:test-secret').toString('base64')}`)
  assert.deepEqual(result, iceServers)
})

test('does not call Xirsys when credentials are missing', async () => {
  let called = false
  await assert.rejects(
    fetchXirsysIceServers({ ident: '', secret: '', channel: '' }, async () => { called = true }),
    /Xirsys is not configured/,
  )
  assert.equal(called, false)
})

test('rejects unsuccessful or malformed Xirsys responses', async () => {
  const config = { ident: 'test-ident', secret: 'test-secret', channel: 'rajmeet' }
  await assert.rejects(
    fetchXirsysIceServers(config, async () => ({ ok: false, status: 403 })),
    /HTTP 403/,
  )
  await assert.rejects(
    fetchXirsysIceServers(config, async () => ({ ok: true, json: async () => ({ v: {} }) })),
    /no ICE servers/,
  )
})