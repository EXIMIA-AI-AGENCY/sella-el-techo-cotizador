
Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\njuan\.gemini\antigravity\brain\7b718c61-904b-4762-b7ee-848dea1f9d28\uploaded_media_1769818765843.png"
$destPath = "c:\Users\njuan\OneDrive\Desktop\REPOS\SELLA EL TECHO\assets\logo_white_ps.png"

$bmp = [System.Drawing.Bitmap]::FromFile($sourcePath)
$rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
$bmpData = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, $bmp.PixelFormat)
$ptr = $bmpData.Scan0
$bytes = [Math]::Abs($bmpData.Stride) * $bmp.Height
$rgbValues = New-Object byte[] $bytes
[System.Runtime.InteropServices.Marshal]::Copy($ptr, $rgbValues, 0, $bytes)

# Assume 32bpp ARGB (Blue, Green, Red, Alpha)
for ($i = 0; $i -lt $rgbValues.Length; $i += 4) {
    $b = $rgbValues[$i]
    $g = $rgbValues[$i+1]
    $r = $rgbValues[$i+2]
    $a = $rgbValues[$i+3]

    if ($a -gt 0) {
        # Check if black or dark gray
        if ($r -lt 50 -and $g -lt 50 -and $b -lt 50) {
            # Change to White
            $rgbValues[$i] = 255   # Blue
            $rgbValues[$i+1] = 255 # Green
            $rgbValues[$i+2] = 255 # Red
            # Alpha stays same
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($rgbValues, 0, $ptr, $bytes)
$bmp.UnlockBits($bmpData)

$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Logo processed and saved to $destPath"
