# YouTube — Offline Local Library

This is a private/local YouTube-style video library designed to play only videos from an approved folder on your own Windows computer. It does not connect to YouTube, use the YouTube API, show internet videos, ads, recommendations, or external content.

## Current local video folder

`D:\Dev\KidsTube\KidsTube\Cartoons`

Subfolders inside `Cartoons` automatically appear as categories.

## Requirements

- Windows 10/11
- .NET 8 SDK
- Microsoft Edge or Chrome

MP4 encoded with H.264 video and AAC audio is the most compatible browser format. WebM is also supported. MOV/M4V playback depends on the codecs inside the file.

## Run

From the repository folder:

```powershell
dotnet run --project YouTube.csproj
```

Or double-click:

`run-youtube.bat`

Then open:

`http://127.0.0.1:5050`

## Features

- YouTube-style desktop layout and watch page
- Local-only video library
- Recursive folder scanning
- Folder-based categories
- Search
- Random playback
- Continue watching / playback position
- Suggested local videos
- Browser seeking/range streaming
- Browser compatibility conversion for MKV files with DTS/AC3 audio
- Optional local thumbnails
- Separate audio files in the same folder (`.aac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.wav`)
- No database
- No cloud service
- No YouTube API
- No CDN or external JavaScript

## Thumbnails

Put an image next to a video with the same file name:

```text
ABC.mp4
ABC.jpg
```

Supported thumbnail extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.

## Separate audio tracks

Keep a separate sound file in the same folder as its video. Use the same filename stem when possible:

```text
Movie.mkv
Movie.aac
```

If the names differ, KidsTube uses the only supported audio file in that folder. The audio track is kept out of the video list and synchronized with playback, seeking, pause, volume, and mute controls.

Recognized audio extensions are `.aac`, `.ac3`, `.dts`, `.eac3`, `.flac`, `.m4a`, `.mka`, `.mp3`, `.oga`, `.ogg`, `.opus`, and `.wav`. Browser playback is most reliable with AAC, M4A, MP3, Opus, or WAV.

For MKV videos, the Docker deployment uses FFmpeg to create a cached MP4 copy with AAC audio. VLC is not required in the browser, and no browser codec extension is needed.

## Change the video folder

Edit `appsettings.json`:

```json
"VideoLibrary": {
  "Path": "D:\\Dev\\KidsTube\\KidsTube\\Cartoons"
}
```

## Privacy

The server binds only to `127.0.0.1`, so it is accessible only from the same computer. The media files stay local and should not be committed to GitHub.

This project recreates a familiar YouTube-style local browsing experience with its own implementation; it is not affiliated with or endorsed by YouTube or Google.
