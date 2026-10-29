import io
import wave
import unittest
import av

class DecoderCompatibilityTests(unittest.TestCase):
    def test_decoder_accepts_the_faster_whisper_metadata_api(self):
        recording = io.BytesIO()
        with wave.open(recording, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b'\0\0' * 1600)
        recording.seek(0)
        with av.open(recording, mode='r', metadata_errors='ignore') as decoded:
            samples = sum(frame.samples for frame in decoded.decode(audio=0))
        self.assertEqual(samples, 1600)

if __name__ == '__main__':
    unittest.main()
