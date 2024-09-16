data "azurerm_api_management" "apim" {
  name                = "${local.project_legacy}-apim-v2-api"
  resource_group_name = "${local.project_legacy}-rg-internal"
}

data "azurerm_key_vault" "common" {
  name                = "${local.project_legacy}-kv-common"
  resource_group_name = "${local.project_legacy}-rg-common"
}
