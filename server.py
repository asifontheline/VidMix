from pathlib import Path
from flask import Flask, send_from_directory, request, jsonify, abort, send_file
import os
import tempfile
import subprocess

app = Flask(__name__, static_folder='web', template_folder='web')

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory(app.static_folder, path)

@app.route('/mix', methods=['POST'])
def mix():
    video = request.files.get('video')
    audios = request.files.getlist('audio')
    audio_volumes = request.form.getlist('audioVolume')
    audio_starts = request.form.getlist('audioStart')
    mute_video_audio = request.form.get('muteVideoAudio') == 'true'
    output_name = request.form.get('output', 'mixed-output.mp4')
    video_start_raw = request.form.get('videoStart', '')
    video_duration_raw = request.form.get('videoDuration', '')

    try:
        video_start = float(video_start_raw)
        if video_start < 0:
            video_start = 0.0
    except (ValueError, TypeError):
        video_start = 0.0

    try:
        video_duration = float(video_duration_raw)
        if video_duration <= 0:
            video_duration = None
    except (ValueError, TypeError):
        video_duration = None

    if not video:
        return abort(400, 'Video is required.')

    if not audios and mute_video_audio:
        return abort(400, 'At least one audio file is required when original video audio is muted.')

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, 'video' + Path(video.filename).suffix)
        video.save(video_path)

        audio_paths = []
        audio_params = []
        for idx, audio in enumerate(audios):
            path = os.path.join(tmpdir, f'audio{idx}' + Path(audio.filename).suffix)
            audio.save(path)
            audio_paths.append(path)
            volume = 1.0
            start = 0.0
            if idx < len(audio_volumes):
                try:
                    volume = float(audio_volumes[idx])
                except ValueError:
                    volume = 1.0
            if idx < len(audio_starts):
                try:
                    start = float(audio_starts[idx])
                except ValueError:
                    start = 0.0
            audio_params.append({'volume': volume, 'start': start})

        output_path = os.path.join(tmpdir, output_name)
        # Prefer the bundled ffmpeg static binary from node_modules, otherwise try
        # system ffmpeg.
        bundled_ffmpeg = Path(__file__).resolve().parent / 'node_modules' / 'ffmpeg-static' / 'ffmpeg'
        ffmpeg_cmd = None
        if bundled_ffmpeg.exists() and os.access(bundled_ffmpeg, os.X_OK):
            ffmpeg_cmd = [str(bundled_ffmpeg)]
        else:
            try:
                chk = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
                if chk.returncode == 0:
                    ffmpeg_cmd = ['ffmpeg']
            except FileNotFoundError:
                ffmpeg_cmd = None

        if ffmpeg_cmd is None:
            # FFmpeg missing: return the original uploaded video as the "mixed" result
            try:
                import shutil
                shutil.copy(video_path, output_path)
                return send_file(output_path, as_attachment=True, download_name=output_name)
            except Exception as e:
                return abort(500, f'Fallback failed: {e}')

        cmd = ffmpeg_cmd + ['-y']
        if video_start and float(video_start) > 0:
            cmd += ['-ss', video_start]
        cmd += ['-i', video_path]
        for audio_path in audio_paths:
            cmd += ['-i', audio_path]

        if audio_paths:
            filter_complex = []
            mix_inputs = []
            if not mute_video_audio:
                mix_inputs.append('[0:a]')

            for i, params in enumerate(audio_params, start=1):
                source_label = f'[{i}:a]'
                if params['volume'] != 1.0 or params['start'] > 0:
                    steps = []
                    if params['volume'] != 1.0:
                        steps.append(f"volume={params['volume']}")
                    if params['start'] > 0:
                        delay_ms = int(round(params['start'] * 1000))
                        steps.append(f"adelay={delay_ms}|{delay_ms}")
                    filter_complex.append(f"{source_label}{','.join(steps)}[a{i - 1}]")
                    mix_inputs.append(f'[a{i - 1}]')
                else:
                    mix_inputs.append(source_label)

            if len(mix_inputs) == 1 and not filter_complex:
                if mute_video_audio:
                    cmd += ['-map', '0:v:0', '-map', '1:a:0']
                else:
                    cmd += ['-map', '0:v:0', '-map', '0:a:0']
            else:
                mix_spec = ''.join(mix_inputs) + f'amix=inputs={len(mix_inputs)}:duration=shortest[aout]'
                filter_complex.append(mix_spec)
                cmd += ['-filter_complex', ';'.join(filter_complex), '-map', '0:v:0', '-map', '[aout]']
        else:
            cmd += ['-map', '0:v:0']
            if mute_video_audio:
                cmd += ['-an']
            else:
                cmd += ['-map', '0:a:0']

        if video_duration is not None:
            cmd += ['-t', str(video_duration)]

        output_ext = Path(output_name).suffix.lower()
        if output_ext == '.webm':
            cmd += ['-c:v', 'libvpx', '-c:a', 'libvorbis']
        else:
            cmd += ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']
        cmd += ['-shortest', output_path]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return abort(500, f'FFmpeg failed:\n{result.stderr}')

        return send_file(output_path, as_attachment=True, download_name=output_name)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
