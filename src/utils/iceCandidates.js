export async function addOrQueueIceCandidate(socketId, candidate, peerRefs, pendingIceRef) {
  const peer = peerRefs.current.get(socketId)
  if (!peer || !peer.remoteDescription) {
    const pending = pendingIceRef.current.get(socketId) || []
    pending.push(candidate)
    pendingIceRef.current.set(socketId, pending)
    return false
  }

  await peer.addIceCandidate(candidate)
  return true
}

export async function flushPendingIceCandidates(socketId, peer, pendingIceRef) {
  const candidates = pendingIceRef.current.get(socketId) || []
  pendingIceRef.current.delete(socketId)
  for (const candidate of candidates) await peer.addIceCandidate(candidate)
  return candidates.length
}