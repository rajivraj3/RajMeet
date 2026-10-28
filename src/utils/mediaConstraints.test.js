import assert from 'node:assert/strict'
import test from 'node:test'
import { getMediaConstraints } from './mediaConstraints.js'

test('uses bounded video constraints and browser audio processing', () => {
  assert.deepEqual(getMediaConstraints(true, true), {
    video: {
      width: { ideal: 640, max: 640 },
      height: { ideal: 360, max: 360 },
      frameRate: { ideal: 24, max: 30 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
})

test('can request only the enabled device', () => {
  assert.deepEqual(getMediaConstraints(false, true), {
    video: false,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  assert.deepEqual(getMediaConstraints(true, false), {
    video: {
      width: { ideal: 640, max: 640 },
      height: { ideal: 360, max: 360 },
      frameRate: { ideal: 24, max: 30 },
    },
    audio: false,
  })
})
