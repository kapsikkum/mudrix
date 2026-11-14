import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

export class GainProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'mudrix-gain';
  processedTrack?: MediaStreamTrack;
  private gain: number;
  private source?: MediaStreamAudioSourceNode;
  private node?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;

  constructor(gain: number) {
    this.gain = gain;
  }

  async init({ track, audioContext }: AudioProcessorOptions): Promise<void> {
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.node = audioContext.createGain();
    this.node.gain.value = this.gain;
    this.destination = audioContext.createMediaStreamDestination();
    this.source.connect(this.node).connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
    if (audioContext.state === 'suspended') await audioContext.resume();
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(options);
  }

  async destroy(): Promise<void> {
    this.source?.disconnect();
    this.node?.disconnect();
    this.processedTrack?.stop();
    this.source = undefined;
    this.node = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;
  }

  setGain(gain: number): void {
    this.gain = gain;
    if (this.node) this.node.gain.value = gain;
  }
}
