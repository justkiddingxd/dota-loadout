# Loadout (dota-loadout): packs the game files every hero needs into one zip on the Desktop.
# Reads the installed game only (pak01_dir.vpk and its archives); installs nothing, sends nothing.
#
# What goes in: the hero scripts, items_game.txt, the loadout portraits (light, camera, pedestal),
# localization, and everything reachable from each hero's model, its default items and its
# loadout portrait: models, materials, textures, particles — found by following the references
# (the RERL block) inside the compiled files, so the set stays right after game updates.
#
# Run: extract-dota.cmd (double click), or
#   powershell -NoProfile -ExecutionPolicy Bypass -File extract-dota.ps1 [-Dota "<...\dota 2 beta\game\dota>"] [-Out <file.zip>]
param([string]$Dota, [string]$Out)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

public class LoadoutEntry { public int Archive; public uint Offset; public uint Length; public byte[] Preload; }

public class LoadoutPack : IDisposable {
    readonly string dir;
    readonly Dictionary<int, FileStream> archives = new Dictionary<int, FileStream>();
    public readonly Dictionary<string, LoadoutEntry> Files = new Dictionary<string, LoadoutEntry>(StringComparer.OrdinalIgnoreCase);
    long embeddedBase;

    public LoadoutPack(string dirFile) {
        dir = dirFile;
        byte[] b = File.ReadAllBytes(dirFile);
        uint version = BitConverter.ToUInt32(b, 4), tree = BitConverter.ToUInt32(b, 8);
        int header = version == 2 ? 28 : 12, p = header;
        embeddedBase = header + tree;
        while (true) {
            string ext = Str(b, ref p); if (ext.Length == 0) break;
            while (true) {
                string path = Str(b, ref p); if (path.Length == 0) break;
                while (true) {
                    string name = Str(b, ref p); if (name.Length == 0) break;
                    ushort pre = BitConverter.ToUInt16(b, p + 4), arc = BitConverter.ToUInt16(b, p + 6);
                    LoadoutEntry e = new LoadoutEntry();
                    e.Archive = arc; e.Offset = BitConverter.ToUInt32(b, p + 8); e.Length = BitConverter.ToUInt32(b, p + 12);
                    p += 18;
                    if (pre > 0) { e.Preload = new byte[pre]; Buffer.BlockCopy(b, p, e.Preload, 0, pre); p += pre; }
                    string full = (path == " " ? "" : path + "/") + name + (ext == " " ? "" : "." + ext);
                    Files[full] = e;
                }
            }
        }
    }
    static string Str(byte[] b, ref int p) { int s = p; while (b[p] != 0) p++; string r = Encoding.UTF8.GetString(b, s, p - s); p++; return r; }

    public byte[] Read(string path) {
        LoadoutEntry e; if (!Files.TryGetValue(path, out e)) return null;
        int pre = e.Preload == null ? 0 : e.Preload.Length;
        byte[] r = new byte[pre + e.Length];
        if (pre > 0) Buffer.BlockCopy(e.Preload, 0, r, 0, pre);
        if (e.Length > 0) {
            FileStream fs;
            long offset = e.Offset;
            if (e.Archive == 0x7fff) { fs = Archive(-1); offset += embeddedBase; } else fs = Archive(e.Archive);
            fs.Seek(offset, SeekOrigin.Begin);
            int read = 0; while (read < e.Length) { int n = fs.Read(r, pre + read, (int)e.Length - read); if (n <= 0) throw new IOException("Short read: " + path); read += n; }
        }
        return r;
    }
    FileStream Archive(int index) {
        FileStream fs;
        if (archives.TryGetValue(index, out fs)) return fs;
        string file = index < 0 ? dir : dir.Replace("_dir.vpk", "_" + index.ToString("000") + ".vpk");
        fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16);
        archives[index] = fs; return fs;
    }
    public void Dispose() { foreach (FileStream fs in archives.Values) fs.Dispose(); }

    // External references of a compiled resource (its RERL block).
    public static List<string> References(byte[] b) {
        List<string> refs = new List<string>();
        try {
            int at = 8 + (int)BitConverter.ToUInt32(b, 8), count = (int)BitConverter.ToUInt32(b, 12);
            for (int i = 0; i < count; i++, at += 12) {
                if (Encoding.ASCII.GetString(b, at, 4) != "RERL") continue;
                int data = at + 4 + (int)BitConverter.ToUInt32(b, at + 4);
                int entries = data + (int)BitConverter.ToUInt32(b, data), n = (int)BitConverter.ToUInt32(b, data + 4);
                for (int k = 0; k < n; k++) {
                    int e = entries + 16 * k, s = e + 8 + (int)BitConverter.ToUInt32(b, e + 8), z = s;
                    while (z < b.Length && b[z] != 0) z++;
                    refs.Add(Encoding.UTF8.GetString(b, s, z - s));
                }
            }
        } catch (Exception) { }
        return refs;
    }
}

