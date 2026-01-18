import { RealtimeVision } from '@overshoot/sdk'
 
const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'ovs_05cc66b47852ff919396f9507ba190b0',
  prompt: 'explain the scene in detail',
  onResult: (result) => {
    console.log(result.result)
  }
})
 
await vision.start()   // starts the camera and begins processing
await vision.stop()    // stops everything