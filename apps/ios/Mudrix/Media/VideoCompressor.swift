import AVFoundation
import CoreMedia
import Foundation

/// Re-encodes a video to H.264 and AAC in an MP4 for `VideoPlan`'s plan: the short side scaled to the
/// plan's height (rotation applied, even sizes), the plan's bitrate, at most 30 frames a second, a
/// keyframe every 2 seconds, and the moov atom first (`shouldOptimizeForNetworkUse`) so it plays while
/// it downloads. The sound is always decoded and encoded again as AAC at 128 kbit/s.
///
/// Cancelling the calling task stops the work and removes the partial file.
enum VideoCompressor {
    struct Failure: Error, LocalizedError {
        let reason: String
        var errorDescription: String? { reason }
    }

    /// Writes the compressed video to `destination` and returns its size in bytes. `progress` gets 0...1
    /// from a background queue.
    static func compress(source: URL, plan: CompressPlan, to destination: URL,
                         progress: @escaping @Sendable (Double) -> Void) async throws -> Int64 {
        try? FileManager.default.removeItem(at: destination)
        let job = Job()
        do {
            try await withTaskCancellationHandler {
                try await run(source: source, plan: plan, destination: destination, job: job, progress: progress)
            } onCancel: {
                job.cancel()
            }
        } catch {
            try? FileManager.default.removeItem(at: destination)
            if job.isCancelled || Task.isCancelled { throw CancellationError() }
            throw error
        }
        let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        guard size > 0 else { throw Failure(reason: "The compressed video is empty") }
        return Int64(size)
    }

    /// The reader and writer of one run, so cancelling can stop both from another thread
    private final class Job: @unchecked Sendable {
        private let lock = NSLock()
        private var reader: AVAssetReader?
        private var writer: AVAssetWriter?
        private var cancelled = false

        var isCancelled: Bool {
            lock.lock()
            defer { lock.unlock() }
            return cancelled
        }

        func attach(reader: AVAssetReader, writer: AVAssetWriter) {
            lock.lock()
            self.reader = reader
            self.writer = writer
            let alreadyCancelled = cancelled
            lock.unlock()
            if alreadyCancelled { stop(reader: reader, writer: writer) }
        }

        func cancel() {
            lock.lock()
            cancelled = true
            let reader = self.reader
            let writer = self.writer
            lock.unlock()
            if let reader, let writer { stop(reader: reader, writer: writer) }
        }

        private func stop(reader: AVAssetReader, writer: AVAssetWriter) {
            if reader.status == .reading { reader.cancelReading() }
            if writer.status == .writing { writer.cancelWriting() }
        }
    }

    /// Feeds one writer input from one reader output until the output runs dry
    private final class Pump: @unchecked Sendable {
        private let queue: DispatchQueue
        private let writer: AVAssetWriter
        private let input: AVAssetWriterInput
        private let output: AVAssetReaderOutput
        private let onSample: (CMSampleBuffer) -> Void
        private var finished = false

        init(label: String, writer: AVAssetWriter, input: AVAssetWriterInput, output: AVAssetReaderOutput,
             onSample: @escaping (CMSampleBuffer) -> Void) {
            self.queue = DispatchQueue(label: label)
            self.writer = writer
            self.input = input
            self.output = output
            self.onSample = onSample
        }

        func start(completion: @escaping @Sendable () -> Void) {
            input.requestMediaDataWhenReady(on: queue) { [self] in
                if finished { return }
                while input.isReadyForMoreMediaData {
                    guard writer.status == .writing, let sample = output.copyNextSampleBuffer() else {
                        finish(completion)
                        return
                    }
                    onSample(sample)
                    if !input.append(sample) {
                        finish(completion)
                        return
                    }
                }
            }
        }

        private func finish(_ completion: @Sendable () -> Void) {
            if finished { return }
            finished = true
            if writer.status == .writing { input.markAsFinished() }
            completion()
        }
    }

    private static func run(source: URL, plan: CompressPlan, destination: URL, job: Job,
                            progress: @escaping @Sendable (Double) -> Void) async throws {
        let asset = AVURLAsset(url: source)
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw Failure(reason: "There is no video track")
        }
        let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
        let natural = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(.preferredTransform)
        let nominalRate = try await videoTrack.load(.nominalFrameRate)
        let duration = try await asset.load(.duration)
        let totalSeconds = max(duration.seconds, 0.001)