public static class LoadoutRoots {
    static readonly Regex Asset = new Regex("\"([^\"]+\\.(?:vmdl|vpcf|vmat))\"", RegexOptions.IgnoreCase);
    public static void Assets(string text, HashSet<string> into) { foreach (Match m in Asset.Matches(text)) into.Add(m.Groups[1].Value.Replace('\\', '/').ToLowerInvariant()); }

    // Blocks at a given depth of a KeyValues text, by their key: depth 1 is "items" in items_game,
    // a hero in the portraits. Returns key -> body.
    public static List<KeyValuePair<string, string>> Blocks(string text, int depth) {
        List<KeyValuePair<string, string>> list = new List<KeyValuePair<string, string>>();
        string indent = new string('\t', depth);
        Regex open = new Regex("^" + indent + "\"([^\"]+)\"\\s*$", RegexOptions.Multiline);
        foreach (Match m in open.Matches(text)) {
            int start = text.IndexOf('\n', m.Index + m.Length);
            if (start < 0) continue;
            int brace = text.IndexOf('{', start); if (brace < 0 || text.Substring(start, brace - start).Trim().Length > 0) continue;
            int level = 0, i = brace;
            for (; i < text.Length; i++) { if (text[i] == '{') level++; else if (text[i] == '}' && --level == 0) break; }
            list.Add(new KeyValuePair<string, string>(m.Groups[1].Value, text.Substring(brace, Math.Min(i + 1, text.Length) - brace)));
        }
        return list;
    }
}
'@

