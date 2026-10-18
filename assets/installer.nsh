!macro customHeader
  BrandingText "ToolCEO Desktop Toolkit"
  ShowInstDetails nevershow
  ShowUninstDetails nevershow

  !define MUI_ABORTWARNING
  !define MUI_UNABORTWARNING
  !define MUI_WELCOMEPAGE_TITLE "Install ToolCEO"
  !define MUI_WELCOMEPAGE_TEXT "Setup will install ToolCEO on your computer.$\r$\n$\r$\nToolCEO is an all-in-one offline toolkit for private local file conversion and document utilities."
  !define MUI_FINISHPAGE_TITLE "ToolCEO is ready"
  !define MUI_UNWELCOMEPAGE_TITLE "Uninstall ToolCEO"
  !define MUI_UNWELCOMEPAGE_TEXT "This wizard will remove ToolCEO from your computer.$\r$\n$\r$\nYour local ToolCEO application files and shortcuts will be removed."
  !define MUI_UNFINISHPAGE_TITLE "ToolCEO has been removed"
  !define MUI_UNFINISHPAGE_TEXT "ToolCEO was successfully removed from your computer."
!macroend

!macro customInit
  SetDetailsPrint none
  SetDetailsView hide
!macroend

!macro customInstall
  SetDetailsPrint none
  SetDetailsView hide
  # Pre-authorize ToolCEO's offline local backend with Windows Firewall.
  # This completely prevents Windows Defender Firewall from popping up the
  # "Do you want to allow public and private networks to access this app" prompt.
  nsExec::Exec 'netsh advfirewall firewall add rule name="ToolCEO Backend" dir=in action=allow program="$INSTDIR\resources\engines\python\main_backend.exe" enable=yes'

  # Re-create Start Menu and Desktop shortcuts with an explicit .ico path.
  # Electron embeds the app icon as a transparent PNG inside the ICO container;
  # Windows cannot always extract it from the EXE PE resources for Start Menu tiles,
  # resulting in a blank icon in "Recently added" and the taskbar.
  # Pointing shortcuts at the standalone icon.ico (copied as an extraResource)
  # bypasses PE extraction and fixes the blank-icon issue reliably.
  SetOutPath "$INSTDIR"
  CreateShortCut "$SMPROGRAMS\ToolCEO.lnk" "$INSTDIR\ToolCEO.exe" "" "$INSTDIR\icon.ico" 0 SW_SHOWNORMAL "" "ToolCEO - All-in-one offline file toolkit"
  CreateShortCut "$DESKTOP\ToolCEO.lnk"   "$INSTDIR\ToolCEO.exe" "" "$INSTDIR\icon.ico" 0 SW_SHOWNORMAL "" "ToolCEO - All-in-one offline file toolkit"
!macroend

!macro customUnInit
  SetDetailsPrint none
  SetDetailsView hide
!macroend

!macro customUnInstall
  SetDetailsPrint none
  SetDetailsView hide
  DetailPrint "Removing ToolCEO..."
  # Clean up the firewall rule on uninstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="ToolCEO Backend"'
!macroend