using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Diagnostics;
using Microsoft.AspNetCore.StaticFiles;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls(builder.Configuration["Server:Url"] ?? "http://127.0.0.1:5050");
builder.Services.AddSingleton<VideoLibrary>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/config", (VideoLibrary library) =>
{
    var videos = library.GetVideos();
    return Results.Ok(new
    {
        libraryPath = library.RootPath,
        libraryExists = Directory.Exists(library.RootPath),
        videoCount = videos.Count
    });
});

app.MapGet("/api/videos", (string? q, string? category, VideoLibrary library) =>
{
    IEnumerable<VideoItem> videos = library.GetVideos();

    if (!string.IsNullOrWhiteSpace(q))
    {
        videos = videos.Where(v =>
            v.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            v.Category.Contains(q, StringComparison.OrdinalIgnoreCase));
    }

    if (!string.IsNullOrWhiteSpace(category) && !category.Equals("All", StringComparison.OrdinalIgnoreCase))
    {
        videos = videos.Where(v => v.Category.Equals(category, StringComparison.OrdinalIgnoreCase));
    }

    return Results.Ok(videos.Select(library.ToDto));
});

app.MapGet("/api/videos/{id}", (string id, VideoLibrary library) =>
{
    var video = library.Find(id);
    return video is null ? Results.NotFound() : Results.Ok(library.ToDto(video));
});

app.MapGet("/api/videos/{id}/stream", async (string id, VideoLibrary library) =>
{
    var video = library.Find(id);
    if (video is null || !File.Exists(video.FullPath))
        return Results.NotFound();

    var streamPath = await library.GetBrowserStreamAsync(video);
    if (streamPath is null || !File.Exists(streamPath))
        return Results.Problem("The video could not be prepared for browser playback.");

    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(streamPath, out var contentType))
        contentType = "application/octet-stream";

    return Results.File(
        streamPath,
        contentType,
        lastModified: File.GetLastWriteTimeUtc(streamPath),
        enableRangeProcessing: true);
});

app.MapGet("/api/videos/{id}/audio", (string id, VideoLibrary library) =>
{
    var video = library.Find(id);
    var audioPath = video is null ? null : library.FindAudio(video);
    if (audioPath is null || !File.Exists(audioPath))
        return Results.NotFound();

    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(audioPath, out var contentType))
        contentType = "application/octet-stream";

    return Results.File(
        audioPath,
        contentType,
        lastModified: File.GetLastWriteTimeUtc(audioPath),
        enableRangeProcessing: true);
});

app.MapGet("/api/videos/{id}/thumbnail", (string id, VideoLibrary library) =>
{
    var video = library.Find(id);
    if (video is null)
        return Results.NotFound();

    var thumbnail = library.FindThumbnail(video);
    if (thumbnail is null)
        return Results.NotFound();

    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(thumbnail, out var contentType))
        contentType = "image/jpeg";

    return Results.File(thumbnail, contentType, enableRangeProcessing: false);
});