function Find-Dota {
  $candidates = @($PSScriptRoot)
  try { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath } catch { $steam = $null }
  if ($steam) {
    $candidates += Join-Path $steam 'steamapps\common\dota 2 beta\game\dota'
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) { foreach ($m in [regex]::Matches((Get-Content -Raw $vdf), '"path"\s+"([^"]+)"')) { $candidates += Join-Path ($m.Groups[1].Value -replace '\\\\', '\') 'steamapps\common\dota 2 beta\game\dota' } }
  }
  foreach ($c in $candidates) { if ($c -and (Test-Path (Join-Path $c 'pak01_dir.vpk'))) { return $c } }
  return $null
}

$pack = $null; $zip = $null
try {
  Write-Host 'Loadout: ищу Dota...'
  if (-not $Dota) { $Dota = Find-Dota }
  if (-not $Dota) { $Dota = (Read-Host 'Не нашёл Dota. Вставь путь к папке ...\dota 2 beta\game\dota').Trim('" ') }
  if (-not (Test-Path (Join-Path $Dota 'pak01_dir.vpk'))) { throw "В $Dota нет pak01_dir.vpk" }
  Write-Host "Dota: $Dota"
  $steamInf = Join-Path $Dota 'steam.inf'
  $build = if (Test-Path $steamInf) { ([regex]::Match((Get-Content -Raw $steamInf), 'ClientVersion=(\d+)')).Groups[1].Value } else { 'unknown' }

  $pack = New-Object LoadoutPack (Join-Path $Dota 'pak01_dir.vpk')
  Write-Host ("pak01: {0} файлов, версия игры {1}" -f $pack.Files.Count, $build)
  $text = { param($path) $b = $pack.Read($path); if ($b) { [Text.Encoding]::UTF8.GetString($b) } else { '' } }

  # Scripts and localization, as they are.
  $scripts = @('scripts/npc/npc_heroes.txt', 'scripts/items/items_game.txt', 'scripts/npc/portraits_full_body_loadout.txt',
    'resource/localization/dota_english.txt', 'resource/localization/dota_russian.txt',
    'resource/localization/abilities_english.txt', 'resource/localization/abilities_russian.txt',
    'resource/localization/hero_lore_english.txt', 'resource/localization/hero_lore_russian.txt',
    'resource/localization/items_english.txt', 'resource/localization/items_russian.txt')
  $scripts += @($pack.Files.Keys | Where-Object { $_ -like 'scripts/npc/heroes/npc_dota_hero_*.txt' } | Sort-Object)

  # Roots: each hero's model, its default items, its loadout portrait (pedestal, effects).
  $roots = New-Object 'System.Collections.Generic.HashSet[string]'
  $heroes = 0
  foreach ($file in $scripts | Where-Object { $_ -like 'scripts/npc/heroes/*' }) {
    $m = [regex]::Match((& $text $file), '"Model"\s+"([^"]+\.vmdl)"')
    if ($m.Success) { [void]$roots.Add($m.Groups[1].Value.ToLowerInvariant()); $heroes++ }
  }
  Write-Host "Героев: $heroes"
  Write-Host 'Читаю items_game.txt...'
  $defaults = 0
  foreach ($item in [LoadoutRoots]::Blocks((& $text 'scripts/items/items_game.txt'), 2)) {
    if ($item.Value -match '"prefab"\s+"default_item"') { [LoadoutRoots]::Assets($item.Value, $roots); $defaults++ }
  }
  Write-Host "Предметов по умолчанию: $defaults"
  foreach ($portrait in [LoadoutRoots]::Blocks((& $text 'scripts/npc/portraits_full_body_loadout.txt'), 1)) {
    if ($portrait.Key -like 'npc_dota_hero_*') { [LoadoutRoots]::Assets($portrait.Value, $roots) }
  }

  # Everything they reference, compiled. Sounds, shaders and maps are not needed.
  Write-Host 'Собираю зависимости...'
  $skip = '\.(vsnd|vsndevts|vsndstck|vfx|vmap|vwrld|vrman|vpost|vsc)$'
  $wanted = New-Object 'System.Collections.Generic.List[string]'
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $queue = New-Object 'System.Collections.Generic.Queue[string]'
  foreach ($r in $roots) { $queue.Enqueue($r) }
  $missing = 0; [long]$bytes = 0
  while ($queue.Count) {
    $ref = $queue.Dequeue().Replace('\', '/').ToLowerInvariant()
    if ($ref -match $skip) { continue }
    $compiled = if ($ref.EndsWith('_c')) { $ref } else { $ref + '_c' }
    if (-not $seen.Add($compiled)) { continue }
    $data = $pack.Read($compiled)
    if (-not $data) { $missing++; continue }
    $wanted.Add($compiled); $bytes += $data.Length
    foreach ($child in [LoadoutPack]::References($data)) { $queue.Enqueue($child) }
    if ($wanted.Count % 500 -eq 0) { Write-Host ("  {0} файлов, {1:N0} МБ" -f $wanted.Count, ($bytes / 1MB)) }
  }
  Write-Host ("Нужно {0} файлов, {1:N0} МБ (не найдено ссылок: {2})" -f $wanted.Count, ($bytes / 1MB), $missing)

  if (-not $Out) { $Out = Join-Path ([Environment]::GetFolderPath('Desktop')) "dota2heroes-$build.zip" }
  if (Test-Path $Out) { Remove-Item $Out }
  Write-Host "Пишу $Out ..."
  $zip = [IO.Compression.ZipFile]::Open($Out, 'Create')
  $add = { param($name, $data) $e = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Fastest); $s = $e.Open(); $s.Write($data, 0, $data.Length); $s.Dispose() }
  foreach ($file in $scripts) { $data = $pack.Read($file); if ($data) { & $add $file $data } }
  foreach ($name in @('gameinfo.gi', 'steam.inf')) { $f = Join-Path $Dota $name; if (Test-Path $f) { & $add $name ([IO.File]::ReadAllBytes($f)) } }
  $i = 0
  foreach ($file in $wanted) {
    & $add $file ($pack.Read($file)); $i++
    if ($i % 1000 -eq 0) { Write-Host ("  {0} / {1}" -f $i, $wanted.Count) }
  }
  $zip.Dispose(); $zip = $null
  Write-Host ''
  Write-Host ("Готово: {0} ({1:N0} МБ)" -f $Out, ((Get-Item $Out).Length / 1MB)) -ForegroundColor Green
} catch {
  Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  if ($zip) { $zip.Dispose() }
  if ($pack) { $pack.Dispose() }
}
