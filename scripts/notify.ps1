# Tells the student that a long wait is over, with a Windows notification that stays on the screen until it is closed by hand, and a sound,
# so that it is noticed when the window is not in front. Used by test.bat and release.bat when the Vercel build ends.
# It never fails: when something is not available it just stays quiet.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\notify.ps1 -Title "Agent Atlas" -Message "The preview is ready" [-Bad] [-Brief]
#   -Brief makes an ordinary notification that disappears by itself.
param(
  [string]$Title = "Agent Atlas",
  [string]$Message = "",
  [switch]$Bad,
  [switch]$Brief
)
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $t = [System.Security.SecurityElement]::Escape($Title)
  $m = [System.Security.SecurityElement]::Escape($Message)
  # scenario reminder keeps the notification on the screen until the Close button, or the cross, is pressed by hand
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  if ($Brief) {
    # -Brief: an ordinary notification, it disappears by itself after a few seconds
    $xml.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text>$t</text><text>$m</text></binding></visual><audio silent=`"true`"/></toast>")
  } else {
    $xml.LoadXml("<toast scenario=`"reminder`"><visual><binding template=`"ToastGeneric`"><text>$t</text><text>$m</text></binding></visual><actions><action content=`"Close`" arguments=`"close`" activationType=`"system`"/></actions><audio silent=`"true`"/></toast>")
  }
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  # the identity of Windows PowerShell, which Windows accepts without any registration
  $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)
} catch {
  # no notification on this system
}
try {
  if ($Bad) { [System.Media.SystemSounds]::Hand.Play() } else { [System.Media.SystemSounds]::Asterisk.Play() }
  Start-Sleep -Milliseconds 1200
} catch {
  # no sound
}
