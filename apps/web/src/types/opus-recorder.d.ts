declare module 'opus-recorder' {
  export interface RecorderConfig {
    bufferLength?: number;
    encoderPath?: string;
    mediaTrackConstraints?: boolean | MediaTrackConstraints;
    monitorGain?: number;
    numberOfChannels?: number;
    recordingGain?: number;
    sourceNode?: MediaStreamAudioSourceNode;
    encoderApplication?: number;
    encoderBitRate?: number;
    encoderComplexity?: number;
    encoderFrameSize?: number;
    encoderSampleRate?: number;
    maxFramesPerPage?: number;
    originalSampleRateOverride?: number;
    resampleQuality?: number;
    streamPages?: boolean;
  }

  export default class Recorder {
    constructor(config?: RecorderConfig);
    static isRecordingSupported(): boolean;
    static version: string;
    encodedSamplePosition: number;
    ondataavailable: (data: ArrayBuffer) => void;
    onstart: () => void;
    onstop: () => void;
    onpause: () => void;
    onresume: () => void;
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(flush?: boolean): void | Promise<void>;
    resume(): void;
    close(): Promise<void>;
    setRecordingGain(gain: number): void;
    setMonitorGain(gain: number): void;
  }
}
