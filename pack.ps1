Remove-Item -Path .\addon.xpi -ErrorAction SilentlyContinue
Get-ChildItem -Path .\ -Exclude .git,pack.ps1,addon.zip,*.xpi | Compress-Archive -CompressionLevel NoCompression -DestinationPath addon
Rename-Item -Path .\addon.zip -NewName addon.xpi
