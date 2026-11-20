param([ValidateSet('files','directory','clipboardFiles')][string]$Kind)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($Kind -eq 'clipboardFiles') {
  $paths = @([System.Windows.Forms.Clipboard]::GetFileDropList() | Where-Object { [System.IO.File]::Exists($_) })
  if ($paths.Count -eq 0 -and $env:MOKI_CLIPBOARD_IMAGE -and [System.Windows.Forms.Clipboard]::ContainsImage()) {
    Add-Type -AssemblyName System.Drawing
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -ne $image) {
      try {
        $image.Save($env:MOKI_CLIPBOARD_IMAGE, [System.Drawing.Imaging.ImageFormat]::Png)
        $paths = @($env:MOKI_CLIPBOARD_IMAGE)
      } finally { $image.Dispose() }
    }
  }
  ConvertTo-Json -InputObject $paths -Compress
  return
}
if ($Kind -eq 'directory') {
  $dialog = [System.Windows.Forms.FolderBrowserDialog]::new()
  $dialog.Description = 'MOKI - Project folder'
  try {
    if ($dialog.ShowDialog() -eq 'OK') { ConvertTo-Json -InputObject @($dialog.SelectedPath) -Compress }
  } finally { $dialog.Dispose() }
} else {
  $dialog = [System.Windows.Forms.OpenFileDialog]::new()
  $dialog.Title = 'MOKI - Import project assets'
  $dialog.Multiselect = $true
  $dialog.CheckFileExists = $true
  try {
    if ($dialog.ShowDialog() -eq 'OK') { ConvertTo-Json -InputObject @($dialog.FileNames) -Compress }
  } finally { $dialog.Dispose() }
}
