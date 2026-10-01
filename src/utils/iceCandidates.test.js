import assert from 'node:assert/strict'
import test from 'node:test'
import { addOrQueueIceCandidate, flushPendingIceCandidates } from './iceCandidates.js'

function createPeer(remoteDescription = null) {
  return {
    remoteDescription,
    addedCandidates: [],
    async addIceCandidate(candidate) { this.addedCandidates.push(candidate) },
  }
}

test('candidate arriving before an offer is queued and applied after remote SDP', async () => {
  const peer = createPeer()
  const peerRefs = { current: new Map([['participant-a', peer]]) }
  const pendingIceRef = { current: new Map() }
  const candidate = { candidate: 'candidate-a', sdpMid: '0', sdpMLineIndex: 0 }

  assert.equal(await addOrQueueIceCandidate('participant-a', candidate, peerRefs, pendingIceRef), false)
  assert.deepEqual(peer.addedCandidates, [])

  peer.remoteDescription = { type: 'offer' }
  assert.equal(await flushPendingIceCandidates('participant-a', peer, pendingIceRef), 1)
  assert.deepEqual(peer.addedCandidates, [candidate])
  assert.equal(pendingIceRef.current.has('participant-a'), false)
})

test('candidates are isolated by participant and can arrive before peer creation', async () => {
  const peerA = createPeer()
  const peerB = createPeer({ type: 'answer' })
  const peerRefs = { current: new Map([['participant-b', peerB]]) }
  const pendingIceRef = { current: new Map() }
  const candidateA = { candidate: 'candidate-a', sdpMid: '0', sdpMLineIndex: 0 }
  const candidateB = { candidate: 'candidate-b', sdpMid: '0', sdpMLineIndex: 0 }

  assert.equal(await addOrQueueIceCandidate('participant-a', candidateA, peerRefs, pendingIceRef), false)
  assert.equal(await addOrQueueIceCandidate('participant-b', candidateB, peerRefs, pendingIceRef), true)
  assert.deepEqual(peerB.addedCandidates, [candidateB])

  peerRefs.current.set('participant-a', peerA)
  peerA.remoteDescription = { type: 'offer' }
  assert.equal(await flushPendingIceCandidates('participant-a', peerA, pendingIceRef), 1)
  assert.deepEqual(peerA.addedCandidates, [candidateA])
  assert.deepEqual(peerB.addedCandidates, [candidateB])
})