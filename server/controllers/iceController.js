import { fetchXirsysIceServers } from '../services/xirsys.js'

export async function getIceConfig(request, response) {
  try {
    const iceServers = await fetchXirsysIceServers({
      ident: process.env.XIRSYS_IDENT,
      secret: process.env.XIRSYS_SECRET,
      channel: process.env.XIRSYS_CHANNEL,
    })
    return response.json({ iceServers })
  } catch (error) {
    console.error('Xirsys ICE configuration failed:', error.name)
    const status = error.message === 'Xirsys is not configured.' ? 503 : 502
    return response.status(status).json({
      message: status === 503
        ? 'The meeting relay service is not configured.'
        : 'The meeting relay service is temporarily unavailable.',
    })
  }
}