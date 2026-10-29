import { Socket } from 'socket.io-client';

interface PeerConnectionMap {
  [peerId: string]: RTCPeerConnection;
}

export class WebRTCVoiceManager {
  private socket: Socket;
  private localStream: MediaStream | null = null;
  private peerConnections: PeerConnectionMap = {};
  private remoteAudios: Record<string, HTMLAudioElement> = {};
  private makingOffer: Record<string, boolean> = {};
  private ignoreOffer: Record<string, boolean> = {};
  private pendingCandidates: Record<string, RTCIceCandidateInit[]> = {};
  private allowedPeerIds: string[] = [];
  private myPlayerId: string = '';
  private isChannelEnabled: boolean = false;
  private isMuted: boolean = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  public onSpeakingChanged?: (isSpeaking: boolean) => void;
  public onMicStatusChanged?: (hasMic: boolean, isMuted: boolean) => void;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupSocketListeners();
    this.setupUserGestureUnlock();
  }

  public setMyPlayerId(id: string) {
    this.myPlayerId = id;
  }

  /**
   * Unlock any blocked autoplay audio on user interaction
   */
  private setupUserGestureUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      Object.values(this.remoteAudios).forEach((audio) => {
        if (audio.paused && audio.srcObject) {
          audio.play().catch(() => {});
        }
      });
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private setupSocketListeners() {
    this.socket.on(
      'webrtc_signal',
      async ({ senderPeerId, signalData }: { senderPeerId: string; signalData: any }) => {
        if (!senderPeerId || !signalData) return;

      // Only accept if channel is enabled and peer is allowed
      if (!this.isChannelEnabled || !this.allowedPeerIds.includes(senderPeerId)) {
        return;
      }

      let pc = this.peerConnections[senderPeerId];
      if (!pc) {
        pc = this.createPeerConnection(senderPeerId);
      }

      try {
        const description = signalData.description || (signalData.type ? signalData : null);
        const candidate = signalData.candidate;

        if (description) {
          // Polite peer pattern: peer with alphabetically smaller socket ID yields in glare
          const polite = this.myPlayerId < senderPeerId;
          const offerCollision =
            description.type === 'offer' &&
            (this.makingOffer[senderPeerId] || pc.signalingState !== 'stable');

          this.ignoreOffer[senderPeerId] = !polite && offerCollision;
          if (this.ignoreOffer[senderPeerId]) {
            return;
          }

          if (offerCollision) {
            try {
              await pc.setLocalDescription({ type: 'rollback' });
            } catch (rbErr) {
              console.warn('WebRTC rollback notice:', rbErr);
            }
          }

          await pc.setRemoteDescription(description);

          // Drain queued ICE candidates
          if (this.pendingCandidates[senderPeerId]) {
            for (const cand of this.pendingCandidates[senderPeerId]) {
              try {
                await pc.addIceCandidate(cand);
              } catch (candErr) {
                console.warn('ICE candidate drain notice:', candErr);
              }
            }
            delete this.pendingCandidates[senderPeerId];
          }

          if (description.type === 'offer') {
            await pc.setLocalDescription();
            this.socket.emit('webrtc_signal', {
              targetPeerId: senderPeerId,
              signalData: { description: pc.localDescription },
            });
          }
        } else if (candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (err) {
              if (!this.ignoreOffer[senderPeerId]) {
                console.warn('ICE candidate notice:', err);
              }
            }
          } else {
            if (!this.pendingCandidates[senderPeerId]) {
              this.pendingCandidates[senderPeerId] = [];
            }
            this.pendingCandidates[senderPeerId].push(candidate);
          }
        }
      } catch (err) {
        console.warn('WebRTC signal handling notice:', err);
      }
    });
  }

  public async initMicrophone(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported in this browser.');
        this.onMicStatusChanged?.(false, true);
        return false;
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Update tracks on all currently established peer connections
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMuted;
        Object.entries(this.peerConnections).forEach(([peerId, pc]) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
          if (sender) {
            sender.replaceTrack(audioTrack);
          } else {
            pc.addTrack(audioTrack, this.localStream!);
          }
        });
      }

      this.setupAudioAnalysis(this.localStream);
      this.onMicStatusChanged?.(true, this.isMuted);
      return true;
    } catch (err) {
      console.warn('Microphone permission notice:', err);
      this.onMicStatusChanged?.(false, true);
      return false;
    }
  }

  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let wasSpeaking = false;
      let lastSpokeTime = 0;

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const now = Date.now();

        if (average > 16) {
          lastSpokeTime = now;
        }

        const isSpeakingNow =
          !this.isMuted &&
          this.isChannelEnabled &&
          (average > 16 || now - lastSpokeTime < 350);

        if (isSpeakingNow !== wasSpeaking) {
          wasSpeaking = isSpeakingNow;
          this.onSpeakingChanged?.(isSpeakingNow);
          this.socket.emit('speaking_state', { isSpeaking: isSpeakingNow });
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio analysis setup notice:', e);
    }
  }

  public updateChannelState(enabled: boolean, allowedPeerIds: string[], myPlayerId: string) {
    this.myPlayerId = myPlayerId;
    this.isChannelEnabled = enabled && allowedPeerIds.includes(myPlayerId);
    this.allowedPeerIds = allowedPeerIds.filter((id) => id !== myPlayerId);

    // If channel is disabled for me, close active peer connections and clean audio
    if (!this.isChannelEnabled) {
      this.closeAllConnections();
      return;
    }

    // Connect to each authorized peer
    this.allowedPeerIds.forEach((peerId) => {
      if (!this.peerConnections[peerId]) {
        // Initiator: deterministic based on ID order
        if (myPlayerId > peerId) {
          this.initiateConnection(peerId);
        }
      }
    });

    // Close any connections that are no longer allowed
    Object.keys(this.peerConnections).forEach((peerId) => {
      if (!this.allowedPeerIds.includes(peerId)) {
        this.closePeer(peerId);
      }
    });
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    if (this.localStream && this.localStream.getAudioTracks().length > 0) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      // Ensure audio receiver is created in SDP offer/answer even before mic is turned on
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch {}
    }

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer[peerId] = true;
        await pc.setLocalDescription();
        this.socket.emit('webrtc_signal', {
          targetPeerId: peerId,
          signalData: { description: pc.localDescription },
        });
      } catch (err) {
        console.warn('Negotiation error for peer:', peerId, err);
      } finally {
        this.makingOffer[peerId] = false;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc_signal', {
          targetPeerId: peerId,
          signalData: { candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      let audio = this.remoteAudios[peerId];
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `webrtc-audio-${peerId}`;
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.remoteAudios[peerId] = audio;
      }
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      audio.play().catch(() => {});
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        // Attempt ICE restart if needed
        pc.restartIce?.();
      }
    };

    this.peerConnections[peerId] = pc;
    return pc;
  }

  private async initiateConnection(peerId: string) {
    const pc = this.peerConnections[peerId] || this.createPeerConnection(peerId);
    if (pc.signalingState === 'stable' && !this.makingOffer[peerId]) {
      try {
        this.makingOffer[peerId] = true;
        await pc.setLocalDescription();
        this.socket.emit('webrtc_signal', {
          targetPeerId: peerId,
          signalData: { description: pc.localDescription },
        });
      } catch (err) {
        console.warn('Error creating WebRTC offer:', err);
      } finally {
        this.makingOffer[peerId] = false;
      }
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
    this.onMicStatusChanged?.(!!this.localStream, this.isMuted);
    return this.isMuted;
  }

  public setMicEnabled(enabled: boolean) {
    this.isMuted = !enabled;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
    this.onMicStatusChanged?.(!!this.localStream, this.isMuted);
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  private closePeer(peerId: string) {
    if (this.peerConnections[peerId]) {
      try {
        this.peerConnections[peerId].close();
      } catch {}
      delete this.peerConnections[peerId];
    }
    if (this.remoteAudios[peerId]) {
      try {
        this.remoteAudios[peerId].pause();
        this.remoteAudios[peerId].srcObject = null;
        this.remoteAudios[peerId].remove();
      } catch {}
      delete this.remoteAudios[peerId];
    }
    delete this.makingOffer[peerId];
    delete this.ignoreOffer[peerId];
    delete this.pendingCandidates[peerId];
  }

  public closeAllConnections() {
    Object.keys(this.peerConnections).forEach((peerId) => {
      this.closePeer(peerId);
    });
    this.peerConnections = {};
    this.remoteAudios = {};
  }

  public cleanup() {
    this.isChannelEnabled = false;
    this.isMuted = true;
    this.closeAllConnections();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch (e) {
          console.warn('Track stop notice:', e);
        }
      });
      this.localStream = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close().catch(() => {});
        }
      } catch {}
      this.audioContext = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {}
      this.analyser = null;
    }

    this.onMicStatusChanged?.(false, true);
    this.onSpeakingChanged?.(false);
    try {
      this.socket.emit('speaking_state', { isSpeaking: false });
    } catch {}
  }
}

/**
 * Global WebRTC cleanup helper to ensure no microphone stream remains active
 * in the background when leaving, disconnecting, or changing rooms.
 */
let activeVoiceManager: WebRTCVoiceManager | null = null;

export function registerActiveVoiceManager(manager: WebRTCVoiceManager | null): void {
  activeVoiceManager = manager;
}

export function cleanupWebRTC(instance?: WebRTCVoiceManager | null): void {
  const target = instance || activeVoiceManager;
  if (target) {
    try {
      target.cleanup();
    } catch (err) {
      console.warn('WebRTC cleanup error:', err);
    }
  }

  // Strictly remove all remote and orphan WebRTC audio elements from the DOM
  if (typeof document !== 'undefined') {
    const audios = document.querySelectorAll<HTMLAudioElement>('audio[id^="webrtc-audio-"]');
    audios.forEach((audio) => {
      try {
        audio.pause();
        if (audio.srcObject instanceof MediaStream) {
          audio.srcObject.getTracks().forEach((t) => {
            try {
              t.enabled = false;
              t.stop();
            } catch {}
          });
        }
        audio.srcObject = null;
        audio.remove();
      } catch {}
    });
  }
}
