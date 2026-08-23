using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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

    return Results.Ok(videos.Select(VideoDto.From));
});

app.MapGet("/api/videos/{id}", (string id, VideoLibrary library) =>
{
    var video = library.Find(id);
    return video is null ? Results.NotFound() : Results.Ok(VideoDto.From(video));
});

app.MapGet("/api/videos/{id}/stream", (string id, VideoLibrary library) =>
{
    var video = library.Find(id);
    if (video is null || !File.Exists(video.FullPath))
        return Results.NotFound();

    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(video.FullPath, out var contentType))
        contentType = "application/octet-stream";

    return Results.File(
        video.FullPath,
        contentType,
        lastModified: File.GetLastWriteTimeUtc(video.FullPath),
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

    public string RootPath { get; }

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
        var category = string.IsNullOrWhiteSpace(directory)
            ? "Videos"
            : directory.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)[0];

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
    string ThumbnailUrl)
{
    public static VideoDto From(VideoItem item) => new(
        item.Id,
        item.Title,
        item.Category,
        item.RelativePath,
        item.SizeBytes,
        item.LastModifiedUtc,
        $"/api/videos/{item.Id}/stream",
        $"/api/videos/{item.Id}/thumbnail");
}