app.MapPost("/api/videos/{id}/thumbnail", async (string id, HttpRequest request, VideoLibrary library) =>
{
    var video = library.Find(id);
    if (video is null)
        return Results.NotFound();

    var extension = request.ContentType?.Split(';', 2)[0].Trim().ToLowerInvariant() switch
    {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        _ => null
    };
    if (extension is null)
        return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);

    const int maxBytes = 8 * 1024 * 1024;
    if (request.ContentLength is > maxBytes)
        return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

    await using var image = new MemoryStream();
    var buffer = new byte[81920];
    while (true)
    {
        var bytesRead = await request.Body.ReadAsync(buffer);
        if (bytesRead == 0)
            break;
        if (image.Length + bytesRead > maxBytes)
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        await image.WriteAsync(buffer.AsMemory(0, bytesRead));
    }

    var imageBytes = image.ToArray();
    var validImage = extension switch
    {
        ".jpg" => imageBytes.Length >= 3 && imageBytes[0] == 0xff && imageBytes[1] == 0xd8 && imageBytes[2] == 0xff,
        ".png" => imageBytes.Length >= 8 && imageBytes.Take(8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
        ".webp" => imageBytes.Length >= 12 && Encoding.ASCII.GetString(imageBytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(imageBytes, 8, 4) == "WEBP",
        _ => false
    };
    if (!validImage)
        return Results.BadRequest("The selected file is not a valid supported image.");

    var directory = Path.GetDirectoryName(video.FullPath) ?? library.RootPath;
    var basePath = Path.Combine(directory, Path.GetFileNameWithoutExtension(video.FullPath));
    var thumbnailPath = basePath + extension;
    var temporaryPath = Path.Combine(directory, $".{Guid.NewGuid():N}.thumbnail{extension}");
    try
    {
        await File.WriteAllBytesAsync(temporaryPath, imageBytes);
        File.Move(temporaryPath, thumbnailPath, overwrite: true);
        foreach (var existingExtension in new[] { ".jpg", ".jpeg", ".png", ".webp" })
        {
            var existingPath = basePath + existingExtension;
            if (!existingPath.Equals(thumbnailPath, StringComparison.OrdinalIgnoreCase) && File.Exists(existingPath))
                File.Delete(existingPath);
        }
    }
    finally
    {
        if (File.Exists(temporaryPath))
            File.Delete(temporaryPath);
    }

    return Results.NoContent();
});

app.MapPost("/api/rescan", (VideoLibrary library) =>
{
    var videos = library.GetVideos();
    return Results.Ok(new { count = videos.Count });
});

app.MapFallbackToFile("index.html");

app.Run();

public sealed class VideoLibrary
{
    private readonly IConfiguration _configuration;
    private readonly HashSet<string> _extensions;
    private static readonly HashSet<string> AudioExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".aac", ".ac3", ".dts", ".eac3", ".flac", ".m4a", ".mka", ".mp3", ".oga", ".ogg", ".opus", ".wav"
    };

    public string RootPath { get; }
    private readonly string _transcodeRoot = Path.Combine(Path.GetTempPath(), "kidstube-transcoded");

    public VideoLibrary(IConfiguration configuration)
    {
        _configuration = configuration;

        RootPath = Environment.GetEnvironmentVariable("KIDSTUBE_VIDEO_PATH")
                   ?? _configuration["VideoLibrary:Path"]
                   ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos), "KidsTube");

        var configuredExtensions = _configuration.GetSection("VideoLibrary:Extensions").Get<string[]>()
                                  ?? [".mp4", ".webm", ".m4v", ".mov"];

        _extensions = configuredExtensions
            .Select(e => e.StartsWith('.') ? e : $".{e}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyList<VideoItem> GetVideos()
    {
        if (!Directory.Exists(RootPath))
            return [];

        return Directory
            .EnumerateFiles(RootPath, "*.*", SearchOption.AllDirectories)
            .Where(path => _extensions.Contains(Path.GetExtension(path)))
            .Select(CreateVideoItem)
            .OrderBy(v => v.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(v => v.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public VideoItem? Find(string id) =>
        GetVideos().FirstOrDefault(v => v.Id.Equals(id, StringComparison.OrdinalIgnoreCase));

    public VideoDto ToDto(VideoItem video) => VideoDto.From(video, FindAudio(video) is not null);

    public async Task<string?> GetBrowserStreamAsync(VideoItem video)
    {
        if (!string.Equals(Path.GetExtension(video.FullPath), ".mkv", StringComparison.OrdinalIgnoreCase))
            return video.FullPath;

        var sourceStamp = File.GetLastWriteTimeUtc(video.FullPath).Ticks;
        var cacheName = $"{video.Id}-{sourceStamp}.mp4";
        var cachePath = Path.Combine(_transcodeRoot, cacheName);
        if (File.Exists(cachePath))
            return cachePath;

        Directory.CreateDirectory(_transcodeRoot);
        var temporaryPath = cachePath + ".tmp";
        if (File.Exists(temporaryPath))
            File.Delete(temporaryPath);

        var startInfo = new ProcessStartInfo
        {
            FileName = "ffmpeg",
            WorkingDirectory = _transcodeRoot,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-y");
        startInfo.ArgumentList.Add("-i");
        startInfo.ArgumentList.Add(video.FullPath);
        startInfo.ArgumentList.Add("-map");
        startInfo.ArgumentList.Add("0:v:0");
        startInfo.ArgumentList.Add("-map");
        startInfo.ArgumentList.Add("0:a:0?");
        startInfo.ArgumentList.Add("-c:v");
        startInfo.ArgumentList.Add("copy");
        startInfo.ArgumentList.Add("-c:a");
        startInfo.ArgumentList.Add("aac");
        startInfo.ArgumentList.Add("-b:a");
        startInfo.ArgumentList.Add("192k");
        startInfo.ArgumentList.Add("-movflags");
        startInfo.ArgumentList.Add("+faststart");
        startInfo.ArgumentList.Add("-sn");
        startInfo.ArgumentList.Add("-dn");
        startInfo.ArgumentList.Add(temporaryPath);

        try
        {
            using var process = Process.Start(startInfo);
            if (process is null)
                return video.FullPath;

            await process.WaitForExitAsync();
            if (process.ExitCode != 0 || !File.Exists(temporaryPath))
                return video.FullPath;

            File.Move(temporaryPath, cachePath, true);
            return cachePath;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return video.FullPath;
        }
        finally
        {
            if (File.Exists(temporaryPath))
                File.Delete(temporaryPath);
        }
    }

    public string? FindAudio(VideoItem video)
    {
        var directory = Path.GetDirectoryName(video.FullPath) ?? RootPath;
        var baseName = Path.GetFileNameWithoutExtension(video.FullPath);

        var matchingAudio = Directory.EnumerateFiles(directory)
            .Where(path => AudioExtensions.Contains(Path.GetExtension(path)))
            .FirstOrDefault(path => Path.GetFileNameWithoutExtension(path)
                .Equals(baseName, StringComparison.OrdinalIgnoreCase));
        if (matchingAudio is not null)
            return matchingAudio;

        return Directory.EnumerateFiles(directory)
            .Where(path => AudioExtensions.Contains(Path.GetExtension(path)))
            .Take(2)
            .Count() == 1
            ? Directory.EnumerateFiles(directory)
                .First(path => AudioExtensions.Contains(Path.GetExtension(path)))
            : null;
    }

    public string? FindThumbnail(VideoItem video)
    {
        var basePath = Path.Combine(
            Path.GetDirectoryName(video.FullPath) ?? RootPath,
            Path.GetFileNameWithoutExtension(video.FullPath));

        foreach (var extension in new[] { ".jpg", ".jpeg", ".png", ".webp" })
        {
            var candidate = basePath + extension;
            if (File.Exists(candidate))
                return candidate;
        }

        return null;
    }

    private VideoItem CreateVideoItem(string fullPath)
    {
        var relativePath = Path.GetRelativePath(RootPath, fullPath);
        var directory = Path.GetDirectoryName(relativePath);
        var category = GetCategory(fullPath, directory);

        var rawTitle = Path.GetFileNameWithoutExtension(fullPath);
        var title = Regex.Replace(rawTitle.Replace('_', ' ').Replace('-', ' '), @"\s+", " ").Trim();
        var info = new FileInfo(fullPath);

        return new VideoItem(
            CreateStableId(relativePath),
            title,
            category,
            relativePath.Replace('\\', '/'),
            fullPath,
            info.Length,
            info.LastWriteTimeUtc);
    }

    private string GetCategory(string fullPath, string? relativeDirectory)
    {
        if (string.IsNullOrWhiteSpace(relativeDirectory))
            return "Videos";

        return relativeDirectory.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)[0];
    }

    private static string CreateStableId(string value)
    {
        var normalized = value.Replace('\\', '/').ToLowerInvariant();
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(bytes)[..16].ToLowerInvariant();
    }
}

public sealed record VideoItem(
    string Id,
    string Title,
    string Category,
    string RelativePath,
    string FullPath,
    long SizeBytes,
    DateTime LastModifiedUtc);

public sealed record VideoDto(
    string Id,
    string Title,
    string Category,
    string RelativePath,
    long SizeBytes,
    DateTime LastModifiedUtc,
    string StreamUrl,
    string ThumbnailUrl,
    string? AudioUrl)
{
    public static VideoDto From(VideoItem item, bool hasAudio) => new(
        item.Id,
        item.Title,
        item.Category,
        item.RelativePath,
        item.SizeBytes,
        item.LastModifiedUtc,
        $"/api/videos/{item.Id}/stream",
        $"/api/videos/{item.Id}/thumbnail",
        hasAudio ? $"/api/videos/{item.Id}/audio" : null);
}
