package com.cindermic.audio;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AudioCapture {
    public interface OnSamplesListener {
        void onSamples(byte[] pcm, float level);
    }

    private OnSamplesListener onSamples;
    private AudioRecord audioRecord;
    private ExecutorService sampleQueue;
    private volatile boolean running = false;
    private short[] pending = new short[0];

    private static final int SAMPLE_RATE = 48000;
    private static final int BUFFER_SIZE = 960;

    public void setOnSamplesListener(OnSamplesListener listener) {
        this.onSamples = listener;
    }

    public boolean isRunning() {
        return running;
    }

    public void start() throws Exception {
        if (running) return;
        stop();

        int minBufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );

        if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            throw new Exception("No usable microphone input is available.");
        }

        int bufferSize = Math.max(minBufferSize, BUFFER_SIZE * 2);
        audioRecord = new AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        );

        running = true;
        sampleQueue = Executors.newSingleThreadExecutor();
        pending = new short[0];

        audioRecord.startRecording();

        new Thread(() -> {
            byte[] buffer = new byte[BUFFER_SIZE * 2];
            while (running) {
                int read = audioRecord.read(buffer, 0, buffer.length);
                if (read > 0) {
                    processAudio(buffer, read);
                }
            }
        }).start();
    }

    private void processAudio(byte[] data, int length) {
        int samples = length / 2;
        short[] pcm16 = new short[samples];

        float energy = 0;
        ByteBuffer bb = ByteBuffer.wrap(data);
        bb.order(ByteOrder.LITTLE_ENDIAN);

        for (int i = 0; i < samples; i++) {
            short sample = bb.getShort(i * 2);
            pcm16[i] = sample;
            energy += sample * sample;
        }

        float level = (float) Math.sqrt(energy / samples);

        byte[] pcm = new byte[samples * 2];
        ByteBuffer pcmBuffer = ByteBuffer.wrap(pcm);
        pcmBuffer.order(ByteOrder.LITTLE_ENDIAN);
        for (short s : pcm16) {
            pcmBuffer.putShort(s);
        }

        // Create packet with magic number and metadata
        byte[] packet = createPacket(pcm, level);

        final byte[] finalPacket = packet;
        final float finalLevel = level;

        if (sampleQueue != null) {
            sampleQueue.execute(() -> {
                if (onSamples != null) {
                    onSamples.onSamples(finalPacket, finalLevel);
                }
            });
        }
    }

    private byte[] createPacket(byte[] pcm, float level) {
        int packetSize = 12 + pcm.length;
        ByteBuffer packet = ByteBuffer.allocate(packetSize);
        packet.order(ByteOrder.LITTLE_ENDIAN);

        // Magic number: 0x434e4431 ("CND1" in ASCII, little-endian)
        packet.putInt(0x434e4431);
        packet.putInt(CindermicAudioPlugin.getNextSequence());
        packet.putInt(SAMPLE_RATE);
        packet.put(pcm);

        return packet.array();
    }

    public void stop() {
        running = false;
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) {
                // Ignore
            }
            audioRecord = null;
        }
        if (sampleQueue != null) {
            sampleQueue.shutdownNow();
            sampleQueue = null;
        }
    }

    public void deactivate() {
        stop();
    }
}