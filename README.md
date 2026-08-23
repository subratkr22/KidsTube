# KidsTube

KidsTube is a small local-only video library for children. It gives a familiar YouTube-style browsing and playback experience, but every video is served from a folder on your own Windows computer.

## What V1 does

- Scans an approved local video folder recursively.
- Shows a responsive video grid with search and categories.
- Uses subfolders as categories automatically.
- Streams videos with browser seeking/range requests.
- Saves playback position in the browser for Continue Watching.
- Shows suggested local videos on the watch page.
- Supports random play.
- Supports optional local thumbnails.
- Uses no database, cloud service, YouTube API, analytics, CDN, or external JavaScript.

## Requirements

- Windows 10/11
- .NET 8 SDK
- A modern browser such as Microsoft Edge or Chrome

MP4 encoded with H.264 video and AAC audio is the most compatible browser format. WebM is also supported. MOV/M4V playback depends on the codecs inside the file.

## Quick start

1. Create this folder:

   `D:\KidsVideos`

2. Copy your approved videos into it.

   Example:

   ```text
   D:\KidsVideos\
   ├── Learning\
   │   ├── ABC.mp4
   │   └── Numbers.mp4
   ├── Cartoons\
   │   ├── Cartoon 01.mp4
   │   └── Cartoon 02.mp4
   └── Stories\
       └── Jungle Story.mp4
   ```

3. Clone this repository.

4. From the repository folder, either double-click `run-kidstube.bat` or run:

   ```powershell
   dotnet run
   ```

5. Open `http://127.0.0.1:5050` if the browser does not open automatically.

## Thumbnails

A thumbnail is optional. Put an image next to the video with the same file name.

```text
ABC.mp4
ABC.jpg
```

Supported thumbnail extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`.

If no matching image exists, KidsTube displays a built-in placeholder.

## Change the video folder

Edit `appsettings.json`:

```json
"VideoLibrary": {
  "Path": "D:\\KidsVideos"
}
```

You can also override the folder without editing the project by setting the environment variable `KIDSTUBE_VIDEO_PATH`.

## Privacy and child safety

KidsTube itself only binds to `127.0.0.1`, so the web server is accessible from the same computer only.

The application does not contact YouTube or any other internet service. However, KidsTube is not an operating-system parental-control product: a child could still leave the browser tab and use other applications or websites if the Windows account permits it. For a locked-down child setup, combine KidsTube with a restricted Windows account, browser kiosk/full-screen mode, and appropriate network/parental controls.

## Repository note

Do not commit your video library to GitHub. Keep the actual media files in `D:\KidsVideos` or another local folder.
