package com.cindermic.audio;

import android.Manifest;
import android.content.pm.PackageManager;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgePlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
    name = "CindermicAudio",
    permissions = @Permission(
        strings = {Manifest.permission.RECORD_AUDIO},
        description = "Use your microphone to capture audio in Cindermic."
    )
)
public class CindermicAudioPlugin extends BridgePlugin {

    private AudioCapture capture;
    private static final AtomicInteger SEQUENCE_COUNTER = new AtomicInteger(0);

    public static int getNextSequence() {
        return SEQUENCE_COUNTER.getAndIncrement();
    }

    @Override
    public void handleOnDestroy() {
        disconnectAudio();
    }

    private boolean hasMicrophonePermission() {
        return ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private void notifyListenersAsync(byte[] pcm, float level) {
        bridge.getWindow().post(() -> {
            JSObject result = new JSObject();
            result.put("pcm", pcm);
            result.put("level", level);
            notifyListeners("onSamples", result);
        });
    }

    private void createPacketAndSend(byte[] pcm) {
        int rate = 48000;
        int packetSize = 12 + pcm.length;
        java.nio.ByteBuffer packet = java.nio.ByteBuffer.allocate(packetSize);
        packet.order(java.nio.ByteOrder.LITTLE_ENDIAN);

        packet.putInt(0x434e4431);
        packet.putInt(getNextSequence());
        packet.putInt(rate);
        packet.put(pcm);

        byte[] binaryPacket = packet.array();
        notifyListenersAsync(binaryPacket, 0);
    }

    @PluginMethod
    public void startAudio(PluginCall call) {
        if (!hasMicrophonePermission()) {
            requestMicrophonePermission(call);
            return;
        }

        try {
            if (capture != null && capture.isRunning()) {
                call.resolve();
                return;
            }

            capture = new AudioCapture();
            capture.setOnSamplesListener((pcm, level) -> {
                createPacketAndSend(pcm);
                JSObject result = new JSObject();
                result.put("level", level);
                notifyListeners("onVolume", result);
            });

            capture.start();
            call.resolve();
        } catch (Exception e) {
            Log.e("CindermicAudio", "Failed to start audio", e);
            call.reject("Failed to start audio: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopAudio(PluginCall call) {
        try {
            if (capture != null) {
                capture.deactivate();
                capture = null;
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void disconnectAudio(PluginCall call) {
        try {
            if (capture != null) {
                capture.deactivate();
                capture = null;
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = hasMicrophonePermission();
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasMicrophonePermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        pendingCall = call;
        String permission = Manifest.permission.RECORD_AUDIO;

        if (ActivityCompat.checkSelfPermission(getContext(), permission)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{permission},
                1001
            );
        }
    }

    private PluginCall pendingCall;

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (pendingCall != null && requestCode == 1001) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;

            if (granted) {
                try {
                    if (capture == null) {
                        capture = new AudioCapture();
                        capture.setOnSamplesListener((pcm, level) -> {
                            createPacketAndSend(pcm);
                            JSObject result = new JSObject();
                            result.put("level", level);
                            notifyListeners("onVolume", result);
                        });
                    }
                    capture.start();
                    pendingCall.resolve();
                } catch (Exception e) {
                    pendingCall.reject("Failed to start audio", e);
                }
            } else {
                pendingCall.reject("Microphone permission denied", null);
            }
            pendingCall = null;
        }
    }
}