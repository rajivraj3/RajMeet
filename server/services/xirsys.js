const XIRSYS_BASE_URL = 'https://global.xirsys.net/_turn/'

export async function fetchXirsysIceServers({ ident, secret, channel }, fetchImpl = fetch) {
  if (!ident || !secret || !channel) {
    throw new Error('Xirsys is not configured.')
  }

  const url = new URL(`${XIRSYS_BASE_URL}${encodeURIComponent(channel)}`)
  url.searchParams.set('webrtc', '1')
  url.searchParams.set('expire', '60')

  const authorization = Buffer.from(`${ident}:${secret}`).toString('base64')
  const response = await fetchImpl(url, {
    method: 'PUT',
    headers: { Authorization: `Basic ${authorization}` },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) throw new Error(`Xirsys returned HTTP ${response.status}.`)

  const result = await response.json()
  const iceServers = result?.v?.iceServers
  if (!Array.isArray(iceServers) || iceServers.length === 0) {
    throw new Error('Xirsys returned no ICE servers.')
  }

  return iceServers
}