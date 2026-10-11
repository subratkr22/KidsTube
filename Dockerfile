FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY YouTube.csproj ./
RUN dotnet restore YouTube.csproj

COPY . ./
RUN dotnet publish YouTube.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_EnableDiagnostics=0 \
    Server__Url=http://0.0.0.0:8080 \
    VideoLibrary__Path=/videos

EXPOSE 8080

ENTRYPOINT ["dotnet", "YouTube.dll"]
