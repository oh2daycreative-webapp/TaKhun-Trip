function getAppConfig_() {
  var properties = PropertiesService.getScriptProperties();

  return {
    spreadsheetId: properties.getProperty("SPREADSHEET_ID") || ""
  };
}
