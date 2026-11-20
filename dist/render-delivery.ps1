param([Parameter(Mandatory)][ValidateSet('pdf','raster','zip','docx','pptx','xlsx')][string]$Kind, [Parameter(Mandatory)][string]$BlobPath, [switch]$Thumbnail, [ValidateRange(1,2147483647)][int]$Page=1)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function ImageResult([byte[]]$bytes, [string]$label) {
  @{kind='image'; src=('data:image/png;base64,'+[Convert]::ToBase64String($bytes)); label=$label}
}
function ReadOfficeXml($entry) {
  if (!$entry -or $entry.Length -gt 4MB) { return $null }
  $settings=[Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver=$null
  $settings.MaxCharactersInDocument=4MB
  $stream=$entry.Open()
  try {
    $reader=[Xml.XmlReader]::Create($stream,$settings)
    try {
      $doc=[Xml.XmlDocument]::new()
      $doc.XmlResolver=$null
      $doc.Load($reader)
      return ,$doc
    } finally { $reader.Dispose() }
  } finally { $stream.Dispose() }
}
function AwaitWin($operation,[Type]$type) {
  $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    (($_.IsGenericMethod -and $type -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]96 + '1') -or
     (!$_.IsGenericMethod -and !$type -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'))
  } | Select-Object -First 1
  if ($type) { $method=$method.MakeGenericMethod($type) }
  $task=$method.Invoke($null,@($operation))
  $task.GetAwaiter().GetResult()
}
if ($Kind -eq 'pdf') {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $fileType=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
  $pdfType=[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
  $file=AwaitWin ($fileType::GetFileFromPathAsync($BlobPath)) $fileType
  $pdf=AwaitWin ($pdfType::LoadFromFileAsync($file)) $pdfType
  if($Page -gt $pdf.PageCount){throw "PDF page out of range"}
  $pageIndex=$Page
  $pdfPage=$pdf.GetPage($pageIndex-1)
  $memory=[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]::new()
  try {
    $options=[Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime]::new()
    $options.DestinationWidth=900
    $options.BitmapEncoderId=[Windows.Graphics.Imaging.BitmapEncoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]::PngEncoderId
    $null=AwaitWin ($pdfPage.RenderToStreamAsync($memory,$options)) $null
    $memory.Seek(0)
    $net=[System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($memory)
    $out=[IO.MemoryStream]::new()
    try { $net.CopyTo($out); $result=ImageResult $out.ToArray() ("$pageIndex / "+$pdf.PageCount) }
    finally { $out.Dispose(); $net.Dispose() }
  } finally { $pdfPage.Dispose(); $memory.Dispose() }
} elseif ($Kind -eq 'raster') {
  Add-Type -AssemblyName System.Drawing
  $img=[Drawing.Image]::FromFile($BlobPath)
  try {
    $bound=if ($Thumbnail) { 240 } else { 1400 }
    $scale=[Math]::Min(1.0,[Math]::Min([double]$bound/$img.Width,[double]$bound/$img.Height))
    $thumb=[Drawing.Bitmap]::new($img,[Math]::Max(1,[int]($img.Width*$scale)),[Math]::Max(1,[int]($img.Height*$scale)))
    $out=[IO.MemoryStream]::new()
    try { $thumb.Save($out,[Drawing.Imaging.ImageFormat]::Png); $result=ImageResult $out.ToArray() '' }
    finally { $thumb.Dispose(); $out.Dispose() }
  } finally { $img.Dispose() }
} else {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($BlobPath)
  try {
    if ($Kind -eq 'zip') {
      $result=@{kind='entries';entries=@($archive.Entries | Select-Object -First 60 | ForEach-Object FullName);total=$archive.Entries.Count}
    } else {
      $entryName=@{docx='word/document.xml';pptx='ppt/slides/slide1.xml';xlsx='xl/worksheets/sheet1.xml'}[$Kind]
      $doc=ReadOfficeXml ($archive.GetEntry($entryName))
      $parts=if ($doc -and $Kind -eq 'xlsx') {
        $dictionary=ReadOfficeXml ($archive.GetEntry('xl/sharedStrings.xml'))
        $strings=if ($dictionary) { ,$dictionary.SelectNodes("//*[local-name()='si']") }
        foreach ($row in $doc.SelectNodes("//*[local-name()='row']") | Select-Object -First 32) {
          $cells=foreach ($cell in $row.SelectNodes("*[local-name()='c']") | Select-Object -First 24) {
            $value=($cell.SelectNodes(".//*[local-name()='t' or local-name()='v']") | ForEach-Object InnerText) -join ''
            if ($cell.GetAttribute('t') -eq 's' -and $strings -and $value -match '^\d+$' -and [int]$value -lt $strings.Count) { $value=$strings.Item([int]$value).InnerText }
            $cell.GetAttribute('r')+' '+$value
          }
          $cells -join '    '
        }
      } elseif ($doc) {
        foreach ($row in $doc.SelectNodes("//*[local-name()='p']") | Select-Object -First 45) {
          ($row.SelectNodes(".//*[local-name()='t']") | ForEach-Object InnerText) -join ''
        }
      }
      $body=($parts -join [Environment]::NewLine).Trim()
      if ($body) { $result=@{kind='excerpt';text=$body.Substring(0,[Math]::Min(12000,$body.Length));truncated=$true} }
      else { $result=@{kind='native';reason=''} }
    }
  } finally { $archive.Dispose() }
}
$result | ConvertTo-Json -Compress -Depth 4
