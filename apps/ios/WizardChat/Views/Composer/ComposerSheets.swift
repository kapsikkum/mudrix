import AVFoundation
import CoreLocation
import MapKit
import SwiftUI

struct PollCreatorSheet: View {
    let onSend: (String, [String], Bool) async -> Void
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var question = ""
    @State private var options = ["", ""]
    @State private var disclosed = true
    @State private var sending = false

    private var canSend: Bool {
        !question.trimmingCharacters(in: .whitespaces).isEmpty
            && options.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count >= 2
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(String(localized: "composer.poll.questionLabel")) {
                    TextField("", text: $question, prompt: Text(String(localized: "composer.poll.questionPlaceholder")).foregroundColor(theme.textMuted),
                              axis: .vertical)
                }
                .listRowBackground(theme.groupedRow)
                Section(String(localized: "composer.poll.optionsLabel")) {
                    ForEach(options.indices, id: \.self) { index in
                        HStack {
                            TextField("", text: $options[index],
                                      prompt: Text(L10n.format("composer.option", "\(index + 1)")).foregroundColor(theme.textMuted))
                            if options.count > 2 {
                                Button {
                                    options.remove(at: index)
                                } label: {
                                    Image("ph-minus-circle-regular").foregroundStyle(theme.error)
                                }
                                .buttonStyle(.borderless)
                                .accessibilityLabel(String(localized: "composer.poll.removeOption"))
                            }
                        }
                    }
                    if options.count < 20 {
                        Button {
                            options.append("")
                        } label: {
                            Label(String(localized: "composer.poll.addOption"), image: "ph-plus-circle-regular")
                        }
                    }
                }
                .listRowBackground(theme.groupedRow)
                Section {
                    Picker(String(localized: "composer.poll.kindLabel"), selection: $disclosed) {
                        Text(String(localized: "composer.poll.kindDisclosed")).tag(true)
                        Text(String(localized: "composer.poll.kindUndisclosed")).tag(false)
                    }
                } footer: {
                    Text(disclosed ? String(localized: "composer.poll.kindDisclosedDesc")
                                   : String(localized: "composer.poll.kindUndisclosedDesc"))
                }
                .listRowBackground(theme.groupedRow)
            }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(String(localized: "composer.poll.create"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "composer.poll.send")) {
                        Task {
                            sending = true
                            await onSend(question.trimmingCharacters(in: .whitespaces),
                                         options.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
                                         disclosed)
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!canSend || sending)
                }
            }
        }
        .tint(theme.accent)
    }
}

@MainActor
private final class OneShotLocation: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var coordinate: CLLocationCoordinate2D?
    @Published var error: String?
    @Published var requesting = false
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func request() {
        error = nil
        requesting = true
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways: if self.requesting { manager.requestLocation() }
            case .denied, .restricted:
                self.requesting = false
                self.error = String(localized: "composer.location.permissionDenied")
            default: break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            self.coordinate = locations.last?.coordinate
            self.requesting = false
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.requesting = false
            self.error = String(localized: "composer.location.unavailable")
        }
    }
}

struct LocationShareSheet: View {
    let onSend: (Double, Double, String?) async -> Void
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var location = OneShotLocation()
    @State private var latitude = ""
    @State private var longitude = ""
    @State private var note = ""
    @State private var camera: MapCameraPosition = .userLocation(fallback: .automatic)

    private var coordinate: CLLocationCoordinate2D? {
        guard let lat = Double(latitude), let lon = Double(longitude),
              (-90...90).contains(lat), (-180...180).contains(lon) else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Map(position: $camera) {
                        if let coordinate { Marker("", coordinate: coordinate).tint(theme.accent) }
                    }
                    .frame(height: WZ.Size.callTile)
                    .listRowInsets(EdgeInsets())
                    Button {
                        location.request()
                    } label: {
                        if location.requesting {
                            Label(String(localized: "composer.location.requesting"), image: "ph-navigation-arrow-regular")
                        } else {
                            Label(String(localized: "composer.location.useCurrent"), image: "ph-navigation-arrow-regular")
                        }
                    }
                }
                .listRowBackground(theme.groupedRow)
                Section {
                    TextField(String(localized: "composer.location.latitude"), text: $latitude).keyboardType(.numbersAndPunctuation)
                    TextField(String(localized: "composer.location.longitude"), text: $longitude).keyboardType(.numbersAndPunctuation)
                    TextField("", text: $note, prompt: Text(String(localized: "composer.location.descriptionPlaceholder")).foregroundColor(theme.textMuted))
                } footer: {
                    if let error = location.error { Text(error).foregroundStyle(theme.error) }
                }
                .listRowBackground(theme.groupedRow)
            }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(String(localized: "composer.location.share"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "composer.location.send")) {
                        guard let coordinate else { return }
                        Task {
                            await onSend(coordinate.latitude, coordinate.longitude,
                                         note.trimmingCharacters(in: .whitespaces).isEmpty ? nil : note)
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(coordinate == nil)
                }
            }
            .onChange(of: location.coordinate?.latitude) { _, _ in
                guard let coordinate = location.coordinate else { return }
                latitude = String(format: "%.6f", coordinate.latitude)
                longitude = String(format: "%.6f", coordinate.longitude)
                camera = .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 600, longitudinalMeters: 600))
            }
            .onAppear { location.request() }
        }
        .tint(theme.accent)
    }
}

@MainActor
final class VoiceRecorder: NSObject, ObservableObject {
    enum State: Equatable { case idle, requesting, recording, paused, denied, failed }

    @Published var state = State.idle
    @Published var elapsed: TimeInterval = 0
    @Published var samples: [Float] = []
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private(set) var fileURL: URL?

    func start() async {
        state = .requesting
        guard await AVAudioApplication.requestRecordPermission() else {
            state = .denied
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48_000,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ])
            recorder.isMeteringEnabled = true
            recorder.record()
            self.recorder = recorder
            fileURL = url
            samples = []
            elapsed = 0
            state = .recording
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        } catch {
            state = .failed
        }
    }

    func togglePause() {
        guard let recorder else { return }
        if state == .recording { recorder.pause(); state = .paused } else { recorder.record(); state = .recording }
    }

    func finish() -> (url: URL, duration: TimeInterval, waveform: [Float])? {
        guard let recorder, let fileURL else { return nil }
        let duration = recorder.currentTime > 0 ? recorder.currentTime : elapsed
        recorder.stop()
        reset()
        return (fileURL, duration, WaveformView.resample(samples, to: 100))
    }

    func cancel() {
        recorder?.stop()
        recorder?.deleteRecording()
        reset()
    }

    private func reset() {
        timer?.invalidate()
        timer = nil
        recorder = nil
        state = .idle
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func tick() {
        guard let recorder, state == .recording else { return }
        recorder.updateMeters()
        let power = recorder.averagePower(forChannel: 0)
        samples.append(max(0.05, min(1, pow(10, power / 40))))
        elapsed = recorder.currentTime
    }
}
