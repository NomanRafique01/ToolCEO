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

!macro customUnInit
  SetDetailsPrint none
  SetDetailsView hide
!macroend

!macro customUnInstall
  SetDetailsPrint none
  SetDetailsView hide
  DetailPrint "Removing ToolCEO..."
!macroend
