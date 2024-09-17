
module "apim_weu" {
  source = "../_modules/apim"

  apim_name                = data.azurerm_api_management.apim.name
  apim_resource_group_name = data.azurerm_api_management.apim.resource_group_name

  key_vault_common_id = data.azurerm_key_vault.common.id
}
