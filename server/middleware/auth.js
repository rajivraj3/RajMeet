import jwt from 'jsonwebtoken'

export default function requireAuth(request, response, next) {
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return response.status(401).json({ message: 'Sign in to continue.' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    request.user = { id: payload.sub, name: payload.name }
    return next()
  } catch {
    return response.status(401).json({ message: 'Your session has expired. Please sign in again.' })
  }
}