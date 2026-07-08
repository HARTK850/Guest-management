#!/usr/bin/env python3
"""
transcribe.py - תמלול שמע עברי דרך speech_recognition
מקבל נתיב לקובץ WAV כארגומנט ומחזיר JSON לסטדאאוט.

שימוש:
    python transcribe.py <path_to_wav>

פלט:
    {"ok": true, "text": "..."} 
    {"ok": false, "error": "..."}
"""

import sys
import json
import os

def transcribe(wav_path: str) -> dict:
    try:
        import speech_recognition as sr
    except ImportError:
        return {"ok": False, "error": "speech_recognition not installed. Run: pip install SpeechRecognition"}

    if not os.path.isfile(wav_path):
        return {"ok": False, "error": f"File not found: {wav_path}"}

    r = sr.Recognizer()

    try:
        with sr.AudioFile(wav_path) as source:
            audio = r.record(source)
    except Exception as e:
        return {"ok": False, "error": f"Could not read audio file: {e}"}

    # ניסיון 1: Google Speech Recognition (חינמי, דורש אינטרנט)
    try:
        text = r.recognize_google(audio, language="he-IL")
        return {"ok": True, "text": text, "engine": "google"}
    except sr.UnknownValueError:
        return {"ok": False, "error": "no_speech"}
    except sr.RequestError:
        pass  # אין אינטרנט - ננסה Sphinx

    # ניסיון 2: CMU Sphinx (לוקלי, לא תומך עברית טוב אבל לא תלוי רשת)
    try:
        text = r.recognize_sphinx(audio)
        return {"ok": True, "text": text, "engine": "sphinx"}
    except Exception:
        pass

    # ניסיון 3: Whisper (לוקלי, תומך עברית מצוין - דורש pip install openai-whisper)
    try:
        import whisper
        model = whisper.load_model("small")
        result = model.transcribe(wav_path, language="he")
        return {"ok": True, "text": result["text"].strip(), "engine": "whisper"}
    except ImportError:
        pass
    except Exception as e:
        return {"ok": False, "error": f"Whisper error: {e}"}

    return {"ok": False, "error": "network_unavailable"}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: transcribe.py <wav_path>"}))
        sys.exit(1)

    wav_path = sys.argv[1]
    result = transcribe(wav_path)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("ok") else 1)
