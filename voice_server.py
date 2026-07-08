#!/usr/bin/env python3
"""
Voice Recognition Server
שרת תימלול קולי בעברית
- קבלת קובץ אודיו מהדפדפן
- תימלול לטקסט בעברית
- החזרת התוצאה ל-JavaScript
"""

import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import speech_recognition as sr
from pathlib import Path

# הגדרת logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# אתחול recognizer
recognizer = sr.Recognizer()

@app.route('/health', methods=['GET'])
def health():
    """בדיקת בריאות השרת"""
    return jsonify({'status': 'ok', 'service': 'voice-recognition'})

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    """
    נקודת עיגול - קבלת אודיו ותימלול
    
    Body: FormData עם קובץ 'audio' (WAV/OGG/WebM)
    Response: JSON עם transcript וstatus
    """
    try:
        # בדיקת שקיים קובץ
        if 'audio' not in request.files:
            return jsonify({
                'status': 'error',
                'error': 'no-audio',
                'message': 'לא הועלה קובץ אודיו'
            }), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({
                'status': 'error',
                'error': 'empty-file',
                'message': 'קובץ ריק'
            }), 400
        
        # קריאת הקובץ כ-AudioData
        try:
            audio_data = sr.AudioData(
                frame_data=audio_file.read(),
                sample_rate=16000,
                sample_width=2
            )
        except Exception as e:
            logger.error(f"Error reading audio: {e}")
            return jsonify({
                'status': 'error',
                'error': 'invalid-audio',
                'message': 'קובץ אודיו לא תקין'
            }), 400
        
        # תימלול בעברית
        try:
            logger.info("Recognizing Hebrew speech...")
            transcript = recognizer.recognize_google(
                audio_data,
                language='he-IL'
            )
            
            return jsonify({
                'status': 'success',
                'transcript': transcript,
                'language': 'he-IL'
            })
            
        except sr.UnknownValueError:
            logger.warning("Could not understand audio")
            return jsonify({
                'status': 'error',
                'error': 'no-speech',
                'message': 'לא הבנתי את הקול. נסה שוב בקול ברור יותר.'
            }), 400
            
        except sr.RequestError as e:
            logger.error(f"Google Speech API error: {e}")
            return jsonify({
                'status': 'error',
                'error': 'network',
                'message': f'בעיה בשרת התימלול: {str(e)}'
            }), 503
        
    except Exception as e:
        logger.error(f"Unexpected error in transcribe: {e}")
        return jsonify({
            'status': 'error',
            'error': 'unknown',
            'message': f'שגיאה לא צפויה: {str(e)}'
        }), 500

@app.route('/api/transcribe-base64', methods=['POST'])
def transcribe_base64():
    """
    תימלול ממחרוזת Base64 בתוך JSON
    משמש כחלופה כאשר FormData לא יעבד
    
    Body JSON:
    {
        "audio": "base64-encoded-audio-data",
        "format": "wav" (optional, default: wav)
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'audio' not in data:
            return jsonify({
                'status': 'error',
                'error': 'no-audio',
                'message': 'לא הועלה קובץ אודיו'
            }), 400
        
        # המרה מ-Base64
        import base64
        try:
            audio_bytes = base64.b64decode(data['audio'])
        except Exception as e:
            logger.error(f"Base64 decode error: {e}")
            return jsonify({
                'status': 'error',
                'error': 'invalid-encoding',
                'message': 'קידוד Base64 לא תקין'
            }), 400
        
        # יצירת AudioData
        try:
            audio_data = sr.AudioData(
                frame_data=audio_bytes,
                sample_rate=16000,
                sample_width=2
            )
        except Exception as e:
            logger.error(f"Error creating audio data: {e}")
            return jsonify({
                'status': 'error',
                'error': 'invalid-audio',
                'message': 'קובץ אודיו לא תקין'
            }), 400
        
        # תימלול
        try:
            logger.info("Recognizing Hebrew speech from Base64...")
            transcript = recognizer.recognize_google(
                audio_data,
                language='he-IL'
            )
            
            return jsonify({
                'status': 'success',
                'transcript': transcript,
                'language': 'he-IL'
            })
            
        except sr.UnknownValueError:
            logger.warning("Could not understand audio")
            return jsonify({
                'status': 'error',
                'error': 'no-speech',
                'message': 'לא הבנתי את הקול. נסה שוב בקול ברור יותר.'
            }), 400
            
        except sr.RequestError as e:
            logger.error(f"Google Speech API error: {e}")
            return jsonify({
                'status': 'error',
                'error': 'network',
                'message': f'בעיה בשרת התימלול'
            }), 503
        
    except Exception as e:
        logger.error(f"Unexpected error in transcribe_base64: {e}")
        return jsonify({
            'status': 'error',
            'error': 'unknown',
            'message': f'שגיאה לא צפויה'
        }), 500

if __name__ == '__main__':
    # הפעלה ב-development
    port = int(os.getenv('PORT', 5000))
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.getenv('FLASK_ENV') == 'development'
    )