        // The picture as it is shown, after the rotation the file asks for
        let shown = CGRect(origin: .zero, size: natural).applying(transform)
        let shownWidth = abs(shown.width)
        let shownHeight = abs(shown.height)
        guard shownWidth >= 1, shownHeight >= 1 else { throw Failure(reason: "The video has no size") }
        let size = VideoPlan.scaledSize(width: Int(shownWidth.rounded()), height: Int(shownHeight.rounded()),
                                        shortSideTarget: plan.height)
        let frameRate = nominalRate > 0 ? min(Double(nominalRate), Double(VideoPlan.maxFrameRate))
                                        : Double(VideoPlan.maxFrameRate)

        // The composition turns the picture upright, scales it and sets the frame rate
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        let scale = CGAffineTransform(scaleX: CGFloat(size.width) / shownWidth, y: CGFloat(size.height) / shownHeight)
        layer.setTransform(transform.concatenating(scale), at: .zero)
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
        instruction.layerInstructions = [layer]
        let composition = AVMutableVideoComposition()
        composition.instructions = [instruction]
        composition.renderSize = CGSize(width: size.width, height: size.height)
        composition.frameDuration = CMTime(value: 1000, timescale: CMTimeScale((frameRate * 1000).rounded()))

        let reader = try AVAssetReader(asset: asset)
        let videoOutput = AVAssetReaderVideoCompositionOutput(
            videoTracks: [videoTrack],
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        videoOutput.videoComposition = composition
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw Failure(reason: "The video cannot be read") }
        reader.add(videoOutput)

        var audioOutput: AVAssetReaderTrackOutput?
        if let audioTrack {
            let pcm: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 2,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
            ]
            let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: pcm)
            output.alwaysCopiesSampleData = false
            if reader.canAdd(output) {
                reader.add(output)
                audioOutput = output
            }
        }

        let writer = try AVAssetWriter(outputURL: destination, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true
        let compression: [String: Any] = [
            AVVideoAverageBitRateKey: Int(plan.videoBitrate),
            AVVideoMaxKeyFrameIntervalDurationKey: 2,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoExpectedSourceFrameRateKey: Int(frameRate.rounded()),
        ]
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: size.width,
            AVVideoHeightKey: size.height,
            AVVideoCompressionPropertiesKey: compression,
        ]
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(videoInput) else { throw Failure(reason: "The video cannot be written") }
        writer.add(videoInput)

        var audioInput: AVAssetWriterInput?
        if audioOutput != nil {
            let aac: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: Int(VideoPlan.audioBitrate),
            ]
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: aac)
            input.expectsMediaDataInRealTime = false
            if writer.canAdd(input) {
                writer.add(input)
                audioInput = input
            }
        }

        job.attach(reader: reader, writer: writer)
        guard writer.startWriting() else { throw writer.error ?? Failure(reason: "The video cannot be written") }
        guard reader.startReading() else { throw reader.error ?? Failure(reason: "The video cannot be read") }
        writer.startSession(atSourceTime: .zero)

        let group = DispatchGroup()
        let lastReported = ProgressMark()
        let videoPump = Pump(label: "video-compress.video", writer: writer, input: videoInput, output: videoOutput) { sample in
            let fraction = CMSampleBufferGetPresentationTimeStamp(sample).seconds / totalSeconds
            if let value = lastReported.next(min(max(fraction, 0), 1)) { progress(value) }
        }
        group.enter()
        videoPump.start { group.leave() }

        var audioPump: Pump?
        if let audioInput, let audioOutput {
            let pump = Pump(label: "video-compress.audio", writer: writer, input: audioInput, output: audioOutput) { _ in }
            group.enter()
            pump.start { group.leave() }
            audioPump = pump
        }

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            group.notify(queue: DispatchQueue.global()) { continuation.resume() }
        }
        withExtendedLifetime((videoPump, audioPump)) {}

        if job.isCancelled { throw CancellationError() }
        if reader.status == .failed { throw reader.error ?? Failure(reason: "The video cannot be read") }
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? Failure(reason: "The video cannot be written") }
        progress(1)
    }

    /// Passes on a progress value only when it moved by at least 1%
    private final class ProgressMark: @unchecked Sendable {
        private var last = -1.0

        func next(_ value: Double) -> Double? {
            if value - last < 0.01 { return nil }
            last = value
            return value
        }
    }
}
