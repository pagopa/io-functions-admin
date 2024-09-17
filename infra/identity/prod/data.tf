data "azurerm_client_config" "current" {}

data "azurerm_key_vault" "common" {
  name                = "${local.project}-kv-common"
  resource_group_name = "${local.project}-rg-common"
}
