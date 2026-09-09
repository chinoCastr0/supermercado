# Regenera los iconos de public con System.Drawing; reemplaza los PNG de igual nombre.
# Las dimensiones coinciden con manifest.webmanifest y el icono táctil de index.html.
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot "..\public"

function New-PwaIcon {
  # Dibuja una identidad común escalada y libera los recursos gráficos al terminar.
  param(
    [int]$Size,
    [string]$FileName
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(32, 29, 37))
  $accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(92, 66, 146))
  $foreground = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

  $graphics.FillRectangle($background, 0, 0, $Size, $Size)
  $padding = [int]($Size * 0.18)
  $graphics.FillEllipse($accent, $padding, $padding, $Size - 2 * $padding, $Size - 2 * $padding)

  $font = New-Object System.Drawing.Font("Arial", ($Size * 0.42), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString("S", $font, $foreground, [System.Drawing.RectangleF]::new(0, -($Size * 0.015), $Size, $Size), $format)

  $path = Join-Path $outputDirectory $FileName
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $format.Dispose()
  $font.Dispose()
  $foreground.Dispose()
  $accent.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-PwaIcon -Size 192 -FileName "pwa-192x192.png"
New-PwaIcon -Size 512 -FileName "pwa-512x512.png"
New-PwaIcon -Size 180 -FileName "apple-touch-icon.png"
