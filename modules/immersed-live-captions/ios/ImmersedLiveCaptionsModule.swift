import ExpoModulesCore
import ReplayKit
import Speech

public final class ImmersedLiveCaptionsModule: Module {
  private let recorder = RPScreenRecorder.shared()
  private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var currentVideo: String?
  private var startTime = 0.0
  private var generation = 0

  public func definition() -> ModuleDefinition {
    Name("ImmersedLiveCaptions")
    Events("onCaption", "onState")

    AsyncFunction("available") { () -> Bool in
      self.recorder.isAvailable && (self.recognizer?.supportsOnDeviceRecognition ?? false)
    }

    AsyncFunction("start") { (videoId: String, videoTime: Double, promise: Promise) in
      guard videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else {
        promise.reject("INVALID_VIDEO", "Invalid video ID")
        return
      }
      guard self.recorder.isAvailable, let recognizer = self.recognizer, recognizer.supportsOnDeviceRecognition else {
        promise.reject("ON_DEVICE_UNAVAILABLE", "On-device Japanese recognition or app-audio capture is unavailable")
        return
      }
      if self.currentVideo == videoId && self.recorder.isRecording {
        promise.resolve(true)
        return
      }
      self.stopCurrent()
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          guard status == .authorized else {
            promise.reject("SPEECH_PERMISSION", "Speech recognition permission was not granted")
            return
          }
          let input = SFSpeechAudioBufferRecognitionRequest()
          input.requiresOnDeviceRecognition = true
          input.shouldReportPartialResults = true
          input.addsPunctuation = true
          self.generation += 1
          let thisGeneration = self.generation
          self.currentVideo = videoId
          self.startTime = max(0, videoTime)
          self.request = input
          self.task = recognizer.recognitionTask(with: input) { result, error in
            guard thisGeneration == self.generation, self.currentVideo == videoId else { return }
            if let result = result {
              let segments = result.bestTranscription.segments
              let cues: [[String: Any]] = segments.compactMap { segment in
                let text = segment.substring.trimmingCharacters(in: .whitespacesAndNewlines)
                if text.isEmpty { return nil }
                return ["text": text, "start": self.startTime + segment.timestamp,
                        "end": self.startTime + segment.timestamp + max(0.1, segment.duration)]
              }
              DispatchQueue.main.async {
                self.sendEvent("onCaption", ["videoId": videoId, "cues": cues, "final": result.isFinal])
              }
            }
            if let error = error {
              DispatchQueue.main.async { self.sendEvent("onState", ["videoId": videoId, "error": error.localizedDescription]) }
            }
          }
          self.recorder.startCapture(handler: { buffer, kind, error in
            guard thisGeneration == self.generation, self.currentVideo == videoId else { return }
            if kind == .audioApp && error == nil { input.appendAudioSampleBuffer(buffer) }
          }, completionHandler: { error in
            DispatchQueue.main.async {
              if let error = error {
                self.stopCurrent()
                promise.reject("CAPTURE_FAILED", error.localizedDescription)
              } else {
                promise.resolve(true)
              }
            }
          })
        }
      }
    }

    AsyncFunction("stop") { (videoId: String) in
      if self.currentVideo == videoId { self.stopCurrent() }
    }

    OnDestroy { self.stopCurrent() }
  }

  private func stopCurrent() {
    generation += 1
    request?.endAudio()
    task?.cancel()
    request = nil
    task = nil
    currentVideo = nil
    if recorder.isRecording { recorder.stopCapture { _ in } }
  }
}
