const videoConstraints = {
  width: { ideal: 640, max: 640 },
  height: { ideal: 360, max: 360 },
  frameRate: { ideal: 24, max: 30 },
}

export function getMediaConstraints(video, audio) {
  return {
    video: video ? videoConstraints : false,
    audio: audio ? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } : false,
  }
}
